#!/usr/bin/env python3
"""
Agri-Rover Dataset Splitter (Two-Class Only):
- Reads staged public images from ml/dataset/staging/ for 'leaf_healthy' and 'leaf_diseased'
- Deduplicates images via MD5 hash before partitioning
- Splits into Train (70%), Val (15%), and Test (15%)
- Copies images to ml/dataset/{train,val,test}/<class>/
- Emits prominent warning: Test set is NOT from ESP32-CAM photos
"""

import hashlib
from pathlib import Path
import random
import shutil
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
STAGING_DIR = DATASET_DIR / "staging"
TRAIN_DIR = DATASET_DIR / "train"
VAL_DIR = DATASET_DIR / "val"
TEST_DIR = DATASET_DIR / "test"
CLASSES_FILE = DATASET_DIR / "classes.txt"

TARGET_CLASSES = ["leaf_healthy", "leaf_diseased"]
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def compute_md5(file_path: Path) -> str:
    h = hashlib.md5()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_split(train_ratio: float = 0.70, val_ratio: float = 0.15, test_ratio: float = 0.15, seed: int = 42):
    random.seed(seed)

    print("=" * 60)
    print("AGRI-ROVER TWO-CLASS DATASET SPLIT")
    print("=" * 60)
    print(f"Classes:    {TARGET_CLASSES}")
    print(f"Ratios:     Train: {train_ratio*100:.0f}%, Val: {val_ratio*100:.0f}%, Test: {test_ratio*100:.0f}%")
    print("=" * 60)

    # Clean existing destination split folders for these classes
    for split_dir in [TRAIN_DIR, VAL_DIR, TEST_DIR]:
        for cls in TARGET_CLASSES:
            cls_target = split_dir / cls
            if cls_target.exists():
                shutil.rmtree(cls_target)
            cls_target.mkdir(parents=True, exist_ok=True)

    split_counts = {"train": {}, "val": {}, "test": {}}

    for cls in TARGET_CLASSES:
        cls_staging = STAGING_DIR / cls
        if not cls_staging.exists():
            print(f"[ERROR] Staging folder missing for class: {cls_staging}")
            sys.exit(1)

        raw_files = [p for p in cls_staging.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]

        # 1. Deduplicate by MD5 hash
        seen_hashes = {}
        unique_files = []
        duplicates_count = 0

        for f in raw_files:
            file_hash = compute_md5(f)
            if file_hash in seen_hashes:
                duplicates_count += 1
            else:
                seen_hashes[file_hash] = f
                unique_files.append(f)

        print(f"Class '{cls}': {len(raw_files)} files -> {duplicates_count} duplicates removed -> {len(unique_files)} unique images.")

        if not unique_files:
            print(f"[ERROR] No unique images found for class '{cls}'.")
            sys.exit(1)

        # 2. Shuffle & Partition
        random.shuffle(unique_files)
        total_unique = len(unique_files)
        n_train = int(round(total_unique * train_ratio))
        n_val = int(round(total_unique * val_ratio))
        
        train_files = unique_files[:n_train]
        val_files = unique_files[n_train:n_train + n_val]
        test_files = unique_files[n_train + n_val:]

        split_map = {
            "train": (TRAIN_DIR / cls, train_files),
            "val": (VAL_DIR / cls, val_files),
            "test": (TEST_DIR / cls, test_files),
        }

        for split_name, (dest_dir, files) in split_map.items():
            for f in files:
                shutil.copy2(f, dest_dir / f.name)
            split_counts[split_name][cls] = len(files)

    print("\n" + "=" * 60)
    print("SPLIT SUMMARY")
    print("=" * 60)
    for split_name in ["train", "val", "test"]:
        counts_str = ", ".join(f"{c}: {split_counts[split_name].get(c, 0)}" for c in TARGET_CLASSES)
        total_split = sum(split_counts[split_name].values())
        print(f"  - {split_name.capitalize():<6}: {total_split:>5} images ({counts_str})")
    print("=" * 60)

    # Required warning: Test set is not from ESP32-CAM photos
    print("\n> [!WARNING]")
    print("> Warning: The test set is derived from public benchmark photos, NOT from ESP32-CAM photos.")
    print("> Camera characteristics, lighting, and sensor response may vary when deployed on the rover.\n")


if __name__ == "__main__":
    run_split()
