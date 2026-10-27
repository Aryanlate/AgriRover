import React, { useState } from 'react';
import { Camera, RefreshCw, Sparkles } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { apiClient } from '../services/api/client';
import type { ScanResponse } from '../services/api/types';

export const CameraPage: React.FC = () => {
  const [pose, setPose] = useState<'leaf' | 'stem'>('leaf');
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCaptureAndClassify = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.scan(pose);
      setScanResult(res);
    } catch (err: any) {
      setError(err.message || 'Capture failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Camera & Vision Inspection
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Real-time capture via ESP32-CAM and 5-class crop health inference.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl bg-app border-2 border-border p-1 gap-1 text-xs font-bold">
            <button
              onClick={() => setPose('leaf')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                pose === 'leaf' ? 'bg-primary text-surface shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              Leaf Pose
            </button>
            <button
              onClick={() => setPose('stem')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                pose === 'stem' ? 'bg-primary text-surface shadow-xs' : 'text-text-muted hover:text-text-main'
              }`}
            >
              Stem Pose
            </button>
          </div>

          <Button
            variant="primary"
            onClick={handleCaptureAndClassify}
            disabled={loading}
            icon={loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          >
            {loading ? 'Processing...' : 'Capture & Inspect'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-danger/15 border-2 border-danger text-danger text-sm font-bold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Frame Viewer */}
        <Card title="Live Camera Frame" variant="default" className="p-6">
          {scanResult?.image_path ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border-2 border-border bg-app aspect-video flex items-center justify-center">
                <img
                  src={`http://localhost:8000${scanResult.image_path}`}
                  alt="Scanned plant crop"
                  className="w-full h-full object-cover"
                />
              </div>
              {scanResult.warning && (
                <p className="text-xs text-warning font-semibold">{scanResult.warning}</p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Camera className="w-10 h-10" />}
              title="No Image Captured"
              message="Select pose (leaf or stem) and click 'Capture & Inspect' to acquire an image."
              actionLabel="Capture Now"
              onAction={handleCaptureAndClassify}
            />
          )}
        </Card>

        {/* Inference Results */}
        <Card title="Vision Classifier Assessment" variant="default" className="p-6">
          {scanResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border-2 border-border bg-app flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase text-text-muted block">Classification</span>
                  <span className="text-xl font-black text-text-main capitalize">
                    {scanResult.result.class_name.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold uppercase text-text-muted block">Confidence</span>
                  <span className="text-xl font-black text-primary">
                    {(scanResult.result.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase text-text-muted mb-2">Class Probabilities (Renormalised)</h4>
                <div className="space-y-2">
                  {Object.entries(scanResult.result.renormalised_probabilities).map(([cls, prob]) => (
                    <div key={cls} className="flex items-center justify-between text-xs font-medium">
                      <span className="text-text-main capitalize">{cls.replace('_', ' ')}</span>
                      <span className="text-text-muted">{(prob * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<Sparkles className="w-10 h-10" />}
              title="Awaiting Classification"
              message="Classifier will evaluate the image for healthy, diseased, or background classes."
            />
          )}
        </Card>
      </div>
    </div>
  );
};
