import React, { useState, useEffect } from 'react';
import {
  AlertOctagon,
  Battery,
  BatteryWarning,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useRoverStore } from '../../store/roverStore';
import { useAutoModeStore } from '../../store/autoModeStore';
import { LeafLogo } from '../ui/LeafLogo';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import type { SystemStatus } from '../ui/StatusBadge';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Switch } from '../ui/Switch';
import { ConfirmDialog } from '../ui/ConfirmDialog';

export const TopBar: React.FC = () => {
  const {
    connectionStatus,
    telemetry,
    mode,
    transportType,
    setTransportType,
    connect,
    disconnect,
    emergencyStop,
  } = useRoverStore();

  const {
    activePresetName,
    activePreset,
    checkPreRunReady,
    engageAuto,
    disengageAuto,
    pollCameraHealth,
  } = useAutoModeStore();

  const [showEngageConfirm, setShowEngageConfirm] = useState(false);
  const [showChecklistError, setShowChecklistError] = useState(false);
  const [checklistErrors, setChecklistErrors] = useState<string[]>([]);

  // Periodically check camera health
  useEffect(() => {
    pollCameraHealth();
    const interval = setInterval(pollCameraHealth, 10000);
    return () => clearInterval(interval);
  }, [pollCameraHealth]);

  // Derived state from telemetry mode: always OFF on load, never remembers ON
  const isAutoOn = mode === 'mission';

  const handleAutoSwitchChange = (turnOn: boolean) => {
    if (turnOn) {
      const ready = checkPreRunReady();
      if (!ready.ok) {
        setChecklistErrors(ready.errors);
        setShowChecklistError(true);
        return;
      }
      setShowEngageConfirm(true);
    } else {
      disengageAuto();
    }
  };

  const handleConfirmEngage = async () => {
    setShowEngageConfirm(false);
    await engageAuto();
  };

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  // Map rover status for StatusBadge
  const badgeStatus: SystemStatus =
    connectionStatus === 'connected'
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

  const badgeText =
    connectionStatus === 'connected'
      ? `${transportType.toUpperCase()} ONLINE`
      : connectionStatus === 'connecting'
      ? 'CONNECTING...'
      : 'OFFLINE';

  const handleConnectToggle = () => {
    if (isConnected || isConnecting) {
      disconnect();
    } else {
      connect();
    }
  };

  const batPct = telemetry?.bat?.pct ?? null;
  const batV = telemetry?.bat?.v ?? null;
  const isBatLow = telemetry?.bat?.low ?? false;

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-border bg-surface text-text-main shadow-sm transition-colors">
      <div className="flex h-20 items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4 max-w-[1920px] mx-auto">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 min-w-max">
          <LeafLogo size={36} className="text-primary" />
          <div className="hidden sm:block leading-none">
            <span className="text-xl font-black tracking-tight text-text-main block">
              AGRI-ROVER
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
              Yantravedha Farm OS
            </span>
          </div>
        </div>

        {/* Center Indicators: Connection, Battery, Mode, Transport */}
        <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 scrollbar-none">
          {/* Status Badge */}
          <StatusBadge status={badgeStatus} customText={badgeText} size="md" />

          {/* Connect / Disconnect Button */}
          <Button
            size="md"
            variant={isConnected ? 'secondary' : 'primary'}
            onClick={handleConnectToggle}
            className="text-xs sm:text-sm px-3.5 sm:px-4 min-h-[44px]"
            icon={isConnected ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
          >
            {isConnected ? 'Disconnect' : isConnecting ? 'Connecting...' : 'Connect'}
          </Button>

          {/* Transport Type Toggle */}
          <div className="hidden lg:flex items-center bg-app border-2 border-border rounded-xl p-1 gap-1 text-xs font-bold">
            <button
              onClick={() => setTransportType('ble')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors min-h-[32px] ${
                transportType === 'ble'
                  ? 'bg-primary text-surface shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              BLE
            </button>
            <button
              onClick={() => setTransportType('mock')}
              className={`px-2.5 py-1.5 rounded-lg transition-colors min-h-[32px] ${
                transportType === 'mock'
                  ? 'bg-primary text-surface shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              MOCK
            </button>
          </div>

          {/* Battery Status */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 bg-surface min-h-[44px] ${
              isBatLow ? 'border-danger text-danger' : 'border-border text-text-main'
            }`}
          >
            {isBatLow ? (
              <BatteryWarning className="w-5 h-5 text-danger animate-pulse" />
            ) : (
              <Battery className="w-5 h-5 text-primary" />
            )}
            <div className="flex flex-col text-xs font-bold leading-tight">
              <span>{batPct !== null ? `${batPct}%` : '--%'}</span>
              <span className="text-[10px] text-text-muted">{batV !== null ? `${batV}V` : '--V'}</span>
            </div>
          </div>

          {/* Mode Pill */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-border bg-surface text-xs font-black uppercase min-h-[44px]">
            <span className="text-text-muted">MODE:</span>
            <span
              className={
                mode === 'estop' || mode === 'fault'
                  ? 'text-danger'
                  : mode === 'mission'
                  ? 'text-water'
                  : mode === 'manual'
                  ? 'text-unsure'
                  : 'text-primary'
              }
            >
              {mode}
            </span>
          </div>
        </div>

        {/* Right Actions: Auto Switch, Theme Toggle & Big Red E-STOP */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Global Auto Switch */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl border-2 border-border bg-app min-h-[44px]">
            <span className="text-xs font-black uppercase text-text-muted hidden sm:inline select-none">
              AUTO
            </span>
            <Switch
              id="global-topbar-auto-switch"
              checked={isAutoOn}
              onChange={handleAutoSwitchChange}
              className="p-0 hover:bg-transparent min-h-0"
            />
          </div>

          <ThemeToggle showLabels={false} className="hidden sm:inline-flex" />

          {/* BIG RED EMERGENCY STOP BUTTON */}
          <Button
            variant="danger"
            size="lg"
            onClick={() => emergencyStop()}
            className="px-4 sm:px-6 min-h-[48px] sm:min-h-[52px] shadow-lg font-black tracking-wider border-2 border-danger active:scale-95 transition-transform"
            icon={<AlertOctagon className="w-6 h-6 animate-pulse" />}
          >
            <span className="hidden xs:inline">E-STOP</span>
            <span className="xs:hidden">STOP</span>
          </Button>
        </div>
      </div>

      {/* Confirmation Dialog to Engage Autonomous Mode */}
      <ConfirmDialog
        isOpen={showEngageConfirm}
        title="Engage Autonomous Mission Mode?"
        description={`Start autonomous patrol with preset '${activePresetName}' (${activePreset.rows} row(s), ${activePreset.plantsPerRow} plants/row). The rover will automatically traverse plant positions, read soil probes, inspect health, and dispense precision treatment.`}
        confirmText="Engage Auto"
        cancelText="Cancel"
        variant="primary"
        onConfirm={handleConfirmEngage}
        onCancel={() => setShowEngageConfirm(false)}
      />

      {/* Checklist Incomplete Dialog */}
      <ConfirmDialog
        isOpen={showChecklistError}
        title="Cannot Engage Auto: Checklist Incomplete"
        description={`The autonomous mission cannot be engaged until all pre-run safety conditions pass:\n\n• ${checklistErrors.join('\n• ')}`}
        confirmText="Review Checklist"
        cancelText="Close"
        variant="danger"
        onConfirm={() => setShowChecklistError(false)}
        onCancel={() => setShowChecklistError(false)}
      />
    </header>
  );
};
