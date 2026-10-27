# Pin map (30-pin ESP32)
| Function | GPIO | Notes |
|---|---|---|
| Left motors: ENA / IN1 / IN2 | 25 / 26 / 27 | L298N #1 |
| Right motors: ENB / IN3 / IN4 | 33 / 32 / 23 | L298N #2 |
| Encoders: left / right | 34 / 35 | Input-only pins, fine for encoders |
| I2C: SDA / SCL | 21 / 22 | Shared by MPU6050 (0x68) and PCA9685 (0x40) |
| Ultrasonic: TRIG / ECHO | 18 / 19 | ECHO through the voltage divider |
| DHT22 data | 4 |  |
| Soil moisture (analog) | 36 | Input-only |
| Battery sense (analog) | 39 | Through the divider |
| Relay: water / treatment | 16 / 17 | Active level set in firmware config |
| Limit switches: probe up / down | 13 / 14 | Internal pull-up, other side to GND |
| E-stop sense | 5 | Internal pull-up, optional |
| GPS RX (optional) | 15 | Only the GPS TX wire is needed |
| PCA9685 channels | 0 / 1 / 2 / 3 | Probe, nozzle pan, nozzle tilt, camera tilt |
| Do not use | 0, 1, 2, 3, 6-12 | 0 and 2 affect boot; 1 and 3 are USB serial; 6-11 are flash; 12 affects boot |
