import React from 'react';
import { Check, X } from 'lucide-react';

export interface SwitchProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}) => {
  const switchId = id || `switch-${Math.random().toString(36).substring(2, 9)}`;

  return (
    <label
      htmlFor={switchId}
      className={`inline-flex items-center justify-between gap-4 select-none cursor-pointer min-h-[48px] p-2 rounded-xl transition-colors hover:bg-app/50 ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${className}`}
    >
      {(label || description) && (
        <div className="flex-1 min-w-0 pr-2">
          {label && (
            <div className="text-base font-bold text-text-main leading-snug">
              {label}
            </div>
          )}
          {description && (
            <div className="text-xs font-medium text-text-muted mt-0.5 leading-relaxed">
              {description}
            </div>
          )}
        </div>
      )}

      {/* Large Rugged Toggle Pill (min 48px touch target) */}
      <button
        type="button"
        role="switch"
        id={switchId}
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={`relative inline-flex items-center h-10 w-20 rounded-full border-2 transition-colors focus:outline-none focus:ring-4 focus:ring-primary/20 flex-shrink-0 ${
          checked
            ? 'bg-primary border-primary'
            : 'bg-surface border-border'
        }`}
      >
        {/* State label text inside track */}
        <span
          className={`absolute text-[11px] font-black tracking-wider transition-opacity select-none ${
            checked
              ? 'left-2.5 text-surface opacity-100'
              : 'right-2.5 text-text-muted opacity-100'
          }`}
          aria-hidden="true"
        >
          {checked ? 'ON' : 'OFF'}
        </span>

        {/* Sliding Thumb Button */}
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border-2 transition-transform shadow-md ${
            checked
              ? 'translate-x-[42px] bg-surface border-surface text-primary'
              : 'translate-x-0.5 bg-surface border-border text-text-muted'
          }`}
        >
          {checked ? (
            <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
          ) : (
            <X className="w-4 h-4 stroke-[3]" aria-hidden="true" />
          )}
        </span>
      </button>
    </label>
  );
};
