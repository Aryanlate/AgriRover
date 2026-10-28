#include "ble_transport.h"

static const char* BLE_DEVICE_NAME    = "AgriRover";
static const char* SERVICE_UUID       = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char* CHAR_UUID_RX_WRITE = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E";
static const char* CHAR_UUID_TX_NOTIFY= "6E400003-B5A3-F393-E0A9-E50E24DCCA9E";

class BleServerCallbacks : public NimBLEServerCallbacks {
public:
    BleServerCallbacks(BleTransport* t) : transport(t) {}

    void onConnect(NimBLEServer* pServ, ble_gap_conn_desc* desc) override {
        transport->connected = true;
        transport->connHandle = desc->conn_handle;
        transport->currentMtu = pServ->getPeerMTU(desc->conn_handle);
        if (transport->currentMtu < 23) transport->currentMtu = 23;
        Serial.printf("[BLE] Connected (handle=%u, MTU=%u)\n", desc->conn_handle, transport->currentMtu);
    }

    void onDisconnect(NimBLEServer* pServ) override {
        transport->connected = false;
        Serial.println("[BLE] Disconnected! Starting advertising...");
        if (transport->onDisconnectCb) {
            transport->onDisconnectCb("BLE Disconnected");
        }
        NimBLEDevice::startAdvertising();
    }

    void onMTUChange(uint16_t MTU, ble_gap_conn_desc* desc) override {
        transport->currentMtu = MTU;
        Serial.printf("[BLE] MTU updated to %u\n", MTU);
    }

private:
    BleTransport* transport;
};

class BleRxCallbacks : public NimBLECharacteristicCallbacks {
public:
    BleRxCallbacks(BleTransport* t) : transport(t) {}

    void onWrite(NimBLECharacteristic* pCharacteristic) override {
        std::string rxData = pCharacteristic->getValue();
        if (rxData.empty()) return;

        for (char c : rxData) {
            if (c == '\n') {
                if (!transport->rxAccumulator.empty()) {
                    String line = String(transport->rxAccumulator.c_str());
                    line.trim();
                    transport->rxAccumulator.clear();
                    if (line.length() > 0 && transport->messageCallback) {
                        transport->messageCallback(line);
                    }
                }
            } else if (c != '\r') {
                if (transport->rxAccumulator.length() < 1024) {
                    transport->rxAccumulator += c;
                } else {
                    transport->rxAccumulator.clear();
                }
            }
        }
    }

private:
    BleTransport* transport;
};

BleTransport::BleTransport() {}

void BleTransport::init(TransportMessageCb onMsg) {
    messageCallback = onMsg;

    NimBLEDevice::init(BLE_DEVICE_NAME);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);

    pServer = NimBLEDevice::createServer();
    pServer->setCallbacks(new BleServerCallbacks(this));

    NimBLEService* pService = pServer->createService(SERVICE_UUID);

    pTxChar = pService->createCharacteristic(
        CHAR_UUID_TX_NOTIFY,
        NIMBLE_PROPERTY::NOTIFY
    );

    pRxChar = pService->createCharacteristic(
        CHAR_UUID_RX_WRITE,
        NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
    );
    pRxChar->setCallbacks(new BleRxCallbacks(this));

    pService->start();

    NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setName(BLE_DEVICE_NAME);
    pAdvertising->start();

    Serial.println("[BLE] Stack initialized and advertising as 'AgriRover'");
}

void BleTransport::update() {
    // NimBLE handles updates via FreeRTOS task internally
}

bool BleTransport::isConnected() const {
    return connected;
}

void BleTransport::sendJson(const String& json, uint8_t qos) {
    if (!connected || pTxChar == nullptr) return;

    String framed = json + "\n";
    const uint8_t* data = (const uint8_t*)framed.c_str();
    size_t totalLen = framed.length();
    size_t offset = 0;

    size_t chunkLimit = (currentMtu > 3) ? (currentMtu - 3) : 20;
    if (chunkLimit > 180) chunkLimit = 180;
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

void BleTransport::sendTelemetry(const String& json) {
    sendJson(json);
}

void BleTransport::sendAck(const String& cmd, bool ok, const String& reason, const String& extraJson) {
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

void BleTransport::sendEvent(const String& eventName, const String& extraJson) {
    String msg = "{\"t\":\"ev\",\"e\":\"" + eventName + "\"";
    if (extraJson.length() > 0) {
        msg += "," + extraJson;
    }
    msg += "}";
    sendJson(msg);
}

void BleTransport::sendAlert(const String& code, const String& msg) {
    String out = "{\"t\":\"al\",\"code\":\"" + code + "\",\"msg\":\"" + msg + "\"}";
    sendJson(out);
}

void BleTransport::sendFault(const String& faultCode) {
    String msg = "{\"t\":\"fault\",\"code\":\"" + faultCode + "\"}";
    sendJson(msg);
}

void BleTransport::sendStatus(bool online, const String& reason) {
    String out = "{\"online\":" + String(online ? "true" : "false");
    if (reason.length() > 0) {
        out += ",\"reason\":\"" + reason + "\"";
    }
    out += "}";
    sendJson(out);
}

