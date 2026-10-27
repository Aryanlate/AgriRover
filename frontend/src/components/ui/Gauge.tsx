import React from 'react';
import { Battery, BatteryLow, BatteryMedium, BatteryWarning, Zap } from 'lucide-react';
import { Card } from './Card';

export interface BatteryGaugeProps {
  level: number; // 0 to 100
  charging?: boolean;
  voltage?: number;
  label?: string;
  className?: string;
}

export const Gauge: React.FC<BatteryGaugeProps> = ({
  level,
  charging = false,
  voltage,
  label = 'Main Battery',
  className = '',
}) => {
  // Clamp level between 0 and 100
  const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));

  // Determine status thresholds
  // >= 50: normal green, 20-49: warning amber, < 20: danger red
  let statusColor = 'text-primary';
  let barColor = 'bg-primary';
  let borderColor = 'border-primary/40';
  let statusText = 'Good Reserve';
  let IconComponent = BatteryMedium;

  if (charging) {
    statusColor = 'text-water';
    barColor = 'bg-water';
    borderColor = 'border-water/40';
    statusText = 'Charging';
    IconComponent = Zap;
  } else if (clampedLevel < 20) {
    statusColor = 'text-danger';
    barColor = 'bg-danger';
    borderColor = 'border-danger/60';
    statusText = 'Critical Low';
    IconComponent = BatteryWarning;
  } else if (clampedLevel < 50) {
    statusColor = 'text-warning';
    barColor = 'bg-warning';
    borderColor = 'border-warning/50';
    statusText = 'Low Battery';
    IconComponent = BatteryLow;
  } else {
    statusColor = 'text-primary';
    barColor = 'bg-primary';
    borderColor = 'border-primary/40';
    statusText = 'Nominal Charge';
    IconComponent = clampedLevel > 80 ? Battery : BatteryMedium;
  }

  return (
    <Card className={`relative overflow-hidden ${className}`} padding="md">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <div className={`flex items-center gap-1.5 font-bold text-xs uppercase px-2.5 py-1 rounded-lg border ${borderColor} ${statusColor}`}>
          <IconComponent className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Large Numeral with Charge Percentage */}
      <div className="flex items-baseline gap-1 my-1">
        <span className="text-4xl sm:text-5xl font-black tracking-tight text-text-main tabular-nums">
          {clampedLevel}
        </span>
        <span className="text-xl font-bold text-text-muted">%</span>
        {voltage !== undefined && (
          <span className="ml-auto text-sm font-bold text-text-muted tabular-nums">
            {voltage.toFixed(1)} V
          </span>
        )}
      </div>

      {/* Rugged Segmented Progress Track */}
      <div className="mt-4">
        <div className="w-full h-4 bg-app border-2 border-border rounded-full overflow-hidden p-0.5 flex">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${clampedLevel}%` }}
            role="progressbar"
            aria-valuenow={clampedLevel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label} level`}
          />
        </div>

        {/* Level scale markers */}
        <div className="flex justify-between text-[11px] font-bold text-text-muted mt-1.5 px-0.5">
          <span>0%</span>
          <span className="text-warning">20% Warn</span>
          <span className="text-primary">50% OK</span>
          <span>100%</span>
        </div>
      </div>
    </Card>
  );
};
