"""
Pytest unit tests for:
1. Verdict logic (determine_verdict with confidence thresholds)
2. Image quality checks (Laplacian blur variance, brightness, resolution)
"""

import io
import pytest
from PIL import Image, ImageDraw

from app.analysis import determine_verdict, get_clean_verdict, check_image_quality


# =====================================================================
# 1. VERDICT LOGIC TESTS
# =====================================================================

def test_verdict_diseased_high_confidence():
    """Predicted diseased at or above high threshold (0.95) -> diseased."""
    verdict = determine_verdict("leaf_diseased", 0.95, low_threshold=0.60, high_threshold=0.95)
    assert verdict == "diseased"
    clean_v, is_low = get_clean_verdict(verdict)
    assert clean_v == "diseased"
    assert is_low is False

    verdict_higher = determine_verdict("leaf_diseased", 0.99, low_threshold=0.60, high_threshold=0.95)
    assert verdict_higher == "diseased"
    clean_vh, is_low_h = get_clean_verdict(verdict_higher)
    assert clean_vh == "diseased"
    assert is_low_h is False


def test_verdict_diseased_low_confidence():
    """Predicted diseased between low (0.60) and high (0.95) -> diseased_low_confidence."""
    verdict = determine_verdict("leaf_diseased", 0.75, low_threshold=0.60, high_threshold=0.95)
    assert verdict == "diseased_low_confidence"
    clean_v, is_low = get_clean_verdict(verdict)
    assert clean_v == "diseased"
    assert is_low is True

    verdict_border = determine_verdict("leaf_diseased", 0.60, low_threshold=0.60, high_threshold=0.95)
    assert verdict_border == "diseased_low_confidence"
    clean_vb, is_low_b = get_clean_verdict(verdict_border)
    assert clean_vb == "diseased"
    assert is_low_b is True


def test_verdict_healthy_high_confidence():
    """Predicted healthy at or above high threshold (0.95) -> healthy."""
    verdict = determine_verdict("leaf_healthy", 0.95, low_threshold=0.60, high_threshold=0.95)
    assert verdict == "healthy"
    clean_v, is_low = get_clean_verdict(verdict)
    assert clean_v == "healthy"
    assert is_low is False

    verdict_higher = determine_verdict("leaf_healthy", 0.98, low_threshold=0.60, high_threshold=0.95)
    assert verdict_higher == "healthy"
    clean_vh, is_low_h = get_clean_verdict(verdict_higher)
    assert clean_vh == "healthy"
    assert is_low_h is False


def test_verdict_healthy_low_confidence():
    """Predicted healthy between low (0.60) and high (0.95) -> healthy_low_confidence."""
    verdict = determine_verdict("leaf_healthy", 0.80, low_threshold=0.60, high_threshold=0.95)
    assert verdict == "healthy_low_confidence"
    clean_v, is_low = get_clean_verdict(verdict)
    assert clean_v == "healthy"
    assert is_low is True

    verdict_border = determine_verdict("leaf_healthy", 0.60, low_threshold=0.60, high_threshold=0.95)
    assert verdict_border == "healthy_low_confidence"
    clean_vb, is_low_b = get_clean_verdict(verdict_border)
    assert clean_vb == "healthy"
    assert is_low_b is True


def test_verdict_below_low_threshold_is_unsure():
    """Confidence below low threshold (< 0.60) -> unsure for both classes."""
    verdict_diseased = determine_verdict("leaf_diseased", 0.59, low_threshold=0.60, high_threshold=0.95)
    assert verdict_diseased == "unsure"
    clean_vd, is_low_d = get_clean_verdict(verdict_diseased)
    assert clean_vd == "unsure"
    assert is_low_d is False

    verdict_healthy = determine_verdict("leaf_healthy", 0.50, low_threshold=0.60, high_threshold=0.95)
    assert verdict_healthy == "unsure"
    clean_vh, is_low_h = get_clean_verdict(verdict_healthy)
    assert clean_vh == "unsure"
    assert is_low_h is False

    verdict_low = determine_verdict("leaf_healthy", 0.10, low_threshold=0.60, high_threshold=0.95)
    assert verdict_low == "unsure"


def test_verdict_custom_thresholds():
    """Verdict adapts accurately to custom threshold configurations."""
    # Custom low=0.50, high=0.90
    assert determine_verdict("leaf_diseased", 0.91, low_threshold=0.50, high_threshold=0.90) == "diseased"
    assert determine_verdict("leaf_diseased", 0.85, low_threshold=0.50, high_threshold=0.90) == "diseased_low_confidence"
    assert determine_verdict("leaf_healthy", 0.85, low_threshold=0.50, high_threshold=0.90) == "healthy_low_confidence"
    assert determine_verdict("leaf_diseased", 0.45, low_threshold=0.50, high_threshold=0.90) == "unsure"


# =====================================================================
# 2. IMAGE QUALITY TESTS
# =====================================================================

def _create_jpeg_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_image_quality_normal_sharp():
    """A normal resolution, sharp, well-exposed image has no warnings."""
    img = Image.new("RGB", (300, 300), color=(128, 128, 128))
    draw = ImageDraw.Draw(img)
    # High frequency sharp pattern
    for x in range(0, 300, 10):
        color = (255, 255, 255) if (x // 10) % 2 == 0 else (0, 0, 0)
        draw.rectangle([x, 0, x + 5, 300], fill=color)

    raw_bytes = _create_jpeg_bytes(img)
    quality = check_image_quality(raw_bytes)

    assert quality["width"] == 300
    assert quality["height"] == 300
    assert quality["blur"] >= 100.0  # Sharp
    assert 50.0 <= quality["brightness"] <= 205.0  # Normal exposure
    assert quality["warnings"] == []  # No warnings


def test_image_quality_blurry():
    """A flat or smooth image has low Laplacian variance and triggers blurry warning."""
    img = Image.new("RGB", (300, 300), color=(120, 130, 120))  # Flat solid color
    raw_bytes = _create_jpeg_bytes(img)
    quality = check_image_quality(raw_bytes)

    assert quality["blur"] < 100.0
    assert any("blurry" in w.lower() for w in quality["warnings"])


def test_image_quality_too_dark():
    """An underexposed image (mean brightness < 50) triggers too dark warning."""
    img = Image.new("RGB", (300, 300), color=(20, 20, 20))
    raw_bytes = _create_jpeg_bytes(img)
    quality = check_image_quality(raw_bytes)

    assert quality["brightness"] < 50.0
    assert any("dark" in w.lower() for w in quality["warnings"])


def test_image_quality_too_bright():
    """An overexposed image (mean brightness > 205) triggers too bright warning."""
    img = Image.new("RGB", (300, 300), color=(240, 240, 240))
    raw_bytes = _create_jpeg_bytes(img)
    quality = check_image_quality(raw_bytes)

    assert quality["brightness"] > 205.0
    assert any("bright" in w.lower() for w in quality["warnings"])


def test_image_quality_low_resolution():
    """Image with shortest side < 224 px triggers resolution warning."""
    img = Image.new("RGB", (200, 320), color=(128, 128, 128))  # 200 < 224
    raw_bytes = _create_jpeg_bytes(img)
    quality = check_image_quality(raw_bytes)

    assert quality["width"] == 200
    assert quality["height"] == 320
    assert any("224" in w for w in quality["warnings"])
