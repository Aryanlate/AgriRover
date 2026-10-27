/**
 * Web Bluetooth Transport for Agri-Rover
 * Single source of truth: docs/ble_protocol.md
 */

import { BLE_CONFIG } from './types';
import type { RoverInMessage, RoverOutMessage, TransportStatus } from './types';
import type { RoverTransport } from './transport';

export class BleTransport implements RoverTransport {
  readonly name = 'Bluetooth LE';
  private _status: TransportStatus = 'disconnected';
  private device: any = null;
  private server: any = null;
  private writeChar: any = null;
  private notifyChar: any = null;

  private messageListeners = new Set<(msg: RoverInMessage) => void>();
  private statusListeners = new Set<(status: TransportStatus, error?: string) => void>();

  private rxBuffer = '';
  private heartbeatTimer: number | null = null;
  private autoReconnect = true;

  get status(): TransportStatus {
    return this._status;
  }

  private setStatus(status: TransportStatus, error?: string) {
    this._status = status;
    this.statusListeners.forEach((listener) => listener(status, error));
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
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (!nav || !nav.bluetooth) {
      this.setStatus('error', 'Web Bluetooth is not supported on this browser.');
      throw new Error('Web Bluetooth not supported.');
    }

    try {
      this.setStatus('connecting');

      this.device = await nav.bluetooth.requestDevice({
        filters: [{ name: BLE_CONFIG.DEVICE_NAME }],
        optionalServices: [BLE_CONFIG.SERVICE_UUID],
      });

      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);

      if (!this.device.gatt) {
        throw new Error('Device does not support GATT.');
      }

      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService(BLE_CONFIG.SERVICE_UUID);

      this.writeChar = await service.getCharacteristic(BLE_CONFIG.WRITE_CHAR_UUID);
      this.notifyChar = await service.getCharacteristic(BLE_CONFIG.NOTIFY_CHAR_UUID);

      await this.notifyChar.startNotifications();
      this.notifyChar.addEventListener('characteristicvaluechanged', this.handleNotification);

      this.setStatus('connected');
      this.startHeartbeat();
    } catch (err: any) {
      console.error('BLE connection failed:', err);
      this.cleanup();
      const msg = err.name === 'NotFoundError' ? 'Connection cancelled by user' : err.message;
      this.setStatus('error', msg);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;
    this.stopHeartbeat();
    this.cleanup();
    this.setStatus('disconnected');
  }

  private cleanup() {
    this.stopHeartbeat();
    if (this.notifyChar) {
      try {
        this.notifyChar.removeEventListener('characteristicvaluechanged', this.handleNotification);
      } catch {
        // Ignore characteristic listener removal error
      }
      this.notifyChar = null;
    }
    if (this.device) {
      try {
        this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
        if (this.device.gatt?.connected) {
          this.device.gatt.disconnect();
        }
      } catch {
        // Ignore disconnect error
      }
      this.device = null;
    }
    this.server = null;
    this.writeChar = null;
    this.rxBuffer = '';
  }

  private handleDisconnect = async () => {
    console.warn('Rover BLE connection dropped.');
    this.stopHeartbeat();
    this.setStatus('disconnected', 'BLE disconnected');

    if (this.autoReconnect && this.device && this.device.gatt) {
      try {
        console.log('Attempting automatic BLE reconnect...');
        this.setStatus('connecting');
        await new Promise((r) => setTimeout(r, 1500));
        await this.connect();
      } catch (e) {
        console.warn('Auto-reconnect failed:', e);
        this.setStatus('disconnected');
      }
    }
  };

  private handleNotification = (event: any) => {
    const target = event.target;
    if (!target?.value) return;

    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(target.value);
    this.rxBuffer += chunk;

    // Process all newline-terminated complete JSON messages
    const lines = this.rxBuffer.split('\n');
    // Keep incomplete tail
    this.rxBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as RoverInMessage;
        this.messageListeners.forEach((listener) => listener(msg));
      } catch (e) {
        console.error('Error parsing incoming BLE JSON line:', trimmed, e);
      }
    }
  };

  async send(message: RoverOutMessage): Promise<boolean> {
    if (!this.writeChar || this._status !== 'connected') {
      console.warn('Cannot send command: BLE not connected', message);
      return false;
    }

    try {
      const jsonStr = JSON.stringify(message) + '\n';
      const encoder = new TextEncoder();
      const data = encoder.encode(jsonStr);

      // Chunk data to fit BLE characteristic MTU (typically 20-100 bytes)
      const CHUNK_SIZE = 64;
      for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
        const chunk = data.slice(offset, offset + CHUNK_SIZE);
        if (this.writeChar.writeValueWithResponse) {
          await this.writeChar.writeValueWithResponse(chunk);
        } else {
          await this.writeChar.writeValue(chunk);
        }
      }
      return true;
    } catch (err) {
      console.error('Failed to send BLE command:', message, err);
      return false;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this._status === 'connected') {
        this.send({ c: 'hb' });
      }
    }, BLE_CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
