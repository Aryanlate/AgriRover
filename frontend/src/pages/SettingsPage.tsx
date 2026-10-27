import React, { useEffect, useState } from 'react';
import {
  Save,
  Check,
  Server,
  Camera,
  Radio,
  Droplets,
  ShieldAlert,
  Gauge,
  Sun,
  Moon,
  Laptop,
  Thermometer,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { useTheme } from '../context/ThemeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Toast, type ToastType } from '../components/ui/Toast';
import { apiClient } from '../services/api/client';

export const SettingsPage: React.FC = () => {
  const { transportType, setTransportType, send } = useRoverStore();
  const { theme, setTheme } = useTheme();

  // Core settings state
  const [settings, setSettings] = useState<Record<string, string>>({
    camera_ip: '192.168.4.1',
    backend_url: 'http://localhost:8000',
    moisture_threshold: '35.0',
    high_confidence: '0.85',
    low_confidence: '0.60',
    default_water_dose_ml: '50.0',
    default_treat_dose_ml: '25.0',
    per_plant_water_cap_ml: '150.0',
    per_plant_treat_cap_ml: '60.0',
    per_run_water_cap_ml: '2500.0',
    per_run_treat_cap_ml: '1000.0',
    max_speed_pct: '80',
    obstacle_distance_cm: '15',
    // Greenhouse Comfort Ranges: "leave them empty until I set them"
    comfort_temp_min: '',
    comfort_temp_max: '',
    comfort_hum_min: '',
    comfort_hum_max: '',
  });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; title: string; message: string } | null>(null);

  // Load saved settings from backend and localStorage on mount
  useEffect(() => {
    // 1. Backend settings
    apiClient
      .getSettings()
      .then((data) => {
        if (data) {
          setSettings((prev) => ({
            ...prev,
            ...data,
          }));
        }
      })
      .catch(() => {});

    // 2. Local storage overrides (for comfort ranges and custom backend URL)
    try {
      const storedRanges = localStorage.getItem('agrirover_comfort_ranges');
      if (storedRanges) {
        const parsed = JSON.parse(storedRanges);
        setSettings((prev) => ({
          ...prev,
          comfort_temp_min: parsed.comfort_temp_min ?? '',
          comfort_temp_max: parsed.comfort_temp_max ?? '',
          comfort_hum_min: parsed.comfort_hum_min ?? '',
          comfort_hum_max: parsed.comfort_hum_max ?? '',
        }));
      }

      const storedBackendUrl = localStorage.getItem('agrirover_backend_url');
      if (storedBackendUrl) {
        setSettings((prev) => ({ ...prev, backend_url: storedBackendUrl }));
      }

      const storedMaxSpeed = localStorage.getItem('agrirover_max_speed');
      if (storedMaxSpeed) {
        setSettings((prev) => ({ ...prev, max_speed_pct: storedMaxSpeed }));
      }

      const storedObstacle = localStorage.getItem('agrirover_obstacle_dist');
      if (storedObstacle) {
        setSettings((prev) => ({ ...prev, obstacle_distance_cm: storedObstacle }));
      }
    } catch {
      // ignore localStorage parse error
    }
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Save to Backend API
      await apiClient.updateSettings(settings);

      // 2. Persist frontend-specific items to localStorage
      try {
        localStorage.setItem(
          'agrirover_comfort_ranges',
          JSON.stringify({
            comfort_temp_min: settings.comfort_temp_min,
            comfort_temp_max: settings.comfort_temp_max,
            comfort_hum_min: settings.comfort_hum_min,
            comfort_hum_max: settings.comfort_hum_max,
          })
        );
        localStorage.setItem('agrirover_backend_url', settings.backend_url);
        localStorage.setItem('agrirover_max_speed', settings.max_speed_pct);
        localStorage.setItem('agrirover_obstacle_dist', settings.obstacle_distance_cm);
      } catch {
        // ignore
      }

      // 3. Dispatch cfg commands to ESP32 for firmware-enforced parameters
      try {
        await send({ c: 'cfg', k: 'max_spd', v: parseInt(settings.max_speed_pct, 10) || 80 });
        await send({ c: 'cfg', k: 'obs_dist', v: parseInt(settings.obstacle_distance_cm, 10) || 15 });
      } catch {
        // ignore if offline
      }

      setToast({
        type: 'success',
        title: 'Settings Saved',
        message: 'System thresholds, comfort ranges, and transport configuration successfully saved.',
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not communicate with backend API.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
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

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            System & Mission Settings
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Configure telemetry transport, endpoints, agricultural thresholds, safety caps, and greenhouse comfort zones.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          icon={saving ? <Check className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        >
          {saving ? 'Saving...' : 'Save All Settings'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Connectivity & Transport */}
        <Card title="Transport & Network Connectivity" variant="default" className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-2 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5" />
              Rover Hardware Transport Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransportType('ble')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  transportType === 'ble'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-app text-text-muted hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-bold text-text-main">Bluetooth LE (Web BLE)</div>
                <div className="text-[11px] text-text-muted mt-1">Direct hardware connection to ESP32 GATT service</div>
              </button>

              <button
                type="button"
                onClick={() => setTransportType('mock')}
                className={`p-3.5 rounded-xl border-2 text-left transition-all ${
                  transportType === 'mock'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-app text-text-muted hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-bold text-text-main">Mock Simulator</div>
                <div className="text-[11px] text-text-muted mt-1">Simulates 5Hz telemetry, drive responses, and probe</div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Camera className="w-3.5 h-3.5" />
                ESP32-CAM IP Address
              </label>
              <input
                type="text"
                value={settings.camera_ip}
                onChange={(e) => handleChange('camera_ip', e.target.value)}
                placeholder="192.168.4.1"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Server className="w-3.5 h-3.5" />
                FastAPI Backend URL
              </label>
              <input
                type="text"
                value={settings.backend_url}
                onChange={(e) => handleChange('backend_url', e.target.value)}
                placeholder="http://localhost:8000"
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </Card>

        {/* 2. Display Theme */}
        <Card title="Interface Theme" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted">
            Choose light, dark, or system-matching theme. Tested for high contrast under bright greenhouse sun and night sweeps.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`p-3.5 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                theme === 'light'
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-border bg-app text-text-muted hover:border-text-muted'
              }`}
            >
              <Sun className="w-5 h-5 text-warning" />
              <span className="text-xs font-bold text-text-main">Light</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`p-3.5 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                theme === 'dark'
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-border bg-app text-text-muted hover:border-text-muted'
              }`}
            >
              <Moon className="w-5 h-5 text-water" />
              <span className="text-xs font-bold text-text-main">Dark</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme('auto')}
              className={`p-3.5 rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${
                theme === 'auto'
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-border bg-app text-text-muted hover:border-text-muted'
              }`}
            >
              <Laptop className="w-5 h-5 text-text-muted" />
              <span className="text-xs font-bold text-text-main">System Auto</span>
            </button>
          </div>
        </Card>

        {/* 3. Decision Engine & Confidence Thresholds */}
        <Card title="Decision Engine & Vision Thresholds" variant="default" className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-water" />
              Soil Moisture Threshold (%)
            </label>
            <input
              type="number"
              step="0.5"
              value={settings.moisture_threshold}
              onChange={(e) => handleChange('moisture_threshold', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
            />
            <span className="text-[11px] text-text-muted mt-1 block">
              Automated irrigation triggers when soil probe moisture reads below this threshold.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                High Confidence (Treat)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="1.0"
                value={settings.high_confidence}
                onChange={(e) => handleChange('high_confidence', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
              <span className="text-[10px] text-text-muted">Diseased &ge; threshold triggers treatment spray.</span>
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Low Confidence (Unsure)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="0.9"
                value={settings.low_confidence}
                onChange={(e) => handleChange('low_confidence', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
              <span className="text-[10px] text-text-muted">Between low & high is flagged as unsure (never spray).</span>
            </div>
          </div>
        </Card>

        {/* 4. Agricultural Dose Caps */}
        <Card title="Doses & Safety Dose Caps" variant="default" className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Default Water Dose (ml)
              </label>
              <input
                type="number"
                value={settings.default_water_dose_ml}
                onChange={(e) => handleChange('default_water_dose_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Default Treat Dose (ml)
              </label>
              <input
                type="number"
                value={settings.default_treat_dose_ml}
                onChange={(e) => handleChange('default_treat_dose_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Plant Water Cap (ml)
              </label>
              <input
                type="number"
                value={settings.per_plant_water_cap_ml}
                onChange={(e) => handleChange('per_plant_water_cap_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Plant Treat Cap (ml)
              </label>
              <input
                type="number"
                value={settings.per_plant_treat_cap_ml}
                onChange={(e) => handleChange('per_plant_treat_cap_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Run Water Cap (ml)
              </label>
              <input
                type="number"
                value={settings.per_run_water_cap_ml}
                onChange={(e) => handleChange('per_run_water_cap_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Run Treat Cap (ml)
              </label>
              <input
                type="number"
                value={settings.per_run_treat_cap_ml}
                onChange={(e) => handleChange('per_run_treat_cap_ml', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </Card>

        {/* 5. Motion Speed & Obstacle Avoidance */}
        <Card title="Speed Limits & Obstacle Avoidance" variant="default" className="p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase text-text-muted flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5" />
                Rover Max Speed Limit (%)
              </label>
              <span className="text-sm font-black tabular-nums text-text-main">{settings.max_speed_pct}%</span>
            </div>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={settings.max_speed_pct}
              onChange={(e) => handleChange('max_speed_pct', e.target.value)}
              className="w-full accent-primary h-2 bg-app rounded-lg cursor-pointer"
            />
            <span className="text-[11px] text-text-muted mt-1 block">
              Caps teleoperation drive pad and autonomous transit speed to prevent tipping.
            </span>
          </div>

          <div className="pt-2 border-t border-border">
            <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-danger" />
              Obstacle Stop Distance (cm)
            </label>
            <input
              type="number"
              min="5"
              max="100"
              value={settings.obstacle_distance_cm}
              onChange={(e) => handleChange('obstacle_distance_cm', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary"
            />
            <span className="text-[11px] text-text-muted mt-1 block">
              Ultrasonic front distance threshold that immediately cuts off motors and halts mission.
            </span>
          </div>
        </Card>

        {/* 6. Greenhouse Comfort Ranges */}
        <Card title="Greenhouse Climate Comfort Ranges" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted leading-relaxed">
            Specify ideal climate boundary conditions. Ambient temperature and humidity outside these ranges will highlight in amber or red on the dashboard. (Empty by default until you specify them).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-warning" />
                Min Temperature (°C)
              </label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 18.0"
                value={settings.comfort_temp_min}
                onChange={(e) => handleChange('comfort_temp_min', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary placeholder:text-text-muted/50"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-danger" />
                Max Temperature (°C)
              </label>
              <input
                type="number"
                step="0.5"
                placeholder="e.g. 28.5"
                value={settings.comfort_temp_max}
                onChange={(e) => handleChange('comfort_temp_max', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary placeholder:text-text-muted/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-water" />
                Min Humidity (%)
              </label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 50"
                value={settings.comfort_hum_min}
                onChange={(e) => handleChange('comfort_hum_min', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary placeholder:text-text-muted/50"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1 flex items-center gap-1">
                <Droplets className="w-3.5 h-3.5 text-water" />
                Max Humidity (%)
              </label>
              <input
                type="number"
                step="1"
                placeholder="e.g. 80"
                value={settings.comfort_hum_max}
                onChange={(e) => handleChange('comfort_hum_max', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-xs font-bold focus:outline-none focus:border-primary placeholder:text-text-muted/50"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
