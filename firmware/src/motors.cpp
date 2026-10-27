#include "motors.h"
#include "config_store.h"

MotorDriver& MotorDriver::instance() {
    static MotorDriver inst;
    return inst;
}

void MotorDriver::init() {
    // Configure directional pins
    pinMode(PIN_MOTOR_L_IN1, OUTPUT);
    pinMode(PIN_MOTOR_L_IN2, OUTPUT);
    pinMode(PIN_MOTOR_R_IN3, OUTPUT);
    pinMode(PIN_MOTOR_R_IN4, OUTPUT);

    digitalWrite(PIN_MOTOR_L_IN1, LOW);
    digitalWrite(PIN_MOTOR_L_IN2, LOW);
    digitalWrite(PIN_MOTOR_R_IN3, LOW);
    digitalWrite(PIN_MOTOR_R_IN4, LOW);

    // Attach PWM to ENA and ENB (1 kHz, 8-bit resolution: 0..255)
    ledcAttach(PIN_MOTOR_L_ENA, 1000, 8);
    ledcAttach(PIN_MOTOR_R_ENB, 1000, 8);

    ledcWrite(PIN_MOTOR_L_ENA, 0);
    ledcWrite(PIN_MOTOR_R_ENB, 0);

    targetL = 0;
    targetR = 0;
    currentL = 0;
    currentR = 0;
    lastRampMs = millis();

    Serial.println("[MOTORS] L298N dual motor driver initialized with 1kHz PWM.");
}

void MotorDriver::setTargetSpeed(int leftPercent, int rightPercent) {
    // Clamp to -100..100
    int maxLimit = ConfigStore::instance().getMaxSpeed();
    int leftClamped = constrain(leftPercent, -100, 100);
    int rightClamped = constrain(rightPercent, -100, 100);

    // Scale by max configured speed limit
    targetL = (leftClamped * maxLimit) / 100;
    targetR = (rightClamped * maxLimit) / 100;
}

void MotorDriver::stop() {
    targetL = 0;
    targetR = 0;
}

void MotorDriver::emergencyStop() {
    targetL = 0;
    targetR = 0;
    currentL = 0;
    currentR = 0;

    ledcWrite(PIN_MOTOR_L_ENA, 0);
    ledcWrite(PIN_MOTOR_R_ENB, 0);

    digitalWrite(PIN_MOTOR_L_IN1, LOW);
    digitalWrite(PIN_MOTOR_L_IN2, LOW);
    digitalWrite(PIN_MOTOR_R_IN3, LOW);
    digitalWrite(PIN_MOTOR_R_IN4, LOW);
}

void MotorDriver::update() {
    unsigned long now = millis();
    if (now - lastRampMs < RAMP_INTERVAL_MS) {
        return;
    }
    lastRampMs = now;

    int step = ConfigStore::instance().getRampStep();

    // Ramp Left speed
    if (currentL < targetL) {
        currentL += step;
        if (currentL > targetL) currentL = targetL;
    } else if (currentL > targetL) {
        currentL -= step;
        if (currentL < targetL) currentL = targetL;
    }

    // Ramp Right speed
    if (currentR < targetR) {
        currentR += step;
        if (currentR > targetR) currentR = targetR;
    } else if (currentR > targetR) {
        currentR -= step;
        if (currentR < targetR) currentR = targetR;
    }

    applyHardware(currentL, currentR);
}

void MotorDriver::applyHardware(int leftSpeed, int rightSpeed) {
    // Left Motor Direction & PWM
    if (leftSpeed > 0) {
        digitalWrite(PIN_MOTOR_L_IN1, HIGH);
        digitalWrite(PIN_MOTOR_L_IN2, LOW);
        int duty = map(leftSpeed, 0, 100, 0, 255);
        ledcWrite(PIN_MOTOR_L_ENA, duty);
    } else if (leftSpeed < 0) {
        digitalWrite(PIN_MOTOR_L_IN1, LOW);
        digitalWrite(PIN_MOTOR_L_IN2, HIGH);
        int duty = map(-leftSpeed, 0, 100, 0, 255);
        ledcWrite(PIN_MOTOR_L_ENA, duty);
    } else {
        digitalWrite(PIN_MOTOR_L_IN1, LOW);
        digitalWrite(PIN_MOTOR_L_IN2, LOW);
        ledcWrite(PIN_MOTOR_L_ENA, 0);
    }

    // Right Motor Direction & PWM
    if (rightSpeed > 0) {
        digitalWrite(PIN_MOTOR_R_IN3, HIGH);
        digitalWrite(PIN_MOTOR_R_IN4, LOW);
        int duty = map(rightSpeed, 0, 100, 0, 255);
        ledcWrite(PIN_MOTOR_R_ENB, duty);
    } else if (rightSpeed < 0) {
        digitalWrite(PIN_MOTOR_R_IN3, LOW);
        digitalWrite(PIN_MOTOR_R_IN4, HIGH);
        int duty = map(-rightSpeed, 0, 100, 0, 255);
        ledcWrite(PIN_MOTOR_R_ENB, duty);
    } else {
        digitalWrite(PIN_MOTOR_R_IN3, LOW);
        digitalWrite(PIN_MOTOR_R_IN4, LOW);
        ledcWrite(PIN_MOTOR_R_ENB, 0);
    }
}
