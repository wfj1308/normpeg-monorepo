from __future__ import annotations

import json
from typing import Any, Dict

from .compiler import compile_spec_to_component
from .models import SpecIRDocument


def explain_spec_document(spec_document: SpecIRDocument) -> Dict[str, Any]:
    component = compile_spec_to_component(spec_document)
    semantics = spec_document.semantics if isinstance(spec_document.semantics, dict) else {}

    return {
        "name": _resolve_name(semantics=semantics, component=component, spec_document=spec_document),
        "definition": _resolve_definition(semantics=semantics),
        "inputs": _build_inputs(component),
        "path_summary": _build_path_summary(component),
        "gate_rules": _build_gate_rules(component),
        "state_flow": _build_state_flow(component),
    }


def _resolve_name(
    *,
    semantics: Dict[str, Any],
    component: Dict[str, Any],
    spec_document: SpecIRDocument,
) -> str:
    for value in (
        semantics.get("name"),
        semantics.get("component_name"),
        semantics.get("measured_item"),
        component.get("component_name"),
        spec_document.spec_id,
    ):
        text = str(value or "").strip()
        if text:
            return text
    return spec_document.spec_id


def _resolve_definition(*, semantics: Dict[str, Any]) -> str:
    for value in (semantics.get("definition"), semantics.get("description"), semantics.get("standard_reference")):
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _build_inputs(component: Dict[str, Any]) -> list[Dict[str, Any]]:
    schema = component.get("input_dto", {})
    if not isinstance(schema, dict):
        return []

    items: list[Dict[str, Any]] = []
    for field_name, field_schema in schema.items():
        if not isinstance(field_name, str) or not field_name.strip():
            continue
        if not isinstance(field_schema, dict):
            continue
        item: Dict[str, Any] = {
            "name": field_name,
            "type": str(field_schema.get("type") or "any"),
            "required": bool(field_schema.get("required", False)),
        }
        for key in ("unit", "default", "enum_values", "precision"):
            value = field_schema.get(key)
            if value is not None:
                item[key] = value
        items.append(item)
    return items


def _build_path_summary(component: Dict[str, Any]) -> str:
    path_cfg = component.get("path", {})
    if not isinstance(path_cfg, dict):
        return ""
    steps = path_cfg.get("steps", [])
    if not isinstance(steps, list):
        return ""

    fragments: list[str] = []
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        step_id = str(step.get("step_id") or f"step_{index}")
        action = str(step.get("action") or "step")
        output_field = str(step.get("output_field") or "").strip()
        source_ref = str(
            step.get("lookup_ref")
            or step.get("formula_ref")
            or step.get("input_field")
            or step.get("method")
            or ""
        ).strip()
        when_expr = str(step.get("when") or "").strip()

        parts = [f"{index}. {step_id}"]
        if action:
            parts.append(action)
        if source_ref:
            parts.append(source_ref)
        if output_field:
            parts.append(f"-> {output_field}")
        if when_expr:
            parts.append(f"when {when_expr}")
        fragments.append(" ".join(parts))
    return "; ".join(fragments)


def _build_gate_rules(component: Dict[str, Any]) -> list[Dict[str, Any]]:
    gate_cfg = component.get("gate", {})
    if not isinstance(gate_cfg, dict):
        return []
    rules = gate_cfg.get("rules", [])
    if not isinstance(rules, list):
        return []

    items: list[Dict[str, Any]] = []
    for raw_rule in rules:
        if not isinstance(raw_rule, dict):
            continue
        item: Dict[str, Any] = {
            "rule_id": str(raw_rule.get("rule_id") or ""),
            "condition": _stringify_condition(raw_rule.get("condition")),
            "severity": str(raw_rule.get("severity") or ""),
            "on_fail": str(raw_rule.get("on_fail") or ""),
        }
        clause_refs = raw_rule.get("clause_refs")
        if isinstance(clause_refs, list):
            item["clause_refs"] = [str(value) for value in clause_refs if isinstance(value, str) and value.strip()]
        items.append(item)
    return items


def _build_state_flow(component: Dict[str, Any]) -> list[Dict[str, Any]]:
    state_cfg = component.get("state", {})
    if not isinstance(state_cfg, dict):
        return []
    transitions = state_cfg.get("allowed_transitions", [])
    if not isinstance(transitions, list):
        return []

    flow: list[Dict[str, Any]] = []
    for item in transitions:
        if not isinstance(item, dict):
            continue
        flow.append(
            {
                "from_state": str(item.get("from_state") or ""),
                "trigger": str(item.get("trigger") or ""),
                "to_state": str(item.get("to_state") or ""),
            }
        )
    return flow


def _stringify_condition(condition: Any) -> str:
    if isinstance(condition, str):
        return condition
    if isinstance(condition, dict):
        return json.dumps(condition, ensure_ascii=False, sort_keys=True)
    return str(condition or "")
