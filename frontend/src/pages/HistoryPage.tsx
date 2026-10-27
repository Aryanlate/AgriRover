import React, { useEffect, useState } from 'react';
import { History, Download, RefreshCw } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { apiClient } from '../services/api/client';
import type { Run } from '../services/api/types';

export const HistoryPage: React.FC = () => {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRuns = async () => {
    setLoading(true);
    try {
      const data = await apiClient.listRuns();
      setRuns(data);
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Mission History & Logs
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Historical records of past agricultural runs and CSV export capabilities.
          </p>
        </div>

        <Button variant="secondary" onClick={fetchRuns} icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}>
          Refresh
        </Button>
      </div>

      <Card variant="default" className="p-6">
        {runs.length > 0 ? (
          <div className="divide-y divide-border">
            {runs.map((run) => (
              <div key={run.id} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                <div>
                  <h4 className="font-bold text-text-main text-base">{run.name}</h4>
                  <div className="text-xs text-text-muted flex gap-4 mt-1">
                    <span>Status: <strong className="uppercase">{run.status}</strong></span>
                    <span>Water: {run.total_water_ml} ml</span>
                    <span>Treatment: {run.total_treatment_ml} ml</span>
                  </div>
                </div>

                <a
                  href={apiClient.getRunExportCsvUrl(run.id)}
                  download
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 border-border bg-surface text-text-main hover:bg-app min-h-[44px]"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </a>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<History className="w-10 h-10" />}
            title="No Past Missions Recorded"
            message="Past mission logs, water dispensed, and treatments will appear here."
          />
        )}
      </Card>
    </div>
  );
};
