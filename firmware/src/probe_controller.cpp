#include "probe_controller.h"
#include "servos_pca9685.h"
#include "sensors.h"

ProbeController& ProbeController::instance() {
    static ProbeController inst;
    return inst;
}

void ProbeController::init() {
    // Internal pull-ups (switches ground the pin when closed)
    pinMode(PIN_LIMIT_PROBE_UP, INPUT_PULLUP);
    pinMode(PIN_LIMIT_PROBE_DOWN, INPUT_PULLUP);

    // Initial position: Retracted UP
    ServosPCA9685::instance().setTargetAngle(ServoChannel::PROBE, 0.0f);
    state = ProbeState::IDLE_UP;
    isSequenceRead = false;

    Serial.println("[PROBE] Probe controller initialized with limit switches on GPIO 13 and 14.");
}

bool ProbeController::isUpSwitchTriggered() const {
    // Active LOW when limit switch is pressed
    return digitalRead(PIN_LIMIT_PROBE_UP) == LOW;
}

bool ProbeController::isDownSwitchTriggered() const {
    // Active LOW when limit switch is pressed
    return digitalRead(PIN_LIMIT_PROBE_DOWN) == LOW;
}

String ProbeController::getStateString() const {
    switch (state) {
        case ProbeState::IDLE_UP: return "up";
        case ProbeState::IDLE_DOWN: return "down";
        case ProbeState::MOVING_DOWN:
        case ProbeState::MOVING_UP:
        case ProbeState::SEQUENCE_SETTLE:
        case ProbeState::SEQUENCE_READING: return "moving";
        case ProbeState::STUCK_FAULT: return "stuck";
        default: return "up";
    }
}

bool ProbeController::commandDown() {
    if (state == ProbeState::MOVING_DOWN || state == ProbeState::MOVING_UP) {
        return false;
    }
    isSequenceRead = false;
    state = ProbeState::MOVING_DOWN;
    stateStartMs = millis();
    ServosPCA9685::instance().setTargetAngle(ServoChannel::PROBE, 180.0f);
    Serial.println("[PROBE] Moving DOWN towards limit switch...");
    return true;
}

bool ProbeController::commandUp() {
    if (state == ProbeState::MOVING_DOWN || state == ProbeState::MOVING_UP) {
        return false;
    }
    isSequenceRead = false;
    state = ProbeState::MOVING_UP;
    stateStartMs = millis();
    ServosPCA9685::instance().setTargetAngle(ServoChannel::PROBE, 0.0f);
    Serial.println("[PROBE] Moving UP towards limit switch...");
    return true;
}

bool ProbeController::commandRead() {
    if (state == ProbeState::MOVING_DOWN || state == ProbeState::MOVING_UP) {
        return false;
    }
    isSequenceRead = true;
    state = ProbeState::MOVING_DOWN;
    stateStartMs = millis();
    ServosPCA9685::instance().setTargetAngle(ServoChannel::PROBE, 180.0f);
    Serial.println("[PROBE] Starting automated READ sequence: Down -> Settle -> Read -> Up");
    return true;
}

void ProbeController::update() {
    unsigned long now = millis();

    switch (state) {
        case ProbeState::MOVING_DOWN: {
            // Check if down limit switch is hit
            if (isDownSwitchTriggered()) {
                Serial.println("[PROBE] Down limit switch triggered.");
                if (isSequenceRead) {
                    state = ProbeState::SEQUENCE_SETTLE;
                    stateStartMs = now;
                } else {
                    state = ProbeState::IDLE_DOWN;
                    if (doneCb) doneCb("down", 0);
                }
            } else if (now - stateStartMs > PROBE_TIMEOUT_MS) {
                // Timeout exceeded without hitting limit switch -> PROBE_STUCK!
                Serial.println("[PROBE] ERROR: Down limit switch timeout! Raising PROBE_STUCK fault.");
                state = ProbeState::STUCK_FAULT;
                if (faultCb) faultCb("PROBE_STUCK");
            }
            break;
        }

        case ProbeState::SEQUENCE_SETTLE: {
            // Wait 500 ms for probe electrodes to settle in soil substrate
            if (now - stateStartMs >= SETTLE_DURATION_MS) {
                // Sample soil
                lastReadValue = SensorManager::instance().getSoilPercent();
                Serial.printf("[PROBE] Soil reading taken: %d%%. Retracting probe UP...\n", lastReadValue);
                state = ProbeState::MOVING_UP;
                stateStartMs = now;
                ServosPCA9685::instance().setTargetAngle(ServoChannel::PROBE, 0.0f);
            }
            break;
        }

        case ProbeState::MOVING_UP: {
            // Check if up limit switch is hit
            if (isUpSwitchTriggered()) {
                Serial.println("[PROBE] Up limit switch triggered.");
                state = ProbeState::IDLE_UP;
                if (isSequenceRead) {
                    isSequenceRead = false;
                    if (doneCb) doneCb("read", lastReadValue);
                } else {
                    if (doneCb) doneCb("up", 0);
                }
            } else if (now - stateStartMs > PROBE_TIMEOUT_MS) {
                // Timeout exceeded without hitting limit switch -> PROBE_STUCK!
                Serial.println("[PROBE] ERROR: Up limit switch timeout! Raising PROBE_STUCK fault.");
                state = ProbeState::STUCK_FAULT;
                if (faultCb) faultCb("PROBE_STUCK");
            }
            break;
        }

        default:
            break;
    }
}
