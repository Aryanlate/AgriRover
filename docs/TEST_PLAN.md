# Agri-Rover Progressive Test Plan

A step-by-step verification methodology progressing from isolated bench electrical checks to multi-plant autonomous greenhouse missions, concluding with a comprehensive safety fault matrix.

---

## Stage 1: Bench Test (Stationary on Worktable)
**Objective**: Validate electrical connections, sensor buses, actuators, and communication links without rover movement.

1. **Power & Bus Verification**:
   - Power the main controller with a regulated 12V bench supply or fully charged 3S LiPo battery.
   - Confirm logic level on 5V and 3.3V rails.
   - Verify I2C bus detection (`0x68` MPU6050 and `0x40` PCA9685).
2. **Self-Test Diagnostics**:
   - Navigate to `/diagnostics` on the web dashboard.
   - Click **Run Self-Test** and confirm all 10 subsystems report `PASS`:
     - Battery ADC, IMU MPU6050, Ultrasonic HC-SR04, DHT22 Temp/Humidity, Soil Probe Upper/Lower Limit Switches, PCA9685 Servo Controller, Motor H-Bridge Pins, Water Relay, Treatment Relay, BLE GATT.
3. **Manual Mechanism Checks** (via `/manual` or `/calibration`):
   - **Probe Lower/Raise**: Command `probe: down`, verify motion and lower limit switch stop. Command `probe: up`, verify retract and upper limit switch stop.
   - **Nozzle Servos**: Command pan/tilt angles (0° to 180°), verify smooth travel without binding or gear jitter.
   - **Camera Tilt**: Switch poses between Leaf (45°), Stem (15°), and Neutral (0°).
   - **Pumps**: Pulse water and treatment relays for 1 second, listening for relay clicks and brief pump motor spin (no fluid connected yet).
4. **Camera Stream & Illumination**:
   - Verify ESP32-CAM MJPEG live stream loads at `http://<CAM_IP>/stream` or on the `/camera` tab.
   - Toggle camera illumination LED on/off via the dashboard.

---

## Stage 2: Wheels Lifted (Actuators Free-Spinning)
**Objective**: Validate drive motor directions, encoder pulse counting, deadbands, and speed scaling without floor resistance.

1. **Setup**:
   - Place rover chassis on a stable stand so all 4 wheels spin freely off the ground.
2. **Drive Direction & Symmetry**:
   - In `/manual`, jog **Forward** (+50%): verify both left and right wheels rotate forward.
   - Jog **Reverse** (-50%): verify both sides rotate backward.
   - Jog **Spin Left** and **Spin Right**: verify differential counter-rotation.
   - Test motor speed slider (20% to 100%) and verify PWM duty changes smoothly.
3. **Encoder Pulse Telemetry**:
   - Spin left wheel manually by hand for 1 full revolution; confirm `enc.l` increments by approximately 20 pulses in the telemetry display.
   - Spin right wheel manually for 1 revolution; confirm `enc.r` increments accurately.
4. **Deadband & Coasting**:
   - Set speed to 5% (below motor stall threshold); verify PWM cut to prevent motor whine.
   - Release joystick or key; confirm motors actively brake to 0 PWM within 50 ms.

---

## Stage 3: Floor Without Plants (Navigation Baseline)
**Objective**: Validate straight-line drive accuracy, turning, IMU heading integration, and obstacle cutoff on open ground.

1. **Straight Distance Calibration**:
   - Place rover on a measured 1.0-meter floor tape line.
   - Open `/calibration` -> **Encoder Calibration Wizard**.
   - Issue command `move: 1000` (1000 mm).
   - Measure actual vehicle travel with tape measure.
   - Update `mm_per_pulse` configuration factor (`cfg: enc, <val>`) until travel error is under 1.5 cm over 1 meter.
2. **Turn & IMU Heading Calibration**:
   - Command `turn: 90` (pivot turn 90° clockwise).
   - Verify MPU6050 Z-axis gyro integration stops rotation when heading delta reaches 90° ± 2°.
   - Test 180° turn and return to start.
3. **Ultrasonic Obstacle Safety Cutoff**:
   - Drive rover forward in manual mode toward a solid cardboard box placed 1 meter ahead.
   - As rover approaches within configured obstacle threshold (default 25 cm), verify:
     - Rover immediately cuts drive motors.
     - Mode transitions to `PAUSED`.
     - Alert banner `OBSTACLE` displays in the UI with measured distance.
     - Forward drive commands are rejected with `ok: false, reason: "obstacle"`. Reverse drive remains permitted to back away safely.

---

## Stage 4: One Plant Water Only (End-to-End Soil Moisture Cycle)
**Objective**: Verify single-point soil moisture detection and automated targeted watering.

1. **Setup**:
   - Place a single potted tomato/pepper plant with dry soil (measured moisture < 35%).
   - Fill Tank 1 with clean water.
   - In Settings, set `Moisture Threshold = 40%` and `Water Dose = 50 ml`.
2. **Execution**:
   - Position rover aligned with plant pot.
   - Run single-plant sequence:
     - Nozzle/cam tilted to target.
     - Soil probe lowers into pot until soil contact or lower limit.
     - Analog moisture reading taken; rover registers e.g. 28% (< 40% threshold).
     - Probe fully retracts to `UP` limit switch.
     - Water pump engages for calibrated time (e.g. 5.0 seconds for 50 ml).
   - Confirm water is delivered precisely to pot base with zero leakage.
   - Confirm plant record updates in Greenhouse Map (`/field-map`) with status `watered (drop icon)`.

---

## Stage 5: One Plant With Printed Diseased Leaf (Targeted Spraying)
**Objective**: Verify dual-pose vision scanning, FastAPI ML classification, decision logic, and targeted foliar spraying.

1. **Setup**:
   - Attach a printed high-resolution photo of an early-blight diseased leaf to the plant foliage.
   - **Safety Requirement**: Fill Tank 2 (treatment tank) with **plain water** for testing.
   - In Settings, set `High Confidence Threshold = 0.80`, `Treatment Dose = 20 ml`.
2. **Execution**:
   - Rover positions at plant.
   - Camera tilts to `leaf` pose (45°); captures JPEG and posts to `/api/scan`.
   - FastAPI classifier evaluates crop model; returns `leaf_diseased` with confidence >= 0.85.
   - Camera tilts to `stem` pose (15°); captures JPEG; classifier returns `stem_healthy`.
   - Decision engine evaluates outputs: leaf disease exceeds high confidence threshold.
   - Pan/tilt nozzle aims directly at the leaf coordinates.
   - Treatment pump runs for calibrated duration (e.g. 2.0 s for 20 ml).
   - Verify plain water spray mist covers the target printed leaf without over-spraying.
   - Confirm plant record saved to backend and flagged as `treated (purple)` on map.

---

## Stage 6: 3 to 5 Plant Test Bed (Full Autonomous Mission)
**Objective**: Full end-to-end multi-row greenhouse bed navigation and orchestrator validation.

1. **Bed Layout**:
   - Arrange 4 plants in a straight bed spaced 50 cm apart:
     - Plant 1: Healthy, wet soil (no action).
     - Plant 2: Dry soil, healthy foliage (water only).
     - Plant 3: Wet soil, printed diseased leaf (foliar spray only).
     - Plant 4: Dry soil, printed diseased leaf (water + spray).
2. **Pre-Run Checklist**:
   - Open `/mission`.
   - Complete Pre-Run Checklist: Battery > 11.8V, BLE connected, Camera online, E-stop released, Selftest passed, Tanks verified filled.
3. **Mission Run**:
   - Switch global Auto toggle to **ON**.
   - Confirm ESP32 transitions to `mode: mission`.
   - Watch `missionRunner` orchestrate sequential waypoints:
     - Auto drives 50 cm between plants using encoder PID.
     - Takes probe moisture readings and camera scans at each station.
     - Applies targeted water or treatment only where indicated.
     - Avoids dry run if tank level estimate is low.
     - Returns to starting home base upon mission completion.
   - Verify Mission History (`/history`) logs all plant outcomes, photo URLs, and applied fluid volumes.

---

## Fault Test Matrix

| # | Fault Condition | Trigger Method | Expected Rover Behavior | Expected UI Response | Recovery Action |
|---|---|---|---|---|---|
| **F-1** | **Emergency Stop (E-Stop)** | Depress physical red mushroom E-stop button during driving or pumping. | Firmware ISR immediately cuts all motor PWM and de-energizes pump relays (< 10 ms). Mode latches into `ESTOP`. | Telemetry displays `mode: estop`. Prominent red E-stop banner appears. All driving controls locked out. | Twist-release hardware E-stop button. In UI, click **Reset E-Stop**. Rover transitions to `IDLE`. |
| **F-2** | **Low Battery Cutoff** | Adjust bench supply or config threshold so voltage <= 11.2V (`bat_cutoff`). | Firmware triggers `LOW_BAT_CUTOFF`. All motors, servos, and pumps immediately disabled. | Alert `LOW_BAT_CUTOFF: Battery below cutoff (11.2V)`. Auto mission pauses. Manual controls disabled. | Re-charge or swap 3S battery (voltage > 11.6V). Rover unlatches low battery safety state. |
| **F-3** | **Bluetooth Drop / Range Loss** | Turn off laptop Bluetooth adapter or walk rover out of range while moving. | ESP32 heartbeat watchdog times out after 1000 ms (`HB_LOST`). Motors stop immediately. Mode transitions to `PAUSED`. | UI updates connection status to `Disconnected`. Clears telemetry. Auto mission pauses at current plant with **Resume** option. | Reconnect BLE. UI verifies safety checks. Click **Resume Mission** to continue from interrupted plant. |
| **F-4** | **Stuck Probe Mechanism** | Hold the probe carriage during lowering/raising so limit switch is not reached in 4 seconds. | Probe servo power cut after 4.0s timeout. Drive locomotion strictly disabled to prevent bending probe during rover motion. Mode sets to `FAULT`. | Alert `PROBE_STUCK: Soil probe limit switch timeout: probe could not retract UP`. Drive buttons disabled (`isProbeUp = false`). | Manually inspect probe lead-screw / linkage. Click **Raise Probe** or recalibrate upper limit switch in `/calibration`. |
| **F-5** | **Pump Timeout / Dose Cap** | Submit manual or scripted pump command requesting excessive duration (e.g. 30 seconds). | Firmware hardware timer clamps execution at hard-coded maximum (`MAX_PUMP_RUN_MS = 10000 ms`). Relays turn off automatically. | Pump runs for exactly 10.0s max. Backend logs dose cap event. | Normal operation; prevents greenhouse flooding and pump motor burnout. |
| **F-6** | **Camera Offline / Wi-Fi Drop** | Power down ESP32-CAM or disconnect camera Wi-Fi during inspection. | Backend `/api/scan` detects HTTP connection timeout (5 seconds). Performs 1 automatic retry; marks vision check skipped. | UI displays warning: `Camera offline`. Mission pauses and notifies operator instead of spraying blind. | Verify camera 5V power and Wi-Fi SSID. Click **Retry Plant Scan** in dashboard. |
| **F-7** | **Tab Closed / Window Navigated Away** | Close browser tab or switch to another tab while holding manual forward arrow key. | Global `beforeunload`, `pagehide`, and `visibilitychange` listeners emit `{ c: "stop" }`. Firmware stops motors immediately. | Motors halt. Rover does not keep driving runaway. | Reopen tab; reconnect rover safely. |
| **F-8** | **Chassis Tilt / Tip-Over** | Tilt rover chassis > 22.5° on an uneven greenhouse slope. | MPU6050 accelerometer detects excessive roll/pitch. Firmware triggers `TILT` fault and halts motors. | Alert `TILT: Excessive tilt: > 22.5 deg`. Driving locked out. | Place rover back onto level ground; click alert acknowledgment / reset. |
