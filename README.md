# Autonomous Agri-Rover

Precision agricultural rover for automated greenhouse plant inspection, soil moisture sensing, and targeted treatment (watering & foliar spraying).

---

## 1. How to Flash Both ESP32s

### Main Controller (ESP32 30-Pin DevKit)
Manages locomotion, encoders, MPU6050 IMU, HC-SR04 ultrasonic, DHT22, soil moisture probe servo/actuator, 2 relay pumps, pan/tilt nozzle, and Bluetooth LE GATT telemetry.

1. Connect the ESP32 dev board to your computer using a Micro-USB cable.
2. In VS Code with the **PlatformIO IDE** extension installed:
   - Open folder `firmware/`.
   - Click **PlatformIO: Upload** (or run `pio run -t upload` from the `firmware/` directory).
3. The board flashes at 115200 baud and begins advertising the BLE service `AgriRover` (Service UUID: `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`).

### Camera Node (AI-Thinker ESP32-CAM)
Captures high-resolution leaf and stem imagery and serves live MJPEG streams over local Wi-Fi.

1. Open `firmware_cam/src/secrets.h` and set your local 2.4 GHz Wi-Fi credentials:
   ```cpp
   const char* const WIFI_SSID = "Your_WiFi_Network";
   const char* const WIFI_PASS = "Your_WiFi_Password";
   ```
2. Connect the ESP32-CAM to an FTDI USB-to-UART adapter:
   - FTDI `5V` -> ESP32-CAM `5V` (must deliver >= 1A)
   - FTDI `GND` -> ESP32-CAM `GND`
   - FTDI `TX` -> ESP32-CAM `U0R` (GPIO 3)
   - FTDI `RX` -> ESP32-CAM `U0T` (GPIO 1)
   - **Bridge `IO0` to `GND`** to enter bootloader download mode.
3. In VS Code PlatformIO, open `firmware_cam/` and click **Upload** (or run `pio run -t upload`).
4. **Disconnect the `IO0` to `GND` jumper** and press the on-board **RST** button.
5. Open the Serial Monitor (115200 baud) to view the assigned local IP (e.g., `http://192.168.1.120`).

---

## 2. How to Run the System

### Quick Start (All-in-One)
- **Windows**: Double-click `start.bat` or run:
  ```cmd
  start.bat
  ```
- **macOS / Linux**: Make executable and run:
  ```bash
  chmod +x start.sh
  ./start.sh
  ```
This starts the FastAPI backend (`http://localhost:8000`), Vite dev server (`http://localhost:5173`), and automatically opens the dashboard in your default browser.

### Manual Start
1. **Backend** (Python 3.10+):
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```
2. **Frontend** (Node.js 18+):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in Google Chrome or Microsoft Edge.

---

## 3. How to Connect Bluetooth

1. Ensure the main ESP32 is powered on (BLE advertising name: `AgriRover`).
2. Open `http://localhost:5173` in **Google Chrome** or **Microsoft Edge**.
3. Click the **Connect** button on the top Bluetooth banner or **Connect AgriRover** on the Manual / Dashboard page.
4. Select `AgriRover` from the native browser Bluetooth pairing modal and click **Pair**.
5. Once connected, telemetry will stream at 5 Hz, heartbeat pings run every 300 ms, and the top bar indicator turns green.

---

## 4. How to Set the Camera IP

1. Find the ESP32-CAM IP from your router's client list or the FTDI Serial Monitor during boot (e.g. `192.168.1.120`).
2. In the web dashboard, navigate to **Settings** (`/settings`).
3. Enter the IP into the **Camera IP** field (e.g. `192.168.1.120`).
4. Click **Save Settings** or test the stream under the **Camera** page (`/camera`).

---

## 5. Troubleshooting

- **Bluetooth Not Found**:
  - Ensure main ESP32 is powered on and within 5–10 meters.
  - Verify no other device or browser tab is actively paired (NimBLE accepts one central BLE connection).
  - Check that Bluetooth is enabled in your OS settings.
  - Reset the main ESP32 via its EN/RST button to restart advertising.
- **Camera Offline**:
  - Ensure ESP32-CAM is connected to a **2.4 GHz Wi-Fi** network (ESP32 does not support 5 GHz).
  - Verify credentials in `firmware_cam/src/secrets.h`.
  - Test the camera directly in a browser tab at `http://<CAM_IP>/status` or `http://<CAM_IP>/capture`.
  - Ensure the power supply provides at least 5V / 1.5A peak; brownouts during Wi-Fi transmission will reset the camera.
  - Ensure the OV2640 camera ribbon cable is firmly seated and latched in its socket.
- **Wrong Browser**:
  - The Web Bluetooth API is supported natively only in **Chromium-based browsers** (Google Chrome, Microsoft Edge, Brave, Opera).
  - **Firefox and Safari do not support Web Bluetooth.** If opened in an unsupported browser, the app will offer a Mock Mode toggle for demonstration.
  - On Linux with Chrome, enable experimental flags at `chrome://flags/#enable-web-bluetooth-new-permissions-backend` if connection fails.
