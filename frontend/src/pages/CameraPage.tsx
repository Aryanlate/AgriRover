import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Camera,
  CheckCircle2,
  FolderPlus,
  HelpCircle,
  Lightbulb,
  LightbulbOff,
  RefreshCw,
  SearchX,
  Sliders,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { useRoverStore } from '../store/roverStore';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { apiClient } from '../services/api/client';
import type { ScanResponse } from '../services/api/types';

type CameraTab = 'live' | 'check' | 'dataset';

const DATASET_FORM_KEY = 'agri_rover_dataset_form';
const DATASET_COUNTS_KEY = 'agri_rover_dataset_counts';

export const CameraPage: React.FC = () => {
  const { send } = useRoverStore();

  const [activeTab, setActiveTab] = useState<CameraTab>('live');
  const [cameraIp, setCameraIp] = useState('192.168.4.1');
  const [cameraOnline, setCameraOnline] = useState<boolean | null>(null);
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [ledOn, setLedOn] = useState(false);
  const [currentPose, setCurrentPose] = useState<'leaf' | 'stem'>('leaf');

  // CHECK TAB STATE
  const [checkPose, setCheckPose] = useState<'leaf' | 'stem'>('leaf');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lowConfidenceThreshold, setLowConfidenceThreshold] = useState(0.6);
  const [highConfidenceThreshold, setHighConfidenceThreshold] = useState(0.85);

  // Wrong prediction / hard example modal
  const [showHardExampleModal, setShowHardExampleModal] = useState(false);
  const [correctClass, setCorrectClass] = useState<string>('leaf_diseased');
  const [hardExampleNotes, setHardExampleNotes] = useState('');
  const [hardExampleSaved, setHardExampleSaved] = useState(false);

  // DATASET CAPTURE STATE
  const [plant, setPlant] = useState('tomato');
  const [plantId, setPlantId] = useState('T01');
  const [lighting, setLighting] = useState('sun');
  const [distanceCm, setDistanceCm] = useState(15);
  const [capturingClass, setCapturingClass] = useState<string | null>(null);
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);

  // Class photo counts
  const [classCounts, setClassCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(DATASET_COUNTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {
      leaf_healthy: 38,
      leaf_diseased: 45,
      stem_healthy: 22,
      stem_diseased: 19,
      background: 40,
    };
  });

  // Load camera IP and saved form values on mount
  useEffect(() => {
    apiClient
      .getSettings()
      .then((s) => {
        if (s.camera_ip) setCameraIp(s.camera_ip);
        if (s.low_confidence) setLowConfidenceThreshold(parseFloat(s.low_confidence) || 0.6);
        if (s.high_confidence) setHighConfidenceThreshold(parseFloat(s.high_confidence) || 0.85);
      })
      .catch(() => {});

    try {
      const savedForm = localStorage.getItem(DATASET_FORM_KEY);
      if (savedForm) {
        const parsed = JSON.parse(savedForm);
        if (parsed.plant) setPlant(parsed.plant);
        if (parsed.plantId) setPlantId(parsed.plantId);
        if (parsed.lighting) setLighting(parsed.lighting);
        if (parsed.distanceCm) setDistanceCm(parsed.distanceCm);
      }
    } catch {
      // ignore
    }

    checkCameraHealth();
  }, []);

  // Save form fields when updated
  useEffect(() => {
    try {
      localStorage.setItem(
        DATASET_FORM_KEY,
        JSON.stringify({ plant, plantId, lighting, distanceCm })
      );
    } catch {
      // ignore
    }
  }, [plant, plantId, lighting, distanceCm]);

  // Check camera connectivity
  const checkCameraHealth = async () => {
    setCheckingCamera(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      await fetch(`http://${cameraIp}/status`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors',
      });
      clearTimeout(timeoutId);
      setCameraOnline(true);
    } catch {
      setCameraOnline(false);
    } finally {
      setCheckingCamera(false);
    }
  };

  // Toggle LED
  const handleToggleLed = async () => {
    const nextState = !ledOn;
    setLedOn(nextState);
    try {
      await fetch(`http://${cameraIp}/led?on=${nextState ? 1 : 0}`, { mode: 'no-cors' });
    } catch {
      // ignore offline error in dev
    }
  };

  // Set camera pose
  const handleSetPose = (pose: 'leaf' | 'stem') => {
    setCurrentPose(pose);
    send({ c: 'camtilt', pose });
  };

  // CHECK TAB: Capture & Check
  const handleCaptureAndCheck = async () => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      // 1. First send camtilt for the chosen pose and wait for ack / settle
      send({ c: 'camtilt', pose: checkPose });
      await new Promise((r) => setTimeout(r, 400));

      // 2. Call POST /api/scan
      const res = await apiClient.scan(checkPose);
      setScanResult(res);
    } catch (err: any) {
      setScanError(err.message || 'Vision inspection failed. Check camera connection.');
    } finally {
      setScanning(false);
    }
  };

  // Dynamic state computation using confidence sliders
  const getEvaluatedState = () => {
    if (!scanResult) return null;
    const rawState = scanResult.result.state;
    const conf = scanResult.result.confidence;

    if (rawState === 'no_plant') {
      return {
        label: 'No Plant',
        type: 'no_plant' as const,
        color: 'text-text-muted bg-surface border-border',
        icon: SearchX,
        description: 'Background detected. No plant foliage found.',
      };
    }

    if (rawState === 'healthy') {
      return {
        label: 'Healthy',
        type: 'healthy' as const,
        color: 'text-primary bg-surface border-primary/40',
        icon: CheckCircle2,
        description: 'Foliage appears normal. No treatment recommended.',
      };
    }

    if (rawState === 'diseased') {
      if (conf >= highConfidenceThreshold) {
        return {
          label: 'Diseased',
          type: 'diseased' as const,
          color: 'text-danger bg-surface border-danger/40',
          icon: AlertOctagon,
          description: 'High disease probability. Treatment scheduled.',
        };
      } else if (conf >= lowConfidenceThreshold) {
        return {
          label: 'Unsure',
          type: 'unsure' as const,
          color: 'text-unsure bg-surface border-unsure/40',
          icon: AlertTriangle,
          description: 'Between confidence thresholds. Spraying strictly prohibited.',
        };
      } else {
        return {
          label: 'Unsure (Low Conf)',
          type: 'unsure' as const,
          color: 'text-unsure bg-surface border-unsure/40',
          icon: HelpCircle,
          description: 'Confidence below low threshold. Never spray unsure detections.',
        };
      }
    }

    return {
      label: rawState,
      type: 'unsure' as const,
      color: 'text-text-muted bg-surface border-border',
      icon: HelpCircle,
      description: 'Unknown state.',
    };
  };

  // Save hard example
  const handleSaveHardExample = async () => {
    if (!scanResult?.image_id) return;
    try {
      await apiClient.saveHardExample({
        correct_class: correctClass,
        image_id: scanResult.image_id,
        notes: hardExampleNotes || undefined,
      });
      setHardExampleSaved(true);
      setTimeout(() => {
        setHardExampleSaved(false);
        setShowHardExampleModal(false);
      }, 1500);
    } catch (e: any) {
      alert(`Failed to save hard example: ${e.message}`);
    }
  };

  // DATASET CAPTURE: Fast repeated shoot
  const handleDatasetCapture = async (labelClass: string) => {
    setCapturingClass(labelClass);
    setLastSavedNotice(null);

    // Determine part & pose
    let pose: 'leaf' | 'stem' | null = null;
    let part = 'leaf';
    if (labelClass.startsWith('leaf_')) {
      pose = 'leaf';
      part = 'leaf';
    } else if (labelClass.startsWith('stem_')) {
      pose = 'stem';
      part = 'stem';
    } else {
      part = 'none';
    }

    try {
      // If pose is required (leaf or stem), tilt camera and wait
      if (pose) {
        send({ c: 'camtilt', pose });
        await new Promise((r) => setTimeout(r, 400));
      }

      // Call API
      const res = await apiClient.captureDataset({
        plant,
        label_class: labelClass,
        plant_id: plantId,
        lighting,
        distance_cm: distanceCm,
        part,
      });

      // Update count
      const updatedCounts = {
        ...classCounts,
        [labelClass]: (classCounts[labelClass] || 0) + 1,
      };
      setClassCounts(updatedCounts);
      try {
        localStorage.setItem(DATASET_COUNTS_KEY, JSON.stringify(updatedCounts));
      } catch {
        // ignore
      }

      setLastSavedNotice(`Saved: ${res.filename}`);
    } catch (err: any) {
      alert(`Capture failed: ${err.message}`);
    } finally {
      setCapturingClass(null);
    }
  };

  const evaluated = getEvaluatedState();

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b-2 border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main">
            Vision & Camera Subsystem
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            ESP32-CAM optical inspection, real-time classifier verification, and ML dataset ingestion.
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="inline-flex rounded-2xl bg-surface border-2 border-border p-1 gap-1">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-colors min-h-[44px] ${
              activeTab === 'live'
                ? 'bg-primary text-surface shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-app'
            }`}
          >
            LIVE STREAM
          </button>
          <button
            onClick={() => setActiveTab('check')}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-colors min-h-[44px] ${
              activeTab === 'check'
                ? 'bg-primary text-surface shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-app'
            }`}
          >
            CAPTURE & CHECK
          </button>
          <button
            onClick={() => setActiveTab('dataset')}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-colors min-h-[44px] ${
              activeTab === 'dataset'
                ? 'bg-primary text-surface shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-app'
            }`}
          >
            DATASET INBOX
          </button>
        </div>
      </div>

      {/* Camera Offline Warning Banner */}
      {cameraOnline === false && (
        <div
          role="alert"
          className="p-4 rounded-2xl border-2 border-danger bg-danger/10 text-danger flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <WifiOff className="w-6 h-6 flex-shrink-0 animate-pulse" />
            <div>
              <span className="font-bold text-sm block">Camera Offline or Unreachable ({cameraIp})</span>
              <span className="text-xs text-text-muted">
                Ensure ESP32-CAM is powered, on the same Wi-Fi, and the camera IP matches your Settings.
              </span>
            </div>
          </div>
          <Button
            size="md"
            variant="secondary"
            onClick={checkCameraHealth}
            disabled={checkingCamera}
            className="text-xs px-3 min-h-[38px] border-danger/50 text-text-main"
          >
            {checkingCamera ? 'Checking...' : 'Retry Connection'}
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: LIVE STREAM & CONTROLS */}
      {/* ========================================================================= */}
      {activeTab === 'live' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Video Viewport */}
          <Card title="Live ESP32-CAM Video Stream" variant="default" className="p-6 lg:col-span-2">
            <div className="relative overflow-hidden rounded-2xl border-2 border-border bg-app aspect-video flex items-center justify-center">
              {cameraOnline ? (
                <img
                  src={`http://${cameraIp}/stream`}
                  alt="ESP32-CAM Live Stream"
                  className="w-full h-full object-cover"
                  onError={() => setCameraOnline(false)}
                />
              ) : (
                <EmptyState
                  icon={<Camera className="w-12 h-12 text-text-muted" />}
                  title="Stream Offline"
                  message={`Cannot connect to http://${cameraIp}/stream. Make sure the camera is connected or run in simulated mode.`}
                  actionLabel="Test Camera"
                  onAction={checkCameraHealth}
                />
              )}

              {/* Stream Overlay Status */}
              <div className="absolute top-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-surface/90 border border-border text-xs font-bold text-text-main backdrop-blur-xs">
                  IP: {cameraIp}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-surface/90 border border-border text-xs font-bold text-primary backdrop-blur-xs">
                  SVGA 800x600
                </span>
              </div>
            </div>
          </Card>

          {/* Quick Camera Rig Controls */}
          <Card title="Rig Illumination & Tilt" variant="default" className="p-6 space-y-5">
            <div>
              <h4 className="text-xs font-bold uppercase text-text-muted mb-2">High-Power LED Light</h4>
              <Button
                variant={ledOn ? 'primary' : 'secondary'}
                fullWidth
                onClick={handleToggleLed}
                icon={ledOn ? <Lightbulb className="w-5 h-5" /> : <LightbulbOff className="w-5 h-5" />}
              >
                {ledOn ? 'Illumination LED: ON' : 'Illumination LED: OFF'}
              </Button>
            </div>

            <div className="pt-4 border-t-2 border-border">
              <h4 className="text-xs font-bold uppercase text-text-muted mb-2">Camera Pose Servo Angle</h4>
              <div className="space-y-3">
                <Button
                  variant={currentPose === 'leaf' ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => handleSetPose('leaf')}
                  icon={<Camera className="w-5 h-5" />}
                >
                  Pose: Leaf (Upper Canopy)
                </Button>
                <Button
                  variant={currentPose === 'stem' ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => handleSetPose('stem')}
                  icon={<Camera className="w-5 h-5" />}
                >
                  Pose: Stem (Lower Ground)
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-border text-xs text-text-muted space-y-1">
              <div className="font-bold text-text-main">Pose Guidance:</div>
              <p>• <strong>Leaf Pose:</strong> Aims high to inspect foliage and leaves.</p>
              <p>• <strong>Stem Pose:</strong> Aims low to inspect main stem and soil collar.</p>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CAPTURE & CHECK WITH CONFIDENCE SLIDERS */}
      {/* ========================================================================= */}
      {activeTab === 'check' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="p-5 rounded-2xl bg-surface border-2 border-border flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black uppercase text-text-muted">Target Pose:</span>
              <div className="inline-flex rounded-xl bg-app border-2 border-border p-1 gap-1 text-xs font-bold">
                <button
                  onClick={() => setCheckPose('leaf')}
                  className={`px-3.5 py-1.5 rounded-lg transition-colors ${
                    checkPose === 'leaf' ? 'bg-primary text-surface shadow-xs' : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Leaf
                </button>
                <button
                  onClick={() => setCheckPose('stem')}
                  className={`px-3.5 py-1.5 rounded-lg transition-colors ${
                    checkPose === 'stem' ? 'bg-primary text-surface shadow-xs' : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Stem
                </button>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              disabled={scanning}
              onClick={handleCaptureAndCheck}
              icon={scanning ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            >
              {scanning ? 'Aligning & Scanning...' : `Capture & Check (${checkPose.toUpperCase()})`}
            </Button>
          </div>

          {scanError && (
            <div className="p-4 rounded-xl border-2 border-danger bg-danger/10 text-danger text-sm font-bold">
              {scanError}
            </div>
          )}

          {/* Photo & Result Badge View */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Captured Inspection Photo" variant="default" className="p-6">
              {scanResult?.image_path ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-2xl border-2 border-border bg-app aspect-video flex items-center justify-center">
                    <img
                      src={`http://localhost:8000${scanResult.image_path}`}
                      alt="Scanned crop inspection"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {scanResult.warning && (
                    <p className="text-xs text-warning font-semibold">{scanResult.warning}</p>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={<Camera className="w-12 h-12" />}
                  title="No Scan Captured"
                  message="Click 'Capture & Check' to align servo, fetch frame, and evaluate classifier."
                  actionLabel="Run Inspection Scan"
                  onAction={handleCaptureAndCheck}
                />
              )}
            </Card>

            {/* Inference Badge & Sliders Card */}
            <Card title="Inference Assessment & Confidence Calibration" variant="default" className="p-6 space-y-6">
              {evaluated ? (
                <div className="space-y-4">
                  {/* Result Badge */}
                  <div className={`p-4 rounded-2xl border-2 flex items-center justify-between ${evaluated.color}`}>
                    <div className="flex items-center gap-3">
                      <evaluated.icon className="w-7 h-7 flex-shrink-0" />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wider block opacity-75">
                          Classification State
                        </span>
                        <span className="text-xl font-black capitalize tracking-tight">
                          {evaluated.label}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold uppercase tracking-wider block opacity-75">Confidence</span>
                      <span className="text-2xl font-black">
                        {(scanResult!.result.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-text-muted font-medium bg-app p-3 rounded-xl border border-border">
                    {evaluated.description}
                  </p>

                  {/* Wrong Prediction Button */}
                  <div className="pt-2">
                    <Button
                      variant="secondary"
                      fullWidth
                      onClick={() => setShowHardExampleModal(true)}
                      icon={<AlertCircle className="w-4 h-4 text-warning" />}
                    >
                      Wrong Prediction? Flag Hard Example
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={<Sparkles className="w-10 h-10" />}
                  title="Awaiting Classification"
                  message="Capture an image to view 5-class evaluation and confidence threshold mapping."
                />
              )}

              {/* Confidence Sliders (display only) */}
              <div className="pt-4 border-t-2 border-border space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-text-muted flex items-center gap-1.5">
                    <Sliders className="w-4 h-4" /> Confidence Display Sliders
                  </h4>
                  <span className="text-[10px] text-text-muted font-bold">(Alters display status only)</span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-text-muted">High Confidence Threshold (Treat):</span>
                    <span className="text-text-main font-mono">{(highConfidenceThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={0.99}
                    step={0.01}
                    value={highConfidenceThreshold}
                    onChange={(e) => setHighConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer h-2 bg-border rounded-lg"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-text-muted">Low Confidence Threshold (Unsure Floor):</span>
                    <span className="text-text-main font-mono">{(lowConfidenceThreshold * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={0.8}
                    step={0.01}
                    value={lowConfidenceThreshold}
                    onChange={(e) => setLowConfidenceThreshold(parseFloat(e.target.value))}
                    className="w-full accent-primary cursor-pointer h-2 bg-border rounded-lg"
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Hard Example Correction Modal */}
          {showHardExampleModal && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-surface border-2 border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
                <h3 className="text-lg font-black text-text-main">Flag Misclassified Hard Example</h3>
                <p className="text-xs text-text-muted">
                  Saves this image into <code>ml/hard_examples/&lt;correct_class&gt;/</code> to benchmark and fine-tune classifier weights.
                </p>

                <div>
                  <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                    Select True Ground Truth Class:
                  </label>
                  <select
                    value={correctClass}
                    onChange={(e) => setCorrectClass(e.target.value)}
                    className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main text-sm font-bold"
                  >
                    <option value="leaf_healthy">Leaf Healthy</option>
                    <option value="leaf_diseased">Leaf Diseased</option>
                    <option value="stem_healthy">Stem Healthy</option>
                    <option value="stem_diseased">Stem Diseased</option>
                    <option value="background">Background (No plant)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-text-muted block mb-1">
                    Notes (Optional):
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Early blight lesion on lower leaf margin"
                    value={hardExampleNotes}
                    onChange={(e) => setHardExampleNotes(e.target.value)}
                    className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main text-xs"
                  />
                </div>

                {hardExampleSaved && (
                  <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Added to hard examples archive!
                  </p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setShowHardExampleModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={handleSaveHardExample} disabled={hardExampleSaved}>
                    Save Hard Example
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DATASET CAPTURE & CLASS INGESTION INBOX */}
      {/* ========================================================================= */}
      {activeTab === 'dataset' && (
        <div className="space-y-6">
          {/* Metadata Parameters Card */}
          <Card title="Dataset Metadata Ingestion Parameters" variant="default" className="p-6">
            <p className="text-xs text-text-muted mb-4">
              Parameters are remembered across shots to enable rapid training collection directly from the rover.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-text-muted block mb-1">Crop Species</label>
                <select
                  value={plant}
                  onChange={(e) => setPlant(e.target.value)}
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-sm"
                >
                  <option value="tomato">Tomato</option>
                  <option value="potato">Potato</option>
                  <option value="pepper">Pepper</option>
                  <option value="brinjal">Brinjal</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-text-muted block mb-1">Plant Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. T07"
                  value={plantId}
                  onChange={(e) => setPlantId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono font-bold text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-text-muted block mb-1">Lighting Condition</label>
                <select
                  value={lighting}
                  onChange={(e) => setLighting(e.target.value)}
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-bold text-sm"
                >
                  <option value="sun">Sun</option>
                  <option value="shade">Shade</option>
                  <option value="cloudy">Cloudy</option>
                  <option value="LED">LED Rig</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-text-muted block mb-1">Distance (cm)</label>
                <input
                  type="number"
                  min={5}
                  max={50}
                  value={distanceCm}
                  onChange={(e) => setDistanceCm(parseInt(e.target.value, 10) || 15)}
                  className="w-full p-2.5 rounded-xl border-2 border-border bg-app text-text-main font-mono font-bold text-sm"
                />
              </div>
            </div>

            {lastSavedNotice && (
              <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{lastSavedNotice}</span>
              </div>
            )}
          </Card>

          {/* Big Action Buttons (One per class) */}
          <div className="space-y-3">
            <h3 className="text-sm font-black uppercase text-text-muted tracking-wider">
              Single-Click Class Capture (Auto-Tilts Camera & Ingests to Inbox)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {[
                { id: 'leaf_healthy', label: 'Leaf Healthy', pose: 'Leaf', target: 150 },
                { id: 'leaf_diseased', label: 'Leaf Diseased', pose: 'Leaf', target: 150 },
                { id: 'stem_healthy', label: 'Stem Healthy', pose: 'Stem', target: 150 },
                { id: 'stem_diseased', label: 'Stem Diseased', pose: 'Stem', target: 150 },
                { id: 'background', label: 'Background', pose: 'None', target: 100 },
              ].map((item) => {
                const count = classCounts[item.id] || 0;
                const isUnder = count < item.target;
                const isProcessing = capturingClass === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleDatasetCapture(item.id)}
                    disabled={capturingClass !== null}
                    className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between min-h-[140px] focus:outline-none focus:ring-4 focus:ring-primary/20 active:scale-98 select-none ${
                      isProcessing
                        ? 'border-primary bg-primary/15 animate-pulse'
                        : 'border-border bg-surface hover:border-primary hover:bg-app shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-text-muted mb-1">
                        <span>{item.pose} Pose</span>
                        <FolderPlus className="w-4 h-4 text-text-muted" />
                      </div>
                      <div className="text-base font-black text-text-main">{item.label}</div>
                    </div>

                    <div className="pt-3 border-t border-border mt-3">
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span className={isUnder ? 'text-warning' : 'text-primary'}>
                          {count} / {item.target}
                        </span>
                        {isUnder && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-sans uppercase">
                            Under Target
                          </span>
                        )}
                      </div>
                      {/* Mini Progress */}
                      <div className="w-full bg-app h-1.5 rounded-full overflow-hidden mt-1.5 border border-border">
                        <div
                          className={`h-full rounded-full ${isUnder ? 'bg-warning' : 'bg-primary'}`}
                          style={{ width: `${Math.min(100, (count / item.target) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
