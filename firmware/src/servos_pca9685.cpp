#include "servos_pca9685.h"

// PCA9685 Registers
#define PCA9685_MODE1       0x00
#define PCA9685_PRESCALE    0xFE
#define PCA9685_LED0_ON_L   0x06

ServosPCA9685& ServosPCA9685::instance() {
    static ServosPCA9685 inst;
    return inst;
}

bool ServosPCA9685::init() {
    // Channel-specific safe min/max bounds and initial positions
    // Channel 0: Probe Servo
    channels[0].minAngle = 0.0f;
    channels[0].maxAngle = 180.0f;
    channels[0].currentAngle = 0.0f; // Start retracted UP
    channels[0].targetAngle = 0.0f;
    channels[0].rampSpeed = 3.0f;

    // Channel 1: Nozzle Pan
    channels[1].minAngle = 15.0f;
    channels[1].maxAngle = 165.0f;
    channels[1].currentAngle = 90.0f;
    channels[1].targetAngle = 90.0f;
    channels[1].rampSpeed = 2.0f;

    // Channel 2: Nozzle Tilt
    channels[2].minAngle = 20.0f;
    channels[2].maxAngle = 160.0f;
    channels[2].currentAngle = 90.0f;
    channels[2].targetAngle = 90.0f;
    channels[2].rampSpeed = 2.0f;

    // Channel 3: Camera Tilt (Leaf pose ~60 deg, Stem pose ~120 deg)
    channels[3].minAngle = 45.0f;
    channels[3].maxAngle = 135.0f;
    channels[3].currentAngle = 60.0f; // Default leaf pose
    channels[3].targetAngle = 60.0f;
    channels[3].rampSpeed = 2.5f;

    // Probe PCA9685 at 0x40
    Wire.beginTransmission(PCA_ADDR);
    if (Wire.endTransmission() != 0) {
        Serial.println("[PCA9685] PWM servo driver not found at 0x40.");
        available = false;
        return false;
    }

    // Set Sleep mode to change prescale
    Wire.beginTransmission(PCA_ADDR);
    Wire.write(PCA9685_MODE1);
    Wire.write(0x10); // Sleep
    Wire.endTransmission();

    // 50 Hz PWM frequency: 25MHz / (4096 * 50) - 1 = 121
    Wire.beginTransmission(PCA_ADDR);
    Wire.write(PCA9685_PRESCALE);
    Wire.write(121);
    Wire.endTransmission();

    // Wake up and enable Auto-Increment
    Wire.beginTransmission(PCA_ADDR);
    Wire.write(PCA9685_MODE1);
    Wire.write(0x20); // Auto-increment on
    Wire.endTransmission();
    delay(5);

    available = true;
    Serial.println("[PCA9685] Initialized 16-channel 50Hz PWM servo driver at 0x40.");

    // Apply default starting angles to hardware
    for (int i = 0; i < 4; i++) {
        applyAngleToPwm(i, channels[i].currentAngle);
    }
    lastRampMs = millis();
    return true;
}

void ServosPCA9685::writePWM(uint8_t channel, uint16_t on, uint16_t off) {
    if (!available) return;

    Wire.beginTransmission(PCA_ADDR);
    Wire.write(PCA9685_LED0_ON_L + 4 * channel);
    Wire.write((uint8_t)(on & 0xFF));
    Wire.write((uint8_t)(on >> 8));
    Wire.write((uint8_t)(off & 0xFF));
    Wire.write((uint8_t)(off >> 8));
    Wire.endTransmission();
}

void ServosPCA9685::applyAngleToPwm(uint8_t channel, float angle) {
    // 0 deg -> 1000 us (205 counts), 180 deg -> 2000 us (410 counts)
    float us = 1000.0f + (angle / 180.0f) * 1000.0f;
    uint16_t offTicks = (uint16_t)((us / 20000.0f) * 4096.0f);
    writePWM(channel, 0, offTicks);
}

void ServosPCA9685::setTargetAngle(ServoChannel ch, float angleDeg) {
    uint8_t idx = (uint8_t)ch;
    if (idx >= 4) return;
    channels[idx].targetAngle = constrain(angleDeg, channels[idx].minAngle, channels[idx].maxAngle);
}

void ServosPCA9685::setImmediateAngle(ServoChannel ch, float angleDeg) {
    uint8_t idx = (uint8_t)ch;
    if (idx >= 4) return;
    channels[idx].targetAngle = constrain(angleDeg, channels[idx].minAngle, channels[idx].maxAngle);
    channels[idx].currentAngle = channels[idx].targetAngle;
    applyAngleToPwm(idx, channels[idx].currentAngle);
}

float ServosPCA9685::getCurrentAngle(ServoChannel ch) const {
    uint8_t idx = (uint8_t)ch;
    return (idx < 4) ? channels[idx].currentAngle : 90.0f;
}

float ServosPCA9685::getTargetAngle(ServoChannel ch) const {
    uint8_t idx = (uint8_t)ch;
    return (idx < 4) ? channels[idx].targetAngle : 90.0f;
}

void ServosPCA9685::update() {
    if (!available) return;

    unsigned long now = millis();
    if (now - lastRampMs < 20) {
        return;
    }
    lastRampMs = now;

    for (int i = 0; i < 4; i++) {
        float& cur = channels[i].currentAngle;
        float tgt = channels[i].targetAngle;
        float spd = channels[i].rampSpeed;

        if (cur < tgt) {
            cur += spd;
            if (cur > tgt) cur = tgt;
            applyAngleToPwm(i, cur);
        } else if (cur > tgt) {
            cur -= spd;
            if (cur < tgt) cur = tgt;
            applyAngleToPwm(i, cur);
        }
    }
}
