/**
 * Typed API Client for Agri-Rover FastAPI Backend (http://localhost:8000)
 */

import type {
  AlertItem,
  AnalyzeResponse,
  CalibrationItem,
  CheckItem,
  DecideResponse,
  Plant,
  PlantHistory,
  PredictResult,
  Run,
  RunSummary,
  ScanResponse,
} from './types';

const API_BASE_URL = 'http://localhost:8000';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options?.headers || {}),
        },
        ...options,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status} (${response.statusText}): ${errorText}`);
      }

      return (await response.json()) as T;
    } catch (err: any) {
      console.error(`Request to ${url} failed:`, err);
      throw err;
    }
  }

  // Health
  async checkHealth(): Promise<{ status: string; classifier_mode: string; version: string }> {
    return this.request('/api/health');
  }

  // Vision / Classification
  async scan(pose: 'leaf' | 'stem', plantId?: string, runId?: number, saveImage = true): Promise<ScanResponse> {
    return this.request<ScanResponse>('/api/scan', {
      method: 'POST',
      body: JSON.stringify({
        pose,
        plant_id: plantId,
        run_id: runId,
        save_image: saveImage,
      }),
    });
  }

  async predict(file: File | Blob, pose: 'leaf' | 'stem'): Promise<PredictResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pose', pose);

    const url = `${this.baseUrl}/api/predict`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Predict error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async captureDataset(params: {
    plant: string;
    label_class: string;
    plant_id: string;
    lighting: string;
    distance_cm: number;
    part: string;
  }): Promise<{ ok: boolean; filename: string; relative_path: string; saved_path: string }> {
    const formData = new FormData();
    formData.append('plant', params.plant);
    formData.append('label_class', params.label_class);
    formData.append('plant_id', params.plant_id);
    formData.append('lighting', params.lighting);
    formData.append('distance_cm', String(params.distance_cm));
    formData.append('part', params.part);

    const url = `${this.baseUrl}/api/dataset/capture`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Dataset capture error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  async saveHardExample(params: {
    correct_class: string;
    image_id?: number;
    file?: File | Blob;
    notes?: string;
  }): Promise<{ ok: boolean; correct_class: string; saved_path: string; filename: string }> {
    const formData = new FormData();
    formData.append('correct_class', params.correct_class);
    if (params.image_id !== undefined) {
      formData.append('image_id', String(params.image_id));
    }
    if (params.file) {
      formData.append('file', params.file);
    }
    if (params.notes) {
      formData.append('notes', params.notes);
    }

    const url = `${this.baseUrl}/api/hard-example`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Hard example error ${response.status}: ${await response.text()}`);
    }
    return response.json();
  }

  // Decision
  async decide(payload: {
    moisture_pct?: number;
    leaf_result?: any;
    stem_result?: any;
    tank_estimates?: Record<string, number>;
    battery_status?: any;
    estop?: boolean;
    retry_count?: number;
    plant_id?: string;
    run_id?: number;
  }): Promise<DecideResponse> {
    return this.request<DecideResponse>('/api/decide', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Runs
  async listRuns(): Promise<Run[]> {
    return this.request<Run[]>('/api/runs');
  }

  async getRun(id: number): Promise<Run> {
    return this.request<Run>(`/api/runs/${id}`);
  }

  async createRun(name: string = 'Mission Run', notes?: string): Promise<Run> {
    return this.request<Run>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ name, notes }),
    });
  }

  async updateRun(id: number, data: { name?: string; status?: string; notes?: string }): Promise<Run> {
    return this.request<Run>(`/api/runs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async finishRun(id: number): Promise<Run> {
    return this.request<Run>(`/api/runs/${id}/finish`, {
      method: 'POST',
    });
  }

  async getRunSummary(id: number): Promise<RunSummary> {
    return this.request<RunSummary>(`/api/runs/${id}/summary`);
  }

  getRunExportCsvUrl(id: number): string {
    return `${this.baseUrl}/api/export/run/${id}.csv`;
  }

  // Plants
  async listPlants(runId?: number): Promise<Plant[]> {
    const query = runId !== undefined ? `?run_id=${runId}` : '';
    return this.request<Plant[]>(`/api/plants${query}`);
  }

  async getPlantHistory(id: number): Promise<PlantHistory> {
    return this.request<PlantHistory>(`/api/plants/${id}/history`);
  }

  // Settings & Calibration
  async getSettings(): Promise<Record<string, string>> {
    return this.request<Record<string, string>>('/api/settings');
  }

  async updateSettings(settings: Record<string, string>): Promise<{ ok: boolean; updated: string[] }> {
    return this.request<{ ok: boolean; updated: string[] }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getCalibrations(): Promise<CalibrationItem[]> {
    return this.request<CalibrationItem[]>('/api/calibration');
  }

  async updateCalibration(item: CalibrationItem): Promise<{ ok: boolean; calibration: CalibrationItem }> {
    return this.request<{ ok: boolean; calibration: CalibrationItem }>('/api/calibration', {
      method: 'POST',
      body: JSON.stringify(item),
    });
  }

  // Alerts
  async listAlerts(unackOnly = false, runId?: number): Promise<AlertItem[]> {
    const params = new URLSearchParams();
    if (unackOnly) params.append('unack_only', 'true');
    if (runId !== undefined) params.append('run_id', String(runId));
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<AlertItem[]>(`/api/alerts${qs}`);
  }

  async createAlert(data: { code: string; message: string; severity?: string; run_id?: number }): Promise<AlertItem> {
    return this.request<AlertItem>('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async ackAlert(id: number): Promise<AlertItem> {
    return this.request<AlertItem>(`/api/alerts/${id}/ack`, {
      method: 'POST',
    });
  }

  // Standalone Check It / Leaf Analysis
  async analyze(file: File | Blob, save: boolean = false): Promise<AnalyzeResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (save) {
      formData.append('save', 'true');
    }

    const url = `${this.baseUrl}/api/analyze?save=${save ? 'true' : 'false'}`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      const errText = await response.text();
      let msg = errText;
      try {
        const json = JSON.parse(errText);
        msg = json.detail || json.message || errText;
      } catch {
        // use raw
      }
      throw new Error(`Analyze error (${response.status}): ${msg}`);
    }
    return response.json();
  }

  async listChecks(): Promise<CheckItem[]> {
    return this.request<CheckItem[]>('/api/checks');
  }

  async deleteCheck(id: number): Promise<{ ok: boolean; deleted_id: number }> {
    return this.request<{ ok: boolean; deleted_id: number }>(`/api/checks/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
