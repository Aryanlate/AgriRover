"""
Runs API Router:
- POST /api/runs: Create new mission run
- GET /api/runs: List all runs
- GET /api/runs/{id}: Get single run details
- PUT /api/runs/{id}: Update run
- POST /api/runs/{id}/finish: Complete mission run
- GET /api/runs/{id}/summary: Get aggregated mission metrics
- GET /api/export/run/{id}.csv: Export mission run history as CSV
"""

import csv
import io
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Action, Alert, Plant, Reading, Result, Run
from app.schemas import RunCreate, RunResponse, RunSummary, RunUpdate

router = APIRouter(prefix="/api", tags=["runs"])


@router.post("/runs", response_model=RunResponse)
def create_run(req: RunCreate, db: Session = Depends(get_db)):
    """Create a new mission run."""
    run = Run(
        name=req.name,
        notes=req.notes,
        status="active",
        start_time=datetime.utcnow()
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


@router.get("/runs", response_model=List[RunResponse])
def list_runs(db: Session = Depends(get_db)):
    """List all mission runs sorted by start time descending."""
    return db.query(Run).order_by(Run.start_time.desc()).all()


@router.get("/runs/{id}", response_model=RunResponse)
def get_run(id: int, db: Session = Depends(get_db)):
    """Get single run by ID."""
    run = db.query(Run).filter(Run.id == id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@router.put("/runs/{id}", response_model=RunResponse)
def update_run(id: int, req: RunUpdate, db: Session = Depends(get_db)):
    """Update run status or notes."""
    run = db.query(Run).filter(Run.id == id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    if req.name is not None:
        run.name = req.name
    if req.status is not None:
        run.status = req.status
    if req.notes is not None:
        run.notes = req.notes

    db.commit()
    db.refresh(run)
    return run


@router.post("/runs/{id}/finish", response_model=RunResponse)
def finish_run(id: int, db: Session = Depends(get_db)):
    """Mark run as completed and set end time."""
    run = db.query(Run).filter(Run.id == id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    run.status = "completed"
    run.end_time = datetime.utcnow()
    # Count plants associated
    run.plants_count = db.query(Plant).filter(Plant.run_id == id).count()

    db.commit()
    db.refresh(run)
    return run


@router.get("/runs/{id}/summary", response_model=RunSummary)
def get_run_summary(id: int, db: Session = Depends(get_db)):
    """Get summarized analytics for a specific run."""
    run = db.query(Run).filter(Run.id == id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    plants_scanned = db.query(Plant).filter(Plant.run_id == id).count()
    alerts_count = db.query(Alert).filter(Alert.run_id == id).count()

    # Total diseased results
    plant_ids = [p.id for p in db.query(Plant.id).filter(Plant.run_id == id).all()]
    diseases_detected = 0
    if plant_ids:
        diseases_detected = db.query(Result).filter(
            Result.plant_id.in_(plant_ids),
            Result.state == "diseased"
        ).count()

    return RunSummary(
        run=run,
        plants_scanned=plants_scanned,
        water_applied_ml=round(run.total_water_ml, 2),
        treatment_applied_ml=round(run.total_treatment_ml, 2),
        diseases_detected=diseases_detected,
        alerts_count=alerts_count
    )


@router.get("/export/run/{id}.csv")
def export_run_csv(id: int, db: Session = Depends(get_db)):
    """Export run history including plants, sensor readings, and actions as CSV."""
    run = db.query(Run).filter(Run.id == id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")

    output = io.StringIO()
    writer = csv.writer(output)

    # Section 1: Run Metadata
    writer.writerow(["# RUN METADATA"])
    writer.writerow(["Run ID", run.id])
    writer.writerow(["Run Name", run.name])
    writer.writerow(["Status", run.status])
    writer.writerow(["Start Time", run.start_time.isoformat() if run.start_time else ""])
    writer.writerow(["End Time", run.end_time.isoformat() if run.end_time else ""])
    writer.writerow(["Total Water Dispensed (ml)", run.total_water_ml])
    writer.writerow(["Total Treatment Dispensed (ml)", run.total_treatment_ml])
    writer.writerow([])

    # Section 2: Plants & Actions
    writer.writerow(["# PLANTS & ACTIONS"])
    writer.writerow(["Plant DB ID", "Plant Label", "Species", "Status", "Watered (ml)", "Treated (ml)", "Action Type", "Target", "Dose (ml)", "Action Status", "Reason/Treatment", "Action Timestamp"])

    plants = db.query(Plant).filter(Plant.run_id == id).all()
    for p in plants:
        p_actions = db.query(Action).filter(Action.plant_id == p.id).all()
        if p_actions:
            for act in p_actions:
                writer.writerow([
                    p.id, p.plant_id, p.species, p.status, p.watered_ml, p.treated_ml,
                    act.action_type, act.target, act.dose_ml, act.status, act.reason,
                    act.created_at.isoformat() if act.created_at else ""
                ])
        else:
            writer.writerow([p.id, p.plant_id, p.species, p.status, p.watered_ml, p.treated_ml, "", "", 0, "", "", ""])

    writer.writerow([])

    # Section 3: Sensor Readings
    writer.writerow(["# READINGS"])
    writer.writerow(["Reading ID", "Plant DB ID", "Moisture Raw", "Moisture %", "Temp C", "Humidity %", "Battery V", "Tilt Deg", "Distance cm", "Timestamp"])
    readings = db.query(Reading).filter(Reading.run_id == id).all()
    for r in readings:
        writer.writerow([
            r.id, r.plant_id, r.moisture_raw, r.moisture_pct, r.temp_c, r.humidity_pct,
            r.battery_v, r.tilt_deg, r.distance_cm,
            r.created_at.isoformat() if r.created_at else ""
        ])

    csv_data = output.getvalue()
    filename = f"run_{run.id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
