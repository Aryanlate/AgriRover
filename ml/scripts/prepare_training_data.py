#!/usr/bin/env python3
"""
Agri-Rover Training Data Preparation Pipeline:
- Builds ml/runs/cls_data/ with train, val, and test splits.
- Uses only the classes that exist in ml/dataset/train (leaf_healthy, leaf_diseased).
- train: copies all original train images plus a degraded copy of a random 50% of them.
  Degradations imitate a weak camera (ESP32-CAM) by mixing at random:
    - Gaussian blur
    - JPEG compression (quality 30 to 90)
    - Downscale then upscale
    - Colour and brightness variation
    - Slight noise
- val and test: plain copies of the original images, never degraded.
- Leaves ml/dataset/ strictly untouched.
"""

import argparse
import io
from pathlib import Path
import random
import shutil
import sys
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
SRC_DATASET_DIR = ML_DIR / "dataset"
DEST_CLS_DATA_DIR = ML_DIR / "runs" / "cls_data"
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def apply_camera_degradations(img: Image.Image) -> Image.Image:
    """Applies a random combination of camera degradations imitating an ESP32-CAM."""
    out = img.convert("RGB")
    w, h = out.size

    # Available degradation techniques
    degradation_ops = ["blur", "jpeg", "rescale", "color_brightness", "noise"]
    # Pick a random mix of 2 to 4 degradation operations
    chosen_ops = random.sample(degradation_ops, k=random.randint(2, 4))

    for op in chosen_ops:
        if op == "blur":
            radius = random.uniform(0.8, 2.2)
            out = out.filter(ImageFilter.GaussianBlur(radius=radius))

        elif op == "jpeg":
            quality = random.randint(30, 90)
            buf = io.BytesIO()
            out.save(buf, format="JPEG", quality=quality)
            buf.seek(0)
            out = Image.open(buf).convert("RGB")

        elif op == "rescale":
            down_scale = random.uniform(0.35, 0.70)
            dw, dh = max(16, int(w * down_scale)), max(16, int(h * down_scale))
            resample_mode = random.choice([Image.Resampling.BILINEAR, Image.Resampling.NEAREST])
            out = out.resize((dw, dh), resample=resample_mode).resize((w, h), resample=Image.Resampling.BILINEAR)

        elif op == "color_brightness":
            color_factor = random.uniform(0.70, 1.30)
            bright_factor = random.uniform(0.70, 1.30)
            out = ImageEnhance.Color(out).enhance(color_factor)
            out = ImageEnhance.Brightness(out).enhance(bright_factor)

        elif op == "noise":
            arr = np.array(out, dtype=np.float32)
            noise_std = random.uniform(5.0, 16.0)
            noise = np.random.normal(0, noise_std, arr.shape)
            arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
            out = Image.fromarray(arr)

    return out


def prepare_data(src_dir: Path = SRC_DATASET_DIR, dest_dir: Path = DEST_CLS_DATA_DIR, seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)

    train_src = src_dir / "train"
    if not train_src.exists():
        print(f"[ERROR] Source train directory missing: {train_src}")
        sys.exit(1)

    # Detect classes present in ml/dataset/train
    classes = sorted([d.name for d in train_src.iterdir() if d.is_dir()])
    if not classes:
        print(f"[ERROR] No class directories found in {train_src}")
        sys.exit(1)

    print("=" * 65)
    print("AGRI-ROVER TRAINING DATA PREPARATION (WEAK CAMERA EMULATION)")
    print("=" * 65)
    print(f"Source dataset:   {src_dir}")
    print(f"Destination:      {dest_dir}")
    print(f"Active classes:   {classes}")
    print("=" * 65)

    # Clean/create target directory structure
    if dest_dir.exists():
        shutil.rmtree(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)

    summary = {"train_original": {}, "train_degraded": {}, "val": {}, "test": {}}

    # 1. Process Train Split (all originals + 50% degraded copies)
    print("\n[1/3] Preparing TRAIN split (Originals + 50% Camera-Degraded Copies)...")
    for cls in classes:
        cls_src = train_src / cls
        cls_dest = dest_dir / "train" / cls
        cls_dest.mkdir(parents=True, exist_ok=True)

        files = [p for p in cls_src.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
        # Copy all originals
        for f in files:
            shutil.copy2(f, cls_dest / f.name)
        summary["train_original"][cls] = len(files)

        # Select 50% at random for degradation
        sample_size = int(round(len(files) * 0.50))
        degrade_targets = random.sample(files, k=sample_size)
        degraded_count = 0

        for f in degrade_targets:
            try:
                with Image.open(f) as img:
                    degraded_img = apply_camera_degradations(img)
                    out_name = f"{f.stem}_degraded.jpg"
                    degraded_img.save(cls_dest / out_name, format="JPEG", quality=85)
                    degraded_count += 1
            except Exception as e:
                print(f"[WARN] Could not degrade {f.name}: {e}")

        summary["train_degraded"][cls] = degraded_count
        print(f"  - train/{cls}: {len(files)} originals + {degraded_count} degraded = {len(files) + degraded_count} total")

    # 2. Process Val Split (Plain copies, never degraded)
    print("\n[2/3] Preparing VAL split (Plain Copies, Never Degraded)...")
    val_src = src_dir / "val"
    for cls in classes:
        cls_dest = dest_dir / "val" / cls
        cls_dest.mkdir(parents=True, exist_ok=True)
        cls_src = val_src / cls
        if cls_src.exists():
            files = [p for p in cls_src.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
            for f in files:
                shutil.copy2(f, cls_dest / f.name)
            summary["val"][cls] = len(files)
        else:
            summary["val"][cls] = 0
        print(f"  - val/{cls}: {summary['val'][cls]} images")

    # 3. Process Test Split (Plain copies, never degraded)
    print("\n[3/3] Preparing TEST split (Plain Copies, Never Degraded)...")
    test_src = src_dir / "test"
    for cls in classes:
        cls_dest = dest_dir / "test" / cls
        cls_dest.mkdir(parents=True, exist_ok=True)
        cls_src = test_src / cls
        if cls_src.exists():
            files = [p for p in cls_src.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
            for f in files:
                shutil.copy2(f, cls_dest / f.name)
            summary["test"][cls] = len(files)
        else:
            summary["test"][cls] = 0
        print(f"  - test/{cls}: {summary['test'][cls]} images")

    print("\n" + "=" * 65)
    print("PREPARATION COMPLETE")
    print("=" * 65)
    total_train = sum(summary["train_original"].values()) + sum(summary["train_degraded"].values())
    total_val = sum(summary["val"].values())
    total_test = sum(summary["test"].values())
    print(f"Output folder: {dest_dir}")
    print(f"  - Train: {total_train:>6} images ({sum(summary['train_original'].values())} orig + {sum(summary['train_degraded'].values())} degraded)")
    print(f"  - Val:   {total_val:>6} images (plain originals)")
    print(f"  - Test:  {total_test:>6} images (plain originals)")
    print("=" * 65 + "\n")


def main():
    parser = argparse.ArgumentParser(description="Prepare YOLOv8 classification training data with camera degradation")
    parser.add_argument("--src", type=Path, default=SRC_DATASET_DIR, help="Source dataset path (default: ml/dataset)")
    parser.add_argument("--dest", type=Path, default=DEST_CLS_DATA_DIR, help="Output path (default: ml/runs/cls_data)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    prepare_data(src_dir=args.src, dest_dir=args.dest, seed=args.seed)


if __name__ == "__main__":
    main()
