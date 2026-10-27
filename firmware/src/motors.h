#pragma once
#include <Arduino.h>
#include "pin_map.h"

class MotorDriver {
public:
    static MotorDriver& instance();

    void init();
    void setTargetSpeed(int leftPercent, int rightPercent); // -100..100
    void stop();
    void emergencyStop(); // Immediate hard cutoff without ramping
    void update();        // Non-blocking speed ramping

    int getCurrentLeft() const { return currentL; }
    int getCurrentRight() const { return currentR; }
    bool isMoving() const { return currentL != 0 || currentR != 0 || targetL != 0 || targetR != 0; }

private:
    MotorDriver() = default;

    int targetL = 0;
    int targetR = 0;
    int currentL = 0;
    int currentR = 0;

    unsigned long lastRampMs = 0;
    const unsigned long RAMP_INTERVAL_MS = 20; // 50 Hz ramping update

    void applyHardware(int leftSpeed, int rightSpeed);
};
