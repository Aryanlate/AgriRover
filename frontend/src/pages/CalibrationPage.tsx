import React, { useEffect, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { apiClient } from '../services/api/client';
import type { CalibrationItem } from '../services/api/types';

export const CalibrationPage: React.FC = () => {
  const [calibrations, setCalibrations] = useState<CalibrationItem[]>([
    { name: 'soil_moisture', param1: 3200, param2: 1400, unit: 'ADC', notes: 'param1=dry_raw, param2=wet_raw' },
    { name: 'water_pump', param1: 25.0, param2: 0, unit: 'ml/s', notes: 'param1=flow_rate_ml_s' },
    { name: 'treat_pump', param1: 20.0, param2: 0, unit: 'ml/s', notes: 'param1=flow_rate_ml_s' },
  ]);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient
      .getCalibrations()
      .then((data) => {
        if (data && data.length > 0) setCalibrations(data);
      })
      .catch(() => {});
  }, []);

  const handleUpdateParam = (name: string, paramIndex: 1 | 2, val: number) => {
    setCalibrations((prev) =>
      prev.map((c) =>
        c.name === name
          ? { ...c, [paramIndex === 1 ? 'param1' : 'param2']: val }
          : c
      )
    );
  };

  const handleSave = async (item: CalibrationItem) => {
    try {
      await apiClient.updateCalibration(item);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Local feedback
    }
  };

  const soilCal = calibrations.find((c) => c.name === 'soil_moisture') || {
    param1: 3200,
    param2: 1400,
  };
  const waterCal = calibrations.find((c) => c.name === 'water_pump') || { param1: 25.0 };
  const treatCal = calibrations.find((c) => c.name === 'treat_pump') || { param1: 20.0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Sensor & Pump Calibration
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Map raw ADC signals to physical soil moisture % and pump timing to volumetric milliliters.
          </p>
        </div>

        {saved && (
          <span className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Check className="w-4 h-4" /> Calibration profile saved
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Soil Moisture Calibration */}
        <Card title="Soil Moisture Probe (Capacitive ADC)" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted">
            Dry in air typically outputs high raw ADC (~3200), submerged in water outputs low raw ADC (~1400).
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Dry Value (Air)
              </label>
              <input
                type="number"
                value={soilCal.param1}
                onChange={(e) => handleUpdateParam('soil_moisture', 1, parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Wet Value (Water)
              </label>
              <input
                type="number"
                value={soilCal.param2}
                onChange={(e) => handleUpdateParam('soil_moisture', 2, parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              const item = calibrations.find((c) => c.name === 'soil_moisture');
              if (item) handleSave(item);
            }}
            icon={<Save className="w-4 h-4" />}
          >
            Save Soil Calibration
          </Button>
        </Card>

        {/* Pump Flow Rates */}
        <Card title="Peristaltic & Diaphragm Pump Flow Rates" variant="default" className="p-6 space-y-4">
          <p className="text-xs text-text-muted">
            Flow rate in ml/s converts required dose volume into relay actuation pulse duration.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Water Pump (ml/s)
              </label>
              <input
                type="number"
                value={waterCal.param1}
                onChange={(e) => handleUpdateParam('water_pump', 1, parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                Treatment Pump (ml/s)
              </label>
              <input
                type="number"
                value={treatCal.param1}
                onChange={(e) => handleUpdateParam('treat_pump', 1, parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          <Button
            variant="secondary"
            onClick={() => {
              const item = calibrations.find((c) => c.name === 'water_pump');
              if (item) handleSave(item);
            }}
            icon={<Save className="w-4 h-4" />}
          >
            Save Pump Flow Rates
          </Button>
        </Card>
      </div>
    </div>
  );
};
