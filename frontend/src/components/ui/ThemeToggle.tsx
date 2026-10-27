import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import type { Theme } from '../../context/ThemeContext';

export interface ThemeToggleProps {
  className?: string;
  showLabels?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showLabels = true,
}) => {
  const { theme, setTheme } = useTheme();

  const options: { id: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'auto', label: 'Auto', icon: Laptop },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme selector"
      className={`inline-flex items-center p-1 rounded-2xl bg-surface border-2 border-border gap-1 ${className}`}
    >
      {options.map((opt) => {
        const IconComponent = opt.icon;
        const isActive = theme === opt.id;

        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`${opt.label} mode`}
            onClick={() => setTheme(opt.id)}
            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold select-none min-h-[48px] transition-all focus:outline-none focus:ring-2 focus:ring-primary/40 ${
              isActive
                ? 'bg-primary text-surface shadow-sm'
                : 'text-text-muted hover:text-text-main hover:bg-app'
            }`}
          >
            <IconComponent className="w-4 h-4 flex-shrink-0" />
            {showLabels && <span>{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
};
