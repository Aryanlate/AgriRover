import React from 'react';
import { Bell, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export const AlertsPage: React.FC = () => {
  const { alerts, ackAlert, clearAlerts } = useRoverStore();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Rover Alerts & Faults
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Safety events, hardware fault notifications, and telemetry warnings.
          </p>
        </div>

        {alerts.length > 0 && (
          <Button variant="secondary" onClick={clearAlerts} icon={<Trash2 className="w-4 h-4" />}>
            Clear All Alerts
          </Button>
        )}
      </div>

      <Card variant="default" className="p-6">
        {alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((al) => (
              <div
                key={al.id}
                className={`p-4 rounded-xl border-2 flex items-center justify-between gap-4 transition-colors ${
                  al.acknowledged
                    ? 'border-border bg-app opacity-75'
                    : 'border-danger/60 bg-danger/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-surface border border-border text-danger flex-shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-text-main">{al.code}</span>
                      <span className="text-[11px] text-text-muted">
                        {al.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-text-main mt-0.5">{al.message}</p>
                  </div>
                </div>

                {!al.acknowledged && (
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => ackAlert(al.id)}
                    className="text-xs px-3 py-1.5 min-h-[38px]"
                    icon={<CheckCircle className="w-4 h-4" />}
                  >
                    Acknowledge
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Bell className="w-10 h-10" />}
            title="All Clear — No Active Alerts"
            message="No active warnings or faults reported by the rover firmware."
          />
        )}
      </Card>
    </div>
  );
};
