#!/usr/bin/env python3
"""
Agri-Rover Model Evaluation Pipeline
Evaluates YOLOv8n-cls on the test split (ml/dataset/test/).
Reports:
  - Top-1 overall accuracy
  - Per-class precision, recall, and F1-score
  - Confusion matrix
  - Separate metrics for leaf classes and stem classes
  - Generates a markdown report (ml/evaluation_report.md)
  - Checks target goals: accuracy >= 85% and no class recall < 0.70
"""

import argparse
from datetime import datetime
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DEFAULT_TEST_DIR = ML_DIR / "dataset" / "test"
DEFAULT_REPORT_PATH = ML_DIR / "evaluation_report.md"
CLASSES_FILE = ML_DIR / "dataset" / "classes.txt"

LEAF_CLASSES = {"leaf_healthy", "leaf_diseased"}


def load_classes() -> list[str]:
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        if classes:
            return classes
    return ["leaf_healthy", "leaf_diseased"]


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


def resolve_test_dir(input_path: Path) -> Path:
    """Handles both ml/dataset and ml/dataset/test paths transparently."""
    if (input_path / "test").is_dir():
        return input_path / "test"
    return input_path


def evaluate_model(model_path: Path, test_dir: Path, report_path: Path, device: str = ""):
    test_dir = resolve_test_dir(test_dir)
    classes = load_classes()
    class_to_idx = {name: i for i, name in enumerate(classes)}
    num_classes = len(classes)
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

    # Gather test samples
    samples = []  # list of (image_path, true_class_name, true_class_idx)
    for cls_name in classes:
        cls_dir = test_dir / cls_name
        if cls_dir.exists():
            for img_p in cls_dir.iterdir():
                if img_p.is_file() and img_p.suffix.lower() in valid_exts:
                    samples.append((img_p, cls_name, class_to_idx[cls_name]))

    total_samples = len(samples)
    print(f"Loaded {total_samples} test images from {test_dir}")

    if total_samples == 0:
        msg = (
            "# Agri-Rover Test Split Evaluation Report\n\n"
            f"- **Date**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"- **Model**: `{model_path}`\n"
            f"- **Status**: No test images found in `{test_dir}`.\n\n"
            "Please populate `ml/dataset/test/` with rover test photos to run evaluation.\n"
        )
        report_path.write_text(msg, encoding="utf-8")
        print(f"[WARNING] No test images found. Empty report written to {report_path}")
        print("\n============================================================")
        print("AGRI-ROVER PERFORMANCE GOALS (NO DATA IN TEST SPLIT)")
        print("Goal 1: Overall accuracy >= 85.0% on test photos: [PENDING - NO DATA]")
        print("Goal 2: No class recall below 0.70:               [PENDING - NO DATA]")
        print("============================================================\n")
        return

    from ultralytics import YOLO
    print(f"Loading model weights from {model_path}...")
    model = YOLO(str(model_path))

    # Confusion matrix: rows = true, cols = pred
    cm = [[0 for _ in range(num_classes)] for _ in range(num_classes)]
    correct_count = 0
    predictions = []

    dev_arg = device if device else None

    for img_path, true_name, true_idx in samples:
        results = model.predict(source=str(img_path), imgsz=224, device=dev_arg, verbose=False)
        pred_res = results[0]
        pred_idx = int(pred_res.probs.top1)
        pred_conf = float(pred_res.probs.top1conf)
        pred_name = get_pred_class_name(model.names, pred_idx)

        # Resolve index within our known classes
        if pred_name in class_to_idx:
            resolved_pred_idx = class_to_idx[pred_name]
        else:
            resolved_pred_idx = -1  # unmapped class

        if 0 <= resolved_pred_idx < num_classes:
            cm[true_idx][resolved_pred_idx] += 1
            if resolved_pred_idx == true_idx:
                correct_count += 1
                is_correct = True
            else:
                is_correct = False
        else:
            is_correct = False

        predictions.append({
            "path": img_path,
            "true_name": true_name,
            "pred_name": pred_name,
            "conf": pred_conf,
            "correct": is_correct
        })

    # Overall metrics
    overall_acc = correct_count / total_samples

    # Per-class metrics
    per_class_stats = {}
    for i, name in enumerate(classes):
        tp = cm[i][i]
        fp = sum(cm[r][i] for r in range(num_classes) if r != i)
        fn = sum(cm[i][c] for c in range(num_classes) if c != i)
        support = sum(cm[i])

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0

        per_class_stats[name] = {
            "tp": tp, "fp": fp, "fn": fn, "support": support,
            "precision": prec, "recall": rec, "f1": f1
        }

    # Leaf classes separate evaluation
    leaf_samples = [s for s in samples if s[1] in LEAF_CLASSES]
    leaf_correct = sum(1 for p in predictions if p["true_name"] in LEAF_CLASSES and p["correct"])
    leaf_acc = leaf_correct / len(leaf_samples) if leaf_samples else 0.0

    # Goal Checks
    pass_acc = overall_acc >= 0.85
    min_recall = min(stats["recall"] for stats in per_class_stats.values()) if per_class_stats else 0.0
    min_recall_cls = min(per_class_stats.items(), key=lambda kv: kv[1]["recall"])[0] if per_class_stats else "N/A"
    pass_recall = min_recall >= 0.70

    # Generate Markdown Report
    lines = [
        "# Agri-Rover Two-Class Test Split Evaluation Report",
        "",
        "> [!WARNING]",
        "> **Notice**: The test set is **not** from ESP32-CAM photos. It evaluates performance on public leaf benchmark images. Domain shift may occur on physical rover hardware.",
        "",
        f"- **Timestamp**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"- **Model Weights**: `{model_path}`",
        f"- **Test Dataset Path**: `{test_dir}`",
        f"- **Total Test Samples**: {total_samples}",
        "",
        "## Overall Performance",
        "",
        "| Metric | Value | Target | Status |",
        "|---|---|---|---|",
        f"| **Top-1 Accuracy** | **{overall_acc * 100:.2f}%** | >= 85.0% | {'PASS' if pass_acc else 'FAIL'} |",
        f"| **Minimum Class Recall** | **{min_recall * 100:.2f}%** (`{min_recall_cls}`) | >= 70.0% | {'PASS' if pass_recall else 'FAIL'} |",
        "",
        "## Per-Class Metrics",
        "",
        "| Class | Support | Precision | Recall | F1-Score | Status (Recall >= 0.70) |",
        "|---|---|---|---|---|---|",
    ]

    for name in classes:
        s = per_class_stats[name]
        status = "PASS" if s["recall"] >= 0.70 else "FAIL"
        lines.append(f"| `{name}` | {s['support']} | {s['precision']:.3f} | {s['recall']:.3f} | {s['f1']:.3f} | {status} |")

    lines.extend([
        "",
        "## Confusion Matrix",
        "",
        "Rows represent **Ground Truth**, columns represent **Predicted Class**:",
        "",
    ])

    header = "| True / Pred | " + " | ".join(f"`{c}`" for c in classes) + " |"
    sep = "|---| " + " | ".join("---" for _ in classes) + " |"
    lines.append(header)
    lines.append(sep)

    for i, name in enumerate(classes):
        row_str = f"| `{name}` | " + " | ".join(str(cm[i][c]) for c in range(num_classes)) + " |"
        lines.append(row_str)

    lines.extend([
        "",
        "## Performance Goals Verification",
        "",
        f"- **Goal 1 (Accuracy >= 85%)**: {'PASSED' if pass_acc else 'FAILED'} ({overall_acc * 100:.2f}%)",
        f"- **Goal 2 (No recall < 0.70)**: {'PASSED' if pass_recall else 'FAILED'} (Lowest: {min_recall * 100:.2f}% in `{min_recall_cls}`)",
        f"- **Mission Acceptance**: {'APPROVED' if (pass_acc and pass_recall) else 'REJECTED'}",
    ])

    report_content = "\n".join(lines) + "\n"
    report_path.write_text(report_content, encoding="utf-8")
    print(f"\nReport written to: {report_path}")

    # Terminal output of goals
    print("\n" + "=" * 60)
    print("AGRI-ROVER PERFORMANCE GOALS EVALUATION")
    print("=" * 60)
    print(f"Goal 1: Overall accuracy >= 85.0% on test photos")
    print(f"        Result: {overall_acc * 100:.2f}% -> [{'PASS' if pass_acc else 'FAIL'}]")
    print(f"Goal 2: No class recall below 0.70")
    print(f"        Result: Min recall = {min_recall:.3f} ({min_recall_cls}) -> [{'PASS' if pass_recall else 'FAIL'}]")
    print("-" * 60)
    if pass_acc and pass_recall:
        print("ALL GOALS MET: Model satisfies Agri-Rover mission deployment criteria.")
    else:
        print("GOALS NOT MET: Model requires dataset expansion or additional training.")
    print("=" * 60 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Evaluate YOLOv8n-cls on Agri-Rover test split")
    parser.add_argument("--weights", type=Path, default=None, help="Path to best.pt")
    parser.add_argument("--data", type=Path, default=DEFAULT_TEST_DIR, help="Path to test split directory")
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT_PATH, help="Path to output markdown report")
    parser.add_argument("--device", type=str, default="", help="Device ('cpu', '0', etc.)")
    args = parser.parse_args()

    weights = args.weights or find_default_weights()
    if not weights.exists():
        print(f"[ERROR] Model weights not found at: {weights}")
        print("Train a model first using `python ml/scripts/train.py` or specify `--weights <path>`.")
        sys.exit(1)

    evaluate_model(
        model_path=weights,
        test_dir=args.data,
        report_path=args.output,
        device=args.device,
    )


if __name__ == "__main__":
    main()
