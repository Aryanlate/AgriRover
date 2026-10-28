/**
 * MQTT Transport for Agri-Rover Web Dashboard
 * Connects over secure WebSockets (WSS) to EMQX Cloud broker.
 * Implements RoverTransport interface with cid/seq session ownership,
 * 300 ms heartbeats, and camera topic streaming.
 */

import mqtt, { type MqttClient } from 'mqtt';
import type { RoverTransport } from './transport';
import type {
  MessageTelemetry,
  RoverInMessage,
  RoverOutMessage,
  TransportStatus,
} from './types';

export const MQTT_STORAGE_KEYS = {
  URL: 'agrirover_mqtt_url',
  USER: 'agrirover_mqtt_user',
  PASS: 'agrirover_mqtt_pass',
  ROVER_ID: 'agrirover_mqtt_rover_id',
};

export const DEFAULT_MQTT_CONFIG = {
  URL: 'wss://rc2ad722.ala.asia-southeast1.emqxsl.com:8084/mqtt',
  USER: 'web',
  ROVER_ID: 'rover01',
};

export interface MqttStatusDetails {
  brokerConnected: boolean;
  roverOnline: boolean;
  cameraOnline: boolean;
  ownerCid: string | null;
  isOwner: boolean;
}

export type MqttStatusListener = (details: MqttStatusDetails) => void;
export type LiveFrameListener = (blobUrl: string) => void;
export type PhotoCaptureListener = (rid: string, blobUrl: string) => void;

export class MqttTransport implements RoverTransport {
  readonly name = 'MQTT';
  private _status: TransportStatus = 'disconnected';
  private client: MqttClient | null = null;

  // Session client ID and sequence counter
  readonly cid: string;
  private seq = 1;

  // Status tracking
  private brokerConnected = false;
  private roverOnline = false;
  private cameraOnline = false;
  private ownerCid: string | null = null;

  // Heartbeat timer
  private heartbeatInterval: number | null = null;

  // Event Listeners
  private messageListeners: Set<(msg: RoverInMessage) => void> = new Set();
  private statusListeners: Set<(status: TransportStatus, error?: string) => void> = new Set();
  private mqttStatusListeners: Set<MqttStatusListener> = new Set();
  private liveFrameListeners: Set<LiveFrameListener> = new Set();
  private photoCaptureListeners: Set<PhotoCaptureListener> = new Set();

  // Multi-part image chunk buffer: { rid: { chunks: Map<number, Uint8Array>, total: number } }
  private chunkBuffers: Map<string, { chunks: Map<number, Uint8Array>; total: number }> = new Map();

  constructor() {
    // Unique random client ID per page load
    this.cid = 'web_' + Math.random().toString(36).substring(2, 10);
  }

  get status(): TransportStatus {
    return this._status;
  }

  get details(): MqttStatusDetails {
    return {
      brokerConnected: this.brokerConnected,
      roverOnline: this.roverOnline,
      cameraOnline: this.cameraOnline,
      ownerCid: this.ownerCid,
      isOwner: this.ownerCid === this.cid || this.ownerCid === null,
    };
  }

  private getSettings() {
    const url = (typeof localStorage !== 'undefined' && localStorage.getItem(MQTT_STORAGE_KEYS.URL)) || DEFAULT_MQTT_CONFIG.URL;
    const username = (typeof localStorage !== 'undefined' && localStorage.getItem(MQTT_STORAGE_KEYS.USER)) || DEFAULT_MQTT_CONFIG.USER;
    const password = (typeof localStorage !== 'undefined' && localStorage.getItem(MQTT_STORAGE_KEYS.PASS)) || '';
    const roverId = (typeof localStorage !== 'undefined' && localStorage.getItem(MQTT_STORAGE_KEYS.ROVER_ID)) || DEFAULT_MQTT_CONFIG.ROVER_ID;
    return { url, username, password, roverId };
  }

  private setStatus(newStatus: TransportStatus, error?: string) {
    this._status = newStatus;
    this.statusListeners.forEach((l) => l(newStatus, error));
    this.notifyMqttStatus();
  }

  private notifyMqttStatus() {
    const d = this.details;
    this.mqttStatusListeners.forEach((l) => l(d));
  }

  async connect(): Promise<void> {
    if (this._status === 'connected' || this._status === 'connecting') {
      return;
    }

    const { url, username, password, roverId } = this.getSettings();
    this.setStatus('connecting');

    try {
      this.client = mqtt.connect(url, {
        clientId: this.cid,
        username,
        password,
        clean: true,
        keepalive: 5,
        reconnectPeriod: 2500,
        connectTimeout: 10000,
      });

      this.client.on('connect', () => {
        this.brokerConnected = true;
        this.setStatus('connected');

        // Subscribe to rover and camera topics
        const prefix = `agrirover/${roverId}/`;
        this.client?.subscribe([
          `${prefix}telemetry`,
          `${prefix}status`,
          `${prefix}ack`,
          `${prefix}ev`,
          `${prefix}cam/status`,
          `${prefix}cam/live`,
          `${prefix}cam/img/#`,
        ]);

        // Start 300 ms heartbeat loop
        this.startHeartbeat();
      });

      this.client.on('reconnect', () => {
        this.setStatus('connecting');
      });

      this.client.on('error', (err) => {
        this.brokerConnected = false;
        this.setStatus('error', err.message);
      });

      this.client.on('offline', () => {
        this.brokerConnected = false;
        this.roverOnline = false;
        this.cameraOnline = false;
        this.setStatus('disconnected');
        this.stopHeartbeat();
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        this.handleIncomingMqtt(topic, payload, roverId);
      });
    } catch (e: any) {
      this.setStatus('error', e.message || 'MQTT connection failed');
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.stopHeartbeat();
    if (this.client) {
      try {
        this.client.end(true);
      } catch {
        // ignore
      }
      this.client = null;
    }
    this.brokerConnected = false;
    this.roverOnline = false;
    this.cameraOnline = false;
    this.ownerCid = null;
    this.setStatus('disconnected');
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ c: 'hb' });
    }, 300);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval !== null) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleIncomingMqtt(topic: string, payload: Buffer, roverId: string) {
    const prefix = `agrirover/${roverId}/`;

    // 1. Live stream frames on cam/live
    if (topic === `${prefix}cam/live`) {
      const blob = new Blob([new Uint8Array(payload)], { type: 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      this.liveFrameListeners.forEach((l) => l(blobUrl));
      return;
    }

    // 2. Camera photo captures on cam/img/<rid>
    const imgPrefix = `${prefix}cam/img/`;
    if (topic.startsWith(imgPrefix)) {
      const rid = topic.substring(imgPrefix.length);
      this.handleImagePayload(rid, payload);
      return;
    }

    // 3. Rover and Camera JSON Status topics
    if (topic === `${prefix}status`) {
      try {
        const text = payload.toString('utf-8');
        const data = JSON.parse(text);
        this.roverOnline = Boolean(data.online);
        if (data.controller_cid !== undefined) {
          this.ownerCid = data.controller_cid || null;
        }
        this.notifyMqttStatus();
      } catch {
        // ignore
      }
      return;
    }

    if (topic === `${prefix}cam/status`) {
      try {
        const text = payload.toString('utf-8');
        const data = JSON.parse(text);
        this.cameraOnline = Boolean(data.online);
        this.notifyMqttStatus();
      } catch {
        // ignore
      }
      return;
    }

    // 4. Rover telemetry (wire format differs from the store's TelemetryData)
    if (topic === `${prefix}telemetry`) {
      try {
        const data = JSON.parse(payload.toString('utf-8'));
        if (data.t === 'tel') {
          this.messageListeners.forEach((l) => l(this.normalizeTelemetry(data)));
          return;
        }
      } catch {
        // fall through to generic handling below
      }
    }

    // 5. Rover Ack and Events
    try {
      const text = payload.toString('utf-8');
      const json = JSON.parse(text);

      // Check ownership rejection on acks
      if (json.t === 'ack') {
        if (!json.ok && json.reason === 'another controller') {
          // Received lock warning
          this.ownerCid = 'other';
          this.notifyMqttStatus();
        } else if (json.ok && json.c === 'hb') {
          // Our heartbeat was accepted
          if (!this.ownerCid || this.ownerCid === 'other') {
            this.ownerCid = this.cid;
            this.notifyMqttStatus();
          }
        }
      }

      this.messageListeners.forEach((l) => l(json as RoverInMessage));
    } catch {
      // payload not JSON or unrecognized
    }
  }

  /**
   * The firmware publishes `bat` as a plain number plus `battery_v`. The UI store
   * expects `bat: { v, pct, low }`, so map the wire format into that shape here.
   * Battery is only reported (never used for automatic decisions).
   */
  private normalizeTelemetry(raw: any): MessageTelemetry {
    const v = Number(
      raw.battery_v ?? (typeof raw.bat === 'number' ? raw.bat : raw.bat?.v)
    );
    const validV = Number.isFinite(v) && v > 0;
    const pct = validV
      ? Math.max(0, Math.min(100, Math.round(((v - 10.5) / (12.6 - 10.5)) * 100)))
      : 100; // unknown voltage -> don't raise a false low-battery lock
    const low = validV && v <= 11.1;

    return {
      t: 'tel',
      bat: { v: validV ? Number(v.toFixed(2)) : 0, pct, low },
      mode: raw.mode ?? 'idle',
      soil: raw.soil ?? 0,
      temp: raw.temp ?? 0,
      hum: raw.hum ?? raw.humidity ?? 0,
      tilt: raw.tilt ?? 0,
      dist: raw.dist ?? raw.distance_cm ?? 0,
      probe: raw.probe ?? 'up',
      enc: raw.enc ?? { l: 0, r: 0 },
    };
  }

  private handleImagePayload(rid: string, payload: Buffer) {
    // Check if chunked: CHUNK|<rid>|<index>|<total>|\n
    const headerPrefix = 'CHUNK|';
    const isChunked = payload.slice(0, 6).toString('utf-8') === headerPrefix;

    if (!isChunked) {
      // Single full JPEG
      const blob = new Blob([new Uint8Array(payload)], { type: 'image/jpeg' });
      const blobUrl = URL.createObjectURL(blob);
      this.photoCaptureListeners.forEach((l) => l(rid, blobUrl));
      return;
    }

    // Parse chunk header
    const newlineIdx = payload.indexOf(10); // '\n'
    if (newlineIdx === -1) return;

    const header = payload.slice(0, newlineIdx).toString('utf-8');
    const parts = header.split('|');
    if (parts.length >= 4) {
      const index = parseInt(parts[2], 10);
      const total = parseInt(parts[3], 10);
      const chunkData = payload.slice(newlineIdx + 1);

      if (!this.chunkBuffers.has(rid)) {
        this.chunkBuffers.set(rid, { chunks: new Map(), total });
      }

      const req = this.chunkBuffers.get(rid)!;
      req.chunks.set(index, new Uint8Array(chunkData));

      if (req.chunks.size === total) {
        // Reassemble all parts in order
        const partsList: Uint8Array[] = [];
        for (let i = 0; i < total; i++) {
          const piece = req.chunks.get(i);
          if (piece) partsList.push(piece);
        }

        const blob = new Blob(partsList as any, { type: 'image/jpeg' });
        const blobUrl = URL.createObjectURL(blob);
        this.photoCaptureListeners.forEach((l) => l(rid, blobUrl));
        this.chunkBuffers.delete(rid);
      }
    }
  }

  async send(message: RoverOutMessage): Promise<boolean> {
    if (!this.client || !this.brokerConnected) {
      return false;
    }

    const { roverId } = this.getSettings();
    const cmdTopic = `agrirover/${roverId}/cmd`;

    // Augment with cid and sequential number
    const payload = {
      ...message,
      cid: this.cid,
      seq: this.seq++,
    };

    const isStop = message.c === 'stop';
    const qos = isStop ? 1 : 0; // stop is QoS 1, others QoS 0

    return new Promise<boolean>((resolve) => {
      this.client?.publish(
        cmdTopic,
        JSON.stringify(payload),
        { qos, retain: false },
        (err) => {
          resolve(!err);
        }
      );
    });
  }

  publishCamCmd(cmdPayload: any): Promise<boolean> {
    if (!this.client || !this.brokerConnected) {
      return Promise.resolve(false);
    }
    const { roverId } = this.getSettings();
    const camTopic = `agrirover/${roverId}/cam/cmd`;

    return new Promise<boolean>((resolve) => {
      this.client?.publish(
        camTopic,
        JSON.stringify(cmdPayload),
        { qos: 0, retain: false },
        (err) => {
          resolve(!err);
        }
      );
    });
  }

  onMessage(listener: (msg: RoverInMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatusChange(listener: (status: TransportStatus, error?: string) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMqttStatus(listener: MqttStatusListener): () => void {
    this.mqttStatusListeners.add(listener);
    listener(this.details);
    return () => this.mqttStatusListeners.delete(listener);
  }

  onLiveFrame(listener: LiveFrameListener): () => void {
    this.liveFrameListeners.add(listener);
    return () => this.liveFrameListeners.delete(listener);
  }

  onPhotoCapture(listener: PhotoCaptureListener): () => void {
    this.photoCaptureListeners.add(listener);
    return () => this.photoCaptureListeners.delete(listener);
  }
}

/** Narrow an active RoverTransport to the MQTT implementation (camera + status extras). */
export function isMqttTransport(t: RoverTransport | null | undefined): t is MqttTransport {
  return Boolean(t) && t instanceof MqttTransport;
}

/** True when the browser has stored MQTT broker settings (so auto-connect is possible). */
export function mqttSettingsExist(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const url = localStorage.getItem(MQTT_STORAGE_KEYS.URL);
  const user = localStorage.getItem(MQTT_STORAGE_KEYS.USER);
  const pass = localStorage.getItem(MQTT_STORAGE_KEYS.PASS);
  return Boolean(url && user && pass);
}

