#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "pin_map.h"

class ImuDriver {
public:
    static ImuDriver& instance();

    bool init();
    void calibrate(int samples = 200);
    void update(); // Integrates gyro and updates tilt

    float getHeadingDeg() const { return headingDeg; }
    float getTiltDeg() const { return tiltDeg; }
    void resetHeading(float newHeading = 0.0f);

    bool isAvailable() const { return available; }

private:
    ImuDriver() = default;

    bool available = false;
    static constexpr uint8_t MPU_ADDR = 0x68;

    float biasGyroZ = 0.0f;
    float headingDeg = 0.0f;
    float tiltDeg = 0.0f;

    unsigned long lastUpdateMicros = 0;

    bool writeReg(uint8_t reg, uint8_t val);
    bool readRegs(uint8_t reg, uint8_t* buffer, size_t length);
};
