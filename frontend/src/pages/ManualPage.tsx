import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Crosshair,
  Droplets,
  FlaskConical,
  Layers,
  Pause,
  RotateCcw,
  ShieldAlert,
  Square,
  Zap,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { useAutoModeStore } from '../store/autoModeStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Toast } from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';
import { apiClient } from '../services/api/client';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message: string;
}

export const ManualPage: React.FC = () => {
  const {
    connectionStatus,
    telemetry,
    send,
    mode,
    setMode,
    latestAck,
    probeMoistureResult,
    alerts,
  } = useRoverStore();

  const { turningOffPending, pauseAuto } = useAutoModeStore();

  // Safety & Auto Lock State Evaluation
  const FAULT_CODES = [
    'PROBE_STUCK',
    'LOW_BAT_CUTOFF',
    'TILT',
    'SLIP',
    'HB_LOST',
    'ESTOP',
    'OBSTACLE',
    'SENSOR_FAIL',
    'HARDWARE_FAULT',
  ];

  const isAutoRunning = mode === 'mission';
  const isDisconnected = connectionStatus !== 'connected';
  const isEstop =
    mode === 'estop' ||
    telemetry?.mode === 'estop' ||
    alerts.some((a) => a.code === 'ESTOP' && !a.acknowledged);
  const isFault =
    mode === 'fault' ||
    telemetry?.mode === 'fault' ||
    alerts.some(
      (a) =>
        (a.code.startsWith('FAULT') || FAULT_CODES.includes(a.code)) &&
        !a.acknowledged
    );
  const isLowBattery = Boolean(telemetry?.bat && (telemetry.bat.pct < 20 || telemetry.bat.low));
  
  // Soil probe state: only blocks driving wheels, never locks the probe actuator buttons!
  const isProbeDeployed = telemetry
    ? telemetry.probe === 'down' || telemetry.probe === 'moving' || telemetry.probe === 'stuck'
    : false;

  // General safety locks: rover disconnected, e-stop, hardware fault, or low battery
  const isConfirmedSafe = !isDisconnected && !isEstop && !isFault && !isLowBattery;
  const isManualLocked = isAutoRunning || turningOffPending || !isConfirmedSafe;

  // Wheel drive locomotion lock: locked if general manual lock is active OR probe is not UP
  const isDriveLocked = isManualLocked || isProbeDeployed;

  // Settings
  const [maxSpeedSetting, setMaxSpeedSetting] = useState(100);
  const [speed, setSpeed] = useState(60);

  // Active direction driving
  const [activeDirection, setActiveDirection] = useState<'forward' | 'reverse' | 'left' | 'right' | null>(null);
  const driveIntervalRef = useRef<number | null>(null);

  // Nozzle state
  const [nozzlePan, setNozzlePan] = useState(0);
  const [nozzleTilt, setNozzleTilt] = useState(0);

  // Camera pose state
  const [camPose, setCamPose] = useState<'leaf' | 'stem'>('leaf');

  // Pump pulse state
  const HARD_MAX_PUMP_SECONDS = 5.0;
  const [waterPulseSec, setWaterPulseSec] = useState(2.0);
  const [treatPulseSec, setTreatPulseSec] = useState(1.5);
  const [waterCountdown, setWaterCountdown] = useState<number | null>(null);
  const [treatCountdown, setTreatCountdown] = useState<number | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastAckTimestampRef = useRef<number>(0);



  // 1. Fetch settings (max speed) on mount
  useEffect(() => {
    apiClient
      .getSettings()
      .then((s) => {
        if (s.max_speed) {
          const ms = Math.min(100, Math.max(20, parseInt(s.max_speed, 10)));
          setMaxSpeedSetting(ms);
          setSpeed((prev) => Math.min(prev, ms));
        }
      })
      .catch(() => {});
  }, []);

  // 2. Continuous 300 ms Heartbeat while the Manual page is open
  useEffect(() => {
    const hbTimer = window.setInterval(() => {
      send({ c: 'hb' });
    }, 300);
    return () => clearInterval(hbTimer);
  }, [send]);

  // 3. Drive logic: 5 Hz press-and-hold
  const stopDriving = useCallback(() => {
    if (driveIntervalRef.current !== null) {
      clearInterval(driveIntervalRef.current);
      driveIntervalRef.current = null;
    }
    setActiveDirection(null);
    send({ c: 'stop' });
  }, [send]);

  const startDriving = useCallback(
    (dir: 'forward' | 'reverse' | 'left' | 'right') => {
      // Reject if manual controls or drive lock are active (Auto running, safety pause, probe not up)
      if (isDriveLocked) {
        return;
      }

      if (driveIntervalRef.current !== null) {
        clearInterval(driveIntervalRef.current);
      }

      setActiveDirection(dir);

      let l = 0;
      let r = 0;
      if (dir === 'forward') {
        l = speed;
        r = speed;
      } else if (dir === 'reverse') {
        l = -speed;
        r = -speed;
      } else if (dir === 'left') {
        l = -speed;
        r = speed;
      } else if (dir === 'right') {
        l = speed;
        r = -speed;
      }

      // Send initial drive
      send({ c: 'drive', l, r });

      // Repeat at 5 Hz (every 200 ms) while held
      driveIntervalRef.current = window.setInterval(() => {
        send({ c: 'drive', l, r });
      }, 200);
    },
    [isDriveLocked, speed, send]
  );

  // Safety: Stop on window blur or tab hide
  useEffect(() => {
    const handleBlur = () => stopDriving();
    const handleVisibility = () => {
      if (document.hidden) stopDriving();
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBlur);
    window.addEventListener('pagehide', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopDriving();
    };
  }, [stopDriving]);

  // Keyboard controls: WASD & Arrow Keys
  useEffect(() => {
    const activeKeys = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isDriveLocked) return;
      // Do not capture if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      const code = e.code;
      activeKeys.add(code);

      if (code === 'KeyW' || code === 'ArrowUp') {
        e.preventDefault();
        startDriving('forward');
      } else if (code === 'KeyS' || code === 'ArrowDown') {
        e.preventDefault();
        startDriving('reverse');
      } else if (code === 'KeyA' || code === 'ArrowLeft') {
        e.preventDefault();
        startDriving('left');
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        e.preventDefault();
        startDriving('right');
      } else if (code === 'Space') {
        e.preventDefault();
        stopDriving();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      activeKeys.delete(code);

      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        stopDriving();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startDriving, stopDriving, isDriveLocked]);

  // 4. Handle incoming Acks & Refusals -> Toast Notifications
  useEffect(() => {
    if (!latestAck) return;
    const ackTime = latestAck.timestamp.getTime();
    if (ackTime <= lastAckTimestampRef.current) return;
    lastAckTimestampRef.current = ackTime;

    // Skip noisy hb
    if (latestAck.c === 'hb') return;

    if (!latestAck.ok) {
      setToasts((prev) => [
        {
          id: Math.random().toString(),
          type: 'error',
          title: `Command Refused (${latestAck.c})`,
          message: latestAck.reason || 'Rover refused command due to safety state.',
        },
        ...prev.slice(0, 4),
      ]);
    } else {
      setToasts((prev) => [
        {
          id: Math.random().toString(),
          type: 'success',
          title: `Command Acknowledged`,
          message: `Command '${latestAck.c}' accepted by rover.`,
        },
        ...prev.slice(0, 4),
      ]);
    }
  }, [latestAck]);

  // Auto-dismiss toasts after 4s
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(0, prev.length - 1));
    }, 4000);
    return () => clearTimeout(timer);
  }, [toasts]);

  // 5. Nozzle controls
  const handleNozzleChange = (newPan: number, newTilt: number) => {
    setNozzlePan(newPan);
    setNozzleTilt(newTilt);
    send({ c: 'nozzle', pan: newPan, tilt: newTilt });
  };

  const handleCenterNozzle = () => {
    setNozzlePan(0);
    setNozzleTilt(0);
    send({ c: 'nozzle', pan: 0, tilt: 0 });
  };

  // 6. Camera pose controls
  const handleCamPose = (pose: 'leaf' | 'stem') => {
    setCamPose(pose);
    send({ c: 'camtilt', pose });
  };

  // 7. Water & Treatment Pump Countdown Timers
  const handleRunPump = (id: 'water' | 'treat', rawSec: number) => {
    const clampedSec = Math.max(0.5, Math.min(HARD_MAX_PUMP_SECONDS, rawSec));
    const durationMs = Math.round(clampedSec * 1000);

    send({ c: 'pump', id, ms: durationMs });

    if (id === 'water') {
      setWaterCountdown(clampedSec);
      const start = Date.now();
      const interval = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const remain = Math.max(0, clampedSec - elapsed);
        setWaterCountdown(+remain.toFixed(1));
        if (remain <= 0) {
          clearInterval(interval);
          setWaterCountdown(null);
        }
      }, 100);
    } else {
      setTreatCountdown(clampedSec);
      const start = Date.now();
      const interval = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const remain = Math.max(0, clampedSec - elapsed);
        setTreatCountdown(+remain.toFixed(1));
        if (remain <= 0) {
          clearInterval(interval);
          setTreatCountdown(null);
        }
      }, 100);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Toast Notification Container */}
      <div className="fixed top-24 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              type={t.type}
              title={t.title}
              message={t.message}
              onClose={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Manual Rover Teleoperation
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Real-time direct control of drive motors, servo gimbal, soil probe, and pump relays.
          </p>
        </div>

        {!isAutoRunning && mode !== 'manual' && (
          <Button variant="secondary" onClick={() => setMode('manual')} icon={<Zap className="w-4 h-4" />}>
            Activate Manual Mode
          </Button>
        )}
      </div>

      {/* 1. Auto Mode Running Banner with Pause Button */}
      {isAutoRunning && (
        <Card variant="outline" className="border-water bg-water/10 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Activity className="w-6 h-6 text-water flex-shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h3 className="text-base font-bold text-text-main flex items-center gap-2">
                  Autonomous Mission Running (Auto ON)
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-water/20 text-water font-black">
                    LOCKED
                  </span>
                </h3>
                <p className="text-sm text-text-muted mt-0.5">
                  Manual teleoperation, drive pad, and pump triggers are disabled while autonomous navigation is active. Live camera stream and environmental telemetry remain active.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="secondary"
                size="md"
                onClick={() => pauseAuto()}
                icon={<Pause className="w-4 h-4" />}
              >
                Pause Auto
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 2. Disengaging Auto Pending Banner */}
      {turningOffPending && (
        <Card variant="outline" className="border-warning bg-warning/10 p-5">
          <div className="flex items-start gap-3">
            <RotateCcw className="w-6 h-6 text-warning flex-shrink-0 mt-0.5 animate-spin" />
            <div>
              <h3 className="text-base font-bold text-text-main">
                Disengaging Auto Mode...
              </h3>
              <p className="text-sm text-text-muted mt-0.5">
                Sent stop, raising probe, and pausing runner (preserving current plant). Manual controls will unlock once the ESP32 confirms manual mode and probe is UP.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Safety Lock Banner (Fault, E-stop, Low Battery, Bluetooth drop) */}
      {!isAutoRunning && !turningOffPending && (isDisconnected || isEstop || isFault || isLowBattery) && (
        <Card variant="outline" className="border-danger bg-danger/10 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-6 h-6 text-danger flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-danger">
                  Manual Controls Locked: Safety Condition Active
                </h3>
                <p className="text-sm text-text-muted mt-0.5">
                  {isDisconnected
                    ? 'Bluetooth link disconnected. Reconnect via top bar to regain manual teleoperation.'
                    : isEstop
                    ? 'Emergency Stop is active. Disengage hardware switch and reset E-stop to resume control.'
                    : isFault
                    ? 'Hardware fault active on rover. Resolve fault before resuming manual operation.'
                    : isLowBattery
                    ? `Battery (${telemetry?.bat?.pct}%) is below safe cutoff threshold (20%). Recharge rover.`
                    : 'Safety interlock engaged.'}
                </p>
              </div>
            </div>
            {isEstop && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => send({ c: 'estop_reset' })}
                icon={<RotateCcw className="w-4 h-4" />}
              >
                Reset E-Stop
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* MAIN CONTROL PANELS GRID */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isManualLocked ? 'opacity-85' : ''}`}>
        {/* PANEL 1: DRIVE PAD WITH PRESS-AND-HOLD */}
        <Card title="Drive Control & Throttle" variant="default" className="p-6 flex flex-col items-center">
          {/* Probe Interlock Warning */}
          {!isDisconnected && isProbeDeployed && (
            <div className="w-full mb-4 p-3.5 rounded-xl border-2 border-danger bg-danger/15 text-danger text-xs font-bold flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-pulse" />
              <span>
                Drive Disabled: Soil probe is {telemetry?.probe?.toUpperCase() || 'DEPLOYED'}. Retract probe UP to enable driving.
              </span>
            </div>
          )}

          {/* Speed Slider */}
          <div className="w-full max-w-sm mb-6 bg-app p-4 rounded-xl border-2 border-border">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase text-text-muted">Drive Speed Throttle</span>
              <span className="text-sm font-black text-primary">{speed}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={maxSpeedSetting}
              step={5}
              value={speed}
              disabled={isManualLocked}
              onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
              className="w-full accent-primary cursor-pointer h-2 bg-border rounded-lg disabled:opacity-40"
            />
            <div className="flex justify-between text-[10px] text-text-muted font-bold mt-1">
              <span>Min 10%</span>
              <span>Max Setting {maxSpeedSetting}%</span>
            </div>
          </div>

          {/* Directional Pad */}
          <div className="grid grid-cols-3 gap-3 w-72 max-w-full my-2 select-none touch-none">
            <div />
            <Button
              variant={activeDirection === 'forward' ? 'primary' : 'secondary'}
              size="lg"
              className="min-h-[72px]"
              disabled={isDriveLocked}
              onPointerDown={() => startDriving('forward')}
              onPointerUp={stopDriving}
              onPointerLeave={stopDriving}
              onPointerCancel={stopDriving}
              icon={<ArrowUp className="w-7 h-7" />}
              aria-label="Drive Forward (W)"
            />
            <div />

            <Button
              variant={activeDirection === 'left' ? 'primary' : 'secondary'}
              size="lg"
              className="min-h-[72px]"
              disabled={isDriveLocked}
              onPointerDown={() => startDriving('left')}
              onPointerUp={stopDriving}
              onPointerLeave={stopDriving}
              onPointerCancel={stopDriving}
              icon={<ArrowLeft className="w-7 h-7" />}
              aria-label="Turn Left (A)"
            />
            <Button
              variant="danger"
              size="lg"
              className="min-h-[72px] font-black"
              onClick={stopDriving}
              icon={<Square className="w-6 h-6" />}
              aria-label="Stop Motors (Space)"
            >
              STOP
            </Button>
            <Button
              variant={activeDirection === 'right' ? 'primary' : 'secondary'}
              size="lg"
              className="min-h-[72px]"
              disabled={isDriveLocked}
              onPointerDown={() => startDriving('right')}
              onPointerUp={stopDriving}
              onPointerLeave={stopDriving}
              onPointerCancel={stopDriving}
              icon={<ArrowRight className="w-7 h-7" />}
              aria-label="Turn Right (D)"
            />

            <div />
            <Button
              variant={activeDirection === 'reverse' ? 'primary' : 'secondary'}
              size="lg"
              className="min-h-[72px]"
              disabled={isDriveLocked}
              onPointerDown={() => startDriving('reverse')}
              onPointerUp={stopDriving}
              onPointerLeave={stopDriving}
              onPointerCancel={stopDriving}
              icon={<ArrowDown className="w-7 h-7" />}
              aria-label="Drive Reverse (S)"
            />
            <div />
          </div>

          <p className="text-xs text-text-muted text-center mt-4">
            Press and hold buttons or use <strong>WASD / Arrow Keys</strong>. Released keys send instant stop.
          </p>
        </Card>

        {/* PANEL 2: SOIL MOISTURE PROBE ACTUATOR */}
        <Card title="Soil Moisture Probe Linear Actuator" variant="default" className="p-6 space-y-5">
          <div className="flex items-center justify-between p-4 rounded-xl bg-app border-2 border-border">
            <div className="flex items-center gap-3">
              <Layers className="w-6 h-6 text-primary" />
              <div>
                <span className="text-xs font-bold uppercase text-text-muted block">Probe Limit State</span>
                <span className="text-lg font-black text-text-main uppercase">
                  {telemetry?.probe || 'UP'}
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs font-bold uppercase text-text-muted block">Moisture Reading</span>
              <span className="text-lg font-black text-water">
                {probeMoistureResult !== null
                  ? `${probeMoistureResult} ADC`
                  : telemetry?.soil !== undefined
                  ? `${telemetry.soil} ADC`
                  : '--'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="secondary"
              disabled={isManualLocked}
              onClick={() => send({ c: 'probe', a: 'down' })}
              className="w-full"
            >
              Probe Down
            </Button>
            <Button
              variant="secondary"
              disabled={isManualLocked}
              onClick={() => send({ c: 'probe', a: 'up' })}
              className="w-full"
            >
              Probe Up
            </Button>
            <Button
              variant="primary"
              disabled={isManualLocked}
              onClick={() => send({ c: 'probe', a: 'read' })}
              className="w-full"
            >
              Auto Probe Read
            </Button>
          </div>

          <p className="text-xs text-text-muted">
            Auto read lowers the probe to the bottom limit switch, pauses for sensor settling, reads ADC, and returns to UP position.
          </p>
        </Card>

        {/* PANEL 3: NOZZLE PAN & TILT WITH CENTRE BUTTON */}
        <Card title="Nozzle Gimbal Pan & Tilt" variant="default" className="p-6 space-y-5">
          <div className="space-y-4">
            {/* Pan Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold uppercase text-text-muted">Pan Angle (Horizontal)</span>
                <span className="text-sm font-mono font-bold text-text-main">{nozzlePan}°</span>
              </div>
              <input
                type="range"
                min={-45}
                max={45}
                value={nozzlePan}
                disabled={isManualLocked}
                onChange={(e) => handleNozzleChange(parseInt(e.target.value, 10), nozzleTilt)}
                className="w-full accent-primary cursor-pointer h-2 bg-border rounded-lg disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-text-muted font-bold mt-1">
                <span>Left -45°</span>
                <span>Center 0°</span>
                <span>Right +45°</span>
              </div>
            </div>

            {/* Tilt Slider */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold uppercase text-text-muted">Tilt Angle (Vertical)</span>
                <span className="text-sm font-mono font-bold text-text-main">{nozzleTilt}°</span>
              </div>
              <input
                type="range"
                min={-30}
                max={45}
                value={nozzleTilt}
                disabled={isManualLocked}
                onChange={(e) => handleNozzleChange(nozzlePan, parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer h-2 bg-border rounded-lg disabled:opacity-40"
              />
              <div className="flex justify-between text-[10px] text-text-muted font-bold mt-1">
                <span>Down -30°</span>
                <span>Level 0°</span>
                <span>Up +45°</span>
              </div>
            </div>
          </div>

          <Button
            variant="secondary"
            disabled={isManualLocked}
            onClick={handleCenterNozzle}
            icon={<Crosshair className="w-4 h-4" />}
            className="w-full"
          >
            Centre Nozzle (0°, 0°)
          </Button>
        </Card>

        {/* PANEL 4: CAMERA POSE & PUMP TIMED PULSE */}
        <Card title="Camera Pose & Timed Pump Relays" variant="default" className="p-6 space-y-6">
          {/* Camera Pose */}
          <div>
            <h4 className="text-xs font-bold uppercase text-text-muted mb-2">Camera Pose Servo</h4>
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={camPose === 'leaf' ? 'primary' : 'secondary'}
                disabled={isManualLocked}
                onClick={() => handleCamPose('leaf')}
                icon={<Camera className="w-4 h-4" />}
              >
                Pose: Leaf (Upper)
              </Button>
              <Button
                variant={camPose === 'stem' ? 'primary' : 'secondary'}
                disabled={isManualLocked}
                onClick={() => handleCamPose('stem')}
                icon={<Camera className="w-4 h-4" />}
              >
                Pose: Stem (Lower)
              </Button>
            </div>
          </div>

          {/* Timed Pump Actuation */}
          <div className="pt-4 border-t-2 border-border space-y-4">
            <h4 className="text-xs font-bold uppercase text-text-muted">Precision Pump Dispensing</h4>

            {/* Water Pump */}
            <div className="p-3.5 rounded-xl border-2 border-border bg-app space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-main flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-water" /> Water Pump (Tank 1)
                </span>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span>Pulse Time:</span>
                  <input
                    type="number"
                    min={0.5}
                    max={HARD_MAX_PUMP_SECONDS}
                    step={0.5}
                    value={waterPulseSec}
                    disabled={isManualLocked}
                    onChange={(e) => setWaterPulseSec(parseFloat(e.target.value) || 1.0)}
                    className="w-16 px-2 py-1 rounded border border-border bg-surface text-center font-mono disabled:opacity-40"
                  />
                  <span>sec</span>
                </div>
              </div>

              <Button
                variant="secondary"
                disabled={isManualLocked || waterCountdown !== null}
                onClick={() => handleRunPump('water', waterPulseSec)}
                className="w-full text-xs"
              >
                {waterCountdown !== null
                  ? `Dispensing Water... (${waterCountdown}s left)`
                  : `Dispense Water (${waterPulseSec}s / max 5s)`}
              </Button>
            </div>

            {/* Treatment Pump */}
            <div className="p-3.5 rounded-xl border-2 border-border bg-app space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text-main flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4 text-treated" /> Treatment Pump (Tank 2)
                </span>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span>Pulse Time:</span>
                  <input
                    type="number"
                    min={0.5}
                    max={HARD_MAX_PUMP_SECONDS}
                    step={0.5}
                    value={treatPulseSec}
                    disabled={isManualLocked}
                    onChange={(e) => setTreatPulseSec(parseFloat(e.target.value) || 1.0)}
                    className="w-16 px-2 py-1 rounded border border-border bg-surface text-center font-mono disabled:opacity-40"
                  />
                  <span>sec</span>
                </div>
              </div>

              <Button
                variant="secondary"
                disabled={isManualLocked || treatCountdown !== null}
                onClick={() => handleRunPump('treat', treatPulseSec)}
                className="w-full text-xs"
              >
                {treatCountdown !== null
                  ? `Dispensing Treatment... (${treatCountdown}s left)`
                  : `Dispense Treatment (${treatPulseSec}s / max 5s)`}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
