#!/usr/bin/env python3
"""
Preview Samples Generator:
Generates a thumbnail contact sheet (4x4 grid) of sample images for each class.
Saves the sheets into ml/dataset/previews/ and prints the output directory.
"""

from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
ML_DIR = REPO_ROOT / "ml"
DATASET_DIR = ML_DIR / "dataset"
RAW_DIR = DATASET_DIR / "raw" / "public" / "my_images"
STAGING_DIR = DATASET_DIR / "staging"
PREVIEWS_DIR = DATASET_DIR / "previews"
CLASSES_FILE = DATASET_DIR / "classes.txt"

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
THUMB_SIZE = (160, 160)
GRID_COLS = 4
GRID_ROWS = 4
MAX_SAMPLES = GRID_COLS * GRID_ROWS  # 16 images


def get_classes() -> list[str]:
    if CLASSES_FILE.exists():
        with open(CLASSES_FILE, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        if classes:
            return classes
    return ["leaf_healthy", "leaf_diseased"]


def find_class_images(cls: str) -> list[Path]:
    """Find images for a class, checking staging first, then raw."""
    for base in [STAGING_DIR / cls, RAW_DIR / cls]:
        if base.exists():
            imgs = [p for p in base.iterdir() if p.is_file() and p.suffix.lower() in VALID_EXTENSIONS]
            if imgs:
                return imgs
    return []


def create_contact_sheet(cls: str, images: list[Path], output_path: Path):
    random.seed(42)
    sample_paths = random.sample(images, min(len(images), MAX_SAMPLES))

    sheet_w = GRID_COLS * THUMB_SIZE[0] + (GRID_COLS + 1) * 10
    sheet_h = GRID_ROWS * THUMB_SIZE[1] + (GRID_ROWS + 1) * 10 + 40  # 40px for header

    sheet = Image.new("RGB", (sheet_w, sheet_h), color=(30, 30, 30))
    draw = ImageDraw.Draw(sheet)

    # Draw header text
    header_text = f"Class: {cls}  (Showing {len(sample_paths)} of {len(images)} images)"
    draw.text((12, 10), header_text, fill=(240, 240, 240))

    # Place thumbnails
    for idx, img_path in enumerate(sample_paths):
        row = idx // GRID_COLS
        col = idx % GRID_COLS
        x = 10 + col * (THUMB_SIZE[0] + 10)
        y = 40 + row * (THUMB_SIZE[1] + 10)

        try:
            with Image.open(img_path) as img:
                img = img.convert("RGB")
                img.thumbnail(THUMB_SIZE, Image.Resampling.LANCZOS)
                # Center thumbnail in cell
                offset_x = x + (THUMB_SIZE[0] - img.width) // 2
                offset_y = y + (THUMB_SIZE[1] - img.height) // 2
                sheet.paste(img, (offset_x, offset_y))
                draw.rectangle([offset_x, offset_y, offset_x + img.width, offset_y + img.height], outline=(80, 80, 80))
        except Exception:
            pass

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, format="JPEG", quality=90)


def run_previews():
    PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)
    classes = get_classes()

    generated_sheets = []
    skipped_classes = []

    print("=" * 60)
    print("AGRI-ROVER DATASET PREVIEW GENERATION")
    print("=" * 60)
    print(f"Output folder: {PREVIEWS_DIR}")
    print("=" * 60)

    for cls in classes:
        images = find_class_images(cls)
        if not images:
            print(f"  - '{cls}': No images found, skipped.")
            skipped_classes.append(cls)
            continue

        sheet_path = PREVIEWS_DIR / f"preview_{cls}.jpg"
        create_contact_sheet(cls, images, sheet_path)
        print(f"  - Generated preview for '{cls}' ({len(images)} images) -> {sheet_path.name}")
        generated_sheets.append(sheet_path)

    print("=" * 60)
    print(f"Saved {len(generated_sheets)} preview sheets to: {PREVIEWS_DIR}")
    print("=" * 60)
    return PREVIEWS_DIR, generated_sheets, skipped_classes


if __name__ == "__main__":
    run_previews()
