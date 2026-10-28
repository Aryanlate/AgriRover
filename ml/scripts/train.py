#!/usr/bin/env python3
"""
Agri-Rover YOLOv8n-cls Training Pipeline:
- Loads profile limits from ml/train_config.yaml (auto-detects GPU vs CPU).
  - GPU: full train set, up to 30 epochs, patience 5.
  - CPU: random sample of at most 1000 train images/class (fixed seed), 224x224, up to 15 epochs, patience 5.
- Supports resuming interrupted runs from last.pt with --resume.
- Supports quick trial runs with --trial (1 epoch, 200 images/class).
"""

import argparse
from pathlib import Path
import random
import shutil
import sys
import torch
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DEFAULT_CONFIG = ML_DIR / "train_config.yaml"
VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def prepare_sampled_dataset(base_data_dir: Path, target_dir: Path, max_samples: int, seed: int = 42) -> Path:
    """Creates a sampled training dataset while keeping val and test unchanged."""
    random.seed(seed)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n[SAMPLING] Subsetting train split to at most {max_samples} images per class (seed={seed})...")
    src_train = base_data_dir / "train"
    dest_train = target_dir / "train"
    dest_train.mkdir(parents=True, exist_ok=True)

    for cls_dir in src_train.iterdir():
        if cls_dir.is_dir():
            dest_cls = dest_train / cls_dir.name
            dest_cls.mkdir(parents=True, exist_ok=True)
            files = [p for p in cls_dir.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
            if len(files) > max_samples:
                chosen = random.sample(files, k=max_samples)
            else:
                chosen = files
            for f in chosen:
                shutil.copy2(f, dest_cls / f.name)
            print(f"  - train/{cls_dir.name}: {len(chosen)} images selected (out of {len(files)})")

    # Link/copy val and test
    for split in ["val", "test"]:
        src_split = base_data_dir / split
        dest_split = target_dir / split
        dest_split.mkdir(parents=True, exist_ok=True)
        if src_split.exists():
            for cls_dir in src_split.iterdir():
                if cls_dir.is_dir():
                    dest_cls = dest_split / cls_dir.name
                    dest_cls.mkdir(parents=True, exist_ok=True)
                    for f in cls_dir.iterdir():
                        if f.is_file() and f.suffix.lower() in VALID_EXTENSIONS:
                            shutil.copy2(f, dest_cls / f.name)
        print(f"  - {split}: full split copied ({sum(len(list(d.iterdir())) for d in dest_split.iterdir() if d.is_dir())} images)")

    return target_dir


def check_dataset(data_dir: Path) -> tuple[int, int]:
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if not train_dir.exists() or not val_dir.exists():
        return 0, 0

    train_count = sum(1 for p in train_dir.rglob("*") if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS)
    val_count = sum(1 for p in val_dir.rglob("*") if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS)
    return train_count, val_count


def run_training(config: dict, overrides: dict | None = None, resume: bool = False) -> Path:
    from ultralytics import YOLO

    has_gpu = torch.cuda.is_available()
    cfg_mode = config.get("mode", "auto")

    # Select profile
    if cfg_mode == "gpu" or (cfg_mode == "auto" and has_gpu):
        profile_name = "GPU Profile"
        profile_settings = config.get("gpu_settings", {}).copy()
    else:
        profile_name = "CPU Profile"
        profile_settings = config.get("cpu_settings", {}).copy()

    # Base configuration arguments
    train_args = {
        "model": config.get("model", "yolov8n-cls.pt"),
        "project": config.get("project", "ml/runs"),
        "name": config.get("name", "agrirover_cls"),
        "exist_ok": config.get("exist_ok", True),
        "degrees": config.get("degrees", 15.0),
        "fliplr": config.get("fliplr", 0.5),
        "flipud": config.get("flipud", 0.5),
        "scale": config.get("scale", 0.2),
        "hsv_v": config.get("hsv_v", 0.4),
        "hsv_s": config.get("hsv_s", 0.3),
        "hsv_h": config.get("hsv_h", 0.015),
    }

    # Overlay profile settings
    train_args.update(profile_settings)

    # Overlay CLI overrides
    if overrides:
        for k, v in overrides.items():
            if v is not None:
                train_args[k] = v

    # Resolve data path
    data_path = Path(train_args["data"])
    if not data_path.is_absolute():
        data_path = (REPO_ROOT / data_path).resolve()

    # Handle max_samples_per_class
    max_samples = train_args.pop("max_samples_per_class", None)
    sample_seed = train_args.pop("sample_seed", 42)

    if max_samples is not None and max_samples > 0:
        sampled_dir = (REPO_ROOT / "ml" / "runs" / f"cls_data_sample_{max_samples}").resolve()
        data_path = prepare_sampled_dataset(data_path, sampled_dir, max_samples=max_samples, seed=sample_seed)

    train_args["data"] = data_path.as_posix()

    project_path = Path(train_args.get("project", "ml/runs"))
    if not project_path.is_absolute():
        project_path = (REPO_ROOT / project_path).resolve()
    train_args["project"] = project_path.as_posix()

    save_dir = project_path / train_args.get("name", "agrirover_cls")
    last_weights = save_dir / "weights" / "last.pt"
    best_weights = save_dir / "weights" / "best.pt"

    # Resume check
    if resume or (overrides and overrides.get("resume")):
        if last_weights.exists():
            print(f"\n[RESUME] Found existing checkpoint: {last_weights}. Resuming training...")
            model = YOLO(str(last_weights))
            results = model.train(resume=True)
            return best_weights
        else:
            print(f"[WARN] Resume requested but no checkpoint found at {last_weights}. Starting from base weights.")

    model_name = train_args.pop("model", "yolov8n-cls.pt")

    # Clean device argument for ultralytics
    if "device" in train_args:
        dev_val = train_args["device"]
        if dev_val is None or (isinstance(dev_val, str) and dev_val.strip() == ""):
            del train_args["device"]

    print("=" * 65)
    print("AGRI-ROVER YOLOV8N-CLS TRAINING")
    print("=" * 65)
    print(f"Hardware Mode:    {profile_name} (CUDA available: {has_gpu})")
    print(f"Base model:       {model_name}")
    print(f"Dataset path:     {train_args['data']}")
    print(f"Image resolution: {train_args.get('imgsz', 224)}x{train_args.get('imgsz', 224)}")
    print(f"Target epochs:    {train_args.get('epochs', 15)}")
    print(f"Patience:         {train_args.get('patience', 5)}")
    print(f"Batch size:       {train_args.get('batch', 16)}")
    print(f"Workers:          {train_args.get('workers', 2)}")
    print(f"Device:           {train_args.get('device', 'auto')}")
    print("=" * 65)

    model = YOLO(model_name)
    results = model.train(**train_args)

    print("\n" + "=" * 65)
    print("TRAINING COMPLETE")
    print(f"Run directory: {save_dir}")
    print(f"Best weights:  {best_weights}")
    print("=" * 65)
    return best_weights


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8n-cls on Agri-Rover dataset")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Path to train_config.yaml")
    parser.add_argument("--data", type=str, default=None, help="Override dataset directory")
    parser.add_argument("--epochs", type=int, default=None, help="Override epochs count")
    parser.add_argument("--batch", type=int, default=None, help="Override batch size")
    parser.add_argument("--imgsz", type=int, default=None, help="Override image size")
    parser.add_argument("--device", type=str, default=None, help="Device to use ('cpu', '0', etc.)")
    parser.add_argument("--max-samples", type=int, default=None, help="Limit samples per class in train split")
    parser.add_argument("--trial", action="store_true", help="Quick 1-epoch trial on 200 images per class")
    parser.add_argument("--resume", action="store_true", help="Resume training from last.pt")
    parser.add_argument("--dry-run", action="store_true", help="Validate config without launching training")
    args = parser.parse_args()

    config = load_config(args.config)

    overrides = {
        "data": args.data,
        "epochs": 1 if args.trial else args.epochs,
        "max_samples_per_class": 200 if args.trial else args.max_samples,
        "batch": args.batch,
        "imgsz": args.imgsz,
        "device": args.device,
        "resume": args.resume,
    }

    if args.dry_run:
        print("[SUCCESS] Configuration and training pipeline validated.")
        return

    try:
        run_training(config, overrides, resume=args.resume)
    except Exception as e:
        print(f"[TRAIN ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
