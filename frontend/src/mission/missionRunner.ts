/**
 * Mission Runner: Autonomous Greenhouse Agricultural Mission State Machine
 * Runs independently from React components.
 * Single source of truth: docs/CONTEXT.md & docs/ble_protocol.md
 */

import type { RoverInMessage, TelemetryData } from '../services/ble/types';
import type { RoverTransport } from '../services/ble/transport';

export type RunnerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'aborted' | 'fault';

export type RunnerSubStep =
  | 'idle'
  | 'moving'
  | 'probing'
  | 'scanning_leaf'
  | 'scanning_stem'
  | 'deciding'
  | 'aiming'
  | 'spraying'
  | 'logging'
  | 'returning'
  | 'waiting_refill'
  | 'paused_bluetooth';

export interface MissionConfig {
  plant: string;             // tomato, potato, pepper, brinjal
  rows: number;              // default 1
  plantsPerRow: number;      // e.g. 5
  plantSpacingMm: number;    // e.g. 300 mm
  rowSpacingMm: number;      // e.g. 800 mm
  moistureThreshold: number; // e.g. 35.0%
  waterDoseMl: number;       // e.g. 50.0 ml
  treatDoseMl: number;       // e.g. 25.0 ml
  perPlantWaterCapMl: number;// e.g. 150.0 ml
  perPlantTreatCapMl: number;// e.g. 60.0 ml
  perRunWaterCapMl: number;  // e.g. 2500.0 ml
  perRunTreatCapMl: number;  // e.g. 1000.0 ml
  lowConfidence: number;     // e.g. 0.60
  highConfidence: number;    // e.g. 0.85
  minBatteryPct: number;     // e.g. 20%
  waterPumpFlowRate: number; // e.g. 25 ml/s
  treatPumpFlowRate: number; // e.g. 20 ml/s
  initialWaterMl?: number;   // e.g. 1000 ml
  initialTreatMl?: number;   // e.g. 1000 ml
}

export interface PlantLog {
  plantIndex: number;
  plantId: string;
  moistureRaw?: number;
  moisturePct?: number;
  leafState?: string;
  leafConfidence?: number;
  stemState?: string;
  stemConfidence?: number;
  actionsExecuted: string[];
  skippedActions: string[];
  waterDispensedMl: number;
  treatDispensedMl: number;
  timestamp: Date;
}

export interface RunnerSnapshot {
  status: RunnerStatus;
  subStep: RunnerSubStep;
  currentPlantIndex: number;
  totalPlants: number;
  currentPlantId: string;
  waterRemainingMl: number;
  treatRemainingMl: number;
  totalWaterUsedMl: number;
  totalTreatUsedMl: number;
  pauseReason: string | null;
  errorMessage: string | null;
  plantLogs: PlantLog[];
}

export interface RunnerDependencies {
  transport: RoverTransport;
  apiClient: {
    scan: (pose: 'leaf' | 'stem', plantId?: string, runId?: number) => Promise<any>;
    decide: (payload: any) => Promise<any>;
    createRun?: (name?: string, notes?: string) => Promise<any>;
    finishRun?: (runId: number) => Promise<any>;
  };
  getTelemetry: () => TelemetryData | null;
  sleep?: (ms: number) => Promise<void>;
}

export class MissionRunner {
  private status: RunnerStatus = 'idle';
  private subStep: RunnerSubStep = 'idle';
  private config: MissionConfig | null = null;
  private currentPlantIndex = 0;
  private totalPlants = 0;
  private currentPlantId = '';

  private waterRemainingMl = 1000;
  private treatRemainingMl = 1000;
  private totalWaterUsedMl = 0;
  private totalTreatUsedMl = 0;
  private totalDistanceMovedMm = 0;

  private pauseReason: string | null = null;
  private errorMessage: string | null = null;
  private plantLogs: PlantLog[] = [];
  private backendRunId: number | null = null;

  private resumeResolve: (() => void) | null = null;
  private isAborted = false;

  private listeners = new Set<(snapshot: RunnerSnapshot) => void>();
  private unsubMessage: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;

  private readonly deps: RunnerDependencies;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(deps: RunnerDependencies) {
    this.deps = deps;
    this.sleep = deps.sleep || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.bindTransportEvents();
  }

  private bindTransportEvents() {
    this.unsubMessage = this.deps.transport.onMessage((msg: RoverInMessage) => {
      this.handleIncomingMessage(msg);
    });

    this.unsubStatus = this.deps.transport.onStatusChange((status: string) => {
      if (status === 'disconnected' && this.status === 'running') {
        this.pause('Bluetooth connection dropped. Reconnect and click Resume to continue from current plant.');
        this.subStep = 'paused_bluetooth';
        this.notify();
      }
    });
  }

  destroy() {
    if (this.unsubMessage) this.unsubMessage();
    if (this.unsubStatus) this.unsubStatus();
    this.listeners.clear();
  }

  subscribe(listener: (snapshot: RunnerSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const snap = this.getSnapshot();
    this.listeners.forEach((l) => l(snap));
  }

  getSnapshot(): RunnerSnapshot {
    return {
      status: this.status,
      subStep: this.subStep,
      currentPlantIndex: this.currentPlantIndex,
      totalPlants: this.totalPlants,
      currentPlantId: this.currentPlantId,
      waterRemainingMl: this.waterRemainingMl,
      treatRemainingMl: this.treatRemainingMl,
      totalWaterUsedMl: this.totalWaterUsedMl,
      totalTreatUsedMl: this.totalTreatUsedMl,
      pauseReason: this.pauseReason,
      errorMessage: this.errorMessage,
      plantLogs: [...this.plantLogs],
    };
  }

  private handleIncomingMessage(msg: RoverInMessage) {
    if (this.status !== 'running' && this.status !== 'paused') return;

    if (msg.t === 'fault') {
      this.status = 'fault';
      this.subStep = 'idle';
      this.errorMessage = `Hardware Fault Reported: ${msg.code}`;
      this.notify();
    } else if (msg.t === 'al' && msg.code === 'ESTOP') {
      this.status = 'fault';
      this.subStep = 'idle';
      this.errorMessage = 'Emergency Stop Activated. Mission halted.';
      this.notify();
    }
  }

  // ----------------------------------------------------
  // Runner Lifecycle Controls
  // ----------------------------------------------------
  async start(config: MissionConfig): Promise<void> {
    if (this.status === 'running') return;

    this.config = config;
    this.status = 'running';
    this.subStep = 'idle';
    this.currentPlantIndex = 0;
    this.totalPlants = config.rows * config.plantsPerRow;
    this.waterRemainingMl = config.initialWaterMl ?? 1000;
    this.treatRemainingMl = config.initialTreatMl ?? 1000;
    this.totalWaterUsedMl = 0;
    this.totalTreatUsedMl = 0;
    this.totalDistanceMovedMm = 0;
    this.pauseReason = null;
    this.errorMessage = null;
    this.plantLogs = [];
    this.isAborted = false;

    // Set rover mode to mission
    await this.deps.transport.send({ c: 'mode', m: 'mission' });

    // Optional create backend run
    if (this.deps.apiClient.createRun) {
      try {
        const runRes = await this.deps.apiClient.createRun(
          `Autonomous Mission (${config.plant})`,
          `Rows: ${config.rows}, Plants/row: ${config.plantsPerRow}`
        );
        this.backendRunId = runRes.id;
      } catch {
        // Backend offline fallback
      }
    }

    this.notify();
    return this.executeMissionLoop();
  }

  pause(reason: string = 'Operator paused mission'): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.pauseReason = reason;
    this.deps.transport.send({ c: 'stop' });
    this.notify();
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.pauseReason = null;
    this.notify();
    if (this.resumeResolve) {
      const res = this.resumeResolve;
      this.resumeResolve = null;
      res();
    }
  }

  refillAndResume(waterMl: number = 1000, treatMl: number = 1000): void {
    this.waterRemainingMl = waterMl;
    this.treatRemainingMl = treatMl;
    this.resume();
  }

  abort(reason: string = 'Mission aborted by operator'): void {
    this.isAborted = true;
    this.status = 'aborted';
    this.subStep = 'idle';
    this.pauseReason = reason;
    this.errorMessage = reason;
    this.deps.transport.send({ c: 'stop' });
    this.notify();
    if (this.resumeResolve) {
      const res = this.resumeResolve;
      this.resumeResolve = null;
      res();
    }
  }

  private async waitIfPaused(): Promise<boolean> {
    if (this.isAborted) return false;
    if (this.status === 'paused') {
      await new Promise<void>((resolve) => {
        this.resumeResolve = resolve;
      });
    }
    return !this.isAborted && this.status === 'running';
  }

  // ----------------------------------------------------
  // Main Execution Loop
  // ----------------------------------------------------
  private async executeMissionLoop(): Promise<void> {
    const cfg = this.config!;

    try {
      while (this.currentPlantIndex < this.totalPlants) {
        if (!(await this.waitIfPaused())) break;

        const pIndex = this.currentPlantIndex;
        const plantLabel = `${cfg.plant}_${pIndex + 1}`;
        this.currentPlantId = plantLabel;
        this.notify();

        // 1. Safety Checks: Battery and Tank Liquids
        const tel = this.deps.getTelemetry();
        if (tel?.bat && (tel.bat.pct < cfg.minBatteryPct || tel.bat.low)) {
          this.status = 'fault';
          this.errorMessage = `Battery level (${tel.bat.pct}%) below safety threshold (${cfg.minBatteryPct}%). Mission halted.`;
          this.notify();
          break;
        }

        // Tank reserve check for next plant
        if (this.waterRemainingMl < cfg.waterDoseMl || this.treatRemainingMl < cfg.treatDoseMl) {
          this.subStep = 'waiting_refill';
          this.pause(
            `Estimated liquid low (Water: ${this.waterRemainingMl}ml, Treat: ${this.treatRemainingMl}ml). Refill tanks to resume.`
          );
          if (!(await this.waitIfPaused())) break;
        }

        // 2. Step: Move to plant position
        this.subStep = 'moving';
        this.notify();
        const arrivedPromise = this.waitForEvent('arrived', 4000);
        await this.deps.transport.send({ c: 'move', mm: cfg.plantSpacingMm });
        this.totalDistanceMovedMm += cfg.plantSpacingMm;
        await arrivedPromise;
        if (!(await this.waitIfPaused())) break;

        // 3. Step: Soil Probe Read
        this.subStep = 'probing';
        this.notify();
        const probePromise = this.waitForEvent('probe_done', 5000);
        await this.deps.transport.send({ c: 'probe', a: 'read' });
        const probeEv = await probePromise;
        const moistureRaw = probeEv?.soil ?? tel?.soil ?? 2100;
        const moisturePct = this.calculateSoilMoisture(moistureRaw);
        if (!(await this.waitIfPaused())) break;

        // 4. Step: Vision Inspection - Pose Leaf & Scan (Leaf-only)
        this.subStep = 'scanning_leaf';
        this.notify();
        await this.deps.transport.send({ c: 'camtilt', pose: 'leaf' });
        await this.sleep(400);
        let leafScan = await this.deps.apiClient.scan('leaf', plantLabel, this.backendRunId ?? undefined);
        if (!(await this.waitIfPaused())) break;

        // 5. Step: Decision Engine (Leaf results only)
        this.subStep = 'deciding';
        this.notify();
        let retryCount = 0;
        let decision = await this.deps.apiClient.decide({
          moisture_pct: moisturePct,
          leaf_result: leafScan?.result,
          tank_estimates: { water_ml: this.waterRemainingMl, treatment_ml: this.treatRemainingMl },
          battery_status: tel?.bat,
          estop: false,
          retry_count: retryCount,
          plant_id: plantLabel,
          run_id: this.backendRunId ?? undefined,
        });

        // Retry rule: if no plant found and retry flag set, retry once
        if (decision.retry_needed && retryCount === 0) {
          retryCount = 1;
          this.subStep = 'scanning_leaf';
          this.notify();
          await this.deps.transport.send({ c: 'camtilt', pose: 'leaf' });
          await this.sleep(400);
          leafScan = await this.deps.apiClient.scan('leaf', plantLabel, this.backendRunId ?? undefined);

          decision = await this.deps.apiClient.decide({
            moisture_pct: moisturePct,
            leaf_result: leafScan?.result,
            tank_estimates: { water_ml: this.waterRemainingMl, treatment_ml: this.treatRemainingMl },
            battery_status: tel?.bat,
            estop: false,
            retry_count: retryCount,
            plant_id: plantLabel,
            run_id: this.backendRunId ?? undefined,
          });
        }
        if (!(await this.waitIfPaused())) break;

        // 7. Step: Aim Nozzle & Dispense Spray Actions
        let plantWaterDispensed = 0;
        let plantTreatDispensed = 0;

        for (const act of decision.actions) {
          if (act.type === 'water') {
            this.subStep = 'aiming';
            this.notify();
            await this.deps.transport.send({ c: 'nozzle', pan: 0, tilt: -25 });
            await this.sleep(300);

            this.subStep = 'spraying';
            this.notify();
            const durationMs = act.duration_ms || Math.round((act.dose_ml / cfg.waterPumpFlowRate) * 1000);
            await this.deps.transport.send({ c: 'pump', id: 'water', ms: durationMs });
            await this.sleep(durationMs);

            plantWaterDispensed += act.dose_ml;
            this.waterRemainingMl = Math.max(0, this.waterRemainingMl - act.dose_ml);
            this.totalWaterUsedMl += act.dose_ml;
          } else if (act.type === 'treat') {
            this.subStep = 'aiming';
            this.notify();
            // Aim leaf high or stem low
            const tiltAngle = act.part === 'leaf' ? 20 : -10;
            await this.deps.transport.send({ c: 'nozzle', pan: 0, tilt: tiltAngle });
            await this.sleep(300);

            this.subStep = 'spraying';
            this.notify();
            const durationMs = act.duration_ms || Math.round((act.dose_ml / cfg.treatPumpFlowRate) * 1000);
            await this.deps.transport.send({ c: 'pump', id: 'treat', ms: durationMs });
            await this.sleep(durationMs);

            plantTreatDispensed += act.dose_ml;
            this.treatRemainingMl = Math.max(0, this.treatRemainingMl - act.dose_ml);
            this.totalTreatUsedMl += act.dose_ml;
          }
        }
        if (!(await this.waitIfPaused())) break;

        // 8. Step: Log Plant Record
        this.subStep = 'logging';
        const executedNames = decision.actions.map((a: any) => `${a.type}:${a.part || 'soil'}`);
        const skippedNames = decision.skipped_actions.map((s: any) => `${s.type}: ${s.reason}`);

        this.plantLogs.push({
          plantIndex: pIndex,
          plantId: plantLabel,
          moistureRaw,
          moisturePct,
          leafState: leafScan?.result?.state,
          leafConfidence: leafScan?.result?.confidence,
          actionsExecuted: executedNames,
          skippedActions: skippedNames,
          waterDispensedMl: plantWaterDispensed,
          treatDispensedMl: plantTreatDispensed,
          timestamp: new Date(),
        });

        this.currentPlantIndex++;
        this.notify();
        await this.sleep(200);
      }

      // End of Mission: Return to start
      if (!this.isAborted && this.status === 'running') {
        this.subStep = 'returning';
        this.notify();
        if (this.totalDistanceMovedMm > 0) {
          const arrivedPromise = this.waitForEvent('arrived', 6000);
          await this.deps.transport.send({ c: 'move', mm: -this.totalDistanceMovedMm });
          await arrivedPromise;
        }

        if (this.backendRunId && this.deps.apiClient.finishRun) {
          await this.deps.apiClient.finishRun(this.backendRunId);
        }

        await this.deps.transport.send({ c: 'mode', m: 'idle' });
        this.status = 'completed';
        this.subStep = 'idle';
        this.notify();
      }
    } catch (err: any) {
      this.status = 'fault';
      this.errorMessage = err.message || 'Mission error';
      this.notify();
    }
  }

  private calculateSoilMoisture(raw: number): number {
    // Air 3200, Wet 1400
    const pct = ((3200 - raw) / (3200 - 1400)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  private waitForEvent(eventName: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsub();
          resolve(null);
        }
      }, timeoutMs);

      const unsub = this.deps.transport.onMessage((msg: RoverInMessage) => {
        if (msg.t === 'ev' && msg.e === eventName) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            unsub();
            resolve(msg);
          }
        }
      });
    });
  }
}
