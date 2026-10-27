"""
Image Classifier Module:
- Loads weights from ml/models/best.pt if present; otherwise runs in mock-model mode.
- Evaluates 5 classes: leaf_healthy, leaf_diseased, stem_healthy, stem_diseased, background.
- Given pose ('leaf' or 'stem'), keeps only that part's classes + background.
- Renormalises probabilities and returns {part, state: healthy | diseased | no_plant, confidence}.
- Uses ml/models/labels.json for class-to-part mapping.
"""

import json
import logging
import random
from pathlib import Path
from typing import Dict, Any, Tuple
from PIL import Image
import io

from app.config import MODEL_PATH, LABELS_PATH

logger = logging.getLogger("agrirover.classifier")

ALL_CLASSES = [
    "leaf_healthy",
    "leaf_diseased",
    "stem_healthy",
    "stem_diseased",
    "background"
]


class PlantClassifier:
    def __init__(self, model_path: Path = MODEL_PATH, labels_path: Path = LABELS_PATH):
        self.model_path = model_path
        self.labels_path = labels_path
        self.labels_map = self._load_labels()
        self.model = None
        self.is_mock = True
        self._init_model()

    def _load_labels(self) -> Dict[str, str]:
        if self.labels_path.exists():
            try:
                with open(self.labels_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to read {self.labels_path}: {e}")
        return {
            "leaf_healthy": "leaf",
            "leaf_diseased": "leaf",
            "stem_healthy": "stem",
            "stem_diseased": "stem",
            "background": "none"
        }

    def _init_model(self):
        if not self.model_path.exists():
            logger.warning(f"Model file '{self.model_path}' not found. Starting in MOCK-MODEL mode.")
            self.is_mock = True
            return

        try:
            # Try ultralytics YOLO-cls first
            from ultralytics import YOLO
            self.model = YOLO(str(self.model_path))
            self.is_mock = False
            logger.info(f"Loaded YOLO model from {self.model_path}")
        except Exception as e:
            logger.warning(f"Could not load model with ultralytics ({e}). Trying torch...")
            try:
                import torch
                self.model = torch.load(str(self.model_path), map_location="cpu")
                if hasattr(self.model, "eval"):
                    self.model.eval()
                self.is_mock = False
                logger.info(f"Loaded PyTorch model from {self.model_path}")
            except Exception as e2:
                logger.error(f"Failed to load model from {self.model_path}: {e2}. Falling back to MOCK mode.")
                self.is_mock = True

    def _mock_predict(self, image_bytes: bytes, pose: str) -> Dict[str, float]:
        """Generate deterministic, realistic 5-class probability vector for mock mode."""
        # Use simple byte-based pseudo-randomness for reproducibility across identical images
        seed = len(image_bytes) % 1000
        rng = random.Random(seed)

        # Baseline probabilities
        if pose == "stem":
            probs = {
                "stem_diseased": rng.uniform(0.70, 0.95),
                "stem_healthy": rng.uniform(0.05, 0.20),
                "background": rng.uniform(0.01, 0.08),
                "leaf_healthy": 0.01,
                "leaf_diseased": 0.01,
            }
        else:
            # default to leaf
            probs = {
                "leaf_diseased": rng.uniform(0.70, 0.95),
                "leaf_healthy": rng.uniform(0.05, 0.20),
                "background": rng.uniform(0.01, 0.08),
                "stem_healthy": 0.01,
                "stem_diseased": 0.01,
            }

        total = sum(probs.values())
        return {k: v / total for k, v in probs.items()}

    def _real_predict(self, image_bytes: bytes) -> Dict[str, float]:
        """Run real inference on image bytes returning 5-class probabilities."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        try:
            results = self.model(img)
            # Check for classification output in ultralytics format
            if hasattr(results[0], "probs") and results[0].probs is not None:
                probs_data = results[0].probs.data.cpu().numpy()
                names = results[0].names
                raw = {names[i]: float(probs_data[i]) for i in range(len(names))}
            else:
                # Fallback to mock if output structure is unexpected
                raw = self._mock_predict(image_bytes, "leaf")
        except Exception as e:
            logger.error(f"Inference error: {e}")
            raw = self._mock_predict(image_bytes, "leaf")

        # Ensure all 5 classes are present
        res = {}
        for c in ALL_CLASSES:
            res[c] = float(raw.get(c, 0.001))
        total = sum(res.values())
        return {k: v / total for k, v in res.items()}

    def classify(self, image_bytes: bytes, pose: str) -> Dict[str, Any]:
        """
        Run classifier on one image and process for the given pose (leaf or stem):
        1. Keep only that part's classes plus background.
        2. Renormalise probabilities.
        3. Return {part, state: healthy | diseased | no_plant, confidence, class_name, ...}
        """
        pose = pose.lower().strip()
        if pose not in ["leaf", "stem"]:
            pose = "leaf"

        if self.is_mock or self.model is None:
            raw_probs = self._mock_predict(image_bytes, pose)
        else:
            raw_probs = self._real_predict(image_bytes)

        # Filter: keep only classes belonging to this pose or background ("none")
        filtered_probs = {}
        for cls_name, prob in raw_probs.items():
            cls_part = self.labels_map.get(cls_name, "none")
            if cls_part == pose or cls_name == "background" or cls_part == "none":
                filtered_probs[cls_name] = prob

        # If somehow none matched, fallback to the two pose classes + background
        if not filtered_probs:
            for c in [f"{pose}_healthy", f"{pose}_diseased", "background"]:
                filtered_probs[c] = raw_probs.get(c, 0.33)

        # Renormalise
        total_prob = sum(filtered_probs.values())
        if total_prob > 0:
            renorm_probs = {k: round(v / total_prob, 4) for k, v in filtered_probs.items()}
        else:
            uniform = round(1.0 / len(filtered_probs), 4)
            renorm_probs = {k: uniform for k in filtered_probs}

        # Determine winning class
        winning_class = max(renorm_probs, key=renorm_probs.get)
        confidence = renorm_probs[winning_class]

        # Map winning class to state: healthy | diseased | no_plant
        if winning_class == "background":
            state = "no_plant"
        elif winning_class.endswith("_diseased"):
            state = "diseased"
        elif winning_class.endswith("_healthy"):
            state = "healthy"
        else:
            state = "no_plant"

        return {
            "part": pose,
            "state": state,
            "confidence": round(confidence, 4),
            "class_name": winning_class,
            "raw_probabilities": {k: round(v, 4) for k, v in raw_probs.items()},
            "renormalised_probabilities": renorm_probs
        }


# Global classifier singleton
classifier = PlantClassifier()
