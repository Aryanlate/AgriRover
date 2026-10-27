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
    batWarn = prefs.getFloat("bat_warn", 11.2f);
    batCutoff = prefs.getFloat("bat_cut", 10.5f);
    tiltLimit = prefs.getFloat("tilt_lim", 35.0f);
    obstacleDistCm = prefs.getInt("obs_dist", 20);
    prefs.end();

    Serial.printf("[NVS] Loaded: mmPerPulse=%.3f, maxSpd=%d, batCal=%.2f, batWarn=%.1fV, batCut=%.1fV, tiltLim=%.1f, obsDist=%dcm\n",
                  mmPerPulse, maxSpeed, batCal, batWarn, batCutoff, tiltLimit, obstacleDistCm);
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

float ConfigStore::getBatWarn() const {
    return batWarn;
}

void ConfigStore::setBatWarn(float val) {
    if (val < 5.0f || val > 15.0f) return;
    batWarn = val;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putFloat("bat_warn", val);
    prefs.end();
}

float ConfigStore::getBatCutoff() const {
    return batCutoff;
}

void ConfigStore::setBatCutoff(float val) {
    if (val < 5.0f || val > 15.0f) return;
    batCutoff = val;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putFloat("bat_cut", val);
    prefs.end();
}

float ConfigStore::getTiltLimit() const {
    return tiltLimit;
}

void ConfigStore::setTiltLimit(float val) {
    if (val < 5.0f || val > 80.0f) return;
    tiltLimit = val;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putFloat("tilt_lim", val);
    prefs.end();
}

int ConfigStore::getObstacleDistCm() const {
    return obstacleDistCm;
}

void ConfigStore::setObstacleDistCm(int val) {
    obstacleDistCm = constrain(val, 5, 200);
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt("obs_dist", obstacleDistCm);
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
    if (key.equalsIgnoreCase("bat_warn")) {
        setBatWarn(val.toFloat());
        return true;
    }
    if (key.equalsIgnoreCase("bat_cut") || key.equalsIgnoreCase("bat_cutoff")) {
        setBatCutoff(val.toFloat());
        return true;
    }
    if (key.equalsIgnoreCase("tilt_lim") || key.equalsIgnoreCase("tilt_limit")) {
        setTiltLimit(val.toFloat());
        return true;
    }
    if (key.equalsIgnoreCase("obs_dist") || key.equalsIgnoreCase("obstacle_dist")) {
        setObstacleDistCm(val.toInt());
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
    if (key.equalsIgnoreCase("bat_warn")) return String(batWarn, 1);
    if (key.equalsIgnoreCase("bat_cut") || key.equalsIgnoreCase("bat_cutoff")) return String(batCutoff, 1);
    if (key.equalsIgnoreCase("tilt_lim") || key.equalsIgnoreCase("tilt_limit")) return String(tiltLimit, 1);
    if (key.equalsIgnoreCase("obs_dist") || key.equalsIgnoreCase("obstacle_dist")) return String(obstacleDistCm);
    if (key.equalsIgnoreCase("relay_active_high")) return relayActiveHigh ? "1" : "0";
    if (key.equalsIgnoreCase("pump_max_cap_ms")) return String(pumpMaxCapMs);
    if (key.equalsIgnoreCase("tot_water_ms")) return String(totalWaterMs);
    if (key.equalsIgnoreCase("tot_treat_ms")) return String(totalTreatMs);

    prefs.begin(PREFS_NAMESPACE, true);
    String out = prefs.getString(key.c_str(), defaultVal);
    prefs.end();
    return out;
}
