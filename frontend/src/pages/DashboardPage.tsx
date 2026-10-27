import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Compass,
  Droplets,
  FlaskConical,
  Radar,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Gauge } from '../components/ui/Gauge';
import { RangeBar } from '../components/ui/RangeBar';
import { StatCard } from '../components/ui/StatCard';
import { StatusBadge } from '../components/ui/StatusBadge';
import type { SystemStatus } from '../components/ui/StatusBadge';
import { apiClient } from '../services/api/client';

export const DashboardPage: React.FC = () => {
  const {
    connectionStatus,
    telemetry,
    lastTelemetryTime,
    telemetryHistory,
    mode,
    currentTask,
    waterTankMl,
    treatTankMl,
    tankCapacityMl,
    alerts,
    connect,
    ackAlert,
    refillTanks,
  } = useRoverStore();

  const [timeNow, setTimeNow] = useState(Date.now());
  const [soilDryRaw, setSoilDryRaw] = useState(3200);
  const [soilWetRaw, setSoilWetRaw] = useState(1400);

  const tempComfort = { min: 10, max: 45, comfortMin: 20, comfortMax: 30 };
  const humComfort = { min: 20, max: 95, comfortMin: 50, comfortMax: 75 };

  // Periodic ticker to evaluate staleness
  useEffect(() => {
    const timer = setInterval(() => setTimeNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  // Fetch settings & calibrations for soil conversion
  useEffect(() => {
    apiClient
      .getSettings()
      .then((s) => {
        if (s.soil_dry_raw) setSoilDryRaw(parseFloat(s.soil_dry_raw) || 3200);
        if (s.soil_wet_raw) setSoilWetRaw(parseFloat(s.soil_wet_raw) || 1400);
      })
      .catch(() => {});

    apiClient
      .getCalibrations()
      .then((cals) => {
        const soil = cals.find((c) => c.name === 'soil_moisture');
        if (soil) {
          setSoilDryRaw(soil.param1);
          setSoilWetRaw(soil.param2);
        }
      })
      .catch(() => {});
  }, []);

  const isConnected = connectionStatus === 'connected';

  // Staleness detection (>2000 ms since last telemetry message)
  const isStale =
    !isConnected ||
    !lastTelemetryTime ||
    timeNow - lastTelemetryTime.getTime() > 2000;

  const lastUpdatedText = lastTelemetryTime
    ? `${lastTelemetryTime.toLocaleTimeString()} (${Math.max(
        0,
        Math.floor((timeNow - lastTelemetryTime.getTime()) / 1000)
      )}s ago)`
    : 'No data received';

  // Raw soil ADC to calibrated percentage
  const calculateSoilPercent = (raw: number) => {
    if (soilDryRaw === soilWetRaw) return 0;
    const pct = ((soilDryRaw - raw) / (soilDryRaw - soilWetRaw)) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  };

  const soilMoisturePct = telemetry?.soil !== undefined ? calculateSoilPercent(telemetry.soil) : null;
  const tempVal = telemetry?.temp ?? 24.5;
  const humVal = telemetry?.hum ?? 62.0;

  // Badge Status mapping
  const badgeStatus: SystemStatus = isConnected
    ? mode === 'mission'
      ? 'running'
      : mode === 'paused'
      ? 'paused'
      : mode === 'fault' || mode === 'estop'
      ? 'fault'
      : 'ready'
    : connectionStatus === 'connecting'
    ? 'paused'
    : 'disconnected';

  // Tank refill warnings
  const waterPct = Math.round((waterTankMl / tankCapacityMl) * 100);
  const treatPct = Math.round((treatTankMl / tankCapacityMl) * 100);
  const waterLow = waterTankMl < 200;
  const treatLow = treatTankMl < 200;

  // Active unacknowledged alerts
  const unackAlerts = alerts.filter((a) => !a.acknowledged);

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER: Status, Mode, Current Task & Staleness Notice */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-2xl bg-surface border-2 border-border shadow-xs">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
              Mission Control
            </h1>
            <StatusBadge
              status={badgeStatus}
              customText={isConnected ? `${mode.toUpperCase()} MODE` : 'OFFLINE'}
              size="md"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-bold text-text-muted">Current Task:</span>
            <span className="font-extrabold text-primary px-2.5 py-0.5 rounded-lg bg-app border border-border">
              {currentTask}
            </span>
          </div>
        </div>

        {/* Staleness Indicator & Connect */}
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 text-xs font-bold transition-colors ${
              isStale
                ? 'border-warning bg-warning/15 text-warning'
                : 'border-primary/40 bg-primary/10 text-primary'
            }`}
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>{isStale ? `Telemetry Paused • ${lastUpdatedText}` : `Live 5 Hz • ${lastUpdatedText}`}</span>
          </div>

          {!isConnected && (
            <Button
              variant="primary"
              size="md"
              onClick={() => connect()}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Connect Rover
            </Button>
          )}
        </div>
      </div>

      {/* 2. PRIMARY GAUGES & SENSORS ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Battery Gauge */}
        <div className={isStale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <Gauge
            level={telemetry?.bat?.pct ?? 0}
            voltage={telemetry?.bat?.v ?? 0}
            label="Main Chassis Battery"
            className="h-full"
          />
        </div>

        {/* Soil Moisture Card */}
        <StatCard
          label="Soil Moisture"
          value={soilMoisturePct !== null ? `${soilMoisturePct}%` : '--'}
          unit={telemetry?.soil !== undefined ? `(${telemetry.soil} ADC)` : ''}
          stale={isStale}
          lastUpdated={lastUpdatedText}
          icon={<Droplets className="w-6 h-6 text-water" />}
          comfortRange={{ min: 30, max: 70, criticalMin: 20, criticalMax: 85 }}
          className={isStale ? 'opacity-60' : ''}
        />

        {/* Chassis Tilt Card */}
        <StatCard
          label="Chassis Tilt"
          value={telemetry?.tilt !== undefined ? `${telemetry.tilt}°` : '--'}
          unit={Math.abs(telemetry?.tilt || 0) > 15 ? 'HIGH TILT' : 'Level'}
          stale={isStale}
          lastUpdated={lastUpdatedText}
          icon={<Compass className="w-6 h-6 text-text-muted" />}
          comfortRange={{ min: -10, max: 10, criticalMin: -18, criticalMax: 18 }}
          className={isStale ? 'opacity-60' : ''}
        />

        {/* Obstacle Distance Card */}
        <StatCard
          label="Obstacle Distance"
          value={telemetry?.dist !== undefined ? telemetry.dist : '--'}
          unit="cm"
          stale={isStale}
          lastUpdated={lastUpdatedText}
          icon={<Radar className="w-6 h-6 text-primary" />}
          comfortRange={{ min: 25, max: 200, criticalMin: 15, criticalMax: 300 }}
          className={isStale ? 'opacity-60' : ''}
        />
      </div>

      {/* 3. CLIMATE CARD (Temperature & Humidity with Comfort Ranges) & TANKS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Greenhouse Climate Card */}
        <Card title="Greenhouse Microclimate (DHT22)" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted">
            Ambient crop environment monitored on chassis. High/low deviations trigger comfort warnings.
          </p>

          <div className={`space-y-4 ${isStale ? 'opacity-60' : ''}`}>
            <RangeBar
              label="Temperature"
              value={tempVal}
              min={tempComfort.min}
              max={tempComfort.max}
              comfortMin={tempComfort.comfortMin}
              comfortMax={tempComfort.comfortMax}
              unit="°C"
            />

            <RangeBar
              label="Relative Humidity"
              value={humVal}
              min={humComfort.min}
              max={humComfort.max}
              comfortMin={humComfort.comfortMin}
              comfortMax={humComfort.comfortMax}
              unit="%"
            />
          </div>
        </Card>

        {/* Tank Levels & Refill Warning */}
        <Card title="Chemical & Water Tank Reserves" variant="default" className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-text-muted">
              Estimated volumes based on pump flow rate calibrations and run time pulses.
            </p>
            <Button
              variant="secondary"
              size="md"
              onClick={refillTanks}
              className="text-xs min-h-[38px] px-3"
            >
              Refill Both Tanks
            </Button>
          </div>

          {/* Water Tank */}
          <div
            className={`p-4 rounded-xl border-2 transition-colors ${
              waterLow ? 'border-danger/80 bg-danger/10' : 'border-border bg-app'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-water" />
                <span className="font-bold text-sm text-text-main">Tank 1: Pure Water</span>
              </div>
              <span className="font-mono font-bold text-sm text-text-main">
                {waterTankMl} / {tankCapacityMl} ml ({waterPct}%)
              </span>
            </div>

            <div className="w-full bg-surface h-3 rounded-full overflow-hidden border border-border">
              <div
                className={`h-full rounded-full transition-all ${
                  waterLow ? 'bg-danger' : 'bg-water'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, waterPct))}%` }}
              />
            </div>
            {waterLow && (
              <p className="text-xs font-bold text-danger mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Refill Warning: Low water reserve ({waterTankMl} ml)
              </p>
            )}
          </div>

          {/* Treatment Tank */}
          <div
            className={`p-4 rounded-xl border-2 transition-colors ${
              treatLow ? 'border-danger/80 bg-danger/10' : 'border-border bg-app'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-treated" />
                <span className="font-bold text-sm text-text-main">Tank 2: Targeted Treatment</span>
              </div>
              <span className="font-mono font-bold text-sm text-text-main">
                {treatTankMl} / {tankCapacityMl} ml ({treatPct}%)
              </span>
            </div>

            <div className="w-full bg-surface h-3 rounded-full overflow-hidden border border-border">
              <div
                className={`h-full rounded-full transition-all ${
                  treatLow ? 'bg-danger' : 'bg-treated'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, treatPct))}%` }}
              />
            </div>
            {treatLow && (
              <p className="text-xs font-bold text-danger mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> Refill Warning: Low chemical treatment ({treatTankMl} ml)
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* 4. SENSOR TREND CHART & MISSION PROGRESS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trend Chart */}
        <Card title="Live Sensor Trend (Moisture & Temperature)" variant="default" className="p-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <div className="flex items-center gap-4 font-bold">
              <span className="flex items-center gap-1.5 text-water">
                <span className="w-3 h-3 rounded-full bg-water inline-block" /> Soil Moisture (ADC)
              </span>
              <span className="flex items-center gap-1.5 text-unsure">
                <span className="w-3 h-3 rounded-full bg-unsure inline-block" /> Temperature (°C)
              </span>
            </div>
            <span>{telemetryHistory.length} data points</span>
          </div>

          {telemetryHistory.length > 2 ? (
            <div className="p-3 bg-app rounded-xl border-2 border-border overflow-hidden">
              <svg className="w-full h-32 overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                {/* Horizontal reference lines */}
                <line x1="0" y1="25" x2="300" y2="25" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <line x1="0" y1="50" x2="300" y2="50" stroke="var(--border-subtle)" strokeDasharray="3 3" />
                <line x1="0" y1="75" x2="300" y2="75" stroke="var(--border-subtle)" strokeDasharray="3 3" />

                {/* Temperature Polyline */}
                <polyline
                  fill="none"
                  stroke="var(--unsure-amber)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={telemetryHistory
                    .map((pt, i) => {
                      const x = (i / (telemetryHistory.length - 1)) * 300;
                      // Normalize temp (15..35 deg -> 90..10 y)
                      const y = 90 - ((pt.temp - 15) / 20) * 80;
                      return `${x.toFixed(1)},${Math.max(5, Math.min(95, y)).toFixed(1)}`;
                    })
                    .join(' ')}
                />

                {/* Soil Polyline */}
                <polyline
                  fill="none"
                  stroke="var(--water-blue)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={telemetryHistory
                    .map((pt, i) => {
                      const x = (i / (telemetryHistory.length - 1)) * 300;
                      // Normalize soil (1200..3200 ADC -> 90..10 y)
                      const y = 90 - ((pt.soil - 1200) / 2000) * 80;
                      return `${x.toFixed(1)},${Math.max(5, Math.min(95, y)).toFixed(1)}`;
                    })
                    .join(' ')}
                />
              </svg>
            </div>
          ) : (
            <div className="h-32 rounded-xl bg-app border-2 border-border flex items-center justify-center text-xs text-text-muted font-bold">
              Collecting live sensor samples...
            </div>
          )}
        </Card>

        {/* Mission Progress */}
        <Card title="Active Mission Progress" variant="default" className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-text-muted">Targeted Greenhouse Bed</span>
            <span className="font-extrabold text-text-main">Row A (Tomato Bed)</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-text-muted">Plants Inspected</span>
              <span className="text-text-main">5 of 12 plants (42%)</span>
            </div>
            <div className="w-full bg-app h-3 rounded-full overflow-hidden border border-border">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: '42%' }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-app border border-border">
              <span className="text-xs text-text-muted font-bold block uppercase">Water Dispensed</span>
              <span className="text-lg font-black text-water">150 ml</span>
            </div>
            <div className="p-3 rounded-xl bg-app border border-border">
              <span className="text-xs text-text-muted font-bold block uppercase">Treatment Applied</span>
              <span className="text-lg font-black text-treated">45 ml</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 5. ACTIVE ALERTS SECTION */}
      <Card title={`Active Alerts (${unackAlerts.length})`} variant="default" className="p-6">
        {unackAlerts.length > 0 ? (
          <div className="space-y-3">
            {unackAlerts.map((al) => (
              <div
                key={al.id}
                className="p-4 rounded-xl border-2 border-danger/60 bg-danger/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-surface border border-danger/30 text-danger flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-text-main">{al.code}</span>
                      <span className="text-[11px] text-text-muted">
                        {al.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-text-main mt-0.5">{al.message}</p>
                  </div>
                </div>

                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => ackAlert(al.id)}
                  className="text-xs px-3.5 py-1.5 min-h-[38px] self-end sm:self-center"
                >
                  Acknowledge
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Sparkles className="w-10 h-10 text-primary" />}
            title="All Systems Nominal"
            message="No active warnings or safety alerts recorded from rover subsystems."
          />
        )}
      </Card>
    </div>
  );
};
