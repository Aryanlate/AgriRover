#pragma once
#include <Arduino.h>

enum class SelfTestStage {
    IDLE,
    TEST_I2C,
    TEST_SENSORS,
    TEST_LIMIT_SWITCHES,
    TEST_SERVOS,
    TEST_PUMP_WATER,
    TEST_PUMP_TREAT,
    FINISHING
};

class SelfTestRunner {
public:
    static SelfTestRunner& instance();

    bool start();
    void update(); // Non-blocking state machine
    bool isRunning() const { return stage != SelfTestStage::IDLE; }

    typedef void (*SelfTestDoneCallback)(bool pass, const String& detailsJson);
    void setCallback(SelfTestDoneCallback onDone) { doneCb = onDone; }

private:
    SelfTestRunner() = default;

    SelfTestStage stage = SelfTestStage::IDLE;
    unsigned long stepStartMs = 0;
    bool overallPass = true;

    bool i2cMpuPass = false;
    bool i2cPcaPass = false;
    bool ultrasonicPass = false;
    bool dhtPass = false;
    bool batteryPass = false;
    bool soilPass = false;
    bool limitUpState = false;
    bool limitDownState = false;

    SelfTestDoneCallback doneCb = nullptr;
};
