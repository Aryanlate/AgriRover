#!/usr/bin/env python3
"""
Dataset Status Inspector:
Counts valid image files per class across raw, staging, train, val, and test splits.
Displays a markdown-formatted table and flags empty classes or severe class imbalances.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
CLASSES_FILE = DATASET_DIR / "classes.txt"

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def get_classes() -> list[str]:
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        if classes:
            return classes
    return ["leaf_healthy", "leaf_diseased"]


def count_images(dir_path: Path) -> int:
    if not dir_path.exists():
        return 0
    return sum(1 for p in dir_path.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS)


def run_status():
    classes = get_classes()

    raw_base = DATASET_DIR / "raw" / "public" / "my_images"
    staging_base = DATASET_DIR / "staging"
    train_base = DATASET_DIR / "train"
    val_base = DATASET_DIR / "val"
    test_base = DATASET_DIR / "test"

    table_data = []
    totals = {"raw": 0, "staging": 0, "train": 0, "val": 0, "test": 0, "total": 0}

    for cls in classes:
        raw_c = count_images(raw_base / cls)
        staging_c = count_images(staging_base / cls)
        train_c = count_images(train_base / cls)
        val_c = count_images(val_base / cls)
        test_c = count_images(test_base / cls)
        row_total = raw_c + staging_c + train_c + val_c + test_c

        table_data.append({
            "class": cls,
            "raw": raw_c,
            "staging": staging_c,
            "train": train_c,
            "val": val_c,
            "test": test_c,
            "total": row_total
        })

        totals["raw"] += raw_c
        totals["staging"] += staging_c
        totals["train"] += train_c
        totals["val"] += val_c
        totals["test"] += test_c
        totals["total"] += row_total

    print("=" * 80)
    print("AGRI-ROVER DATASET STATUS SUMMARY")
    print("=" * 80)

    # Format Table
    header = f"| {'Class':<16} | {'Raw (my_images)':<16} | {'Staging':<9} | {'Train':<7} | {'Val':<5} | {'Test':<6} | {'Total':<7} |"
    sep = f"|{'-'*18}|{'-'*18}|{'-'*11}|{'-'*9}|{'-'*7}|{'-'*8}|{'-'*9}|"
    print(header)
    print(sep)

    for row in table_data:
        print(f"| {row['class']:<16} | {row['raw']:>16} | {row['staging']:>9} | {row['train']:>7} | {row['val']:>5} | {row['test']:>6} | {row['total']:>7} |")

    print(sep)
    print(f"| {'TOTAL':<16} | {totals['raw']:>16} | {totals['staging']:>9} | {totals['train']:>7} | {totals['val']:>5} | {totals['test']:>6} | {totals['total']:>7} |")
    print("=" * 80)

    # Warnings for empty folders or severe imbalance
    warnings = []
    raw_counts = {r["class"]: r["raw"] for r in table_data}

    for cls, count in raw_counts.items():
        if count == 0:
            warnings.append(f"WARNING: Class '{cls}' has 0 images in raw folder ({raw_base / cls}).")

    non_zero = [(cls, count) for cls, count in raw_counts.items() if count > 0]
    if len(non_zero) >= 2:
        max_cls, max_c = max(non_zero, key=lambda x: x[1])
        min_cls, min_c = min(non_zero, key=lambda x: x[1])
        ratio = max_c / min_c
        if ratio > 2.0:
            warnings.append(
                f"WARNING: Class imbalance detected. '{max_cls}' ({max_c}) has {ratio:.2f}x more images than '{min_cls}' ({min_c})."
            )

    if warnings:
        print("\nDATASET WARNINGS:")
        for w in warnings:
            print(f"  - {w}")
        print()

    return table_data, warnings


if __name__ == "__main__":
    run_status()
