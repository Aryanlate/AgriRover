#pragma once
#include <functional>
#include "transport.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>

#if __has_include("PubSubClient.h")
    #include "PubSubClient.h"
#else
    #include <PubSubClient.h>
#endif

class MqttTransport : public ITransport {
public:
    MqttTransport();
    ~MqttTransport() override = default;

    void init(TransportMessageCb onMsg) override;
    void update() override;
    bool isConnected() const override;
    const char* getName() const override { return "MQTT"; }

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
    WiFiClientSecure wifiClient;
    PubSubClient mqttClient;
    TransportMessageCb messageCallback = nullptr;
    std::function<void(const String&)> onDisconnectCb = nullptr;

    // Topics
    String topicPrefix;
    String cmdTopic;
    String telemetryTopic;
    String statusTopic;
    String ackTopic;
    String evTopic;

    // Connection state & non-blocking backoff timers
    bool wasConnected = false;
    bool wasWifiConnected = false;

    unsigned long lastWifiAttemptMs = 0;
    unsigned long wifiBackoffMs = 2000;

    unsigned long lastMqttAttemptMs = 0;
    unsigned long mqttBackoffMs = 2000;

    void setupTopics();
    void maintainWifi();
    void maintainMqtt();
    void onMqttMessage(char* topic, uint8_t* payload, unsigned int length);
};

