# Agri-Rover context
Rover: main ESP32 (30-pin) + PCA9685 servo driver, 2x L298N, encoders, MPU6050,
ultrasonic, DHT22, soil sensor on a probe servo (limit switches), 2 pumps via relay
(tank 1 water, tank 2 treatment), ESP32-CAM on a tilt servo, E-stop, battery monitor.
 
Links: website (React, on laptop, Chrome/Edge, localhost) <-BLE-> main ESP32.
ESP32-CAM uses Wi-Fi. FastAPI backend on the laptop fetches camera images, runs a
small image classifier, stores data in SQLite. Protocol: docs/ble_protocol.md.
 
Plants: tomato, potato, pepper, brinjal (chosen per mission). Leaves and stems only,
no fruits or vegetables.
Classifier classes: leaf_healthy, leaf_diseased, stem_healthy, stem_diseased,
background. Folder name = label, no boxes. The camera pose (leaf or stem) tells
which part is being checked, so only that part classes plus background are used.
 
Per plant (website orchestrates): move -> probe read -> cam pose leaf -> scan ->
pose stem -> scan -> decide -> aim nozzle -> pump (capped) -> log -> next plant.
 
Decision: water if moisture < threshold. Treat (tank 2) if a part is diseased at or
above the high confidence, aiming at the leaf or stem. Between low and high =
unsure, never spray. Background = no plant found (retry once, then skip). No spray
if battery low, tank estimate low, or E-stop. Tank use = pump flow rate x run time.
 
Safety (in firmware): stop on no heartbeat for 1 s, BLE drop, E-stop, low battery,
tilt, obstacle. Probe must be up before moving. Hard pump time caps. All outputs
OFF at boot.
 
Rules: never invent pins (use docs/pin_map.md). Only edit the folder named in the
task. Be concise. List files changed and how to test.
