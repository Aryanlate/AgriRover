/**
 * Rover Transport Interface
 */

import type { RoverInMessage, RoverOutMessage, TransportStatus } from './types';

export interface RoverTransport {
  readonly status: TransportStatus;
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: RoverOutMessage): Promise<boolean>;
  onMessage(listener: (msg: RoverInMessage) => void): () => void;
  onStatusChange(listener: (status: TransportStatus, error?: string) => void): () => void;
}
