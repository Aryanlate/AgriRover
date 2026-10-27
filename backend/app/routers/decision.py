"""
Decision API Router:
- POST /api/decide: Evaluates rover sensor/vision inputs and determines actions or skips.
"""

import json
import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import TREATMENTS_PATH, DEFAULT_SETTINGS
from app.database import get_db
from app.decision import evaluate_decision
from app.models import Action, Plant, Run, Setting
from app.schemas import DecideRequest, DecideResponse, DecideAction, SkippedAction

logger = logging.getLogger("agrirover.decision_api")
router = APIRouter(prefix="/api", tags=["decision"])


def _load_treatments() -> Dict[str, Any]:
    if TREATMENTS_PATH.exists():
        try:
            with open(TREATMENTS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Error loading treatments: {e}")
    return {
        "leaf_diseased": {"treatment": "Copper Fungicide", "dose_ml": 25.0, "severity": "medium"},
        "stem_diseased": {"treatment": "Systemic Fungicide", "dose_ml": 25.0, "severity": "high"}
    }


def _get_active_thresholds(db: Session, overrides: Dict[str, float] = None) -> Dict[str, float]:
    db_settings = {s.key: s.value for s in db.query(Setting).all()}
    thresholds = {}

    for k, v in DEFAULT_SETTINGS.items():
        try:
            thresholds[k] = float(db_settings.get(k, v))
        except (ValueError, TypeError):
            pass

    if overrides:
        for k, v in overrides.items():
            thresholds[k] = float(v)

    return thresholds


@router.post("/decide", response_model=DecideResponse)
def decide(req: DecideRequest, db: Session = Depends(get_db)):
    """
    Evaluate sensor readings, vision results, safety checks, and dose caps to decide rover actions.
    """
    thresholds = _get_active_thresholds(db, req.thresholds_override)
    treatments = _load_treatments()

    low_conf = float(thresholds.get("low_confidence", 0.60))
    high_conf = float(thresholds.get("high_confidence", 0.85))

    # Fetch plant history if plant_id provided
    plant_hist = {"watered_ml": 0.0, "treated_ml": 0.0}
    plant_record = None
    if req.plant_id:
        plant_record = db.query(Plant).filter(Plant.plant_id == req.plant_id).first()
        if plant_record:
            plant_hist["watered_ml"] = plant_record.watered_ml
            plant_hist["treated_ml"] = plant_record.treated_ml

    # Fetch run history if run_id provided
    run_hist = {"watered_ml": 0.0, "treated_ml": 0.0}
    run_record = None
    if req.run_id:
        run_record = db.query(Run).filter(Run.id == req.run_id).first()
        if run_record:
            run_hist["watered_ml"] = run_record.total_water_ml
            run_hist["treated_ml"] = run_record.total_treatment_ml

    dose_caps = req.dose_caps_override or {
        "per_plant_water_cap_ml": thresholds.get("per_plant_water_cap_ml", 150.0),
        "per_plant_treat_cap_ml": thresholds.get("per_plant_treat_cap_ml", 60.0),
        "per_run_water_cap_ml": thresholds.get("per_run_water_cap_ml", 2500.0),
        "per_run_treat_cap_ml": thresholds.get("per_run_treat_cap_ml", 1000.0),
    }

    decision_res = evaluate_decision(
        moisture_pct=req.moisture_pct,
        thresholds=thresholds,
        leaf_result=req.leaf_result,
        stem_result=req.stem_result,
        low_confidence=low_conf,
        high_confidence=high_conf,
        treatments=treatments,
        tank_estimates=req.tank_estimates,
        battery_status=req.battery_status,
        estop=req.estop,
        retry_count=req.retry_count,
        plant_history=plant_hist,
        run_history=run_hist,
        dose_caps=dose_caps
    )

    # Persist actions to database if relevant run/plant exists
    plant_db_id = plant_record.id if plant_record else None
    for act in decision_res["actions"]:
        action_row = Action(
            run_id=req.run_id,
            plant_id=plant_db_id,
            action_type=act["type"],
            target=act.get("target"),
            dose_ml=act.get("dose_ml", 0.0),
            duration_ms=act.get("duration_ms", 0),
            status="scheduled",
            reason=act.get("treatment") or "Soil moisture below threshold"
        )
        db.add(action_row)

        # Update accumulators
        if act["type"] == "water":
            if plant_record:
                plant_record.watered_ml += act.get("dose_ml", 0.0)
            if run_record:
                run_record.total_water_ml += act.get("dose_ml", 0.0)
        elif act["type"] == "treat":
            if plant_record:
                plant_record.treated_ml += act.get("dose_ml", 0.0)
            if run_record:
                run_record.total_treatment_ml += act.get("dose_ml", 0.0)

    # Also log skipped actions
    for sk in decision_res["skipped_actions"]:
        db.add(Action(
            run_id=req.run_id,
            plant_id=plant_db_id,
            action_type=sk["type"],
            target=sk.get("part"),
            dose_ml=0.0,
            duration_ms=0,
            status="skipped",
            reason=sk.get("reason")
        ))

    db.commit()

    return DecideResponse(
        ok=decision_res["ok"],
        actions=[DecideAction(**a) for a in decision_res["actions"]],
        skipped_actions=[SkippedAction(**s) for s in decision_res["skipped_actions"]],
        retry_needed=decision_res["retry_needed"],
        overall_status=decision_res["overall_status"],
        summary=decision_res["summary"]
    )
