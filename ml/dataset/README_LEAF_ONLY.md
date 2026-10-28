# Leaf-Only Dataset Preparation Guide

This guide describes how to populate and prepare the leaf-only image dataset for Agri-Rover.

---

## 1. Where to Put Images

Place your raw image files (`.jpg`, `.jpeg`, `.png`) into their respective subfolders under `ml/dataset/raw/public/my_images/`:

- **Healthy Leaves**:
  `ml/dataset/raw/public/my_images/leaf_healthy/`
  *(Photos of healthy crop leaves without disease lesions)*

- **Diseased Leaves**:
  `ml/dataset/raw/public/my_images/leaf_diseased/`
  *(Photos of leaves displaying disease symptoms, spots, blight, or powdery mildew)*

- **Background / Non-Plant (Optional)**:
  `ml/dataset/raw/public/my_images/background/`
  *(Photos of empty greenhouse soil, walkways, pipes, pots, or greenhouse structures)*

> Note: Non-image files like `.gitkeep` are automatically ignored.

---

## 2. Dataset Pipeline Commands (Run in Order)

Execute the following commands sequentially from the project root directory:

### Step 1: Import and Stage Public Images
```bash
python ml/scripts/import_public.py
```
- Reads from `ml/dataset/raw/public/my_images/`.
- Resizes images so the longest dimension is 640 px (aspect ratio preserved).
- Sets `plant=unknown` and `source=other`.
- Copies processed files to `ml/dataset/staging/<class>/`.
- Records entries in `ml/dataset/metadata.csv`.

### Step 2: Check Dataset Status & Class Counts
```bash
python ml/scripts/dataset_status.py
```
- Displays current image counts and class distribution across raw, staging, and split folders.

### Step 3: Preview Sample Images
```bash
python ml/scripts/preview_samples.py
```
- Generates sample previews to verify image quality and correct class folder placement.

### Step 4: Split into Train, Val, and Test Sets
```bash
python ml/scripts/split_dataset.py
```
- Deduplicates images before splitting.
- Splits staging images into `ml/dataset/train/`, `ml/dataset/val/`, and `ml/dataset/test/` (e.g. 70% / 15% / 15%).
- Operates on the 3 leaf-only classes (`leaf_healthy`, `leaf_diseased`, `background`).
- Displays a warning that the test set is derived from public photos, not physical ESP32-CAM photos.

### Step 5: Verify Dataset Integrity
```bash
python ml/scripts/check_dataset.py
```
- Verifies folder structure, valid image headers, and ensures no plant ID or image leakage between train, val, and test splits.

---

## 3. Training & Evaluation
Once dataset validation passes:
```bash
# Train YOLOv8n-cls model
python ml/scripts/train.py --config ml/train_config.yaml

# Evaluate on test split
python ml/scripts/evaluate.py
```
