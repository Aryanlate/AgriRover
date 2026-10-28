import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Trash2,
  Save,
  ShieldCheck,
  AlertOctagon,
  Image as ImageIcon,
  X,
  Lock,
  ArrowRight,
  Info,
  Check,
} from 'lucide-react';

import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Toast } from '../components/ui/Toast';
import { apiClient } from '../services/api/client';
import type { AnalyzeResponse, CheckItem } from '../services/api/types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const CheckPage: React.FC = () => {
  // Image & Camera States
  const [selectedFile, setSelectedFile] = useState<File | Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);

  // Desktop Camera Stream States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Hidden Input Refs
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);

  // System & Backend Status
  const [isBackendOffline, setIsBackendOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // History / Recent Checks
  const [recentChecks, setRecentChecks] = useState<CheckItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [checkToDelete, setCheckToDelete] = useState<CheckItem | null>(null);
  const [isSavingHistory, setIsSavingHistory] = useState(false);
  const [hasSavedCurrent, setHasSavedCurrent] = useState(false);

  // Wrong Result Modal
  const [showWrongResultModal, setShowWrongResultModal] = useState(false);
  const [selectedCorrectClass, setSelectedCorrectClass] = useState<'leaf_healthy' | 'leaf_diseased'>('leaf_healthy');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Device detection
  const isMobile = typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ('ontouchstart' in window && window.innerWidth < 768)
  );

  // 1. Initial health check and history fetch
  const checkBackendHealth = useCallback(async () => {
    try {
      await apiClient.checkHealth();
      setIsBackendOffline(false);
    } catch {
      setIsBackendOffline(true);
    }
  }, []);

  const fetchRecentChecks = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const data = await apiClient.listChecks();
      setRecentChecks(data);
      setIsBackendOffline(false);
    } catch {
      // If checks fail, backend may be offline
      setIsBackendOffline(true);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
    fetchRecentChecks();
  }, [checkBackendHealth, fetchRecentChecks]);

  // Clean up preview URL and camera stream on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      stopCameraStream();
    };
  }, [previewUrl]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // 2. Camera Handling (Desktop getUserMedia)
  const startDesktopCamera = async () => {
    setCameraError(null);
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API (getUserMedia) is not supported in this browser environment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      // Give React a tick to mount video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch((err) => {
            console.error('Video play error:', err);
          });
        }
      }, 50);
    } catch (err: any) {
      console.warn('Camera permission error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please grant camera permission in your browser or select an image from the gallery.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this computer. Please connect a webcam or upload from gallery.');
      } else {
        setCameraError(`Camera error: ${err.message || 'Unable to open camera.'}`);
      }
      setIsCameraActive(false);
    }
  };

  const handleCaptureFromCamera = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
          handleSelectFile(file);
          stopCameraStream();
        }
      },
      'image/jpeg',
      0.92
    );
  };

  // 3. File Selection & Validation
  const validateFile = (file: File | Blob): string | null => {
    if (file.size > MAX_IMAGE_BYTES) {
      return `Image size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds 10 MB limit.`;
    }
    const type = file.type.toLowerCase();
    if (type && !ALLOWED_MIME_TYPES.includes(type)) {
      return `Unsupported file format. Please upload a JPG, JPEG, PNG, or WebP photo.`;
    }
    return null;
  };

  const handleSelectFile = (file: File | Blob) => {
    setErrorMessage(null);
    setCameraError(null);

    const validationErr = validateFile(file);
    if (validationErr) {
      setErrorMessage(validationErr);
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setAnalysisResult(null);
    setHasSavedCurrent(false);
  };

  // Drag and Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleSelectFile(file);
    }
  };

  // 4. Run Analysis
  const handleAnalyze = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const result = await apiClient.analyze(selectedFile, false);
      setAnalysisResult(result);
      setIsBackendOffline(false);
    } catch (err: any) {
      console.error('Analysis failed:', err);
      const msg = err.message || 'Analysis request failed.';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setIsBackendOffline(true);
      }
      setErrorMessage(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 5. Save to History
  const handleSaveToHistory = async () => {
    if (!selectedFile || isSavingHistory || hasSavedCurrent) return;

    setIsSavingHistory(true);
    try {
      // Re-run analyze with save=true to persist directly to SQLite checks table
      const res = await apiClient.analyze(selectedFile, true);
      setAnalysisResult(res);
      setHasSavedCurrent(true);
      setToastMessage('Analysis saved to history.');
      await fetchRecentChecks();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save to history.');
    } finally {
      setIsSavingHistory(false);
    }
  };

  // 6. Delete Check
  const handleDeleteCheckConfirm = async () => {
    if (!checkToDelete) return;
    try {
      await apiClient.deleteCheck(checkToDelete.id);
      setRecentChecks((prev) => prev.filter((c) => c.id !== checkToDelete.id));
      setToastMessage('Check removed from history.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete check.');
    } finally {
      setCheckToDelete(null);
    }
  };

  // 7. Wrong Result / Hard Example Feedback
  const handleSubmitWrongResult = async () => {
    if (!selectedFile && !analysisResult?.check_id) return;
    setIsSubmittingFeedback(true);
    try {
      await apiClient.saveHardExample({
        correct_class: selectedCorrectClass,
        file: selectedFile || undefined,
        notes: `User reported correction: Predicted ${analysisResult?.verdict} (${analysisResult?.confidence}), but corrected to ${selectedCorrectClass}.`,
      });
      setShowWrongResultModal(false);
      setToastMessage(`Feedback received. Saved to hard examples as ${selectedCorrectClass}.`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit correction.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // 8. Reset / Check another
  const handleCheckAnother = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setErrorMessage(null);
    setHasSavedCurrent(false);
    stopCameraStream();
  };

  // Helper values for verdict styling
  const isHealthy = analysisResult?.verdict === 'healthy';
  const isDiseased = analysisResult?.verdict === 'diseased';
  const isUnsure = analysisResult?.verdict === 'unsure';
  const isLowConfidence = analysisResult?.low_confidence || analysisResult?.is_low_confidence;

  const healthyProb = (analysisResult?.probabilities?.leaf_healthy ?? 0) * 100;
  const diseasedProb = (analysisResult?.probabilities?.leaf_diseased ?? 0) * 100;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="info"
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Header & Local Privacy Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main flex items-center gap-2.5">
            <CheckCircle2 className="w-8 h-8 text-primary" />
            <span>Check it</span>
          </h1>
          <p className="text-sm font-medium text-text-muted mt-1">
            Instant leaf health diagnostic using on-device machine vision. No rover or Bluetooth connection required.
          </p>
        </div>

        {/* Privacy Note Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface border-2 border-border text-xs font-bold text-text-muted shadow-xs max-w-fit">
          <Lock className="w-4 h-4 text-primary flex-shrink-0" />
          <span>Processed on this computer only</span>
        </div>
      </div>

      {/* Offline Alert State */}
      {isBackendOffline && (
        <Card className="border-2 border-danger/60 bg-danger/10 text-danger p-4">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-6 h-6 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-bold text-base">Backend Offline</h3>
              <p className="text-sm mt-0.5 opacity-90">
                Cannot connect to the Agri-Rover FastAPI backend at http://localhost:8000. Start the backend with{' '}
                <code className="font-mono bg-surface/50 px-1.5 py-0.5 rounded">python start.py</code> and retry.
              </p>
              <div className="mt-3">
                <Button
                  size="md"
                  variant="secondary"
                  onClick={checkBackendHealth}
                  className="text-xs min-h-[38px] px-3 border-danger/40"
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Retry Connection
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Invalid File / Error Alert */}
      {errorMessage && (
        <Card className="border-2 border-danger/60 bg-danger/10 text-danger p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm font-semibold">{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 rounded-lg hover:bg-surface/30 min-h-[32px] min-w-[32px] flex items-center justify-center"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Camera Permission Denied Alert */}
      {cameraError && (
        <Card className="border-2 border-warning/60 bg-warning/10 text-warning p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm">Camera Notice</h4>
                <p className="text-sm opacity-90 mt-0.5">{cameraError}</p>
              </div>
            </div>
            <button
              onClick={() => setCameraError(null)}
              className="p-1 rounded-lg hover:bg-surface/30 min-h-[32px] min-w-[32px] flex items-center justify-center text-text-main"
              aria-label="Dismiss camera alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </Card>
      )}

      {/* SECTION 1: PHOTO INPUT & CAMERA STREAM */}
      <Card className="overflow-hidden border-2 border-border shadow-sm p-4 sm:p-6 bg-surface">
        {/* Hidden File Inputs */}
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleSelectFile(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />

        <input
          ref={mobileCameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleSelectFile(e.target.files[0]);
              e.target.value = '';
            }
          }}
        />

        {/* Live Desktop Camera View */}
        {isCameraActive ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-lg aspect-[4/3] bg-black rounded-2xl overflow-hidden border-2 border-border flex items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-danger text-surface px-2.5 py-1 rounded-full text-xs font-black tracking-wider flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-surface" />
                LIVE CAMERA
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <Button
                variant="primary"
                size="lg"
                onClick={handleCaptureFromCamera}
                icon={<Camera className="w-5 h-5" />}
                className="min-w-[180px]"
              >
                Capture Photo
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={stopCameraStream}
                icon={<X className="w-4 h-4" />}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : previewUrl ? (
          /* Image Selected / Captured Preview */
          <div className="flex flex-col items-center gap-4">
            <div className="relative max-w-md w-full aspect-[4/3] bg-app rounded-2xl overflow-hidden border-2 border-border flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Selected leaf preview"
                className="w-full h-full object-contain"
              />
              <button
                onClick={handleCheckAnother}
                className="absolute top-3 right-3 p-2 rounded-xl bg-surface/90 text-text-main hover:bg-surface border border-border shadow-sm min-h-[40px] min-w-[40px] flex items-center justify-center"
                aria-label="Remove image"
                title="Remove image"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photo Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-3 w-full">
              <Button
                variant="primary"
                size="lg"
                onClick={handleAnalyze}
                disabled={isAnalyzing || isBackendOffline}
                className="min-w-[200px]"
                icon={isAnalyzing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              >
                {isAnalyzing ? 'Analyzing Leaf...' : 'Analyze Photo'}
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  if (isMobile) {
                    mobileCameraInputRef.current?.click();
                  } else {
                    startDesktopCamera();
                  }
                }}
                icon={<Camera className="w-4 h-4" />}
              >
                Retake
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => galleryInputRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
              >
                Choose Different
              </Button>
            </div>
          </div>
        ) : (
          /* Empty Drag & Drop Area */
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-colors flex flex-col items-center justify-center min-h-[260px] ${
              isDragOver
                ? 'border-primary bg-primary/10'
                : 'border-border bg-app/50 hover:border-primary/50'
            }`}
          >
            <div className="p-4 rounded-2xl bg-surface border-2 border-border text-primary shadow-xs mb-3">
              <ImageIcon className="w-10 h-10" />
            </div>

            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-text-main">
              Upload or capture a leaf photo
            </h3>
            <p className="text-sm text-text-muted mt-1 max-w-sm">
              Drag and drop an image here, or use the buttons below. Accepts JPG, PNG, or WebP up to 10 MB.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              <Button
                variant="primary"
                size="md"
                onClick={() => galleryInputRef.current?.click()}
                icon={<Upload className="w-4 h-4" />}
              >
                Upload from gallery
              </Button>

              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  if (isMobile) {
                    mobileCameraInputRef.current?.click();
                  } else {
                    startDesktopCamera();
                  }
                }}
                icon={<Camera className="w-4 h-4" />}
              >
                Take a photo
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* SECTION 2: RESULT CARD (Shown when model analysis completes) */}
      {analysisResult && (
        <Card className="border-2 border-border p-5 sm:p-7 space-y-6 bg-surface shadow-sm">
          {/* Mock Banner if applicable */}
          {analysisResult.model_mode === 'mock' && (
            <div
              role="alert"
              className="bg-warning/20 border-2 border-warning text-text-main px-4 py-3 rounded-xl flex items-center gap-3 font-bold text-sm"
            >
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
              <span>Mock model: this result is fake (simulation mode)</span>
            </div>
          )}

          {/* Verdict Header Badge & Confidence */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b-2 border-border">
            <div className="flex items-center gap-3.5">
              {/* Large Badge with icon and text */}
              {isHealthy && (
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border-2 border-primary bg-primary/15 text-primary font-black text-xl sm:text-2xl tracking-wide shadow-xs">
                  <CheckCircle2 className="w-7 h-7 flex-shrink-0" />
                  <span>Healthy</span>
                </div>
              )}

              {isDiseased && (
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border-2 border-danger bg-danger/15 text-danger font-black text-xl sm:text-2xl tracking-wide shadow-xs">
                  <AlertTriangle className="w-7 h-7 flex-shrink-0" />
                  <span>Diseased</span>
                </div>
              )}

              {isUnsure && (
                <div className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border-2 border-unsure bg-unsure/15 text-unsure font-black text-xl sm:text-2xl tracking-wide shadow-xs">
                  <HelpCircle className="w-7 h-7 flex-shrink-0" />
                  <span>Unsure</span>
                </div>
              )}

              {isLowConfidence && !isUnsure && (
                <span className="px-3 py-1 rounded-xl bg-app border-2 border-border text-xs font-bold text-text-muted uppercase tracking-wider">
                  Low Confidence
                </span>
              )}
            </div>

            {/* Overall Confidence */}
            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">Model Confidence</span>
              <span className="text-2xl sm:text-3xl font-black text-text-main">
                {(analysisResult.confidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Probability Bars */}
          <div className="space-y-3">
            <div className="text-xs font-black uppercase tracking-wider text-text-muted">
              Class Probabilities
            </div>

            {/* Healthy Probability Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-text-main flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                  Healthy (leaf_healthy)
                </span>
                <span className="text-text-muted">{healthyProb.toFixed(1)}%</span>
              </div>
              <div className="h-3 w-full bg-app rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.max(healthyProb, 1)}%` }}
                />
              </div>
            </div>

            {/* Diseased Probability Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-text-main flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />
                  Diseased (leaf_diseased)
                </span>
                <span className="text-text-muted">{diseasedProb.toFixed(1)}%</span>
              </div>
              <div className="h-3 w-full bg-app rounded-full overflow-hidden border border-border">
                <div
                  className="h-full bg-danger transition-all duration-300"
                  style={{ width: `${Math.max(diseasedProb, 1)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Section: What this means */}
          <div className="p-4 rounded-xl bg-app border-2 border-border space-y-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">
              What this means
            </h4>
            <p className="text-sm font-medium text-text-main leading-relaxed">
              {analysisResult.explanation}
            </p>
          </div>

          {/* Section: Would the rover spray? */}
          <div className="p-4 rounded-xl bg-app border-2 border-border space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">
                Would the rover spray?
              </h4>
              <span
                className={`px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${
                  analysisResult.spray_preview.would_spray
                    ? 'bg-danger text-surface'
                    : 'bg-surface border border-border text-text-muted'
                }`}
              >
                {analysisResult.spray_preview.would_spray ? 'Yes' : 'No'}
              </span>
            </div>
            <p className="text-sm font-medium text-text-main leading-relaxed">
              {analysisResult.spray_preview.reason}
            </p>
          </div>

          {/* Section: Photo quality */}
          <div className="p-4 rounded-xl bg-app border-2 border-border space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">
              Photo quality
            </h4>

            {analysisResult.image_quality.warnings.length === 0 ? (
              <div className="flex items-center gap-2 text-sm font-bold text-primary">
                <Check className="w-4 h-4" />
                <span>Photo looks fine</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {analysisResult.image_quality.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-warning font-semibold">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 border-t border-border flex flex-wrap gap-4 text-xs font-bold text-text-muted">
              <span>Resolution: {analysisResult.image_quality.width} × {analysisResult.image_quality.height} px</span>
              <span>Blur Score: {analysisResult.image_quality.blur}</span>
              <span>Brightness: {analysisResult.image_quality.brightness} / 255</span>
            </div>
          </div>

          {/* Section: Next steps */}
          <div className="p-4 rounded-xl bg-app border-2 border-border space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-text-muted">
              Next steps
            </h4>
            <ul className="text-sm text-text-main space-y-1.5 font-medium">
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>Retake the photo in good lighting if the image was blurry or dim.</span>
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>Check several leaves across the canopy to confirm overall plant condition.</span>
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span>Consult a local agricultural extension specialist before applying any chemical treatment.</span>
              </li>
            </ul>

            {/* Confirmed treatment if present */}
            {analysisResult.treatment ? (
              <div className="mt-3 p-3 rounded-lg bg-surface border border-border">
                <span className="text-xs font-black uppercase text-treated tracking-wider block">
                  Confirmed Treatment Prescribed:
                </span>
                <div className="text-sm font-bold text-text-main mt-0.5">
                  {analysisResult.treatment.treatment || 'Approved biological spray'}
                </div>
                {analysisResult.treatment.dose_ml && (
                  <div className="text-xs text-text-muted mt-0.5">
                    Recommended dose: {analysisResult.treatment.dose_ml} mL
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Section: About this result */}
          <div className="p-4 rounded-xl bg-app/60 border border-border flex items-start gap-3 text-xs text-text-muted leading-relaxed">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-text-muted" />
            <div>
              <span className="font-bold text-text-main block mb-0.5">About this result:</span>
              The model only knows healthy or diseased, cannot name the disease or show where it is, was trained on public photos, and can give a wrong answer for something that is not a leaf.
            </div>
          </div>

          {/* Actions: Check Another, Wrong Result, Save to History */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t-2 border-border">
            <Button
              variant="secondary"
              size="md"
              onClick={handleCheckAnother}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              Check another
            </Button>

            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowWrongResultModal(true)}
                icon={<HelpCircle className="w-4 h-4" />}
              >
                Wrong result
              </Button>

              <Button
                variant={hasSavedCurrent ? 'secondary' : 'primary'}
                size="md"
                disabled={isSavingHistory || hasSavedCurrent}
                onClick={handleSaveToHistory}
                icon={hasSavedCurrent ? <Check className="w-4 h-4 text-primary" /> : <Save className="w-4 h-4" />}
              >
                {hasSavedCurrent ? 'Saved' : isSavingHistory ? 'Saving...' : 'Save to history'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 3: RECENT CHECKS LIST */}
      <Card className="border-2 border-border p-5 sm:p-6 bg-surface shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black tracking-tight text-text-main">
              Recent Checks
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-app border border-border text-xs font-bold text-text-muted">
              {recentChecks.length}
            </span>
          </div>

          <Button
            size="md"
            variant="secondary"
            onClick={fetchRecentChecks}
            disabled={isLoadingHistory}
            className="text-xs min-h-[38px] px-3"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>

        {recentChecks.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="w-8 h-8 text-text-muted" />}
            title="No checks saved yet"
            message="Diagnose an image and click 'Save to history' to store it here for comparison."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {recentChecks.map((chk) => {
              const chkHealthy = chk.verdict.toLowerCase().includes('healthy');
              const chkDiseased = chk.verdict.toLowerCase().includes('diseased');
              const chkLowConf = chk.low_confidence;

              return (
                <div
                  key={chk.id}
                  className="flex items-center gap-3.5 p-3 rounded-xl bg-app border-2 border-border hover:border-primary/40 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-lg bg-surface border border-border overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {chk.image_path ? (
                      <img
                        src={`http://localhost:8000${chk.image_path}`}
                        alt={`Check #${chk.id}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-text-muted" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-black tracking-wide uppercase ${
                          chkHealthy
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : chkDiseased
                            ? 'bg-danger/20 text-danger border border-danger/40'
                            : 'bg-unsure/20 text-unsure border border-unsure/40'
                        }`}
                      >
                        {chkHealthy ? 'Healthy' : chkDiseased ? 'Diseased' : 'Unsure'}
                      </span>
                      {chkLowConf && (
                        <span className="text-[10px] text-text-muted font-bold">
                          (Low Conf)
                        </span>
                      )}
                    </div>

                    <div className="text-xs font-bold text-text-main mt-1">
                      Confidence: {(chk.confidence * 100).toFixed(1)}%
                    </div>

                    <div className="text-[11px] text-text-muted truncate">
                      {new Date(chk.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>

                  {/* Delete Button */}
                  <button
                    onClick={() => setCheckToDelete(chk)}
                    className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-surface border border-transparent focus:outline-none min-h-[40px] min-w-[40px] flex items-center justify-center flex-shrink-0"
                    aria-label={`Delete check #${chk.id}`}
                    title="Delete check"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(checkToDelete)}
        title="Delete Saved Check?"
        description={`Remove saved check #${checkToDelete?.id} (${checkToDelete?.verdict}) from history? Associated image file will also be deleted.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={handleDeleteCheckConfirm}
        onCancel={() => setCheckToDelete(null)}
      />

      {/* Wrong Result / Hard Example Feedback Modal */}
      {showWrongResultModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowWrongResultModal(false)}
        >
          <div
            className="w-full max-w-md bg-surface border-2 border-border rounded-2xl p-6 shadow-2xl text-text-main space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold tracking-tight">Report Incorrect Result</h3>
              <button
                onClick={() => setShowWrongResultModal(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-main min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-text-muted leading-relaxed">
              Help retrain and improve the model. What was the correct ground truth condition for this leaf?
            </p>

            <div className="space-y-2">
              <label
                className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
                  selectedCorrectClass === 'leaf_healthy'
                    ? 'border-primary bg-primary/10 text-text-main font-bold'
                    : 'border-border bg-app hover:border-border text-text-muted'
                }`}
                onClick={() => setSelectedCorrectClass('leaf_healthy')}
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span>The leaf is actually HEALTHY</span>
                </div>
                <input
                  type="radio"
                  name="correct_class"
                  value="leaf_healthy"
                  checked={selectedCorrectClass === 'leaf_healthy'}
                  onChange={() => setSelectedCorrectClass('leaf_healthy')}
                  className="accent-primary"
                />
              </label>

              <label
                className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-colors ${
                  selectedCorrectClass === 'leaf_diseased'
                    ? 'border-danger bg-danger/10 text-text-main font-bold'
                    : 'border-border bg-app hover:border-border text-text-muted'
                }`}
                onClick={() => setSelectedCorrectClass('leaf_diseased')}
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-danger" />
                  <span>The leaf is actually DISEASED</span>
                </div>
                <input
                  type="radio"
                  name="correct_class"
                  value="leaf_diseased"
                  checked={selectedCorrectClass === 'leaf_diseased'}
                  onChange={() => setSelectedCorrectClass('leaf_diseased')}
                  className="accent-danger"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowWrongResultModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled={isSubmittingFeedback}
                onClick={handleSubmitWrongResult}
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit Correction'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

