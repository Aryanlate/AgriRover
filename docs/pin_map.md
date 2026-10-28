# Pin map (30-pin ESP32)

| Function | GPIO | Notes |
|---|---|---|
| Left motors: ENA / IN1 / IN2 | 25 / 26 / 27 | L298N #1 (Digital outputs) |
| Right motors: ENB / IN3 / IN4 | 33 / 32 / 23 | L298N #2 (Digital outputs) |
| Encoders: left / right | 34 / 35 | Input-only pins (ADC1), used as digital interrupt inputs |
| I2C: SDA / SCL | 21 / 22 | Shared by MPU6050 (0x68) and PCA9685 (0x40) |
| Ultrasonic: TRIG / ECHO | 18 / 19 | ECHO through the voltage divider (Digital pulse timing) |
| DHT22 data | 4 | Digital 1-wire bus |
| Soil moisture (analog) | 36 | Input-only, **ADC1_CH0** (Safe with Wi-Fi) |
| Battery sense (analog) | 39 | Through divider, **ADC1_CH3** (Safe with Wi-Fi) |
| Relay: water / treatment | 16 / 17 | Active level set in firmware config (Digital outputs) |
| Limit switches: probe up / down | 13 / 14 | Internal pull-up, other side to GND (Digital inputs) |
| E-stop sense | 5 | Internal pull-up, optional (Digital input) |
| GPS RX (optional) | 15 | Only the GPS TX wire is needed (UART2 RX) |
| PCA9685 channels | 0 / 1 / 2 / 3 | Probe, nozzle pan, nozzle tilt, camera tilt |
| Do not use | 0, 1, 2, 3, 6-12 | 0 and 2 affect boot; 1 and 3 are USB serial; 6-11 are flash; 12 affects boot |

---

## Wi-Fi & ADC Hardware Compatibility Analysis

> [!IMPORTANT]
> **ESP32 Wi-Fi vs ADC Constraint:**
> The ESP32 hardware shares SAR ADC2 with the Wi-Fi subsystem. Whenever Wi-Fi is active (such as during MQTT communication), any `analogRead()` calls on **ADC2** (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) will fail or return invalid data.
>
> Therefore, **all analog sensors MUST reside on ADC1 pins (GPIO 32 to 39).**

### Verification of Existing Pins:
- **Analog Sensors:**
  - `PIN_SOIL_ANALOG` is on **GPIO 36** (`ADC1_CH0`) -> **Compliant (ADC1)**.
  - `PIN_BATTERY_SENSE` is on **GPIO 39** (`ADC1_CH3`) -> **Compliant (ADC1)**.
- **Pins on ADC2 Channels (GPIO 4, 13, 14, 15, 25, 26, 27):**
  - GPIO 4 (DHT22): Purely digital read (`digitalRead`).
  - GPIO 13 & 14 (Probe limit switches): Purely digital switch inputs (`digitalRead`).
  - GPIO 15 (GPS RX): Digital UART RX.
  - GPIO 25, 26, 27 (Motor driver L298N #1): Digital output / PWM (`digitalWrite` / `ledc`).
- **Pins That Break ADC1 Restriction:**
  - **None.** No analog sensors are mapped to ADC2. The pin map is 100% compliant with Wi-Fi / MQTT operation.
