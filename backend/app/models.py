from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from app.database import Base

class Run(Base):
    __tablename__ = "runs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, default="Mission Run")
    status = Column(String(50), nullable=False, default="active")  # active, paused, completed, aborted
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    plants_count = Column(Integer, default=0)
    total_water_ml = Column(Float, default=0.0)
    total_treatment_ml = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)

    plants = relationship("Plant", back_populates="run", cascade="all, delete-orphan")
    readings = relationship("Reading", back_populates="run")
    images = relationship("Image", back_populates="run")
    actions = relationship("Action", back_populates="run")
    alerts = relationship("Alert", back_populates="run")


class Plant(Base):
    __tablename__ = "plants"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    plant_id = Column(String(50), nullable=False, index=True)  # e.g. "plant_001"
    species = Column(String(50), nullable=False, default="tomato")  # tomato, potato, pepper, brinjal
    location_index = Column(Integer, default=0)
    status = Column(String(50), default="pending")  # pending, scanned, treated, healthy, skipped
    watered_ml = Column(Float, default=0.0)
    treated_ml = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="plants")
    readings = relationship("Reading", back_populates="plant")
    images = relationship("Image", back_populates="plant")
    results = relationship("Result", back_populates="plant")
    actions = relationship("Action", back_populates="plant")


class Reading(Base):
    __tablename__ = "readings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True)
    moisture_raw = Column(Integer, nullable=True)
    moisture_pct = Column(Float, nullable=True)
    temp_c = Column(Float, nullable=True)
    humidity_pct = Column(Float, nullable=True)
    battery_v = Column(Float, nullable=True)
    tilt_deg = Column(Float, nullable=True)
    distance_cm = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="readings")
    plant = relationship("Plant", back_populates="readings")


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True)
    pose = Column(String(20), nullable=False)  # leaf, stem
    file_path = Column(String(255), nullable=False)
    width = Column(Integer, default=800)
    height = Column(Integer, default=600)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="images")
    plant = relationship("Plant", back_populates="images")
    result = relationship("Result", back_populates="image", uselist=False)


class Result(Base):
    __tablename__ = "results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey("images.id"), nullable=True)
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True)
    part = Column(String(20), nullable=False)  # leaf, stem
    state = Column(String(50), nullable=False)  # healthy, diseased, no_plant, unsure
    confidence = Column(Float, nullable=False)
    class_name = Column(String(50), nullable=False)
    raw_probabilities = Column(Text, nullable=True)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)

    image = relationship("Image", back_populates="result")
    plant = relationship("Plant", back_populates="results")


class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    plant_id = Column(Integer, ForeignKey("plants.id"), nullable=True)
    action_type = Column(String(50), nullable=False)  # water, treat, skip, no_plant_found
    target = Column(String(50), nullable=True)  # soil, leaf, stem
    dose_ml = Column(Float, default=0.0)
    duration_ms = Column(Integer, default=0)
    status = Column(String(50), default="executed")  # executed, skipped, failed
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="actions")
    plant = relationship("Plant", back_populates="actions")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("runs.id"), nullable=True)
    code = Column(String(50), nullable=False)  # e.g. BAT_LOW, ESTOP, OBSTACLE, TILT
    message = Column(Text, nullable=False)
    severity = Column(String(20), default="warning")  # info, warning, critical
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="alerts")


class Setting(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text, nullable=False)
    category = Column(String(50), default="general")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Calibration(Base):
    __tablename__ = "calibration"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)  # soil_moisture, water_pump, etc.
    param1 = Column(Float, default=0.0)
    param2 = Column(Float, default=100.0)
    unit = Column(String(20), default="")
    notes = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Check(Base):
    __tablename__ = "checks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    image_path = Column(String(255), nullable=False)
    class_name = Column(String(50), nullable=False)
    confidence = Column(Float, nullable=False)
    verdict = Column(String(50), nullable=False)
    raw_probabilities = Column(Text, nullable=True)  # JSON string
    would_spray = Column(Boolean, default=False)
    spray_reason = Column(Text, nullable=True)
    warnings = Column(Text, nullable=True)  # JSON list string
    model_mode = Column(String(20), default="real")
    created_at = Column(DateTime, default=datetime.utcnow)

