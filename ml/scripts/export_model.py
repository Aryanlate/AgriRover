#!/usr/bin/env python3
"""
Agri-Rover Model Export Pipeline
Copies best weights to ml/models/best.pt, exports ONNX format,
and creates ml/models/labels.json with class to plant part mapping.
"""

import argparse
import json
from pathlib import Path
import shutil
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
MODELS_DIR = ML_DIR / "models"
DEST_WEIGHTS = MODELS_DIR / "best.pt"
DEST_ONNX = MODELS_DIR / "best.onnx"
DEST_LABELS = MODELS_DIR / "labels.json"

# Mapping each class to its part (leaf or none)
CLASS_PARTS = {
    "leaf_healthy": "leaf",
    "leaf_diseased": "leaf",
    "background": "none"
}


def find_source_weights(specified: Path | None = None, allow_pretrained: bool = False) -> Path:
    if specified:
        if specified.exists():
            return specified
        raise FileNotFoundError(f"Specified weights not found: {specified}")

    # Search in runs directory
    runs_dir = ML_DIR / "runs"
    if runs_dir.exists():
        candidates = list(runs_dir.rglob("best.pt"))
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return candidates[0]

    # Check if already in ml/models/best.pt
    if DEST_WEIGHTS.exists():
        return DEST_WEIGHTS

    if allow_pretrained:
        return Path("yolov8n-cls.pt")

    raise FileNotFoundError(
        "No trained weights (best.pt) found in ml/runs/ or ml/models/.\n"
        "Train a model first with `python ml/scripts/train.py`, or use `--pretrained` to export the base model."
    )


def export_pipeline(source_weights: Path, imgsz: int = 224, opset: int = 12):
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("AGRI-ROVER MODEL EXPORT")
    print("=" * 60)
    print(f"Source weights:   {source_weights}")
    print(f"Target directory: {MODELS_DIR}")

    # Step 1: Copy best.pt to ml/models/best.pt
    if source_weights.exists():
        if source_weights.resolve() != DEST_WEIGHTS.resolve():
            shutil.copy2(source_weights, DEST_WEIGHTS)
            print(f"[OK] Copied weights -> {DEST_WEIGHTS}")
        else:
            print(f"[OK] Source is already at destination -> {DEST_WEIGHTS}")

    # Step 2: Write ml/models/labels.json with each class and its part (leaf, stem or none)
    with open(DEST_LABELS, "w", encoding="utf-8") as f:
        json.dump(CLASS_PARTS, f, indent=2)
    print(f"[OK] Exported labels map -> {DEST_LABELS}")

    # Step 3: Export ONNX
    print(f"[INFO] Exporting to ONNX format (imgsz={imgsz}, opset={opset})...")
    from ultralytics import YOLO

    model_src = str(DEST_WEIGHTS) if DEST_WEIGHTS.exists() else str(source_weights)
    model = YOLO(model_src)
    exported_path = model.export(format="onnx", imgsz=imgsz, opset=opset)

    # Ensure exported onnx is placed at ml/models/best.onnx
    exported_onnx = Path(exported_path)
    if exported_onnx.exists() and exported_onnx.resolve() != DEST_ONNX.resolve():
        shutil.move(exported_onnx, DEST_ONNX)

    print(f"[OK] Exported ONNX model -> {DEST_ONNX}")
    print("=" * 60)
    print("EXPORT COMPLETED SUCCESSFULLY")
    if DEST_WEIGHTS.exists():
        print(f"  - PyTorch: {DEST_WEIGHTS} ({DEST_WEIGHTS.stat().st_size / (1024*1024):.2f} MB)")
    if DEST_ONNX.exists():
        print(f"  - ONNX:    {DEST_ONNX} ({DEST_ONNX.stat().st_size / (1024*1024):.2f} MB)")
    print(f"  - Labels:  {DEST_LABELS}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Export YOLOv8n-cls model to ONNX and generate labels.json")
    parser.add_argument("--weights", type=Path, default=None, help="Path to source best.pt")
    parser.add_argument("--imgsz", type=int, default=224, help="Image resolution for export")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version")
    parser.add_argument("--pretrained", action="store_true", help="Allow fallback to pretrained yolov8n-cls.pt")
    args = parser.parse_args()

    try:
        src = find_source_weights(args.weights, allow_pretrained=args.pretrained)
        export_pipeline(src, imgsz=args.imgsz, opset=args.opset)
    except Exception as e:
        print(f"[EXPORT ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
