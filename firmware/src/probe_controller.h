#pragma once
#include <Arduino.h>
#include "pin_map.h"

enum class ProbeState {
    IDLE_UP,
    IDLE_DOWN,
    MOVING_DOWN,
    MOVING_UP,
    SEQUENCE_SETTLE,
    SEQUENCE_READING,
    STUCK_FAULT
};

class ProbeController {
public:
    static ProbeController& instance();

    void init();
    void update(); // Non-blocking state machine

    bool commandDown();
    bool commandUp();
    bool commandRead();

    bool isUp() const { return state == ProbeState::IDLE_UP; }
    bool isDown() const { return state == ProbeState::IDLE_DOWN; }
    bool isMoving() const { return state == ProbeState::MOVING_DOWN || state == ProbeState::MOVING_UP; }
    String getStateString() const;

    // Callbacks for events/faults
    typedef void (*ProbeDoneCallback)(const String& action, int value);
    typedef void (*ProbeFaultCallback)(const String& faultCode);

    void setCallbacks(ProbeDoneCallback onDone, ProbeFaultCallback onFault) {
        doneCb = onDone;
        faultCb = onFault;
    }

private:
    ProbeController() = default;

    ProbeState state = ProbeState::IDLE_UP;
    bool isSequenceRead = false;
    int lastReadValue = 0;

    unsigned long stateStartMs = 0;
    static constexpr unsigned long PROBE_TIMEOUT_MS = 5000;
    static constexpr unsigned long SETTLE_DURATION_MS = 500;

    ProbeDoneCallback doneCb = nullptr;
    ProbeFaultCallback faultCb = nullptr;

    bool isUpSwitchTriggered() const;
    bool isDownSwitchTriggered() const;
};
