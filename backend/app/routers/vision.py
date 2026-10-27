"""
Vision and Camera API Router:
- POST /api/scan: Capture from ESP32-CAM, classify with pose, save image, store result.
- POST /api/predict: Upload image file, classify with pose.
- POST /api/dataset/capture: Fetch camera image, save to ml/dataset/raw/rover/inbox/<class>/, append to metadata.csv.
- POST /api/hard-example: Save image into ml/hard_examples/<correct class>/.
"""

import csv
import io
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image as PILImage, ImageDraw, ImageFont
from sqlalchemy.orm import Session

from app.camera_client import camera_client, CameraClientError
from app.classifier import classifier
from app.config import (
    DEFAULT_SETTINGS,
    HARD_EXAMPLES_DIR,
    METADATA_CSV_PATH,
    UPLOADS_DIR,
    WORKSPACE_ROOT,
)
from app.database import get_db
from app.models import Image, Plant, Result, Run, Setting
from app.schemas import PredictResult, ScanRequest, ScanResponse

logger = logging.getLogger("agrirover.vision")
router = APIRouter(prefix="/api", tags=["vision"])

# Ensure uploads folder exists
UPLOADS_IMAGES_DIR = UPLOADS_DIR / "images"
UPLOADS_IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def _get_setting_val(db: Session, key: str, default: str) -> str:
    setting = db.query(Setting).filter(Setting.key == key).first()
    return setting.value if setting else default


def _generate_synthetic_image(pose: str, state_hint: str = "diseased") -> bytes:
    """Generate a lightweight synthetic JPEG test image when camera hardware is disconnected."""
    img = PILImage.new("RGB", (640, 480), color=(34, 45, 34))
    draw = ImageDraw.Draw(img)

    # Draw simulated leaf/stem shapes
    if pose == "leaf":
        draw.ellipse([150, 100, 490, 380], fill=(46, 125, 50), outline=(30, 90, 30), width=4)
        # Spot simulated disease lesions
        draw.ellipse([260, 200, 310, 250], fill=(139, 69, 19), outline=(90, 45, 10))
        draw.ellipse([340, 260, 390, 310], fill=(139, 69, 19), outline=(90, 45, 10))
    else:
        # Stem
        draw.rectangle([280, 50, 360, 430], fill=(92, 107, 72), outline=(60, 70, 50), width=4)
        draw.ellipse([290, 200, 350, 280], fill=(101, 67, 33), outline=(60, 30, 15))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


@router.post("/scan", response_model=ScanResponse)
def scan_camera(req: ScanRequest, db: Session = Depends(get_db)):
    """
    Capture image from ESP32-CAM with specified pose ('leaf' or 'stem'),
    run classifier, persist to database and return result.
    """
    camera_ip = _get_setting_val(db, "camera_ip", DEFAULT_SETTINGS["camera_ip"])
    timeout_sec = float(_get_setting_val(db, "camera_timeout_sec", DEFAULT_SETTINGS["camera_timeout_sec"]))

    warning_msg = None
    try:
        image_bytes = camera_client.capture_image(camera_ip, timeout=timeout_sec)
    except CameraClientError as e:
        logger.warning(f"Camera capture error: {e}. Generating synthetic frame for development.")
        warning_msg = f"Camera unreachable ({e}); used synthetic mock image."
        image_bytes = _generate_synthetic_image(req.pose)

    # Classify image
    class_res = classifier.classify(image_bytes, pose=req.pose)

    # Save to disk
    now = datetime.utcnow()
    timestamp_str = now.strftime("%Y%m%d_%H%M%S_%f")
    filename = f"scan_{req.pose}_{timestamp_str}.jpg"
    image_path = UPLOADS_IMAGES_DIR / filename

    if req.save_image:
        with open(image_path, "wb") as f:
            f.write(image_bytes)

    # Determine plant DB record if plant_id provided
    plant_db_id = None
    if req.plant_id:
        plant_record = db.query(Plant).filter(Plant.plant_id == req.plant_id).first()
        if not plant_record:
            plant_record = Plant(
                run_id=req.run_id,
                plant_id=req.plant_id,
                species="tomato",
                status="scanned"
            )
            db.add(plant_record)
            db.commit()
            db.refresh(plant_record)
        plant_db_id = plant_record.id

    # Record Image & Result in DB
    db_image = Image(
        run_id=req.run_id,
        plant_id=plant_db_id,
        pose=req.pose,
        file_path=str(image_path),
        width=640,
        height=480,
        created_at=now
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    db_result = Result(
        image_id=db_image.id,
        plant_id=plant_db_id,
        part=class_res["part"],
        state=class_res["state"],
        confidence=class_res["confidence"],
        class_name=class_res["class_name"],
        raw_probabilities=json.dumps(class_res["raw_probabilities"]),
        created_at=now
    )
    db.add(db_result)
    db.commit()

    return ScanResponse(
        ok=True,
        image_id=db_image.id,
        image_path=f"/uploads/images/{filename}",
        result=PredictResult(**class_res),
        warning=warning_msg
    )


@router.post("/predict", response_model=PredictResult)
async def predict_image(file: UploadFile = File(...), pose: str = Form("leaf")):
    """
    Run classifier on uploaded image with given pose ('leaf' or 'stem').
    """
    if pose.lower() not in ["leaf", "stem"]:
        pose = "leaf"

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image uploaded.")

    res = classifier.classify(image_bytes, pose=pose)
    return PredictResult(**res)


@router.post("/dataset/capture")
def capture_dataset_sample(
    plant: str = Form("tomato"),
    label_class: str = Form(...),
    plant_id: str = Form("p01"),
    lighting: str = Form("ambient"),
    distance_cm: int = Form(15),
    part: str = Form("leaf"),
    db: Session = Depends(get_db)
):
    """
    Fetch image from ESP32-CAM and save to:
    ml/dataset/raw/rover/inbox/<label_class>/rover_<plant>_<label_class>_<plantID>_<date>_<seq>.jpg
    and append a row to ml/dataset/metadata.csv.
    """
    camera_ip = _get_setting_val(db, "camera_ip", DEFAULT_SETTINGS["camera_ip"])
    timeout_sec = float(_get_setting_val(db, "camera_timeout_sec", DEFAULT_SETTINGS["camera_timeout_sec"]))

    try:
        image_bytes = camera_client.capture_image(camera_ip, timeout=timeout_sec)
    except CameraClientError as e:
        logger.warning(f"Dataset capture camera fallback: {e}")
        image_bytes = _generate_synthetic_image(part)

    # Inbox folder
    target_dir = WORKSPACE_ROOT / "ml" / "dataset" / "raw" / "rover" / "inbox" / label_class
    target_dir.mkdir(parents=True, exist_ok=True)

    # Compute sequence number
    date_str = datetime.utcnow().strftime("%Y%m%d")
    existing_files = list(target_dir.glob(f"rover_{plant}_{label_class}_{plant_id}_{date_str}_*.jpg"))
    seq_num = len(existing_files) + 1
    seq_str = f"{seq_num:04d}"

    filename = f"rover_{plant}_{label_class}_{plant_id}_{date_str}_{seq_str}.jpg"
    target_file = target_dir / filename

    with open(target_file, "wb") as f:
        f.write(image_bytes)

    # Relative path from dataset directory
    rel_filename = f"raw/rover/inbox/{label_class}/{filename}"

    # Append to metadata.csv
    METADATA_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    file_exists = METADATA_CSV_PATH.exists()

    with open(METADATA_CSV_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists or METADATA_CSV_PATH.stat().st_size == 0:
            writer.writerow(["filename", "source", "plant", "plant_id", "part", "label_class", "date", "lighting", "distance_cm", "split"])
        writer.writerow([rel_filename, "rover", plant, plant_id, part, label_class, date_str, lighting, distance_cm, "unassigned"])

    return {
        "ok": True,
        "filename": filename,
        "relative_path": rel_filename,
        "saved_path": str(target_file)
    }


@router.post("/hard-example")
async def save_hard_example(
    correct_class: str = Form(...),
    notes: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    image_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Save hard example image to ml/hard_examples/<correct class>/.
    Accepts direct file upload or image_id from recent scans.
    """
    target_dir = HARD_EXAMPLES_DIR / correct_class
    target_dir.mkdir(parents=True, exist_ok=True)

    image_bytes = None
    if file:
        image_bytes = await file.read()
    elif image_id:
        img_record = db.query(Image).filter(Image.id == image_id).first()
        if img_record and Path(img_record.file_path).exists():
            with open(img_record.file_path, "rb") as f:
                image_bytes = f.read()

    if not image_bytes:
        raise HTTPException(status_code=400, detail="No image provided (upload file or valid image_id required).")

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"hard_{correct_class}_{timestamp}.jpg"
    target_file = target_dir / filename

    with open(target_file, "wb") as f:
        f.write(image_bytes)

    # Optional metadata log next to hard example
    if notes:
        notes_file = target_dir / f"{filename}.txt"
        with open(notes_file, "w", encoding="utf-8") as f:
            f.write(notes)

    return {
        "ok": True,
        "correct_class": correct_class,
        "saved_path": str(target_file),
        "filename": filename
    }
