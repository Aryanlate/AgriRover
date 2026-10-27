/**
 * BLE Protocol Types (single source of truth: docs/ble_protocol.md)
 */

export const BLE_CONFIG = {
  DEVICE_NAME: 'AgriRover',
  SERVICE_UUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  WRITE_CHAR_UUID: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  NOTIFY_CHAR_UUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  HEARTBEAT_INTERVAL_MS: 300,
  HEARTBEAT_TIMEOUT_MS: 1000,
};

export type RoverMode = 'idle' | 'manual' | 'mission' | 'paused' | 'estop' | 'fault';
export type ProbeState = 'up' | 'down' | 'moving' | 'stuck';

export type FaultCode =
  | 'PROBE_STUCK'
  | 'LOW_BAT_CUTOFF'
  | 'TILT'
  | 'SLIP'
  | 'HB_LOST'
  | 'ESTOP'
  | 'OBSTACLE'
  | 'SENSOR_FAIL';

// ----------------------------------------------------
// Website -> ESP32 Commands (field 'c')
// ----------------------------------------------------
export type CommandHeartbeat = { c: 'hb' };
export type CommandDrive = { c: 'drive'; l: number; r: number }; // -100..100
export type CommandStop = { c: 'stop' };
export type CommandEstopReset = { c: 'estop_reset' };
export type CommandMode = { c: 'mode'; m: 'idle' | 'manual' | 'mission' };
export type CommandMove = { c: 'move'; mm: number };
export type CommandTurn = { c: 'turn'; deg: number };
export type CommandProbe = { c: 'probe'; a: 'down' | 'up' | 'read' };
export type CommandNozzle = { c: 'nozzle'; pan: number; tilt: number };
export type CommandCamTilt = { c: 'camtilt'; pose: 'leaf' | 'stem' };
export type CommandPump = { c: 'pump'; id: 'water' | 'treat'; ms: number };
export type CommandCfg = { c: 'cfg'; k: string; v: string | number };
export type CommandSelfTest = { c: 'selftest' };

export type RoverOutMessage =
  | CommandHeartbeat
  | CommandDrive
  | CommandStop
  | CommandEstopReset
  | CommandMode
  | CommandMove
  | CommandTurn
  | CommandProbe
  | CommandNozzle
  | CommandCamTilt
  | CommandPump
  | CommandCfg
  | CommandSelfTest;

// ----------------------------------------------------
// ESP32 -> Website Messages (field 't')
// ----------------------------------------------------
export interface TelemetryData {
  bat: {
    v: number;       // e.g. 12.1
    pct: number;     // 0..100%
    low: boolean;
  };
  mode: RoverMode;
  soil: number;      // raw ADC (e.g. 2100) or calibrated
  temp: number;      // °C (DHT22)
  hum: number;       // % (DHT22)
  tilt: number;      // deg from MPU6050
  dist: number;      // cm from ultrasonic
  probe: ProbeState;
  enc: {
    l: number;       // pulse or mm
    r: number;
  };
}

export type MessageTelemetry = {
  t: 'tel';
} & TelemetryData;

export type MessageAck = {
  t: 'ack';
  c: string;         // command acknowledged
  ok: boolean;
  v?: any;
  reason?: string;
};

export type MessageEvent = {
  t: 'ev';
  e: 'arrived' | 'probe_done' | 'mode' | string;
  mm?: number;
  deg?: number;
  mode?: RoverMode;
  [key: string]: any;
};

export type MessageAlert = {
  t: 'al';
  code: string;
  msg: string;
};

export type MessageFault = {
  t: 'fault';
  code: FaultCode | string;
};

export type RoverInMessage =
  | MessageTelemetry
  | MessageAck
  | MessageEvent
  | MessageAlert
  | MessageFault;

export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export type TransportType = 'ble' | 'mock';
