"""
Decision Engine:
Pure functions with no I/O for agricultural rover operations.
Unit tested with pytest.

Rules:
1. Water if moisture < threshold (dose capped).
2. For each part (leaf, stem), treat if state is diseased at or above high confidence,
   using treatment from treatments.json for leaf_diseased or stem_diseased (stem marked high severity).
3. Diseased between low and high confidence is unsure and never sprayed.
4. Healthy = no action.
5. no_plant = no_plant_found with a retry flag (retry once, then skip).
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
    stem_result: Optional[Dict[str, Any]],
    low_confidence: float,
    high_confidence: float,
    treatments: Dict[str, Any],
    tank_estimates: Optional[Dict[str, float]] = None,
    battery_status: Optional[Dict[str, Any]] = None,
    estop: bool = False,
    retry_count: int = 0,
    plant_history: Optional[Dict[str, float]] = None,
    run_history: Optional[Dict[str, float]] = None,
    dose_caps: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Pure decision evaluation function.
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
    retry_needed = False

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
    # 2. VISION / TREATMENT DECISIONS (LEAF & STEM)
    # ----------------------------------------------------
    part_results = [
        ("leaf", leaf_result),
        ("stem", stem_result)
    ]

    for part_name, p_result in part_results:
        if not p_result:
            skipped_actions.append({
                "type": "treat",
                "part": part_name,
                "reason": f"No {part_name} scan result provided"
            })
            continue

        state = p_result.get("state")
        confidence = float(p_result.get("confidence", 0.0))

        # Case A: healthy -> no action
        if state == "healthy":
            skipped_actions.append({
                "type": "treat",
                "part": part_name,
                "reason": f"{part_name.capitalize()} is healthy: no action needed"
            })

        # Case B: no_plant -> no_plant_found with retry flag (retry once, then skip)
        elif state == "no_plant":
            if retry_count == 0:
                retry_needed = True
                skipped_actions.append({
                    "type": "no_plant_found",
                    "part": part_name,
                    "reason": f"No plant detected on {part_name} scan: retry once"
                })
            else:
                skipped_actions.append({
                    "type": "no_plant_found",
                    "part": part_name,
                    "reason": f"No plant detected on {part_name} scan after retry: skipping plant"
                })

        # Case C: diseased -> evaluate confidence
        elif state == "diseased":
            if confidence < low_confidence:
                skipped_actions.append({
                    "type": "treat",
                    "part": part_name,
                    "reason": f"Disease confidence ({confidence:.2f}) < low confidence threshold ({low_confidence:.2f}): insufficient confidence to treat"
                })
            elif low_confidence <= confidence < high_confidence:
                # Diseased between low and high is unsure and never sprayed
                skipped_actions.append({
                    "type": "treat",
                    "part": part_name,
                    "reason": f"Disease confidence ({confidence:.2f}) is in unsure range [{low_confidence:.2f}, {high_confidence:.2f}]: never spray unsure detections"
                })
            else:
                # confidence >= high_confidence -> treat!
                class_key = f"{part_name}_diseased"
                t_info = treatments.get(class_key, {})
                treatment_name = t_info.get("treatment", "Targeted Treatment")
                
                # Rule: stem marked high severity
                if part_name == "stem":
                    severity = "high"
                else:
                    severity = t_info.get("severity", "medium")

                base_treat_dose = t_info.get("dose_ml") or default_treat_dose

                # Enforce caps
                remaining_plant_treat = max(0.0, per_plant_treat_cap - plant_treated)
                remaining_run_treat = max(0.0, per_run_treat_cap - run_treated)
                treat_dose = min(base_treat_dose, remaining_plant_treat, remaining_run_treat)

                if remaining_plant_treat <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": f"Per-plant treatment cap ({per_plant_treat_cap:.1f} ml) reached"
                    })
                elif remaining_run_treat <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": f"Per-run treatment cap ({per_run_treat_cap:.1f} ml) reached"
                    })
                elif treat_dose <= 0.0:
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": f"Computed treatment dose for {part_name} is zero due to dose cap constraints"
                    })
                elif estop:
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": "E-stop active: all spraying blocked"
                    })
                elif battery_low:
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": "Battery low: all spraying blocked"
                    })
                elif is_tank_low(tank_estimates, "treatment", treat_dose):
                    skipped_actions.append({
                        "type": "treat",
                        "part": part_name,
                        "reason": f"Treatment tank low: insufficient chemical for {part_name} spray"
                    })
                else:
                    duration_ms = int((treat_dose / treat_flow_rate) * 1000) if treat_flow_rate > 0 else 0
                    actions.append({
                        "type": "treat",
                        "part": part_name,
                        "target": part_name,
                        "treatment": treatment_name,
                        "severity": severity,
                        "dose_ml": round(treat_dose, 2),
                        "duration_ms": duration_ms
                    })
                    plant_treated += treat_dose
                    run_treated += treat_dose
        else:
            skipped_actions.append({
                "type": "treat",
                "part": part_name,
                "reason": f"Unknown classification state '{state}' for {part_name}"
            })

    # Summary and status
    action_types = [a["type"] for a in actions]
    if "treat" in action_types and "water" in action_types:
        overall_status = "water_and_treat"
        summary = f"Scheduled watering and treatment ({len(actions)} actions)."
    elif "treat" in action_types:
        overall_status = "treat_only"
        summary = f"Scheduled disease treatment ({len(actions)} actions)."
    elif "water" in action_types:
        overall_status = "water_only"
        summary = "Scheduled soil watering."
    elif retry_needed:
        overall_status = "retry_needed"
        summary = "No plant detected. Retry scan scheduled."
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
        "retry_needed": retry_needed,
        "overall_status": overall_status,
        "summary": summary
    }
