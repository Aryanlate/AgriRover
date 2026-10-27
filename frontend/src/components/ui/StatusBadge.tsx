import React from 'react';
import { WifiOff, CheckCircle2, Play, Pause, AlertOctagon } from 'lucide-react';

export type SystemStatus = 'disconnected' | 'ready' | 'running' | 'paused' | 'fault';

export interface StatusBadgeProps {
  status: SystemStatus;
  customText?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  customText,
  size = 'md',
  className = '',
}) => {
  const config = {
    disconnected: {
      text: customText || 'Disconnected',
      icon: WifiOff,
      colors: 'bg-surface text-text-muted border-border',
      iconColor: 'text-text-muted',
    },
    ready: {
      text: customText || 'Ready',
      icon: CheckCircle2,
      colors: 'bg-surface text-primary border-primary/40',
      iconColor: 'text-primary',
    },
    running: {
      text: customText || 'Running',
      icon: Play,
      colors: 'bg-surface text-water border-water/40',
      iconColor: 'text-water',
    },
    paused: {
      text: customText || 'Paused',
      icon: Pause,
      colors: 'bg-surface text-warning border-warning/40',
      iconColor: 'text-warning',
    },
    fault: {
      text: customText || 'Fault',
      icon: AlertOctagon,
      colors: 'bg-surface text-danger border-danger/40 font-black',
      iconColor: 'text-danger',
    },
  }[status];

  const IconComponent = config.icon;

  const sizeClasses = {
    sm: 'px-2.5 py-1 text-xs gap-1.5 min-h-[32px]',
    md: 'px-3.5 py-1.5 text-sm gap-2 min-h-[38px]',
    lg: 'px-4 py-2 text-base gap-2.5 min-h-[48px]',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <div
      role="status"
      className={`inline-flex items-center justify-center rounded-xl border-2 font-bold uppercase tracking-wide select-none ${config.colors} ${sizeClasses} ${className}`}
    >
      <IconComponent className={`${iconSizes} ${config.iconColor} flex-shrink-0`} aria-hidden="true" />
      <span>{config.text}</span>
    </div>
  );
};
