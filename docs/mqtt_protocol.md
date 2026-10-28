# AgriRover MQTT Protocol Specification

This document defines the MQTT communication architecture between the AgriRover Web Dashboard, the Main ESP32 Controller, the ESP32-CAM Node, and the Local Python Backend.

---

## 1. Broker Configuration

| Parameter | Main ESP32 / ESP32-CAM / Backend | Web Dashboard (Browser) |
|---|---|---|
| **Host** | `rc2ad722.ala.asia-southeast1.emqxsl.com` | `rc2ad722.ala.asia-southeast1.emqxsl.com` |
| **Port** | `8883` (MQTT over TLS / MQTTS) | `8084` (MQTT over Secure WebSockets / WSS) |
| **Protocol / URI** | `mqtts://rc2ad722.ala.asia-southeast1.emqxsl.com:8083` / `8883` | `wss://rc2ad722.ala.asia-southeast1.emqxsl.com:8084/mqtt` |
| **Keepalive** | 5 seconds | 5 seconds |
| **Clean Session** | `true` | `true` |
| **Credentials** | Stored in `secrets.h` (ESP32) / `.env` (Backend) | Configured in browser Settings (`localStorage`) |

> [!CAUTION]
> **Credential Safety Rules:**
> 1. Firmware: credentials live exclusively in `firmware/src/secrets.h` and `firmware_cam/src/secrets.h` (both in `.gitignore`). Template files `secrets.example.h` are committed.
> 2. Backend: credentials live exclusively in `backend/.env` (in `.gitignore`). Template `.env.example` is committed.
> 3. Frontend: user enters broker URL, username, and password in browser **Settings**. They persist only in browser `localStorage`. A security note warns users that anyone with access to that browser profile can inspect stored credentials. **Never use `NEXT_PUBLIC_` or `VITE_` hardcoded environment variables for passwords.**

---

## 2. EMQX User Roles & ACL Rules

To configure EMQX Cloud access control, add the following 4 users with their corresponding client ACL permissions in the **EMQX Cloud Console -> Access Control -> Authentication / Authorization**:

### User Accounts
1. `rover` — Main ESP32 Controller
2. `cam` — ESP32-CAM Vision Node
3. `web` — React Web Dashboard
4. `backend` — Local Python FastAPI Backend

---

### Exact ACL Configuration Rules

```text
# ==============================================================================
# User: rover (Main ESP32 Controller)
# ==============================================================================
# Allowed to subscribe to incoming rover commands
allow subscribe agrirover/+/cmd

# Allowed to publish telemetry, acks, events, and last-will status
allow publish agrirover/+/telemetry
allow publish agrirover/+/ack
allow publish agrirover/+/ev
allow publish agrirover/+/status

# Deny everything else
deny all

# ==============================================================================
# User: cam (ESP32-CAM Node)
# ==============================================================================
# Allowed to subscribe to camera commands
allow subscribe agrirover/+/cam/cmd

# Allowed to publish captured photos, live stream frames, and status
allow publish agrirover/+/cam/img/#
allow publish agrirover/+/cam/live
allow publish agrirover/+/cam/status

# Deny everything else
deny all

# ==============================================================================
# User: web (Frontend Dashboard)
# ==============================================================================
# Allowed to read rover feedback and camera feeds
allow subscribe agrirover/+/telemetry
allow subscribe agrirover/+/status
allow subscribe agrirover/+/ack
allow subscribe agrirover/+/ev
allow subscribe agrirover/+/cam/status
allow subscribe agrirover/+/cam/img/#
allow subscribe agrirover/+/cam/live

# Allowed to issue commands to rover and camera
allow publish agrirover/+/cmd
allow publish agrirover/+/cam/cmd

# Deny everything else
deny all

# ==============================================================================
# User: backend (Local FastAPI Service)
# ==============================================================================
# Allowed to subscribe to all rover and camera topics
allow subscribe agrirover/#

# Allowed to trigger camera captures
allow publish agrirover/+/cam/cmd

# Deny everything else
deny all
```

---

## 3. Topic Architecture & QoS

Topic root: `agrirover/{roverId}/...` (Default `roverId = "rover01"`).
The `roverId` and topic prefix are configurable across all components (firmware, backend, frontend).

| Topic | Publisher | Subscribers | QoS | Retain | Payload Format | Purpose |
|---|---|---|---|---|---|---|
| `agrirover/{id}/cmd` | `web`, `backend` | `rover` | **0** (stop: **1**) | `false` | JSON | Motion, actuator & config commands |
| `agrirover/{id}/ack` | `rover` | `web`, `backend` | **0** | `false` | JSON | Command confirmation or rejection |
| `agrirover/{id}/ev` | `rover` | `web`, `backend` | **1** | `false` | JSON | Critical state events (arrived, probe_done) |
| `agrirover/{id}/telemetry` | `rover` | `web`, `backend` | **0** | `false` | JSON | 5 Hz sensor and state broadcast |
| `agrirover/{id}/status` | `rover` | `web`, `backend` | **1** | `true` | JSON | Connection & system state (LWT online=false) |
| `agrirover/{id}/cam/cmd` | `web`, `backend` | `cam` | **0** | `false` | JSON | Trigger capture, toggle LED, live feed |
| `agrirover/{id}/cam/img/{rid}` | `cam` | `web`, `backend` | **0** | `false` | Binary JPEG / Chunks | Single capture photo with request ID |
| `agrirover/{id}/cam/live` | `cam` | `web` | **0** | `false` | Binary JPEG | Low-framerate live view frames |
| `agrirover/{id}/cam/status` | `cam` | `web`, `backend` | **1** | `true` | JSON | Camera node online status (LWT online=false) |

> [!IMPORTANT]
> **Retain & Last Will and Testament (LWT):**
> - Commands (`cmd`, `cam/cmd`) must **NEVER** be published with `retain = true`.
> - Status topics (`status`, `cam/status`) are published with `retain = true`.
> - Rover LWT: topic `agrirover/{id}/status`, payload `{"online":false,"reason":"lwt"}`, QoS 1, retain `true`.
> - Camera LWT: topic `agrirover/{id}/cam/status`, payload `{"online":false,"reason":"lwt"}`, QoS 1, retain `true`.

---

## 4. Message Formats & Command Protocol

### 4.1 Client Identification & Sequence Numbers (`cid` and `seq`)
Every command published to `agrirover/{id}/cmd` must include:
- `cid` (`string`): A unique random identifier generated per browser session / page load (e.g. `web_a1f94c`).
- `seq` (`integer`): A strictly increasing integer sequence number generated by that client (`1, 2, 3...`).

**Replay & Order Guard:**
The rover tracks the highest `seq` received for each known `cid`. Any message with `seq <= last_seen_seq` for that `cid` is discarded and not executed.

---

### 4.2 Single Controller Ownership
To prevent conflicting teleoperation commands from multiple browser tabs or operators:
1. **Acquiring Ownership:** The first `cid` to send a valid heartbeat `hb` while no controller is active becomes the designated **Owner**.
2. **Heartbeat:** The website sends `hb` every **300 ms** while active.
3. **Releasing Ownership:** If the rover receives no heartbeat from the owner for **3.0 seconds**, ownership is automatically released (cleared to `none`).
4. **Privileges:** Only the owner `cid` can execute motion (`drive`, `move`, `turn`), pump actuation (`pump`), probe operations (`probe`), and nozzle positioning (`nozzle`).
5. **Universal Override:** `stop` is **ALWAYS accepted from ANY client**, regardless of ownership.
6. **Rejection:** Commands sent by a non-owner receive an acknowledgment:
   ```json
   {"t":"ack","c":"drive","ok":false,"reason":"another controller"}
   ```

---

### 4.3 Command Payloads (`agrirover/{id}/cmd`)

```json
// Heartbeat (every 300ms)
{"c":"hb","cid":"web_a1f94c","seq":102}

// Drive manual
{"c":"drive","l":60,"r":60,"cid":"web_a1f94c","seq":103}

// Emergency stop / Instant stop (accepted from any cid, QoS 1)
{"c":"stop","cid":"web_a1f94c","seq":104}

// Reset emergency stop
{"c":"estop_reset","cid":"web_a1f94c","seq":105}

// Set operational mode (idle | manual | mission)
{"c":"mode","m":"manual","cid":"web_a1f94c","seq":106}

// Autonomous motion commands
{"c":"move","mm":500,"cid":"web_a1f94c","seq":107}
{"c":"turn","deg":90,"cid":"web_a1f94c","seq":108}

// Actuators
{"c":"probe","a":"down","cid":"web_a1f94c","seq":109}       // down | up | read
{"c":"nozzle","pan":90,"tilt":45,"cid":"web_a1f94c","seq":110}
{"c":"camtilt","pose":"leaf","cid":"web_a1f94c","seq":111}  // leaf | stem
{"c":"pump","id":"water","ms":1200,"cid":"web_a1f94c","seq":112} // water | treat

// Runtime configuration & selftest
{"c":"cfg","k":"speed_default","v":"50","cid":"web_a1f94c","seq":113}
{"c":"selftest","cid":"web_a1f94c","seq":114}
```

---

### 4.4 Rover Feedback Payloads

#### Telemetry (`agrirover/{id}/telemetry` at 5 Hz)
```json
{
  "t": "tel",
  "bat": 12.3,
  "battery_v": 12.34,
  "mode": "manual",
  "soil": 42,
  "soil_raw": 2180,
  "temp": 25.4,
  "hum": 55.2,
  "tilt": 1.1,
  "dist": 82,
  "distance_cm": 82,
  "probe": "up",
  "pan": 90,
  "nozzle_tilt": 45,
  "lat": 0.0,
  "lng": 0.0,
  "enc": {"l": 120, "r": 122}
}
```

#### Status (`agrirover/{id}/status`, Retained)
```json
{
  "online": true,
  "ip": "192.168.1.105",
  "rssi": -62,
  "controller_cid": "web_a1f94c",
  "uptime_s": 342
}
```

#### Acknowledgments (`agrirover/{id}/ack`)
```json
{"t":"ack","c":"drive","ok":true}
{"t":"ack","c":"probe","ok":false,"reason":"another controller"}
```

#### Events (`agrirover/{id}/ev`, QoS 1)
```json
{"t":"ev","e":"arrived","mm":500}
{"t":"ev","e":"probe_done","a":"read","val":42}
{"t":"ev","e":"pump_done","id":"water"}
{"t":"ev","e":"mode","m":"manual"}
```

---

## 5. Camera Node Protocol (`ESP32-CAM`)

### 5.1 Camera Commands (`agrirover/{id}/cam/cmd`)
```json
// Trigger photo capture
{"cmd":"capture","rid":"req_9812"}

// Toggle flash illumination LED
{"cmd":"led","on":true}

// Control live video feed (low rate)
{"cmd":"live","on":true,"fps":1}
```
*Note on live stream:* The live feed will automatically shut off after **30 seconds** unless renewed by another `{"cmd":"live","on":true,...}` message.

---

### 5.2 Photo Capture & Chunking (`agrirover/{id}/cam/img/{rid}`)
When a capture command with request ID `rid` is received:
1. If the LED state was changed, the first camera frame is discarded to allow auto-exposure settling.
2. The JPEG image is captured in memory.
3. If payload size is $\le$ 16,384 bytes, it is published directly as a raw binary JPEG payload on:
   `agrirover/{id}/cam/img/{rid}`
4. If payload size exceeds 16,384 bytes, the image is published in chunks of 16 KB:
   - Chunk Header: 32 bytes ASCII header followed by raw bytes:
     `CHUNKV1|{rid}|{chunk_index}|{total_chunks}|` + raw byte slice.
   - Or individual indexed topic: `agrirover/{id}/cam/img/{rid}/{chunk_index}` with total count indicated in status or metadata.
   - In both cases, subscribers reassemble chunks by `rid` and verify completion before decoding JPEG.

