#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <map>

class ConfigStore {
public:
    static ConfigStore& instance();

    void init();

    // Specific persistent parameters
    float getMmPerPulse() const;
    void setMmPerPulse(float val);

    int getMaxSpeed() const;
    void setMaxSpeed(int val);

    int getRampStep() const;
    void setRampStep(int val);

    float getBatCal() const;
    void setBatCal(float val);

    bool getRelayActiveHigh() const;
    void setRelayActiveHigh(bool activeHigh);

    uint32_t getPumpMaxCapMs() const;
    void setPumpMaxCapMs(uint32_t val);

    uint32_t getTotalWaterRunMs() const;
    void addWaterRunMs(uint32_t ms);

    uint32_t getTotalTreatRunMs() const;
    void addTreatRunMs(uint32_t ms);

    // Generic key/value interface for BLE 'cfg' command
    bool setGeneric(const String& key, const String& val);
    String getGeneric(const String& key, const String& defaultVal = "") const;

private:
    ConfigStore() = default;
    mutable Preferences prefs;

    float mmPerPulse = 0.5f;
    int maxSpeed = 100;
    int rampStep = 5;
    float batCal = 1.0f;
    bool relayActiveHigh = true;
    uint32_t pumpMaxCapMs = 5000;
    uint32_t totalWaterMs = 0;
    uint32_t totalTreatMs = 0;
};
