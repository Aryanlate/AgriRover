#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "camera_pins.h"

#if __has_include("PubSubClient.h")
    #include "PubSubClient.h"
#else
    #include <PubSubClient.h>
#endif

#if __has_include("secrets.h")
    #include "secrets.h"
#else
    #include "secrets.example.h"
#endif

// ============================================================================
// CONFIGURATION & CREDENTIAL FALLBACKS
// ============================================================================
#ifndef WIFI_SSID
#define WIFI_SSID       "YOUR_WIFI_SSID"
#endif
#ifndef WIFI_PASS
#define WIFI_PASS       "YOUR_WIFI_PASSWORD"
#endif
#ifndef MQTT_BROKER
#define MQTT_BROKER     "rc2ad722.ala.asia-southeast1.emqxsl.com"
#endif
#ifndef MQTT_PORT
#define MQTT_PORT       8883
#endif
#ifndef MQTT_USER
#define MQTT_USER       "cam"
#endif
#ifndef MQTT_PASS
#define MQTT_PASS       "YOUR_CAM_PASSWORD"
#endif
#ifndef ROVER_ID
#define ROVER_ID        "rover01"
#endif

// Supabase upload switch (set to 1 to enable)
#ifndef ENABLE_SUPABASE_UPLOAD
#define ENABLE_SUPABASE_UPLOAD 1
#endif

#ifndef SUPABASE_URL
#define SUPABASE_URL    "https://dpdvijdxupwcqlyspzzi.supabase.co/functions/v1/upload-plant-image"
#endif
// Shared secret that must match the Edge Function's CAMERA_UPLOAD_TOKEN env var.
// Put the real value in secrets.h; never commit it.
#ifndef CAMERA_UPLOAD_TOKEN
#define CAMERA_UPLOAD_TOKEN "YOUR_CAMERA_UPLOAD_TOKEN"
#endif

// Autonomous Supabase upload: the cam captures and uploads on its own timer,
// so images reach the website through Supabase without needing MQTT up.
#ifndef ENABLE_SUPABASE_AUTO_UPLOAD
#define ENABLE_SUPABASE_AUTO_UPLOAD 1
#endif
#ifndef SUPABASE_UPLOAD_INTERVAL_MS
#define SUPABASE_UPLOAD_INTERVAL_MS 10000UL
#endif

// Debug HTTP WebServer Switch (set to 0 for production, 1 for local debug)
#define ENABLE_HTTP_DEBUG 1

// ============================================================================
// CAMERA RESOLUTION & QUALITY CONFIGURATION
// CRITICAL: Resolution and quality constants are preserved identically for
// capture, live view, and ML model consistency.
// ============================================================================
const framesize_t CAM_FRAME_SIZE = FRAMESIZE_SVGA; // 800x600
const int CAM_JPEG_QUALITY = 10;                  // 10-63 (lower = higher quality)
const char* const CAM_RESOLUTION_STR = "800x600";
const size_t CHUNK_SIZE = 16384;                  // 16 KB chunks for large images

// Idle threshold in milliseconds before discarding stale frame buffer
const unsigned long IDLE_STALE_MS = 2000;

// Flash illumination pin
#ifndef FLASH_LED_PIN
#define FLASH_LED_PIN 4
#endif

// ============================================================================
// GLOBAL NETWORKING & STATE
// ============================================================================
static WiFiClientSecure wifiClient;
static PubSubClient mqttClient(wifiClient);

#if ENABLE_HTTP_DEBUG
static WebServer debugServer(80);
#endif

// State variables
static volatile int ledState = 0;
static volatile bool ledChanged = false;
static unsigned long lastCaptureMs = 0;
static unsigned long lastSupabaseUploadMs = 0;

// Live streaming state
static bool liveStreaming = false;
static int liveFps = 1;
static unsigned long liveStartMs = 0;
static unsigned long lastLivePublishMs = 0;

// Non-blocking reconnect timers
static bool wasWifiConnected = false;
static bool wasMqttConnected = false;
static unsigned long lastWifiAttemptMs = 0;
static unsigned long wifiBackoffMs = 2000;
static unsigned long lastMqttAttemptMs = 0;
static unsigned long mqttBackoffMs = 2000;

// MQTT Topic strings
static String topicPrefix;
static String cmdTopic;
static String statusTopic;
static String liveTopic;

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================
bool initCamera();
void setupTopics();
void maintainWifi();
void maintainMqtt();
void publishStatus(bool online, const String& reason = "");
void handleCamCommand(const String& payload);
void captureAndPublish(const String& rid);
void uploadToSupabase(camera_fb_t* fb, const String& rid);
void captureAndUploadSupabase();
void publishLiveFrame();
void onMqttMessage(char* topic, uint8_t* payload, unsigned int length);

#if ENABLE_HTTP_DEBUG
void setupDebugHttp();
#endif

// Static trampoline for PubSubClient callback
static void s_mqttCallbackTrampoline(char* topic, uint8_t* payload, unsigned int length) {
    onMqttMessage(topic, payload, length);
}

// ============================================================================
// TOPIC CONFIGURATION
// ============================================================================
void setupTopics() {
    topicPrefix = "agrirover/" + String(ROVER_ID) + "/cam/";
    cmdTopic = topicPrefix + "cmd";
    statusTopic = topicPrefix + "status";
    liveTopic = topicPrefix + "live";
}

// ============================================================================
// CAMERA INITIALIZATION
// ============================================================================
bool initCamera() {
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = CAM_FRAME_SIZE;
    config.jpeg_quality = CAM_JPEG_QUALITY;

    if (psramFound()) {
        config.fb_count = 2;
    } else {
        config.fb_count = 1;
    }

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("[ERROR] Camera init failed: 0x%x\n", err);
        return false;
    }
    return true;
}

// ============================================================================
// STATUS PUBLISHER (Retained = true; publish QoS 0, LWT registered at QoS 1)
// ============================================================================
void publishStatus(bool online, const String& reason) {
    if (!mqttClient.connected()) return;

    String json = "{";
    json += "\"online\":" + String(online ? "true" : "false") + ",";
    json += "\"resolution\":\"" + String(CAM_RESOLUTION_STR) + "\",";
    json += "\"quality\":" + String(CAM_JPEG_QUALITY) + ",";
    json += "\"led\":" + String(ledState) + ",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"live\":" + String(liveStreaming ? "true" : "false");
    if (reason.length() > 0) {
        json += ",\"reason\":\"" + reason + "\"";
    }
    json += "}";

    mqttClient.publish(statusTopic.c_str(), (const uint8_t*)json.c_str(), json.length(), true);
}

// ============================================================================
// PHOTO CAPTURE & CHUNKED STREAMING PUBLISH
// ============================================================================
void captureAndPublish(const String& rid) {
    if (!mqttClient.connected()) {
        Serial.println("[CAM] Cannot capture: MQTT disconnected.");
        return;
    }

    Serial.printf("[CAM] Starting photo capture for rid='%s'...\n", rid.c_str());

    // 1. Discard stale frame if LED state changed or camera was idle
    unsigned long now = millis();
    if (ledChanged || (now - lastCaptureMs > IDLE_STALE_MS)) {
        camera_fb_t* stale_fb = esp_camera_fb_get();
        if (stale_fb) {
            esp_camera_fb_return(stale_fb);
        }
        ledChanged = false;
    }

    // 2. Capture fresh photo
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[CAM ERROR] Failed to grab frame buffer from camera sensor!");
        return;
    }

    lastCaptureMs = millis();
    size_t totalLen = fb->len;
    String imgTopic = topicPrefix + "img/" + rid;

    Serial.printf("[CAM] Captured JPEG: %u bytes. Publishing to %s...\n", totalLen, imgTopic.c_str());

    // 3. Streaming Publish (Single frame or 16 KB chunks)
    if (totalLen <= CHUNK_SIZE) {
        // Fits in a single MQTT payload
        if (mqttClient.beginPublish(imgTopic.c_str(), totalLen, false)) {
            mqttClient.write(fb->buf, totalLen);
            mqttClient.endPublish();
            Serial.printf("[CAM] Published single-frame image (%u bytes).\n", totalLen);
        } else {
            Serial.println("[CAM ERROR] beginPublish failed for single frame.");
        }
    } else {
        // Split into 16 KB chunks with header: CHUNK|<rid>|<index>|<total>|\n
        size_t totalChunks = (totalLen + CHUNK_SIZE - 1) / CHUNK_SIZE;
        Serial.printf("[CAM] Payload %u bytes exceeds %u bytes. Splitting into %u chunks of 16 KB.\n",
                      totalLen, CHUNK_SIZE, totalChunks);

        for (size_t i = 0; i < totalChunks; i++) {
            size_t offset = i * CHUNK_SIZE;
            size_t sliceLen = (offset + CHUNK_SIZE > totalLen) ? (totalLen - offset) : CHUNK_SIZE;

            String header = "CHUNK|" + rid + "|" + String(i) + "|" + String(totalChunks) + "|\n";
            size_t headerLen = header.length();
            size_t chunkPayloadLen = headerLen + sliceLen;

            if (mqttClient.beginPublish(imgTopic.c_str(), chunkPayloadLen, false)) {
                mqttClient.write((const uint8_t*)header.c_str(), headerLen);
                mqttClient.write(fb->buf + offset, sliceLen);
                mqttClient.endPublish();
                Serial.printf("[CAM] Chunk %u/%u sent (%u bytes).\n", i + 1, totalChunks, chunkPayloadLen);
            } else {
                Serial.printf("[CAM ERROR] beginPublish failed on chunk %u/%u!\n", i + 1, totalChunks);
                break;
            }

            // Yield to avoid watchdog timeout during high chunk transfer
            yield();
        }
    }

#if ENABLE_SUPABASE_UPLOAD
    uploadToSupabase(fb, rid);
#endif

    esp_camera_fb_return(fb);
}

// ============================================================================
// SUPABASE DIRECT UPLOAD (HTTPS POST raw JPEG)
// ============================================================================
void uploadToSupabase(camera_fb_t* fb, const String& rid) {
    if (WiFi.status() != WL_CONNECTED) return;

    (void)rid; // Filename is generated server-side by the Edge Function.
    Serial.println("[SUPABASE] Starting direct cloud upload...");
    
    WiFiClientSecure httpsClient;
    httpsClient.setInsecure(); // Bypass cert verification for simplicity

    if (!httpsClient.connect("dpdvijdxupwcqlyspzzi.supabase.co", 443)) {
        Serial.println("[SUPABASE ERROR] Connection failed!");
        return;
    }

    // The Edge Function expects a RAW JPEG body (not multipart/form-data)
    // and authenticates via the x-camera-token header.
    httpsClient.print("POST /functions/v1/upload-plant-image HTTP/1.1\r\n");
    httpsClient.print("Host: dpdvijdxupwcqlyspzzi.supabase.co\r\n");
    httpsClient.print("x-camera-token: " + String(CAMERA_UPLOAD_TOKEN) + "\r\n");
    httpsClient.print("Content-Type: image/jpeg\r\n");
    httpsClient.print("Content-Length: " + String(fb->len) + "\r\n");
    httpsClient.print("Connection: close\r\n\r\n");

    // Stream the raw JPEG bytes in small slices to avoid buffering issues
    size_t offset = 0;
    while (offset < fb->len) {
        size_t toWrite = (fb->len - offset > 2048) ? 2048 : (fb->len - offset);
        httpsClient.write(fb->buf + offset, toWrite);
        offset += toWrite;
        yield();
    }

    // Read the status line so upload failures are visible on the serial monitor
    unsigned long timeout = millis();
    bool statusLogged = false;
    while (httpsClient.connected() && millis() - timeout < 3000) {
        if (httpsClient.available()) {
            String line = httpsClient.readStringUntil('\n');
            if (!statusLogged && line.startsWith("HTTP/1.")) {
                statusLogged = true;
                if (line.indexOf(" 200") > 0) {
                    Serial.println("[SUPABASE] Upload successful (HTTP 200).");
                } else {
                    Serial.printf("[SUPABASE ERROR] Server replied: %s\n", line.c_str());
                }
            }
            if (line.length() == 0) break;
        }
        yield();
    }
    httpsClient.stop();
}

// ============================================================================
// AUTONOMOUS SUPABASE CAPTURE (MQTT-independent image path)
// Captures a frame and pushes it straight to Supabase on a timer, so the
// website receives images even when the MQTT link is down.
// ============================================================================
void captureAndUploadSupabase() {
    if (WiFi.status() != WL_CONNECTED) return;

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        Serial.println("[SUPABASE ERROR] Frame capture failed.");
        return;
    }

    String rid = "auto_" + String(millis());
    uploadToSupabase(fb, rid);
    esp_camera_fb_return(fb);
}

// ============================================================================
// LOW-FRAMERATE LIVE STREAM FRAME PUBLISHER
// ============================================================================
void publishLiveFrame() {
    if (!mqttClient.connected()) return;

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) return;

    // Publish directly to cam/live (QoS 0, not retained)
    if (mqttClient.beginPublish(liveTopic.c_str(), fb->len, false)) {
        mqttClient.write(fb->buf, fb->len);
        mqttClient.endPublish();
    }
    esp_camera_fb_return(fb);
}

// ============================================================================
// COMMAND PARSER (Subscribed to agrirover/{ROVER_ID}/cam/cmd)
// ============================================================================
void handleCamCommand(const String& payload) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.printf("[CAM CMD] JSON parse error: %s | Payload: %s\n", err.c_str(), payload.c_str());
        return;
    }

    const char* cmd = doc["cmd"] | doc["c"] | "";

    // 1. Photo Capture
    if (strcmp(cmd, "capture") == 0) {
        const char* rid = doc["rid"] | "";
        String reqId = (strlen(rid) > 0) ? String(rid) : ("req_" + String(millis()));
        captureAndPublish(reqId);
        return;
    }

    // 2. Flash LED Toggle
    if (strcmp(cmd, "led") == 0) {
        bool on = doc["on"] | false;
        ledState = on ? 1 : 0;
        digitalWrite(FLASH_LED_PIN, on ? HIGH : LOW);
        ledChanged = true;
        Serial.printf("[CAM] Flash LED set to %s\n", on ? "ON" : "OFF");
        publishStatus(true, "led_change");
        return;
    }

    // 3. Live Streaming Control
    if (strcmp(cmd, "live") == 0) {
        bool on = doc["on"] | false;
        int fps = doc["fps"] | 1;
        liveFps = constrain(fps, 1, 3); // Clamped between 1 and 3 fps

        if (on) {
            liveStreaming = true;
            liveStartMs = millis();
            lastLivePublishMs = 0;
            Serial.printf("[CAM] Live stream started at %d FPS (30s auto-shutoff).\n", liveFps);
        } else {
            liveStreaming = false;
            Serial.println("[CAM] Live stream stopped.");
        }
        publishStatus(true, "live_change");
        return;
    }

    Serial.printf("[CAM CMD] Unrecognized command: %s\n", cmd);
}

void onMqttMessage(char* topic, uint8_t* payload, unsigned int length) {
    if (length == 0) return;

    char* buf = (char*)malloc(length + 1);
    if (!buf) return;
    memcpy(buf, payload, length);
    buf[length] = '\0';

    String msg = String(buf);
    free(buf);

    handleCamCommand(msg);
}

// ============================================================================
// NON-BLOCKING WI-FI RECONNECT
// ============================================================================
void maintainWifi() {
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
        }

        unsigned long now = millis();
        if (now - lastWifiAttemptMs >= wifiBackoffMs) {
            lastWifiAttemptMs = now;
            Serial.printf("[WIFI] Attempting reconnect to SSID '%s' (backoff=%lu ms)...\n", WIFI_SSID, wifiBackoffMs);
            WiFi.disconnect();
            WiFi.begin(WIFI_SSID, WIFI_PASS);
            wifiBackoffMs = (wifiBackoffMs * 2 > 15000) ? 15000 : wifiBackoffMs * 2;
        }
    }
}

// ============================================================================
// NON-BLOCKING MQTT RECONNECT (TLS Port 8883, user 'cam', LWT cam/status)
// ============================================================================
void maintainMqtt() {
    if (WiFi.status() != WL_CONNECTED) {
        wasMqttConnected = false;
        return;
    }

    if (mqttClient.connected()) {
        if (!wasMqttConnected) {
            wasMqttConnected = true;
            mqttBackoffMs = 2000;
            Serial.println("[MQTT] Connected to EMQX Cloud Broker!");
            Serial.printf("[MQTT] Subscribing to cam command topic: %s\n", cmdTopic.c_str());
            mqttClient.subscribe(cmdTopic.c_str(), 0);

            // Publish retained online status with LWT configured
            publishStatus(true, "boot");
        }
        return;
    }

    // Disconnected
    if (wasMqttConnected) {
        wasMqttConnected = false;
        liveStreaming = false; // Stop streaming on disconnect
        Serial.println("[MQTT] Camera node disconnected from broker!");
    }

    unsigned long now = millis();
    if (now - lastMqttAttemptMs >= mqttBackoffMs) {
        lastMqttAttemptMs = now;

        uint64_t mac = ESP.getEfuseMac();
        String clientId = "agrirover_cam_" + String(ROVER_ID) + "_" + String((uint32_t)mac, HEX);

        String lwtPayload = "{\"online\":false,\"reason\":\"lwt\"}";

        Serial.printf("[MQTT] Connecting to %s:%d as user '%s' (clientId='%s')...\n",
                      MQTT_BROKER, MQTT_PORT, MQTT_USER, clientId.c_str());

        // Connect with Last Will on cam/status (retained=true, qos=1, cleanSession=true)
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
            wasMqttConnected = true;
            mqttBackoffMs = 2000;
            Serial.println("[MQTT] Broker connection established!");
            Serial.printf("[MQTT] Subscribing to: %s\n", cmdTopic.c_str());
            mqttClient.subscribe(cmdTopic.c_str(), 0);

            publishStatus(true, "boot");
        } else {
            Serial.printf("[MQTT] Connect failed (rc=%d, wifiRSSI=%d dBm). Retrying in %lu ms\n",
                          mqttClient.state(), WiFi.RSSI(), mqttBackoffMs);
            mqttBackoffMs = (mqttBackoffMs * 2 > 16000) ? 16000 : mqttBackoffMs * 2;
        }
    }
}

// ============================================================================
// OPTIONAL HTTP DEBUG ROUTES (/status and /capture only, /stream removed)
// ============================================================================
#if ENABLE_HTTP_DEBUG
void setupDebugHttp() {
    debugServer.on("/status", HTTP_GET, []() {
        debugServer.sendHeader("Access-Control-Allow-Origin", "*");
        String json = "{";
        json += "\"resolution\":\"" + String(CAM_RESOLUTION_STR) + "\",";
        json += "\"quality\":" + String(CAM_JPEG_QUALITY) + ",";
        json += "\"led\":" + String(ledState) + ",";
        json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
        json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
        json += "\"mqtt_connected\":" + String(mqttClient.connected() ? "true" : "false");
        json += "}";
        debugServer.send(200, "application/json", json);
    });

    debugServer.on("/capture", HTTP_GET, []() {
        debugServer.sendHeader("Access-Control-Allow-Origin", "*");
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) {
            debugServer.send(500, "text/plain", "Capture failed");
            return;
        }
        debugServer.setContentLength(fb->len);
        debugServer.send(200, "image/jpeg");
        WiFiClient client = debugServer.client();
        client.write(fb->buf, fb->len);
        esp_camera_fb_return(fb);
    });

    debugServer.begin();
    Serial.println("[DEBUG HTTP] Endpoints active: /status and /capture (/stream removed)");
}
#endif

// ============================================================================
// SETUP
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n========================================================");
    Serial.println("   AgriRover ESP32-CAM Node - MQTT Vision & Telemetry   ");
    Serial.println("========================================================");

    // 1. Configure flash LED
    pinMode(FLASH_LED_PIN, OUTPUT);
    digitalWrite(FLASH_LED_PIN, LOW);

    // 2. Initialize Camera hardware
    if (!initCamera()) {
        Serial.println("[FATAL] Camera hardware initialization failed! Halting.");
        while (true) {
            delay(1000);
        }
    }
    Serial.println("[BOOT] OV2640 camera sensor initialized successfully.");

    // 3. Configure Wi-Fi & MQTT
    setupTopics();
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);

    wifiClient.setInsecure(); // Bypass TLS certificate chain verification

    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setKeepAlive(5);       // 5 seconds keepalive
    mqttClient.setBufferSize(1024);   // Buffer for status/cmd JSON
    mqttClient.setCallback(s_mqttCallbackTrampoline);

    // Start initial non-blocking Wi-Fi connect
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    lastWifiAttemptMs = millis();

    // Start the autonomous Supabase upload timer
    lastSupabaseUploadMs = millis();

#if ENABLE_HTTP_DEBUG
    setupDebugHttp();
#endif

    Serial.println("[BOOT] ESP32-CAM initialized. Awaiting MQTT connection...");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
    // 1. Maintain Wi-Fi and MQTT connectivity non-blockingly
    maintainWifi();
    maintainMqtt();

    // 2. Process MQTT incoming messages and keepalive pings
    if (mqttClient.connected()) {
        mqttClient.loop();
    }

    // 3. Live stream publisher (with 30 s auto-timeout)
    if (liveStreaming) {
        unsigned long now = millis();
        if (now - liveStartMs > 30000) {
            // 30 seconds elapsed without renewal -> auto-stop
            liveStreaming = false;
            Serial.println("[CAM LIVE] 30-second live view timer expired. Stream stopped.");
            publishStatus(true, "live_timeout");
        } else {
            unsigned long intervalMs = 1000 / liveFps;
            if (now - lastLivePublishMs >= intervalMs) {
                lastLivePublishMs = now;
                publishLiveFrame();
            }
        }
    }

#if ENABLE_HTTP_DEBUG
    debugServer.handleClient();
#endif

    // 4. Autonomous Supabase upload (MQTT-independent image path)
#if ENABLE_SUPABASE_UPLOAD && ENABLE_SUPABASE_AUTO_UPLOAD
    if (millis() - lastSupabaseUploadMs >= SUPABASE_UPLOAD_INTERVAL_MS) {
        lastSupabaseUploadMs = millis();
        captureAndUploadSupabase();
    }
#endif

    yield();
}
