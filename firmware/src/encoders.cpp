#include "encoders.h"
#include "config_store.h"

volatile long EncoderDriver::countL = 0;
volatile long EncoderDriver::countR = 0;
volatile unsigned long EncoderDriver::lastMicrosL = 0;
volatile unsigned long EncoderDriver::lastMicrosR = 0;

EncoderDriver& EncoderDriver::instance() {
    static EncoderDriver inst;
    return inst;
}

void EncoderDriver::init() {
    pinMode(PIN_ENCODER_L, INPUT);
    pinMode(PIN_ENCODER_R, INPUT);

    reset();

    attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_L), handleInterruptL, RISING);
    attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_R), handleInterruptR, RISING);

    Serial.println("[ENCODERS] Interrupt-based wheel encoders attached to GPIO 34 and 35.");
}

void EncoderDriver::reset() {
    countL = 0;
    countR = 0;
}

long EncoderDriver::getTicksL() const {
    return countL;
}

long EncoderDriver::getTicksR() const {
    return countR;
}

float EncoderDriver::getDistanceL() const {
    return (float)countL * ConfigStore::instance().getMmPerPulse();
}

float EncoderDriver::getDistanceR() const {
    return (float)countR * ConfigStore::instance().getMmPerPulse();
}

float EncoderDriver::getAverageDistance() const {
    return (getDistanceL() + getDistanceR()) * 0.5f;
}

void IRAM_ATTR EncoderDriver::handleInterruptL() {
    unsigned long now = micros();
    if (now - lastMicrosL >= DEBOUNCE_MICROS) {
        lastMicrosL = now;
        countL++;
    }
}

void IRAM_ATTR EncoderDriver::handleInterruptR() {
    unsigned long now = micros();
    if (now - lastMicrosR >= DEBOUNCE_MICROS) {
        lastMicrosR = now;
        countR++;
    }
}
