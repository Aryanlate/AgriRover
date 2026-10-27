import React from 'react';
import { CheckSquare, Filter } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';

export const ResultsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Vision & Treatment Results
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Detailed inspection classification records, disease detections, and pump action logs.
          </p>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" icon={<Filter className="w-4 h-4" />}>
            Filter By Status
          </Button>
        </div>
      </div>

      <Card variant="default" className="p-6">
        <EmptyState
          icon={<CheckSquare className="w-10 h-10" />}
          title="No Inspection Results Yet"
          message="Results will populate dynamically as the rover conducts leaf and stem scans during missions."
        />
      </Card>
    </div>
  );
};
