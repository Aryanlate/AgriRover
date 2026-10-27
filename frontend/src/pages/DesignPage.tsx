import React, { useState } from 'react';
import {
  LeafLogo,
  Card,
  StatCard,
  StatusBadge,
  Button,
  BigIconButton,
  ConfirmDialog,
  Toast,
  EmptyState,
  Switch,
  Gauge,
  ThemeToggle,
  RangeBar,
  PlantTile,
} from '../components/ui';
import type { ToastType, PlantStatus, SystemStatus } from '../components/ui';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Droplets,
  SprayCan,
  ShieldAlert,
  Thermometer,
  Wind,
  Bell,
  Eye,
  Columns,
  Maximize2,
} from 'lucide-react';

export const DesignPage: React.FC = () => {
  // Interactive state demos
  const [viewMode, setViewMode] = useState<'interactive' | 'side-by-side'>('interactive');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [switch1, setSwitch1] = useState(true);
  const [switch2, setSwitch2] = useState(false);
  const [activeToast, setActiveToast] = useState<{ type: ToastType; message: string; title: string } | null>(null);
  const [batteryDemoLevel, setBatteryDemoLevel] = useState(74);
  const [batteryCharging, setBatteryCharging] = useState(false);
  const [selectedPlant, setSelectedPlant] = useState<number | null>(1);
  const [driveLog, setDriveLog] = useState<string>('Ready for input');

  const triggerToast = (type: ToastType, title: string, message: string) => {
    setActiveToast({ type, title, message });
  };

  const handleDrive = (cmd: string) => {
    setDriveLog(`Command executed: ${cmd} at ${new Date().toLocaleTimeString()}`);
  };

  const plantStatuses: { status: PlantStatus; crop: string; moisture?: number; conf?: number }[] = [
    { status: 'healthy', crop: 'Tomato', moisture: 45, conf: 0.96 },
    { status: 'needs water', crop: 'Tomato', moisture: 18, conf: 0.94 },
    { status: 'watered', crop: 'Pepper', moisture: 52, conf: 0.91 },
    { status: 'disease', crop: 'Pepper', moisture: 38, conf: 0.98 },
    { status: 'treated', crop: 'Brinjal', moisture: 40, conf: 0.95 },
    { status: 'unsure', crop: 'Potato', moisture: 34, conf: 0.62 },
    { status: 'not scanned', crop: 'Potato', moisture: undefined, conf: undefined },
    { status: 'no plant found', crop: 'Empty Pot', moisture: undefined, conf: 0.12 },
  ];

  const systemStatuses: SystemStatus[] = ['ready', 'running', 'paused', 'fault', 'disconnected'];

  // Component bundle for rendering inside a specific theme container
  const renderComponentShowcase = (themeTitle?: string) => (
    <div className="space-y-10">
      {themeTitle && (
        <div className="border-b-2 border-border pb-3 mb-6">
          <h2 className="text-2xl font-black uppercase tracking-wider text-primary">
            {themeTitle}
          </h2>
        </div>
      )}

      {/* 1. STATUS BADGES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            1. Status Badges (Never Colour Alone: Icon + Colour + Text)
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">5 System States</span>
        </div>
        <div className="p-5 bg-surface border-2 border-border rounded-2xl flex flex-wrap gap-4 items-center">
          {systemStatuses.map((st) => (
            <StatusBadge key={st} status={st} size="md" />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-text-muted">
          <span>Sizes:</span>
          <StatusBadge status="ready" size="sm" customText="Ready (SM)" />
          <StatusBadge status="ready" size="md" customText="Ready (MD)" />
          <StatusBadge status="ready" size="lg" customText="Ready (LG - 48px)" />
        </div>
      </section>

      {/* 2. STAT CARDS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            2. Stat Cards (Big Numerals, Comfort Ranges & Stale State)
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">High Contrast</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Soil Moisture"
            value={42}
            unit="%"
            lastUpdated="10s ago"
            comfortRange={{ min: 30, max: 60, criticalMin: 15 }}
            icon={<Droplets className="w-5 h-5 text-water" />}
          />
          <StatCard
            label="Substrate Temp"
            value={34.2}
            unit="°C"
            lastUpdated="1m ago"
            comfortRange={{ min: 20, max: 30, criticalMax: 35 }}
            icon={<Thermometer className="w-5 h-5 text-warning" />}
          />
          <StatCard
            label="Root Moisture"
            value={11}
            unit="%"
            lastUpdated="just now"
            comfortRange={{ min: 30, max: 60, criticalMin: 15 }}
            icon={<Droplets className="w-5 h-5 text-danger" />}
          />
          <StatCard
            label="Canopy Humidity"
            value={58}
            unit="%"
            lastUpdated="14m ago"
            stale={true}
            icon={<Wind className="w-5 h-5 text-text-muted" />}
          />
        </div>
      </section>

      {/* 3. BATTERY GAUGE & RANGE BARS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            3. Battery Gauge & Sensor Range Bars
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">Threshold Markers</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Gauge
            level={batteryDemoLevel}
            voltage={12.4}
            charging={batteryCharging}
            label="Rover 12V LiFePO4"
          />
          <RangeBar
            label="Ambient Air Temp"
            value={27}
            min={10}
            max={45}
            comfortMin={20}
            comfortMax={30}
            unit="°C"
          />
          <RangeBar
            label="Water Tank 1 Level"
            value={18}
            min={0}
            max={100}
            comfortMin={25}
            comfortMax={100}
            unit="%"
          />
        </div>
      </section>

      {/* 4. BUTTONS & TOUCH TARGETS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            4. Buttons (Primary, Secondary, Danger - Min 48px Target)
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">Greenhouse Glare Optimized</span>
        </div>
        <div className="p-5 bg-surface border-2 border-border rounded-2xl flex flex-wrap gap-4 items-center">
          <Button variant="primary" icon={<Droplets className="w-5 h-5" />}>
            Start Water Mission
          </Button>
          <Button variant="secondary" icon={<Eye className="w-5 h-5" />}>
            Inspect Next Plant
          </Button>
          <Button
            variant="danger"
            icon={<ShieldAlert className="w-5 h-5" />}
            onClick={() => setIsDialogOpen(true)}
          >
            Emergency E-Stop
          </Button>
          <Button variant="primary" disabled>
            Disabled Button
          </Button>
        </div>
      </section>

      {/* 5. BIG ICON BUTTONS (DRIVE PAD CONTROLS) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            5. BigIconButton (Drive Pad & Actuator Controls)
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">Min 68px Tactile Targets</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Drive Cluster */}
          <Card className="flex flex-col items-center justify-center p-6" padding="none">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">
              Chassis Drive Navigation Pad
            </span>
            <div className="grid grid-cols-3 gap-3 w-fit">
              <div />
              <BigIconButton
                icon={<ArrowUp className="w-8 h-8" />}
                label="FWD"
                sublabel="Drive"
                variant="surface"
                onClick={() => handleDrive('FORWARD')}
              />
              <div />

              <BigIconButton
                icon={<ArrowLeft className="w-8 h-8" />}
                label="LEFT"
                sublabel="Turn"
                variant="surface"
                onClick={() => handleDrive('TURN LEFT')}
              />
              <BigIconButton
                icon={<Square className="w-8 h-8" />}
                label="STOP"
                sublabel="Brake"
                variant="danger"
                size="xl"
                onClick={() => handleDrive('HARD STOP')}
              />
              <BigIconButton
                icon={<ArrowRight className="w-8 h-8" />}
                label="RIGHT"
                sublabel="Turn"
                variant="surface"
                onClick={() => handleDrive('TURN RIGHT')}
              />

              <div />
              <BigIconButton
                icon={<ArrowDown className="w-8 h-8" />}
                label="REV"
                sublabel="Reverse"
                variant="surface"
                onClick={() => handleDrive('REVERSE')}
              />
              <div />
            </div>

            <div className="mt-4 text-xs font-bold font-mono text-primary bg-app px-3 py-1.5 rounded-lg border border-border">
              {driveLog}
            </div>
          </Card>

          {/* Actuator & Tool Cluster */}
          <Card className="flex flex-col justify-between p-6" padding="none">
            <span className="text-xs font-bold uppercase tracking-widest text-text-muted mb-4">
              Subsystem & Nozzle Actuators
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
              <BigIconButton
                icon={<ArrowDown className="w-7 h-7" />}
                label="PROBE"
                sublabel="Insert Soil"
                variant="primary"
                onClick={() => handleDrive('PROBE DOWN')}
              />
              <BigIconButton
                icon={<ArrowUp className="w-7 h-7" />}
                label="PROBE"
                sublabel="Retract Up"
                variant="surface"
                onClick={() => handleDrive('PROBE UP')}
              />
              <BigIconButton
                icon={<Droplets className="w-7 h-7" />}
                label="PUMP 1"
                sublabel="Water Tank"
                variant="water"
                onClick={() => handleDrive('PUMP 1 WATER')}
              />
              <BigIconButton
                icon={<SprayCan className="w-7 h-7" />}
                label="PUMP 2"
                sublabel="Treatment"
                variant="warning"
                onClick={() => handleDrive('PUMP 2 TREAT')}
              />
            </div>
            <p className="mt-4 text-xs text-text-muted">
              Safety rule: Probe must be verified in UP position before rover drive commands are accepted by firmware.
            </p>
          </Card>
        </div>
      </section>

      {/* 6. PLANT TILES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            6. PlantTile (All 8 Required Statuses)
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">Grid & Mission Review</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {plantStatuses.map((p, idx) => (
            <PlantTile
              key={p.status}
              id={idx + 1}
              plantName={p.crop}
              status={p.status}
              row={1}
              col={idx + 1}
              moisture={p.moisture}
              confidence={p.conf}
              selected={selectedPlant === idx + 1}
              onClick={() => setSelectedPlant(idx + 1)}
            />
          ))}
        </div>
      </section>

      {/* 7. SWITCHES, TOASTS & EMPTY STATE */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold tracking-tight text-text-main">
            7. Switches, Notifications & Empty States
          </h3>
          <span className="text-xs font-semibold text-text-muted uppercase">Interactive Feedback</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Switches and Toast Triggers */}
          <Card className="space-y-5" padding="md">
            <h4 className="text-base font-bold text-text-main">Large Rugged Switches</h4>
            <div className="space-y-3">
              <Switch
                checked={switch1}
                onChange={setSwitch1}
                label="Automatic Mission Mode"
                description="Allows autonomous rover indexing through plant rows without manual step approval"
              />
              <div className="border-t border-border" />
              <Switch
                checked={switch2}
                onChange={setSwitch2}
                label="ESP32-CAM Illumination LED"
                description="Enables high-power flood LED for low-light canopy scanning"
              />
              <div className="border-t border-border" />
              <Switch
                checked={false}
                disabled={true}
                onChange={() => {}}
                label="Emergency Override Interlock (Locked)"
                description="Firmware hardware lockout active"
              />
            </div>

            <h4 className="text-base font-bold text-text-main pt-4 border-t border-border">
              Trigger Toast Notification
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => triggerToast('info', 'BLE Telemetry', 'Subscribed to 10 Hz MPU6050 and encoder stream.')}
              >
                Info
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => triggerToast('success', 'Plant Watered', 'Dispensed 120 mL water to Plant #3.')}
              >
                Success
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => triggerToast('warning', 'Low Tank Level', 'Treatment tank estimate below 150 mL.')}
              >
                Warning
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={() => triggerToast('error', 'Obstacle Halt', 'Ultrasonic detected object within 15 cm.')}
              >
                Error
              </Button>
            </div>
          </Card>

          {/* Empty State Showcase */}
          <EmptyState
            icon={<LeafLogo size={40} />}
            title="No Active Greenhouse Mission"
            message="Pair your laptop with the Agri-Rover via Bluetooth Low Energy to load crop rows and start inspection."
            actionLabel="Connect Bluetooth Rover"
            onAction={() => triggerToast('info', 'Pairing Initiated', 'Scanning for Agri-Rover BLE advertisement...')}
          />
        </div>
      </section>

      {/* 8. TOAST PREVIEWS (ALL 4 TYPES VISIBLE) */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold tracking-tight text-text-main">
          8. Toast Notification Styles (Info, Success, Warning, Error)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Toast
            type="info"
            title="Telemetry Link Active"
            message="ESP32-CAM connected to local AP at 192.168.4.1 (54 Mbps)."
          />
          <Toast
            type="success"
            title="Treatment Complete"
            message="Nozzle aimed at stem blight; dispensed 45 mL spray."
          />
          <Toast
            type="warning"
            title="Unsure Classifier Result"
            message="Confidence 62% is between thresholds. Part marked for manual inspection."
          />
          <Toast
            type="error"
            title="Heartbeat Safety Timeout"
            message="No BLE keepalive received for 1000 ms. All motors and relays stopped."
          />
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-app text-text-main p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 mb-8 border-b-2 border-border">
        <div className="flex items-center gap-3">
          <LeafLogo size={36} showText={true} />
          <div className="h-6 w-0.5 bg-border mx-1 hidden sm:block" />
          <span className="text-sm font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-surface border border-border text-text-muted">
            Design Review & Component Showcase
          </span>
        </div>

        {/* Header Controls: View mode toggle & Global Theme Toggle */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="inline-flex items-center p-1 rounded-2xl bg-surface border-2 border-border gap-1">
            <button
              type="button"
              onClick={() => setViewMode('interactive')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold min-h-[44px] transition-all ${
                viewMode === 'interactive'
                  ? 'bg-primary text-surface shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              <span>Full View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold min-h-[44px] transition-all ${
                viewMode === 'side-by-side'
                  ? 'bg-primary text-surface shadow-sm'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              <Columns className="w-4 h-4" />
              <span>Side-by-Side</span>
            </button>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* DESIGN SYSTEM TOKEN CHEATSHEET */}
      <section className="mb-10">
        <Card className="p-5" padding="none">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-text-main">
                Greenhouse Colour Tokens & Contrast Verification
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Every token is mapped through CSS variables with &ge; 4.5:1 contrast against glare. Never hard-coded.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary bg-app px-3 py-1.5 rounded-lg border border-border">
              <span>Touch targets &ge; 48px</span>
              <span>&bull;</span>
              <span>Zero CDN dependencies</span>
            </div>
          </div>

          {/* Palette Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <div className="p-3 rounded-xl bg-app border border-border text-xs">
              <span className="block font-bold text-text-main">App Background</span>
              <span className="text-[11px] text-text-muted font-mono">var(--bg-app)</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border text-xs">
              <span className="block font-bold text-text-main">Surface</span>
              <span className="text-[11px] text-text-muted font-mono">var(--surface)</span>
            </div>
            <div className="p-3 rounded-xl bg-primary text-surface font-bold text-xs">
              <span className="block">Primary Green</span>
              <span className="text-[11px] opacity-90 font-mono">var(--primary-green)</span>
            </div>
            <div className="p-3 rounded-xl bg-danger text-surface font-bold text-xs">
              <span className="block">Danger / Fault</span>
              <span className="text-[11px] opacity-90 font-mono">var(--status-danger)</span>
            </div>
            <div className="p-3 rounded-xl bg-warning text-surface font-bold text-xs">
              <span className="block">Warning / Amber</span>
              <span className="text-[11px] opacity-90 font-mono">var(--status-warning)</span>
            </div>
            <div className="p-3 rounded-xl bg-water text-surface font-bold text-xs">
              <span className="block">Water Blue</span>
              <span className="text-[11px] opacity-90 font-mono">var(--water-blue)</span>
            </div>
            <div className="p-3 rounded-xl bg-treated text-surface font-bold text-xs">
              <span className="block">Treated Purple</span>
              <span className="text-[11px] opacity-90 font-mono">var(--treated-purple)</span>
            </div>
            <div className="p-3 rounded-xl bg-unsure text-surface font-bold text-xs">
              <span className="block">Unsure Amber</span>
              <span className="text-[11px] opacity-90 font-mono">var(--unsure-amber)</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border text-xs col-span-2 sm:col-span-1 md:col-span-4">
              <span className="block font-bold text-text-main">Text & Contrast Rule</span>
              <span className="text-[11px] text-text-muted">
                Text: <strong className="text-text-main">var(--text-main)</strong> | Muted: <strong className="text-text-muted">var(--text-muted)</strong> (&ge; 4.5:1 WCAG AA)
              </span>
            </div>
          </div>
        </Card>
      </section>

      {/* Interactive Controls Bar for Live Testing */}
      <div className="mb-8 p-4 bg-surface border-2 border-border rounded-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-text-main">Live Component Tester:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold">
          <label className="flex items-center gap-2">
            <span>Battery Level:</span>
            <input
              type="range"
              min="5"
              max="100"
              value={batteryDemoLevel}
              onChange={(e) => setBatteryDemoLevel(Number(e.target.value))}
              className="accent-primary cursor-pointer"
            />
            <span className="tabular-nums font-mono text-text-main">{batteryDemoLevel}%</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={batteryCharging}
              onChange={(e) => setBatteryCharging(e.target.checked)}
              className="accent-primary w-4 h-4 cursor-pointer"
            />
            <span>Simulate Charging</span>
          </label>
        </div>
      </div>

      {/* Main Review Sections: Either Full Interactive View or Side-by-Side Review */}
      {viewMode === 'interactive' ? (
        renderComponentShowcase()
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* Forced Light Theme Scope */}
          <div className="theme-light bg-app text-text-main p-6 rounded-3xl border-4 border-border shadow-md">
            {renderComponentShowcase('Light Theme Preview')}
          </div>

          {/* Forced Dark Theme Scope */}
          <div className="theme-dark bg-app text-text-main p-6 rounded-3xl border-4 border-border shadow-md">
            {renderComponentShowcase('Dark Theme Preview')}
          </div>
        </div>
      )}

      {/* Active Toast Overlay Display */}
      {activeToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-4">
          <Toast
            type={activeToast.type}
            title={activeToast.title}
            message={activeToast.message}
            onClose={() => setActiveToast(null)}
          />
        </div>
      )}

      {/* Confirm Dialog Demo Modal */}
      <ConfirmDialog
        isOpen={isDialogOpen}
        title="Trigger Emergency Stop?"
        description="This will instantly cut 12V motor driver power, de-energize both water and treatment pumps, and place the ESP32 in a safe lock state."
        confirmText="Confirm E-Stop"
        cancelText="Resume"
        variant="danger"
        onConfirm={() => {
          setIsDialogOpen(false);
          triggerToast('error', 'E-Stop Activated', 'Firmware emergency stop triggered. All outputs locked.');
        }}
        onCancel={() => setIsDialogOpen(false)}
      />
    </div>
  );
};
