#!/usr/bin/env python3
"""
Agri-Rover YOLOv8n-cls Training Pipeline
Loads settings from ml/train_config.yaml and trains the image classifier.
"""

import argparse
import sys
from pathlib import Path
import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DEFAULT_CONFIG = ML_DIR / "train_config.yaml"


def load_config(config_path: Path) -> dict:
    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def sync_background_class(data_dir: Path):
    """If ml/dataset/raw/public/my_images/background/ has images, include it as the background class."""
    raw_bg = data_dir / "raw" / "public" / "my_images" / "background"
    if not raw_bg.exists():
        return
    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    raw_bg_imgs = [p for p in raw_bg.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
    if not raw_bg_imgs:
        return

    import shutil
    train_bg = data_dir / "train" / "background"
    val_bg = data_dir / "val" / "background"
    train_bg.mkdir(parents=True, exist_ok=True)
    val_bg.mkdir(parents=True, exist_ok=True)

    existing_train = [p for p in train_bg.iterdir() if p.is_file() and p.suffix.lower() in valid_exts]
    if not existing_train:
        split_idx = max(1, int(len(raw_bg_imgs) * 0.8))
        for img in raw_bg_imgs[:split_idx]:
            shutil.copy2(img, train_bg / img.name)
        for img in raw_bg_imgs[split_idx:]:
            shutil.copy2(img, val_bg / img.name)
        print(f"[INFO] Included {len(raw_bg_imgs)} background images from {raw_bg} into background class splits.")


def check_dataset(data_dir: Path) -> tuple[int, int]:
    sync_background_class(data_dir)
    train_dir = data_dir / "train"
    val_dir = data_dir / "val"
    if not train_dir.exists() or not val_dir.exists():
        print(f"[ERROR] Dataset splits missing in {data_dir}. Expected 'train' and 'val' folders.")
        return 0, 0

    valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    train_count = sum(1 for p in train_dir.rglob("*") if p.is_file() and p.suffix.lower() in valid_exts)
    val_count = sum(1 for p in val_dir.rglob("*") if p.is_file() and p.suffix.lower() in valid_exts)

    print(f"Dataset status at {data_dir}:")
    print(f"  - Train images: {train_count}")
    print(f"  - Val images:   {val_count}")
    return train_count, val_count


def run_training(config: dict, override_args: dict | None = None) -> Path:
    from ultralytics import YOLO

    train_args = config.copy()
    if override_args:
        for k, v in override_args.items():
            if v is not None:
                train_args[k] = v

    model_name = train_args.pop("model", "yolov8n-cls.pt")

    # Clean device argument (omit if None or empty string to allow auto-detection)
    if "device" in train_args:
        dev_val = train_args["device"]
        if dev_val is None or (isinstance(dev_val, str) and dev_val.strip() == ""):
            del train_args["device"]

    # Resolve paths relative to repository root
    data_path = Path(train_args["data"])
    if not data_path.is_absolute():
        data_path = (REPO_ROOT / data_path).resolve()
    train_args["data"] = data_path.as_posix()

    project_path = Path(train_args.get("project", "ml/runs"))
    if not project_path.is_absolute():
        project_path = (REPO_ROOT / project_path).resolve()
    train_args["project"] = project_path.as_posix()

    print("=" * 60)
    print("AGRI-ROVER YOLOV8N-CLS TRAINING")
    print("=" * 60)
    print(f"Base model:  {model_name}")
    print(f"Dataset:     {train_args['data']}")
    print(f"Image size:  {train_args.get('imgsz', 224)}")
    print(f"Max epochs:  {train_args.get('epochs', 50)}")
    print(f"Patience:    {train_args.get('patience', 10)}")
    print(f"Augmentations enabled: degrees={train_args.get('degrees')}, fliplr={train_args.get('fliplr')}, "
          f"flipud={train_args.get('flipud')}, scale={train_args.get('scale')}, hsv_v={train_args.get('hsv_v')}")
    print("=" * 60)

    model = YOLO(model_name)
    results = model.train(**train_args)

    save_dir = Path(results.save_dir) if hasattr(results, "save_dir") else (project_path / train_args.get("name", "exp"))
    best_weights = save_dir / "weights" / "best.pt"

    print("\n" + "=" * 60)
    print("TRAINING COMPLETE")
    print(f"Run directory: {save_dir}")
    print(f"Best weights:  {best_weights}")
    print("=" * 60)
    return best_weights


def main():
    parser = argparse.ArgumentParser(description="Train YOLOv8n-cls on Agri-Rover dataset")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="Path to train_config.yaml")
    parser.add_argument("--epochs", type=int, default=None, help="Override epochs count")
    parser.add_argument("--batch", type=int, default=None, help="Override batch size")
    parser.add_argument("--imgsz", type=int, default=None, help="Override image size")
    parser.add_argument("--device", type=str, default=None, help="Device to use ('cpu', '0', etc.)")
    parser.add_argument("--dry-run", action="store_true", help="Validate config and dataset without launching training")
    args = parser.parse_args()

    config = load_config(args.config)
    dataset_path = Path(config.get("data", "ml/dataset"))
    if not dataset_path.is_absolute():
        dataset_path = (REPO_ROOT / dataset_path).resolve()

    train_count, val_count = check_dataset(dataset_path)

    if args.dry_run:
        print("[SUCCESS] Configuration and paths validated successfully.")
        return

    if train_count == 0:
        print("\n[ERROR] Training split has 0 images.")
        print("Please place images into `ml/dataset/train/<class>/` before running training.")
        print("Classes: leaf_healthy, leaf_diseased (and optional background).")
        sys.exit(1)

    overrides = {
        "epochs": args.epochs,
        "batch": args.batch,
        "imgsz": args.imgsz,
        "device": args.device,
    }

    try:
        run_training(config, overrides)
    except Exception as e:
        print(f"[TRAIN ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
