import React from 'react';
import {
  Battery,
  Droplets,
  Thermometer,
  Compass,
  Radar,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/ui/StatCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useNavigate } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { telemetry, connectionStatus, mode, connect } = useRoverStore();
  const navigate = useNavigate();

  const isConnected = connectionStatus === 'connected';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Rover Dashboard
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Real-time agricultural telemetry, sensor overview, and mission telemetry.
          </p>
        </div>

        {!isConnected && (
          <Button variant="primary" onClick={() => connect()} icon={<Activity className="w-5 h-5" />}>
            Connect Rover
          </Button>
        )}
      </div>

      {/* Telemetry Overview Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard
          label="Battery Level"
          value={telemetry?.bat?.pct !== undefined ? telemetry.bat.pct : '--'}
          unit="%"
          icon={<Battery className="w-6 h-6 text-primary" />}
        />

        <StatCard
          label="Soil Moisture"
          value={telemetry?.soil !== undefined ? telemetry.soil : '--'}
          unit="ADC"
          icon={<Droplets className="w-6 h-6 text-water" />}
        />

        <StatCard
          label="Temperature (DHT22)"
          value={telemetry?.temp !== undefined ? telemetry.temp : '--'}
          unit="°C"
          icon={<Thermometer className="w-6 h-6 text-unsure" />}
        />

        <StatCard
          label="Front Ultrasonic"
          value={telemetry?.dist !== undefined ? telemetry.dist : '--'}
          unit="cm"
          icon={<Radar className="w-6 h-6 text-primary" />}
        />

        <StatCard
          label="Chassis Tilt"
          value={telemetry?.tilt !== undefined ? telemetry.tilt : '--'}
          unit="°"
          icon={<Compass className="w-6 h-6 text-text-muted" />}
        />

        <StatCard
          label="Probe Position"
          value={telemetry?.probe ? telemetry.probe.toUpperCase() : '--'}
          icon={<Layers className="w-6 h-6 text-primary" />}
        />

        <StatCard
          label="Drive Encoders (L/R)"
          value={telemetry?.enc ? `${telemetry.enc.l} / ${telemetry.enc.r}` : '--'}
          icon={<Activity className="w-6 h-6 text-water" />}
        />

        <StatCard
          label="Rover Mode"
          value={mode ? mode.toUpperCase() : 'IDLE'}
          icon={<Activity className="w-6 h-6 text-primary" />}
        />
      </div>

      {/* Quick Launch & Mission Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Quick Rover Controls" variant="default" className="p-6">
          <p className="text-sm text-text-muted mb-4">
            Direct shortcuts for primary field operations.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => navigate('/manual')}>
              Manual Drive Controls
            </Button>
            <Button variant="secondary" onClick={() => navigate('/camera')}>
              Open Camera Stream
            </Button>
            <Button variant="primary" onClick={() => navigate('/mission')} icon={<ArrowRight className="w-4 h-4" />}>
              Start Autonomous Mission
            </Button>
          </div>
        </Card>

        <Card title="Recent Activity" variant="default" className="p-6">
          {!isConnected ? (
            <EmptyState
              title="Rover Offline"
              message="Connect to the rover via Web Bluetooth or the built-in Mock Simulator to view real-time data."
              actionLabel="Connect Simulator"
              onAction={() => connect()}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-app border border-border">
                <span className="font-semibold text-text-main">Telemetry stream active</span>
                <span className="text-xs text-primary font-bold">5 Hz Rate</span>
              </div>
              <div className="flex items-center justify-between text-sm p-3 rounded-xl bg-app border border-border">
                <span className="font-semibold text-text-main">Safety Watchdog</span>
                <span className="text-xs text-primary font-bold">OK (300ms Heartbeat)</span>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
