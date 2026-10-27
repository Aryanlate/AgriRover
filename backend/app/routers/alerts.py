"""
Alerts API Router:
- POST /api/alerts: Create safety or mission alert
- GET /api/alerts: List active or historical alerts
- POST /api/alerts/{id}/ack: Acknowledge an alert
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Alert
from app.schemas import AlertCreate, AlertResponse

router = APIRouter(prefix="/api", tags=["alerts"])


@router.post("/alerts", response_model=AlertResponse)
def create_alert(req: AlertCreate, db: Session = Depends(get_db)):
    """Log an alert (e.g. from rover telemetry like ESTOP, BAT_LOW, OBSTACLE, TILT)."""
    alert = Alert(
        run_id=req.run_id,
        code=req.code,
        message=req.message,
        severity=req.severity,
        acknowledged=False
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@router.get("/alerts", response_model=List[AlertResponse])
def list_alerts(
    run_id: Optional[int] = None,
    unack_only: bool = False,
    db: Session = Depends(get_db)
):
    """Retrieve alerts ordered by most recent first."""
    query = db.query(Alert)
    if run_id is not None:
        query = query.filter(Alert.run_id == run_id)
    if unack_only:
        query = query.filter(Alert.acknowledged.is_(False))
    return query.order_by(Alert.created_at.desc()).all()


@router.post("/alerts/{id}/ack", response_model=AlertResponse)
def acknowledge_alert(id: int, db: Session = Depends(get_db)):
    """Acknowledge an active alert."""
    alert = db.query(Alert).filter(Alert.id == id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    alert.acknowledged = True
    db.commit()
    db.refresh(alert)
    return alert
