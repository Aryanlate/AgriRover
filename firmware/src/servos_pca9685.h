#pragma once
#include <Arduino.h>
#include <Wire.h>
#include "pin_map.h"

enum class ServoChannel {
    PROBE = 0,
    NOZZLE_PAN = 1,
    NOZZLE_TILT = 2,
    CAM_TILT = 3
};

class ServosPCA9685 {
public:
    static ServosPCA9685& instance();

    bool init();
    void setTargetAngle(ServoChannel ch, float angleDeg);
    void setImmediateAngle(ServoChannel ch, float angleDeg);
    float getCurrentAngle(ServoChannel ch) const;
    float getTargetAngle(ServoChannel ch) const;

    void update(); // Non-blocking smooth slow ramping
    bool isAvailable() const { return available; }

private:
    ServosPCA9685() = default;

    bool available = false;
    static constexpr uint8_t PCA_ADDR = 0x40;

    struct ChannelConfig {
        float currentAngle = 90.0f;
        float targetAngle = 90.0f;
        float minAngle = 0.0f;
        float maxAngle = 180.0f;
        float rampSpeed = 2.0f; // degrees per 20ms update (~100 deg/s)
    };

    ChannelConfig channels[4];
    unsigned long lastRampMs = 0;

    void writePWM(uint8_t channel, uint16_t on, uint16_t off);
    void applyAngleToPwm(uint8_t channel, float angle);
};
