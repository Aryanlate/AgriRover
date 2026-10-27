from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

# Pose literal: "leaf" | "stem"
# State literal: "healthy" | "diseased" | "no_plant" | "unsure"

class ScanRequest(BaseModel):
    pose: str = Field(..., description="'leaf' or 'stem'")
    plant_id: Optional[str] = None
    run_id: Optional[int] = None
    save_image: bool = True

class PredictResult(BaseModel):
    part: str
    state: str
    confidence: float
    class_name: str
    raw_probabilities: Dict[str, float]
    renormalised_probabilities: Dict[str, float]

class ScanResponse(BaseModel):
    ok: bool
    image_id: Optional[int] = None
    image_path: Optional[str] = None
    result: PredictResult
    warning: Optional[str] = None

class DecideAction(BaseModel):
    type: str  # water, treat, no_plant_found
    part: Optional[str] = None  # leaf, stem, soil
    target: Optional[str] = None
    treatment: Optional[str] = None
    severity: Optional[str] = None
    dose_ml: float
    duration_ms: Optional[int] = None

class SkippedAction(BaseModel):
    type: str
    part: Optional[str] = None
    reason: str

class DecideRequest(BaseModel):
    moisture_pct: Optional[float] = None
    leaf_result: Optional[Dict[str, Any]] = None
    stem_result: Optional[Dict[str, Any]] = None
    tank_estimates: Optional[Dict[str, float]] = None
    battery_status: Optional[Dict[str, Any]] = None
    estop: bool = False
    retry_count: int = 0
    plant_id: Optional[str] = None
    run_id: Optional[int] = None
    thresholds_override: Optional[Dict[str, float]] = None
    dose_caps_override: Optional[Dict[str, float]] = None

class DecideResponse(BaseModel):
    ok: bool
    actions: List[DecideAction]
    skipped_actions: List[SkippedAction]
    retry_needed: bool
    overall_status: str
    summary: str

# Runs Schemas
class RunCreate(BaseModel):
    name: str = "Mission Run"
    notes: Optional[str] = None

class RunUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class RunResponse(BaseModel):
    id: int
    name: str
    status: str
    start_time: datetime
    end_time: Optional[datetime] = None
    plants_count: int
    total_water_ml: float
    total_treatment_ml: float
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class RunSummary(BaseModel):
    run: RunResponse
    plants_scanned: int
    water_applied_ml: float
    treatment_applied_ml: float
    diseases_detected: int
    alerts_count: int

# Plants Schemas
class PlantResponse(BaseModel):
    id: int
    run_id: Optional[int] = None
    plant_id: str
    species: str
    location_index: int
    status: str
    watered_ml: float
    treated_ml: float
    created_at: datetime

    class Config:
        from_attributes = True

# Settings & Calibration Schemas
class SettingItem(BaseModel):
    key: str
    value: str
    category: Optional[str] = "general"

class CalibrationItem(BaseModel):
    name: str
    param1: float
    param2: float
    unit: Optional[str] = ""
    notes: Optional[str] = ""

# Alerts Schemas
class AlertCreate(BaseModel):
    run_id: Optional[int] = None
    code: str
    message: str
    severity: str = "warning"

class AlertResponse(BaseModel):
    id: int
    run_id: Optional[int] = None
    code: str
    message: str
    severity: str
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True

# Dataset & Hard-example Schemas
class DatasetCaptureRequest(BaseModel):
    plant: str = "tomato"
    label_class: str
    plant_id: str = "p01"
    lighting: str = "ambient"
    distance_cm: int = 15
    part: str = "leaf"

class HardExampleRequest(BaseModel):
    correct_class: str
    notes: Optional[str] = None
