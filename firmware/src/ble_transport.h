#pragma once
#include "transport.h"
#include <NimBLEDevice.h>
#include <vector>

class BleTransport : public ITransport {
public:
    BleTransport();
    ~BleTransport() override = default;

    void init(TransportMessageCb onMsg) override;
    void update() override;
    bool isConnected() const override;
    const char* getName() const override { return "BLE"; }

    void sendJson(const String& json, uint8_t qos = 0) override;
    void sendTelemetry(const String& json) override;
    void sendAck(const String& cmd, bool ok, const String& reason = "", const String& extraJson = "") override;
    void sendEvent(const String& eventName, const String& extraJson = "") override;
    void sendAlert(const String& code, const String& msg) override;
    void sendFault(const String& faultCode) override;
    void sendStatus(bool online, const String& reason = "") override;

    void setOnDisconnectCallback(std::function<void(const String&)> cb) {
        onDisconnectCb = cb;
    }

private:
    NimBLEServer* pServer = nullptr;
    NimBLECharacteristic* pTxChar = nullptr;
    NimBLECharacteristic* pRxChar = nullptr;
    TransportMessageCb messageCallback = nullptr;
    std::function<void(const String&)> onDisconnectCb = nullptr;

    bool connected = false;
    uint16_t connHandle = 0;
    uint16_t currentMtu = 23;
    std::string rxAccumulator;

    friend class BleServerCallbacks;
    friend class BleRxCallbacks;
};

