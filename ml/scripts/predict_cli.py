#!/usr/bin/env python3
"""
Agri-Rover CLI Inference Utility
Classifies a single image or an entire folder of images using YOLOv8n-cls.
Prints predicted class, confidence, and summary breakdown.
"""

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DEFAULT_WEIGHTS = ML_DIR / "models" / "best.pt"


def find_default_weights() -> Path:
    if DEFAULT_WEIGHTS.exists():
        return DEFAULT_WEIGHTS
    runs_dir = ML_DIR / "runs"
    if runs_dir.exists():
        candidates = list(runs_dir.rglob("best.pt"))
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return candidates[0]
    return Path("yolov8n-cls.pt")


def get_pred_class_name(model_names, idx: int) -> str:
    """Robustly resolve predicted class name from dict (int or str keys) or list."""
    if isinstance(model_names, dict):
        if idx in model_names:
            return str(model_names[idx])
        if str(idx) in model_names:
            return str(model_names[str(idx)])
    elif isinstance(model_names, (list, tuple)) and 0 <= idx < len(model_names):
        return str(model_names[idx])
    return str(idx)


def predict_single(model, image_path: Path, imgsz: int = 224, device: str = "") -> dict:
    dev_arg = device if device else None
    results = model.predict(source=str(image_path), imgsz=imgsz, device=dev_arg, verbose=False)
    probs = results[0].probs
    top1_idx = int(probs.top1)
    top1_conf = float(probs.top1conf)
    top1_name = get_pred_class_name(model.names, top1_idx)

    num_classes = len(probs.data)
    all_probs = {get_pred_class_name(model.names, i): float(probs.data[i]) for i in range(num_classes)}
    sorted_probs = sorted(all_probs.items(), key=lambda kv: kv[1], reverse=True)

    return {
        "file": image_path.name,
        "path": image_path,
        "class": top1_name,
        "confidence": top1_conf,
        "distribution": sorted_probs
    }


def main():
    parser = argparse.ArgumentParser(description="Classify one image or a folder with Agri-Rover YOLOv8n-cls")
    parser.add_argument("source", type=Path, help="Path to single image file or directory of images")
    parser.add_argument("--weights", type=Path, default=None, help="Path to trained weights (default: ml/models/best.pt)")
    parser.add_argument("--imgsz", type=int, default=224, help="Image size (default: 224)")
    parser.add_argument("--device", type=str, default="", help="Device ('cpu', '0', etc.)")
    args = parser.parse_args()

    weights = args.weights or find_default_weights()
    source = args.source

    if not source.exists():
        print(f"[ERROR] Source path does not exist: {source}")
        sys.exit(1)

    print("=" * 60)
    print("AGRI-ROVER IMAGE CLASSIFICATION CLI")
    print(f"Model:  {weights}")
    print(f"Source: {source}")
    print("=" * 60)

    from ultralytics import YOLO
    model = YOLO(str(weights))

    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    if source.is_file():
        if source.suffix.lower() not in valid_exts:
            print(f"[ERROR] File is not a supported image format: {source}")
            sys.exit(1)
        res = predict_single(model, source, imgsz=args.imgsz, device=args.device)
        print(f"\nFile:        {res['file']}")
        print(f"Predicted:   {res['class']} (Confidence: {res['confidence']*100:.2f}%)")
        print("\nClass Probabilities:")
        for name, prob in res["distribution"]:
            bar = "#" * int(prob * 30)
            print(f"  - {name:<15}: {prob*100:5.1f}%  {bar}")
        print("=" * 60)

    elif source.is_dir():
        image_files = [p for p in source.rglob("*") if p.is_file() and p.suffix.lower() in valid_exts]
        if not image_files:
            print(f"[INFO] No images found in directory: {source}")
            sys.exit(0)

        print(f"\nProcessing {len(image_files)} image(s)...\n")
        counts = {}
        for i, img_path in enumerate(image_files, 1):
            res = predict_single(model, img_path, imgsz=args.imgsz, device=args.device)
            cls_name = res["class"]
            counts[cls_name] = counts.get(cls_name, 0) + 1
            print(f"[{i:3d}/{len(image_files)}] {img_path.name:<35} -> {cls_name:<15} ({res['confidence']*100:.1f}%)")

        print("\n" + "=" * 60)
        print("BATCH PREDICTION SUMMARY")
        print("=" * 60)
        print(f"Total processed: {len(image_files)}")
        for cls_name, count in sorted(counts.items(), key=lambda kv: kv[1], reverse=True):
            pct = (count / len(image_files)) * 100
            print(f"  - {cls_name:<15}: {count:4d} ({pct:5.1f}%)")
        print("=" * 60)


if __name__ == "__main__":
    main()
