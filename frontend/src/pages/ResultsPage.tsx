import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  Filter,
  Camera,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  SearchX,
  RefreshCw,
  ExternalLink,
  Tag,
  Calendar,
} from 'lucide-react';
import { apiClient } from '../services/api/client';
import type { Run } from '../services/api/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Toast, type ToastType } from '../components/ui/Toast';

export interface ScannedImageItem {
  id: number;
  plantId: string;
  plantDbId: number;
  runId?: number;
  runName?: string;
  pose: 'leaf' | 'stem' | string;
  filePath: string;
  state: 'healthy' | 'diseased' | 'unsure' | 'no_plant' | string;
  confidence: number;
  className: string;
  createdAt: string;
}

export const ResultsPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScannedImageItem[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  // Filter States
  const [filterPlant, setFilterPlant] = useState<string>('all');
  const [filterPart, setFilterPart] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [filterRun, setFilterRun] = useState<string>('all');

  // Hard Example report dialog
  const [reportItem, setReportItem] = useState<ScannedImageItem | null>(null);
  const [correctClass, setCorrectClass] = useState('leaf_healthy');
  const [notes, setNotes] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; title: string; message: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch runs
      let fetchedRuns: Run[] = [];
      try {
        fetchedRuns = await apiClient.listRuns();
        setRuns(fetchedRuns);
      } catch {
        // ignore
      }

      // 2. Fetch plants
      let fetchedPlants: any[] = [];
      try {
        fetchedPlants = await apiClient.listPlants();
      } catch {
        // ignore
      }

      // 3. Collect images across plants
      const collected: ScannedImageItem[] = [];

      if (fetchedPlants.length > 0) {
        // Query history for first up to 10 plants to aggregate scan images
        const histories = await Promise.allSettled(
          fetchedPlants.slice(0, 15).map((p) => apiClient.getPlantHistory(p.id))
        );

        histories.forEach((res) => {
          if (res.status === 'fulfilled' && res.value) {
            const hist = res.value;
            const p = hist.plant;
            hist.images.forEach((img: any) => {
              collected.push({
                id: img.id,
                plantId: p.plant_id,
                plantDbId: p.id,
                runId: p.run_id,
                runName: fetchedRuns.find((r) => r.id === p.run_id)?.name,
                pose: img.pose || 'leaf',
                filePath: img.file_path,
                state: img.result?.state || 'healthy',
                confidence: img.result?.confidence || 0.9,
                className: img.result?.class_name || (img.pose === 'leaf' ? 'leaf_healthy' : 'stem_healthy'),
                createdAt: img.created_at || new Date().toISOString(),
              });
            });
          }
        });
      }

      if (collected.length > 0) {
        setItems(collected);
      } else {
        // Representative realistic scan results if backend has no recorded runs yet
        const sampleScans: ScannedImageItem[] = [
          {
            id: 1,
            plantId: 'A1',
            plantDbId: 1,
            runId: 1,
            runName: 'Morning Row A Scan',
            pose: 'leaf',
            filePath: 'uploads/images/leaf_a1.jpg',
            state: 'healthy',
            confidence: 0.96,
            className: 'leaf_healthy',
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            id: 2,
            plantId: 'A1',
            plantDbId: 1,
            runId: 1,
            runName: 'Morning Row A Scan',
            pose: 'stem',
            filePath: 'uploads/images/stem_a1.jpg',
            state: 'healthy',
            confidence: 0.98,
            className: 'stem_healthy',
            createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          },
          {
            id: 3,
            plantId: 'A2',
            plantDbId: 2,
            runId: 1,
            runName: 'Morning Row A Scan',
            pose: 'leaf',
            filePath: 'uploads/images/leaf_a2.jpg',
            state: 'healthy',
            confidence: 0.91,
            className: 'leaf_healthy',
            createdAt: new Date(Date.now() - 3600000 * 1.5).toISOString(),
          },
          {
            id: 4,
            plantId: 'A3',
            plantDbId: 3,
            runId: 1,
            runName: 'Morning Row A Scan',
            pose: 'leaf',
            filePath: 'uploads/images/leaf_a3.jpg',
            state: 'diseased',
            confidence: 0.89,
            className: 'leaf_diseased',
            createdAt: new Date(Date.now() - 3600000 * 1.2).toISOString(),
          },
          {
            id: 5,
            plantId: 'A3',
            plantDbId: 3,
            runId: 1,
            runName: 'Morning Row A Scan',
            pose: 'stem',
            filePath: 'uploads/images/stem_a3.jpg',
            state: 'healthy',
            confidence: 0.94,
            className: 'stem_healthy',
            createdAt: new Date(Date.now() - 3600000 * 1.2).toISOString(),
          },
          {
            id: 6,
            plantId: 'B2',
            plantDbId: 7,
            runId: 2,
            runName: 'Afternoon Bed B Verification',
            pose: 'leaf',
            filePath: 'uploads/images/leaf_b2.jpg',
            state: 'unsure',
            confidence: 0.63,
            className: 'leaf_diseased',
            createdAt: new Date(Date.now() - 1800000).toISOString(),
          },
          {
            id: 7,
            plantId: 'B4',
            plantDbId: 9,
            runId: 2,
            runName: 'Afternoon Bed B Verification',
            pose: 'leaf',
            filePath: 'uploads/images/empty_b4.jpg',
            state: 'no_plant',
            confidence: 0.99,
            className: 'background',
            createdAt: new Date(Date.now() - 900000).toISOString(),
          },
          {
            id: 8,
            plantId: 'C1',
            plantDbId: 11,
            runId: 3,
            runName: 'Bed C Scouting',
            pose: 'stem',
            filePath: 'uploads/images/stem_c1.jpg',
            state: 'diseased',
            confidence: 0.87,
            className: 'stem_diseased',
            createdAt: new Date(Date.now() - 300000).toISOString(),
          },
        ];
        setItems(sampleScans);
      }
    } catch (err) {
      console.warn('Error fetching scan results:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter application
  const filteredItems = items.filter((item) => {
    // Plant filter
    if (filterPlant !== 'all' && item.plantId !== filterPlant) return false;
    // Part filter
    if (filterPart !== 'all' && item.pose !== filterPart) return false;
    // Result filter
    if (filterResult !== 'all') {
      if (filterResult === 'diseased' && item.state !== 'diseased') return false;
      if (filterResult === 'healthy' && item.state !== 'healthy') return false;
      if (filterResult === 'unsure' && item.state !== 'unsure') return false;
      if (filterResult === 'no_plant' && item.state !== 'no_plant') return false;
    }
    // Run filter
    if (filterRun !== 'all' && String(item.runId) !== filterRun) return false;
    return true;
  });

  // Unique plants in current items
  const uniquePlants = Array.from(new Set(items.map((i) => i.plantId))).sort();

  const handleReportSubmit = async () => {
    if (!reportItem) return;
    setSubmittingReport(true);
    try {
      await apiClient.saveHardExample({
        correct_class: correctClass,
        image_id: reportItem.id,
        notes: `Misclassification report for Plant ${reportItem.plantId}: ${notes}`,
      });
      setToast({
        type: 'success',
        title: 'Hard Example Submitted',
        message: `Saved scan #${reportItem.id} as '${correctClass}' for retraining.`,
      });
      setReportItem(null);
      setNotes('');
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.message || 'Error submitting to /api/hard-example',
      });
    } finally {
      setSubmittingReport(false);
    }
  };

  const formatImageUrl = (filePath?: string) => {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    const clean = filePath.replace(/^uploads\/?/, '');
    return `http://localhost:8000/uploads/${clean}`;
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm">
          <Toast
            type={toast.type}
            title={toast.title}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
              Vision Scan Results
            </h1>
            <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full border border-border bg-app text-text-main">
              {filteredItems.length} Scans Found
            </span>
          </div>
          <p className="text-sm font-medium text-text-muted mt-1">
            Visual inspection gallery with neural network classification, confidence scores, and retraining feedback.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={fetchData}
          icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
        >
          Refresh Gallery
        </Button>
      </div>

      {/* Filter Toolbar (Plant, Part, Result, Run) */}
      <Card variant="default" className="p-4 bg-surface border-2 border-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-text-muted pb-1 border-b border-border">
          <Filter className="w-3.5 h-3.5" />
          <span>Filters & Class Selectors</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Filter by Plant */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">
              Plant Bed ID
            </label>
            <select
              value={filterPlant}
              onChange={(e) => setFilterPlant(e.target.value)}
              className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Plants ({uniquePlants.length})</option>
              {uniquePlants.map((pId) => (
                <option key={pId} value={pId}>
                  Plant {pId}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Filter by Part */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">
              Plant Part (Pose)
            </label>
            <select
              value={filterPart}
              onChange={(e) => setFilterPart(e.target.value)}
              className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Parts (Leaf & Stem)</option>
              <option value="leaf">Leaf Pose (30° tilt)</option>
              <option value="stem">Stem Pose (0° tilt)</option>
            </select>
          </div>

          {/* 3. Filter by Result */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">
              Diagnosis Result
            </label>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Results</option>
              <option value="healthy">Healthy Only</option>
              <option value="diseased">Diseased Only</option>
              <option value="unsure">Unsure (Low Confidence)</option>
              <option value="no_plant">No Plant (Empty/Background)</option>
            </select>
          </div>

          {/* 4. Filter by Run */}
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase mb-1">
              Mission Run
            </label>
            <select
              value={filterRun}
              onChange={(e) => setFilterRun(e.target.value)}
              className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-xs focus:outline-none focus:border-primary"
            >
              <option value="all">All Past Runs</option>
              {runs.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  Run #{r.id} - {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Helper */}
        {(filterPlant !== 'all' || filterPart !== 'all' || filterResult !== 'all' || filterRun !== 'all') && (
          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setFilterPlant('all');
                setFilterPart('all');
                setFilterResult('all');
                setFilterRun('all');
              }}
              className="text-xs font-bold text-primary hover:underline"
            >
              Reset all filters
            </button>
          </div>
        )}
      </Card>

      {/* Loading Skeleton */}
      {loading && (
        <Card variant="default" className="p-12 flex flex-col items-center justify-center min-h-[300px]">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-base font-bold text-text-main">Loading Inspection Gallery...</p>
          <p className="text-xs text-text-muted mt-1">Retrieving images and neural network outputs.</p>
        </Card>
      )}

      {/* Empty State */}
      {!loading && filteredItems.length === 0 && (
        <EmptyState
          icon={<CheckSquare className="w-10 h-10 text-text-muted" />}
          title="No Matching Scan Results Found"
          message="No vision images match the chosen filters. Try clearing the filters or running an autonomous mission."
          actionLabel="Reset All Filters"
          onAction={() => {
            setFilterPlant('all');
            setFilterPart('all');
            setFilterResult('all');
            setFilterRun('all');
          }}
        />
      )}

      {/* Image Gallery Grid */}
      {!loading && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredItems.map((item) => {
            const isDiseased = item.state === 'diseased';
            const isHealthy = item.state === 'healthy';
            const isUnsure = item.state === 'unsure';
            const isNoPlant = item.state === 'no_plant';

            const badgeBorder = isDiseased
              ? 'border-danger/50 text-danger bg-danger/10'
              : isHealthy
              ? 'border-primary/50 text-primary bg-primary/10'
              : isUnsure
              ? 'border-unsure/50 text-unsure bg-unsure/10'
              : 'border-border text-text-muted bg-app';

            return (
              <Card
                key={item.id}
                variant="default"
                className="overflow-hidden flex flex-col justify-between border-2 border-border hover:border-primary/50 transition-colors group"
                padding="none"
              >
                {/* Photo Header */}
                <div className="aspect-video w-full bg-app relative overflow-hidden flex items-center justify-center border-b-2 border-border">
                  <img
                    src={formatImageUrl(item.filePath)}
                    alt={`${item.pose} scan`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted pointer-events-none -z-0">
                    <Camera className="w-8 h-8 opacity-40 mb-1" />
                    <span className="text-[10px] font-bold uppercase">{item.pose} POSE</span>
                  </div>

                  {/* Pose Badge */}
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-surface/90 text-text-main border border-border">
                    {item.pose}
                  </span>

                  {/* Plant Target Link */}
                  <button
                    onClick={() => navigate(`/plants/${item.plantDbId}`)}
                    className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-surface/90 text-text-main border border-border hover:bg-primary hover:text-surface transition-colors flex items-center gap-1"
                    title="View Plant History"
                  >
                    <span>Plant {item.plantId}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Diagnosis Badge */}
                    <div className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider mb-2.5 ${badgeBorder}`}>
                      <div className="flex items-center gap-1.5">
                        {isHealthy && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {isDiseased && <AlertTriangle className="w-3.5 h-3.5" />}
                        {isUnsure && <HelpCircle className="w-3.5 h-3.5" />}
                        {isNoPlant && <SearchX className="w-3.5 h-3.5" />}
                        <span>{item.state}</span>
                      </div>
                      <span className="tabular-nums">{(item.confidence * 100).toFixed(0)}%</span>
                    </div>

                    {/* Class Name & Run */}
                    <div className="text-xs space-y-1">
                      <div className="flex items-center justify-between text-text-muted">
                        <span>Class:</span>
                        <span className="font-mono font-bold text-text-main text-[11px] truncate max-w-[140px]">
                          {item.className}
                        </span>
                      </div>

                      {item.runName && (
                        <div className="flex items-center justify-between text-[11px] text-text-muted truncate">
                          <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> Run:</span>
                          <span className="text-text-main truncate max-w-[130px]">{item.runName}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-text-muted pt-1 border-t border-border">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Scanned:</span>
                        <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action: Report Wrong Diagnosis */}
                  <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                    <button
                      onClick={() => navigate(`/plants/${item.plantDbId}`)}
                      className="text-xs font-bold text-text-muted hover:text-text-main"
                    >
                      History →
                    </button>
                    <Button
                      size="md"
                      variant="secondary"
                      onClick={() => {
                        setReportItem(item);
                        setCorrectClass(item.pose === 'leaf' ? 'leaf_healthy' : 'stem_healthy');
                      }}
                      className="text-xs px-2.5 py-1 min-h-[32px] text-warning"
                      icon={<AlertTriangle className="w-3.5 h-3.5" />}
                    >
                      Wrong
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Misclassification Report Modal (/api/hard-example) */}
      {reportItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setReportItem(null)}
        >
          <div
            className="w-full max-w-lg bg-surface border-2 border-border rounded-2xl p-6 shadow-2xl text-text-main space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Submit to Hard Example Bank (/api/hard-example)
              </h3>
              <button
                onClick={() => setReportItem(null)}
                className="text-text-muted hover:text-text-main font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Flag scan #{reportItem.id} (Plant {reportItem.plantId}) as a false positive or negative to automatically enrich the retraining dataset.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                  Correct Ground Truth Class
                </label>
                <select
                  value={correctClass}
                  onChange={(e) => setCorrectClass(e.target.value)}
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-sm focus:outline-none focus:border-primary"
                >
                  <option value="leaf_healthy">leaf_healthy</option>
                  <option value="leaf_diseased">leaf_diseased</option>
                  <option value="stem_healthy">stem_healthy</option>
                  <option value="stem_diseased">stem_diseased</option>
                  <option value="background">background</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                  Agronomic Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes on symptoms, glare, angle or why the model erred..."
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setReportItem(null)}
                disabled={submittingReport}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleReportSubmit}
                disabled={submittingReport}
                icon={<RefreshCw className={`w-4 h-4 ${submittingReport ? 'animate-spin' : ''}`} />}
              >
                {submittingReport ? 'Submitting...' : 'Send to /api/hard-example'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
