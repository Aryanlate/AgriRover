#include "motion_controller.h"
#include "motors.h"
#include "encoders.h"
#include "imu.h"
#include <cmath>

MotionController& MotionController::instance() {
    static MotionController inst;
    return inst;
}

void MotionController::init() {
    mode = MotionMode::IDLE;
    lastControlMs = millis();
}

bool MotionController::startMove(int targetMm) {
    if (targetMm == 0) return false;

    mode = MotionMode::MOVING_STRAIGHT;
    targetDistanceMm = abs(targetMm);
    isForward = (targetMm > 0);
    startDistanceMm = EncoderDriver::instance().getAverageDistance();
    targetHeadingDeg = ImuDriver::instance().getHeadingDeg();

    Serial.printf("[MOTION] Start move: %d mm (Forward: %d, Hold Heading: %.1f deg)\n",
                  targetMm, isForward, targetHeadingDeg);
    return true;
}

bool MotionController::startTurn(int targetDeg) {
    if (targetDeg == 0) return false;

    mode = MotionMode::TURNING;
    targetTurnDeg = targetDeg;
    startHeadingDeg = ImuDriver::instance().getHeadingDeg();

    Serial.printf("[MOTION] Start turn: %d deg (Start Heading: %.1f deg)\n",
                  targetDeg, startHeadingDeg);
    return true;
}

void MotionController::cancel() {
    if (mode != MotionMode::IDLE) {
        mode = MotionMode::IDLE;
        MotorDriver::instance().stop();
    }
}

void MotionController::update() {
    if (mode == MotionMode::IDLE) return;

    unsigned long now = millis();
    if (now - lastControlMs < CONTROL_INTERVAL_MS) {
        return;
    }
    lastControlMs = now;

    if (mode == MotionMode::MOVING_STRAIGHT) {
        float currentDist = EncoderDriver::instance().getAverageDistance();
        float traveled = fabsf(currentDist - startDistanceMm);
        float remaining = (float)targetDistanceMm - traveled;

        // Check if arrived at target distance
        if (remaining <= 5.0f || traveled >= targetDistanceMm) {
            MotorDriver::instance().stop();
            mode = MotionMode::IDLE;
            int finalDist = (int)traveled;
            if (!isForward) finalDist = -finalDist;
            Serial.printf("[MOTION] Arrived: %d mm traveled.\n", finalDist);
            if (arrivedCb) {
                arrivedCb(finalDist, 0, true);
            }
            return;
        }

        // Proportional speed ramp down near target
        int baseSpeed = 50;
        if (remaining < 150.0f) {
            baseSpeed = (int)map((long)remaining, 0, 150, 28, 50);
        }

        // Heading hold with IMU yaw (Simple P controller)
        float currentHeading = ImuDriver::instance().getHeadingDeg();
        float headingError = currentHeading - targetHeadingDeg;
        // Normalize error to [-180, 180]
        while (headingError > 180.0f) headingError -= 360.0f;
        while (headingError < -180.0f) headingError += 360.0f;

        // Steering correction gain Kp = 1.8
        float correction = headingError * 1.8f;
        correction = constrain(correction, -25.0f, 25.0f);

        int leftSpeed = 0;
        int rightSpeed = 0;

        if (isForward) {
            leftSpeed = (int)((float)baseSpeed - correction);
            rightSpeed = (int)((float)baseSpeed + correction);
        } else {
            leftSpeed = (int)(-(float)baseSpeed - correction);
            rightSpeed = (int)(-(float)baseSpeed + correction);
        }

        MotorDriver::instance().setTargetSpeed(leftSpeed, rightSpeed);

    } else if (mode == MotionMode::TURNING) {
        float currentHeading = ImuDriver::instance().getHeadingDeg();
        float turned = currentHeading - startHeadingDeg;
        // Normalize angle turned
        while (turned > 180.0f) turned -= 360.0f;
        while (turned < -180.0f) turned += 360.0f;

        float target = (float)targetTurnDeg;
        float remaining = target - turned;

        // Check if arrived at target turn angle
        if (fabsf(remaining) <= 2.0f || (targetTurnDeg > 0 && turned >= targetTurnDeg) || (targetTurnDeg < 0 && turned <= targetTurnDeg)) {
            MotorDriver::instance().stop();
            mode = MotionMode::IDLE;
            int finalTurn = (int)turned;
            Serial.printf("[MOTION] Arrived: %d deg turned.\n", finalTurn);
            if (arrivedCb) {
                arrivedCb(0, finalTurn, false);
            }
            return;
        }

        // Proportional turn speed
        int turnSpeed = (int)constrain(fabsf(remaining) * 1.2f, 30.0f, 60.0f);

        if (targetTurnDeg > 0) {
            // Turn Right (Clockwise): Left forward, Right reverse
            MotorDriver::instance().setTargetSpeed(turnSpeed, -turnSpeed);
        } else {
            // Turn Left (Counter-clockwise): Left reverse, Right forward
            MotorDriver::instance().setTargetSpeed(-turnSpeed, turnSpeed);
        }
    }
}
