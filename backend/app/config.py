import os
from pathlib import Path
from dotenv import load_dotenv

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

WORKSPACE_ROOT = BASE_DIR.parent
ML_DIR = WORKSPACE_ROOT / "ml"
MODEL_PATH = ML_DIR / "models" / "best.pt"
LABELS_PATH = ML_DIR / "models" / "labels.json"
TREATMENTS_PATH = ML_DIR / "treatments.json"
DATASET_DIR = ML_DIR / "dataset"
METADATA_CSV_PATH = DATASET_DIR / "metadata.csv"
HARD_EXAMPLES_DIR = ML_DIR / "hard_examples"
UPLOADS_DIR = BASE_DIR / "uploads"
CHECKS_DIR = UPLOADS_DIR / "checks"

# Database
DB_PATH = BASE_DIR / "agri_rover.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# MQTT Broker Configuration (EMQX Cloud TLS)
MQTT_BROKER = os.getenv("MQTT_BROKER", "rc2ad722.ala.asia-southeast1.emqxsl.com")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USER = os.getenv("MQTT_USER", "backend")
MQTT_PASS = os.getenv("MQTT_PASS", "")
ROVER_ID = os.getenv("ROVER_ID", "rover01")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "https://agri-rover.vercel.app")

# Default Settings
DEFAULT_SETTINGS = {
    "camera_timeout_sec": "5.0",
    "moisture_threshold": "35.0",
    "default_water_dose_ml": "50.0",
    "default_treat_dose_ml": "25.0",
    "high_confidence": "0.95",
    "low_confidence": "0.60",
    "per_plant_water_cap_ml": "150.0",
    "per_plant_treat_cap_ml": "60.0",
    "per_run_water_cap_ml": "2500.0",
    "per_run_treat_cap_ml": "1000.0",
    "tank_capacity_water_ml": "1000.0",
    "tank_capacity_treat_ml": "1000.0",
    "soil_dry_raw": "3200",
    "soil_wet_raw": "1400",
    "water_pump_flow_ml_s": "25.0",
    "treat_pump_flow_ml_s": "20.0"
}
