"""
FastAPI Main Application for Agri-Rover Autonomous Farm Assistant
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.classifier import classifier
from app.config import DEFAULT_SETTINGS, FRONTEND_ORIGIN, UPLOADS_DIR
from app.database import Base, SessionLocal, engine
from app.models import Setting
from app.mqtt_camera import mqtt_camera
from app.routers import alerts, decision, plants, runs, settings, vision

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("agrirover")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if not present
    logger.info("Initializing SQLite database tables...")
    Base.metadata.create_all(bind=engine)

    # Initialize default settings if empty
    db = SessionLocal()
    try:
        for k, v in DEFAULT_SETTINGS.items():
            if not db.query(Setting).filter(Setting.key == k).first():
                db.add(Setting(key=k, value=str(v), category="general"))
        db.commit()
    except Exception as e:
        logger.error(f"Error populating default settings: {e}")
    finally:
        db.close()

    # Log model state
    if classifier.is_mock:
        logger.warning("Classifier initialized in MOCK-MODEL mode (ml/models/best.pt not found or unreadable).")
    else:
        logger.info("Classifier initialized successfully with real weights.")

    yield
    # Shutdown
    logger.info("Agri-Rover backend shutting down.")


app = FastAPI(
    title="Agri-Rover Backend API",
    description="Autonomous Agricultural Rover Telemetry, Vision, and Decision Support Backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration restricted strictly to localhost and configured website origin
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://localhost:4173",
]
if FRONTEND_ORIGIN:
    for origin in FRONTEND_ORIGIN.split(","):
        clean_origin = origin.strip()
        if clean_origin and clean_origin not in allowed_origins:
            allowed_origins.append(clean_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads directory for serving captured scan images
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

# Include Routers
app.include_router(vision.router)
app.include_router(decision.router)
app.include_router(runs.router)
app.include_router(plants.router)
app.include_router(settings.router)
app.include_router(alerts.router)


@app.get("/")
def root():
    return {
        "service": "Agri-Rover Backend",
        "status": "online",
        "mock_model": classifier.is_mock,
        "docs_url": "/docs"
    }


@app.get("/api/health")
def health():
    return {
        "broker_connected": mqtt_camera.is_broker_connected,
        "rover_online": mqtt_camera.is_rover_online,
        "camera_online": mqtt_camera.is_camera_online,
        "model_mode": "mock" if classifier.is_mock else "real"
    }
