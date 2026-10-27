#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "esp_camera.h"
#include "camera_pins.h"
#include "secrets.h"

// ============================================================================
// CAMERA RESOLUTION & QUALITY CONFIGURATION
// CRITICAL: Never change CAM_FRAME_SIZE or CAM_JPEG_QUALITY after collecting
// dataset photos! Changing resolution or compression characteristics alters
// the feature distribution and degrades ML classifier accuracy.
// ============================================================================
const framesize_t CAM_FRAME_SIZE = FRAMESIZE_SVGA; // Default 800x600
const int CAM_JPEG_QUALITY = 10;                  // 10-63 (lower = higher quality)
const char* const CAM_RESOLUTION_STR = "800x600";

// Idle threshold in milliseconds before discarding stale frame buffer
const unsigned long IDLE_STALE_MS = 2000;

// Web server on standard port 80
WebServer server(80);

// Global state variables
volatile bool isStreaming = false;
volatile int ledState = 0;
volatile bool ledChanged = false;
unsigned long lastCaptureMs = 0;
unsigned long lastWiFiCheckMs = 0;

void setCorsHeaders() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "*");
}

void handleOptions() {
    setCorsHeaders();
    server.send(204);
}

void handleRoot() {
    setCorsHeaders();
    String html = "<html><head><title>Agri-Rover ESP32-CAM</title></head><body>"
                  "<h2>Agri-Rover Camera Node</h2>"
                  "<ul>"
                  "<li><a href='/capture'>/capture</a> - Single JPEG</li>"
                  "<li><a href='/stream'>/stream</a> - MJPEG Live Stream</li>"
                  "<li><a href='/status'>/status</a> - JSON Status</li>"
                  "<li><a href='/led?on=1'>/led?on=1</a> | <a href='/led?on=0'>/led?on=0</a> - Illumination LED</li>"
                  "</ul></body></html>";
    server.send(200, "text/html", html);
}

void handleLed() {
    setCorsHeaders();
    if (server.hasArg("on")) {
        String val = server.arg("on");
        if (val == "1" || val == "true") {
            ledState = 1;
            digitalWrite(FLASH_LED_PIN, HIGH);
            ledChanged = true;
        } else if (val == "0" || val == "false") {
            ledState = 0;
            digitalWrite(FLASH_LED_PIN, LOW);
            ledChanged = true;
        }
    }

    String json = "{\"ok\":true,\"led\":" + String(ledState) + "}";
    server.send(200, "application/json", json);
}

void handleStatus() {
    setCorsHeaders();
    String json = "{";
    json += "\"resolution\":\"" + String(CAM_RESOLUTION_STR) + "\",";
    json += "\"quality\":" + String(CAM_JPEG_QUALITY) + ",";
    json += "\"led\":" + String(ledState) + ",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
    json += "\"streaming\":" + String(isStreaming ? "true" : "false");
    json += "}";
    server.send(200, "application/json", json);
}

void handleCapture() {
    setCorsHeaders();

    // Discard stale frame if LED changed or camera was idle
    unsigned long now = millis();
    if (ledChanged || (now - lastCaptureMs > IDLE_STALE_MS)) {
        camera_fb_t* stale_fb = esp_camera_fb_get();
        if (stale_fb) {
            esp_camera_fb_return(stale_fb);
        }
        ledChanged = false;
    }

    // Capture the fresh frame
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        server.send(500, "text/plain", "Camera capture failed");
        return;
    }

    server.sendHeader("Content-Disposition", "inline; filename=capture.jpg");
    server.setContentLength(fb->len);
    server.send(200, "image/jpeg");

    WiFiClient client = server.client();
    client.write(fb->buf, fb->len);
    esp_camera_fb_return(fb);

    lastCaptureMs = millis();
}

void handleStream() {
    // Only one stream client permitted at a time
    if (isStreaming) {
        setCorsHeaders();
        server.send(503, "text/plain", "Stream busy: only one stream client permitted at a time");
        return;
    }

    isStreaming = true;
    WiFiClient client = server.client();

    client.print("HTTP/1.1 200 OK\r\n"
                 "Access-Control-Allow-Origin: *\r\n"
                 "Content-Type: multipart/x-mixed-replace; boundary=--frame\r\n"
                 "Cache-Control: no-cache, no-store, must-revalidate\r\n"
                 "Pragma: no-cache\r\n"
                 "Connection: close\r\n\r\n");

    while (client.connected()) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) {
            break;
        }

        size_t hlen = client.printf("--frame\r\n"
                                    "Content-Type: image/jpeg\r\n"
                                    "Content-Length: %u\r\n\r\n", fb->len);
        if (hlen == 0) {
            esp_camera_fb_return(fb);
            break;
        }

        size_t written = client.write(fb->buf, fb->len);
        client.print("\r\n");
        esp_camera_fb_return(fb);

        if (written != fb->len) {
            // Client closed connection or buffer error
            break;
        }

        // Allow system tasks to run
        yield();
    }

    client.stop();
    isStreaming = false;
    lastCaptureMs = millis();
}

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

void connectWiFi() {
    Serial.printf("\nConnecting to Wi-Fi SSID: %s\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    unsigned long startMs = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startMs < 20000) {
        delay(500);
        Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n==================================================");
        Serial.println("  AGRI-ROVER ESP32-CAM READY");
        Serial.print("  IP Address: http://");
        Serial.println(WiFi.localIP());
        Serial.println("  Endpoints:");
        Serial.print("    - Capture: http://"); Serial.print(WiFi.localIP()); Serial.println("/capture");
        Serial.print("    - Stream:  http://"); Serial.print(WiFi.localIP()); Serial.println("/stream");
        Serial.print("    - Status:  http://"); Serial.print(WiFi.localIP()); Serial.println("/status");
        Serial.print("    - LED:     http://"); Serial.print(WiFi.localIP()); Serial.println("/led?on=1");
        Serial.println("==================================================");
    } else {
        Serial.println("\n[WARN] Wi-Fi connection timeout. Auto-reconnect active in background.");
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n[BOOT] Agri-Rover ESP32-CAM Initializing...");

    // Configure flash LED
    pinMode(FLASH_LED_PIN, OUTPUT);
    digitalWrite(FLASH_LED_PIN, LOW);

    // Initialize Camera
    if (!initCamera()) {
        Serial.println("[FATAL] Camera initialization failed! Halting.");
        while (true) {
            delay(1000);
        }
    }
    Serial.println("[BOOT] Camera initialized successfully.");

    // Connect to Wi-Fi
    connectWiFi();

    // Register HTTP routes
    server.on("/", HTTP_GET, handleRoot);
    server.on("/capture", HTTP_GET, handleCapture);
    server.on("/stream", HTTP_GET, handleStream);
    server.on("/status", HTTP_GET, handleStatus);
    server.on("/led", HTTP_GET, handleLed);

    // OPTIONS pre-flight handling for cross-origin requests
    server.on("/capture", HTTP_OPTIONS, handleOptions);
    server.on("/stream", HTTP_OPTIONS, handleOptions);
    server.on("/status", HTTP_OPTIONS, handleOptions);
    server.on("/led", HTTP_OPTIONS, handleOptions);

    server.begin();
    Serial.println("[BOOT] HTTP Server started.");
}

void loop() {
    server.handleClient();

    // Periodic Wi-Fi auto-reconnect check (every 5 seconds)
    unsigned long now = millis();
    if (now - lastWiFiCheckMs > 5000) {
        lastWiFiCheckMs = now;
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WIFI] Reconnecting...");
            WiFi.reconnect();
        }
    }
}
