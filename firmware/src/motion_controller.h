#pragma once
#include <Arduino.h>

enum class MotionMode {
    IDLE,
    MOVING_STRAIGHT,
    TURNING
};

class MotionController {
public:
    static MotionController& instance();

    void init();
    void update(); // Closed-loop control loop

    bool startMove(int targetMm);
    bool startTurn(int targetDeg);
    void cancel();

    bool isBusy() const { return mode != MotionMode::IDLE; }
    bool isMovingForward() const { return mode == MotionMode::MOVING_STRAIGHT && isForward; }
    MotionMode getMode() const { return mode; }

    typedef void (*ArrivedCallback)(int traveledMm, int turnedDeg, bool isMove);
    void setCallback(ArrivedCallback onArrived) { arrivedCb = onArrived; }

private:
    MotionController() = default;

    MotionMode mode = MotionMode::IDLE;

    // Move straight parameters
    int targetDistanceMm = 0;
    float startDistanceMm = 0.0f;
    float targetHeadingDeg = 0.0f;
    bool isForward = true;

    // Turn parameters
    int targetTurnDeg = 0;
    float startHeadingDeg = 0.0f;

    unsigned long lastControlMs = 0;
    const unsigned long CONTROL_INTERVAL_MS = 20; // 50 Hz control loop

    ArrivedCallback arrivedCb = nullptr;
};
