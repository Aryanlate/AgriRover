#include "config_store.h"

#define PREFS_NAMESPACE "agri_cfg"

ConfigStore& ConfigStore::instance() {
    static ConfigStore inst;
    return inst;
}

void ConfigStore::init() {
    prefs.begin(PREFS_NAMESPACE, false);
    mmPerPulse = prefs.getFloat("mm_pulse", 0.5f);
    maxSpeed = prefs.getInt("max_spd", 100);
    rampStep = prefs.getInt("ramp_stp", 5);
    batCal = prefs.getFloat("bat_cal", 1.0f);
    relayActiveHigh = prefs.getBool("rel_ah", true);
    pumpMaxCapMs = prefs.getUInt("pump_cap", 5000);
    totalWaterMs = prefs.getUInt("tot_wat", 0);
    totalTreatMs = prefs.getUInt("tot_trt", 0);
    prefs.end();

    Serial.printf("[NVS] Loaded: mmPerPulse=%.3f, maxSpeed=%d, rampStep=%d, batCal=%.2f, relayAH=%d\n",
                  mmPerPulse, maxSpeed, rampStep, batCal, relayActiveHigh);
}

float ConfigStore::getMmPerPulse() const {
    return mmPerPulse;
}

void ConfigStore::setMmPerPulse(float val) {
    if (val <= 0.001f) return;
    mmPerPulse = val;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putFloat("mm_pulse", val);
    prefs.end();
}

int ConfigStore::getMaxSpeed() const {
    return maxSpeed;
}

void ConfigStore::setMaxSpeed(int val) {
    maxSpeed = constrain(val, 10, 100);
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt("max_spd", maxSpeed);
    prefs.end();
}

int ConfigStore::getRampStep() const {
    return rampStep;
}

void ConfigStore::setRampStep(int val) {
    rampStep = constrain(val, 1, 50);
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt("ramp_stp", rampStep);
    prefs.end();
}

float ConfigStore::getBatCal() const {
    return batCal;
}

void ConfigStore::setBatCal(float val) {
    if (val <= 0.1f) return;
    batCal = val;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putFloat("bat_cal", val);
    prefs.end();
}

bool ConfigStore::getRelayActiveHigh() const {
    return relayActiveHigh;
}

void ConfigStore::setRelayActiveHigh(bool activeHigh) {
    relayActiveHigh = activeHigh;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putBool("rel_ah", activeHigh);
    prefs.end();
}

uint32_t ConfigStore::getPumpMaxCapMs() const {
    return pumpMaxCapMs;
}

void ConfigStore::setPumpMaxCapMs(uint32_t val) {
    pumpMaxCapMs = constrain(val, 500U, 15000U);
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putUInt("pump_cap", pumpMaxCapMs);
    prefs.end();
}

uint32_t ConfigStore::getTotalWaterRunMs() const {
    return totalWaterMs;
}

void ConfigStore::addWaterRunMs(uint32_t ms) {
    totalWaterMs += ms;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putUInt("tot_wat", totalWaterMs);
    prefs.end();
}

uint32_t ConfigStore::getTotalTreatRunMs() const {
    return totalTreatMs;
}

void ConfigStore::addTreatRunMs(uint32_t ms) {
    totalTreatMs += ms;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putUInt("tot_trt", totalTreatMs);
    prefs.end();
}

bool ConfigStore::setGeneric(const String& key, const String& val) {
    if (key.length() == 0) return false;

    // Check known direct keys first
    if (key.equalsIgnoreCase("mm_per_pulse") || key.equalsIgnoreCase("mm_pulse")) {
        setMmPerPulse(val.toFloat());
        return true;
    }
    if (key.equalsIgnoreCase("max_speed") || key.equalsIgnoreCase("max_spd")) {
        setMaxSpeed(val.toInt());
        return true;
    }
    if (key.equalsIgnoreCase("ramp_step") || key.equalsIgnoreCase("ramp")) {
        setRampStep(val.toInt());
        return true;
    }
    if (key.equalsIgnoreCase("bat_cal")) {
        setBatCal(val.toFloat());
        return true;
    }
    if (key.equalsIgnoreCase("relay_active_high") || key.equalsIgnoreCase("relay_ah")) {
        setRelayActiveHigh(val.equalsIgnoreCase("1") || val.equalsIgnoreCase("true"));
        return true;
    }
    if (key.equalsIgnoreCase("pump_max_cap_ms") || key.equalsIgnoreCase("pump_cap")) {
        setPumpMaxCapMs((uint32_t)val.toInt());
        return true;
    }

    // Generic key fallback
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putString(key.c_str(), val);
    prefs.end();
    return true;
}

String ConfigStore::getGeneric(const String& key, const String& defaultVal) const {
    if (key.length() == 0) return defaultVal;

    if (key.equalsIgnoreCase("mm_per_pulse")) return String(mmPerPulse, 3);
    if (key.equalsIgnoreCase("max_speed")) return String(maxSpeed);
    if (key.equalsIgnoreCase("ramp_step")) return String(rampStep);
    if (key.equalsIgnoreCase("bat_cal")) return String(batCal, 3);
    if (key.equalsIgnoreCase("relay_active_high")) return relayActiveHigh ? "1" : "0";
    if (key.equalsIgnoreCase("pump_max_cap_ms")) return String(pumpMaxCapMs);
    if (key.equalsIgnoreCase("tot_water_ms")) return String(totalWaterMs);
    if (key.equalsIgnoreCase("tot_treat_ms")) return String(totalTreatMs);

    prefs.begin(PREFS_NAMESPACE, true);
    String out = prefs.getString(key.c_str(), defaultVal);
    prefs.end();
    return out;
}
