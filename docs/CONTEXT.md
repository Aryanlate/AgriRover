# Agri-Rover context
Rover: main ESP32 (30-pin) + PCA9685 servo driver, 2x L298N, encoders, MPU6050,
ultrasonic, DHT22, soil sensor on a probe servo (limit switches), 2 pumps via relay
(tank 1 water, tank 2 treatment), ESP32-CAM on a tilt servo, E-stop, battery monitor.
 
Communication Links:
- Primary: MQTT via EMQX Cloud (`rc2ad722.ala.asia-southeast1.emqxsl.com`).
  - ESP32s & Backend: MQTTS (TLS 8883).
  - Website: WSS (`wss://rc2ad722.ala.asia-southeast1.emqxsl.com:8084/mqtt`).
  - Single communication layer connecting Website, Main ESP32, ESP32-CAM, and Python Backend.
  - Camera photos and live frames travel over MQTT topics.
- Secondary / Fallback: Web Bluetooth (BLE) directly between Website and Main ESP32 (selectable via build flag / UI Settings).
- Protocols: `docs/mqtt_protocol.md` (MQTT) and `docs/ble_protocol.md` (BLE fallback).
- FastAPI backend runs locally on laptop: fetches camera images over MQTT, runs leaf classifier, stores data in SQLite.

Plants: tomato, potato, pepper, brinjal (chosen per mission). Leaves only,
no fruits, vegetables, or stems.
Classifier classes: leaf_healthy and leaf_diseased only.
Folder name = label, no boxes. The model is trained on public images of
healthy and diseased leaves.
 
Per plant (website orchestrates): move -> probe read -> cam pose leaf -> scan ->
decide -> aim nozzle -> pump (capped) -> log -> next plant.
 
Decision: water if moisture < threshold. Since there is no background class,
a result is never "no plant found". The decision uses only the confidence
thresholds: diseased at or above the high confidence is treated (aiming at the leaf),
diseased between low and high is unsure and never sprayed, and everything else is
no action. No spray if battery low, tank estimate low, or E-stop.
Tank use = pump flow rate x run time.
 
Safety (in firmware): stop on no heartbeat for 1 s, Wi-Fi/MQTT/BLE drop, E-stop, low battery,
tilt, obstacle. Probe must be up before moving. Hard pump time caps. All outputs
OFF at boot. Single controller ownership via `cid`/`seq` with universal `stop` override.
 
Rules: never invent pins (use docs/pin_map.md). Only edit the folder named in the
task. Be concise. List files changed and how to test.
