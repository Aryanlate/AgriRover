import React, { useEffect, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { apiClient } from '../services/api/client';

export const SettingsPage: React.FC = () => {
  const { transportType, setTransportType } = useRoverStore();

  const [settings, setSettings] = useState<Record<string, string>>({
    camera_ip: '192.168.4.1',
    camera_timeout_sec: '5.0',
    moisture_threshold: '35.0',
    default_water_dose_ml: '50.0',
    default_treat_dose_ml: '25.0',
    high_confidence: '0.85',
    low_confidence: '0.60',
    per_plant_water_cap_ml: '150.0',
    per_plant_treat_cap_ml: '60.0',
  });

  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    apiClient
      .getSettings()
      .then((data) => {
        if (data) setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  const handleChange = (key: string, val: string) => {
    setSettings((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    try {
      await apiClient.updateSettings(settings);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch {
      // Local feedback
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Rover & Mission Settings
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Configure telemetry transport, camera network endpoints, and agricultural dose thresholds.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          icon={savedNotice ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        >
          {savedNotice ? 'Settings Saved' : 'Save Changes'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hardware & Transport Mode */}
        <Card title="Transport & Connectivity" variant="default" className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-2">
              Primary Rover Transport
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransportType('ble')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  transportType === 'ble'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-app text-text-muted hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-bold text-text-main">Bluetooth LE (Hardware)</div>
                <div className="text-xs text-text-muted mt-1">Direct Web Bluetooth connection to ESP32</div>
              </button>

              <button
                type="button"
                onClick={() => setTransportType('mock')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  transportType === 'mock'
                    ? 'border-primary bg-primary/10 text-primary font-bold'
                    : 'border-border bg-app text-text-muted hover:border-text-muted'
                }`}
              >
                <div className="text-sm font-bold text-text-main">Mock Simulator</div>
                <div className="text-xs text-text-muted mt-1">Simulates 5Hz telemetry & rover acks</div>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <label className="text-xs font-bold uppercase text-text-muted block mb-1">
              ESP32-CAM IP Address
            </label>
            <input
              type="text"
              value={settings.camera_ip}
              onChange={(e) => handleChange('camera_ip', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-1">
              Camera Timeout (seconds)
            </label>
            <input
              type="text"
              value={settings.camera_timeout_sec}
              onChange={(e) => handleChange('camera_timeout_sec', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
            />
          </div>
        </Card>

        {/* Agricultural Dose & Confidence Thresholds */}
        <Card title="Decision Engine & Dose Caps" variant="default" className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase text-text-muted block mb-1">
              Moisture Threshold (%)
            </label>
            <input
              type="text"
              value={settings.moisture_threshold}
              onChange={(e) => handleChange('moisture_threshold', e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
            />
            <span className="text-[11px] text-text-muted">Watering triggers when soil moisture falls below this value.</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                High Confidence
              </label>
              <input
                type="text"
                value={settings.high_confidence}
                onChange={(e) => handleChange('high_confidence', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Low Confidence
              </label>
              <input
                type="text"
                value={settings.low_confidence}
                onChange={(e) => handleChange('low_confidence', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Plant Water Cap (ml)
              </label>
              <input
                type="text"
                value={settings.per_plant_water_cap_ml}
                onChange={(e) => handleChange('per_plant_water_cap_ml', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Per-Plant Treat Cap (ml)
              </label>
              <input
                type="text"
                value={settings.per_plant_treat_cap_ml}
                onChange={(e) => handleChange('per_plant_treat_cap_ml', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
