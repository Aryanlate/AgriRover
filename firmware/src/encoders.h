#pragma once
#include <Arduino.h>
#include "pin_map.h"

class EncoderDriver {
public:
    static EncoderDriver& instance();

    void init();
    void reset();

    long getTicksL() const;
    long getTicksR() const;

    float getDistanceL() const;
    float getDistanceR() const;
    float getAverageDistance() const;

    // ISR routines (public for interrupt vector binding)
    static void IRAM_ATTR handleInterruptL();
    static void IRAM_ATTR handleInterruptR();

private:
    EncoderDriver() = default;

    static volatile long countL;
    static volatile long countR;
    static volatile unsigned long lastMicrosL;
    static volatile unsigned long lastMicrosR;
    static const unsigned long DEBOUNCE_MICROS = 200;
};
