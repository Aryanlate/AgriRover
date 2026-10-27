#pragma once
#include <Arduino.h>
#include "rover_state.h"
#include <functional>

typedef std::function<void(const String&, const String&)> SafetyEventCb;
typedef std::function<void(const String&)> SafetyFaultCb;
typedef std::function<void(const String&, const String&)> SafetyAlertCb;

class SafetyController {
public:
    static SafetyController& instance();

    void init(SafetyEventCb onEvent, SafetyFaultCb onFault, SafetyAlertCb onAlert);

    // State machine inspection and transitions
    RoverMode getMode() const { return currentMode; }
    const char* getModeString() const { return modeToString(currentMode); }

    // User / BLE mode change requests (returns false with reason if refused)
    bool requestModeChange(RoverMode targetMode, String& outReason);

    // Force transition from internal events (safety faults, estop, paused)
    void forceMode(RoverMode newMode, const String& reason = "");

    // Command validation
    bool validateDrive(String& outReason) const;
    bool validateMove(String& outReason) const;
    bool validateTurn(String& outReason) const;
    bool validatePump(String& outReason) const;
    bool validateProbe(String& outReason) const;
    bool validateNozzle(String& outReason) const;
    bool validateCamTilt(String& outReason) const;
    bool validateSelfTest(String& outReason) const;

    // Reset command handling
    bool handleEStopReset(String& outReason);

    // Safety events
    void onBleDisconnected();
    void onHeartbeatTimeout();
    void triggerFault(const String& faultCode, const String& reason = "");

    // Safety checks called in main loop
    void update();

    // Query states
    bool isEStop() const { return eStopLatched; }
    bool isFault() const { return currentMode == RoverMode::FAULT; }
    bool isLowBatteryCutoff() const { return lowBatCutoffActive; }
    const String& getFaultCode() const { return currentFaultCode; }

    // Stop all actuators
    void emergencyStopAll(const String& reason);

private:
    SafetyController() = default;

    RoverMode currentMode = RoverMode::IDLE;
    String currentFaultCode = "";
    bool eStopLatched = false;
    bool lowBatCutoffActive = false;
    bool lowBatWarningActive = false;
    unsigned long lastBatAlertMs = 0;

    // Slip detection tracking
    long lastSlipEncL = 0;
    long lastSlipEncR = 0;
    float lastSlipHeading = 0.0f;
    unsigned long lastSlipCheckMs = 0;
    unsigned long slipDurationMs = 0;

    // Obstacle tracking
    unsigned long lastObstacleEventMs = 0;

    // Safety monitor update timer
    unsigned long lastSafetyCheckMs = 0;

    SafetyEventCb sendEventCb = nullptr;
    SafetyFaultCb sendFaultCb = nullptr;
    SafetyAlertCb sendAlertCb = nullptr;

    void transitionMode(RoverMode newMode, const String& reason);
};
