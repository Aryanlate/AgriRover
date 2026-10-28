#!/usr/bin/env python3
"""
Agri-Rover Dataset Integrity Checker (Two-Class Only):
- Validates that train, val, and test splits contain only 'leaf_healthy' and 'leaf_diseased'
- Verifies no background or stem classes exist
- Checks that all images can be parsed by PIL without corruption
- Verifies zero data leakage (no image hash appears in multiple splits)
"""

import hashlib
from pathlib import Path
import sys
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
CLASSES_FILE = DATASET_DIR / "classes.txt"

TARGET_CLASSES = ["leaf_healthy", "leaf_diseased"]
SPLITS = ["train", "val", "test"]
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def compute_md5(file_path: Path) -> str:
    h = hashlib.md5()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def run_checks() -> bool:
    print("=" * 60)
    print("AGRI-ROVER DATASET INTEGRITY CHECK")
    print("=" * 60)

    # 1. Check classes.txt
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        if classes != TARGET_CLASSES:
            print(f"[FAIL] classes.txt mismatch. Expected {TARGET_CLASSES}, got {classes}")
            return False
        print(f"[PASS] classes.txt verified: {classes}")
    else:
        print("[FAIL] classes.txt missing!")
        return False

    # 2. Check directory structure
    total_images = 0
    split_hashes = {"train": set(), "val": set(), "test": set()}
    corrupt_images = []

    for split in SPLITS:
        split_dir = DATASET_DIR / split
        if not split_dir.exists():
            print(f"[FAIL] Split directory missing: {split_dir}")
            return False

        subdirs = [d.name for d in split_dir.iterdir() if d.is_dir()]
        disallowed = [d for d in subdirs if d not in TARGET_CLASSES]
        if disallowed:
            print(f"[FAIL] Found unexpected class subfolders in {split}: {disallowed}")
            return False

        for cls in TARGET_CLASSES:
            cls_dir = split_dir / cls
            if not cls_dir.exists():
                print(f"[FAIL] Missing class folder: {cls_dir}")
                return False

            files = [p for p in cls_dir.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
            if len(files) == 0:
                print(f"[WARN] Class folder is empty: {cls_dir}")
            else:
                for img_p in files:
                    total_images += 1
                    # Verify PIL readability
                    try:
                        with Image.open(img_p) as im:
                            im.verify()
                    except Exception as e:
                        corrupt_images.append((img_p, str(e)))

                    # Hash for leakage check
                    split_hashes[split].add(compute_md5(img_p))

            print(f"  - {split}/{cls}: {len(files)} valid images")

    # 3. Check for corruption
    if corrupt_images:
        print(f"\n[FAIL] Found {len(corrupt_images)} corrupt images!")
        for p, err in corrupt_images[:5]:
            print(f"    {p.name}: {err}")
        return False
    else:
        print(f"[PASS] Image header integrity verified across all images.")

    # 4. Check for data leakage
    leak_train_val = split_hashes["train"].intersection(split_hashes["val"])
    leak_train_test = split_hashes["train"].intersection(split_hashes["test"])
    leak_val_test = split_hashes["val"].intersection(split_hashes["test"])

    if leak_train_val or leak_train_test or leak_val_test:
        print(f"[FAIL] Data leakage detected between splits:")
        if leak_train_val:
            print(f"  - {len(leak_train_val)} images shared between train and val")
        if leak_train_test:
            print(f"  - {len(leak_train_test)} images shared between train and test")
        if leak_val_test:
            print(f"  - {len(leak_val_test)} images shared between val and test")
        return False
    else:
        print(f"[PASS] Zero data leakage verified between train, val, and test splits.")

    print("=" * 60)
    print("ALL INTEGRITY CHECKS PASSED SUCCESSFULLY")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = run_checks()
    sys.exit(0 if success else 1)
