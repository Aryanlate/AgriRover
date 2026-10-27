import React from 'react';

export interface BigIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  variant?: 'primary' | 'surface' | 'danger' | 'warning' | 'water';
  size?: 'md' | 'lg' | 'xl';
}

export const BigIconButton: React.FC<BigIconButtonProps> = ({
  icon,
  label,
  sublabel,
  variant = 'surface',
  size = 'lg',
  className = '',
  disabled,
  ...props
}) => {
  const sizeStyles = {
    md: 'min-h-[52px] min-w-[52px] p-3 text-sm gap-1',
    lg: 'min-h-[68px] min-w-[68px] p-4 text-base gap-1.5',
    xl: 'min-h-[84px] min-w-[84px] p-5 text-lg gap-2',
  }[size];

  const variantStyles = {
    surface: 'bg-surface border-border text-text-main hover:bg-app active:bg-border active:scale-95',
    primary: 'bg-primary border-primary text-surface hover:opacity-90 active:scale-95 shadow-sm',
    danger: 'bg-danger border-danger text-surface hover:opacity-90 active:scale-95 shadow-sm font-black',
    warning: 'bg-warning border-warning text-surface hover:opacity-90 active:scale-95 shadow-sm',
    water: 'bg-water border-water text-surface hover:opacity-90 active:scale-95 shadow-sm',
  }[variant];

  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex flex-col items-center justify-center font-bold tracking-wide rounded-2xl border-2 select-none transition-all focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-40 disabled:pointer-events-none ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled}
      {...props}
    >
      <div className="flex-shrink-0" aria-hidden="true">
        {icon}
      </div>
      <span className="font-bold tracking-tight text-center leading-none mt-1">{label}</span>
      {sublabel && (
        <span className="text-[10px] font-semibold opacity-80 uppercase tracking-widest leading-none">
          {sublabel}
        </span>
      )}
    </button>
  );
};
