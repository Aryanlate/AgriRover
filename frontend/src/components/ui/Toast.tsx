import React from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'info',
  title,
  message,
  onClose,
  className = '',
}) => {
  const config = {
    info: {
      border: 'border-water',
      badgeBg: 'bg-water/10 text-water border-water/30',
      icon: Info,
      defaultTitle: 'Information',
    },
    success: {
      border: 'border-primary',
      badgeBg: 'bg-primary/10 text-primary border-primary/30',
      icon: CheckCircle2,
      defaultTitle: 'Success',
    },
    warning: {
      border: 'border-warning',
      badgeBg: 'bg-warning/10 text-warning border-warning/30',
      icon: AlertTriangle,
      defaultTitle: 'Warning',
    },
    error: {
      border: 'border-danger',
      badgeBg: 'bg-danger/10 text-danger border-danger/30',
      icon: AlertCircle,
      defaultTitle: 'Error Alert',
    },
  }[type];

  const IconComponent = config.icon;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 p-4 bg-surface border-2 rounded-2xl shadow-lg max-w-md w-full ${config.border} ${className}`}
    >
      <div className={`p-2 rounded-xl border flex-shrink-0 ${config.badgeBg}`}>
        <IconComponent className="w-5 h-5" aria-hidden="true" />
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        <h4 className="text-sm font-bold tracking-tight text-text-main">
          {title || config.defaultTitle}
        </h4>
        <p className="mt-1 text-sm text-text-muted leading-relaxed">
          {message}
        </p>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          className="p-2 text-text-muted hover:text-text-main rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};
