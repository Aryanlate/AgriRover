#include "mqtt_transport.h"
#if __has_include("secrets.h")
    #include "secrets.h"
#else
    #include "secrets.example.h"
#endif

#ifndef WIFI_SSID
#define WIFI_SSID "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS "YOUR_WIFI_PASSWORD"
#endif
#ifndef MQTT_BROKER
#define MQTT_BROKER "rc2ad722.ala.asia-southeast1.emqxsl.com"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT 8883
#endif
#ifndef MQTT_USER
#define MQTT_USER "rover"
#endif
#ifndef MQTT_PASS
#define MQTT_PASS "YOUR_ROVER_PASSWORD"
#endif
#ifndef ROVER_ID
#define ROVER_ID "rover01"
#endif

static MqttTransport* s_mqttInstance = nullptr;

static void s_mqttCallbackTrampoline(char* topic, uint8_t* payload, unsigned int length) {
    if (s_mqttInstance != nullptr) {
        s_mqttInstance->onMqttMessage(topic, payload, length);
    }
}

MqttTransport::MqttTransport()
    : mqttClient(wifiClient) {
}

void MqttTransport::setupTopics() {
    topicPrefix = "agrirover/" + String(ROVER_ID) + "/";
    cmdTopic = topicPrefix + "cmd";
    telemetryTopic = topicPrefix + "telemetry";
    statusTopic = topicPrefix + "status";
    ackTopic = topicPrefix + "ack";
    evTopic = topicPrefix + "ev";
}

void MqttTransport::init(TransportMessageCb onMsg) {
    messageCallback = onMsg;
    s_mqttInstance = this;
    setupTopics();

    // 1. Configure WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    // 2. Configure TLS Client (setInsecure bypasses certificate authority chain verification on ESP32)
    wifiClient.setInsecure();

    // 3. Configure PubSubClient
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setKeepAlive(5);       // 5 seconds keepalive per specification
    mqttClient.setBufferSize(1024);   // 1024 bytes buffer for JSON payloads
    mqttClient.setCallback(s_mqttCallbackTrampoline);

    Serial.println("\n[MQTT Transport] Initialized with TLS port 8883.");
    Serial.printf("[MQTT Transport] Broker: %s | User: %s | Rover ID: %s\n", MQTT_BROKER, MQTT_USER, ROVER_ID);

    // Initial non-blocking WiFi connect start
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    lastWifiAttemptMs = millis();
}

void MqttTransport::onMqttMessage(char* topic, uint8_t* payload, unsigned int length) {
    if (length == 0 || messageCallback == nullptr) return;

    // Convert raw MQTT byte payload to Arduino String safely
    char* buf = (char*)malloc(length + 1);
    if (!buf) return;
    memcpy(buf, payload, length);
    buf[length] = '\0';

    String msg = String(buf);
    free(buf);

    messageCallback(msg);
}

void MqttTransport::maintainWifi() {
    bool isConnectedNow = (WiFi.status() == WL_CONNECTED);

    if (isConnectedNow) {
        if (!wasWifiConnected) {
            wasWifiConnected = true;
            wifiBackoffMs = 2000;
            Serial.println("\n[WIFI] Connected successfully!");
            Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());
            Serial.printf("[WIFI] RSSI: %d dBm\n", WiFi.RSSI());
        }
    } else {
        if (wasWifiConnected) {
            wasWifiConnected = false;
            Serial.println("[WIFI] Connection lost! Entering reconnect backoff...");
            if (onDisconnectCb) {
                onDisconnectCb("Wi-Fi Connection Lost");
            }
        }

        unsigned long now = millis();
        if (now - lastWifiAttemptMs >= wifiBackoffMs) {
            lastWifiAttemptMs = now;
            Serial.printf("[WIFI] Attempting reconnect to SSID '%s' (backoff=%lu ms)...\n", WIFI_SSID, wifiBackoffMs);
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASS);

            // Exponential backoff capped at 15s
            wifiBackoffMs = (wifiBackoffMs * 2 > 15000) ? 15000 : wifiBackoffMs * 2;
        }
    }
}

void MqttTransport::maintainMqtt() {
    if (WiFi.status() != WL_CONNECTED) {
        if (wasConnected) {
            wasConnected = false;
            if (onDisconnectCb) {
                onDisconnectCb("Wi-Fi Down (MQTT Dropped)");
            }
        }
        return;
    }

    if (mqttClient.connected()) {
        if (!wasConnected) {
            wasConnected = true;
            mqttBackoffMs = 2000;
            Serial.println("[MQTT] Connected to EMQX Cloud Broker!");
            Serial.printf("[MQTT] Subscribing to command topic: %s\n", cmdTopic.c_str());
            mqttClient.subscribe(cmdTopic.c_str(), 0);

            // Publish retained online status with IP and RSSI
            sendStatus(true, "connected");
        }
        return;
    }

    // MQTT is disconnected
    if (wasConnected) {
        wasConnected = false;
        Serial.println("[MQTT] Broker connection lost! Stopping motors & actuators...");
        if (onDisconnectCb) {
            onDisconnectCb("MQTT Connection Lost");
        }
    }

    unsigned long now = millis();
    if (now - lastMqttAttemptMs >= mqttBackoffMs) {
        lastMqttAttemptMs = now;

        // Unique client ID based on MAC address
        uint64_t mac = ESP.getEfuseMac();
        String clientId = "agrirover_" + String(ROVER_ID) + "_" + String((uint32_t)mac, HEX);

        // LWT payload (Retained = true, QoS = 1)
        String lwtPayload = "{\"online\":false,\"reason\":\"lwt\"}";

        Serial.printf("[MQTT] Connecting to broker %s:%d as '%s' (cleanSession=true, LWT retained)...\n",
                      MQTT_BROKER, MQTT_PORT, clientId.c_str());

        // Connect with Last Will on statusTopic (retained=true, qos=1, cleanSession=true)
        bool ok = mqttClient.connect(
            clientId.c_str(),
            MQTT_USER,
            MQTT_PASS,
            statusTopic.c_str(),
            1,                  // willQos
            true,               // willRetain
            lwtPayload.c_str(),
            true                // cleanSession
        );

        if (ok) {
            wasConnected = true;
            mqttBackoffMs = 2000;
            Serial.println("[MQTT] Broker connection established successfully!");
            Serial.printf("[MQTT] Subscribing to: %s (QoS 0)\n", cmdTopic.c_str());
            mqttClient.subscribe(cmdTopic.c_str(), 0);

            sendStatus(true, "boot");
        } else {
            Serial.printf("[MQTT] Connect failed (rc=%d, wifiRSSI=%d dBm). Next attempt in %lu ms\n",
                          mqttClient.state(), WiFi.RSSI(), mqttBackoffMs);
            mqttBackoffMs = (mqttBackoffMs * 2 > 16000) ? 16000 : mqttBackoffMs * 2;
        }
    }
}

void MqttTransport::update() {
    // 1. Maintain Wi-Fi link non-blockingly
    maintainWifi();

    // 2. Maintain MQTT connection non-blockingly
    maintainMqtt();

    // 3. Process PubSubClient events
    if (mqttClient.connected()) {
        mqttClient.loop();
    }
}

bool MqttTransport::isConnected() const {
    return (WiFi.status() == WL_CONNECTED && mqttClient.connected());
}

void MqttTransport::sendJson(const String& json, uint8_t qos) {
    if (!isConnected()) return;
    mqttClient.publish(telemetryTopic.c_str(), json.c_str(), false);
}

void MqttTransport::sendTelemetry(const String& json) {
    if (!isConnected()) return;
    // Telemetry is QoS 0, not retained
    mqttClient.publish(telemetryTopic.c_str(), json.c_str(), false);
}

void MqttTransport::sendAck(const String& cmd, bool ok, const String& reason, const String& extraJson) {
    if (!isConnected()) return;
    String msg = "{\"t\":\"ack\",\"c\":\"" + cmd + "\",\"ok\":" + (ok ? "true" : "false");
    if (!ok && reason.length() > 0) {
        msg += ",\"reason\":\"" + reason + "\"";
    }
    if (extraJson.length() > 0) {
        msg += "," + extraJson;
    }
    msg += "}";
    mqttClient.publish(ackTopic.c_str(), msg.c_str(), false);
}

void MqttTransport::sendEvent(const String& eventName, const String& extraJson) {
    if (!isConnected()) return;
    String msg = "{\"t\":\"ev\",\"e\":\"" + eventName + "\"";
    if (extraJson.length() > 0) {
        msg += "," + extraJson;
    }
    msg += "}";
    // NOTE: PubSubClient::publish() only supports QoS 0, so events go out at QoS 0.
    mqttClient.publish(evTopic.c_str(), (const uint8_t*)msg.c_str(), msg.length(), false);
}

void MqttTransport::sendAlert(const String& code, const String& msg) {
    if (!isConnected()) return;
    String out = "{\"t\":\"al\",\"code\":\"" + code + "\",\"msg\":\"" + msg + "\"}";
    mqttClient.publish(evTopic.c_str(), (const uint8_t*)out.c_str(), out.length(), false);
}

void MqttTransport::sendFault(const String& faultCode) {
    if (!isConnected()) return;
    String msg = "{\"t\":\"fault\",\"code\":\"" + faultCode + "\"}";
    mqttClient.publish(evTopic.c_str(), (const uint8_t*)msg.c_str(), msg.length(), false);
}

void MqttTransport::sendStatus(bool online, const String& reason) {
    if (!isConnected()) return;
    String out = "{\"online\":" + String(online ? "true" : "false");
    out += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
    out += ",\"rssi\":" + String(WiFi.RSSI());
    out += ",\"rover_id\":\"" + String(ROVER_ID) + "\"";
    if (reason.length() > 0) {
        out += ",\"reason\":\"" + reason + "\"";
    }
    out += ",\"uptime_s\":" + String(millis() / 1000);
    out += "}";

    // Status is retained = true. Publish is QoS 0 (PubSubClient limitation); the LWT is
    // registered at QoS 1 in the CONNECT packet, so an unclean disconnect is still reliable.
    mqttClient.publish(statusTopic.c_str(), (const uint8_t*)out.c_str(), out.length(), true);
}

