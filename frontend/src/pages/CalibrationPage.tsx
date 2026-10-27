import React, { useEffect, useState } from 'react';
import {
  Gauge,
  Check,
  Save,
  Play,
  RotateCcw,
  Sparkles,
  Droplets,
  Battery,
  Navigation,
  Compass,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toast, type ToastType } from '../components/ui/Toast';
import { apiClient } from '../services/api/client';
import type { CalibrationItem } from '../services/api/types';

export const CalibrationPage: React.FC = () => {
  const { telemetry, send } = useRoverStore();

  const [activeTab, setActiveTab] = useState<
    'soil' | 'encoder' | 'pump' | 'battery' | 'servos' | 'imu'
  >('soil');

  const [toast, setToast] = useState<{ type: ToastType; title: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // 1. Soil Sensor State
  const [soilDryRaw, setSoilDryRaw] = useState<number>(3200);
  const [soilWetRaw, setSoilWetRaw] = useState<number>(1400);

  // 2. Encoder State
  const [encoderStartTicks, setEncoderStartTicks] = useState<number>(0);
  const [encoderEndTicks, setEncoderEndTicks] = useState<number>(330);
  const [encoderMmPerPulse, setEncoderMmPerPulse] = useState<number>(3.03);

  // 3. Pump Flow State
  const [selectedPump, setSelectedPump] = useState<'water' | 'treat'>('water');
  const [pumpRunning, setPumpRunning] = useState(false);
  const [pumpVolumeCollectedMl, setPumpVolumeCollectedMl] = useState<number>(250);
  const [waterFlowRate, setWaterFlowRate] = useState<number>(25.0);
  const [treatFlowRate, setTreatFlowRate] = useState<number>(20.0);

  // 4. Battery Calibration State
  const [multimeterVoltage, setMultimeterVoltage] = useState<number>(12.4);

  // 5. Servo Limits & Nozzle Angles State
  const [leafPan, setLeafPan] = useState<number>(90);
  const [leafTilt, setLeafTilt] = useState<number>(30);
  const [stemPan, setStemPan] = useState<number>(90);
  const [stemTilt, setStemTilt] = useState<number>(0);

  // 6. IMU Zero State
  const [imuOffset, setImuOffset] = useState<number>(0);

  // Load existing calibration from backend
  useEffect(() => {
    apiClient
      .getCalibrations()
      .then((items) => {
        if (!items) return;
        items.forEach((item) => {
          if (item.name === 'soil_moisture') {
            if (item.param1) setSoilDryRaw(item.param1);
            if (item.param2) setSoilWetRaw(item.param2);
          } else if (item.name === 'water_pump') {
            if (item.param1) setWaterFlowRate(item.param1);
          } else if (item.name === 'treat_pump') {
            if (item.param1) setTreatFlowRate(item.param1);
          } else if (item.name === 'encoder') {
            if (item.param1) setEncoderMmPerPulse(item.param1);
          }
        });
      })
      .catch(() => {});
  }, []);

  const showSuccess = (title: string, message: string) => {
    setToast({ type: 'success', title, message });
  };

  // Helper to save calibration to both Backend and ESP32 cfg
  const saveCalibration = async (
    calItem: CalibrationItem,
    cfgKey?: string,
    cfgVal?: number | string
  ) => {
    setSaving(true);
    try {
      // 1. Update backend DB
      await apiClient.updateCalibration(calItem);

      // 2. Send BLE cfg command if key provided
      if (cfgKey && cfgVal !== undefined) {
        await send({ c: 'cfg', k: cfgKey, v: cfgVal });
      }

      showSuccess('Calibration Saved', `Updated ${calItem.name} profile in database and rover firmware.`);
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Error communicating with rover or backend.',
      });
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers ---
  const handleSaveSoil = () => {
    saveCalibration(
      {
        name: 'soil_moisture',
        param1: soilDryRaw,
        param2: soilWetRaw,
        unit: 'ADC',
        notes: `dry_raw=${soilDryRaw}, wet_raw=${soilWetRaw}`,
      },
      'soil_cal',
      `${soilDryRaw},${soilWetRaw}`
    );
  };

  const handleSaveEncoder = () => {
    saveCalibration(
      {
        name: 'encoder',
        param1: encoderMmPerPulse,
        param2: 0,
        unit: 'mm/pulse',
        notes: 'Linear odometry scaling',
      },
      'enc_scale',
      encoderMmPerPulse
    );
  };

  const handleTestPump10s = async () => {
    setPumpRunning(true);
    try {
      await send({ c: 'pump', id: selectedPump, ms: 10000 });
      setTimeout(() => {
        setPumpRunning(false);
      }, 10000);
    } catch {
      setPumpRunning(false);
    }
  };

  const handleSavePumpFlow = () => {
    const rate = parseFloat((pumpVolumeCollectedMl / 10).toFixed(2));
    if (selectedPump === 'water') {
      setWaterFlowRate(rate);
      saveCalibration(
        {
          name: 'water_pump',
          param1: rate,
          param2: 0,
          unit: 'ml/s',
          notes: 'Tank 1 irrigation pump flow rate',
        },
        'flow_water',
        rate
      );
    } else {
      setTreatFlowRate(rate);
      saveCalibration(
        {
          name: 'treat_pump',
          param1: rate,
          param2: 0,
          unit: 'ml/s',
          notes: 'Tank 2 treatment chemical pump flow rate',
        },
        'flow_treat',
        rate
      );
    }
  };

  const handleSaveBattery = () => {
    const liveV = telemetry?.bat?.v || 12.0;
    const factor = parseFloat((multimeterVoltage / liveV).toFixed(3));
    saveCalibration(
      {
        name: 'battery',
        param1: factor,
        param2: multimeterVoltage,
        unit: 'ratio',
        notes: `Multimeter=${multimeterVoltage}V, Live=${liveV}V`,
      },
      'bat_scale',
      factor
    );
  };

  const handleAimNozzle = async (pan: number, tilt: number) => {
    await send({ c: 'nozzle', pan, tilt });
  };

  const handleSaveServos = () => {
    saveCalibration(
      {
        name: 'nozzle_servos',
        param1: leafTilt,
        param2: stemTilt,
        unit: 'degrees',
        notes: `leaf_pan=${leafPan}, leaf_tilt=${leafTilt}, stem_pan=${stemPan}, stem_tilt=${stemTilt}`,
      },
      'nozzle_cfg',
      `${leafPan},${leafTilt},${stemPan},${stemTilt}`
    );
  };

  const handleTareImu = () => {
    const liveTilt = telemetry?.tilt || 0;
    setImuOffset(liveTilt);
    saveCalibration(
      {
        name: 'imu_zero',
        param1: liveTilt,
        param2: 0,
        unit: 'degrees',
        notes: `Level horizon offset tare angle: ${liveTilt}°`,
      },
      'imu_tare',
      liveTilt
    );
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm">
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Sensor & Actuator Calibration
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Step-by-step interactive wizards with live ESP32 telemetry, saved with <code>cfg</code> to firmware and SQLite.
          </p>
        </div>
      </div>

      {/* Wizard Category Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-surface border-2 border-border">
        <button
          onClick={() => setActiveTab('soil')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'soil'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Droplets className="w-4 h-4" />
          <span>Soil Sensor</span>
        </button>

        <button
          onClick={() => setActiveTab('encoder')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'encoder'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Navigation className="w-4 h-4" />
          <span>Odometry Encoder</span>
        </button>

        <button
          onClick={() => setActiveTab('pump')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'pump'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Pump Flow Rate</span>
        </button>

        <button
          onClick={() => setActiveTab('battery')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'battery'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Battery className="w-4 h-4" />
          <span>Battery Voltage</span>
        </button>

        <button
          onClick={() => setActiveTab('servos')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'servos'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>Servo Limits & Nozzle</span>
        </button>

        <button
          onClick={() => setActiveTab('imu')}
          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl font-bold text-xs transition-colors ${
            activeTab === 'imu'
              ? 'bg-primary text-surface'
              : 'text-text-muted hover:text-text-main hover:bg-app'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>IMU Horizon Zero</span>
        </button>
      </div>

      {/* 1. SOIL SENSOR WIZARD */}
      {activeTab === 'soil' && (
        <Card title="Soil Moisture Capacitive Probe Wizard" variant="default" className="p-6 space-y-6">
          {/* Live Telemetry Card */}
          <div className="p-4 rounded-xl border-2 border-border bg-app flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Live ESP32 Probe ADC Reading</span>
              <div className="text-2xl font-black text-text-main tabular-nums mt-0.5">
                {telemetry?.soil ?? 2100} <span className="text-xs font-bold text-text-muted">ADC counts</span>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => send({ c: 'probe', a: 'read' })}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Trigger Probe Insertion Read
            </Button>
          </div>

          {/* 2 Step Calibration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Step 1: Dry in Air */}
            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-3">
              <div className="flex items-center gap-2 font-black text-sm text-text-main">
                <span className="w-6 h-6 rounded-full bg-app border border-border flex items-center justify-center text-xs">1</span>
                Dry in Air (0% Moisture)
              </div>
              <p className="text-xs text-text-muted">
                Keep the capacitive blade dry and in ambient air. Wait for the signal to stabilize (typically ~3000-3400).
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={soilDryRaw}
                  onChange={(e) => setSoilDryRaw(parseInt(e.target.value, 10) || 0)}
                  className="w-32 px-3 py-2 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm font-bold"
                />
                <Button
                  variant="secondary"
                  onClick={() => setSoilDryRaw(telemetry?.soil ?? 3200)}
                >
                  Capture Live ({telemetry?.soil ?? 3200})
                </Button>
              </div>
            </div>

            {/* Step 2: Wet in Water */}
            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-3">
              <div className="flex items-center gap-2 font-black text-sm text-text-main">
                <span className="w-6 h-6 rounded-full bg-app border border-border flex items-center justify-center text-xs">2</span>
                Submerged in Water (100% Saturation)
              </div>
              <p className="text-xs text-text-muted">
                Dip the capacitive blade into a glass of clean water up to the white guideline (typically ~1300-1600).
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={soilWetRaw}
                  onChange={(e) => setSoilWetRaw(parseInt(e.target.value, 10) || 0)}
                  className="w-32 px-3 py-2 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm font-bold"
                />
                <Button
                  variant="secondary"
                  onClick={() => setSoilWetRaw(telemetry?.soil ?? 1400)}
                >
                  Capture Live ({telemetry?.soil ?? 1400})
                </Button>
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              onClick={handleSaveSoil}
              disabled={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Soil Calibration (cfg soil_cal)
            </Button>
          </div>
        </Card>
      )}

      {/* 2. ENCODER WIZARD */}
      {activeTab === 'encoder' && (
        <Card title="Wheel Encoder Odometry Wizard (1 Meter Calibration)" variant="default" className="p-6 space-y-6">
          <div className="p-4 rounded-xl border-2 border-border bg-app flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Live Optical Encoders (Left / Right)</span>
              <div className="text-2xl font-black text-text-main tabular-nums mt-0.5">
                {telemetry?.enc ? `${telemetry.enc.l} L / ${telemetry.enc.r} R` : '0 L / 0 R'} <span className="text-xs font-bold text-text-muted">ticks</span>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const currentL = telemetry?.enc?.l || 0;
                setEncoderStartTicks(currentL);
              }}
              icon={<RotateCcw className="w-4 h-4" />}
            >
              Set Start Mark (Zero Baseline)
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-2xl border-2 border-border bg-surface space-y-2">
              <span className="text-xs font-black uppercase text-text-muted">Step 1: Start Ticks</span>
              <div className="text-xl font-black text-text-main tabular-nums">{encoderStartTicks}</div>
              <p className="text-xs text-text-muted">Baseline pulse count recorded at the start mark.</p>
            </div>

            <div className="p-4 rounded-2xl border-2 border-border bg-surface space-y-2">
              <span className="text-xs font-black uppercase text-text-muted">Step 2: Drive 1000 mm</span>
              <div className="pt-1">
                <Button
                  variant="secondary"
                  onClick={() => {
                    send({ c: 'move', mm: 1000 });
                  }}
                  icon={<Play className="w-4 h-4" />}
                >
                  Send 1000 mm Forward Move
                </Button>
              </div>
              <p className="text-xs text-text-muted">Rover transits 1 meter along tape on floor.</p>
            </div>

            <div className="p-4 rounded-2xl border-2 border-border bg-surface space-y-2">
              <span className="text-xs font-black uppercase text-text-muted">Step 3: End Pulse Count</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={encoderEndTicks}
                  onChange={(e) => {
                    const end = parseInt(e.target.value, 10) || 0;
                    setEncoderEndTicks(end);
                    const delta = Math.abs(end - encoderStartTicks) || 1;
                    setEncoderMmPerPulse(parseFloat((1000 / delta).toFixed(3)));
                  }}
                  className="w-28 px-3 py-1.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm font-bold"
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    const end = telemetry?.enc?.l || 330;
                    setEncoderEndTicks(end);
                    const delta = Math.abs(end - encoderStartTicks) || 1;
                    setEncoderMmPerPulse(parseFloat((1000 / delta).toFixed(3)));
                  }}
                >
                  Capture
                </Button>
              </div>
              <div className="text-xs font-bold text-primary pt-1">
                Scale: {encoderMmPerPulse} mm / pulse
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              onClick={handleSaveEncoder}
              disabled={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Encoder Scaling (cfg enc_scale)
            </Button>
          </div>
        </Card>
      )}

      {/* 3. PUMP FLOW WIZARD */}
      {activeTab === 'pump' && (
        <Card title="Pump Flow Rate Calibration (10-Second Timed Cup Test)" variant="default" className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedPump('water')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                  selectedPump === 'water'
                    ? 'border-water bg-water/10 text-water'
                    : 'border-border bg-app text-text-muted'
                }`}
              >
                Tank 1: Water Pump ({waterFlowRate} ml/s)
              </button>
              <button
                onClick={() => setSelectedPump('treat')}
                className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                  selectedPump === 'treat'
                    ? 'border-treated bg-treated/10 text-treated'
                    : 'border-border bg-app text-text-muted'
                }`}
              >
                Tank 2: Treatment Pump ({treatFlowRate} ml/s)
              </button>
            </div>
            <span className="text-xs text-text-muted font-bold">
              Active: {selectedPump === 'water' ? `${waterFlowRate} ml/s` : `${treatFlowRate} ml/s`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-3">
              <div className="font-bold text-sm text-text-main flex items-center gap-2">
                <span>Step 1: Timed 10-Second Spray</span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Direct pump discharge nozzle into a graduated measuring cup. Click start to activate the pump for exactly 10,000 ms.
              </p>
              <Button
                variant={selectedPump === 'water' ? 'primary' : 'secondary'}
                onClick={handleTestPump10s}
                disabled={pumpRunning}
                icon={<Play className={`w-4 h-4 ${pumpRunning ? 'animate-spin' : ''}`} />}
              >
                {pumpRunning ? 'Dispensing (10s)...' : `Run 10s ${selectedPump.toUpperCase()} Test`}
              </Button>
            </div>

            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-3">
              <div className="font-bold text-sm text-text-main flex items-center gap-2">
                <span>Step 2: Enter Gathered Liquid Volume</span>
              </div>
              <p className="text-xs text-text-muted">
                Read the meniscus level from the cup and enter the milliliters gathered:
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="5"
                  value={pumpVolumeCollectedMl}
                  onChange={(e) => setPumpVolumeCollectedMl(parseFloat(e.target.value) || 0)}
                  className="w-32 px-3 py-2 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm font-bold"
                />
                <span className="text-sm font-bold text-text-main">ml in 10 sec</span>
              </div>
              <div className="text-xs font-black text-primary">
                Calculated Flow Rate: {(pumpVolumeCollectedMl / 10).toFixed(2)} ml/s
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              onClick={handleSavePumpFlow}
              disabled={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Flow Rate (cfg flow_{selectedPump})
            </Button>
          </div>
        </Card>
      )}

      {/* 4. BATTERY VOLTAGE WIZARD */}
      {activeTab === 'battery' && (
        <Card title="LiFePO4 Battery Monitor ADC Calibration" variant="default" className="p-6 space-y-6">
          <div className="p-4 rounded-xl border-2 border-border bg-app flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Live Uncalibrated ESP32 Voltage</span>
              <div className="text-2xl font-black text-text-main tabular-nums mt-0.5">
                {telemetry?.bat?.v?.toFixed(2) ?? '12.10'} <span className="text-xs font-bold text-text-muted">Volts DC</span>
              </div>
            </div>
            <span className="text-xs font-semibold text-text-muted">
              Voltage Divider: 100k / 22k into ADC GPIO34
            </span>
          </div>

          <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-4 max-w-lg">
            <div className="font-bold text-sm text-text-main">
              Multimeter Reference Measurement
            </div>
            <p className="text-xs text-text-muted">
              Measure battery terminals directly with a calibrated digital multimeter and enter the measured voltage:
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                step="0.01"
                value={multimeterVoltage}
                onChange={(e) => setMultimeterVoltage(parseFloat(e.target.value) || 0)}
                className="w-36 px-3 py-2 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm font-bold"
              />
              <span className="text-sm font-bold text-text-main">Volts (DMM)</span>
            </div>

            <div className="text-xs text-text-muted font-medium">
              Scale Calibration Ratio: <strong>{(multimeterVoltage / (telemetry?.bat?.v || 12.0)).toFixed(3)}</strong>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Button
              variant="primary"
              onClick={handleSaveBattery}
              disabled={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Battery Calibration (cfg bat_scale)
            </Button>
          </div>
        </Card>
      )}

      {/* 5. SERVO LIMITS & NOZZLE ANGLES */}
      {activeTab === 'servos' && (
        <Card title="Servo Limits & Targeted Nozzle Angles" variant="default" className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Leaf Target Preset */}
            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-text-main">Leaf Target Position (Foliar Canopy)</span>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => handleAimNozzle(leafPan, leafTilt)}
                >
                  Test Aim
                </Button>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>Pan Angle: {leafPan}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={leafPan}
                  onChange={(e) => setLeafPan(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-2 bg-app rounded-lg"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>Tilt Angle: {leafTilt}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={leafTilt}
                  onChange={(e) => setLeafTilt(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-2 bg-app rounded-lg"
                />
              </div>
            </div>

            {/* Stem Target Preset */}
            <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-sm text-text-main">Stem Target Position (Lower Base)</span>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => handleAimNozzle(stemPan, stemTilt)}
                >
                  Test Aim
                </Button>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>Pan Angle: {stemPan}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="180"
                  value={stemPan}
                  onChange={(e) => setStemPan(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-2 bg-app rounded-lg"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span>Tilt Angle: {stemTilt}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={stemTilt}
                  onChange={(e) => setStemTilt(parseInt(e.target.value, 10))}
                  className="w-full accent-primary h-2 bg-app rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => handleAimNozzle(90, 45)}
            >
              Centre Nozzle (90°, 45°)
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveServos}
              disabled={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Nozzle Targets (cfg nozzle_cfg)
            </Button>
          </div>
        </Card>
      )}

      {/* 6. IMU ZERO WIZARD */}
      {activeTab === 'imu' && (
        <Card title="MPU6050 IMU Horizon Level Zero" variant="default" className="p-6 space-y-6">
          <div className="p-4 rounded-xl border-2 border-border bg-app flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Live MPU6050 Pitch/Roll Tilt</span>
              <div className="text-2xl font-black text-text-main tabular-nums mt-0.5">
                {(telemetry?.tilt ?? 1.2).toFixed(1)}° <span className="text-xs font-bold text-text-muted">chassis inclination</span>
              </div>
            </div>
            <span className="text-xs font-bold text-text-muted">
              Stored Tare Offset: {imuOffset.toFixed(1)}°
            </span>
          </div>

          <div className="p-5 rounded-2xl border-2 border-border bg-surface space-y-3 max-w-lg">
            <div className="font-bold text-sm text-text-main">
              Level Surface Alignment
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Place the rover on a flat, bubble-leveled concrete aisle or calibration board. Once completely stationary, click the zero button to set this position as 0.0° level ground.
            </p>
            <Button
              variant="primary"
              onClick={handleTareImu}
              disabled={saving}
              icon={<Check className="w-4 h-4" />}
            >
              Tare Horizon Zero Offset (cfg imu_tare)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};
