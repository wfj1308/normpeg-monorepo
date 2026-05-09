from __future__ import annotations

import copy
from decimal import Decimal, InvalidOperation
from typing import Any, Dict


class InputValidationError(ValueError):
    """Raised when input DTO validation fails."""


class InputValidator:
    """Strict DTO validator with mode selection and normalization."""

    def validate(self, component: Dict[str, Any], input_payload: Dict[str, Any]) -> Dict[str, Any]:
        return validate_input(component=component, input_payload=input_payload)


def validate_input(component: Dict[str, Any], input_payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(component, dict):
        raise InputValidationError("component must be object")
    if not isinstance(input_payload, dict):
        raise InputValidationError("input must be object")

    base_schema = component.get("input_dto", {})
    if not isinstance(base_schema, dict):
        raise InputValidationError("component.input_dto must be object")

    raw_data_dto = component.get("raw_data_dto")
    resolved_value_dto = component.get("resolved_value_dto")

    normalized: Dict[str, Any] = {}
    normalized.update(_validate_fields(schema=base_schema, payload=input_payload, context_name="input_dto"))

    mode_name = "default"
    has_raw_mode = isinstance(raw_data_dto, dict) and bool(raw_data_dto)
    has_resolved_mode = isinstance(resolved_value_dto, dict) and bool(resolved_value_dto)
    if has_raw_mode or has_resolved_mode:
        mode_name, mode_schema = _select_mode(input_payload, raw_data_dto, resolved_value_dto)
        normalized.update(_validate_fields(schema=mode_schema, payload=input_payload, context_name=mode_name))

    for key, value in input_payload.items():
        if key not in normalized:
            normalized[key] = copy.deepcopy(value)

    normalized["input_mode"] = mode_name
    return normalized


def _select_mode(
    input_payload: Dict[str, Any],
    raw_data_dto: Any,
    resolved_value_dto: Any,
) -> tuple[str, Dict[str, Any]]:
    has_raw_mode = isinstance(raw_data_dto, dict) and bool(raw_data_dto)
    has_resolved_mode = isinstance(resolved_value_dto, dict) and bool(resolved_value_dto)
    requested_mode = str(input_payload.get("input_mode") or "").strip()
    has_raw_data = isinstance(input_payload.get("raw_data"), dict)

    if requested_mode:
        normalized_mode = requested_mode.lower()
        if normalized_mode == "raw_data_dto":
            if not has_raw_mode:
                raise InputValidationError("raw_data mode not configured in component.raw_data_dto")
            return "raw_data_dto", raw_data_dto
        if normalized_mode == "resolved_value_dto":
            if not has_resolved_mode:
                raise InputValidationError("resolved value mode not configured in component.resolved_value_dto")
            return "resolved_value_dto", resolved_value_dto
        raise InputValidationError("input_mode must be raw_data_dto or resolved_value_dto")

    if has_raw_data:
        if not has_raw_mode:
            raise InputValidationError("raw_data mode not configured in component.raw_data_dto")
        return "raw_data_dto", raw_data_dto

    raw_ready = has_raw_mode and _payload_satisfies_required_fields(input_payload, raw_data_dto)
    resolved_ready = has_resolved_mode and _payload_satisfies_required_fields(input_payload, resolved_value_dto)

    if resolved_ready and not raw_ready:
        return "resolved_value_dto", resolved_value_dto
    if raw_ready and not resolved_ready:
        return "raw_data_dto", raw_data_dto
    if raw_ready and resolved_ready:
        # Prefer resolved-value mode when both are satisfiable and no explicit hint is given.
        return "resolved_value_dto", resolved_value_dto

    if has_raw_mode and not has_resolved_mode:
        return "raw_data_dto", raw_data_dto
    if has_resolved_mode and not has_raw_mode:
        return "resolved_value_dto", resolved_value_dto

    raise InputValidationError("input does not satisfy required fields for raw_data_dto or resolved_value_dto")


def _payload_satisfies_required_fields(payload: Dict[str, Any], schema: Any) -> bool:
    if not isinstance(schema, dict) or not schema:
        return False
    for field_name, field_schema in schema.items():
        if not isinstance(field_name, str) or not isinstance(field_schema, dict):
            continue
        required = bool(field_schema.get("required", False))
        if not required:
            continue
        if field_name not in payload or payload.get(field_name) is None:
            return False
    return True


def _validate_fields(schema: Dict[str, Any], payload: Dict[str, Any], context_name: str) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}

    for field_name, field_schema in schema.items():
        if not isinstance(field_name, str) or not field_name:
            continue
        if not isinstance(field_schema, dict):
            continue

        required = bool(field_schema.get("required", False))
        if field_name not in payload or payload.get(field_name) is None:
            if "default" in field_schema:
                normalized[field_name] = copy.deepcopy(field_schema["default"])
                continue
            if required:
                raise InputValidationError(f"{context_name}.{field_name} is required")
            continue

        raw_value = payload[field_name]
        normalized[field_name] = _validate_field_value(
            value=raw_value,
            field_schema=field_schema,
            field_path=f"{context_name}.{field_name}",
        )

    return normalized


def _validate_field_value(value: Any, field_schema: Dict[str, Any], field_path: str) -> Any:
    data_type = str(field_schema.get("type", "")).strip().lower()
    unit_expected = field_schema.get("unit")

    actual_value = value
    if isinstance(value, dict) and "value" in value:
        if unit_expected is not None:
            actual_unit = value.get("unit")
            if not _is_unit_compatible(actual_unit, unit_expected):
                raise InputValidationError(f"{field_path}.unit must be {unit_expected}, got {actual_unit}")
        actual_value = value.get("value")

    if data_type in {"", "any"}:
        return copy.deepcopy(actual_value)

    if data_type == "number":
        numeric = _to_float(actual_value, field_path)
        _validate_precision(numeric, field_schema.get("precision"), field_path)
        return numeric

    if data_type == "integer":
        if isinstance(actual_value, bool):
            raise InputValidationError(f"{field_path} must be integer")
        if not isinstance(actual_value, int):
            raise InputValidationError(f"{field_path} must be integer")
        return int(actual_value)

    if data_type == "string":
        if not isinstance(actual_value, str):
            raise InputValidationError(f"{field_path} must be string")
        return actual_value

    if data_type == "boolean":
        if not isinstance(actual_value, bool):
            raise InputValidationError(f"{field_path} must be boolean")
        return actual_value

    if data_type == "enum":
        allowed = field_schema.get("enum_values", [])
        if not isinstance(allowed, list) or not allowed:
            raise InputValidationError(f"{field_path} enum_values is required")
        if actual_value not in allowed:
            raise InputValidationError(f"{field_path} must be one of {allowed}")
        return actual_value

    if data_type == "object":
        if not isinstance(actual_value, dict):
            raise InputValidationError(f"{field_path} must be object")

        nested_schema = field_schema.get("properties")
        if isinstance(nested_schema, dict):
            nested_result = _validate_fields(
                schema=nested_schema,
                payload=actual_value,
                context_name=field_path,
            )
            strict = bool(field_schema.get("strict", False))
            if not strict:
                for nested_key, nested_value in actual_value.items():
                    if nested_key not in nested_result:
                        nested_result[nested_key] = copy.deepcopy(nested_value)
            return nested_result
        return copy.deepcopy(actual_value)

    if data_type == "array":
        if not isinstance(actual_value, list):
            raise InputValidationError(f"{field_path} must be array")
        item_schema = field_schema.get("items")
        if not isinstance(item_schema, dict):
            return copy.deepcopy(actual_value)
        validated: list[Any] = []
        for index, item in enumerate(actual_value):
            validated.append(
                _validate_field_value(
                    value=item,
                    field_schema=item_schema,
                    field_path=f"{field_path}[{index}]",
                )
            )
        return validated

    raise InputValidationError(f"{field_path} has unsupported type: {data_type}")


def _to_float(value: Any, field_path: str) -> float:
    if isinstance(value, bool):
        raise InputValidationError(f"{field_path} must be number")
    if not isinstance(value, (int, float)):
        raise InputValidationError(f"{field_path} must be number")
    return float(value)


def _validate_precision(value: float, precision: Any, field_path: str) -> None:
    if precision is None:
        return
    if isinstance(precision, bool) or not isinstance(precision, int) or precision < 0:
        raise InputValidationError(f"{field_path}.precision must be non-negative integer")

    try:
        decimal_value = Decimal(str(value)).normalize()
    except (InvalidOperation, ValueError) as exc:
        raise InputValidationError(f"{field_path} cannot parse decimal precision") from exc

    exponent = decimal_value.as_tuple().exponent
    digits = -exponent if exponent < 0 else 0
    if digits > precision:
        raise InputValidationError(f"{field_path} exceeds precision {precision}")


def _is_unit_compatible(actual: Any, expected: Any) -> bool:
    return _normalize_unit(actual) == _normalize_unit(expected)


def _normalize_unit(value: Any) -> str:
    text = str(value or '').strip().lower()
    return text.replace(" ", "").replace("^", "").replace("鲁", "3").replace(chr(179), "3")

