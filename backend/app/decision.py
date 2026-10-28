"""
Decision Engine (Two-Class Only: leaf_healthy and leaf_diseased):
Pure functions with no I/O for agricultural rover operations.
Unit tested with pytest.

Rules:
1. Water if moisture < threshold (dose capped).
2. Use leaf results only. Since there is no background class, a result is never "no plant found" and no retry is used.
3. Treat (tank 2) if leaf state is diseased at or above high confidence, aiming at the leaf target.
4. Diseased between low and high confidence is unsure and never sprayed.
5. Everything else (healthy, low confidence) is no action.
6. Block all spraying if battery low, tank estimate low, or E-stop active.
7. Enforce per-plant and per-run dose caps for both water and treatments.
8. Always provide a clear reason for every skipped action.
"""

from typing import Dict, Any, List, Optional


def is_battery_low(battery_status: Optional[Dict[str, Any]], cutoff_v: float = 10.5, min_pct: float = 15.0) -> bool:
    """Check if battery is below safe threshold."""
    if not battery_status:
        return False
    if battery_status.get("low", False):
        return True
    if "voltage" in battery_status and battery_status["voltage"] is not None:
        if battery_status["voltage"] <= cutoff_v:
            return True
    if "level_pct" in battery_status and battery_status["level_pct"] is not None:
        if battery_status["level_pct"] < min_pct:
            return True
    return False


def is_tank_low(tank_estimates: Optional[Dict[str, float]], tank_key: str, required_ml: float, min_reserve_ml: float = 10.0) -> bool:
    """Check if specified tank has insufficient liquid."""
    if not tank_estimates:
        return False
    # Accept keys like 'water_ml', 'water', 'treatment_ml', 'treatment'
    avail = tank_estimates.get(f"{tank_key}_ml", tank_estimates.get(tank_key, None))
    if avail is None:
        return False
    return avail < (required_ml + min_reserve_ml) or avail <= min_reserve_ml


def evaluate_decision(
    moisture_pct: Optional[float],
    thresholds: Dict[str, float],
    leaf_result: Optional[Dict[str, Any]],
    stem_result: Optional[Dict[str, Any]] = None,
    low_confidence: float = 0.60,
    high_confidence: float = 0.85,
    treatments: Optional[Dict[str, Any]] = None,
    tank_estimates: Optional[Dict[str, float]] = None,
    battery_status: Optional[Dict[str, Any]] = None,
    estop: bool = False,
    retry_count: int = 0,
    plant_history: Optional[Dict[str, float]] = None,
    run_history: Optional[Dict[str, float]] = None,
    dose_caps: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Pure decision evaluation function for two-class leaf system.
    Returns:
    {
        "ok": bool,
        "actions": List[Dict],
        "skipped_actions": List[Dict],
        "retry_needed": bool,
        "overall_status": str,
        "summary": str
    }
    """
    actions: List[Dict[str, Any]] = []
    skipped_actions: List[Dict[str, Any]] = []
    retry_needed = False  # No retry since there is no background / no_plant state

    treatments_map = treatments or {}

    # Defaults and limits
    plant_hist = plant_history or {}
    run_hist = run_history or {}
    caps = dose_caps or {}

    plant_watered = plant_hist.get("watered_ml", 0.0)
    plant_treated = plant_hist.get("treated_ml", 0.0)
    run_watered = run_hist.get("watered_ml", 0.0)
    run_treated = run_hist.get("treated_ml", 0.0)

    per_plant_water_cap = caps.get("per_plant_water_cap_ml", thresholds.get("per_plant_water_cap_ml", 150.0))
    per_plant_treat_cap = caps.get("per_plant_treat_cap_ml", thresholds.get("per_plant_treat_cap_ml", 60.0))
    per_run_water_cap = caps.get("per_run_water_cap_ml", thresholds.get("per_run_water_cap_ml", 2500.0))
    per_run_treat_cap = caps.get("per_run_treat_cap_ml", thresholds.get("per_run_treat_cap_ml", 1000.0))

    moisture_threshold = thresholds.get("moisture_threshold", 35.0)
    default_water_dose = thresholds.get("water_dose_ml", thresholds.get("default_water_dose_ml", 50.0))
    default_treat_dose = thresholds.get("treat_dose_ml", thresholds.get("default_treat_dose_ml", 25.0))

    water_flow_rate = thresholds.get("water_pump_flow_ml_s", 25.0)
    treat_flow_rate = thresholds.get("treat_pump_flow_ml_s", 20.0)

    battery_low = is_battery_low(battery_status)

    # ----------------------------------------------------
    # 1. MOISTURE / WATERING DECISION
    # ----------------------------------------------------
    if moisture_pct is None:
        skipped_actions.append({
            "type": "water",
            "part": "soil",
            "reason": "No soil moisture reading available"
        })
    elif moisture_pct >= moisture_threshold:
        skipped_actions.append({
            "type": "water",
            "part": "soil",
            "reason": f"Soil moisture {moisture_pct:.1f}% >= threshold {moisture_threshold:.1f}%: watering not required"
        })
    else:
        # Moisture < threshold -> Needs watering, check dose caps and safety
        remaining_plant_water = max(0.0, per_plant_water_cap - plant_watered)
        remaining_run_water = max(0.0, per_run_water_cap - run_watered)
        water_dose = min(default_water_dose, remaining_plant_water, remaining_run_water)

        if remaining_plant_water <= 0.0:
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": f"Per-plant water cap ({per_plant_water_cap:.1f} ml) reached"
            })
        elif remaining_run_water <= 0.0:
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": f"Per-run water cap ({per_run_water_cap:.1f} ml) reached"
            })
        elif water_dose <= 0.0:
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": "Computed water dose is zero due to dose cap constraints"
            })
        elif estop:
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": "E-stop active: all spraying blocked"
            })
        elif battery_low:
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": "Battery low: all spraying blocked"
            })
        elif is_tank_low(tank_estimates, "water", water_dose):
            skipped_actions.append({
                "type": "water",
                "part": "soil",
                "reason": "Water tank low: insufficient water"
            })
        else:
            duration_ms = int((water_dose / water_flow_rate) * 1000) if water_flow_rate > 0 else 0
            actions.append({
                "type": "water",
                "part": "soil",
                "target": "soil",
                "dose_ml": round(water_dose, 2),
                "duration_ms": duration_ms
            })
            plant_watered += water_dose
            run_watered += water_dose

    # ----------------------------------------------------
    # 2. VISION / TREATMENT DECISION (TWO-CLASS LEAF ONLY)
    # ----------------------------------------------------
    if not leaf_result:
        skipped_actions.append({
            "type": "treat",
            "part": "leaf",
            "reason": "No leaf scan result provided"
        })
    else:
        state = leaf_result.get("state")
        confidence = float(leaf_result.get("confidence", 0.0))

        # Case A: healthy -> no action
        if state == "healthy":
            skipped_actions.append({
                "type": "treat",
                "part": "leaf",
                "reason": "Leaf is healthy: no action needed"
            })

        # Case B: diseased -> evaluate confidence thresholds
        elif state == "diseased":
            if confidence < low_confidence:
                skipped_actions.append({
                    "type": "treat",
                    "part": "leaf",
                    "reason": f"Disease confidence ({confidence:.2f}) < low confidence threshold ({low_confidence:.2f}): insufficient confidence to treat"
                })
            elif low_confidence <= confidence < high_confidence:
                # Diseased between low and high is unsure and never sprayed
                skipped_actions.append({
                    "type": "treat",
                    "part": "leaf",
                    "reason": f"Disease confidence ({confidence:.2f}) is in unsure range [{low_confidence:.2f}, {high_confidence:.2f}]: never spray unsure detections"
                })
            else:
                # confidence >= high_confidence -> treat leaf!
                t_info = treatments_map.get("leaf_diseased", {})
                treatment_name = t_info.get("treatment", "Targeted Leaf Treatment")
                severity = t_info.get("severity", "medium")
                base_treat_dose = t_info.get("dose_ml") or default_treat_dose

                # Enforce caps
                remaining_plant_treat = max(0.0, per_plant_treat_cap - plant_treated)
                remaining_run_treat = max(0.0, per_run_treat_cap - run_treated)
                treat_dose = min(base_treat_dose, remaining_plant_treat, remaining_run_treat)

                if remaining_plant_treat <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": f"Per-plant treatment cap ({per_plant_treat_cap:.1f} ml) reached"
                    })
                elif remaining_run_treat <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": f"Per-run treatment cap ({per_run_treat_cap:.1f} ml) reached"
                    })
                elif treat_dose <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": "Computed treatment dose for leaf is zero due to dose cap constraints"
                    })
                elif estop:
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": "E-stop active: all spraying blocked"
                    })
                elif battery_low:
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": "Battery low: all spraying blocked"
                    })
                elif is_tank_low(tank_estimates, "treatment", treat_dose):
                    skipped_actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "reason": "Treatment tank low: insufficient chemical for leaf spray"
                    })
                else:
                    duration_ms = int((treat_dose / treat_flow_rate) * 1000) if treat_flow_rate > 0 else 0
                    actions.append({
                        "type": "treat",
                        "part": "leaf",
                        "target": "leaf",
                        "treatment": treatment_name,
                        "severity": severity,
                        "dose_ml": round(treat_dose, 2),
                        "duration_ms": duration_ms
                    })
                    plant_treated += treat_dose
                    run_treated += treat_dose
        else:
            # Everything else is no action
            skipped_actions.append({
                "type": "treat",
                "part": "leaf",
                "reason": f"No action required for state '{state}'"
            })

    # Summary and status
    action_types = [a["type"] for a in actions]
    if "treat" in action_types and "water" in action_types:
        overall_status = "water_and_treat"
        summary = f"Scheduled watering and leaf treatment ({len(actions)} actions)."
    elif "treat" in action_types:
        overall_status = "treat_only"
        summary = f"Scheduled leaf disease treatment ({len(actions)} actions)."
    elif "water" in action_types:
        overall_status = "water_only"
        summary = "Scheduled soil watering."
    elif estop or battery_low:
        overall_status = "blocked_safety"
        summary = "Actions blocked due to safety state (E-stop or low battery)."
    else:
        overall_status = "no_action"
        summary = "No actions required for this plant."

    return {
        "ok": True,
        "actions": actions,
        "skipped_actions": skipped_actions,
        "retry_needed": False,
        "overall_status": overall_status,
        "summary": summary
    }
