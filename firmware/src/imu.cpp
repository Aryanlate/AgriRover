#include "imu.h"
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

ImuDriver& ImuDriver::instance() {
    static ImuDriver inst;
    return inst;
}

bool ImuDriver::writeReg(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    Wire.write(val);
    return (Wire.endTransmission() == 0);
}

bool ImuDriver::readRegs(uint8_t reg, uint8_t* buffer, size_t length) {
    Wire.beginTransmission(MPU_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) {
        return false;
    }
    size_t count = Wire.requestFrom(MPU_ADDR, (uint8_t)length);
    if (count != length) return false;
    for (size_t i = 0; i < length; i++) {
        buffer[i] = Wire.read();
    }
    return true;
}

bool ImuDriver::init() {
    // Wake up MPU-6050 (PWR_MGMT_1 = 0)
    if (!writeReg(0x6B, 0x00)) {
        Serial.println("[IMU] MPU6050 not detected at 0x68.");
        available = false;
        return false;
    }

    delay(20);
    // Config: DLPF 44 Hz (0x1A = 0x03)
    writeReg(0x1A, 0x03);
    // Gyro: +/- 500 deg/s (0x1B = 0x08 -> scale 65.5 LSB/deg/s)
    writeReg(0x1B, 0x08);
    // Accel: +/- 4g (0x1C = 0x08 -> scale 8192 LSB/g)
    writeReg(0x1C, 0x08);

    available = true;
    Serial.println("[IMU] MPU6050 connected successfully. Calibrating gyro...");
    calibrate(200);
    lastUpdateMicros = micros();
    return true;
}

void ImuDriver::calibrate(int samples) {
    if (!available) return;

    long sumZ = 0;
    int valid = 0;
    uint8_t buf[6];

    for (int i = 0; i < samples; i++) {
        if (readRegs(0x43, buf, 6)) {
            int16_t gz = (int16_t)((buf[4] << 8) | buf[5]);
            sumZ += gz;
            valid++;
        }
        delay(2);
    }

    if (valid > 0) {
        biasGyroZ = (float)sumZ / (float)valid;
        Serial.printf("[IMU] Gyro Z bias: %.2f LSB\n", biasGyroZ);
    }
    headingDeg = 0.0f;
}

void ImuDriver::resetHeading(float newHeading) {
    headingDeg = newHeading;
}

void ImuDriver::update() {
    if (!available) return;

    unsigned long now = micros();
    if (lastUpdateMicros == 0) {
        lastUpdateMicros = now;
        return;
    }

    float dt = (float)(now - lastUpdateMicros) / 1000000.0f;
    lastUpdateMicros = now;
    if (dt <= 0.0f || dt > 0.5f) {
        dt = 0.02f; // Fallback to nominal 20ms
    }

    // Read Accel (0x3B..0x40) and Gyro (0x43..0x48) in one 14-byte burst
    uint8_t buf[14];
    if (!readRegs(0x3B, buf, 14)) {
        return;
    }

    int16_t ax = (int16_t)((buf[0] << 8) | buf[1]);
    int16_t ay = (int16_t)((buf[2] << 8) | buf[3]);
    int16_t az = (int16_t)((buf[4] << 8) | buf[5]);
    // buf[6..7] is temperature
    int16_t gz = (int16_t)((buf[12] << 8) | buf[13]);

    // Calculate Tilt (angle from vertical gravity axis)
    float ax_g = (float)ax / 8192.0f;
    float ay_g = (float)ay / 8192.0f;
    float az_g = (float)az / 8192.0f;
    float horizMag = sqrtf(ax_g * ax_g + ay_g * ay_g);
    tiltDeg = atan2f(horizMag, fabsf(az_g) + 0.0001f) * (180.0f / (float)M_PI);

    // Calculate Heading Rate (scale: 65.5 LSB per deg/s)
    float gz_rate = ((float)gz - biasGyroZ) / 65.5f;

    // Filter tiny drift noise deadband
    if (fabsf(gz_rate) < 0.15f) {
        gz_rate = 0.0f;
    }

    gyroRateZ = gz_rate;
    headingDeg += gz_rate * dt;

    // Normalize heading to [-180, 180]
    while (headingDeg > 180.0f) headingDeg -= 360.0f;
    while (headingDeg < -180.0f) headingDeg += 360.0f;
}
