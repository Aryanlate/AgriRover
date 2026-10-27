"""
Plants API Router:
- GET /api/plants: List plants
- GET /api/plants/{id}/history: Get comprehensive history (readings, images, results, actions)
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Action, Image, Plant, Reading, Result
from app.schemas import PlantResponse

router = APIRouter(prefix="/api", tags=["plants"])


@router.get("/plants", response_model=List[PlantResponse])
def list_plants(run_id: Optional[int] = None, db: Session = Depends(get_db)):
    """List plants, optionally filtered by mission run_id."""
    query = db.query(Plant)
    if run_id is not None:
        query = query.filter(Plant.run_id == run_id)
    return query.order_by(Plant.location_index.asc(), Plant.id.asc()).all()


@router.get("/plants/{id}/history")
def get_plant_history(id: int, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve complete chronological log for a single plant."""
    plant = db.query(Plant).filter(Plant.id == id).first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found.")

    readings = db.query(Reading).filter(Reading.plant_id == id).order_by(Reading.created_at.asc()).all()
    images = db.query(Image).filter(Image.plant_id == id).order_by(Image.created_at.asc()).all()
    results = db.query(Result).filter(Result.plant_id == id).order_by(Result.created_at.asc()).all()
    actions = db.query(Action).filter(Action.plant_id == id).order_by(Action.created_at.asc()).all()

    return {
        "plant": {
            "id": plant.id,
            "plant_id": plant.plant_id,
            "species": plant.species,
            "location_index": plant.location_index,
            "status": plant.status,
            "watered_ml": plant.watered_ml,
            "treated_ml": plant.treated_ml,
            "run_id": plant.run_id,
            "created_at": plant.created_at.isoformat() if plant.created_at else None
        },
        "readings": [
            {
                "id": r.id,
                "moisture_raw": r.moisture_raw,
                "moisture_pct": r.moisture_pct,
                "temp_c": r.temp_c,
                "humidity_pct": r.humidity_pct,
                "battery_v": r.battery_v,
                "tilt_deg": r.tilt_deg,
                "distance_cm": r.distance_cm,
                "created_at": r.created_at.isoformat() if r.created_at else None
            } for r in readings
        ],
        "images": [
            {
                "id": img.id,
                "pose": img.pose,
                "file_path": img.file_path,
                "created_at": img.created_at.isoformat() if img.created_at else None,
                "result": {
                    "part": img.result.part,
                    "state": img.result.state,
                    "confidence": img.result.confidence,
                    "class_name": img.result.class_name
                } if img.result else None
            } for img in images
        ],
        "results": [
            {
                "id": res.id,
                "image_id": res.image_id,
                "part": res.part,
                "state": res.state,
                "confidence": res.confidence,
                "class_name": res.class_name,
                "created_at": res.created_at.isoformat() if res.created_at else None
            } for res in results
        ],
        "actions": [
            {
                "id": a.id,
                "type": a.action_type,
                "target": a.target,
                "dose_ml": a.dose_ml,
                "duration_ms": a.duration_ms,
                "status": a.status,
                "reason": a.reason,
                "created_at": a.created_at.isoformat() if a.created_at else None
            } for a in actions
        ]
    }
