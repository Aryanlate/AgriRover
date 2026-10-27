#pragma once
#include <Arduino.h>
#include "pin_map.h"

enum class PumpId {
    NONE,
    WATER,
    TREATMENT
};

class PumpManager {
public:
    static PumpManager& instance();

    void init();
    void update(); // Non-blocking timer check

    bool startPump(PumpId id, unsigned long requestedMs);
    void stopAll();

    bool isRunning() const { return activePump != PumpId::NONE; }
    PumpId getActivePump() const { return activePump; }
    String getActivePumpString() const;

    typedef void (*PumpDoneCallback)(const String& pumpIdStr);
    void setCallback(PumpDoneCallback onDone) { doneCb = onDone; }

private:
    PumpManager() = default;

    PumpId activePump = PumpId::NONE;
    unsigned long runStartMs = 0;
    unsigned long runDurationMs = 0;

    PumpDoneCallback doneCb = nullptr;

    void setRelayHardware(PumpId id, bool turnOn);
};
