/**
 * Backend API Types (http://localhost:8000)
 */

export interface PredictResult {
  part: string;
  state: 'healthy' | 'diseased' | string;
  confidence: number;
  class_name: string;
  raw_probabilities: Record<string, number>;
  renormalised_probabilities: Record<string, number>;
}

export interface ScanResponse {
  ok: boolean;
  image_id?: number;
  image_path?: string;
  result: PredictResult;
  warning?: string;
}

export interface DecideAction {
  type: string;
  part?: string;
  target?: string;
  treatment?: string;
  severity?: string;
  dose_ml: number;
  duration_ms?: number;
}

export interface SkippedAction {
  type: string;
  part?: string;
  reason: string;
}

export interface DecideResponse {
  ok: boolean;
  actions: DecideAction[];
  skipped_actions: SkippedAction[];
  retry_needed: boolean;
  overall_status: string;
  summary: string;
}

export interface Run {
  id: number;
  name: string;
  status: string;
  start_time: string;
  end_time?: string;
  plants_count: number;
  total_water_ml: number;
  total_treatment_ml: number;
  notes?: string;
}

export interface RunSummary {
  run: Run;
  plants_scanned: number;
  water_applied_ml: number;
  treatment_applied_ml: number;
  diseases_detected: number;
  alerts_count: number;
}

export interface Plant {
  id: number;
  run_id?: number;
  plant_id: string;
  species: string;
  location_index: number;
  status: string;
  watered_ml: number;
  treated_ml: number;
  created_at: string;
}

export interface PlantHistory {
  plant: Plant;
  readings: any[];
  images: any[];
  results: any[];
  actions: any[];
}

export interface CalibrationItem {
  name: string;
  param1: number;
  param2: number;
  unit: string;
  notes: string;
}

export interface AlertItem {
  id: number;
  run_id?: number;
  code: string;
  message: string;
  severity: string;
  acknowledged: boolean;
  created_at: string;
}

export interface ImageQualityInfo {
  width: number;
  height: number;
  brightness: number;
  blur: number;
  warnings: string[];
}

export interface SprayPreviewInfo {
  would_spray: boolean;
  reason: string;
}

export interface AnalyzeResponse {
  class_name: 'leaf_healthy' | 'leaf_diseased' | string;
  confidence: number;
  probabilities: Record<string, number>;
  raw_probabilities?: Record<string, number>;
  verdict: 'diseased' | 'healthy' | 'unsure' | string;
  low_confidence: boolean;
  is_low_confidence?: boolean;
  raw_verdict?: string;
  spray_preview: SprayPreviewInfo;
  image_quality: ImageQualityInfo;
  model_mode: 'real' | 'mock' | string;
  treatment?: {
    treatment?: string;
    dose_ml?: number | null;
    severity?: string;
    [key: string]: any;
  } | null;
  explanation: string;
  check_id?: number | null;
  image_path?: string | null;
}

export interface CheckItem {
  id: number;
  image_path: string;
  class_name: string;
  confidence: number;
  verdict: string;
  low_confidence?: boolean;
  probabilities?: Record<string, number>;
  raw_probabilities?: Record<string, number>;
  would_spray: boolean;
  spray_reason?: string;
  warnings: string[];
  model_mode: string;
  created_at: string;
}
