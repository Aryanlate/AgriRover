#pragma once

// AgriRover 30-pin ESP32 Pin Map
// Single source of truth: docs/pin_map.md

// Left Motors (L298N #1)
#define PIN_MOTOR_L_ENA    25
#define PIN_MOTOR_L_IN1    26
#define PIN_MOTOR_L_IN2    27

// Right Motors (L298N #2)
#define PIN_MOTOR_R_ENB    33
#define PIN_MOTOR_R_IN3    32
#define PIN_MOTOR_R_IN4    23

// Wheel Encoders (Input-only pins)
#define PIN_ENCODER_L      34
#define PIN_ENCODER_R      35

// I2C Bus (Shared by MPU6050 0x68 and PCA9685 0x40)
#define PIN_I2C_SDA        21
#define PIN_I2C_SCL        22

// Ultrasonic Sensor
#define PIN_US_TRIG        18
#define PIN_US_ECHO        19

// Environment & Soil Sensors
#define PIN_DHT22_DATA      4
#define PIN_SOIL_ANALOG    36
#define PIN_BATTERY_SENSE  39

// Relays (Water & Treatment Pumps)
#define PIN_RELAY_WATER    16
#define PIN_RELAY_TREAT    17

// Limit Switches (Probe Up / Down, internal pull-up, other side to GND)
#define PIN_LIMIT_PROBE_UP   13
#define PIN_LIMIT_PROBE_DOWN 14

// Safety & Communication
#define PIN_ESTOP_SENSE     5
#define PIN_GPS_RX         15

// PCA9685 PWM Channels (0x40 on I2C)
#define PCA_CH_PROBE        0
#define PCA_CH_NOZZLE_PAN   1
#define PCA_CH_NOZZLE_TILT  2
#define PCA_CH_CAM_TILT     3
