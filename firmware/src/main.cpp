#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <vector>
#include <Wire.h>
#include <esp_task_wdt.h>

#include "pin_map.h"
#include "rover_state.h"
#include "config_store.h"
#include "motors.h"
#include "encoders.h"
#include "imu.h"
#include "servos_pca9685.h"
#include "sensors.h"
#include "probe_controller.h"
#include "pumps.h"
#include "motion_controller.h"
#include "selftest.h"
#include "safety_controller.h"

// ============================================================================
// BLE UUID DEFINITIONS (docs/ble_protocol.md)
// ============================================================================
#define BLE_DEVICE_NAME      "AgriRover"
#define SERVICE_UUID         "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHAR_UUID_RX_WRITE   "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHAR_UUID_TX_NOTIFY  "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// Global state and BLE pointers
static RoverState state;
static NimBLEServer* pServer = nullptr;
static NimBLECharacteristic* pTxChar = nullptr;
static NimBLECharacteristic* pRxChar = nullptr;

// Thread-safe incoming line queue using FreeRTOS mutex
static std::string rxRawAccumulator;
static std::vector<String> incomingLineQueue;
static SemaphoreHandle_t queueMutex = nullptr;

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================
void sendJson(const String& jsonStr);
void sendAck(const String& cmd, bool ok, const String& reason = "", const String& extraJson = "");
void sendEvent(const String& eventName, const String& extraJson = "");
void sendFault(const String& faultCode);
void sendAlert(const String& code, const String& msg);
void stopAll(const String& reason);
void handleIncomingCommand(const String& line);

// ============================================================================
// OUTGOING MESSAGE CHUNKING (MTU-AWARE)
// Splits outgoing JSON lines into chunks fitting the peer MTU.
// ============================================================================
void sendJson(const String& jsonStr) {
    if (!state.isConnected || pTxChar == nullptr) {
        return;
    }

    String payload = jsonStr + "\n";
    const uint8_t* data = (const uint8_t*)payload.c_str();
    size_t totalLen = payload.length();
    size_t offset = 0;

    // Standard BLE ATT header is 3 bytes
    size_t chunkLimit = state.currentMtu > 3 ? (state.currentMtu - 3) : 20;
    if (chunkLimit > 180) chunkLimit = 180; // Safety cap
    if (chunkLimit < 20)  chunkLimit = 20;

    while (offset < totalLen) {
        size_t sendLen = totalLen - offset;
        if (sendLen > chunkLimit) {
            sendLen = chunkLimit;
        }

        pTxChar->setValue(data + offset, sendLen);
        pTxChar->notify();

        offset += sendLen;
        if (offset < totalLen) {
            delayMicroseconds(400);
        }
    }
}

// Helpers for formatted protocol responses
void sendAck(const String& cmd, bool ok, const String& reason, const String& extraJson) {
    String msg = "{\"t\":\"ack\",\"c\":\"" + cmd + "\",\"ok\":" + (ok ? "true" : "false");
    if (!ok && reason.length() > 0) {
        msg += ",\"reason\":\"" + reason + "\"";
    }
    if (extraJson.length() > 0) {
        msg += "," + extraJson;
    }
    msg += "}";
    sendJson(msg);
}

void sendEvent(const String& eventName, const String& extraJson) {
    String msg = "{\"t\":\"ev\",\"e\":\"" + eventName + "\"";
    if (extraJson.length() > 0) {
        msg += "," + extraJson;
    }
    msg += "}";
    sendJson(msg);
}

void sendFault(const String& faultCode) {
    state.isFault = true;
    state.faultCode = faultCode;
    String msg = "{\"t\":\"fault\",\"code\":\"" + faultCode + "\"}";
    sendJson(msg);
}

void sendAlert(const String& code, const String& msg) {
    String out = "{\"t\":\"al\",\"code\":\"" + code + "\",\"msg\":\"" + msg + "\"}";
    sendJson(out);
}

// ============================================================================
// HARDWARE SHUTDOWN / EMERGENCY STOP
// ============================================================================
void stopAll(const String& reason) {
    state.isMoving = false;
    SafetyController::instance().emergencyStopAll(reason);
}

// ============================================================================
// BLE CALLBACKS
// ============================================================================
class ServerCallbacks : public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServ, ble_gap_conn_desc* desc) override {
        state.isConnected = true;
        state.connId = desc->conn_handle;
        state.lastMessageMs = millis();
        state.currentMtu = pServ->getPeerMTU(desc->conn_handle);
        if (state.currentMtu < 23) state.currentMtu = 23;

        Serial.printf("[BLE] Client connected (handle=%u, MTU=%u)\n", desc->conn_handle, state.currentMtu);
        // Send initial mode event immediately upon connection
        sendEvent("mode", "\"m\":\"" + String(SafetyController::instance().getModeString()) + "\"");
    }

    void onDisconnect(NimBLEServer* pServ) override {
        state.isConnected = false;
        Serial.println("[BLE] Client disconnected! Stopping actuators and setting PAUSED mode...");
        SafetyController::instance().onBleDisconnected();
        NimBLEDevice::startAdvertising();
    }

    void onMTUChange(uint16_t MTU, ble_gap_conn_desc* desc) override {
        state.currentMtu = MTU;
        Serial.printf("[BLE] Negotiated MTU: %u\n", MTU);
    }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
    void onWrite(NimBLECharacteristic* pCharacteristic) override {
        std::string rxData = pCharacteristic->getValue();
        if (rxData.empty()) return;

        // Reassemble incoming lines across multiple writes
        for (char c : rxData) {
            if (c == '\n') {
                if (!rxRawAccumulator.empty()) {
                    String line = String(rxRawAccumulator.c_str());
                    line.trim();
                    if (line.length() > 0 && queueMutex != nullptr) {
                        if (xSemaphoreTake(queueMutex, pdMS_TO_TICKS(10)) == pdTRUE) {
                            incomingLineQueue.push_back(line);
                            xSemaphoreGive(queueMutex);
                        }
                    }
                    rxRawAccumulator.clear();
                }
            } else if (c != '\r') {
                if (rxRawAccumulator.length() < 1024) {
                    rxRawAccumulator += c;
                } else {
                    rxRawAccumulator.clear();
                }
            }
        }
    }
};

// ============================================================================
// INCOMING COMMAND DISPATCHER
// ============================================================================
void handleIncomingCommand(const String& line) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, line);
    if (err) {
        Serial.printf("[JSON] Deserialization failed: %s | Line: %s\n", err.c_str(), line.c_str());
        sendAck("unknown", false, "malformed json");
        return;
    }

    const char* cmd = doc["c"] | "";
    if (strlen(cmd) == 0) {
        sendAck("unknown", false, "missing command field");
        return;
    }

    // Update heartbeat watchdog timestamp
    state.lastMessageMs = millis();

    // ------------------------------------------------------------------------
    // Command 1: STOP (Highest Priority)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "stop") == 0) {
        stopAll("Command STOP");
        sendAck("stop", true);
        return;
    }

    // ------------------------------------------------------------------------
    // Command 2: HEARTBEAT (hb)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "hb") == 0) {
        sendAck("hb", true);
        return;
    }

    // ------------------------------------------------------------------------
    // Command 3: ESTOP RESET (estop_reset)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "estop_reset") == 0) {
        String reason;
        if (SafetyController::instance().handleEStopReset(reason)) {
            state.isEStop = false;
            state.isFault = false;
            state.faultCode = "";
            Serial.println("[SAFETY] E-Stop & faults cleared via estop_reset.");
            sendAck("estop_reset", true);
        } else {
            sendAck("estop_reset", false, reason);
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 4: DRIVE (l, r) [-100..100]
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "drive") == 0) {
        String reason;
        if (!SafetyController::instance().validateDrive(reason)) {
            sendAck("drive", false, reason);
            return;
        }

        int l = doc["l"] | 0;
        int r = doc["r"] | 0;

        MotorDriver::instance().setTargetSpeed(l, r);
        state.isMoving = (l != 0 || r != 0);
        sendAck("drive", true);
        return;
    }

    // ------------------------------------------------------------------------
    // Command 5: MODE (m: idle|manual|mission)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "mode") == 0) {
        const char* mStr = doc["m"] | "";
        RoverMode newMode;
        if (stringToMode(String(mStr), newMode)) {
            String reason;
            if (SafetyController::instance().requestModeChange(newMode, reason)) {
                state.mode = newMode;
                Serial.printf("[MODE] Switched to %s\n", mStr);
                sendAck("mode", true, "", "\"m\":\"" + String(mStr) + "\"");
            } else {
                sendAck("mode", false, reason);
            }
        } else {
            sendAck("mode", false, "invalid mode value");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 6: MOVE (mm)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "move") == 0) {
        String reason;
        if (!SafetyController::instance().validateMove(reason)) {
            sendAck("move", false, reason);
            return;
        }

        int mm = doc["mm"] | 0;
        if (MotionController::instance().startMove(mm)) {
            state.isMoving = true;
            sendAck("move", true, "", "\"mm\":" + String(mm));
        } else {
            sendAck("move", false, "controller busy or zero distance");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 7: TURN (deg)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "turn") == 0) {
        String reason;
        if (!SafetyController::instance().validateTurn(reason)) {
            sendAck("turn", false, reason);
            return;
        }

        int deg = doc["deg"] | 0;
        if (MotionController::instance().startTurn(deg)) {
            state.isMoving = true;
            sendAck("turn", true, "", "\"deg\":" + String(deg));
        } else {
            sendAck("turn", false, "controller busy or zero angle");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 8: PROBE (a: down|up|read)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "probe") == 0) {
        String reason;
        if (!SafetyController::instance().validateProbe(reason)) {
            sendAck("probe", false, reason);
            return;
        }

        const char* action = doc["a"] | "";
        if (strcmp(action, "down") == 0) {
            if (ProbeController::instance().commandDown()) {
                sendAck("probe", true, "", "\"a\":\"down\"");
            } else {
                sendAck("probe", false, "probe already moving");
            }
        } else if (strcmp(action, "up") == 0) {
            if (ProbeController::instance().commandUp()) {
                sendAck("probe", true, "", "\"a\":\"up\"");
            } else {
                sendAck("probe", false, "probe already moving");
            }
        } else if (strcmp(action, "read") == 0) {
            if (ProbeController::instance().commandRead()) {
                int soilVal = SensorManager::instance().getSoilPercent();
                sendAck("probe", true, "", "\"a\":\"read\",\"v\":" + String(soilVal));
            } else {
                sendAck("probe", false, "probe busy");
            }
        } else {
            sendAck("probe", false, "invalid action");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 9: NOZZLE (pan, tilt)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "nozzle") == 0) {
        String reason;
        if (!SafetyController::instance().validateNozzle(reason)) {
            sendAck("nozzle", false, reason);
            return;
        }

        if (doc.containsKey("pan")) {
            float pan = doc["pan"].as<float>();
            ServosPCA9685::instance().setTargetAngle(ServoChannel::NOZZLE_PAN, pan);
        }
        if (doc.containsKey("tilt")) {
            float tilt = doc["tilt"].as<float>();
            ServosPCA9685::instance().setTargetAngle(ServoChannel::NOZZLE_TILT, tilt);
        }
        float curPan = ServosPCA9685::instance().getTargetAngle(ServoChannel::NOZZLE_PAN);
        float curTilt = ServosPCA9685::instance().getTargetAngle(ServoChannel::NOZZLE_TILT);
        sendAck("nozzle", true, "", "\"pan\":" + String((int)curPan) + ",\"tilt\":" + String((int)curTilt));
        return;
    }

    // ------------------------------------------------------------------------
    // Command 10: CAMTILT (pose: leaf|stem)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "camtilt") == 0) {
        String reason;
        if (!SafetyController::instance().validateCamTilt(reason)) {
            sendAck("camtilt", false, reason);
            return;
        }

        const char* pose = doc["pose"] | "";
        if (strcmp(pose, "leaf") == 0) {
            ServosPCA9685::instance().setTargetAngle(ServoChannel::CAM_TILT, 60.0f);
            state.camPose = "leaf";
            sendAck("camtilt", true, "", "\"pose\":\"leaf\"");
        } else if (strcmp(pose, "stem") == 0) {
            ServosPCA9685::instance().setTargetAngle(ServoChannel::CAM_TILT, 120.0f);
            state.camPose = "stem";
            sendAck("camtilt", true, "", "\"pose\":\"stem\"");
        } else {
            sendAck("camtilt", false, "invalid pose: must be leaf or stem");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 11: PUMP (id: water|treat, ms)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "pump") == 0) {
        String reason;
        if (!SafetyController::instance().validatePump(reason)) {
            sendAck("pump", false, reason);
            return;
        }

        const char* id = doc["id"] | "";
        PumpId pId = PumpId::NONE;
        if (strcmp(id, "water") == 0) pId = PumpId::WATER;
        else if (strcmp(id, "treat") == 0) pId = PumpId::TREATMENT;

        if (pId == PumpId::NONE) {
            sendAck("pump", false, "invalid pump id: must be water or treat");
            return;
        }

        unsigned long requestedMs = doc["ms"] | 1000UL;
        uint32_t maxCap = ConfigStore::instance().getPumpMaxCapMs();
        unsigned long actualMs = (requestedMs < maxCap) ? requestedMs : maxCap;

        if (PumpManager::instance().startPump(pId, actualMs)) {
            sendAck("pump", true, "", "\"id\":\"" + String(id) + "\",\"ms\":" + String(actualMs));
        } else {
            sendAck("pump", false, "pump start failed");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 12: CFG (k, v) -> Saves calibrations and limits to NVS
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "cfg") == 0) {
        const char* k = doc["k"] | "";
        const char* v = doc["v"] | "";
        if (strlen(k) > 0) {
            ConfigStore::instance().setGeneric(String(k), String(v));
            Serial.printf("[CFG] Saved to NVS: key='%s' val='%s'\n", k, v);
            sendAck("cfg", true, "", "\"k\":\"" + String(k) + "\",\"v\":\"" + String(v) + "\"");
        } else {
            sendAck("cfg", false, "missing key");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 13: SELFTEST
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "selftest") == 0) {
        String reason;
        if (!SafetyController::instance().validateSelfTest(reason)) {
            sendAck("selftest", false, reason);
            return;
        }

        if (SelfTestRunner::instance().start()) {
            sendAck("selftest", true);
        } else {
            sendAck("selftest", false, "selftest already running");
        }
        return;
    }

    sendAck(cmd, false, "unrecognized command");
}

// ============================================================================
// TELEMETRY BROADCASTER (5 Hz = 200 ms)
// ============================================================================
void broadcastTelemetry() {
    if (!state.isConnected) return;

    float bat = SensorManager::instance().getBatteryVoltage();
    int soil = SensorManager::instance().getSoilPercent();
    float temp = SensorManager::instance().getTemperatureC();
    float hum = SensorManager::instance().getHumidityPct();
    float tilt = ImuDriver::instance().getTiltDeg();
    int dist = SensorManager::instance().getDistanceCm();
    String probe = ProbeController::instance().getStateString();
    long encL = EncoderDriver::instance().getTicksL();
    long encR = EncoderDriver::instance().getTicksR();

    String tel = "{\"t\":\"tel\"";
    tel += ",\"bat\":" + String(bat, 1);
    tel += ",\"mode\":\"" + String(SafetyController::instance().getModeString()) + "\"";
    tel += ",\"soil\":" + String(soil);
    tel += ",\"temp\":" + String(temp, 1);
    tel += ",\"hum\":" + String(hum, 1);
    tel += ",\"tilt\":" + String(tilt, 1);
    tel += ",\"dist\":" + String(dist);
    tel += ",\"probe\":\"" + probe + "\"";
    tel += ",\"enc\":{\"l\":" + String(encL) + ",\"r\":" + String(encR) + "}";
    tel += "}";

    sendJson(tel);
}

// ============================================================================
// HEARTBEAT WATCHDOG
// ============================================================================
void checkHeartbeatWatchdog() {
    if (!state.isConnected) return;

    unsigned long now = millis();
    if (now - state.lastMessageMs > 1000) {
        SafetyController::instance().onHeartbeatTimeout();
    }
}

// ============================================================================
// CALLBACK REGISTRATIONS
// ============================================================================
void setupSubsystemCallbacks() {
    // Probe events & fault
    ProbeController::instance().setCallbacks(
        [](const String& action, int value) {
            if (action == "read") {
                sendEvent("probe_done", "\"a\":\"read\",\"val\":" + String(value));
            } else {
                sendEvent("probe_done", "\"a\":\"" + action + "\"");
            }
        },
        [](const String& faultCode) {
            SafetyController::instance().triggerFault(faultCode, "Probe Fault");
        }
    );

    // Pump completion event
    PumpManager::instance().setCallback([](const String& pumpIdStr) {
        sendEvent("pump_done", "\"id\":\"" + pumpIdStr + "\"");
    });

    // Motion arrived event
    MotionController::instance().setCallback([](int traveledMm, int turnedDeg, bool isMove) {
        state.isMoving = false;
        if (isMove) {
            sendEvent("arrived", "\"mm\":" + String(traveledMm));
        } else {
            sendEvent("arrived", "\"deg\":" + String(turnedDeg));
        }
    });

    // Selftest completion event
    SelfTestRunner::instance().setCallback([](bool pass, const String& detailsJson) {
        sendEvent("selftest_done", "\"pass\":" + String(pass ? "true" : "false") + ",\"details\":" + detailsJson);
    });
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(400);

    Serial.println("\n========================================================");
    Serial.println("   AgriRover ESP32 Main Controller - Safety & State Boot ");
    Serial.println("========================================================");

    // 1. Initialize NVS Config Storage
    ConfigStore::instance().init();

    // 2. Initialize Shared I2C Bus (SDA: GPIO 21, SCL: GPIO 22)
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL, 400000);

    // 3. Initialize FreeRTOS synchronization mutex
    queueMutex = xSemaphoreCreateMutex();

    // 4. Initialize Hardware Subsystems (At boot all outputs OFF, servos at safe pos)
    MotorDriver::instance().init();
    EncoderDriver::instance().init();
    ImuDriver::instance().init();
    ServosPCA9685::instance().init();
    SensorManager::instance().init();
    ProbeController::instance().init();
    PumpManager::instance().init();
    MotionController::instance().init();

    // 5. Connect Subsystem Events
    setupSubsystemCallbacks();

    // 6. Initialize Safety Controller & State Machine
    SafetyController::instance().init(
        [](const String& eventName, const String& extraJson) {
            sendEvent(eventName, extraJson);
        },
        [](const String& faultCode) {
            sendFault(faultCode);
        },
        [](const String& code, const String& msg) {
            sendAlert(code, msg);
        }
    );

    // 7. Optional GPS RX pin
    pinMode(PIN_GPS_RX, INPUT);

    // 8. Configure ESP32 Task Watchdog Timer (TWDT, 5000ms timeout)
    esp_task_wdt_config_t twdt_config = {
        .timeout_ms = 5000,
        .idle_core_mask = 0,
        .trigger_panic = true,
    };
    if (esp_task_wdt_reconfigure(&twdt_config) != ESP_OK) {
        esp_task_wdt_init(&twdt_config);
    }
    esp_task_wdt_add(NULL); // Subscribe Arduino loopTask
    Serial.println("[WDT] ESP32 Task Watchdog Timer active (5000ms timeout).");

    // Ensure all motors and actuators are initially idle and safe
    stopAll("Initial Boot");

    // 9. Initialize NimBLE Stack
    NimBLEDevice::init(BLE_DEVICE_NAME);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);

    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    NimBLEService* pService = pServer->createService(SERVICE_UUID);

    pTxChar = pService->createCharacteristic(
        CHAR_UUID_TX_NOTIFY,
        NIMBLE_PROPERTY::NOTIFY
    );

    pRxChar = pService->createCharacteristic(
        CHAR_UUID_RX_WRITE,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
    );
    pRxChar->setCallbacks(new RxCallbacks());

    pService->start();

    NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setName(BLE_DEVICE_NAME);
    pAdvertising->start();

    Serial.println("[BLE] Advertising started as 'AgriRover'. Ready for mission.");
}

// ============================================================================
// MAIN LOOP (NON-BLOCKING)
// ============================================================================
void loop() {
    // 0. Pet the ESP32 Task Watchdog
    esp_task_wdt_reset();

    // 1. Process queued incoming lines from BLE
    String nextLine = "";
    if (queueMutex != nullptr && xSemaphoreTake(queueMutex, pdMS_TO_TICKS(5)) == pdTRUE) {
        if (!incomingLineQueue.empty()) {
            nextLine = incomingLineQueue.front();
            incomingLineQueue.erase(incomingLineQueue.begin());
        }
        xSemaphoreGive(queueMutex);
    }

    if (nextLine.length() > 0) {
        handleIncomingCommand(nextLine);
    }

    // 2. Hardware Subsystem Non-Blocking Updates
    MotorDriver::instance().update();
    ImuDriver::instance().update();
    ServosPCA9685::instance().update();
    SensorManager::instance().update();
    ProbeController::instance().update();
    PumpManager::instance().update();
    MotionController::instance().update();
    SelfTestRunner::instance().update();

    // 3. Central Safety Controller Update (Hardware E-Stop pin, Bat, Tilt, Obstacle, Slip)
    SafetyController::instance().update();

    // 4. Heartbeat Watchdog check (1000 ms)
    checkHeartbeatWatchdog();

    // 5. Broadcast 5 Hz Telemetry (every 200 ms)
    unsigned long now = millis();
    if (now - state.lastTelemetryMs >= 200) {
        state.lastTelemetryMs = now;
        broadcastTelemetry();
    }

    yield();
}
