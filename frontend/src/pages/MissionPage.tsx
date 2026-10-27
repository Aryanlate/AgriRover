import React, { useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { apiClient } from '../services/api/client';

export const MissionPage: React.FC = () => {
  const { setMode, send } = useRoverStore();
  const [missionActive, setMissionActive] = useState(false);
  const activeStep = 0;

  const steps = [
    'Navigate to plant location',
    'Deploy soil moisture probe & read',
    'Tilt camera: Leaf pose & vision scan',
    'Tilt camera: Stem pose & vision scan',
    'Run decision engine',
    'Aim nozzle & dispense treatment/water (capped)',
    'Log telemetry and proceed to next plant',
  ];

  const handleStartMission = async () => {
    setMissionActive(true);
    setMode('mission');
    try {
      await apiClient.createRun('Autonomous Greenhouse Mission');
    } catch {
      // Backend optional for initial mock
    }
  };

  const handlePauseMission = () => {
    setMissionActive(false);
    send({ c: 'stop' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Autonomous Mission Orchestrator
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Automated per-plant cycle: move, soil probe, leaf/stem vision inspection, and precision spray.
          </p>
        </div>

        <div className="flex gap-3">
          {!missionActive ? (
            <Button variant="primary" onClick={handleStartMission} icon={<Play className="w-5 h-5" />}>
              Start Mission
            </Button>
          ) : (
            <Button variant="secondary" onClick={handlePauseMission} icon={<Pause className="w-5 h-5" />}>
              Pause Mission
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Mission Sequence State" variant="default" className="p-6 lg:col-span-2">
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div
                key={step}
                className={`flex items-center gap-4 p-3 rounded-xl border-2 transition-colors ${
                  missionActive && activeStep === idx
                    ? 'border-primary bg-primary/10 font-bold text-text-main'
                    : idx < activeStep
                    ? 'border-border bg-app text-text-muted'
                    : 'border-border/40 text-text-muted opacity-70'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                    idx < activeStep
                      ? 'bg-primary text-surface'
                      : missionActive && activeStep === idx
                      ? 'bg-primary text-surface animate-pulse'
                      : 'bg-app text-text-muted border border-border'
                  }`}
                >
                  {idx + 1}
                </div>
                <span className="text-sm">{step}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Mission Parameters" variant="default" className="p-6">
          <div className="space-y-4 text-sm font-medium">
            <div>
              <span className="text-xs text-text-muted font-bold uppercase block">Target Crop</span>
              <span className="text-text-main font-bold">Tomato (Row 1)</span>
            </div>
            <div>
              <span className="text-xs text-text-muted font-bold uppercase block">Total Plants in Row</span>
              <span className="text-text-main font-bold">12 Plants</span>
            </div>
            <div>
              <span className="text-xs text-text-muted font-bold uppercase block">Water Dispense Cap</span>
              <span className="text-text-main font-bold">150 ml / plant</span>
            </div>
            <div>
              <span className="text-xs text-text-muted font-bold uppercase block">Chemical Treatment Cap</span>
              <span className="text-text-main font-bold">60 ml / plant</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
