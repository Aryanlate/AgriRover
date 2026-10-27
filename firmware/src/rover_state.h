#pragma once
#include <Arduino.h>
#include <map>

// Operational Modes
enum class RoverMode {
    IDLE,
    MANUAL,
    MISSION
};

inline const char* modeToString(RoverMode mode) {
    switch (mode) {
        case RoverMode::IDLE: return "idle";
        case RoverMode::MANUAL: return "manual";
        case RoverMode::MISSION: return "mission";
        default: return "idle";
    }
}

inline bool stringToMode(const String& str, RoverMode& outMode) {
    if (str.equalsIgnoreCase("idle")) {
        outMode = RoverMode::IDLE;
        return true;
    } else if (str.equalsIgnoreCase("manual")) {
        outMode = RoverMode::MANUAL;
        return true;
    } else if (str.equalsIgnoreCase("mission")) {
        outMode = RoverMode::MISSION;
        return true;
    }
    return false;
}

// Comparator for Arduino String in std::map (strict weak ordering)
struct StringCompare {
    bool operator()(const String& a, const String& b) const {
        return a.compareTo(b) < 0;
    }
};

// Global Rover State
struct RoverState {
    RoverMode mode = RoverMode::IDLE;
    bool isConnected = false;
    uint16_t connId = 0;
    uint16_t currentMtu = 23;

    // Motion & Actuator States
    bool isMoving = false;
    int speedL = 0;
    int speedR = 0;
    String probeState = "up"; // "up" | "down"
    int nozzlePan = 90;
    int nozzleTilt = 90;
    String camPose = "leaf"; // "leaf" | "stem"

    // Timers & Watchdogs
    unsigned long lastMessageMs = 0;
    unsigned long lastTelemetryMs = 0;

    // Safety & Faults
    bool isEStop = false;
    bool isFault = false;
    String faultCode = "";
    bool isLowBat = false;

    // Non-blocking pump execution
    bool pumpActive = false;
    String activePumpId = "";
    unsigned long pumpEndMs = 0;
    static constexpr unsigned long PUMP_MAX_CAP_MS = 5000; // Hard cap in firmware

    // Non-blocking move / turn simulation
    bool moveActive = false;
    int moveMm = 0;
    unsigned long moveEndMs = 0;

    bool turnActive = false;
    int turnDeg = 0;
    unsigned long turnEndMs = 0;

    // Sensor Stubs
    float batteryVoltage = 12.4f;
    int soilMoisture = 42;
    float tempC = 24.5f;
    float humPct = 58.0f;
    float tiltDeg = 1.2f;
    int distanceCm = 85;
    long encL = 0;
    long encR = 0;

    // Configuration storage with strict weak ordering comparator
    std::map<String, String, StringCompare> configs;
};
