#include "safety_controller.h"
#include "pin_map.h"
#include "config_store.h"
#include "motors.h"
#include "encoders.h"
#include "imu.h"
#include "sensors.h"
#include "probe_controller.h"
#include "pumps.h"
#include "motion_controller.h"

SafetyController& SafetyController::instance() {
    static SafetyController inst;
    return inst;
}

void SafetyController::init(SafetyEventCb onEvent, SafetyFaultCb onFault, SafetyAlertCb onAlert) {
    sendEventCb = onEvent;
    sendFaultCb = onFault;
    sendAlertCb = onAlert;

    pinMode(PIN_ESTOP_SENSE, INPUT_PULLUP);

    currentMode = RoverMode::IDLE;
    currentFaultCode = "";
    eStopLatched = false;
    lowBatCutoffActive = false;
    lowBatWarningActive = false;
    lastBatAlertMs = 0;
    lastSlipCheckMs = millis();
    lastObstacleEventMs = 0;
    lastSafetyCheckMs = millis();

    emergencyStopAll("System Boot");
    Serial.println("[SAFETY] SafetyController initialized in IDLE state.");
}

void SafetyController::transitionMode(RoverMode newMode, const String& reason) {
    if (newMode != currentMode) {
        RoverMode oldMode = currentMode;
        currentMode = newMode;
        Serial.printf("[STATE] Transition: %s -> %s (Reason: %s)\n",
                      modeToString(oldMode), modeToString(newMode), reason.c_str());

        if (sendEventCb != nullptr) {
            sendEventCb("mode", "\"m\":\"" + String(modeToString(newMode)) + "\"");
        }
    }
}

bool SafetyController::requestModeChange(RoverMode targetMode, String& outReason) {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active: use estop_reset";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (targetMode == RoverMode::ESTOP || targetMode == RoverMode::FAULT) {
        outReason = "cannot manually set estop or fault";
        return false;
    }

    transitionMode(targetMode, "User command");
    return true;
}

void SafetyController::forceMode(RoverMode newMode, const String& reason) {
    transitionMode(newMode, reason);
}

void SafetyController::emergencyStopAll(const String& reason) {
    MotorDriver::instance().emergencyStop();
    MotionController::instance().cancel();
    PumpManager::instance().stopAll();
    Serial.printf("[SAFETY] emergencyStopAll invoked: %s\n", reason.c_str());
}

void SafetyController::onBleDisconnected() {
    emergencyStopAll("BLE Disconnected");
    transitionMode(RoverMode::PAUSED, "BLE Disconnected");
}

void SafetyController::onHeartbeatTimeout() {
    bool wasMoving = MotorDriver::instance().isMoving() ||
                     MotionController::instance().isBusy() ||
                     PumpManager::instance().isRunning();

    emergencyStopAll("Heartbeat Timeout");
    transitionMode(RoverMode::PAUSED, "Heartbeat Timeout");

    if (wasMoving && sendFaultCb != nullptr) {
        sendFaultCb("HB_LOST");
    }
}

void SafetyController::triggerFault(const String& faultCode, const String& reason) {
    currentFaultCode = faultCode;
    emergencyStopAll(reason.length() > 0 ? reason : faultCode);
    transitionMode(RoverMode::FAULT, faultCode);

    if (sendFaultCb != nullptr) {
        sendFaultCb(faultCode);
    }
}

bool SafetyController::handleEStopReset(String& outReason) {
    // 1. Check physical button release
    if (digitalRead(PIN_ESTOP_SENSE) == LOW) {
        outReason = "button still pressed";
        return false;
    }

    // 2. Check battery cutoff condition (Bypassed: battery ADC is reported only, not used for automatic lockout yet)
    /*
    float bat = SensorManager::instance().getBatteryVoltage();
    if (bat > 4.0f && bat <= ConfigStore::instance().getBatCutoff()) {
        outReason = "cannot reset: battery below cutoff";
        return false;
    }
    */

    // 3. Check tilt condition
    float tilt = ImuDriver::instance().getTiltDeg();
    if (tilt > ConfigStore::instance().getTiltLimit()) {
        outReason = "cannot reset: tilt exceeds limit";
        return false;
    }

    // Reset latches and return to IDLE
    eStopLatched = false;
    lowBatCutoffActive = false;
    currentFaultCode = "";
    transitionMode(RoverMode::IDLE, "estop_reset");
    return true;
}

void SafetyController::update() {
    // 1. Check physical E-Stop sense pin (Active LOW)
    if (digitalRead(PIN_ESTOP_SENSE) == LOW) {
        if (!eStopLatched || currentMode != RoverMode::ESTOP) {
            eStopLatched = true;
            currentFaultCode = "ESTOP";
            emergencyStopAll("E-Stop Sense Active");
            transitionMode(RoverMode::ESTOP, "E-Stop Pin Low");
            if (sendFaultCb != nullptr) {
                sendFaultCb("ESTOP");
            }
        }
    }

    // Rate-limit remaining safety sensor checks to every 50ms
    unsigned long now = millis();
    if (now - lastSafetyCheckMs < 50) return;
    lastSafetyCheckMs = now;

    // 2. Battery Safety Monitor (Bypassed: battery ADC is reported only, not used for automatic decisions yet)
    /*
    float bat = SensorManager::instance().getBatteryVoltage();
    float cutoff = ConfigStore::instance().getBatCutoff();
    float warn = ConfigStore::instance().getBatWarn();

    if (bat > 4.0f) {
        if (bat <= cutoff) {
            if (!lowBatCutoffActive) {
                lowBatCutoffActive = true;
                triggerFault("LOW_BAT_CUTOFF", "Battery below cutoff: " + String(bat, 2) + "V");
            }
        } else {
            if (lowBatCutoffActive && bat >= (cutoff + 0.4f)) {
                lowBatCutoffActive = false;
            }

            if (bat <= warn) {
                if (!lowBatWarningActive || (now - lastBatAlertMs > 10000)) {
                    lowBatWarningActive = true;
                    lastBatAlertMs = now;
                    if (sendAlertCb != nullptr) {
                        sendAlertCb("BAT_LOW", "Battery below warning level: " + String(bat, 2) + "V");
                    }
                }
            } else if (bat >= (warn + 0.3f)) {
                lowBatWarningActive = false;
            }
        }
    }
    */

    // 3. Tilt Safety Monitor
    float tilt = ImuDriver::instance().getTiltDeg();
    float tiltLim = ConfigStore::instance().getTiltLimit();
    if (tilt > tiltLim) {
        if (currentMode != RoverMode::FAULT) {
            triggerFault("TILT", "Excessive tilt: " + String(tilt, 1) + " deg");
        }
    }

    // 4. Obstacle Safety Monitor (Bypassed: ultrasonic is reported only, not used for automatic decisions yet)
    /*
    bool movingForward = (MotorDriver::instance().getCurrentLeft() > 0 && MotorDriver::instance().getCurrentRight() > 0) ||
                         MotionController::instance().isMovingForward();

    if (movingForward) {
        int dist = SensorManager::instance().getDistanceCm();
        int obsDist = ConfigStore::instance().getObstacleDistCm();
        if (dist > 0 && dist <= obsDist) {
            emergencyStopAll("Obstacle closer than " + String(obsDist) + " cm");
            transitionMode(RoverMode::PAUSED, "Obstacle");

            if (now - lastObstacleEventMs > 1000) {
                lastObstacleEventMs = now;
                if (sendEventCb != nullptr) sendEventCb("obstacle", "\"dist\":" + String(dist));
                if (sendFaultCb != nullptr) sendFaultCb("OBSTACLE");
            }
        }
    }
    */

    // 5. Wheel Slip Monitor (Encoders moving while IMU gyro/heading remains stationary)
    bool roverDriving = MotorDriver::instance().isMoving() || MotionController::instance().isBusy();
    if (now - lastSlipCheckMs >= 200) {
        unsigned long dtMs = now - lastSlipCheckMs;
        lastSlipCheckMs = now;

        long curEncL = EncoderDriver::instance().getTicksL();
        long curEncR = EncoderDriver::instance().getTicksR();
        long dEnc = abs(curEncL - lastSlipEncL) + abs(curEncR - lastSlipEncR);
        lastSlipEncL = curEncL;
        lastSlipEncR = curEncR;

        float curHeading = ImuDriver::instance().getHeadingDeg();
        float dHeading = fabsf(curHeading - lastSlipHeading);
        if (dHeading > 180.0f) dHeading = 360.0f - dHeading;
        lastSlipHeading = curHeading;

        float gyroRate = fabsf(ImuDriver::instance().getGyroRateZ());

        if (roverDriving && dEnc > 15) {
            if (gyroRate < 0.8f && dHeading < 0.4f) {
                slipDurationMs += dtMs;
                if (slipDurationMs >= 800) {
                    triggerFault("SLIP", "Wheel slip: encoders turning with no IMU motion");
                    slipDurationMs = 0;
                }
            } else {
                slipDurationMs = 0;
            }
        } else {
            slipDurationMs = 0;
        }
    }
}

bool SafetyController::validateDrive(String& outReason) const {
    if (currentMode == RoverMode::MISSION) {
        outReason = "auto mode";
        return false;
    }
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    if (!ProbeController::instance().isUp()) {
        outReason = "probe not up";
        return false;
    }
    return true;
}

bool SafetyController::validateMove(String& outReason) const {
    if (!ProbeController::instance().isUp()) {
        outReason = "probe not up";
        return false;
    }
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    return true;
}

bool SafetyController::validateTurn(String& outReason) const {
    if (!ProbeController::instance().isUp()) {
        outReason = "probe not up";
        return false;
    }
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    return true;
}

bool SafetyController::validatePump(String& outReason) const {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    return true;
}

bool SafetyController::validateProbe(String& outReason) const {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    return true;
}

bool SafetyController::validateNozzle(String& outReason) const {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    return true;
}

bool SafetyController::validateCamTilt(String& outReason) const {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    return true;
}

bool SafetyController::validateSelfTest(String& outReason) const {
    if (currentMode == RoverMode::ESTOP || eStopLatched) {
        outReason = "estop active";
        return false;
    }
    if (currentMode == RoverMode::FAULT) {
        outReason = "fault active: " + currentFaultCode;
        return false;
    }
    if (lowBatCutoffActive) {
        outReason = "low battery cutoff";
        return false;
    }
    if (currentMode == RoverMode::PAUSED) {
        outReason = "rover paused";
        return false;
    }
    return true;
}
