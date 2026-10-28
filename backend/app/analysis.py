"""
Image Analysis and Quality Verification Engine
Pure functions for:
- Verdict determination based on confidence thresholds
- Image quality checks (Laplacian blur variance, mean brightness, resolution)
- Spray preview logic (rover actuation simulation)
- Treatment retrieval (non-placeholder only)
- Fixed template explanations
"""

import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:
    cv2 = None

from app.config import TREATMENTS_PATH

logger = logging.getLogger("agrirover.analysis")

VERDICT_EXPLANATIONS = {
    "healthy": "The model classified this leaf as healthy with high confidence. No disease symptoms detected.",
    "healthy_low_confidence": "The leaf appears healthy, but confidence is moderate. Visual confirmation is recommended.",
    "diseased": "The model detected symptoms of leaf disease with high confidence. Targeted treatment is recommended.",
    "diseased_low_confidence": "Potential disease symptoms detected, but confidence is in the unsure range. Spraying is not recommended.",
    "unsure": "Model confidence is too low to reliably determine if the leaf is healthy or diseased. A clearer photo is needed."
}


def determine_verdict(
    class_name: str,
    confidence: float,
    low_threshold: float = 0.60,
    high_threshold: float = 0.95
) -> str:
    """
    Determine analysis verdict:
    - Predicted diseased at or above high = diseased
    - Predicted healthy at or above high = healthy
    - Anything below low = unsure
    - In between = the predicted class marked as low_confidence
      ('diseased_low_confidence' or 'healthy_low_confidence')
    """
    if confidence < low_threshold:
        return "unsure"

    if class_name == "leaf_diseased":
        if confidence >= high_threshold:
            return "diseased"
        else:
            return "diseased_low_confidence"
    else:  # leaf_healthy
        if confidence >= high_threshold:
            return "healthy"
        else:
            return "healthy_low_confidence"


def check_image_quality(image_bytes: bytes) -> Dict[str, Any]:
    """
    Evaluate image quality:
    - blur: variance of Laplacian
    - brightness: mean pixel intensity (0 to 255)
    - width and height
    - warnings for: blurry, too dark, too bright, shortest side below 224 px
    """
    img = Image.open(io.BytesIO(image_bytes))
    width, height = img.size

    # Convert to grayscale for illumination & edge analysis
    gray_img = img.convert("L")
    gray_arr = np.array(gray_img, dtype=np.float64)

    brightness = float(np.mean(gray_arr))

    # Blur detection using variance of Laplacian
    if cv2 is not None:
        gray_uint8 = np.array(gray_img, dtype=np.uint8)
        laplacian = cv2.Laplacian(gray_uint8, cv2.CV_64F)
        blur_val = float(laplacian.var())
    else:
        # Fallback 2D discrete Laplacian filter
        padded = np.pad(gray_arr, 1, mode="edge")
        lap = (
            padded[1:-1, :-2] + padded[1:-1, 2:] +
            padded[:-2, 1:-1] + padded[2:, 1:-1] -
            4.0 * gray_arr
        )
        blur_val = float(np.var(lap))

    warnings: List[str] = []
    if min(width, height) < 224:
        warnings.append(f"Image shortest side ({min(width, height)} px) is below 224 px.")
    if blur_val < 100.0:
        warnings.append("Photo is blurry or out of focus.")
    if brightness < 50.0:
        warnings.append("Photo is too dark (poor lighting).")
    elif brightness > 205.0:
        warnings.append("Photo is too bright (overexposed / glare).")

    return {
        "width": width,
        "height": height,
        "brightness": round(brightness, 2),
        "blur": round(blur_val, 2),
        "warnings": warnings
    }


def get_treatment_for_diseased(treatments_path: Path = TREATMENTS_PATH) -> Optional[Dict[str, Any]]:
    """
    Read ml/treatments.json for leaf_diseased.
    Returns treatment info only if filled in (not placeholder), otherwise None.
    """
    if not treatments_path.exists():
        return None

    try:
        with open(treatments_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        diseased_info = data.get("leaf_diseased")
        if not diseased_info or not isinstance(diseased_info, dict):
            return None

        treatment_name = str(diseased_info.get("treatment", "")).strip()
        # Reject placeholder patterns
        if (
            not treatment_name
            or "<CONFIRM" in treatment_name.upper()
            or "PLACEHOLDER" in treatment_name.upper()
            or treatment_name.startswith("<")
        ):
            return None

        return diseased_info
    except Exception as e:
        logger.warning(f"Error reading treatments from {treatments_path}: {e}")
        return None


def compute_spray_preview(
    class_name: str,
    confidence: float,
    high_threshold: float,
    low_threshold: float,
    settings: Dict[str, str]
) -> Dict[str, Any]:
    """
    Compute rover spray preview:
    would_spray is True ONLY if diseased at or above high threshold AND spraying not blocked by settings.
    """
    # Check settings constraints
    spraying_enabled_str = settings.get("spraying_enabled", settings.get("enable_spraying", "true"))
    spraying_blocked_by_flag = spraying_enabled_str.lower() in ["false", "0", "no", "disabled"]

    default_dose = float(settings.get("default_treat_dose_ml", "25.0"))
    plant_cap = float(settings.get("per_plant_treat_cap_ml", "60.0"))
    run_cap = float(settings.get("per_run_treat_cap_ml", "1000.0"))
    dose_blocked = default_dose <= 0.0 or plant_cap <= 0.0 or run_cap <= 0.0

    if class_name == "leaf_diseased" and confidence >= high_threshold:
        if spraying_blocked_by_flag:
            return {
                "would_spray": False,
                "reason": "Spraying is disabled in system settings."
            }
        if dose_blocked:
            return {
                "would_spray": False,
                "reason": "Spraying blocked: treatment dose or cap is set to 0 ml."
            }
        return {
            "would_spray": True,
            "reason": f"Leaf is diseased with high confidence ({confidence * 100:.1f}% >= {high_threshold * 100:.0f}%). Rover would schedule targeted treatment spray."
        }
    elif class_name == "leaf_diseased" and confidence >= low_threshold:
        return {
            "would_spray": False,
            "reason": f"Disease confidence ({confidence * 100:.1f}%) is in unsure range [{low_threshold * 100:.0f}%, {high_threshold * 100:.0f}%]: never spray unsure detections."
        }
    elif confidence < low_threshold:
        return {
            "would_spray": False,
            "reason": f"Confidence ({confidence * 100:.1f}%) is below low threshold ({low_threshold * 100:.0f}%): insufficient confidence to spray."
        }
    else:  # healthy
        return {
            "would_spray": False,
            "reason": "Leaf is healthy: no treatment spraying needed."
        }


def build_explanation(verdict: str, warnings: List[str]) -> str:
    """
    Build short explanation from fixed templates for each verdict and warning.
    Does not invent disease names or treatments.
    """
    base_text = VERDICT_EXPLANATIONS.get(
        verdict,
        "Analysis complete. Please verify leaf status visually."
    )
    if warnings:
        return f"{base_text} Quality notice: {' '.join(warnings)}"
    return base_text
