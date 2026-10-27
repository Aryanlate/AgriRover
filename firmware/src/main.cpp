#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <vector>
#include "pin_map.h"
#include "rover_state.h"

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

// Thread-safe incoming line queue using FreeRTOS mutex (never allocate heap in critical sections)
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
    if (chunkLimit > 180) chunkLimit = 180; // Safety cap to avoid ringbuffer exhaustion
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
            // Tiny microsecond pause between split chunks
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
// ACTUATOR STUBS
// ============================================================================
void stopAll(const String& reason) {
    state.isMoving = false;
    state.speedL = 0;
    state.speedR = 0;
    state.moveActive = false;
    state.turnActive = false;
    state.pumpActive = false;

    // Hardware stubs: drive all motor and relay pins LOW
    digitalWrite(PIN_MOTOR_L_ENA, LOW);
    digitalWrite(PIN_MOTOR_L_IN1, LOW);
    digitalWrite(PIN_MOTOR_L_IN2, LOW);
    digitalWrite(PIN_MOTOR_R_ENB, LOW);
    digitalWrite(PIN_MOTOR_R_IN3, LOW);
    digitalWrite(PIN_MOTOR_R_IN4, LOW);
    digitalWrite(PIN_RELAY_WATER, LOW);
    digitalWrite(PIN_RELAY_TREAT, LOW);

    Serial.printf("[STUB] stopAll() called. Reason: %s\n", reason.c_str());
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

        Serial.printf("[BLE] Connected (handle=%u, MTU=%u)\n", desc->conn_handle, state.currentMtu);
    }

    void onDisconnect(NimBLEServer* pServ) override {
        bool wasMoving = state.isMoving;
        state.isConnected = false;
        Serial.println("[BLE] Disconnected! Stopping rover and restarting advertising...");
        stopAll("BLE Disconnected");

        if (wasMoving) {
            state.isFault = true;
            state.faultCode = "HB_LOST";
        }

        // Restart advertising so client can reconnect
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
                // Safeguard maximum line buffer
                if (rxRawAccumulator.length() < 1024) {
                    rxRawAccumulator += c;
                } else {
                    rxRawAccumulator.clear(); // Overflow discard
                }
            }
        }
    }
};

// ============================================================================
// INCOMING COMMAND DISPATCHER
// Implements every command in docs/ble_protocol.md
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

    // Update heartbeat watchdog timestamp on any valid command
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
        state.isEStop = false;
        state.isFault = false;
        state.faultCode = "";
        Serial.println("[SAFETY] E-Stop & faults cleared via estop_reset.");
        sendAck("estop_reset", true);
        return;
    }

    // Safety refusal check for all other active commands
    if (state.isEStop) {
        sendAck(cmd, false, "estop active");
        return;
    }
    if (state.isFault) {
        sendAck(cmd, false, "fault active: " + state.faultCode);
        return;
    }
    if (state.isLowBat) {
        sendAck(cmd, false, "low battery cutoff");
        return;
    }

    // ------------------------------------------------------------------------
    // Command 4: DRIVE (l, r) [-100..100]
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "drive") == 0) {
        // Refused in mission mode
        if (state.mode == RoverMode::MISSION) {
            sendAck("drive", false, "auto mode");
            return;
        }

        // Refused if probe is not up
        if (state.probeState != "up") {
            sendAck("drive", false, "probe not up");
            return;
        }

        int l = doc["l"] | 0;
        int r = doc["r"] | 0;

        // Clamp to [-100, 100]
        l = constrain(l, -100, 100);
        r = constrain(r, -100, 100);

        state.speedL = l;
        state.speedR = r;
        state.isMoving = (l != 0 || r != 0);

        Serial.printf("[STUB] Drive set: L=%d, R=%d (Moving: %s)\n", l, r, state.isMoving ? "YES" : "NO");
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
            state.mode = newMode;
            Serial.printf("[MODE] Switched to %s\n", mStr);
            sendAck("mode", true, "", "\"m\":\"" + String(mStr) + "\"");
            sendEvent("mode", "\"m\":\"" + String(mStr) + "\"");
        } else {
            sendAck("mode", false, "invalid mode value");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 6: MOVE (mm)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "move") == 0) {
        if (state.probeState != "up") {
            sendAck("move", false, "probe not up");
            return;
        }

        int mm = doc["mm"] | 0;
        state.moveActive = true;
        state.moveMm = mm;
        state.isMoving = true;
        // Non-blocking duration calculation stub (~100 ms per 50 mm, min 200 ms)
        unsigned long duration = (abs(mm) * 2 > 200) ? (unsigned long)(abs(mm) * 2) : 200UL;
        state.moveEndMs = millis() + duration;

        Serial.printf("[STUB] Move command initiated: %d mm (Sim duration: %lu ms)\n", mm, duration);
        sendAck("move", true, "", "\"mm\":" + String(mm));
        return;
    }

    // ------------------------------------------------------------------------
    // Command 7: TURN (deg)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "turn") == 0) {
        if (state.probeState != "up") {
            sendAck("turn", false, "probe not up");
            return;
        }

        int deg = doc["deg"] | 0;
        state.turnActive = true;
        state.turnDeg = deg;
        state.isMoving = true;
        // Non-blocking duration calculation stub (~10 ms per degree, min 200 ms)
        unsigned long duration = (abs(deg) * 10 > 200) ? (unsigned long)(abs(deg) * 10) : 200UL;
        state.turnEndMs = millis() + duration;

        Serial.printf("[STUB] Turn command initiated: %d deg (Sim duration: %lu ms)\n", deg, duration);
        sendAck("turn", true, "", "\"deg\":" + String(deg));
        return;
    }

    // ------------------------------------------------------------------------
    // Command 8: PROBE (a: down|up|read)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "probe") == 0) {
        const char* action = doc["a"] | "";
        if (strcmp(action, "down") == 0) {
            state.probeState = "down";
            Serial.println("[STUB] Probe inserted DOWN");
            sendAck("probe", true, "", "\"a\":\"down\"");
            sendEvent("probe_done", "\"a\":\"down\"");
        } else if (strcmp(action, "up") == 0) {
            state.probeState = "up";
            Serial.println("[STUB] Probe retracted UP");
            sendAck("probe", true, "", "\"a\":\"up\"");
            sendEvent("probe_done", "\"a\":\"up\"");
        } else if (strcmp(action, "read") == 0) {
            int soilVal = state.soilMoisture;
            Serial.printf("[STUB] Probe moisture read: %d%%\n", soilVal);
            sendAck("probe", true, "", "\"a\":\"read\",\"v\":" + String(soilVal));
            sendEvent("probe_done", "\"a\":\"read\",\"val\":" + String(soilVal));
        } else {
            sendAck("probe", false, "invalid action");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 9: NOZZLE (pan, tilt)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "nozzle") == 0) {
        state.nozzlePan = doc["pan"] | state.nozzlePan;
        state.nozzleTilt = doc["tilt"] | state.nozzleTilt;
        Serial.printf("[STUB] Nozzle aim set: Pan=%d, Tilt=%d\n", state.nozzlePan, state.nozzleTilt);
        sendAck("nozzle", true, "", "\"pan\":" + String(state.nozzlePan) + ",\"tilt\":" + String(state.nozzleTilt));
        return;
    }

    // ------------------------------------------------------------------------
    // Command 10: CAMTILT (pose: leaf|stem)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "camtilt") == 0) {
        const char* pose = doc["pose"] | "";
        if (strcmp(pose, "leaf") == 0 || strcmp(pose, "stem") == 0) {
            state.camPose = pose;
            Serial.printf("[STUB] Camera tilt pose set: %s\n", pose);
            sendAck("camtilt", true, "", "\"pose\":\"" + String(pose) + "\"");
        } else {
            sendAck("camtilt", false, "invalid pose: must be leaf or stem");
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Command 11: PUMP (id: water|treat, ms)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "pump") == 0) {
        const char* id = doc["id"] | "";
        if (strcmp(id, "water") != 0 && strcmp(id, "treat") != 0) {
            sendAck("pump", false, "invalid pump id: must be water or treat");
            return;
        }

        unsigned long requestedMs = doc["ms"] | 1000UL;
        // Firmware hard cap per rule: "Pump time is capped in firmware, whatever the command says"
        unsigned long actualMs = (requestedMs < RoverState::PUMP_MAX_CAP_MS) ? requestedMs : RoverState::PUMP_MAX_CAP_MS;

        state.pumpActive = true;
        state.activePumpId = id;
        state.pumpEndMs = millis() + actualMs;

        // Hardware stub activation
        if (strcmp(id, "water") == 0) {
            digitalWrite(PIN_RELAY_WATER, HIGH);
        } else {
            digitalWrite(PIN_RELAY_TREAT, HIGH);
        }

        Serial.printf("[STUB] Pump started: %s for %lu ms (requested: %lu ms)\n", id, actualMs, requestedMs);
        sendAck("pump", true, "", "\"id\":\"" + String(id) + "\",\"ms\":" + String(actualMs));
        return;
    }

    // ------------------------------------------------------------------------
    // Command 12: CFG (k, v)
    // ------------------------------------------------------------------------
    if (strcmp(cmd, "cfg") == 0) {
        const char* k = doc["k"] | "";
        const char* v = doc["v"] | "";
        if (strlen(k) > 0) {
            state.configs[String(k)] = String(v);
            Serial.printf("[CFG] Key '%s' set to '%s'\n", k, v);
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
        Serial.println("[SELFTEST] Running hardware diagnostics stub...");
        sendAck("selftest", true);
        sendEvent("selftest_done", "\"pass\":true");
        return;
    }

    // Unknown command fallback
    sendAck(cmd, false, "unrecognized command");
}

// ============================================================================
// TELEMETRY BROADCASTER (5 Hz = 200 ms)
// ============================================================================
void broadcastTelemetry() {
    if (!state.isConnected) return;

    // Simulate encoder tick increments if moving
    if (state.isMoving) {
        state.encL += state.speedL / 10;
        state.encR += state.speedR / 10;
    }

    // {"t":"tel","bat":12.4,"mode":"idle","soil":42,"temp":24.5,"hum":58.0,"tilt":1.2,"dist":85,"probe":"up","enc":{"l":0,"r":0}}
    String tel = "{\"t\":\"tel\"";
    tel += ",\"bat\":" + String(state.batteryVoltage, 1);
    tel += ",\"mode\":\"" + String(modeToString(state.mode)) + "\"";
    tel += ",\"soil\":" + String(state.soilMoisture);
    tel += ",\"temp\":" + String(state.tempC, 1);
    tel += ",\"hum\":" + String(state.humPct, 1);
    tel += ",\"tilt\":" + String(state.tiltDeg, 1);
    tel += ",\"dist\":" + String(state.distanceCm);
    tel += ",\"probe\":\"" + state.probeState + "\"";
    tel += ",\"enc\":{\"l\":" + String(state.encL) + ",\"r\":" + String(state.encR) + "}";
    tel += "}";

    sendJson(tel);
}

// ============================================================================
// BACKGROUND ASYNC TASK UPDATER (Pumps, Moves, Turns)
// ============================================================================
void updateActiveTasks() {
    unsigned long now = millis();

    // Pump timer expiration check
    if (state.pumpActive && now >= state.pumpEndMs) {
        digitalWrite(PIN_RELAY_WATER, LOW);
        digitalWrite(PIN_RELAY_TREAT, LOW);
        state.pumpActive = false;
        Serial.printf("[STUB] Pump finished: %s\n", state.activePumpId.c_str());
        sendEvent("pump_done", "\"id\":\"" + state.activePumpId + "\"");
    }

    // Move simulation timer expiration check
    if (state.moveActive && now >= state.moveEndMs) {
        state.moveActive = false;
        state.isMoving = false;
        state.encL += state.moveMm;
        state.encR += state.moveMm;
        Serial.printf("[STUB] Move arrived: %d mm\n", state.moveMm);
        sendEvent("arrived", "\"mm\":" + String(state.moveMm));
    }

    // Turn simulation timer expiration check
    if (state.turnActive && now >= state.turnEndMs) {
        state.turnActive = false;
        state.isMoving = false;
        Serial.printf("[STUB] Turn arrived: %d deg\n", state.turnDeg);
        sendEvent("arrived", "\"deg\":" + String(state.turnDeg));
    }
}

// ============================================================================
// HEARTBEAT WATCHDOG
// "no message for 1000 ms while moving calls stop() and sends a fault event."
// ============================================================================
void checkHeartbeatWatchdog() {
    if (!state.isConnected) return;

    unsigned long now = millis();
    if (now - state.lastMessageMs > 1000) {
        // If rover was in motion or pump was active, trigger HB_LOST fault
        if (state.isMoving || state.pumpActive) {
            Serial.println("[WATCHDOG] Heartbeat timeout (>1000ms) while moving! Calling stop() and sending fault.");
            stopAll("Heartbeat Watchdog Timeout");
            sendFault("HB_LOST");
        }
    }
}

// ============================================================================
// SETUP & INITIALIZATION
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n==================================================");
    Serial.println("  AgriRover ESP32 Main Controller Initializing...  ");
    Serial.println("==================================================");

    // Create FreeRTOS queue mutex
    queueMutex = xSemaphoreCreateMutex();

    // Initialize Pin Modes according to docs/pin_map.md
    pinMode(PIN_MOTOR_L_ENA, OUTPUT);
    pinMode(PIN_MOTOR_L_IN1, OUTPUT);
    pinMode(PIN_MOTOR_L_IN2, OUTPUT);
    pinMode(PIN_MOTOR_R_ENB, OUTPUT);
    pinMode(PIN_MOTOR_R_IN3, OUTPUT);
    pinMode(PIN_MOTOR_R_IN4, OUTPUT);

    pinMode(PIN_RELAY_WATER, OUTPUT);
    pinMode(PIN_RELAY_TREAT, OUTPUT);

    pinMode(PIN_LIMIT_PROBE_UP, INPUT_PULLUP);
    pinMode(PIN_LIMIT_PROBE_DOWN, INPUT_PULLUP);
    pinMode(PIN_ESTOP_SENSE, INPUT_PULLUP);

    // Rule: All outputs OFF at boot
    stopAll("Boot Initialization");

    // Initialize NimBLE Device
    NimBLEDevice::init(BLE_DEVICE_NAME);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);

    // Create BLE Server
    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks());

    // Create BLE Service
    NimBLEService* pService = pServer->createService(SERVICE_UUID);

    // TX Characteristic (ESP32 -> Website, Notify)
    pTxChar = pService->createCharacteristic(
        CHAR_UUID_TX_NOTIFY,
        NIMBLE_PROPERTY::NOTIFY
    );

    // RX Characteristic (Website -> ESP32, Write)
    pRxChar = pService->createCharacteristic(
        CHAR_UUID_RX_WRITE,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
    );
    pRxChar->setCallbacks(new RxCallbacks());

    // Start BLE Service
    pService->start();

    // Configure Advertising
    NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setName(BLE_DEVICE_NAME);
    pAdvertising->start();

    Serial.println("[BLE] Advertising started as 'AgriRover'. Ready for connection.");
}

// ============================================================================
// MAIN LOOP (NON-BLOCKING)
// ============================================================================
void loop() {
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

    // 2. Check Heartbeat Watchdog
    checkHeartbeatWatchdog();

    // 3. Update active async tasks (pump duration, move, turn)
    updateActiveTasks();

    // 4. Send Telemetry at 5 Hz (every 200 ms)
    unsigned long now = millis();
    if (now - state.lastTelemetryMs >= 200) {
        state.lastTelemetryMs = now;
        broadcastTelemetry();
    }

    // Yield CPU time to FreeRTOS scheduler
    yield();
}
