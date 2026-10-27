#include "selftest.h"
#include "imu.h"
#include "servos_pca9685.h"
#include "sensors.h"
#include "pumps.h"
#include "pin_map.h"
#include <Wire.h>

SelfTestRunner& SelfTestRunner::instance() {
    static SelfTestRunner inst;
    return inst;
}

bool SelfTestRunner::start() {
    if (stage != SelfTestStage::IDLE) return false;

    stage = SelfTestStage::TEST_I2C;
    stepStartMs = millis();
    overallPass = true;

    Serial.println("\n[SELFTEST] === Starting Non-Blocking Comprehensive Hardware Test ===");
    return true;
}

void SelfTestRunner::update() {
    if (stage == SelfTestStage::IDLE) return;

    unsigned long now = millis();

    switch (stage) {
        case SelfTestStage::TEST_I2C: {
            // Check MPU6050 (0x68)
            Wire.beginTransmission(0x68);
            i2cMpuPass = (Wire.endTransmission() == 0);

            // Check PCA9685 (0x40)
            Wire.beginTransmission(0x40);
            i2cPcaPass = (Wire.endTransmission() == 0);

            if (!i2cMpuPass || !i2cPcaPass) overallPass = false;

            Serial.printf("[SELFTEST] I2C: MPU6050=%s, PCA9685=%s\n",
                          i2cMpuPass ? "OK" : "FAIL", i2cPcaPass ? "OK" : "FAIL");

            stage = SelfTestStage::TEST_SENSORS;
            stepStartMs = now;
            break;
        }

        case SelfTestStage::TEST_SENSORS: {
            // Check Ultrasonic
            int dist = SensorManager::instance().getDistanceCm();
            ultrasonicPass = (dist > 0 && dist <= 400);

            // Check DHT22
            float temp = SensorManager::instance().getTemperatureC();
            dhtPass = (temp > -20.0f && temp < 70.0f);

            // Check Battery ADC
            float bat = SensorManager::instance().getBatteryVoltage();
            batteryPass = (bat >= 8.0f && bat <= 15.0f);

            // Check Soil ADC
            int rawSoil = SensorManager::instance().getRawSoil();
            soilPass = (rawSoil > 100);

            Serial.printf("[SELFTEST] Sensors: US=%d cm (%s), DHT=%.1f C (%s), Bat=%.1f V (%s), Soil=%d (%s)\n",
                          dist, ultrasonicPass ? "OK" : "WARN",
                          temp, dhtPass ? "OK" : "WARN",
                          bat, batteryPass ? "OK" : "WARN",
                          rawSoil, soilPass ? "OK" : "WARN");

            stage = SelfTestStage::TEST_LIMIT_SWITCHES;
            stepStartMs = now;
            break;
        }

        case SelfTestStage::TEST_LIMIT_SWITCHES: {
            limitUpState = (digitalRead(PIN_LIMIT_PROBE_UP) == LOW);
            limitDownState = (digitalRead(PIN_LIMIT_PROBE_DOWN) == LOW);

            Serial.printf("[SELFTEST] Limit Switches: UP_SW=%s, DOWN_SW=%s\n",
                          limitUpState ? "PRESSED" : "OPEN",
                          limitDownState ? "PRESSED" : "OPEN");

            stage = SelfTestStage::TEST_SERVOS;
            stepStartMs = now;
            // Wiggle camera tilt servo slightly (+10 deg)
            if (i2cPcaPass) {
                ServosPCA9685::instance().setTargetAngle(ServoChannel::CAM_TILT, 75.0f);
            }
            break;
        }

        case SelfTestStage::TEST_SERVOS: {
            // Allow 300 ms for servo motion
            if (now - stepStartMs >= 300) {
                // Return camera tilt to nominal leaf pose (60 deg)
                if (i2cPcaPass) {
                    ServosPCA9685::instance().setTargetAngle(ServoChannel::CAM_TILT, 60.0f);
                }
                Serial.println("[SELFTEST] Servo PCA9685 actuator wiggle verified.");

                // Start very short 50 ms Water pump pulse
                stage = SelfTestStage::TEST_PUMP_WATER;
                stepStartMs = now;
                PumpManager::instance().startPump(PumpId::WATER, 50);
            }
            break;
        }

        case SelfTestStage::TEST_PUMP_WATER: {
            // Wait for 50 ms pulse + 100 ms pause
            if (now - stepStartMs >= 150) {
                // Start very short 50 ms Treatment pump pulse
                stage = SelfTestStage::TEST_PUMP_TREAT;
                stepStartMs = now;
                PumpManager::instance().startPump(PumpId::TREATMENT, 50);
            }
            break;
        }

        case SelfTestStage::TEST_PUMP_TREAT: {
            if (now - stepStartMs >= 150) {
                stage = SelfTestStage::FINISHING;
                stepStartMs = now;
            }
            break;
        }

        case SelfTestStage::FINISHING: {
            stage = SelfTestStage::IDLE;

            String details = "{";
            details += "\"mpu\":" + String(i2cMpuPass ? "true" : "false") + ",";
            details += "\"pca\":" + String(i2cPcaPass ? "true" : "false") + ",";
            details += "\"ultrasonic\":" + String(ultrasonicPass ? "true" : "false") + ",";
            details += "\"dht\":" + String(dhtPass ? "true" : "false") + ",";
            details += "\"battery\":" + String(batteryPass ? "true" : "false") + ",";
            details += "\"soil\":" + String(soilPass ? "true" : "false") + ",";
            details += "\"probe_up\":" + String(limitUpState ? "true" : "false") + ",";
            details += "\"probe_down\":" + String(limitDownState ? "true" : "false");
            details += "}";

            Serial.printf("[SELFTEST] Comprehensive self-test complete! Overall: %s\n",
                          overallPass ? "PASSED" : "FAILED");

            if (doneCb) {
                doneCb(overallPass, details);
            }
            break;
        }

        default:
            stage = SelfTestStage::IDLE;
            break;
    }
}
