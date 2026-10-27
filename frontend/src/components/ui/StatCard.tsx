import React from 'react';
import { Clock, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { Card } from './Card';

export interface StatComfortRange {
  min: number;
  max: number;
  criticalMin?: number;
  criticalMax?: number;
}

export interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  lastUpdated?: string;
  comfortRange?: StatComfortRange;
  numericValue?: number;
  stale?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  unit,
  lastUpdated,
  comfortRange,
  numericValue,
  stale = false,
  className = '',
  icon,
}) => {
  // Determine if numeric value is provided or parseable
  const num = typeof numericValue === 'number' 
    ? numericValue 
    : typeof value === 'number' 
      ? value 
      : parseFloat(String(value));

  let comfortStatus: 'normal' | 'warning' | 'critical' = 'normal';
  let statusMessage = 'Optimal';

  if (!isNaN(num) && comfortRange) {
    if (
      (comfortRange.criticalMin !== undefined && num < comfortRange.criticalMin) ||
      (comfortRange.criticalMax !== undefined && num > comfortRange.criticalMax)
    ) {
      comfortStatus = 'critical';
      statusMessage = num < (comfortRange.criticalMin ?? comfortRange.min) ? 'Critically Low' : 'Critically High';
    } else if (num < comfortRange.min || num > comfortRange.max) {
      comfortStatus = 'warning';
      statusMessage = num < comfortRange.min ? 'Below Range' : 'Above Range';
    } else {
      comfortStatus = 'normal';
      statusMessage = 'In Target Range';
    }
  }

  // Styling based on comfort status and staleness
  let cardBorder = 'border-border';
  let statusColor = 'text-primary';
  let StatusIcon = CheckCircle;

  if (stale) {
    cardBorder = 'border-border opacity-60 grayscale';
  } else if (comfortStatus === 'critical') {
    cardBorder = 'border-danger/80';
    statusColor = 'text-danger';
    StatusIcon = AlertCircle;
  } else if (comfortStatus === 'warning') {
    cardBorder = 'border-warning/80';
    statusColor = 'text-warning';
    StatusIcon = AlertTriangle;
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all ${cardBorder} ${stale ? 'bg-app' : 'bg-surface'} ${className}`}
      padding="md"
    >
      {/* Top Label & Icon Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {icon && <div className="text-text-muted">{icon}</div>}
      </div>

      {/* Big Value & Unit */}
      <div className="flex items-baseline gap-1.5 my-1">
        <span className="text-4xl sm:text-5xl font-black tracking-tight text-text-main tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="text-lg font-bold text-text-muted select-none">
            {unit}
          </span>
        )}
      </div>

      {/* Comfort Range Indicator (with Color + Icon + Text) */}
      {comfortRange && !stale && (
        <div className={`mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs font-bold ${statusColor}`}>
          <div className="flex items-center gap-1.5">
            <StatusIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>{statusMessage}</span>
          </div>
          <span className="text-text-muted font-normal tabular-nums">
            Target: {comfortRange.min}–{comfortRange.max}{unit ? ` ${unit}` : ''}
          </span>
        </div>
      )}

      {/* Stale State Banner */}
      {stale && (
        <div className="mt-3 pt-2.5 border-t border-border flex items-center gap-1.5 text-xs font-bold text-text-muted">
          <Clock className="w-4 h-4 flex-shrink-0" />
          <span>STALE DATA (Sensor Timeout)</span>
        </div>
      )}

      {/* Last Updated Timestamp */}
      {lastUpdated && (
        <div className="mt-2 text-[11px] font-medium text-text-muted flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Updated {lastUpdated}</span>
        </div>
      )}
    </Card>
  );
};
