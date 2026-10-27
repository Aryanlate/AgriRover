import React from 'react';
import {
  HelpCircle,
  CheckCircle2,
  Droplets,
  Check,
  AlertTriangle,
  Sparkles,
  HelpCircle as QuestionIcon,
  SearchX,
} from 'lucide-react';
import { Card } from './Card';

export type PlantStatus =
  | 'not scanned'
  | 'healthy'
  | 'needs water'
  | 'watered'
  | 'disease'
  | 'treated'
  | 'unsure'
  | 'no plant found';

export interface PlantTileProps {
  id?: string | number;
  plantName?: string;
  status: PlantStatus;
  row?: number;
  col?: number;
  moisture?: number;
  confidence?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export const PlantTile: React.FC<PlantTileProps> = ({
  id,
  plantName = 'Tomato',
  status,
  row,
  col,
  moisture,
  confidence,
  selected = false,
  onClick,
  className = '',
}) => {
  const statusConfig = {
    'not scanned': {
      label: 'Not Scanned',
      icon: HelpCircle,
      borderColor: 'border-border',
      badgeClass: 'bg-app text-text-muted border-border',
      accentColor: 'text-text-muted',
    },
    'healthy': {
      label: 'Healthy',
      icon: CheckCircle2,
      borderColor: 'border-primary/50',
      badgeClass: 'bg-surface text-primary border-primary/40',
      accentColor: 'text-primary',
    },
    'needs water': {
      label: 'Needs Water',
      icon: Droplets,
      borderColor: 'border-water/50',
      badgeClass: 'bg-surface text-water border-water/40',
      accentColor: 'text-water',
    },
    'watered': {
      label: 'Watered',
      icon: Check,
      borderColor: 'border-water/50',
      badgeClass: 'bg-surface text-water border-water/40',
      accentColor: 'text-water',
    },
    'disease': {
      label: 'Disease Detected',
      icon: AlertTriangle,
      borderColor: 'border-danger/60',
      badgeClass: 'bg-surface text-danger border-danger/50 font-black',
      accentColor: 'text-danger',
    },
    'treated': {
      label: 'Treated',
      icon: Sparkles,
      borderColor: 'border-treated/50',
      badgeClass: 'bg-surface text-treated border-treated/40',
      accentColor: 'text-treated',
    },
    'unsure': {
      label: 'Unsure (Review)',
      icon: QuestionIcon,
      borderColor: 'border-unsure/50',
      badgeClass: 'bg-surface text-unsure border-unsure/40',
      accentColor: 'text-unsure',
    },
    'no plant found': {
      label: 'No Plant Found',
      icon: SearchX,
      borderColor: 'border-border',
      badgeClass: 'bg-app text-text-muted border-border',
      accentColor: 'text-text-muted',
    },
  }[status];

  const IconComponent = statusConfig.icon;

  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`min-h-[48px] select-none transition-all cursor-pointer ${
        statusConfig.borderColor
      } ${
        selected
          ? 'ring-4 ring-primary/30 border-primary scale-[1.01]'
          : 'hover:border-primary/40 active:scale-[0.99]'
      } ${className}`}
      padding="md"
    >
      {/* Header: Plant ID, Row/Col, Plant Type */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {id !== undefined && (
            <span className="text-xs font-black px-2 py-0.5 rounded-md bg-app border border-border text-text-main tabular-nums">
              #{id}
            </span>
          )}
          <span className="text-sm font-bold text-text-main">
            {plantName}
          </span>
        </div>

        {row !== undefined && col !== undefined && (
          <span className="text-xs font-bold text-text-muted tabular-nums">
            R{row}:C{col}
          </span>
        )}
      </div>

      {/* Primary Status Banner: ALWAYS Colour + Icon + Text */}
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 text-xs font-bold uppercase tracking-wider w-full justify-center ${statusConfig.badgeClass}`}
      >
        <IconComponent className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="truncate">{statusConfig.label}</span>
      </div>

      {/* Metrics Footer (Moisture / ML Confidence) */}
      {(moisture !== undefined || confidence !== undefined) && (
        <div className="mt-3 pt-2 border-t border-border flex items-center justify-between text-xs text-text-muted font-bold tabular-nums">
          {moisture !== undefined && (
            <span>Moisture: <strong className="text-text-main">{moisture}%</strong></span>
          )}
          {confidence !== undefined && (
            <span>Conf: <strong className="text-text-main">{(confidence * 100).toFixed(0)}%</strong></span>
          )}
        </div>
      )}
    </Card>
  );
};
