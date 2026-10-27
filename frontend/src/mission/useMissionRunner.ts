/**
 * Hook for consuming the MissionRunner state machine in React components
 */

import { useState, useEffect } from 'react';
import { MissionRunner } from './missionRunner';
import type { RunnerSnapshot } from './missionRunner';
import { useRoverStore } from '../store/roverStore';
import { apiClient } from '../services/api/client';
import type { RoverTransport } from '../services/ble/transport';

let globalRunner: MissionRunner | null = null;
let currentTransport: RoverTransport | null = null;

export function getMissionRunner(): MissionRunner {
  const store = useRoverStore.getState();
  if (!globalRunner || currentTransport !== store.transport) {
    if (globalRunner && globalRunner.getSnapshot().status === 'idle') {
      globalRunner.destroy();
      globalRunner = null;
    }
    if (!globalRunner) {
      currentTransport = store.transport;
      globalRunner = new MissionRunner({
        transport: store.transport,
        apiClient,
        getTelemetry: () => useRoverStore.getState().telemetry,
      });
    }
  }
  return globalRunner;
}

export function useMissionRunner() {
  const transport = useRoverStore((s) => s.transport);
  const [runner, setRunner] = useState<MissionRunner>(() => getMissionRunner());
  const [snapshot, setSnapshot] = useState<RunnerSnapshot>(() => runner.getSnapshot());

  useEffect(() => {
    const activeRunner = getMissionRunner();
    setRunner(activeRunner);
    const unsubscribe = activeRunner.subscribe((snap) => {
      setSnapshot(snap);
    });
    return () => {
      unsubscribe();
    };
  }, [transport]);

  return { runner, snapshot };
}
