#include "pumps.h"
#include "config_store.h"

PumpManager& PumpManager::instance() {
    static PumpManager inst;
    return inst;
}

void PumpManager::init() {
    pinMode(PIN_RELAY_WATER, OUTPUT);
    pinMode(PIN_RELAY_TREAT, OUTPUT);

    stopAll();

    Serial.println("[PUMPS] Dual pump relay manager initialized on GPIO 16 (water) and 17 (treatment).");
}

String PumpManager::getActivePumpString() const {
    switch (activePump) {
        case PumpId::WATER: return "water";
        case PumpId::TREATMENT: return "treat";
        default: return "";
    }
}

void PumpManager::setRelayHardware(PumpId id, bool turnOn) {
    bool activeHigh = ConfigStore::instance().getRelayActiveHigh();
    uint8_t onState = activeHigh ? HIGH : LOW;
    uint8_t offState = activeHigh ? LOW : HIGH;

    if (id == PumpId::WATER) {
        digitalWrite(PIN_RELAY_WATER, turnOn ? onState : offState);
    } else if (id == PumpId::TREATMENT) {
        digitalWrite(PIN_RELAY_TREAT, turnOn ? onState : offState);
    }
}

void PumpManager::stopAll() {
    setRelayHardware(PumpId::WATER, false);
    setRelayHardware(PumpId::TREATMENT, false);

    if (activePump != PumpId::NONE) {
        // Track elapsed run time before stopping
        unsigned long elapsed = millis() - runStartMs;
        if (elapsed > runDurationMs) elapsed = runDurationMs;

        if (activePump == PumpId::WATER) {
            ConfigStore::instance().addWaterRunMs(elapsed);
        } else if (activePump == PumpId::TREATMENT) {
            ConfigStore::instance().addTreatRunMs(elapsed);
        }
    }

    activePump = PumpId::NONE;
    runStartMs = 0;
    runDurationMs = 0;
}

bool PumpManager::startPump(PumpId id, unsigned long requestedMs) {
    if (id == PumpId::NONE) return false;

    // Hard maximum run time cap in firmware that commands cannot override
    uint32_t maxCap = ConfigStore::instance().getPumpMaxCapMs();
    unsigned long cappedMs = (requestedMs < maxCap) ? requestedMs : maxCap;

    // Stop any running pump first
    stopAll();

    activePump = id;
    runStartMs = millis();
    runDurationMs = cappedMs;

    setRelayHardware(id, true);
    Serial.printf("[PUMPS] Pump %s started for %lu ms (requested: %lu ms, cap: %u ms)\n",
                  getActivePumpString().c_str(), cappedMs, requestedMs, maxCap);
    return true;
}

void PumpManager::update() {
    if (activePump == PumpId::NONE) return;

    unsigned long now = millis();
    if (now - runStartMs >= runDurationMs) {
        String finishedId = getActivePumpString();

        // Turn off relay
        setRelayHardware(activePump, false);

        // Track run time in NVS
        if (activePump == PumpId::WATER) {
            ConfigStore::instance().addWaterRunMs(runDurationMs);
        } else if (activePump == PumpId::TREATMENT) {
            ConfigStore::instance().addTreatRunMs(runDurationMs);
        }

        activePump = PumpId::NONE;
        runStartMs = 0;
        runDurationMs = 0;

        Serial.printf("[PUMPS] Pump %s completed.\n", finishedId.c_str());
        if (doneCb) {
            doneCb(finishedId);
        }
    }
}
