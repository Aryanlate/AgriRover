import React from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Square } from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const ManualPage: React.FC = () => {
  const { send, mode, setMode } = useRoverStore();

  const handleDrive = (l: number, r: number) => {
    send({ c: 'drive', l, r });
  };

  const handleStop = () => {
    send({ c: 'stop' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Manual Drive Controls
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Direct teleoperation of L298N dual motors, probe linear actuator, and nozzle servos.
          </p>
        </div>

        {mode !== 'manual' && (
          <Button variant="secondary" onClick={() => setMode('manual')}>
            Switch to Manual Mode
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drive Directional Pad */}
        <Card title="Directional Drive" variant="default" className="p-6 flex flex-col items-center">
          <div className="grid grid-cols-3 gap-3 w-64 max-w-full my-6">
            <div />
            <Button
              variant="secondary"
              size="lg"
              className="min-h-[64px]"
              onClick={() => handleDrive(60, 60)}
              icon={<ArrowUp className="w-6 h-6" />}
              aria-label="Drive Forward"
            />
            <div />

            <Button
              variant="secondary"
              size="lg"
              className="min-h-[64px]"
              onClick={() => handleDrive(-50, 50)}
              icon={<ArrowLeft className="w-6 h-6" />}
              aria-label="Turn Left"
            />
            <Button
              variant="danger"
              size="lg"
              className="min-h-[64px]"
              onClick={handleStop}
              icon={<Square className="w-6 h-6" />}
              aria-label="Stop Motors"
            />
            <Button
              variant="secondary"
              size="lg"
              className="min-h-[64px]"
              onClick={() => handleDrive(50, -50)}
              icon={<ArrowRight className="w-6 h-6" />}
              aria-label="Turn Right"
            />

            <div />
            <Button
              variant="secondary"
              size="lg"
              className="min-h-[64px]"
              onClick={() => handleDrive(-60, -60)}
              icon={<ArrowDown className="w-6 h-6" />}
              aria-label="Drive Reverse"
            />
            <div />
          </div>

          <p className="text-xs text-text-muted text-center max-w-xs">
            Commands send L/R motor throttle values (-100..100) via BLE.
          </p>
        </Card>

        {/* Actuators & Tooling */}
        <Card title="Tooling & Actuator Manual Control" variant="default" className="p-6 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-text-main mb-2">Soil Moisture Probe</h4>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => send({ c: 'probe', a: 'down' })}>
                Deploy Down
              </Button>
              <Button variant="secondary" onClick={() => send({ c: 'probe', a: 'up' })}>
                Retract Up
              </Button>
              <Button variant="primary" onClick={() => send({ c: 'probe', a: 'read' })}>
                Auto Probe Read
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-bold text-text-main mb-2">Camera Pose Servo</h4>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => send({ c: 'camtilt', pose: 'leaf' })}>
                Pose Leaf (High)
              </Button>
              <Button variant="secondary" onClick={() => send({ c: 'camtilt', pose: 'stem' })}>
                Pose Stem (Low)
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <h4 className="text-sm font-bold text-text-main mb-2">Pump Manual Pulse</h4>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => send({ c: 'pump', id: 'water', ms: 1000 })}>
                Water Pump (1s)
              </Button>
              <Button variant="secondary" onClick={() => send({ c: 'pump', id: 'treat', ms: 1000 })}>
                Treatment Pump (1s)
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
