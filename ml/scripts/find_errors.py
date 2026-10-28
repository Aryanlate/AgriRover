#!/usr/bin/env python3
"""
Agri-Rover Hard Examples Mining Pipeline
Runs the trained classifier on 'val' and 'test' splits, identifies misclassifications,
and copies them into ml/hard_examples/<true_class>/ with predicted class in filename.
"""

import argparse
from pathlib import Path
import shutil
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
HARD_EXAMPLES_DIR = ML_DIR / "hard_examples"
CLASSES_FILE = DATASET_DIR / "classes.txt"


def load_classes() -> list[str]:
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        if classes:
            return classes
    return ["leaf_healthy", "leaf_diseased", "background"]


def find_default_weights() -> Path:
    target = ML_DIR / "models" / "best.pt"
    if target.exists():
        return target
    runs_dir = ML_DIR / "runs"
    if runs_dir.exists():
        candidates = list(runs_dir.rglob("best.pt"))
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return candidates[0]
    return target


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


def find_and_copy_errors(model_path: Path, splits: list[str], device: str = ""):
    from ultralytics import YOLO

    classes = load_classes()
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    # Ensure hard_examples target subfolders exist
    for c in classes:
        (HARD_EXAMPLES_DIR / c).mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("AGRI-ROVER HARD EXAMPLES MINING")
    print(f"Model:   {model_path}")
    print(f"Splits:  {', '.join(splits)}")
    print(f"Target:  {HARD_EXAMPLES_DIR}")
    print("=" * 60)

    model = YOLO(str(model_path))
    dev_arg = device if device else None

    total_scanned = 0
    total_errors = 0
    error_summary = {c: [] for c in classes}

    for split in splits:
        split_dir = DATASET_DIR / split
        if not split_dir.exists():
            print(f"[WARN] Split directory {split_dir} does not exist. Skipping.")
            continue

        print(f"\nScanning split: {split} ({split_dir})")
        split_scanned = 0
        split_errors = 0

        for true_class in classes:
            class_folder = split_dir / true_class
            if not class_folder.exists():
                continue

            images = [p for p in class_folder.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
            for img_path in images:
                total_scanned += 1
                split_scanned += 1

                res = model.predict(source=str(img_path), imgsz=224, device=dev_arg, verbose=False)[0]
                pred_idx = int(res.probs.top1)
                pred_conf = float(res.probs.top1conf)
                pred_name = get_pred_class_name(model.names, pred_idx)

                # Check if misclassified
                if pred_name != true_class:
                    total_errors += 1
                    split_errors += 1

                    # Destination file with predicted class in name
                    dest_filename = f"{img_path.stem}_pred_{pred_name}{img_path.suffix}"
                    dest_path = HARD_EXAMPLES_DIR / true_class / dest_filename

                    shutil.copy2(img_path, dest_path)
                    error_summary[true_class].append({
                        "original": img_path.name,
                        "pred": pred_name,
                        "conf": pred_conf,
                        "dest": dest_path.name,
                        "split": split
                    })

        print(f"  Split '{split}': scanned {split_scanned} images, found {split_errors} errors.")

    print("\n" + "=" * 60)
    print("HARD EXAMPLES MINING SUMMARY")
    print("=" * 60)
    print(f"Total images scanned: {total_scanned}")
    print(f"Total misclassifications: {total_errors}")

    if total_scanned == 0:
        print("[INFO] No images found in val/test splits. Populate splits to mine hard examples.")
    elif total_errors == 0:
        print("[SUCCESS] Zero errors found across scanned splits!")
    else:
        print("\nErrors per Ground Truth Class:")
        for true_class, errs in error_summary.items():
            print(f"  - `{true_class}`: {len(errs)} error(s) copied to ml/hard_examples/{true_class}/")
            for e in errs[:5]:
                print(f"      {e['original']} -> predicted: {e['pred']} ({e['conf']*100:.1f}%)")
            if len(errs) > 5:
                print(f"      ... and {len(errs) - 5} more.")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Find misclassified images in val and test, and copy to hard_examples")
    parser.add_argument("--weights", type=Path, default=None, help="Path to best.pt")
    parser.add_argument("--splits", nargs="+", default=["val", "test"], help="Splits to evaluate (default: val test)")
    parser.add_argument("--device", type=str, default="", help="Device ('cpu', '0', etc.)")
    args = parser.parse_args()

    weights = args.weights or find_default_weights()
    if not weights.exists():
        print(f"[ERROR] Model weights not found at: {weights}")
        print("Please train a model first using `python ml/scripts/train.py` or pass `--weights <path>`.")
        sys.exit(1)

    find_and_copy_errors(weights, splits=args.splits, device=args.device)


if __name__ == "__main__":
    main()
