import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  // Enforce touch target minimum 48px
  const baseStyles = 'inline-flex items-center justify-center font-bold tracking-wide rounded-xl border-2 select-none min-h-[48px] px-5 py-2.5 transition-colors focus:outline-none focus:ring-4 focus:ring-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

  const sizeStyles = {
    md: 'min-h-[48px] text-base gap-2 px-5',
    lg: 'min-h-[56px] text-lg gap-2.5 px-6',
  }[size];

  const variantStyles = {
    primary: 'bg-primary border-primary text-surface hover:opacity-95 shadow-sm',
    secondary: 'bg-surface border-border text-text-main hover:bg-app',
    danger: 'bg-danger border-danger text-surface hover:opacity-95 shadow-sm',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};
