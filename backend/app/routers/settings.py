"""
Settings and Calibration API Router:
- GET /api/settings: Get system configuration
- POST /api/settings: Update configuration
- GET /api/calibration: Get calibration parameters
- POST /api/calibration: Update sensor/actuator calibration
"""

from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import DEFAULT_SETTINGS
from app.database import get_db
from app.models import Setting, Calibration
from app.schemas import SettingItem, CalibrationItem

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)) -> Dict[str, str]:
    """Get all settings, initialized with defaults."""
    db_items = {s.key: s.value for s in db.query(Setting).all()}
    merged = dict(DEFAULT_SETTINGS)
    merged.update(db_items)
    return merged


@router.post("/settings")
def update_settings(payload: Dict[str, str], db: Session = Depends(get_db)):
    """Update one or more settings."""
    for k, v in payload.items():
        existing = db.query(Setting).filter(Setting.key == k).first()
        if existing:
            existing.value = str(v)
        else:
            db.add(Setting(key=k, value=str(v), category="general"))
    db.commit()
    return {"ok": True, "updated": list(payload.keys())}


@router.get("/calibration")
def get_calibrations(db: Session = Depends(get_db)) -> List[CalibrationItem]:
    """Get all sensor and actuator calibration profiles."""
    items = db.query(Calibration).all()
    if not items:
        # Default calibration seeds
        defaults = [
            Calibration(name="soil_moisture", param1=3200.0, param2=1400.0, unit="ADC", notes="param1=dry_raw, param2=wet_raw"),
            Calibration(name="water_pump", param1=25.0, param2=0.0, unit="ml/s", notes="param1=flow_rate_ml_s"),
            Calibration(name="treat_pump", param1=20.0, param2=0.0, unit="ml/s", notes="param1=flow_rate_ml_s"),
        ]
        for d in defaults:
            db.add(d)
        db.commit()
        items = db.query(Calibration).all()

    return [
        CalibrationItem(
            name=c.name,
            param1=c.param1,
            param2=c.param2,
            unit=c.unit or "",
            notes=c.notes or ""
        ) for c in items
    ]


@router.post("/calibration")
def update_calibration(item: CalibrationItem, db: Session = Depends(get_db)):
    """Save or update calibration values."""
    cal = db.query(Calibration).filter(Calibration.name == item.name).first()
    if cal:
        cal.param1 = item.param1
        cal.param2 = item.param2
        cal.unit = item.unit
        cal.notes = item.notes
    else:
        cal = Calibration(
            name=item.name,
            param1=item.param1,
            param2=item.param2,
            unit=item.unit,
            notes=item.notes
        )
        db.add(cal)

    db.commit()
    return {"ok": True, "calibration": item}
