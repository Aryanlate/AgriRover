/**
 * Backend API Types (http://localhost:8000)
 */

export interface PredictResult {
  part: string;
  state: 'healthy' | 'diseased' | 'no_plant' | string;
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
