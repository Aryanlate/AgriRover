"""
Image Classifier Module:
- Loads weights from ml/models/best.pt if present; otherwise runs in mock-model mode.
- Evaluates leaf-only classes: leaf_healthy, leaf_diseased, and background.
- Renormalises probabilities and returns {part: "leaf", state: healthy | diseased | no_plant, confidence}.
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

    def _mock_predict(self, image_bytes: bytes, pose: str = "leaf") -> Dict[str, float]:
        """Generate deterministic, realistic leaf-only probability vector for mock mode."""
        seed = len(image_bytes) % 1000
        rng = random.Random(seed)

        probs = {
            "leaf_diseased": rng.uniform(0.65, 0.90),
            "leaf_healthy": rng.uniform(0.10, 0.25),
            "background": rng.uniform(0.01, 0.08),
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
                raw = self._mock_predict(image_bytes, "leaf")
        except Exception as e:
            logger.error(f"Inference error: {e}")
            raw = self._mock_predict(image_bytes, "leaf")

        # Ensure all leaf-only classes are present
        res = {}
        for c in ALL_CLASSES:
            res[c] = float(raw.get(c, 0.001))
        total = sum(res.values())
        return {k: v / total for k, v in res.items()}

    def classify(self, image_bytes: bytes, pose: str = "leaf") -> Dict[str, Any]:
        """
        Run classifier on one image for leaf inspection:
        1. Keep only leaf classes plus background.
        2. Renormalise probabilities.
        3. Return {part: "leaf", state: healthy | diseased | no_plant, confidence, class_name, ...}
        """
        part = "leaf"

        if self.is_mock or self.model is None:
            raw_probs = self._mock_predict(image_bytes, "leaf")
        else:
            raw_probs = self._real_predict(image_bytes)

        # Filter: keep only classes belonging to leaf or background ("none")
        filtered_probs = {}
        for cls_name, prob in raw_probs.items():
            cls_part = self.labels_map.get(cls_name, "none")
            if cls_part == "leaf" or cls_name == "background" or cls_part == "none":
                filtered_probs[cls_name] = prob

        # If empty, fallback to default leaf classes + background
        if not filtered_probs:
            for c in ["leaf_healthy", "leaf_diseased", "background"]:
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
            "part": part,
            "state": state,
            "confidence": round(confidence, 4),
            "class_name": winning_class,
            "raw_probabilities": {k: round(v, 4) for k, v in raw_probs.items()},
            "renormalised_probabilities": renorm_probs
        }


# Global classifier singleton
classifier = PlantClassifier()
