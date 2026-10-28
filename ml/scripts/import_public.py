#!/usr/bin/env python3
"""
Import Public Images Pipeline:
- Reads raw images from ml/dataset/raw/public/my_images/<class>/
- Maps each subfolder to class with the same name
- Sets plant=unknown and source=other
- Accepts .jpg, .jpeg, .png (skips other files, e.g. .gitkeep, without failing)
- Resizes to longest side of 640px (aspect ratio preserved)
- Saves into ml/dataset/staging/<class>/
- Appends metadata rows to ml/dataset/metadata.csv
- Fast batch processing without printing per-file lines
"""

import csv
from datetime import datetime
from pathlib import Path
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed
from PIL import Image, ImageOps

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
RAW_DIR = DATASET_DIR / "raw" / "public" / "my_images"
STAGING_DIR = DATASET_DIR / "staging"
METADATA_FILE = DATASET_DIR / "metadata.csv"

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png"}
TARGET_MAX_DIM = 640


def process_single_image(args: tuple) -> tuple:
    """Worker task: open, orient, resize, and save image."""
    src_path, dst_path = args
    try:
        with Image.open(src_path) as img:
            # Transpose according to EXIF orientation tag if present
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")

            # Resize keeping aspect ratio if larger than target
            w, h = img.size
            if max(w, h) > TARGET_MAX_DIM:
                if w >= h:
                    new_w = TARGET_MAX_DIM
                    new_h = int(round(h * (TARGET_MAX_DIM / float(w))))
                else:
                    new_h = TARGET_MAX_DIM
                    new_w = int(round(w * (TARGET_MAX_DIM / float(h))))
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

            dst_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(dst_path, format="JPEG", quality=90)
            return True, None
    except Exception as e:
        return False, str(e)


def run_import():
    if not RAW_DIR.exists():
        print(f"[ERROR] Raw images directory does not exist: {RAW_DIR}")
        sys.exit(1)

    print("=" * 60)
    print("AGRI-ROVER PUBLIC DATASET IMPORT")
    print("=" * 60)
    print(f"Source:      {RAW_DIR}")
    print(f"Destination: {STAGING_DIR}")
    print(f"Max size:    {TARGET_MAX_DIM}px (longest side)")
    print("=" * 60)

    # Ensure staging root exists
    STAGING_DIR.mkdir(parents=True, exist_ok=True)

    # Read existing metadata to avoid duplicate appends
    existing_filenames = set()
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if "filename" in row:
                        existing_filenames.add(row["filename"])
        except Exception:
            pass

    today_str = datetime.now().strftime("%Y-%m-%d")
    TARGET_CLASSES = {"leaf_healthy", "leaf_diseased"}
    classes = [d.name for d in RAW_DIR.iterdir() if d.is_dir() and d.name in TARGET_CLASSES]
    classes.sort()

    total_imported = 0
    total_skipped = 0
    class_stats = {}
    new_metadata_rows = []

    for cls in classes:
        cls_dir = RAW_DIR / cls
        cls_staging = STAGING_DIR / cls
        cls_staging.mkdir(parents=True, exist_ok=True)

        imported = 0
        skipped = 0
        tasks = []

        all_files = list(cls_dir.iterdir())
        for f in all_files:
            if not f.is_file():
                continue
            if f.suffix.lower() not in VALID_EXTENSIONS:
                # Skip .gitkeep or other non-image files
                skipped += 1
                continue

            dest_filename = f"{cls}_{f.name}" if not f.name.startswith(cls) else f.name
            dest_file = cls_staging / dest_filename
            tasks.append((f, dest_file, dest_filename))

        # Process images concurrently
        if tasks:
            print(f"Processing class '{cls}': {len(tasks)} images...")
            batch_args = [(t[0], t[1]) for t in tasks]
            with ProcessPoolExecutor() as executor:
                results = list(executor.map(process_single_image, batch_args, chunksize=50))

            for (src_path, dst_path, dest_filename), (success, err) in zip(tasks, results):
                if success:
                    imported += 1
                    part_val = "leaf" if "leaf" in cls else "none"
                    new_metadata_rows.append({
                        "filename": dest_filename,
                        "source": "other",
                        "plant": "unknown",
                        "plant_id": "unknown",
                        "part": part_val,
                        "label_class": cls,
                        "date": today_str,
                        "lighting": "unknown",
                        "distance_cm": "",
                        "split": "staging"
                    })
                else:
                    skipped += 1

        class_stats[cls] = {"imported": imported, "skipped": skipped, "raw_total": len(all_files)}
        total_imported += imported
        total_skipped += skipped

    # Append to metadata.csv
    if new_metadata_rows:
        file_exists = METADATA_FILE.exists() and METADATA_FILE.stat().st_size > 0
        with open(METADATA_FILE, "a", newline="", encoding="utf-8") as f:
            fieldnames = ["filename", "source", "plant", "plant_id", "part", "label_class", "date", "lighting", "distance_cm", "split"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            if not file_exists:
                writer.writeheader()
            for row in new_metadata_rows:
                if row["filename"] not in existing_filenames:
                    writer.writerow(row)
                    existing_filenames.add(row["filename"])

    print("\n" + "=" * 60)
    print("IMPORT SUMMARY")
    print("=" * 60)
    for cls, stat in class_stats.items():
        print(f"  - {cls:<16}: {stat['imported']:>5} imported, {stat['skipped']:>4} skipped (out of {stat['raw_total']} raw files)")
    print("-" * 60)
    print(f"Total Imported: {total_imported}")
    print(f"Total Skipped:  {total_skipped}")
    print("=" * 60)
    return class_stats


if __name__ == "__main__":
    run_import()
