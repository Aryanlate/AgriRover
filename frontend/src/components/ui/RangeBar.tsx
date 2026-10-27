import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface RangeBarProps {
  label: string;
  value: number;
  min: number;
  max: number;
  comfortMin: number;
  comfortMax: number;
  unit?: string;
  className?: string;
}

export const RangeBar: React.FC<RangeBarProps> = ({
  label,
  value,
  min,
  max,
  comfortMin,
  comfortMax,
  unit = '',
  className = '',
}) => {
  const rangeSpan = max - min;
  const clampedValue = Math.max(min, Math.min(max, value));

  // Percentage calculations for bar positioning
  const valuePercent = ((clampedValue - min) / rangeSpan) * 100;
  const comfortLeft = ((comfortMin - min) / rangeSpan) * 100;
  const comfortWidth = ((comfortMax - comfortMin) / rangeSpan) * 100;

  // Status calculation
  const isOptimal = value >= comfortMin && value <= comfortMax;
  const isCriticallyHigh = value > max;
  const isCriticallyLow = value < min;
  const isWarning = !isOptimal;

  let statusText = 'Optimal Range';
  let statusColor = 'text-primary';
  let StatusIcon = CheckCircle2;

  if (isCriticallyHigh || isCriticallyLow) {
    statusText = isCriticallyLow ? 'Critical Low' : 'Critical High';
    statusColor = 'text-danger';
    StatusIcon = AlertCircle;
  } else if (isWarning) {
    statusText = value < comfortMin ? 'Below Range' : 'Above Range';
    statusColor = 'text-warning';
    StatusIcon = AlertTriangle;
  }

  return (
    <div className={`p-4 bg-surface border-2 border-border rounded-2xl ${className}`}>
      {/* Header with Label and Status readout */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <div className={`flex items-center gap-1.5 text-xs font-bold uppercase ${statusColor}`}>
          <StatusIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{statusText}</span>
        </div>
      </div>

      {/* Main Numeral Readout */}
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl sm:text-4xl font-black tracking-tight text-text-main tabular-nums">
          {value}
        </span>
        {unit && <span className="text-sm font-bold text-text-muted">{unit}</span>}
      </div>

      {/* Range Track */}
      <div className="relative pt-4 pb-2">
        {/* Background track representing range */}
        <div className="relative w-full h-3.5 bg-app border border-border rounded-full overflow-hidden">
          {/* Comfort zone band */}
          <div
            className="absolute top-0 bottom-0 bg-primary/30 border-x border-primary/60"
            style={{
              left: `${comfortLeft}%`,
              width: `${comfortWidth}%`,
            }}
            title={`Comfort zone: ${comfortMin} - ${comfortMax}${unit}`}
          />
        </div>

        {/* Needle Marker Indicator */}
        <div
          className="absolute top-2 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-200"
          style={{ left: `${Math.max(2, Math.min(98, valuePercent))}%` }}
        >
          <div
            className={`w-3.5 h-7 rounded-md border-2 shadow-sm ${
              isOptimal
                ? 'bg-primary border-surface'
                : isWarning
                ? 'bg-warning border-surface'
                : 'bg-danger border-surface'
            }`}
          />
        </div>
      </div>

      {/* Scale bounds labels */}
      <div className="flex justify-between text-xs font-bold text-text-muted mt-1 tabular-nums">
        <span>{min}{unit}</span>
        <span className="text-primary font-bold">
          Target: {comfortMin}–{comfortMax}{unit}
        </span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
};
