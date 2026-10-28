import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { useRoverStore } from '../../store/roverStore';
import { Button } from '../ui/Button';

export const BluetoothBanner: React.FC = () => {
  const { isWebBluetoothSupported, transportType, setTransportType } = useRoverStore();
  const [dismissed, setDismissed] = useState(false);

  // Show if Bluetooth is NOT supported and the user is not in MQTT mode
  if (isWebBluetoothSupported || dismissed || transportType === 'mqtt') {
    return null;
  }

  return (
    <div
      role="alert"
      className="bg-warning/15 border-b-2 border-warning text-text-main px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm font-medium transition-colors"
    >
      <div className="flex items-center gap-3">
        <span className="p-1.5 rounded-lg bg-warning/25 text-warning flex-shrink-0">
          <AlertTriangle className="w-5 h-5" aria-hidden="true" />
        </span>
        <div>
          <span className="font-bold">Web Bluetooth Unavailable:</span>{' '}
          Chrome or Edge on desktop or Android is required for direct hardware Bluetooth connection.
        </div>
      </div>

      <div className="flex items-center gap-2">
        {transportType !== 'mock' && (
          <Button
            size="md"
            variant="secondary"
            onClick={() => setTransportType('mock')}
            className="text-xs min-h-[38px] px-3.5 py-1.5 border-warning/60 text-text-main"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Use Mock Simulator
          </Button>
        )}
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface border border-transparent focus:outline-none min-h-[38px] min-w-[38px] flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
