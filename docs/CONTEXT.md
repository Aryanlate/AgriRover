# Agri-Rover context
Rover: main ESP32 (30-pin) + PCA9685 servo driver, 2x L298N, encoders, MPU6050,
ultrasonic, DHT22, soil sensor on a probe servo (limit switches), 2 pumps via relay
(tank 1 water, tank 2 treatment), ESP32-CAM on a tilt servo, E-stop, battery monitor.
 
Links: website (React, on laptop, Chrome/Edge, localhost) <-BLE-> main ESP32.
ESP32-CAM uses Wi-Fi. FastAPI backend on the laptop fetches camera images, runs a
small image classifier, stores data in SQLite. Protocol: docs/ble_protocol.md.
 
Plants: tomato, potato, pepper, brinjal (chosen per mission). Leaves only,
no fruits, vegetables, or stems.
Classifier classes: leaf_healthy, leaf_diseased, and optional background.
Folder name = label, no boxes. The model is trained only on public images of
healthy and diseased leaves (plus optional background).
 
Per plant (website orchestrates): move -> probe read -> cam pose leaf -> scan ->
decide -> aim nozzle -> pump (capped) -> log -> next plant.
 
Decision: water if moisture < threshold. Treat (tank 2) if the leaf is diseased
at or above the high confidence, aiming at the leaf. Between low and high =
unsure, never spray. Background = no plant found (retry once, then skip). No spray
if battery low, tank estimate low, or E-stop. Tank use = pump flow rate x run time.
 
Safety (in firmware): stop on no heartbeat for 1 s, BLE drop, E-stop, low battery,
tilt, obstacle. Probe must be up before moving. Hard pump time caps. All outputs
OFF at boot.
 
Rules: never invent pins (use docs/pin_map.md). Only edit the folder named in the
task. Be concise. List files changed and how to test.
