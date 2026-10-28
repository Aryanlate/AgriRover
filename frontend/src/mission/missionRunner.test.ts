import { describe, it, expect, vi } from 'vitest';
import { MissionRunner } from './missionRunner';
import type { MissionConfig } from './missionRunner';
import type { RoverTransport } from '../services/ble/transport';
import type { RoverInMessage, RoverOutMessage, TransportStatus, TelemetryData } from '../services/ble/types';

interface MockRoverTransport extends RoverTransport {
  emitMessage: (msg: RoverInMessage) => void;
  triggerStatusChange: (status: TransportStatus, err?: string) => void;
  getSentMessages: () => RoverOutMessage[];
}

// Mock transport factory
function createMockTransport(): MockRoverTransport {
  const messageListeners = new Set<(msg: RoverInMessage) => void>();
  const statusListeners = new Set<(status: TransportStatus, error?: string) => void>();
  const sentMessages: RoverOutMessage[] = [];

  const transport: MockRoverTransport = {
    status: 'connected',
    name: 'MockTransport',
    async connect() {
      (this as any).status = 'connected';
    },
    async disconnect() {
      (this as any).status = 'disconnected';
    },
    async send(msg: RoverOutMessage): Promise<boolean> {
      sentMessages.push(msg);

      // Auto reply with events to unblock runner
      if (msg.c === 'move') {
        queueMicrotask(() => {
          transport.emitMessage({ t: 'ev', e: 'arrived', mm: (msg as any).mm });
        });
      } else if (msg.c === 'probe' && (msg as any).a === 'read') {
        queueMicrotask(() => {
          transport.emitMessage({ t: 'ev', e: 'probe_done', soil: 2000 });
        });
      }
      return true;
    },
    onMessage(listener: (msg: RoverInMessage) => void) {
      messageListeners.add(listener);
      return () => { messageListeners.delete(listener); };
    },
    onStatusChange(listener: (status: TransportStatus, error?: string) => void) {
      statusListeners.add(listener);
      return () => { statusListeners.delete(listener); };
    },
    // Test helpers
    emitMessage(msg: RoverInMessage) {
      messageListeners.forEach((l) => l(msg));
    },
    triggerStatusChange(status: TransportStatus, err?: string) {
      (this as any).status = status;
      statusListeners.forEach((l) => l(status, err));
    },
    getSentMessages() {
      return sentMessages;
    },
  };

  return transport;
}

const baseConfig: MissionConfig = {
  plant: 'tomato',
  rows: 1,
  plantsPerRow: 1,
  plantSpacingMm: 300,
  rowSpacingMm: 800,
  moistureThreshold: 35.0,
  waterDoseMl: 50.0,
  treatDoseMl: 25.0,
  perPlantWaterCapMl: 150.0,
  perPlantTreatCapMl: 60.0,
  perRunWaterCapMl: 2500.0,
  perRunTreatCapMl: 1000.0,
  lowConfidence: 0.6,
  highConfidence: 0.85,
  minBatteryPct: 20,
  waterPumpFlowRate: 25,
  treatPumpFlowRate: 20,
  initialWaterMl: 1000,
  initialTreatMl: 1000,
};

const defaultTelemetry: TelemetryData = {
  bat: { v: 12.2, pct: 85, low: false },
  mode: 'idle',
  soil: 2100,
  temp: 24.5,
  hum: 65.0,
  tilt: 1.2,
  dist: 85,
  probe: 'up',
  enc: { l: 0, r: 0 },
};

describe('MissionRunner Unit Tests', () => {
  it('normal plant: runs move, probe, vision scans, decide, spray and return to start', async () => {
    const transport = createMockTransport();
    const scanMock = vi.fn().mockImplementation(async (pose: string) => {
      if (pose === 'leaf') {
        return { result: { part: 'leaf', state: 'diseased', confidence: 0.95 } };
      }
      return { result: { part: 'stem', state: 'healthy', confidence: 0.92 } };
    });

    const decideMock = vi.fn().mockResolvedValue({
      actions: [
        { type: 'water', part: 'soil', dose_ml: 50, duration_ms: 20 },
        { type: 'treat', part: 'leaf', dose_ml: 25, duration_ms: 20 },
      ],
      skipped_actions: [],
      retry_needed: false,
    });

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => defaultTelemetry,
      sleep: () => Promise.resolve(), // fast instant sleep
    });

    await runner.start(baseConfig);

    const snapshot = runner.getSnapshot();
    expect(snapshot.status).toBe('completed');
    expect(snapshot.currentPlantIndex).toBe(1);
    expect(snapshot.plantLogs.length).toBe(1);

    const log = snapshot.plantLogs[0];
    expect(log.plantId).toBe('tomato_1');
    expect(log.leafState).toBe('diseased');
    expect(log.waterDispensedMl).toBe(50);
    expect(log.treatDispensedMl).toBe(25);

    // Verify sent commands
    const sent = transport.getSentMessages();
    expect(sent.some((m: RoverOutMessage) => m.c === 'mode' && (m as any).m === 'mission')).toBe(true);
    expect(sent.some((m: RoverOutMessage) => m.c === 'move' && (m as any).mm === 300)).toBe(true);
    expect(sent.some((m: RoverOutMessage) => m.c === 'probe' && (m as any).a === 'read')).toBe(true);
    expect(sent.some((m: RoverOutMessage) => m.c === 'camtilt' && (m as any).pose === 'leaf')).toBe(true);
    // Stem pose is not used in leaf-only sequence
    expect(sent.some((m: RoverOutMessage) => m.c === 'camtilt' && (m as any).pose === 'stem')).toBe(false);
    expect(sent.some((m: RoverOutMessage) => m.c === 'pump' && (m as any).id === 'water')).toBe(true);
    expect(sent.some((m: RoverOutMessage) => m.c === 'pump' && (m as any).id === 'treat')).toBe(true);
    // Return to start
    expect(sent.some((m: RoverOutMessage) => m.c === 'move' && (m as any).mm === -300)).toBe(true);
    expect(sent.some((m: RoverOutMessage) => m.c === 'mode' && (m as any).m === 'idle')).toBe(true);
  });

  it('unsure result: records skipped action and skips spraying when confidence is low', async () => {
    const transport = createMockTransport();
    const scanMock = vi.fn().mockImplementation(async (pose: string) => {
      if (pose === 'leaf') {
        return { result: { part: 'leaf', state: 'diseased', confidence: 0.65 } }; // Between 0.60 and 0.85
      }
      return { result: { part: 'stem', state: 'healthy', confidence: 0.70 } };
    });

    const decideMock = vi.fn().mockResolvedValue({
      actions: [],
      skipped_actions: [{ type: 'treat', reason: 'confidence 0.65 below high threshold 0.85' }],
      retry_needed: false,
    });

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => defaultTelemetry,
      sleep: () => Promise.resolve(),
    });

    await runner.start(baseConfig);

    const snapshot = runner.getSnapshot();
    expect(snapshot.status).toBe('completed');
    expect(snapshot.plantLogs.length).toBe(1);

    const log = snapshot.plantLogs[0];
    expect(log.waterDispensedMl).toBe(0);
    expect(log.treatDispensedMl).toBe(0);
    expect(log.skippedActions.length).toBe(1);
    expect(log.skippedActions[0]).toContain('treat: confidence 0.65');

    // No pump command should have been dispatched
    const sent = transport.getSentMessages();
    expect(sent.some((m: RoverOutMessage) => m.c === 'pump')).toBe(false);
  });

  it('no plant found: retries once, then skips without spraying', async () => {
    const transport = createMockTransport();
    const scanMock = vi.fn().mockImplementation(async (pose: string) => {
      return { result: { part: pose, state: 'no_plant', confidence: 0.90 } };
    });

    let callCount = 0;
    const decideMock = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          actions: [],
          skipped_actions: [{ type: 'all', reason: 'no plant detected, retrying' }],
          retry_needed: true,
        };
      }
      return {
        actions: [],
        skipped_actions: [{ type: 'skip', reason: 'no plant confirmed on retry' }],
        retry_needed: false,
      };
    });

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => defaultTelemetry,
      sleep: () => Promise.resolve(),
    });

    await runner.start(baseConfig);

    expect(decideMock).toHaveBeenCalledTimes(2);
    // Leaf should be scanned twice (initial + retry) = 2 scan calls in leaf-only mode
    expect(scanMock).toHaveBeenCalledTimes(2);

    const snapshot = runner.getSnapshot();
    expect(snapshot.status).toBe('completed');
    expect(snapshot.plantLogs[0].treatDispensedMl).toBe(0);
    expect(snapshot.plantLogs[0].waterDispensedMl).toBe(0);
  });

  it('bluetooth drop: pauses automatically and offers resume from current plant', async () => {
    const transport = createMockTransport();
    let runnerRef: MissionRunner | null = null;

    let disconnectedOnce = false;
    const scanMock = vi.fn().mockImplementation(async () => {
      // Simulate Bluetooth disconnection once during scan step
      if (runnerRef && !disconnectedOnce) {
        disconnectedOnce = true;
        transport.triggerStatusChange('disconnected');
      }
      return { result: { part: 'leaf', state: 'healthy', confidence: 0.95 } };
    });

    const decideMock = vi.fn().mockResolvedValue({
      actions: [],
      skipped_actions: [],
      retry_needed: false,
    });

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => defaultTelemetry,
      sleep: () => Promise.resolve(),
    });
    runnerRef = runner;

    // Start mission without awaiting completion immediately so we can inspect pause state
    const missionPromise = runner.start(baseConfig);

    // Yield to let execution hit the scan step
    await new Promise((r) => setTimeout(r, 20));

    const snapWhileDisconnected = runner.getSnapshot();
    expect(snapWhileDisconnected.status).toBe('paused');
    expect(snapWhileDisconnected.subStep).toBe('paused_bluetooth');
    expect(snapWhileDisconnected.pauseReason).toContain('Bluetooth connection dropped');

    // Simulate reconnect and resume
    transport.triggerStatusChange('connected');
    runner.resume();

    await missionPromise;
    expect(runner.getSnapshot().status).toBe('completed');
  });

  it('low battery: halts mission with fault when battery is below cutoff threshold', async () => {
    const transport = createMockTransport();
    const lowBatTelemetry: TelemetryData = {
      ...defaultTelemetry,
      bat: { v: 10.4, pct: 14, low: true }, // 14% is below minBatteryPct 20%
    };

    const scanMock = vi.fn();
    const decideMock = vi.fn();

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => lowBatTelemetry,
      sleep: () => Promise.resolve(),
    });

    await runner.start(baseConfig);

    const snapshot = runner.getSnapshot();
    expect(snapshot.status).toBe('fault');
    expect(snapshot.errorMessage).toContain('below safety threshold');
    expect(scanMock).not.toHaveBeenCalled();
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('abort: terminates execution immediately and sends stop command', async () => {
    const transport = createMockTransport();

    // Use a delay inside scan to give us time to abort
    const scanMock = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { result: { part: 'leaf', state: 'healthy', confidence: 0.9 } };
    });
    const decideMock = vi.fn().mockResolvedValue({
      actions: [],
      skipped_actions: [],
      retry_needed: false,
    });

    const runner = new MissionRunner({
      transport,
      apiClient: {
        scan: scanMock,
        decide: decideMock,
      },
      getTelemetry: () => defaultTelemetry,
      sleep: () => Promise.resolve(),
    });

    const missionPromise = runner.start({
      ...baseConfig,
      plantsPerRow: 5,
    });

    // Abort after 10ms
    setTimeout(() => {
      runner.abort('Operator pressed Emergency Abort');
    }, 10);

    await missionPromise;

    const snapshot = runner.getSnapshot();
    expect(snapshot.status).toBe('aborted');
    expect(snapshot.pauseReason).toBe('Operator pressed Emergency Abort');

    const sent = transport.getSentMessages();
    expect(sent.some((m: RoverOutMessage) => m.c === 'stop')).toBe(true);
  });
});
