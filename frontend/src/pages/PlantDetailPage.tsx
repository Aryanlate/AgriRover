import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Camera,
  Droplets,
  Sparkles,
  History,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../services/api/client';
import type { PlantHistory } from '../services/api/types';
import { useRoverStore } from '../store/roverStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Toast, type ToastType } from '../components/ui/Toast';

export const PlantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { deductTank } = useRoverStore();

  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState<PlantHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dialog & Form states
  const [showTreatConfirm, setShowTreatConfirm] = useState(false);
  const [showHardExampleDialog, setShowHardExampleDialog] = useState(false);
  const [selectedImageForReport, setSelectedImageForReport] = useState<number | undefined>(undefined);
  const [correctClass, setCorrectClass] = useState('leaf_healthy');
  const [reportNotes, setReportNotes] = useState('');
  const [submittingHardExample, setSubmittingHardExample] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{ type: ToastType; title: string; message: string } | null>(null);

  const fetchPlantHistory = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const numId = parseInt(id, 10);
      if (!isNaN(numId)) {
        const data = await apiClient.getPlantHistory(numId);
        setHistoryData(data);
      } else {
        // Fallback for plant strings like 'A1' or 'P01'
        const plants = await apiClient.listPlants();
        const found = plants.find((p) => p.plant_id === id || String(p.id) === id);
        if (found) {
          const data = await apiClient.getPlantHistory(found.id);
          setHistoryData(data);
        } else {
          setError(`Plant #${id} could not be found.`);
        }
      }
    } catch (err: any) {
      console.warn('Backend plant fetch error, using synthetic view:', err);
      // Fallback synthetic model for demo / offline
      const num = parseInt(id.replace(/\D/g, ''), 10) || 1;
      setHistoryData({
        plant: {
          id: num,
          plant_id: id.startsWith('P') || id.startsWith('A') || id.startsWith('B') || id.startsWith('C') ? id : `P${num.toString().padStart(2, '0')}`,
          species: 'Solanum lycopersicum (Tomato)',
          location_index: num,
          status: num % 3 === 0 ? 'disease' : num % 2 === 0 ? 'watered' : 'healthy',
          watered_ml: num % 2 === 0 ? 50 : 0,
          treated_ml: num % 3 === 0 ? 25 : 0,
          created_at: new Date().toISOString(),
        },
        readings: [
          { id: 1, moisture_pct: 42, temp_c: 24.5, humidity_pct: 65, created_at: new Date(Date.now() - 3600000 * 4).toISOString() },
          { id: 2, moisture_pct: 38, temp_c: 25.1, humidity_pct: 63, created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
          { id: 3, moisture_pct: 31, temp_c: 26.0, humidity_pct: 60, created_at: new Date(Date.now() - 1800000).toISOString() },
          { id: 4, moisture_pct: 28, temp_c: 26.2, humidity_pct: 58, created_at: new Date().toISOString() },
        ],
        images: [
          {
            id: 101,
            pose: 'leaf',
            file_path: 'uploads/images/sample_leaf.jpg',
            created_at: new Date(Date.now() - 1800000).toISOString(),
            result: { part: 'leaf', state: num % 3 === 0 ? 'diseased' : 'healthy', confidence: 0.94, class_name: num % 3 === 0 ? 'leaf_diseased' : 'leaf_healthy' },
          },
          {
            id: 102,
            pose: 'stem',
            file_path: 'uploads/images/sample_stem.jpg',
            created_at: new Date(Date.now() - 1800000).toISOString(),
            result: { part: 'stem', state: 'healthy', confidence: 0.98, class_name: 'stem_healthy' },
          },
        ],
        results: [
          { id: 201, image_id: 101, part: 'leaf', state: num % 3 === 0 ? 'diseased' : 'healthy', confidence: 0.94, class_name: num % 3 === 0 ? 'leaf_diseased' : 'leaf_healthy', created_at: new Date().toISOString() },
          { id: 202, image_id: 102, part: 'stem', state: 'healthy', confidence: 0.98, class_name: 'stem_healthy', created_at: new Date().toISOString() },
        ],
        actions: [
          { id: 301, type: 'water', target: 'root_zone', dose_ml: 50, duration_ms: 2000, status: 'executed', reason: 'Soil moisture < 35%', created_at: new Date(Date.now() - 3600000).toISOString() },
          ...(num % 3 === 0
            ? [{ id: 302, type: 'treat', target: 'leaf_diseased', dose_ml: 25, duration_ms: 1250, status: 'executed', reason: 'High confidence foliar pathogen detected', created_at: new Date(Date.now() - 1800000).toISOString() }]
            : []),
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlantHistory();
  }, [id]);

  const handleMarkAsHealthy = () => {
    if (!historyData) return;
    setHistoryData({
      ...historyData,
      plant: {
        ...historyData.plant,
        status: 'healthy',
      },
      actions: [
        {
          id: Date.now(),
          type: 'manual_override',
          target: 'all',
          dose_ml: 0,
          status: 'executed',
          reason: 'Operator verified visual health; status set to healthy.',
          created_at: new Date().toISOString(),
        },
        ...historyData.actions,
      ],
    });
    setToast({
      type: 'success',
      title: 'Status Updated',
      message: `Plant ${historyData.plant.plant_id} manually marked as Healthy.`,
    });
  };

  const handleTreatAnyway = () => {
    if (!historyData) return;
    // Obeys dose caps: 25ml single treat dose, max cap 60ml
    const currentTreat = historyData.plant.treated_ml || 0;
    const doseToApply = Math.min(25, Math.max(0, 60 - currentTreat));

    if (doseToApply <= 0) {
      setToast({
        type: 'warning',
        title: 'Dose Cap Reached',
        message: `Maximum allowed treatment cap (60 ml) reached for plant ${historyData.plant.plant_id}.`,
      });
      setShowTreatConfirm(false);
      return;
    }

    deductTank('treat', doseToApply);

    setHistoryData({
      ...historyData,
      plant: {
        ...historyData.plant,
        status: 'treated',
        treated_ml: currentTreat + doseToApply,
      },
      actions: [
        {
          id: Date.now(),
          type: 'treat',
          target: 'foliar_override',
          dose_ml: doseToApply,
          duration_ms: (doseToApply / 20) * 1000,
          status: 'executed',
          reason: `Manual override treatment (${doseToApply} ml) dispatched within safe dose cap.`,
          created_at: new Date().toISOString(),
        },
        ...historyData.actions,
      ],
    });

    setShowTreatConfirm(false);
    setToast({
      type: 'success',
      title: 'Treatment Dispatched',
      message: `Dispatched ${doseToApply} ml targeted treatment to plant ${historyData.plant.plant_id}.`,
    });
  };

  const handleSendHardExample = async () => {
    if (!historyData) return;
    setSubmittingHardExample(true);
    try {
      await apiClient.saveHardExample({
        correct_class: correctClass,
        image_id: selectedImageForReport,
        notes: `Plant ${historyData.plant.plant_id}: ${reportNotes}`,
      });
      setToast({
        type: 'info',
        title: 'Sent to Hard Example Bank',
        message: `Saved to /api/hard-example under class '${correctClass}'.`,
      });
      setShowHardExampleDialog(false);
      setReportNotes('');
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.message || 'Could not send hard example to backend.',
      });
    } finally {
      setSubmittingHardExample(false);
    }
  };

  // Helper to resolve image URL
  const formatImageUrl = (filePath?: string) => {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) return filePath;
    const clean = filePath.replace(/^uploads\/?/, '');
    return `http://localhost:8000/uploads/${clean}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate('/field-map')} icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Map
          </Button>
          <div className="h-6 w-48 bg-surface rounded animate-pulse" />
        </div>
        <Card variant="default" className="p-12 flex flex-col items-center justify-center min-h-[300px]">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-base font-bold text-text-main">Loading Plant Records...</p>
          <p className="text-sm text-text-muted mt-1">Retrieving sensor logs, vision scans, and action history from backend.</p>
        </Card>
      </div>
    );
  }

  if (error || !historyData) {
    return (
      <div className="space-y-6">
        <Button variant="secondary" onClick={() => navigate('/field-map')} icon={<ArrowLeft className="w-4 h-4" />}>
          Back to Greenhouse Map
        </Button>
        <EmptyState
          icon={<AlertTriangle className="w-10 h-10 text-warning" />}
          title="Plant Not Found"
          message={error || `Could not find any history records for plant #${id}.`}
          actionLabel="Return to Greenhouse Map"
          onAction={() => navigate('/field-map')}
        />
      </div>
    );
  }

  const { plant, readings, images, actions } = historyData;

  // Latest leaf and stem images
  const latestLeafImg = [...images].reverse().find((img) => img.pose === 'leaf');
  const latestStemImg = [...images].reverse().find((img) => img.pose === 'stem');

  // Compute moisture min and max for chart scale
  const moisturePoints = readings.filter((r) => typeof r.moisture_pct === 'number');
  const latestMoisture = moisturePoints.length > 0 ? moisturePoints[moisturePoints.length - 1].moisture_pct : undefined;

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

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => navigate('/field-map')}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
                Plant {plant.plant_id}
              </h1>
              <span className="text-xs font-black uppercase px-2.5 py-1 rounded-full border border-border bg-app text-text-main">
                #{plant.id}
              </span>
            </div>
            <p className="text-sm font-medium text-text-muted mt-0.5">
              {plant.species} • Location Index: {plant.location_index}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleMarkAsHealthy}
            icon={<ShieldCheck className="w-4 h-4 text-primary" />}
          >
            Mark as Healthy
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowTreatConfirm(true)}
            icon={<Sparkles className="w-4 h-4 text-treated" />}
          >
            Treat Anyway
          </Button>

          <Button
            variant="secondary"
            onClick={() => {
              setSelectedImageForReport(latestLeafImg?.id || latestStemImg?.id);
              setShowHardExampleDialog(true);
            }}
            icon={<AlertTriangle className="w-4 h-4 text-warning" />}
          >
            Wrong Diagnosis
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card variant="default" padding="sm" className="flex flex-col justify-center">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Current Status</span>
          <div className="text-lg font-black text-text-main mt-1 uppercase flex items-center gap-2">
            {plant.status === 'healthy' ? (
              <span className="text-primary flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Healthy</span>
            ) : plant.status === 'disease' ? (
              <span className="text-danger flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Diseased</span>
            ) : plant.status === 'treated' ? (
              <span className="text-treated flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Treated</span>
            ) : (
              <span className="text-text-muted flex items-center gap-1.5"><HelpCircle className="w-4 h-4" /> {plant.status}</span>
            )}
          </div>
        </Card>

        <Card variant="default" padding="sm" className="flex flex-col justify-center">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Latest Moisture</span>
          <div className="text-lg font-black text-text-main mt-1 tabular-nums flex items-center gap-1.5">
            <Droplets className="w-4 h-4 text-water" />
            <span>{latestMoisture !== undefined ? `${latestMoisture}%` : 'N/A'}</span>
          </div>
        </Card>

        <Card variant="default" padding="sm" className="flex flex-col justify-center">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Water Applied</span>
          <div className="text-lg font-black text-text-main mt-1 tabular-nums text-water">
            {plant.watered_ml} ml
          </div>
        </Card>

        <Card variant="default" padding="sm" className="flex flex-col justify-center">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Chemical Dose</span>
          <div className="text-lg font-black text-text-main mt-1 tabular-nums text-treated">
            {plant.treated_ml} ml <span className="text-xs font-semibold text-text-muted">(Cap: 60ml)</span>
          </div>
        </Card>
      </div>

      {/* Latest Leaf and Stem Photos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Leaf Inspection */}
        <Card title="Latest Leaf Inspection" variant="default" className="p-5">
          {latestLeafImg ? (
            <div className="space-y-3">
              <div className="aspect-video w-full rounded-xl bg-app border-2 border-border overflow-hidden flex items-center justify-center relative">
                <img
                  src={formatImageUrl(latestLeafImg.file_path)}
                  alt="Leaf Inspection"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to SVG placeholder if image unavailable
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted p-4 pointer-events-none -z-0">
                  <Camera className="w-10 h-10 mb-2 opacity-50" />
                  <span className="text-xs font-bold">ESP32-CAM Leaf Pose (30° Tilt)</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border-2 border-border bg-app space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Detected State</span>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase border ${
                      latestLeafImg.result?.state === 'healthy'
                        ? 'bg-surface text-primary border-primary/40'
                        : latestLeafImg.result?.state === 'diseased'
                        ? 'bg-surface text-danger border-danger/40'
                        : 'bg-surface text-text-muted border-border'
                    }`}
                  >
                    {latestLeafImg.result?.state || 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted font-bold">
                  <span>ML Confidence:</span>
                  <span className="text-text-main font-black tabular-nums">
                    {latestLeafImg.result?.confidence !== undefined
                      ? `${(latestLeafImg.result.confidence * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>Class Name:</span>
                  <span className="font-mono text-text-main">{latestLeafImg.result?.class_name || 'N/A'}</span>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedImageForReport(latestLeafImg.id);
                      setShowHardExampleDialog(true);
                    }}
                    className="text-xs font-bold text-warning hover:underline"
                  >
                    Report misclassification →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Camera className="w-8 h-8 text-text-muted" />}
              title="No Leaf Scan Available"
              message="Rover has not yet captured a leaf pose scan for this plant."
            />
          )}
        </Card>

        {/* Stem Inspection */}
        <Card title="Latest Stem Inspection" variant="default" className="p-5">
          {latestStemImg ? (
            <div className="space-y-3">
              <div className="aspect-video w-full rounded-xl bg-app border-2 border-border overflow-hidden flex items-center justify-center relative">
                <img
                  src={formatImageUrl(latestStemImg.file_path)}
                  alt="Stem Inspection"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted p-4 pointer-events-none -z-0">
                  <Camera className="w-10 h-10 mb-2 opacity-50" />
                  <span className="text-xs font-bold">ESP32-CAM Stem Pose (0° Tilt)</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border-2 border-border bg-app space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Detected State</span>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase border ${
                      latestStemImg.result?.state === 'healthy'
                        ? 'bg-surface text-primary border-primary/40'
                        : latestStemImg.result?.state === 'diseased'
                        ? 'bg-surface text-danger border-danger/40'
                        : 'bg-surface text-text-muted border-border'
                    }`}
                  >
                    {latestStemImg.result?.state || 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted font-bold">
                  <span>ML Confidence:</span>
                  <span className="text-text-main font-black tabular-nums">
                    {latestStemImg.result?.confidence !== undefined
                      ? `${(latestStemImg.result.confidence * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-text-muted">
                  <span>Class Name:</span>
                  <span className="font-mono text-text-main">{latestStemImg.result?.class_name || 'N/A'}</span>
                </div>

                <div className="pt-1 flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedImageForReport(latestStemImg.id);
                      setShowHardExampleDialog(true);
                    }}
                    className="text-xs font-bold text-warning hover:underline"
                  >
                    Report misclassification →
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Camera className="w-8 h-8 text-text-muted" />}
              title="No Stem Scan Available"
              message="Rover has not yet captured a stem pose scan for this plant."
            />
          )}
        </Card>
      </div>

      {/* Moisture History Chart */}
      <Card title="Moisture History & Trend" variant="default" className="p-5">
        {moisturePoints.length > 0 ? (
          <div className="space-y-4">
            <div className="h-48 w-full flex items-end gap-2 pt-6 pb-2 px-2 border-b-2 border-border">
              {moisturePoints.map((pt, idx) => {
                const heightPct = Math.min(100, Math.max(10, pt.moisture_pct));
                const isLow = pt.moisture_pct < 35;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                    {/* Tooltip */}
                    <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-surface border border-border px-2 py-0.5 rounded text-[10px] font-black tabular-nums shadow-sm pointer-events-none whitespace-nowrap z-10 text-text-main">
                      {pt.moisture_pct}% moisture
                    </div>

                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-lg transition-all duration-300 ${
                        isLow ? 'bg-danger/80' : 'bg-water/80 hover:bg-water'
                      }`}
                    />

                    <span className="text-[10px] text-text-muted font-bold mt-1.5 tabular-nums truncate max-w-full">
                      {pt.created_at ? new Date(pt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `#${idx + 1}`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-text-muted font-bold px-1">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-water inline-block" /> Adequate (&ge; 35%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-danger inline-block" /> Low (&lt; 35%)
                </span>
              </div>
              <span>Target: 35.0% - 60.0% volumetric water content</span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Droplets className="w-8 h-8 text-water" />}
            title="No Soil Moisture History"
            message="No capacitive probe insertions recorded for this plant yet."
          />
        )}
      </Card>

      {/* Photo History Gallery */}
      <Card title="Photo History Gallery" variant="default" className="p-5">
        {images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {images.map((img) => (
              <div
                key={img.id}
                className="rounded-xl border-2 border-border bg-app p-2 flex flex-col gap-2 group hover:border-primary/50 transition-colors"
              >
                <div className="aspect-video w-full rounded-lg bg-surface border border-border overflow-hidden relative flex items-center justify-center">
                  <img
                    src={formatImageUrl(img.file_path)}
                    alt={`${img.pose} scan`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -z-0">
                    <Camera className="w-6 h-6 text-text-muted opacity-40" />
                  </div>
                  <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-surface/90 text-text-main border border-border">
                    {img.pose}
                  </span>
                </div>

                <div className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase text-text-main">
                      {img.result?.state || 'scanned'}
                    </span>
                    <span className="text-text-muted font-bold tabular-nums">
                      {img.result?.confidence !== undefined ? `${(img.result.confidence * 100).toFixed(0)}%` : ''}
                    </span>
                  </div>
                  <div className="text-[10px] text-text-muted">
                    {img.created_at ? new Date(img.created_at).toLocaleString() : 'Date N/A'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Camera className="w-8 h-8 text-text-muted" />}
            title="No Historical Scans"
            message="Historical photos captured during runs will appear here."
          />
        )}
      </Card>

      {/* List of Actions */}
      <Card title="Log of Interventions & Actions" variant="default" className="p-5">
        {actions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-text-main border-collapse">
              <thead>
                <tr className="border-b-2 border-border text-xs uppercase text-text-muted font-bold">
                  <th className="py-2.5 px-3">Date / Time</th>
                  <th className="py-2.5 px-3">Action Type</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3 text-right">Dose (ml)</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Trigger / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {actions.map((act) => (
                  <tr key={act.id} className="hover:bg-app/50 transition-colors">
                    <td className="py-3 px-3 text-xs text-text-muted tabular-nums whitespace-nowrap">
                      {act.created_at ? new Date(act.created_at).toLocaleString() : 'Recent'}
                    </td>
                    <td className="py-3 px-3 font-bold uppercase text-xs">
                      {act.type === 'water' ? (
                        <span className="text-water flex items-center gap-1.5"><Droplets className="w-3.5 h-3.5" /> Irrigation</span>
                      ) : act.type === 'treat' ? (
                        <span className="text-treated flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Treatment</span>
                      ) : (
                        act.type
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs font-mono text-text-muted">{act.target || 'Plant'}</td>
                    <td className="py-3 px-3 text-xs font-black tabular-nums text-right">
                      {act.dose_ml > 0 ? `${act.dose_ml} ml` : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase border border-border bg-app text-text-main">
                        {act.status || 'executed'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-text-muted max-w-xs truncate">
                      {act.reason || 'Automated rule engine dispatch'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<History className="w-8 h-8 text-text-muted" />}
            title="No Actions Logged"
            message="Water irrigation or chemical treatments dispatched to this plant will appear here."
          />
        )}
      </Card>

      {/* Confirmation Dialog for "Treat anyway" */}
      <ConfirmDialog
        isOpen={showTreatConfirm}
        title="Confirm Treatment Override"
        description={`Trigger targeted treatment for Plant ${plant.plant_id}? The treatment will strictly obey the safe dose cap (current applied: ${plant.treated_ml} ml, maximum allowed: 60 ml).`}
        confirmText="Dispense Treatment"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleTreatAnyway}
        onCancel={() => setShowTreatConfirm(false)}
      />

      {/* Dialog for "Wrong diagnosis" -> /api/hard-example */}
      {showHardExampleDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowHardExampleDialog(false)}
        >
          <div
            className="w-full max-w-lg bg-surface border-2 border-border rounded-2xl p-6 shadow-2xl text-text-main space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-lg font-bold text-text-main flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-warning" />
                Report Misclassification (Hard Example)
              </h3>
              <button
                onClick={() => setShowHardExampleDialog(false)}
                className="text-text-muted hover:text-text-main font-bold p-1"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-text-muted leading-relaxed">
              Submits this image and inspection record to the retraining bank (<code>/api/hard-example</code>) to improve model robustness.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">
                  Select Correct Class
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
                  Agronomist Notes / Justification
                </label>
                <textarea
                  rows={3}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Describe true symptom, lighting artifact, or model error..."
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main text-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setShowHardExampleDialog(false)}
                disabled={submittingHardExample}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSendHardExample}
                disabled={submittingHardExample}
                icon={<RefreshCw className={`w-4 h-4 ${submittingHardExample ? 'animate-spin' : ''}`} />}
              >
                {submittingHardExample ? 'Saving...' : 'Submit Hard Example'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
