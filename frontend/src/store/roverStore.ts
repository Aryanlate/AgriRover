/**
 * Zustand Store for Rover Connection, Telemetry, Mode, Alerts, and Log
 */

import { create } from 'zustand';
import { BleTransport, MockTransport, MqttTransport, isMqttTransport, mqttSettingsExist } from '../services/ble';
import type {
  MqttStatusDetails,
  RoverInMessage,
  RoverMode,
  RoverOutMessage,
  RoverTransport,
  TelemetryData,
  TransportStatus,
  TransportType,
} from '../services/ble';

export interface AlertEntry {
  id: string;
  code: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export interface LogEntry {
  id: string;
  direction: 'in' | 'out';
  message: any;
  timestamp: Date;
}

export interface TelemetryPoint {
  timestamp: Date;
  temp: number;
  hum: number;
  soil: number;
}

export interface CommandAck {
  c: string;
  ok: boolean;
  reason?: string;
  v?: any;
  timestamp: Date;
}

interface RoverState {
  // Transports
  transportType: TransportType;
  transport: RoverTransport;
  isWebBluetoothSupported: boolean;

  // Status
  connectionStatus: TransportStatus;
  connectionError: string | null;

  // MQTT broker/rover/camera status (null when MQTT is not the active transport)
  mqttDetails: MqttStatusDetails | null;

  // Rover Telemetry & Mode
  telemetry: TelemetryData | null;
  lastTelemetryTime: Date | null;
  telemetryHistory: TelemetryPoint[];
  mode: RoverMode;
  currentTask: string;

  // Tanks (in ml)
  waterTankMl: number;
  treatTankMl: number;
  tankCapacityMl: number;

  // Acks & Probe Event
  latestAck: CommandAck | null;
  probeMoistureResult: number | null;

  // History & Debug
  alerts: AlertEntry[];
  log: LogEntry[];

  // Actions
  setTransportType: (type: TransportType) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (msg: RoverOutMessage) => Promise<boolean>;
  emergencyStop: () => Promise<boolean>;
  resetEstop: () => Promise<boolean>;
  setMode: (mode: 'idle' | 'manual' | 'mission') => Promise<boolean>;
  setCurrentTask: (task: string) => void;
  deductTank: (type: 'water' | 'treat', ml: number) => void;
  refillTanks: () => void;
  ackAlert: (id: string) => void;
  clearAlerts: () => void;
  clearLog: () => void;
}

// Initialise transport instance based on preference
const STORAGE_TRANSPORT_KEY = 'agri_rover_transport_pref';
const storedType =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem(STORAGE_TRANSPORT_KEY) as TransportType | null)
    : null;
// MQTT is the default layer. BLE and Mock remain selectable in Settings.
// Fall back to Mock only when the browser is non-MQTT-capable or MQTT settings are absent.
const initialType: TransportType =
  storedType === 'ble' || storedType === 'mock' || storedType === 'mqtt'
    ? storedType
    : mqttSettingsExist()
      ? 'mqtt'
      : 'mock';

const createTransport = (type: TransportType): RoverTransport => {
  if (type === 'mqtt') return new MqttTransport();
  if (type === 'ble') return new BleTransport();
  return new MockTransport();
};

let activeTransport: RoverTransport = createTransport(initialType);

const isBluetoothSupported =
  typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);

export const useRoverStore = create<RoverState>((set, get) => {
  // Setup listener bridges
  const setupTransportListeners = (t: RoverTransport) => {
    t.onStatusChange((status, error) => {
      const prevStatus = get().connectionStatus;
      set({ connectionStatus: status, connectionError: error || null });

      if (status === 'disconnected' || status === 'error') {
        // Clear telemetry & reset rover active state on disconnect
        set({
          telemetry: null,
          lastTelemetryTime: null,
          probeMoistureResult: null,
          latestAck: null,
          mode: 'idle',
          currentTask: 'Disconnected from rover',
        });

        // If previously connected or failed with error, log explicit safety alert
        if (prevStatus === 'connected' || status === 'error') {
          const disconnectAlert: AlertEntry = {
            id: Math.random().toString(36).substring(2, 9),
            code: 'BLE_DISCONNECT',
            message: error
              ? `Bluetooth connection lost: ${error}. Rover halted.`
              : 'Bluetooth connection lost. Rover stopped.',
            timestamp: new Date(),
            acknowledged: false,
          };
          set((state) => ({ alerts: [disconnectAlert, ...state.alerts] }));
        }
      }
    });

    t.onMessage((msg: RoverInMessage) => {
      const now = new Date();

      // Append to log (keep last 100 entries, skip hb)
      if ((msg as any).c !== 'hb') {
        set((state) => ({
          log: [
            {
              id: Math.random().toString(36).substring(2, 9),
              direction: 'in',
              message: msg,
              timestamp: now,
            },
            ...state.log.slice(0, 99),
          ],
        }));
      }

      // Handle message types
      if (msg.t === 'tel') {
        const point: TelemetryPoint = {
          timestamp: now,
          temp: msg.temp,
          hum: msg.hum,
          soil: msg.soil,
        };

        set((state) => ({
          telemetry: {
            bat: msg.bat,
            mode: msg.mode,
            soil: msg.soil,
            temp: msg.temp,
            hum: msg.hum,
            tilt: msg.tilt,
            dist: msg.dist,
            probe: msg.probe,
            enc: msg.enc,
          },
          lastTelemetryTime: now,
          telemetryHistory: [...state.telemetryHistory.slice(-29), point],
          // Preserve manual mode if user activated it and rover is just reporting idle
          mode: (state.mode === 'manual' && msg.mode === 'idle') ? 'manual' : msg.mode,
        }));
      } else if (msg.t === 'ack') {
        const ackData: CommandAck = {
          c: msg.c,
          ok: msg.ok,
          reason: msg.reason,
          v: msg.v,
          timestamp: now,
        };
        set({ latestAck: ackData });

        if (!msg.ok && msg.reason) {
          // Also register refused command in alerts with detailed reason
          const refusedAlert: AlertEntry = {
            id: Math.random().toString(36).substring(2, 9),
            code: 'CMD_REFUSED',
            message: `Command '${msg.c}' refused by rover: ${msg.reason}`,
            timestamp: now,
            acknowledged: false,
          };
          set((state) => ({ alerts: [refusedAlert, ...state.alerts] }));
        }
      } else if (msg.t === 'ev') {
        if (msg.e === 'probe_done' && typeof msg.soil === 'number') {
          set({ probeMoistureResult: msg.soil });
        } else if (msg.e === 'mode' && msg.mode) {
          set({ mode: msg.mode });
        }
      } else if (msg.t === 'al') {
        const newAlert: AlertEntry = {
          id: Math.random().toString(36).substring(2, 9),
          code: msg.code,
          message: msg.msg,
          timestamp: now,
          acknowledged: false,
        };
        set((state) => ({ alerts: [newAlert, ...state.alerts] }));
      } else if (msg.t === 'fault') {
        // Detailed fault messages for all safety codes
        const faultDescriptions: Record<string, string> = {
          PROBE_STUCK: 'Soil probe limit switch timeout: probe could not retract UP. Motion disabled.',
          LOW_BAT_CUTOFF: 'Battery voltage dropped below critical cutoff (11.2V). Motors and pumps halted.',
          TILT: 'Chassis inclination exceeded safety limit (> 22.5°). Rover stopped to prevent rollover.',
          SLIP: 'Wheel traction slip detected: drive encoders turning without vehicle motion.',
          HB_LOST: 'Heartbeat timeout: BLE communication silence exceeded 1000 ms. Rover stopped.',
          ESTOP: 'Emergency stop engaged: all actuators and pumps disabled.',
          OBSTACLE: 'Front obstacle detected within safety cutoff threshold.',
          SENSOR_FAIL: 'Critical sensor hardware failure (IMU or ADC bus dropped).',
        };

        const descriptiveMsg =
          faultDescriptions[msg.code] || `Rover hardware fault: ${msg.code}`;

        const newFaultAlert: AlertEntry = {
          id: Math.random().toString(36).substring(2, 9),
          code: msg.code,
          message: descriptiveMsg,
          timestamp: now,
          acknowledged: false,
        };
        set((state) => ({ alerts: [newFaultAlert, ...state.alerts], mode: 'fault' }));
      }
    });

    // MQTT-only: mirror broker/rover/camera status into the store for the top bar & banners
    if (isMqttTransport(t)) {
      t.onMqttStatus((details) => set({ mqttDetails: details }));
    }
  };

  setupTransportListeners(activeTransport);

  return {
    transportType: initialType,
    transport: activeTransport,
    isWebBluetoothSupported: isBluetoothSupported,

    connectionStatus: 'disconnected',
    connectionError: null,
    mqttDetails: null,

    telemetry: null,
    lastTelemetryTime: null,
    telemetryHistory: [],
    mode: 'idle',
    currentTask: 'Standing by at origin',

    waterTankMl: 780,
    treatTankMl: 820,
    tankCapacityMl: 1000,

    latestAck: null,
    probeMoistureResult: null,

    alerts: [],
    log: [],

    setTransportType: (type: TransportType) => {
      const current = get().transport;
      if (current.status === 'connected' || current.status === 'connecting') {
        current.disconnect();
      }

      const newTransport = createTransport(type);
      activeTransport = newTransport;
      setupTransportListeners(newTransport);

      try {
        localStorage.setItem(STORAGE_TRANSPORT_KEY, type);
      } catch {
        // ignore storage error
      }

      set({
        transportType: type,
        transport: newTransport,
        connectionStatus: 'disconnected',
        connectionError: null,
        mqttDetails: null,
      });

      // Auto-connect: Mock always (so the user isn't stuck offline), MQTT once settings exist.
      if (type === 'mock') {
        newTransport.connect().catch((e) => {
          console.warn('Mock connect error:', e);
        });
      } else if (type === 'mqtt' && mqttSettingsExist()) {
        newTransport.connect().catch((e) => {
          console.warn('MQTT connect error:', e);
        });
      }
    },

    connect: async () => {
      const { transport } = get();
      try {
        await transport.connect();
      } catch (err: any) {
        set({ connectionStatus: 'error', connectionError: err.message || 'Connection failed' });
        throw err;
      }
    },

    disconnect: async () => {
      const { transport } = get();
      await transport.disconnect();
      set({ connectionStatus: 'disconnected', connectionError: null, mqttDetails: null });
    },

    send: async (msg: RoverOutMessage) => {
      const { transport } = get();

      // Log outgoing message (skip hb from noisy logs)
      if (msg.c !== 'hb') {
        set((state) => ({
          log: [
            {
              id: Math.random().toString(36).substring(2, 9),
              direction: 'out',
              message: msg,
              timestamp: new Date(),
            },
            ...state.log.slice(0, 99),
          ],
        }));
      }

      // If pump command sent, deduct from tanks
      if (msg.c === 'pump') {
        const ml = Math.round((msg.ms / 1000) * (msg.id === 'water' ? 25 : 20));
        get().deductTank(msg.id, ml);
      }

      return transport.send(msg);
    },

    emergencyStop: async () => {
      const { transport } = get();
      console.warn('EMERGENCY STOP TRIGGERED!');

      const ok = await transport.send({ c: 'stop' });
      set((state) => ({
        mode: 'estop',
        currentTask: 'EMERGENCY STOP - All outputs halted',
        alerts: [
          {
            id: Math.random().toString(36).substring(2, 9),
            code: 'ESTOP',
            message: 'E-STOP activated by operator.',
            timestamp: new Date(),
            acknowledged: false,
          },
          ...state.alerts,
        ],
      }));
      return ok;
    },

    resetEstop: async () => {
      const { send } = get();
      set((state) => ({
        mode: state.mode === 'estop' ? 'idle' : state.mode,
        alerts: state.alerts.map((a) =>
          a.code === 'ESTOP' ? { ...a, acknowledged: true } : a
        ),
      }));
      return send({ c: 'estop_reset' });
    },

    setMode: async (mode: 'idle' | 'manual' | 'mission') => {
      const { send } = get();
      set({
        mode,
        currentTask:
          mode === 'mission'
            ? 'Autonomous field scanning & treatment'
            : mode === 'manual'
            ? 'Teleoperation manual drive active'
            : 'Idle - ready for command',
      });
      return send({ c: 'mode', m: mode });
    },

    setCurrentTask: (task: string) => set({ currentTask: task }),

    deductTank: (type: 'water' | 'treat', ml: number) => {
      set((state) => ({
        waterTankMl:
          type === 'water' ? Math.max(0, state.waterTankMl - ml) : state.waterTankMl,
        treatTankMl:
          type === 'treat' ? Math.max(0, state.treatTankMl - ml) : state.treatTankMl,
      }));
    },

    refillTanks: () => {
      set({ waterTankMl: 1000, treatTankMl: 1000 });
    },

    ackAlert: (id: string) => {
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
      }));
    },

    clearAlerts: () => set({ alerts: [] }),
    clearLog: () => set({ log: [] }),
  };
});

// Auto-connect on first load when MQTT was the saved transport and broker settings exist.
if (initialType === 'mqtt' && mqttSettingsExist()) {
  useRoverStore.getState().connect().catch((e) => {
    console.warn('MQTT auto-connect failed:', e);
  });
}
