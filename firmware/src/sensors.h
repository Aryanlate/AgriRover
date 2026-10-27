#pragma once
#include <Arduino.h>
#include "pin_map.h"

class SensorManager {
public:
    static SensorManager& instance();

    void init();
    void update(); // Non-blocking sampling routines

    // Ultrasonic
    int getDistanceCm() const { return medianDistanceCm; }

    // DHT22
    float getTemperatureC() const { return cachedTempC; }
    float getHumidityPct() const { return cachedHumPct; }

    // Soil Moisture
    int getRawSoil() const { return rawSoilValue; }
    int getSoilPercent() const { return soilPercent; }

    // Battery
    float getBatteryVoltage() const { return batteryVoltage; }

private:
    SensorManager() = default;

    // Ultrasonic state & median filter
    static constexpr int US_FILTER_SIZE = 5;
    int usBuffer[US_FILTER_SIZE] = {85, 85, 85, 85, 85};
    int usIndex = 0;
    int medianDistanceCm = 85;
    unsigned long lastUltrasonicTriggerMs = 0;
    void triggerUltrasonic();

    // DHT22 state & 2s cache
    float cachedTempC = 24.5f;
    float cachedHumPct = 58.0f;
    unsigned long lastDhtReadMs = 0;
    bool readDhtHardware(float& outTemp, float& outHum);

    // Soil sensor state
    int rawSoilValue = 1800;
    int soilPercent = 42;
    unsigned long lastSoilSampleMs = 0;
    void sampleSoil();

    // Battery ADC state
    float batteryVoltage = 12.4f;
    unsigned long lastBatterySampleMs = 0;
    void sampleBattery();
};
