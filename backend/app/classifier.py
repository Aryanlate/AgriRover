"""
Image Classifier Module (Two-Class Only):
- Evaluates only two classes: leaf_healthy and leaf_diseased.
- Loads weights from ml/models/best.pt if present; otherwise runs in mock mode.
- Renormalises probabilities and returns {part: "leaf", state: healthy | diseased, confidence}.
- A result is never "no plant found" (no background class).
"""

import json
import logging
import random
from pathlib import Path
from typing import Dict, Any
from PIL import Image
import io

from app.config import MODEL_PATH, LABELS_PATH

logger = logging.getLogger("agrirover.classifier")

ALL_CLASSES = [
    "leaf_healthy",
    "leaf_diseased"
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
            "leaf_diseased": "leaf"
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

    def _mock_predict(self, image_bytes: bytes) -> Dict[str, float]:
        """Generate deterministic, realistic 2-class probability vector for mock mode."""
        seed = len(image_bytes) % 1000
        rng = random.Random(seed)

        probs = {
            "leaf_diseased": rng.uniform(0.70, 0.92),
            "leaf_healthy": rng.uniform(0.08, 0.30),
        }

        total = sum(probs.values())
        return {k: v / total for k, v in probs.items()}

    def _real_predict(self, image_bytes: bytes) -> Dict[str, float]:
        """Run real inference on image bytes returning probabilities."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        try:
            results = self.model(img)
            # Check for classification output in ultralytics format
            if hasattr(results[0], "probs") and results[0].probs is not None:
                probs_data = results[0].probs.data.cpu().numpy()
                names = results[0].names
                raw = {names[i]: float(probs_data[i]) for i in range(len(names))}
            else:
                raw = self._mock_predict(image_bytes)
        except Exception as e:
            logger.error(f"Inference error: {e}")
            raw = self._mock_predict(image_bytes)

        # Filter and ensure only the 2 target classes are present
        res = {}
        for c in ALL_CLASSES:
            res[c] = float(raw.get(c, 0.01))
        total = sum(res.values())
        return {k: v / total for k, v in res.items()}

    def classify(self, image_bytes: bytes, pose: str = "leaf") -> Dict[str, Any]:
        """
        Run classifier on one image for leaf inspection (two classes only):
        1. Evaluate leaf_healthy and leaf_diseased.
        2. Renormalise probabilities.
        3. Return {part: "leaf", state: healthy | diseased, confidence, class_name, ...}
        """
        part = "leaf"

        if self.is_mock or self.model is None:
            raw_probs = self._mock_predict(image_bytes)
        else:
            raw_probs = self._real_predict(image_bytes)

        # Filter: keep only the two leaf classes
        filtered_probs = {c: raw_probs.get(c, 0.5) for c in ALL_CLASSES}

        # Renormalise
        total_prob = sum(filtered_probs.values())
        if total_prob > 0:
            renorm_probs = {k: round(v / total_prob, 4) for k, v in filtered_probs.items()}
        else:
            renorm_probs = {"leaf_healthy": 0.5, "leaf_diseased": 0.5}

        # Determine winning class
        winning_class = max(renorm_probs, key=renorm_probs.get)
        confidence = renorm_probs[winning_class]

        # Map winning class to state: healthy | diseased (never no_plant)
        state = "diseased" if winning_class == "leaf_diseased" else "healthy"

        return {
            "part": part,
            "state": state,
            "confidence": round(confidence, 4),
            "class_name": winning_class,
            "raw_probabilities": {k: round(v, 4) for k, v in raw_probs.items()},
            "renormalised_probabilities": renorm_probs
        }


# Global classifier singleton
classifier = PlantClassifier()
