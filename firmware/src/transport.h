#pragma once
#include <Arduino.h>
#include <functional>

// Callback invoked when a command line/JSON is received from the active transport
typedef std::function<void(const String& payload)> TransportMessageCb;

class ITransport {
public:
    virtual ~ITransport() = default;

    // Initialize the transport stack and register incoming message handler
    virtual void init(TransportMessageCb onMsg) = 0;

    // Non-blocking loop update (reconnect handling, polling, watchdogs)
    virtual void update() = 0;

    // Connection status check
    virtual bool isConnected() const = 0;

    // Active transport name ("MQTT" or "BLE")
    virtual const char* getName() const = 0;

    // Generic JSON send
    virtual void sendJson(const String& json, uint8_t qos = 0) = 0;

    // Formatted protocol publishers
    virtual void sendTelemetry(const String& json) = 0;
    virtual void sendAck(const String& cmd, bool ok, const String& reason = "", const String& extraJson = "") = 0;
    virtual void sendEvent(const String& eventName, const String& extraJson = "") = 0;
    virtual void sendAlert(const String& code, const String& msg) = 0;
    virtual void sendFault(const String& faultCode) = 0;
    virtual void sendStatus(bool online, const String& reason = "") = 0;
};

