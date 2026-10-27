/**
 * Mock Transport for Agri-Rover Simulation
 * Simulates rover hardware: 5 Hz telemetry, draining battery, command acks, arrived events.
 */

import type {
  RoverInMessage,
  RoverOutMessage,
  RoverMode,
  ProbeState,
  TransportStatus,
  MessageTelemetry,
} from './types';
import type { RoverTransport } from './transport';

export class MockTransport implements RoverTransport {
  readonly name = 'Mock Simulator';
  private _status: TransportStatus = 'disconnected';

  private messageListeners = new Set<(msg: RoverInMessage) => void>();
  private statusListeners = new Set<(status: TransportStatus, error?: string) => void>();

  private telTimer: number | null = null;
  private moveTimer: number | null = null;

  // Rover simulated state
  private batteryVoltage = 12.45;
  private mode: RoverMode = 'idle';
  private probeState: ProbeState = 'up';
  private leftEncoder = 120;
  private rightEncoder = 120;
  private tilt = 0.4;
  private soilRaw = 2250;
  private temp = 25.4;
  private hum = 64.2;
  private distance = 42;

  get status(): TransportStatus {
    return this._status;
  }

  private setStatus(status: TransportStatus, error?: string) {
    this._status = status;
    this.statusListeners.forEach((l) => l(status, error));
  }

  onMessage(listener: (msg: RoverInMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatusChange(listener: (status: TransportStatus, error?: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    await new Promise((r) => setTimeout(r, 400));
    this.setStatus('connected');
    this.startTelemetry();
  }

  async disconnect(): Promise<void> {
    this.stopTelemetry();
    if (this.moveTimer !== null) {
      clearTimeout(this.moveTimer);
      this.moveTimer = null;
    }
    this.setStatus('disconnected');
  }

  private emit(msg: RoverInMessage) {
    this.messageListeners.forEach((l) => l(msg));
  }

  private startTelemetry() {
    this.stopTelemetry();
    // 5 Hz = every 200 ms
    this.telTimer = window.setInterval(() => {
      // Very slow battery drain simulation
      this.batteryVoltage = Math.max(10.2, this.batteryVoltage - 0.0001);
      const pct = Math.max(0, Math.min(100, Math.round(((this.batteryVoltage - 10.5) / (12.6 - 10.5)) * 100)));
      const isLow = this.batteryVoltage <= 11.1;

      // Small natural sensor fluctuations
      const currentSoil = this.soilRaw + Math.floor((Math.random() - 0.5) * 15);
      const currentTemp = +(this.temp + (Math.random() - 0.5) * 0.2).toFixed(1);
      const currentHum = +(this.hum + (Math.random() - 0.5) * 0.4).toFixed(1);
      const currentTilt = +(this.tilt + (Math.random() - 0.5) * 0.1).toFixed(1);
      const currentDist = Math.max(10, this.distance + Math.floor((Math.random() - 0.5) * 3));

      const tel: MessageTelemetry = {
        t: 'tel',
        bat: {
          v: +this.batteryVoltage.toFixed(2),
          pct,
          low: isLow,
        },
        mode: this.mode,
        soil: currentSoil,
        temp: currentTemp,
        hum: currentHum,
        tilt: currentTilt,
        dist: currentDist,
        probe: this.probeState,
        enc: {
          l: this.leftEncoder,
          r: this.rightEncoder,
        },
      };

      this.emit(tel);
    }, 200);
  }

  private stopTelemetry() {
    if (this.telTimer !== null) {
      clearInterval(this.telTimer);
      this.telTimer = null;
    }
  }

  async send(message: RoverOutMessage): Promise<boolean> {
    if (this._status !== 'connected') {
      return false;
    }

    const cmd = message.c;

    // Heartbeat does not require ack
    if (cmd === 'hb') {
      return true;
    }

    // Process commands and generate acknowledgements / events
    if (cmd === 'stop') {
      if (this.moveTimer !== null) {
        clearTimeout(this.moveTimer);
        this.moveTimer = null;
      }
      if (this.mode === 'mission' || this.mode === 'manual') {
        this.mode = 'paused';
      }
      this.emit({ t: 'ack', c: 'stop', ok: true });
      return true;
    }

    if (cmd === 'estop_reset') {
      if (this.mode === 'estop') {
        this.mode = 'idle';
      }
      this.emit({ t: 'ack', c: 'estop_reset', ok: true });
      this.emit({ t: 'ev', e: 'mode', mode: this.mode });
      return true;
    }

    if (cmd === 'mode') {
      this.mode = message.m;
      this.emit({ t: 'ack', c: 'mode', ok: true, v: this.mode });
      this.emit({ t: 'ev', e: 'mode', mode: this.mode });
      return true;
    }

    if (cmd === 'move') {
      const mm = message.mm;
      this.emit({ t: 'ack', c: 'move', ok: true, v: mm });

      // Simulate movement delay and arrived event
      const duration = Math.min(3000, Math.max(500, Math.abs(mm) * 3));
      this.moveTimer = window.setTimeout(() => {
        this.leftEncoder += Math.round(mm * 1.5);
        this.rightEncoder += Math.round(mm * 1.5);
        this.emit({ t: 'ev', e: 'arrived', mm });
        this.moveTimer = null;
      }, duration);
      return true;
    }

    if (cmd === 'turn') {
      const deg = message.deg;
      this.emit({ t: 'ack', c: 'turn', ok: true, v: deg });
      const duration = Math.min(2500, Math.max(400, Math.abs(deg) * 6));
      this.moveTimer = window.setTimeout(() => {
        this.emit({ t: 'ev', e: 'arrived', deg });
        this.moveTimer = null;
      }, duration);
      return true;
    }

    if (cmd === 'probe') {
      const action = message.a;
      this.emit({ t: 'ack', c: 'probe', ok: true, v: action });

      if (action === 'read') {
        this.probeState = 'moving';
        setTimeout(() => {
          this.probeState = 'down';
          setTimeout(() => {
            this.probeState = 'up';
            this.emit({ t: 'ev', e: 'probe_done', soil: this.soilRaw });
          }, 800);
        }, 500);
      } else {
        this.probeState = action === 'down' ? 'down' : 'up';
      }
      return true;
    }

    if (cmd === 'drive') {
      if (this.mode === 'mission') {
        this.emit({ t: 'ack', c: 'drive', ok: false, reason: 'drive refused: mission mode active' });
        return true;
      }
      this.emit({ t: 'ack', c: 'drive', ok: true });
      return true;
    }

    // Default ack for other commands (nozzle, camtilt, pump, cfg, selftest)
    this.emit({ t: 'ack', c: cmd, ok: true });
    return true;
  }
}
