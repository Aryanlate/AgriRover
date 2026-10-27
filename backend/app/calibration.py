"""
Calibration functions:
- soil raw to percent from dry and wet values
- pump seconds to ml from flow rate
"""

def raw_to_soil_percent(raw_value: float, dry_raw: float, wet_raw: float) -> float:
    """
    Convert raw soil moisture ADC reading into percentage (0.0 to 100.0%).
    Supports both capacitive (dry_raw > wet_raw) and resistive (dry_raw < wet_raw) sensors.
    """
    if dry_raw == wet_raw:
        return 0.0

    if dry_raw > wet_raw:
        # Standard capacitive: Air/Dry = high ADC, Water/Wet = low ADC
        pct = ((dry_raw - raw_value) / (dry_raw - wet_raw)) * 100.0
    else:
        # Resistive: Air/Dry = low ADC, Water/Wet = high ADC
        pct = ((raw_value - dry_raw) / (wet_raw - dry_raw)) * 100.0

    # Clamp between 0.0 and 100.0
    clamped = max(0.0, min(100.0, pct))
    return round(clamped, 2)


def pump_seconds_to_ml(seconds: float, flow_rate_ml_s: float) -> float:
    """
    Convert pump run time (seconds) to dispensed volume (ml) using calibrated flow rate.
    """
    if seconds <= 0.0 or flow_rate_ml_s <= 0.0:
        return 0.0
    return round(seconds * flow_rate_ml_s, 2)


def pump_ml_to_seconds(ml: float, flow_rate_ml_s: float) -> float:
    """
    Convert required volume (ml) to pump run time (seconds).
    """
    if ml <= 0.0 or flow_rate_ml_s <= 0.0:
        return 0.0
    return round(ml / flow_rate_ml_s, 3)


def pump_ml_to_duration_ms(ml: float, flow_rate_ml_s: float) -> int:
    """
    Convert volume (ml) to pump pulse duration in milliseconds.
    """
    sec = pump_ml_to_seconds(ml, flow_rate_ml_s)
    return int(sec * 1000)
