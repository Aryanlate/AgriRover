"""
Unit tests for app/decision.py covering every rule:
1. Water if moisture < threshold (dose capped).
2. For each part, treat if state is diseased at or above high confidence (stem marked high severity).
3. Diseased between low and high is unsure and never sprayed.
4. Healthy = no action.
5. no_plant = no_plant_found with a retry flag (retry once, then skip).
6. Block all spraying if battery low, tank estimate low, or E-stop.
7. Per-plant and per-run dose caps.
8. Always give a reason for every skipped action.
"""

import pytest
from app.decision import evaluate_decision

SAMPLE_TREATMENTS = {
    "leaf_diseased": {
        "treatment": "Copper Hydroxide 2g/L",
        "dose_ml": 25.0,
        "severity": "medium"
    },
    "stem_diseased": {
        "treatment": "Systemic Fungicide 1.5ml/L",
        "dose_ml": 20.0,
        "severity": "high"
    }
}

DEFAULT_THRESHOLDS = {
    "moisture_threshold": 35.0,
    "water_dose_ml": 50.0,
    "treat_dose_ml": 25.0,
    "per_plant_water_cap_ml": 150.0,
    "per_plant_treat_cap_ml": 60.0,
    "per_run_water_cap_ml": 2500.0,
    "per_run_treat_cap_ml": 1000.0,
    "water_pump_flow_ml_s": 25.0,
    "treat_pump_flow_ml_s": 20.0
}


def test_water_when_moisture_below_threshold():
    """Rule 1: water if moisture < threshold."""
    res = evaluate_decision(
        moisture_pct=25.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=None,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )
    assert res["ok"] is True
    water_actions = [a for a in res["actions"] if a["type"] == "water"]
    assert len(water_actions) == 1
    assert water_actions[0]["dose_ml"] == 50.0
    assert water_actions[0]["duration_ms"] == 2000  # 50ml / 25ml/s * 1000ms


def test_no_water_when_moisture_above_or_equal_threshold():
    """Rule 1: skip water when moisture >= threshold with clear reason."""
    res = evaluate_decision(
        moisture_pct=40.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=None,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )
    water_actions = [a for a in res["actions"] if a["type"] == "water"]
    assert len(water_actions) == 0
    skipped_water = [s for s in res["skipped_actions"] if s["type"] == "water"]
    assert len(skipped_water) == 1
    assert "watering not required" in skipped_water[0]["reason"]


def test_treat_diseased_above_high_confidence_leaf_and_stem():
    """Rule 2: treat if state is diseased at or above high confidence. Stem marked high severity."""
    leaf_res = {"part": "leaf", "state": "diseased", "confidence": 0.90}
    stem_res = {"part": "stem", "state": "diseased", "confidence": 0.88}

    res = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=stem_res,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )

    treat_actions = [a for a in res["actions"] if a["type"] == "treat"]
    assert len(treat_actions) == 2

    leaf_action = next(a for a in treat_actions if a["part"] == "leaf")
    assert leaf_action["treatment"] == "Copper Hydroxide 2g/L"
    assert leaf_action["severity"] == "medium"
    assert leaf_action["dose_ml"] == 25.0

    stem_action = next(a for a in treat_actions if a["part"] == "stem")
    assert stem_action["treatment"] == "Systemic Fungicide 1.5ml/L"
    assert stem_action["severity"] == "high"  # Stem explicitly marked high severity
    assert stem_action["dose_ml"] == 20.0


def test_diseased_between_low_and_high_is_unsure_never_sprayed():
    """Rule 3: diseased between low and high is unsure and never sprayed."""
    leaf_res = {"part": "leaf", "state": "diseased", "confidence": 0.72}

    res = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )

    treat_actions = [a for a in res["actions"] if a["type"] == "treat"]
    assert len(treat_actions) == 0

    skipped_leaf = next(s for s in res["skipped_actions"] if s["part"] == "leaf")
    assert "unsure range" in skipped_leaf["reason"]
    assert "never spray" in skipped_leaf["reason"]


def test_diseased_below_low_confidence_never_sprayed():
    """Confidence below low confidence is skipped."""
    leaf_res = {"part": "leaf", "state": "diseased", "confidence": 0.45}

    res = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )

    treat_actions = [a for a in res["actions"] if a["type"] == "treat"]
    assert len(treat_actions) == 0
    skipped_leaf = next(s for s in res["skipped_actions"] if s["part"] == "leaf")
    assert "insufficient confidence" in skipped_leaf["reason"]


def test_healthy_is_no_action():
    """Rule 4: healthy = no action with clear reason."""
    leaf_res = {"part": "leaf", "state": "healthy", "confidence": 0.95}

    res = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )

    assert len(res["actions"]) == 0
    skipped_leaf = next(s for s in res["skipped_actions"] if s["part"] == "leaf")
    assert "healthy: no action needed" in skipped_leaf["reason"]


def test_no_plant_retry_flag_retry_once_then_skip():
    """Rule 5: no_plant = no_plant_found with a retry flag (retry once, then skip)."""
    leaf_res = {"part": "leaf", "state": "no_plant", "confidence": 0.90}

    # Initial scan (retry_count == 0) -> should flag retry_needed = True
    res_initial = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        retry_count=0
    )
    assert res_initial["retry_needed"] is True
    skipped_initial = next(s for s in res_initial["skipped_actions"] if s["type"] == "no_plant_found")
    assert "retry once" in skipped_initial["reason"]

    # Subsequent scan after retry (retry_count == 1) -> retry_needed = False, skip
    res_retried = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=leaf_res,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        retry_count=1
    )
    assert res_retried["retry_needed"] is False
    skipped_retried = next(s for s in res_retried["skipped_actions"] if s["type"] == "no_plant_found")
    assert "skipping plant" in skipped_retried["reason"]


def test_estop_blocks_all_spraying():
    """Rule 6: block all spraying if E-stop active."""
    res = evaluate_decision(
        moisture_pct=20.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result={"part": "leaf", "state": "diseased", "confidence": 0.92},
        stem_result={"part": "stem", "state": "diseased", "confidence": 0.95},
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        estop=True
    )

    assert len(res["actions"]) == 0
    for skipped in res["skipped_actions"]:
        assert "E-stop" in skipped["reason"]


def test_low_battery_blocks_all_spraying():
    """Rule 6: block all spraying if battery low."""
    res = evaluate_decision(
        moisture_pct=20.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result={"part": "leaf", "state": "diseased", "confidence": 0.92},
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        battery_status={"voltage": 10.2, "low": True, "level_pct": 10}
    )

    assert len(res["actions"]) == 0
    reasons = [s["reason"] for s in res["skipped_actions"]]
    assert any("Battery low" in r for r in reasons)


def test_low_tank_estimates_block_spraying():
    """Rule 6: block spraying if tank estimate low."""
    # Water tank low
    res_water_empty = evaluate_decision(
        moisture_pct=20.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=None,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        tank_estimates={"water_ml": 5.0, "treatment_ml": 500.0}
    )
    assert len(res_water_empty["actions"]) == 0
    assert any("Water tank low" in s["reason"] for s in res_water_empty["skipped_actions"])

    # Treatment tank low
    res_treat_empty = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result={"part": "leaf", "state": "diseased", "confidence": 0.95},
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        tank_estimates={"water_ml": 500.0, "treatment_ml": 5.0}
    )
    assert len(res_treat_empty["actions"]) == 0
    assert any("Treatment tank low" in s["reason"] for s in res_treat_empty["skipped_actions"])


def test_per_plant_and_per_run_dose_caps():
    """Rule 7: per-plant and per-run dose caps."""
    # Per-plant water cap nearly reached
    res = evaluate_decision(
        moisture_pct=20.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=None,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        plant_history={"watered_ml": 130.0, "treated_ml": 0.0},
        dose_caps={"per_plant_water_cap_ml": 150.0}
    )
    water_act = next(a for a in res["actions"] if a["type"] == "water")
    assert water_act["dose_ml"] == 20.0  # Capped at remaining 150 - 130 = 20ml

    # Per-plant water cap fully reached
    res_full = evaluate_decision(
        moisture_pct=20.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result=None,
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        plant_history={"watered_ml": 150.0, "treated_ml": 0.0},
        dose_caps={"per_plant_water_cap_ml": 150.0}
    )
    assert len(res_full["actions"]) == 0
    assert any("Per-plant water cap" in s["reason"] for s in res_full["skipped_actions"])

    # Per-run treatment cap reached
    res_run_treat = evaluate_decision(
        moisture_pct=50.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result={"part": "leaf", "state": "diseased", "confidence": 0.90},
        stem_result=None,
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS,
        run_history={"watered_ml": 0.0, "treated_ml": 1000.0},
        dose_caps={"per_run_treat_cap_ml": 1000.0}
    )
    assert len(res_run_treat["actions"]) == 0
    assert any("Per-run treatment cap" in s["reason"] for s in res_run_treat["skipped_actions"])


def test_every_skipped_action_has_a_reason():
    """Rule 8: always give a reason for every skipped action."""
    res = evaluate_decision(
        moisture_pct=60.0,
        thresholds=DEFAULT_THRESHOLDS,
        leaf_result={"part": "leaf", "state": "healthy", "confidence": 0.98},
        stem_result={"part": "stem", "state": "no_plant", "confidence": 0.90},
        low_confidence=0.60,
        high_confidence=0.85,
        treatments=SAMPLE_TREATMENTS
    )
    assert len(res["skipped_actions"]) > 0
    for skipped in res["skipped_actions"]:
        assert "reason" in skipped
        assert len(skipped["reason"].strip()) > 0
