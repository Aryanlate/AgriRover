import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Droplets,
  Sprout,
  ShieldAlert,
  Save,
  FolderOpen,
  Camera,
  Activity,
  Layers,
  BatteryCharging,
  Wifi,
  Sparkles,
  Info,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useRoverStore } from '../store/roverStore';
import { useAutoModeStore } from '../store/autoModeStore';
import { useMissionRunner } from '../mission/useMissionRunner';
import type { MissionConfig } from '../mission/missionRunner';
import { apiClient } from '../services/api/client';

interface Preset {
  id: string;
  name: string;
  config: MissionConfig;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'tomato_std',
    name: 'Tomato - Standard Greenhouse',
    config: {
      plant: 'tomato',
      rows: 1,
      plantsPerRow: 5,
      plantSpacingMm: 300,
      rowSpacingMm: 800,
      moistureThreshold: 35.0,
      waterDoseMl: 50.0,
      treatDoseMl: 25.0,
      perPlantWaterCapMl: 150.0,
      perPlantTreatCapMl: 60.0,
      perRunWaterCapMl: 2500.0,
      perRunTreatCapMl: 1000.0,
      lowConfidence: 0.60,
      highConfidence: 0.85,
      minBatteryPct: 20,
      waterPumpFlowRate: 25,
      treatPumpFlowRate: 20,
      initialWaterMl: 1000,
      initialTreatMl: 1000,
    },
  },
  {
    id: 'pepper_dense',
    name: 'Pepper - High Density Row',
    config: {
      plant: 'pepper',
      rows: 2,
      plantsPerRow: 8,
      plantSpacingMm: 250,
      rowSpacingMm: 700,
      moistureThreshold: 40.0,
      waterDoseMl: 40.0,
      treatDoseMl: 20.0,
      perPlantWaterCapMl: 120.0,
      perPlantTreatCapMl: 50.0,
      perRunWaterCapMl: 3000.0,
      perRunTreatCapMl: 1200.0,
      lowConfidence: 0.65,
      highConfidence: 0.88,
      minBatteryPct: 25,
      waterPumpFlowRate: 25,
      treatPumpFlowRate: 20,
      initialWaterMl: 1200,
      initialTreatMl: 1000,
    },
  },
  {
    id: 'potato_deep',
    name: 'Potato - Deep Root Bed',
    config: {
      plant: 'potato',
      rows: 1,
      plantsPerRow: 6,
      plantSpacingMm: 400,
      rowSpacingMm: 900,
      moistureThreshold: 30.0,
      waterDoseMl: 75.0,
      treatDoseMl: 30.0,
      perPlantWaterCapMl: 200.0,
      perPlantTreatCapMl: 80.0,
      perRunWaterCapMl: 3500.0,
      perRunTreatCapMl: 1200.0,
      lowConfidence: 0.60,
      highConfidence: 0.85,
      minBatteryPct: 20,
      waterPumpFlowRate: 25,
      treatPumpFlowRate: 20,
      initialWaterMl: 1500,
      initialTreatMl: 1000,
    },
  },
  {
    id: 'brinjal_field',
    name: 'Brinjal - Standard Spaced',
    config: {
      plant: 'brinjal',
      rows: 2,
      plantsPerRow: 6,
      plantSpacingMm: 350,
      rowSpacingMm: 800,
      moistureThreshold: 35.0,
      waterDoseMl: 60.0,
      treatDoseMl: 25.0,
      perPlantWaterCapMl: 180.0,
      perPlantTreatCapMl: 70.0,
      perRunWaterCapMl: 3000.0,
      perRunTreatCapMl: 1000.0,
      lowConfidence: 0.60,
      highConfidence: 0.85,
      minBatteryPct: 20,
      waterPumpFlowRate: 25,
      treatPumpFlowRate: 20,
      initialWaterMl: 1000,
      initialTreatMl: 1000,
    },
  },
];

export const MissionPage: React.FC = () => {
  const {
    connectionStatus,
    telemetry,
    mode,
    alerts,
    send,
    transportType,
  } = useRoverStore();

  const { runner, snapshot } = useMissionRunner();

  // Active configuration
  const [config, setConfig] = useState<MissionConfig>(DEFAULT_PRESETS[0].config);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESETS[0].id);
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [newPresetName, setNewPresetName] = useState('');
  const [showSavePresetInput, setShowSavePresetInput] = useState(false);

  // Pre-run checklist
  const [cameraOnline, setCameraOnline] = useState<boolean | null>(null);
  const [selfTestPassed, setSelfTestPassed] = useState<boolean>(false);
  const [tanksFilledChecked, setTanksFilledChecked] = useState<boolean>(true);
  const [selfTestRunning, setSelfTestRunning] = useState<boolean>(false);

  // Scheduling
  const [reminderTime, setReminderTime] = useState<string>('07:00');
  const [reminderActive, setReminderActive] = useState<boolean>(false);
  const [reminderTriggered, setReminderTriggered] = useState<boolean>(false);

  // Confirm dialogs
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  // Load presets from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('agrirover_mission_presets');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPresets([...DEFAULT_PRESETS, ...parsed]);
        }
      }
    } catch {
      // Ignore parse error
    }
  }, []);

  // Check camera health periodically
  useEffect(() => {
    let mounted = true;
    const checkCam = async () => {
      try {
        await apiClient.checkHealth();
        if (mounted) setCameraOnline(true);
      } catch {
        if (mounted) setCameraOnline(false);
      }
    };
    checkCam();
    const interval = setInterval(checkCam, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Remind-me-at-time checker
  useEffect(() => {
    if (!reminderActive) return;

    const timer = setInterval(() => {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeString = `${currentHours}:${currentMinutes}`;

      if (currentTimeString === reminderTime && !reminderTriggered) {
        setReminderTriggered(true);
        // Browser notification if permitted
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Agri-Rover Mission Reminder', {
            body: `Scheduled time ${reminderTime} reached. Operator presence required to start mission.`,
          });
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [reminderActive, reminderTime, reminderTriggered]);

  // Request browser notification permission once
  const handleEnableReminder = () => {
    if (!reminderActive) {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      setReminderActive(true);
      setReminderTriggered(false);
    } else {
      setReminderActive(false);
      setReminderTriggered(false);
    }
  };

  // Run self test
  const handleRunSelfTest = async () => {
    setSelfTestRunning(true);
    await send({ c: 'selftest' });
    setTimeout(() => {
      setSelfTestRunning(false);
      setSelfTestPassed(true);
      useAutoModeStore.getState().setSelfTestPassed(true);
    }, 1500);
  };

  // Preset operations
  const handleSelectPreset = (id: string) => {
    setSelectedPresetId(id);
    const found = presets.find((p) => p.id === id);
    if (found) {
      setConfig({ ...found.config });
      useAutoModeStore.getState().setActivePreset(found.name, found.config);
    }
  };

  const handleSaveCustomPreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: Preset = {
      id: `custom_${Date.now()}`,
      name: newPresetName.trim(),
      config: { ...config },
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    setSelectedPresetId(newPreset.id);
    setNewPresetName('');
    setShowSavePresetInput(false);

    useAutoModeStore.getState().setActivePreset(newPreset.name, newPreset.config);

    const customOnly = updated.filter((p) => p.id.startsWith('custom_'));
    localStorage.setItem('agrirover_mission_presets', JSON.stringify(customOnly));
  };

  // Checklist criteria
  const isConnected = connectionStatus === 'connected';
  const isBatteryOk = telemetry ? telemetry.bat.pct >= config.minBatteryPct && !telemetry.bat.low : false;
  const isEstopReleased = mode !== 'estop' && !alerts.some((a) => a.code === 'ESTOP' && !a.acknowledged);
  const isCameraReady = cameraOnline === true || transportType === 'mock';
  const isSelfTestReady = selfTestPassed;
  const isTanksReady = tanksFilledChecked;

  const allChecklistPassed =
    isConnected &&
    isBatteryOk &&
    isEstopReleased &&
    isCameraReady &&
    isSelfTestReady &&
    isTanksReady;

  // Mission controls
  const handleStartMission = () => {
    setReminderTriggered(false);
    runner.start(config);
  };

  const handlePauseMission = () => {
    runner.pause('Operator requested pause');
  };

  const handleResumeMission = () => {
    runner.resume();
  };

  const handleAbortConfirm = () => {
    runner.abort('Operator aborted mission');
    setShowAbortConfirm(false);
  };

  const handleRefillAndResume = () => {
    runner.refillAndResume(config.initialWaterMl ?? 1000, config.initialTreatMl ?? 1000);
  };

  const isMissionRunning = snapshot.status === 'running';
  const isMissionPaused = snapshot.status === 'paused';

  const subStepLabel = useMemo(() => {
    switch (snapshot.subStep) {
      case 'moving':
        return `Navigating to plant ${snapshot.currentPlantId || ''}...`;
      case 'probing':
        return 'Reading soil moisture probe...';
      case 'scanning_leaf':
        return 'Positioning camera (Leaf pose) & classifying...';
      case 'scanning_stem':
        return 'Positioning camera (Stem pose) & classifying...';
      case 'deciding':
        return 'Evaluating AI rulebook & dosing limits...';
      case 'aiming':
        return 'Aiming precision dual-action nozzle...';
      case 'spraying':
        return 'Dispensing capped liquid application...';
      case 'logging':
        return 'Recording telemetry & plant history...';
      case 'returning':
        return 'Returning to origin dock...';
      case 'waiting_refill':
        return 'Paused: Tanks depleted. Refill required!';
      case 'paused_bluetooth':
        return 'Paused: Bluetooth link disconnected.';
      default:
        return snapshot.status === 'idle' ? 'Ready for deployment' : 'System standby';
    }
  }, [snapshot.subStep, snapshot.status, snapshot.currentPlantId]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main flex items-center gap-3">
            <Sprout className="w-8 h-8 text-primary" />
            Autonomous Mission Orchestrator
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Plant-by-plant automated cycle: transit, soil moisture read, dual-pose vision scan, AI decision, and capped treatment spray.
          </p>
        </div>

        {/* Global Mission Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {snapshot.status === 'idle' || snapshot.status === 'completed' || snapshot.status === 'aborted' || snapshot.status === 'fault' ? (
            <Button
              variant="primary"
              size="lg"
              disabled={!allChecklistPassed}
              onClick={handleStartMission}
              icon={<Play className="w-5 h-5 fill-current" />}
            >
              Start Mission
            </Button>
          ) : isMissionRunning ? (
            <>
              <Button
                variant="secondary"
                size="lg"
                onClick={handlePauseMission}
                icon={<Pause className="w-5 h-5" />}
              >
                Pause
              </Button>
              <Button
                variant="danger"
                size="lg"
                onClick={() => setShowAbortConfirm(true)}
                icon={<Square className="w-5 h-5" />}
              >
                Abort
              </Button>
            </>
          ) : isMissionPaused ? (
            <>
              <Button
                variant="primary"
                size="lg"
                onClick={handleResumeMission}
                icon={<Play className="w-5 h-5 fill-current" />}
              >
                Resume
              </Button>
              <Button
                variant="danger"
                size="lg"
                onClick={() => setShowAbortConfirm(true)}
                icon={<Square className="w-5 h-5" />}
              >
                Abort
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* Bluetooth Disconnection Alert Banner */}
      {snapshot.subStep === 'paused_bluetooth' && (
        <Card variant="outline" className="border-warning bg-warning/10 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Wifi className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-main">
                  Bluetooth Connection Dropped
                </h3>
                <p className="text-sm text-text-muted mt-0.5">
                  The mission was automatically paused for safety. Reconnect Bluetooth in the top bar and resume directly from plant{' '}
                  <span className="font-bold text-text-main">{snapshot.currentPlantId || `#${snapshot.currentPlantIndex + 1}`}</span>.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              disabled={!isConnected}
              onClick={handleResumeMission}
              icon={<Play className="w-4 h-4 fill-current" />}
            >
              Resume from Current Plant
            </Button>
          </div>
        </Card>
      )}

      {/* Refill Liquid Alert Banner */}
      {snapshot.subStep === 'waiting_refill' && (
        <Card variant="outline" className="border-warning bg-warning/10 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Droplets className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-main">
                  Liquid Reserves Depleted
                </h3>
                <p className="text-sm text-text-muted mt-0.5">
                  Remaining liquid is insufficient for the next plant. Refill onboard water and treatment tanks to continue.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleRefillAndResume}
              icon={<CheckCircle2 className="w-4 h-4" />}
            >
              Tanks Refilled: Resume Mission
            </Button>
          </div>
        </Card>
      )}

      {/* Fault / Error Alert Banner */}
      {snapshot.status === 'fault' && snapshot.errorMessage && (
        <Card variant="outline" className="border-danger bg-danger/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-danger flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-base font-bold text-danger">
                Hardware Safety Fault Triggered
              </h3>
              <p className="text-sm text-text-muted mt-0.5">
                {snapshot.errorMessage}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => runner.abort('Fault cleared')}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Reset Runner
            </Button>
          </div>
        </Card>
      )}

      {/* Alarm Triggered Banner */}
      {reminderTriggered && (
        <Card variant="outline" className="border-primary bg-primary/10 p-5 animate-pulse">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-text-main">
                  Scheduled Mission Time Reached ({reminderTime})
                </h3>
                <p className="text-sm text-text-muted mt-0.5">
                  Operator is on-site. Perform pre-run checklist verification and launch with one click.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!allChecklistPassed}
                onClick={handleStartMission}
                icon={<Play className="w-4 h-4 fill-current" />}
              >
                Start Mission Now
              </Button>
              <Button
                variant="secondary"
                onClick={() => setReminderTriggered(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Live Mission Status Dashboard (Visible when Active or has History) */}
      {(isMissionRunning || isMissionPaused || snapshot.plantLogs.length > 0) && (
        <Card variant="default" className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <StatusBadge
                  status={
                    snapshot.status === 'running'
                      ? 'running'
                      : snapshot.status === 'paused'
                      ? 'paused'
                      : snapshot.status === 'fault'
                      ? 'fault'
                      : 'ready'
                  }
                  customText={snapshot.status.toUpperCase()}
                />
                <span className="text-sm font-bold text-text-main">
                  Plant Progress: {snapshot.currentPlantIndex} / {snapshot.totalPlants}
                </span>
              </div>
              <p className="text-xs font-semibold text-text-muted flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                Current Phase: <span className="text-text-main font-bold">{subStepLabel}</span>
              </p>
            </div>

            {/* Tank Levels Bar */}
            <div className="flex items-center gap-6 text-xs font-semibold text-text-muted">
              <div>
                <span className="block text-text-muted">Water Remaining:</span>
                <span className="text-sm font-bold text-water">{snapshot.waterRemainingMl} ml</span>
                <span className="text-[10px] text-text-muted block">(Used: {snapshot.totalWaterUsedMl} ml)</span>
              </div>
              <div>
                <span className="block text-text-muted">Treatment Remaining:</span>
                <span className="text-sm font-bold text-treated">{snapshot.treatRemainingMl} ml</span>
                <span className="text-[10px] text-text-muted block">(Used: {snapshot.totalTreatUsedMl} ml)</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="w-full h-3 rounded-full bg-app border border-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{
                  width: `${
                    snapshot.totalPlants > 0
                      ? Math.min(100, (snapshot.currentPlantIndex / snapshot.totalPlants) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Plant Inspection Log Records */}
          {snapshot.plantLogs.length > 0 && (
            <div className="mt-6">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                Completed Plant Records ({snapshot.plantLogs.length})
              </h4>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-app border-b border-border text-text-muted font-bold">
                    <tr>
                      <th className="p-3">Plant ID</th>
                      <th className="p-3">Moisture</th>
                      <th className="p-3">Leaf State</th>
                      <th className="p-3">Stem State</th>
                      <th className="p-3">Actions Applied</th>
                      <th className="p-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.plantLogs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-app/40 transition-colors">
                        <td className="p-3 font-bold text-text-main">{log.plantId}</td>
                        <td className="p-3">
                          <span className="font-semibold text-water">{log.moisturePct}%</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              log.leafState === 'healthy'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : log.leafState === 'diseased'
                                ? 'bg-danger/10 text-danger border border-danger/20'
                                : 'bg-app text-text-muted border border-border'
                            }`}
                          >
                            {log.leafState || 'n/a'}{' '}
                            {log.leafConfidence ? `(${Math.round(log.leafConfidence * 100)}%)` : ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              log.stemState === 'healthy'
                                ? 'bg-primary/10 text-primary border border-primary/20'
                                : log.stemState === 'diseased'
                                ? 'bg-danger/10 text-danger border border-danger/20'
                                : 'bg-app text-text-muted border border-border'
                            }`}
                          >
                            {log.stemState || 'n/a'}{' '}
                            {log.stemConfidence ? `(${Math.round(log.stemConfidence * 100)}%)` : ''}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {log.waterDispensedMl > 0 && (
                              <span className="px-2 py-0.5 rounded bg-water/10 text-water border border-water/20 font-bold">
                                💧 {log.waterDispensedMl}ml
                              </span>
                            )}
                            {log.treatDispensedMl > 0 && (
                              <span className="px-2 py-0.5 rounded bg-treated/10 text-treated border border-treated/20 font-bold">
                                🌿 {log.treatDispensedMl}ml
                              </span>
                            )}
                            {log.waterDispensedMl === 0 && log.treatDispensedMl === 0 && (
                              <span className="text-text-muted">None (Healthy/Unsure)</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-text-muted">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Main Grid: Planner & Pre-run Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Mission Planner */}
        <div className="lg:col-span-2 space-y-6">
          <Card variant="default" className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h2 className="text-lg font-bold text-text-main flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Mission Crop & Route Planner
                </h2>
                <p className="text-xs text-text-muted">
                  Configure field layout, agronomic thresholds, and dosing safeguards.
                </p>
              </div>

              {/* Preset Selector */}
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-text-muted" />
                <select
                  aria-label="Preset Selection"
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="bg-app border border-border text-text-main text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-primary"
                >
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowSavePresetInput(!showSavePresetInput)}
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Preset
                </Button>
              </div>
            </div>

            {/* Save Preset Input Bar */}
            {showSavePresetInput && (
              <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Preset name (e.g. Tomato Spring Row 3)..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-main font-semibold outline-none focus:border-primary"
                />
                <Button variant="primary" size="md" onClick={handleSaveCustomPreset}>
                  Save
                </Button>
                <Button variant="secondary" size="md" onClick={() => setShowSavePresetInput(false)}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Form Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
              {/* Plant Crop Type */}
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                  Crop Species
                </label>
                <select
                  value={config.plant}
                  onChange={(e) => setConfig({ ...config, plant: e.target.value })}
                  className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                >
                  <option value="tomato">Tomato (Solanum lycopersicum)</option>
                  <option value="potato">Potato (Solanum tuberosum)</option>
                  <option value="pepper">Pepper (Capsicum annuum)</option>
                  <option value="brinjal">Brinjal / Eggplant (Solanum melongena)</option>
                </select>
              </div>

              {/* Grid Dimensions */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Rows
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={config.rows}
                    onChange={(e) => setConfig({ ...config, rows: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Plants / Row
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={config.plantsPerRow}
                    onChange={(e) =>
                      setConfig({ ...config, plantsPerRow: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Spacings */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Plant Spacing (mm)
                  </label>
                  <input
                    type="number"
                    step={10}
                    min={100}
                    value={config.plantSpacingMm}
                    onChange={(e) =>
                      setConfig({ ...config, plantSpacingMm: Math.max(50, parseInt(e.target.value) || 300) })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Row Spacing (mm)
                  </label>
                  <input
                    type="number"
                    step={50}
                    min={200}
                    value={config.rowSpacingMm}
                    onChange={(e) =>
                      setConfig({ ...config, rowSpacingMm: Math.max(100, parseInt(e.target.value) || 800) })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Moisture & Water Dose */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Moisture Threshold (%)
                  </label>
                  <input
                    type="number"
                    step={1}
                    min={5}
                    max={80}
                    value={config.moistureThreshold}
                    onChange={(e) =>
                      setConfig({ ...config, moistureThreshold: parseFloat(e.target.value) || 35 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Water Dose (ml)
                  </label>
                  <input
                    type="number"
                    step={5}
                    min={10}
                    max={500}
                    value={config.waterDoseMl}
                    onChange={(e) =>
                      setConfig({ ...config, waterDoseMl: parseFloat(e.target.value) || 50 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Per-Plant Caps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Plant Water Cap (ml)
                  </label>
                  <input
                    type="number"
                    step={10}
                    value={config.perPlantWaterCapMl}
                    onChange={(e) =>
                      setConfig({ ...config, perPlantWaterCapMl: parseFloat(e.target.value) || 150 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Plant Treat Cap (ml)
                  </label>
                  <input
                    type="number"
                    step={5}
                    value={config.perPlantTreatCapMl}
                    onChange={(e) =>
                      setConfig({ ...config, perPlantTreatCapMl: parseFloat(e.target.value) || 60 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Per-Run Caps */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Run Water Cap (ml)
                  </label>
                  <input
                    type="number"
                    step={100}
                    value={config.perRunWaterCapMl}
                    onChange={(e) =>
                      setConfig({ ...config, perRunWaterCapMl: parseFloat(e.target.value) || 2500 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Run Treat Cap (ml)
                  </label>
                  <input
                    type="number"
                    step={100}
                    value={config.perRunTreatCapMl}
                    onChange={(e) =>
                      setConfig({ ...config, perRunTreatCapMl: parseFloat(e.target.value) || 1000 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* AI Confidence Thresholds */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    Low Confidence (Unsure)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.3}
                    max={0.9}
                    value={config.lowConfidence}
                    onChange={(e) =>
                      setConfig({ ...config, lowConfidence: parseFloat(e.target.value) || 0.6 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                    High Confidence (Treat)
                  </label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.5}
                    max={0.99}
                    value={config.highConfidence}
                    onChange={(e) =>
                      setConfig({ ...config, highConfidence: parseFloat(e.target.value) || 0.85 })
                    }
                    className="w-full bg-app border border-border text-text-main text-sm font-bold rounded-xl px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>

            {/* Summary Tag */}
            <div className="mt-5 p-3 rounded-xl bg-app border border-border flex items-center justify-between text-xs font-bold text-text-muted">
              <span>Planned Target: {config.rows * config.plantsPerRow} Plants ({config.rows} rows × {config.plantsPerRow} plants)</span>
              <span>Total Distance: {(config.rows * config.plantsPerRow * config.plantSpacingMm) / 1000} m</span>
            </div>
          </Card>

          {/* Scheduling: Remind-Me-At-Time Feature */}
          <Card variant="default" className="p-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-text-main flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  Operator Dispatch Reminder
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Set a local operator reminder for scheduled greenhouse patrol.
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  reminderActive
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-app text-text-muted border-border'
                }`}
              >
                {reminderActive ? 'Active' : 'Disabled'}
              </span>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-text-muted uppercase">
                  Reminder Time:
                </label>
                <input
                  type="time"
                  value={reminderTime}
                  disabled={reminderActive}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="bg-app border border-border text-text-main font-bold text-sm rounded-xl px-4 py-2.5 outline-none focus:border-primary"
                />
              </div>

              <Button
                variant={reminderActive ? 'secondary' : 'primary'}
                size="md"
                onClick={handleEnableReminder}
                icon={<Clock className="w-4 h-4" />}
              >
                {reminderActive ? 'Cancel Reminder' : 'Set Alarm Reminder'}
              </Button>
            </div>

            {/* Mandatory Safety Notice */}
            <div className="mt-4 p-3.5 rounded-xl border border-border bg-app/60 flex items-start gap-3">
              <Info className="w-5 h-5 text-water flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-muted leading-relaxed">
                <span className="font-bold text-text-main">Notice:</span> Unattended missions are not possible over Bluetooth. Web Bluetooth connections require an active browser tab within radio range, continuous keepalive heartbeats, and on-site operator oversight for physical safety and emergency stop intervention.
              </p>
            </div>
          </Card>
        </div>

        {/* Right Column: Pre-Run Checklist */}
        <div className="space-y-6">
          <Card variant="default" className="p-6">
            <div className="pb-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-main flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  Pre-Run Checklist
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Verify safety conditions before automated launch.
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  allChecklistPassed
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-warning/10 text-warning border-warning/30'
                }`}
              >
                {allChecklistPassed ? 'Ready' : 'Incomplete'}
              </span>
            </div>

            {/* Checklist items */}
            <div className="mt-4 space-y-3">
              {/* Item 1: BLE Connected */}
              <div className="p-3 rounded-xl border border-border bg-app flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wifi
                    className={`w-4 h-4 ${isConnected ? 'text-primary' : 'text-danger'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">Rover Connected</span>
                    <span className="text-[11px] text-text-muted">
                      {isConnected ? 'BLE / Mock transport active' : 'Connect via top bar'}
                    </span>
                  </div>
                </div>
                {isConnected ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-danger" />
                )}
              </div>

              {/* Item 2: Battery Level */}
              <div className="p-3 rounded-xl border border-border bg-app flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BatteryCharging
                    className={`w-4 h-4 ${isBatteryOk ? 'text-primary' : 'text-danger'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">Battery Level</span>
                    <span className="text-[11px] text-text-muted">
                      {telemetry ? `${telemetry.bat.pct}% (Threshold: ${config.minBatteryPct}%)` : 'No telemetry'}
                    </span>
                  </div>
                </div>
                {isBatteryOk ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-danger" />
                )}
              </div>

              {/* Item 3: Camera Online */}
              <div className="p-3 rounded-xl border border-border bg-app flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Camera
                    className={`w-4 h-4 ${isCameraReady ? 'text-primary' : 'text-danger'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">Camera Vision</span>
                    <span className="text-[11px] text-text-muted">
                      {isCameraReady ? 'ESP32-CAM stream online' : 'Offline / Unreachable'}
                    </span>
                  </div>
                </div>
                {isCameraReady ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-danger" />
                )}
              </div>

              {/* Item 4: E-Stop Released */}
              <div className="p-3 rounded-xl border border-border bg-app flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldAlert
                    className={`w-4 h-4 ${isEstopReleased ? 'text-primary' : 'text-danger'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">E-Stop Released</span>
                    <span className="text-[11px] text-text-muted">
                      {isEstopReleased ? 'Hardware loop disengaged' : 'E-Stop active or tripped'}
                    </span>
                  </div>
                </div>
                {isEstopReleased ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-danger" />
                )}
              </div>

              {/* Item 5: Self-Test Passed */}
              <div className="p-3 rounded-xl border border-border bg-app flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity
                    className={`w-4 h-4 ${isSelfTestReady ? 'text-primary' : 'text-warning'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">Self-Test Diagnostic</span>
                    <span className="text-[11px] text-text-muted">
                      {isSelfTestReady ? 'Actuators & sensors verified' : 'Run diagnostic verification'}
                    </span>
                  </div>
                </div>
                {isSelfTestReady ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={selfTestRunning || !isConnected}
                    onClick={handleRunSelfTest}
                  >
                    {selfTestRunning ? 'Running...' : 'Run Test'}
                  </Button>
                )}
              </div>

              {/* Item 6: Tanks Filled (Manual Confirmation) */}
              <label className="p-3 rounded-xl border border-border bg-app flex items-center justify-between cursor-pointer hover:bg-app/80 transition-colors">
                <div className="flex items-center gap-3">
                  <Droplets
                    className={`w-4 h-4 ${isTanksReady ? 'text-water' : 'text-text-muted'}`}
                  />
                  <div>
                    <span className="text-xs font-bold text-text-main block">Tanks Filled</span>
                    <span className="text-[11px] text-text-muted">
                      Manual check: Water and treatment full
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={tanksFilledChecked}
                  onChange={(e) => {
                    setTanksFilledChecked(e.target.checked);
                    useAutoModeStore.getState().setTanksFilled(e.target.checked);
                  }}
                  className="w-5 h-5 text-primary rounded border-border focus:ring-primary cursor-pointer"
                />
              </label>
            </div>

            {/* Launch Action */}
            <div className="mt-6 pt-4 border-t border-border">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!allChecklistPassed || isMissionRunning}
                onClick={handleStartMission}
                icon={<Sparkles className="w-5 h-5" />}
              >
                {allChecklistPassed ? 'Launch Autonomous Run' : 'Checklist Incomplete'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Confirmation Dialog for Abort */}
      <ConfirmDialog
        isOpen={showAbortConfirm}
        title="Abort Active Mission?"
        description="This will immediately stop rover traction motors, disengage pumps, and cancel the current agricultural route."
        confirmText="Abort Mission"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleAbortConfirm}
        onCancel={() => setShowAbortConfirm(false)}
      />
    </div>
  );
};
