#!/usr/bin/env python3
"""
Agri-Rover Confidence Threshold Sweep Report:
Evaluates precision and recall for 'leaf_diseased' at confidence thresholds:
[0.5, 0.6, 0.7, 0.8, 0.9, 0.95].
Suggests low and high operational confidence thresholds for rover decision making.
"""

import argparse
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DEFAULT_TEST_DIR = ML_DIR / "dataset" / "test"
DEFAULT_WEIGHTS = ML_DIR / "models" / "best.pt"
TARGET_CLASS = "leaf_diseased"
THRESHOLDS = [0.50, 0.60, 0.70, 0.80, 0.90, 0.95]


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


def resolve_split_dir(input_path: Path) -> Path:
    if (input_path / "test").is_dir():
        return input_path / "test"
    return input_path


def gather_samples(split_dir: Path) -> list[tuple[Path, str]]:
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    samples = []
    for cls_dir in split_dir.iterdir():
        if cls_dir.is_dir():
            cls_name = cls_dir.name
            for p in cls_dir.iterdir():
                if p.is_file() and p.suffix.lower() in valid_exts:
                    samples.append((p, cls_name))
    return samples


def generate_threshold_report(model_path: Path, test_dir: Path, device: str = ""):
    test_dir = resolve_split_dir(test_dir)

    samples = gather_samples(test_dir)
    used_val_fallback = False

    # If test is empty, use val and say so
    if len(samples) == 0:
        val_candidate = test_dir.parent / "val"
        if val_candidate.exists():
            val_samples = gather_samples(val_candidate)
            if len(val_samples) > 0:
                print(f"[INFO] Test split at '{test_dir}' is empty. Using val split ('{val_candidate}') instead.")
                samples = val_samples
                test_dir = val_candidate
                used_val_fallback = True

    if len(samples) == 0:
        print(f"[ERROR] No images found in test split or val fallback at: {test_dir}")
        sys.exit(1)

    print("=" * 70)
    print("AGRI-ROVER CONFIDENCE THRESHOLD ANALYSIS (LEAF_DISEASED)")
    print("=" * 70)
    print(f"Model:           {model_path}")
    print(f"Dataset split:   {test_dir} ({'val fallback' if used_val_fallback else 'test'})")
    print(f"Total samples:   {len(samples)}")
    print(f"Target class:    {TARGET_CLASS}")
    print("=" * 70)

    from ultralytics import YOLO
    model = YOLO(str(model_path))
    dev_arg = device if device else None

    # Resolve index of leaf_diseased in model.names
    names = model.names
    diseased_idx = None
    for idx, name in names.items():
        if name == TARGET_CLASS:
            diseased_idx = int(idx)
            break

    if diseased_idx is None:
        # Fallback search by string representation
        for idx in range(len(names)):
            if str(names.get(idx, names.get(str(idx)))) == TARGET_CLASS:
                diseased_idx = idx
                break

    # Run inference across all test images and collect disease confidence
    records = []  # (true_class, disease_prob)
    for img_path, true_class in samples:
        res = model.predict(source=str(img_path), imgsz=224, device=dev_arg, verbose=False)[0]
        probs = res.probs.data
        if diseased_idx is not None and diseased_idx < len(probs):
            disease_prob = float(probs[diseased_idx])
        else:
            top1_name = str(names.get(int(res.probs.top1)))
            disease_prob = float(res.probs.top1conf) if top1_name == TARGET_CLASS else 0.0

        records.append((true_class, disease_prob))

    # Evaluate at each threshold
    results = []
    for t in THRESHOLDS:
        tp = sum(1 for true_c, prob in records if true_c == TARGET_CLASS and prob >= t)
        fp = sum(1 for true_c, prob in records if true_c != TARGET_CLASS and prob >= t)
        fn = sum(1 for true_c, prob in records if true_c == TARGET_CLASS and prob < t)
        tn = sum(1 for true_c, prob in records if true_c != TARGET_CLASS and prob < t)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        results.append({
            "threshold": t,
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
        })

    # Print markdown table
    print("\n| Threshold | Precision | Recall | F1-Score | TP | FP | FN |")
    print("|-----------|-----------|--------|----------|----|----|----|")
    for r in results:
        print(f"| {r['threshold']:>9.2f} | {r['precision']:>9.3f} | {r['recall']:>6.3f} | {r['f1']:>8.3f} | {r['tp']:>2} | {r['fp']:>2} | {r['fn']:>2} |")

    # Determine recommended thresholds:
    # Low threshold: highest recall where precision >= 0.85, or default ~0.60
    # High threshold: threshold where precision >= 0.95 or maximum precision, default ~0.85
    suggested_low = 0.60
    suggested_high = 0.85

    for r in results:
        if r["recall"] >= 0.90 and r["precision"] >= 0.80:
            suggested_low = r["threshold"]
            break

    for r in reversed(results):
        if r["precision"] >= 0.95:
            suggested_high = r["threshold"]
            break

    print("\n" + "=" * 70)
    print("RECOMMENDED OPERATIONAL THRESHOLDS")
    print("=" * 70)
    print(f"  - Suggested Low Confidence Threshold:  {suggested_low:.2f}")
    print(f"    (Detections between {suggested_low:.2f} and {suggested_high:.2f} are marked UNSURE and never sprayed)")
    print(f"  - Suggested High Confidence Threshold: {suggested_high:.2f}")
    print(f"    (Detections at or above {suggested_high:.2f} trigger automated targeted treatment)")
    print("-" * 70)
    print("Notice: These thresholds are calculated on public benchmark images and must")
    print("be rechecked on real leaves under physical greenhouse lighting and camera conditions.")
    print("=" * 70 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Generate confidence threshold report for leaf_diseased")
    parser.add_argument("--weights", type=Path, default=None, help="Path to best.pt")
    parser.add_argument("--data", type=Path, default=DEFAULT_TEST_DIR, help="Path to test split directory")
    parser.add_argument("--device", type=str, default="", help="Device ('cpu', '0', etc.)")
    args = parser.parse_args()

    weights = args.weights or find_default_weights()
    if not weights.exists():
        print(f"[ERROR] Model weights not found at: {weights}")
        sys.exit(1)

    generate_threshold_report(weights, args.data, device=args.device)


if __name__ == "__main__":
    main()
