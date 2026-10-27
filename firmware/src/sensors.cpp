#include "sensors.h"
#include "config_store.h"
#include <algorithm>

SensorManager& SensorManager::instance() {
    static SensorManager inst;
    return inst;
}

void SensorManager::init() {
    // Ultrasonic pins
    pinMode(PIN_US_TRIG, OUTPUT);
    pinMode(PIN_US_ECHO, INPUT);
    digitalWrite(PIN_US_TRIG, LOW);

    // DHT22 pin
    pinMode(PIN_DHT22_DATA, INPUT_PULLUP);

    // Analog pins
    pinMode(PIN_SOIL_ANALOG, INPUT);
    pinMode(PIN_BATTERY_SENSE, INPUT);

    // Initial warm-up reads
    sampleSoil();
    sampleBattery();

    Serial.println("[SENSORS] Ultrasonic, DHT22, Soil, and Battery ADC initialized.");
}

void SensorManager::update() {
    unsigned long now = millis();

    // 1. Ultrasonic every 60 ms
    if (now - lastUltrasonicTriggerMs >= 60) {
        lastUltrasonicTriggerMs = now;
        triggerUltrasonic();
    }

    // 2. DHT22 every 2000 ms (read at most every 2s per specs)
    if (now - lastDhtReadMs >= 2000) {
        lastDhtReadMs = now;
        float t = cachedTempC;
        float h = cachedHumPct;
        if (readDhtHardware(t, h)) {
            cachedTempC = t;
            cachedHumPct = h;
        }
    }

    // 3. Soil sensor sample every 250 ms
    if (now - lastSoilSampleMs >= 250) {
        lastSoilSampleMs = now;
        sampleSoil();
    }

    // 4. Battery sample every 500 ms
    if (now - lastBatterySampleMs >= 500) {
        lastBatterySampleMs = now;
        sampleBattery();
    }
}

void SensorManager::triggerUltrasonic() {
    // Send 10us trigger pulse
    digitalWrite(PIN_US_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(PIN_US_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(PIN_US_TRIG, LOW);

    // Read echo duration with 24ms timeout (~400 cm)
    unsigned long duration = pulseIn(PIN_US_ECHO, HIGH, 24000);
    int distCm = 400;
    if (duration > 0) {
        distCm = (int)(duration / 58);
        if (distCm < 2) distCm = 2;
        if (distCm > 400) distCm = 400;
    }

    // Add to circular buffer
    usBuffer[usIndex] = distCm;
    usIndex = (usIndex + 1) % US_FILTER_SIZE;

    // Compute median of 5 samples
    int sorted[US_FILTER_SIZE];
    for (int i = 0; i < US_FILTER_SIZE; i++) {
        sorted[i] = usBuffer[i];
    }
    std::sort(sorted, sorted + US_FILTER_SIZE);
    medianDistanceCm = sorted[US_FILTER_SIZE / 2];
}

bool SensorManager::readDhtHardware(float& outTemp, float& outHum) {
    uint8_t data[5] = {0, 0, 0, 0, 0};

    // Request start signal: pull low for 2ms
    pinMode(PIN_DHT22_DATA, OUTPUT);
    digitalWrite(PIN_DHT22_DATA, LOW);
    delayMicroseconds(2000);
    digitalWrite(PIN_DHT22_DATA, HIGH);
    delayMicroseconds(30);
    pinMode(PIN_DHT22_DATA, INPUT_PULLUP);

    // Wait for DHT response (80us LOW, 80us HIGH)
    unsigned long timeout = micros();
    while (digitalRead(PIN_DHT22_DATA) == HIGH) {
        if (micros() - timeout > 100) return false;
    }
    timeout = micros();
    while (digitalRead(PIN_DHT22_DATA) == LOW) {
        if (micros() - timeout > 100) return false;
    }
    timeout = micros();
    while (digitalRead(PIN_DHT22_DATA) == HIGH) {
        if (micros() - timeout > 100) return false;
    }

    // Read 40 bits
    for (int i = 0; i < 40; i++) {
        timeout = micros();
        while (digitalRead(PIN_DHT22_DATA) == LOW) {
            if (micros() - timeout > 100) return false;
        }
        unsigned long highStart = micros();
        timeout = micros();
        while (digitalRead(PIN_DHT22_DATA) == HIGH) {
            if (micros() - timeout > 100) return false;
        }
        unsigned long highDuration = micros() - highStart;

        // Bit is 1 if pulse > 40us, 0 if ~26-28us
        if (highDuration > 40) {
            data[i / 8] |= (1 << (7 - (i % 8)));
        }
    }

    // Verify Checksum
    uint8_t sum = (uint8_t)(data[0] + data[1] + data[2] + data[3]);
    if (sum != data[4]) {
        return false;
    }

    int16_t rawHum = (data[0] << 8) | data[1];
    int16_t rawTemp = ((data[2] & 0x7F) << 8) | data[3];
    if (data[2] & 0x80) rawTemp = -rawTemp;

    outHum = (float)rawHum * 0.1f;
    outTemp = (float)rawTemp * 0.1f;
    return true;
}

void SensorManager::sampleSoil() {
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(PIN_SOIL_ANALOG);
        delayMicroseconds(50);
    }
    rawSoilValue = (int)(sum / 10);

    // Standard capacitive soil scaling (approx 1400 wet, 3200 dry in 12-bit ADC)
    int dryVal = 3200;
    int wetVal = 1400;
    int pct = map(rawSoilValue, dryVal, wetVal, 0, 100);
    soilPercent = constrain(pct, 0, 100);
}

void SensorManager::sampleBattery() {
    long sum = 0;
    for (int i = 0; i < 10; i++) {
        sum += analogRead(PIN_BATTERY_SENSE);
        delayMicroseconds(50);
    }
    float rawAdc = (float)sum / 10.0f;

    // ESP32 12-bit ADC (0..4095) with divider (nominal 12.4V produces ~2.2V at ADC)
    // Nominal multiplier: ~0.0039V per count * batCal
    float cal = ConfigStore::instance().getBatCal();
    batteryVoltage = (rawAdc * 0.0039f) * cal;
    if (batteryVoltage < 1.0f) {
        // Fallback default if unpowered on bench
        batteryVoltage = 12.4f;
    }
}
