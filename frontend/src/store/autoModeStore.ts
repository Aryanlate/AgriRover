/**
 * Global Auto Mode Store
 * Manages autonomous mode engagement, pre-run verification, presets, and safety locks.
 * Single source of truth: docs/CONTEXT.md & docs/ble_protocol.md
 */

import { create } from 'zustand';
import type { MissionConfig } from '../mission/missionRunner';
import { getMissionRunner } from '../mission/useMissionRunner';
import { useRoverStore } from './roverStore';
import { apiClient } from '../services/api/client';

export const DEFAULT_MISSION_CONFIG: MissionConfig = {
  plant: 'tomato',
  rows: 1,
  plantsPerRow: 5,
  plantSpacingMm: 300,
  rowSpacingMm: 800,
  moistureThreshold: 35.0,
  waterDoseMl: 50.0,
  treatDoseMl: 25.0,
  perPlantWaterCapMl: 150.0,
  perPlantTreatCapMl: 60.0,
  perRunWaterCapMl: 2500.0,
  perRunTreatCapMl: 1000.0,
  lowConfidence: 0.60,
  highConfidence: 0.85,
  minBatteryPct: 20,
  waterPumpFlowRate: 25,
  treatPumpFlowRate: 20,
  initialWaterMl: 1000,
  initialTreatMl: 1000,
};

export interface AutoModeState {
  // Preset
  activePreset: MissionConfig;
  activePresetName: string;
  setActivePreset: (name: string, config: MissionConfig) => void;

  // Pre-run checklist items
  tanksFilled: boolean;
  setTanksFilled: (filled: boolean) => void;
  selfTestPassed: boolean;
  setSelfTestPassed: (passed: boolean) => void;
  cameraOnline: boolean;
  setCameraOnline: (online: boolean) => void;

  // Transition flags
  turningOffPending: boolean;
  setTurningOffPending: (pending: boolean) => void;

  // Actions
  checkPreRunReady: () => { ok: boolean; errors: string[] };
  engageAuto: () => Promise<{ success: boolean; errors?: string[] }>;
  disengageAuto: () => Promise<void>;
  pauseAuto: () => void;
  pollCameraHealth: () => Promise<void>;
}

export const useAutoModeStore = create<AutoModeState>((set, get) => {
  // Try to load any previously saved active preset config from localStorage
  let initialConfig = DEFAULT_MISSION_CONFIG;
  let initialName = 'Tomato - Standard Greenhouse';

  try {
    const saved = localStorage.getItem('agrirover_active_preset');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.config) {
        initialConfig = parsed.config;
        initialName = parsed.name || initialName;
      }
    }
  } catch {
    // Fallback to default
  }

  return {
    activePreset: initialConfig,
    activePresetName: initialName,
    setActivePreset: (name: string, config: MissionConfig) => {
      set({ activePreset: config, activePresetName: name });
      try {
        localStorage.setItem(
          'agrirover_active_preset',
          JSON.stringify({ name, config })
        );
      } catch {
        // Ignore storage error
      }
    },

    tanksFilled: true,
    setTanksFilled: (filled: boolean) => set({ tanksFilled: filled }),

    selfTestPassed: true, // Default to true or verified
    setSelfTestPassed: (passed: boolean) => set({ selfTestPassed: passed }),

    cameraOnline: true,
    setCameraOnline: (online: boolean) => set({ cameraOnline: online }),

    turningOffPending: false,
    setTurningOffPending: (pending: boolean) => set({ turningOffPending: pending }),

    checkPreRunReady: () => {
      const state = get();
      const rover = useRoverStore.getState();
      const tel = rover.telemetry;
      const errors: string[] = [];

      // 1. Connection
      if (rover.connectionStatus !== 'connected') {
        errors.push('Rover is disconnected. Connect via BLE or Mock in top bar.');
      }

      // 2. Battery
      const minBat = state.activePreset.minBatteryPct ?? 20;
      if (tel?.bat) {
        if (tel.bat.pct < minBat || tel.bat.low) {
          errors.push(`Battery (${tel.bat.pct}%) is below cutoff threshold (${minBat}%).`);
        }
      } else if (rover.connectionStatus === 'connected') {
        errors.push('Awaiting rover telemetry for battery validation.');
      }

      // 3. Camera (online or simulated in mock transport)
      const isCameraOk = state.cameraOnline || rover.transportType === 'mock';
      if (!isCameraOk) {
        errors.push('Vision system / ESP32-CAM is offline.');
      }

      // 4. E-Stop
      const hasEstop =
        rover.mode === 'estop' ||
        rover.alerts.some((a) => a.code === 'ESTOP' && !a.acknowledged);
      if (hasEstop) {
        errors.push('Emergency stop is currently engaged. Release physical switch & reset.');
      }

      // 5. Self-test
      if (!state.selfTestPassed) {
        errors.push('Hardware self-test diagnostic must pass before autonomous launch.');
      }

      // 6. Tanks filled
      if (!state.tanksFilled) {
        errors.push('Tanks filled verification checkbox is not ticked.');
      }

      return {
        ok: errors.length === 0,
        errors,
      };
    },

    engageAuto: async () => {
      const ready = get().checkPreRunReady();
      if (!ready.ok) {
        return { success: false, errors: ready.errors };
      }

      const { activePreset } = get();
      const rover = useRoverStore.getState();
      const runner = getMissionRunner();

      // Send mode=mission to ESP32
      await rover.send({ c: 'mode', m: 'mission' });

      // Start or resume mission runner
      const snap = runner.getSnapshot();
      if (snap.status === 'paused') {
        runner.resume();
      } else {
        runner.start(activePreset);
      }

      return { success: true };
    },

    disengageAuto: async () => {
      set({ turningOffPending: true });
      const rover = useRoverStore.getState();
      const runner = getMissionRunner();

      // 1. Send stop
      await rover.send({ c: 'stop' });

      // 2. Raise probe
      await rover.send({ c: 'probe', a: 'up' });

      // 3. Pause runner keeping current plant progress
      runner.pause('Auto switch turned OFF by operator');

      // 4. Send mode=manual
      await rover.send({ c: 'mode', m: 'manual' });
    },

    pauseAuto: () => {
      const runner = getMissionRunner();
      runner.pause('Operator paused via Auto switch/button');
      useRoverStore.getState().send({ c: 'stop' });
    },

    pollCameraHealth: async () => {
      try {
        await apiClient.checkHealth();
        set({ cameraOnline: true });
      } catch {
        set({ cameraOnline: false });
      }
    },
  };
});

// Subscribe to roverStore to resolve turningOffPending and handle safety triggers
useRoverStore.subscribe((roverState) => {
  // 1. Resolve turningOffPending when ESP32 confirms manual mode AND probe is up
  if (roverState.mode === 'manual' && roverState.telemetry?.probe === 'up') {
    if (useAutoModeStore.getState().turningOffPending) {
      useAutoModeStore.setState({ turningOffPending: false });
    }
  }

  // 2. Safety event monitoring: if fault, E-stop, low battery or disconnect occurs, pause runner
  const runner = getMissionRunner();
  const runnerSnap = runner.getSnapshot();
  if (runnerSnap.status === 'running') {
    if (roverState.connectionStatus !== 'connected') {
      runner.pause('Bluetooth connection dropped.');
    } else if (
      roverState.mode === 'estop' ||
      roverState.alerts.some((a) => a.code === 'ESTOP' && !a.acknowledged)
    ) {
      runner.pause('Emergency stop activated.');
    } else if (roverState.mode === 'fault') {
      runner.pause('Hardware fault triggered.');
    } else if (
      roverState.telemetry?.bat &&
      (roverState.telemetry.bat.pct < 20 || roverState.telemetry.bat.low)
    ) {
      runner.pause(`Battery level (${roverState.telemetry.bat.pct}%) below safety cutoff.`);
    }
  }
});
