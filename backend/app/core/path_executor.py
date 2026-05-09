from __future__ import annotations

import copy
import math
from typing import Any, Dict, Mapping

from .expression_engine import ExpressionEngineError, evaluate_expression


class PathExecutionError(ValueError):
    """Raised when component path execution fails."""


class PathExecutor:
    """Domain-agnostic path runtime. Executes only component DSL."""

    def execute(self, component: Dict[str, Any], input_dto: Dict[str, Any]) -> Dict[str, Any]:
        return execute_path(component=component, input_dto=input_dto)


def execute_path(component: Dict[str, Any], input_dto: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute a component path as a generic DSL runtime.

    Input:
      - component
      - input_dto

    Output:
      - normalized_input
      - path_outputs
      - path_trace
    """
    if not isinstance(component, dict):
        raise PathExecutionError("component must be a dict")
    if not isinstance(input_dto, dict):
        raise PathExecutionError("input_dto must be a dict")

    path_block = component.get("path")
    if not isinstance(path_block, dict):
        raise PathExecutionError("component.path must be a dict")

    steps = path_block.get("steps", [])
    if not isinstance(steps, list):
        raise PathExecutionError("component.path.steps must be a list")

    formulas = path_block.get("formulas", {})
    if not isinstance(formulas, dict):
        raise PathExecutionError("component.path.formulas must be a dict")

    lookup_tables = path_block.get("lookup_tables", {})
    if not isinstance(lookup_tables, dict):
        raise PathExecutionError("component.path.lookup_tables must be a dict")

    normalized_input = _normalize_input(component, input_dto)
    working_context: Dict[str, Any] = copy.deepcopy(normalized_input)
    path_outputs: Dict[str, Any] = {}
    path_trace: list[Dict[str, Any]] = []

    for index, raw_step in enumerate(steps, start=1):
        if not isinstance(raw_step, dict):
            raise PathExecutionError(f"path step at index {index} must be a dict")

        step_id = str(raw_step.get("step_id") or raw_step.get("id") or f"step_{index}")
        action = _resolve_step_action(raw_step)
        output_field = str(raw_step.get("output_field") or raw_step.get("output") or "")
        when_expr = raw_step.get("when")

        if when_expr is not None:
            try:
                when_result = evaluate_expression(
                    expression=str(when_expr),
                    context=working_context,
                    strict_names=False,
                )
            except ExpressionEngineError as exc:
                raise PathExecutionError(f"path step {step_id} when-eval failed: {exc}") from exc

            should_run = bool(when_result["value"])
            if not should_run:
                path_trace.append(
                    {
                        "step_id": step_id,
                        "action": action,
                        "status": "skipped",
                        "when": when_expr,
                        "when_trace": when_result["trace"],
                    }
                )
                continue

        if action == "formula":
            expression = _resolve_formula(raw_step, formulas)
            try:
                formula_result = evaluate_expression(
                    expression=expression,
                    context=working_context,
                    strict_names=False,
                )
            except ExpressionEngineError as exc:
                raise PathExecutionError(f"path step {step_id} formula failed: {exc}") from exc

            value = formula_result["value"]
            if output_field:
                _set_dotted(path_outputs, output_field, value)
                _set_dotted(working_context, output_field, value)

            path_trace.append(
                {
                    "step_id": step_id,
                    "action": "formula",
                    "status": "applied",
                    "formula": expression,
                    "output_field": output_field,
                    "output_value": value,
                    "expression_trace": formula_result["trace"],
                }
            )
            continue

        if action == "lookup":
            lookup_ref = _resolve_lookup_ref(raw_step)
            table = lookup_tables.get(lookup_ref)
            if not isinstance(table, dict):
                raise PathExecutionError(f"lookup table not found: {lookup_ref}")

            input_fields = _resolve_input_fields(raw_step)
            if not input_fields:
                raise PathExecutionError(f"lookup step {step_id} missing input_fields")

            lookup_key = _build_lookup_key(working_context, input_fields)
            value = _lookup_value(raw_step, table, lookup_key)

            if output_field:
                _set_dotted(path_outputs, output_field, value)
                _set_dotted(working_context, output_field, value)

            path_trace.append(
                {
                    "step_id": step_id,
                    "action": "lookup",
                    "status": "applied",
                    "lookup_ref": lookup_ref,
                    "lookup_key": lookup_key,
                    "output_field": output_field,
                    "output_value": value,
                }
            )
            continue

        if action == "aggregate":
            source_values = _resolve_aggregate_source(raw_step, working_context)
            method = str(raw_step.get("method", "mean")).strip().lower()
            value = _aggregate_values(source_values, method)

            if output_field:
                _set_dotted(path_outputs, output_field, value)
                _set_dotted(working_context, output_field, value)

            path_trace.append(
                {
                    "step_id": step_id,
                    "action": "aggregate",
                    "status": "applied",
                    "method": method,
                    "output_field": output_field,
                    "output_value": value,
                    "source_count": len(source_values),
                }
            )
            continue

        raise PathExecutionError(f"unsupported action in step {step_id}: {action}")

    return {
        "normalized_input": normalized_input,
        "path_outputs": path_outputs,
        "path_trace": path_trace,
    }


def execute_path_legacy_adapter(normdoc_payload: Dict[str, Any], execution_input: Dict[str, Any]) -> Dict[str, Any]:
    """
    TODO remove: legacy adapter for the old normdoc payload structure.

    This adapter maps legacy `body.path.steps` definitions into the
    component DSL expected by `execute_path`.
    """
    if not isinstance(normdoc_payload, dict):
        raise PathExecutionError("normdoc_payload must be a dict")

    body = normdoc_payload.get("body", {})
    if not isinstance(body, dict):
        raise PathExecutionError("normdoc_payload.body must be a dict")

    legacy_path = body.get("path", {})
    if not isinstance(legacy_path, dict):
        raise PathExecutionError("normdoc_payload.body.path must be a dict")

    legacy_steps = legacy_path.get("steps", [])
    if not isinstance(legacy_steps, list):
        raise PathExecutionError("legacy path steps must be a list")

    lookup_tables = legacy_path.get("lookup_tables", {})
    if not isinstance(lookup_tables, dict):
        raise PathExecutionError("legacy lookup_tables must be a dict")

    formulas: Dict[str, str] = {}
    steps: list[Dict[str, Any]] = []

    for index, legacy_step in enumerate(legacy_steps, start=1):
        if not isinstance(legacy_step, dict):
            continue

        step_id = str(legacy_step.get("id") or f"legacy_step_{index}")
        output_field = legacy_step.get("output")

        if "formula" in legacy_step:
            formula_ref = f"legacy_formula_{index}"
            formulas[formula_ref] = str(legacy_step["formula"])
            steps.append(
                {
                    "step_id": step_id,
                    "action": "formula",
                    "formula_ref": formula_ref,
                    "output_field": output_field,
                }
            )
            continue

        lookup_cfg = legacy_step.get("lookup")
        if isinstance(lookup_cfg, dict):
            input_field = lookup_cfg.get("input")
            input_fields = [input_field] if input_field else []
            steps.append(
                {
                    "step_id": step_id,
                    "action": "lookup",
                    "lookup_ref": lookup_cfg.get("table"),
                    "input_fields": input_fields,
                    "output_field": output_field,
                    "default": lookup_cfg.get("default"),
                }
            )

    component = {
        "component_id": normdoc_payload.get("component_id", "legacy_component"),
        "input_dto": {},
        "path": {
            "steps": steps,
            "formulas": formulas,
            "lookup_tables": lookup_tables,
            "derived_fields": [],
        },
    }

    return execute_path(component=component, input_dto=execution_input)


def _normalize_input(component: Dict[str, Any], input_dto: Dict[str, Any]) -> Dict[str, Any]:
    schema = component.get("input_dto", {})
    if not isinstance(schema, dict):
        schema = {}

    normalized: Dict[str, Any] = {}

    for field_name, field_schema in schema.items():
        if not isinstance(field_schema, dict):
            continue

        required = bool(field_schema.get("required", False))
        raw_value = input_dto.get(field_name)

        if raw_value is None:
            if "default" in field_schema:
                normalized[field_name] = copy.deepcopy(field_schema.get("default"))
                continue
            if required:
                raise PathExecutionError(f"missing required input field: {field_name}")
            continue

        normalized[field_name] = _normalize_scalar(field_name, raw_value, field_schema)

    for key, value in input_dto.items():
        if key not in normalized:
            normalized[key] = copy.deepcopy(value)

    return normalized


def _normalize_scalar(field_name: str, value: Any, field_schema: Dict[str, Any]) -> Any:
    data_type = str(field_schema.get("type", "")).strip().lower()

    if data_type in {"", "any"}:
        return value
    if data_type == "number":
        if isinstance(value, bool):
            raise PathExecutionError(f"field {field_name} must be number")
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise PathExecutionError(f"field {field_name} must be number") from exc
    if data_type == "integer":
        if isinstance(value, bool):
            raise PathExecutionError(f"field {field_name} must be integer")
        try:
            return int(value)
        except (TypeError, ValueError) as exc:
            raise PathExecutionError(f"field {field_name} must be integer") from exc
    if data_type == "string":
        return str(value)
    if data_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            text = value.strip().lower()
            if text in {"true", "1", "yes"}:
                return True
            if text in {"false", "0", "no"}:
                return False
        raise PathExecutionError(f"field {field_name} must be boolean")
    if data_type == "object":
        if not isinstance(value, dict):
            raise PathExecutionError(f"field {field_name} must be object")
        return copy.deepcopy(value)
    if data_type == "array":
        if not isinstance(value, list):
            raise PathExecutionError(f"field {field_name} must be array")
        return copy.deepcopy(value)
    if data_type == "enum":
        allowed = field_schema.get("enum_values", [])
        if isinstance(allowed, list) and allowed and value not in allowed:
            raise PathExecutionError(f"field {field_name} must be one of {allowed}")
        return value

    return value


def _resolve_step_action(step: Dict[str, Any]) -> str:
    action = str(step.get("action", "")).strip().lower()
    if action:
        return action

    if step.get("formula") is not None or step.get("formula_ref") is not None:
        return "formula"
    if step.get("lookup_ref") is not None or step.get("lookup") is not None:
        return "lookup"
    if step.get("method") is not None or step.get("aggregate") is not None:
        return "aggregate"

    return ""


def _resolve_formula(step: Dict[str, Any], formulas: Dict[str, Any]) -> str:
    expression = step.get("formula")
    if expression is not None:
        return str(expression)

    formula_ref = step.get("formula_ref")
    if formula_ref is None:
        raise PathExecutionError("formula step missing formula or formula_ref")

    if formula_ref not in formulas:
        raise PathExecutionError(f"formula_ref not found: {formula_ref}")

    return str(formulas[formula_ref])


def _resolve_lookup_ref(step: Dict[str, Any]) -> str:
    lookup_ref = step.get("lookup_ref")
    if lookup_ref:
        return str(lookup_ref)

    legacy_lookup = step.get("lookup")
    if isinstance(legacy_lookup, dict) and legacy_lookup.get("table"):
        return str(legacy_lookup["table"])

    raise PathExecutionError("lookup step missing lookup_ref")


def _resolve_input_fields(step: Dict[str, Any]) -> list[str]:
    input_fields = step.get("input_fields")
    if isinstance(input_fields, list):
        return [str(item) for item in input_fields if item is not None]

    legacy_lookup = step.get("lookup")
    if isinstance(legacy_lookup, dict) and legacy_lookup.get("input"):
        return [str(legacy_lookup["input"])]

    return []


def _build_lookup_key(context: Dict[str, Any], input_fields: list[str]) -> Any:
    values = [_get_dotted(context, field) for field in input_fields]
    if len(values) == 1:
        return values[0]
    return tuple(values)


def _lookup_value(step: Dict[str, Any], table: Dict[str, Any], lookup_key: Any) -> Any:
    if lookup_key in table:
        return table[lookup_key]

    if isinstance(lookup_key, str):
        stripped = lookup_key.strip()
        lowered = stripped.lower()
        if stripped in table:
            return table[stripped]
        if lowered in table:
            return table[lowered]

    default = step.get("default")
    if default is None:
        legacy_lookup = step.get("lookup")
        if isinstance(legacy_lookup, dict):
            default = legacy_lookup.get("default")

    if default is not None:
        return default

    raise PathExecutionError(f"lookup key not found: {lookup_key}")


def _resolve_aggregate_source(step: Dict[str, Any], context: Dict[str, Any]) -> list[float]:
    input_field = step.get("input_field")
    if isinstance(input_field, str) and input_field:
        raw_values = _get_dotted(context, input_field)
    else:
        input_fields = step.get("input_fields")
        if not isinstance(input_fields, list) or not input_fields:
            raise PathExecutionError("aggregate step missing input_field or input_fields")
        if len(input_fields) == 1:
            raw_values = _get_dotted(context, str(input_fields[0]))
        else:
            raw_values = [_get_dotted(context, str(field)) for field in input_fields]

    if not isinstance(raw_values, list):
        raise PathExecutionError("aggregate source must be an array")

    values: list[float] = []
    for index, raw in enumerate(raw_values, start=1):
        if isinstance(raw, bool):
            raise PathExecutionError(f"aggregate source item {index} must be numeric")
        if not isinstance(raw, (int, float)):
            raise PathExecutionError(f"aggregate source item {index} must be numeric")
        values.append(float(raw))

    if not values:
        raise PathExecutionError("aggregate source cannot be empty")

    return values


def _aggregate_values(values: list[float], method: str) -> float | int:
    if method in {"mean", "avg"}:
        return sum(values) / len(values)
    if method in {"t_distribution_95", "t_distribution_95_lower"}:
        return _t_distribution_95_lower(values)
    if method == "t_distribution_95_upper":
        return _t_distribution_95_upper(values)
    if method == "min":
        return min(values)
    if method == "max":
        return max(values)
    if method == "sum":
        return sum(values)
    if method == "count":
        return len(values)
    if method == "first":
        return values[0]
    if method == "last":
        return values[-1]
    raise PathExecutionError(f"unsupported aggregate method: {method}")


def _t_distribution_95_lower(values: list[float]) -> float:
    if len(values) == 1:
        return values[0]

    n = len(values)
    mean = sum(values) / n
    variance = sum((item - mean) ** 2 for item in values) / (n - 1)
    std = math.sqrt(variance)
    dof = n - 1
    t_critical = _t_critical_one_sided_95(dof)
    margin = t_critical * std / math.sqrt(n)
    return mean - margin


def _t_distribution_95_upper(values: list[float]) -> float:
    if len(values) == 1:
        return values[0]

    n = len(values)
    mean = sum(values) / n
    variance = sum((item - mean) ** 2 for item in values) / (n - 1)
    std = math.sqrt(variance)
    dof = n - 1
    t_critical = _t_critical_one_sided_95(dof)
    margin = t_critical * std / math.sqrt(n)
    return mean + margin


def _t_critical_one_sided_95(dof: int) -> float:
    table = {
        1: 6.314,
        2: 2.920,
        3: 2.353,
        4: 2.132,
        5: 2.015,
        6: 1.943,
        7: 1.895,
        8: 1.860,
        9: 1.833,
        10: 1.812,
        11: 1.796,
        12: 1.782,
        13: 1.771,
        14: 1.761,
        15: 1.753,
        16: 1.746,
        17: 1.740,
        18: 1.734,
        19: 1.729,
        20: 1.725,
        21: 1.721,
        22: 1.717,
        23: 1.714,
        24: 1.711,
        25: 1.708,
        26: 1.706,
        27: 1.703,
        28: 1.701,
        29: 1.699,
        30: 1.697,
    }
    if dof <= 0:
        return table[1]
    if dof in table:
        return table[dof]
    return 1.645


def _get_dotted(payload: Mapping[str, Any], dotted_path: str) -> Any:
    if dotted_path in payload:
        return payload[dotted_path]

    cursor: Any = payload
    for segment in dotted_path.split("."):
        if isinstance(cursor, Mapping):
            if segment not in cursor:
                raise PathExecutionError(f"missing input field for path: {dotted_path}")
            cursor = cursor[segment]
            continue

        if hasattr(cursor, segment):
            cursor = getattr(cursor, segment)
            continue

        raise PathExecutionError(f"missing input field for path: {dotted_path}")

    return cursor


def _set_dotted(payload: Dict[str, Any], dotted_path: str, value: Any) -> None:
    if "." not in dotted_path:
        payload[dotted_path] = value
        return

    parts = dotted_path.split(".")
    cursor: Dict[str, Any] = payload
    for segment in parts[:-1]:
        next_cursor = cursor.get(segment)
        if not isinstance(next_cursor, dict):
            next_cursor = {}
            cursor[segment] = next_cursor
        cursor = next_cursor
    cursor[parts[-1]] = value
