import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <Card
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-10 ${className}`}
      variant="default"
    >
      <div className="p-4 rounded-2xl bg-app border-2 border-border text-text-muted mb-4 flex items-center justify-center">
        {icon || <HelpCircle className="w-10 h-10" aria-hidden="true" />}
      </div>

      <h3 className="text-xl font-bold tracking-tight text-text-main max-w-sm">
        {title}
      </h3>

      <p className="mt-2 text-base text-text-muted max-w-md leading-relaxed">
        {message}
      </p>

      {actionLabel && onAction && (
        <div className="mt-6">
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </Card>
  );
};
