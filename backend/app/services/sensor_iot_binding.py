from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def sensor_binding_schema() -> Dict[str, Any]:
    return {
        "schema_id": "sensor_iot_binding.v1",
        "required_sensor_fields": [
            "sensor_id",
            "project_id",
            "equipment_type",
            "measured_slotKey",
            "unit",
            "calibration_status",
            "data_frequency",
            "trusted_level",
        ],
        "binding_rules": [
            "unit normalization before slotKey binding",
            "invalid calibration blocks auto decision",
            "anomalous data routed to runtime_error",
            "sensor data can trigger gate execution directly",
        ],
    }


def clean_sensor_data(
    *,
    sensor: Dict[str, Any],
    reading: Dict[str, Any],
    target_unit: str,
    normal_range: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    _validate_sensor(sensor)
    value = float(reading.get("value"))
    source_unit = str(reading.get("unit") or sensor.get("unit") or "").strip()
    normalized_value = _convert_unit(value=value, source_unit=source_unit, target_unit=target_unit)
    calibration_ok = str(sensor.get("calibration_status") or "").strip().lower() in {"valid", "ok", "calibrated"}
    anomaly = _is_anomaly(normalized_value, normal_range or {})
    return {
        "cleaning_pipeline": {
            "steps": [
                "1) validate sensor profile",
                "2) normalize unit to slotKey target unit",
                "3) calibration gate check",
                "4) anomaly detection and runtime_error routing",
                "5) emit bindable payload for gate execution",
            ]
        },
        "normalized": {
            "sensor_id": str(sensor.get("sensor_id") or ""),
            "slotKey": str(sensor.get("measured_slotKey") or ""),
            "value": normalized_value,
            "unit": target_unit,
            "timestamp": str(reading.get("timestamp") or _now()),
            "calibration_valid": calibration_ok,
            "anomaly": anomaly,
        },
        "allow_auto_decision": bool(calibration_ok and not anomaly),
        "runtime_error_reason": None if (calibration_ok and not anomaly) else _runtime_error_reason(calibration_ok, anomaly),
    }


def gate_trigger_logic(*, cleaned: Dict[str, Any], gate_id: str, rule_id: str) -> Dict[str, Any]:
    normalized = cleaned.get("normalized") if isinstance(cleaned.get("normalized"), dict) else {}
    allow = bool(cleaned.get("allow_auto_decision"))
    slot_key = str(normalized.get("slotKey") or "")
    return {
        "gate_auto_trigger_logic": {
            "enabled": True,
            "policy": "trigger gate when cleaned payload is valid; otherwise emit runtime_error",
            "decision": "trigger_gate" if allow else "runtime_error",
        },
        "trigger_payload": {
            "gate_id": gate_id,
            "rule_id": rule_id,
            "slotKey": slot_key,
            "input_values": {slot_key: normalized.get("value")},
            "timestamp": normalized.get("timestamp"),
        },
    }


def _validate_sensor(sensor: Dict[str, Any]) -> None:
    for key in sensor_binding_schema()["required_sensor_fields"]:
        if key not in sensor:
            raise ValueError(f"missing required sensor field: {key}")


def _convert_unit(*, value: float, source_unit: str, target_unit: str) -> float:
    s = source_unit.strip().lower()
    t = target_unit.strip().lower()
    if not s or not t or s == t:
        return value
    # minimal normalization map for frequent engineering cases
    if s == "mm" and t == "m":
        return value / 1000.0
    if s == "m" and t == "mm":
        return value * 1000.0
    if s == "cm" and t == "m":
        return value / 100.0
    if s == "%" and t == "ratio":
        return value / 100.0
    if s == "ratio" and t == "%":
        return value * 100.0
    return value


def _is_anomaly(value: float, normal_range: Dict[str, Any]) -> bool:
    lo = normal_range.get("min")
    hi = normal_range.get("max")
    if lo is not None and value < float(lo):
        return True
    if hi is not None and value > float(hi):
        return True
    return False


def _runtime_error_reason(calibration_ok: bool, anomaly: bool) -> str:
    if not calibration_ok:
        return "invalid_calibration_status"
    if anomaly:
        return "sensor_value_anomaly"
    return "unknown_sensor_error"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

