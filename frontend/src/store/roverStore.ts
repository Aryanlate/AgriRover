/**
 * Zustand Store for Rover Connection, Telemetry, Mode, Alerts, and Log
 */

import { create } from 'zustand';
import { BleTransport, MockTransport } from '../services/ble';
import type {
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
const initialType: TransportType =
  (typeof localStorage !== 'undefined' && (localStorage.getItem(STORAGE_TRANSPORT_KEY) as TransportType)) ||
  'mock';

let activeTransport: RoverTransport = initialType === 'ble' ? new BleTransport() : new MockTransport();

const isBluetoothSupported =
  typeof navigator !== 'undefined' && Boolean((navigator as any).bluetooth);

export const useRoverStore = create<RoverState>((set, get) => {
  // Setup listener bridges
  const setupTransportListeners = (t: RoverTransport) => {
    t.onStatusChange((status, error) => {
      set({ connectionStatus: status, connectionError: error || null });
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
          mode: msg.mode,
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
          // Also register refused command in alerts
          const refusedAlert: AlertEntry = {
            id: Math.random().toString(36).substring(2, 9),
            code: 'CMD_REFUSED',
            message: `Command '${msg.c}' refused: ${msg.reason}`,
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
        const newFaultAlert: AlertEntry = {
          id: Math.random().toString(36).substring(2, 9),
          code: msg.code,
          message: `Rover Fault: ${msg.code}`,
          timestamp: now,
          acknowledged: false,
        };
        set((state) => ({ alerts: [newFaultAlert, ...state.alerts], mode: 'fault' }));
      }
    });
  };

  setupTransportListeners(activeTransport);

  return {
    transportType: initialType,
    transport: activeTransport,
    isWebBluetoothSupported: isBluetoothSupported,

    connectionStatus: 'disconnected',
    connectionError: null,

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

      const newTransport = type === 'ble' ? new BleTransport() : new MockTransport();
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
      });
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
      set({ connectionStatus: 'disconnected', connectionError: null });
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
      return send({ c: 'estop_reset' });
    },

    setMode: async (mode: 'idle' | 'manual' | 'mission') => {
      const { send } = get();
      set({
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
