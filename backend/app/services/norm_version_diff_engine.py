from __future__ import annotations

import copy
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


DIFF_REPORT_SCHEMA: Dict[str, Any] = {
    "schema_id": "norm.version.diff.report.v1",
    "required_sections": [
        "catalog_diff",
        "specir_diff",
        "rule_diff",
        "gate_diff",
        "slot_diff",
        "impact_preview",
    ],
    "diff_types": [
        "added",
        "removed",
        "modified",
        "semantic_changed",
        "threshold_changed",
        "operator_changed",
    ],
}


def compare_norm_versions(
    *,
    old_spec: Dict[str, Any],
    new_spec: Dict[str, Any],
    old_spec_id: str,
    new_spec_id: str,
    output_dir: Path,
) -> Dict[str, Any]:
    old_payload = copy.deepcopy(old_spec if isinstance(old_spec, dict) else {})
    new_payload = copy.deepcopy(new_spec if isinstance(new_spec, dict) else {})

    catalog_diff = _build_catalog_diff(old_payload, new_payload)
    specir_diff = _build_specir_diff(old_payload, new_payload)
    rule_diff = _build_rule_diff(old_payload, new_payload)
    gate_diff = _build_gate_diff(old_payload, new_payload)
    slot_diff = _build_slot_diff(old_payload, new_payload)
    impact_preview = _build_impact_preview(
        old_payload=old_payload,
        new_payload=new_payload,
        rule_diff=rule_diff,
        gate_diff=gate_diff,
        slot_diff=slot_diff,
        specir_diff=specir_diff,
    )

    report = {
        "schema": DIFF_REPORT_SCHEMA,
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "old_spec_id": old_spec_id,
            "new_spec_id": new_spec_id,
        },
        "catalog_diff": catalog_diff,
        "specir_diff": specir_diff,
        "rule_diff": rule_diff,
        "gate_diff": gate_diff,
        "slot_diff": slot_diff,
        "impact_preview": impact_preview,
        "compare_algorithm": {
            "identity_keys": {
                "rule": "rule_id",
                "slot": "slot_key",
            },
            "stages": [
                "1) 对 Catalog / SpecIR 全量结构做标准化后深比较",
                "2) 对 Rule / Gate / Slot 做 keyed-diff，输出 added/removed/modified",
                "3) Rule 细粒度识别 field/op/value/min/max/unit 变化",
                "4) Gate 细粒度识别 logic / rule_refs / action 变化",
                "5) 根据差异映射到 impact preview（form_code / executor / DTO）",
            ],
        },
        "impact_analysis_pipeline": {
            "inputs": ["old_spec", "new_spec"],
            "processors": [
                "catalog/specir diff",
                "rule diff",
                "gate diff",
                "slot diff",
                "impact classifier",
            ],
            "outputs": ["impact_preview.form_code", "impact_preview.executor", "impact_preview.DTO"],
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "diff_report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _build_catalog_diff(old_payload: Dict[str, Any], new_payload: Dict[str, Any]) -> Dict[str, Any]:
    old_semantics = _as_dict(old_payload.get("semantics"))
    new_semantics = _as_dict(new_payload.get("semantics"))
    keys = ("catalog_id", "standard_id", "standard_version", "work_item", "measured_item")
    changes: list[Dict[str, Any]] = []
    for key in keys:
        old_value = old_semantics.get(key)
        new_value = new_semantics.get(key)
        if old_value != new_value:
            changes.append({"field": key, "old": old_value, "new": new_value, "diff_type": "semantic_changed"})
    return {"changed": len(changes) > 0, "changes": changes}


def _build_specir_diff(old_payload: Dict[str, Any], new_payload: Dict[str, Any]) -> Dict[str, Any]:
    sections = ["semantics", "logic", "inputs", "path", "gate", "state", "proof", "metadata"]
    changes: list[Dict[str, Any]] = []
    for section in sections:
        old_value = old_payload.get(section)
        new_value = new_payload.get(section)
        if old_value != new_value:
            changes.append({"section": section, "diff_type": "modified"})
    return {"changed": len(changes) > 0, "changes": changes}


def _build_rule_diff(old_payload: Dict[str, Any], new_payload: Dict[str, Any]) -> Dict[str, Any]:
    old_rules = _rule_map(old_payload)
    new_rules = _rule_map(new_payload)
    added = sorted([key for key in new_rules.keys() if key not in old_rules])
    removed = sorted([key for key in old_rules.keys() if key not in new_rules])
    modified: list[Dict[str, Any]] = []

    for rule_id in sorted([key for key in old_rules.keys() if key in new_rules]):
        before = old_rules[rule_id]
        after = new_rules[rule_id]
        if before == after:
            continue
        delta = _detect_rule_delta(before, after, old_payload, new_payload)
        modified.append({"rule_id": rule_id, **delta})
    return {"added": added, "removed": removed, "modified": modified}


def _build_gate_diff(old_payload: Dict[str, Any], new_payload: Dict[str, Any]) -> Dict[str, Any]:
    old_gate = _as_dict(old_payload.get("gate"))
    new_gate = _as_dict(new_payload.get("gate"))
    changes: list[Dict[str, Any]] = []

    old_logic = _gate_logic_fingerprint(old_gate)
    new_logic = _gate_logic_fingerprint(new_gate)
    if old_logic != new_logic:
        changes.append({"field": "logic", "old": old_logic, "new": new_logic, "diff_type": "modified"})

    old_refs = _normalize_list(old_gate.get("references")) + _normalize_list(old_gate.get("clause_refs"))
    new_refs = _normalize_list(new_gate.get("references")) + _normalize_list(new_gate.get("clause_refs"))
    if sorted(set(old_refs)) != sorted(set(new_refs)):
        changes.append(
            {
                "field": "rule_refs",
                "old": sorted(set(old_refs)),
                "new": sorted(set(new_refs)),
                "diff_type": "modified",
            }
        )

    old_actions = sorted({_as_text(item.get("on_fail")) for item in _normalize_list_of_dict(old_gate.get("rules")) if _as_text(item.get("on_fail"))})
    new_actions = sorted({_as_text(item.get("on_fail")) for item in _normalize_list_of_dict(new_gate.get("rules")) if _as_text(item.get("on_fail"))})
    if old_actions != new_actions:
        changes.append({"field": "action", "old": old_actions, "new": new_actions, "diff_type": "modified"})

    return {"changed": len(changes) > 0, "changes": changes}


def _build_slot_diff(old_payload: Dict[str, Any], new_payload: Dict[str, Any]) -> Dict[str, Any]:
    old_slots = _slot_map(old_payload)
    new_slots = _slot_map(new_payload)
    added = sorted([key for key in new_slots.keys() if key not in old_slots])
    removed = sorted([key for key in old_slots.keys() if key not in new_slots])
    modified: list[Dict[str, Any]] = []
    for key in sorted([item for item in old_slots.keys() if item in new_slots]):
        if old_slots[key] != new_slots[key]:
            modified.append({"slot_key": key, "old": old_slots[key], "new": new_slots[key], "diff_type": "modified"})
    return {"added": added, "removed": removed, "modified": modified}


def _build_impact_preview(
    *,
    old_payload: Dict[str, Any],
    new_payload: Dict[str, Any],
    rule_diff: Dict[str, Any],
    gate_diff: Dict[str, Any],
    slot_diff: Dict[str, Any],
    specir_diff: Dict[str, Any],
) -> Dict[str, Any]:
    form_code_impacts: list[str] = []
    executor_impacts: list[str] = []
    dto_impacts: list[str] = []

    if slot_diff.get("added") or slot_diff.get("removed") or slot_diff.get("modified"):
        dto_impacts.append("slot schema changed -> input/output DTO contract may break")
        form_code_impacts.append("form fields may need add/remove/update")

    if rule_diff.get("added") or rule_diff.get("removed"):
        executor_impacts.append("rule set changed -> executor gating flow changed")
    for item in _normalize_list_of_dict(rule_diff.get("modified")):
        tags = _normalize_list(item.get("change_types"))
        if "operator_changed" in tags or "threshold_changed" in tags:
            executor_impacts.append(f"rule {item.get('rule_id')} threshold/operator changed")
            form_code_impacts.append(f"rule {item.get('rule_id')} judge text/提示需更新")
        if "modified" in tags:
            dto_impacts.append(f"rule {item.get('rule_id')} field/unit changed")

    if gate_diff.get("changed"):
        executor_impacts.append("gate logic/rule_refs/action changed")

    if specir_diff.get("changed"):
        changed_sections = {str(it.get("section")) for it in _normalize_list_of_dict(specir_diff.get("changes"))}
        if "path" in changed_sections or "state" in changed_sections:
            executor_impacts.append("path/state changed")
        if "inputs" in changed_sections:
            dto_impacts.append("inputs section changed")
        if "semantics" in changed_sections:
            form_code_impacts.append("semantic text/name may need update")

    return {
        "form_code": {"impacted": len(form_code_impacts) > 0, "reasons": _dedupe(form_code_impacts)},
        "executor": {"impacted": len(executor_impacts) > 0, "reasons": _dedupe(executor_impacts)},
        "DTO": {"impacted": len(dto_impacts) > 0, "reasons": _dedupe(dto_impacts)},
        "old_spec_fingerprint": _fingerprint(old_payload),
        "new_spec_fingerprint": _fingerprint(new_payload),
    }


def _detect_rule_delta(
    before: Dict[str, Any],
    after: Dict[str, Any],
    old_payload: Dict[str, Any],
    new_payload: Dict[str, Any],
) -> Dict[str, Any]:
    before_condition = before.get("condition")
    after_condition = after.get("condition")
    before_extract = _extract_condition_atoms(before_condition)
    after_extract = _extract_condition_atoms(after_condition)

    change_types = ["modified"]
    detail: Dict[str, Any] = {}
    if before_extract.get("field") != after_extract.get("field"):
        detail["field_changed"] = {"old": before_extract.get("field"), "new": after_extract.get("field")}
    if before_extract.get("operator") != after_extract.get("operator"):
        change_types.append("operator_changed")
        detail["op_changed"] = {"old": before_extract.get("operator"), "new": after_extract.get("operator")}
    threshold_keys = ("value", "min", "max")
    threshold_changed = False
    for key in threshold_keys:
        if before_extract.get(key) != after_extract.get(key):
            threshold_changed = True
            detail[f"{key}_changed"] = {"old": before_extract.get(key), "new": after_extract.get(key)}
    if threshold_changed:
        change_types.append("threshold_changed")

    old_unit = _resolve_rule_unit(before_extract.get("field"), old_payload)
    new_unit = _resolve_rule_unit(after_extract.get("field"), new_payload)
    if old_unit != new_unit:
        detail["unit_changed"] = {"old": old_unit, "new": new_unit}

    return {
        "change_types": _dedupe(change_types),
        "detail": detail,
        "before": before,
        "after": after,
    }


def _rule_map(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    gate = _as_dict(payload.get("gate"))
    rules = _normalize_list_of_dict(gate.get("rules"))
    result: Dict[str, Dict[str, Any]] = {}
    for idx, rule in enumerate(rules):
        rule_id = _as_text(rule.get("rule_id")) or f"rule_{idx+1}"
        result[rule_id] = rule
    return result


def _slot_map(payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    inputs = _as_dict(payload.get("inputs"))
    input_dto = _as_dict(inputs.get("input_dto"))
    result: Dict[str, Dict[str, Any]] = {}
    for key, value in input_dto.items():
        result[str(key)] = _as_dict(value)
    return result


def _extract_condition_atoms(condition: Any) -> Dict[str, Any]:
    if isinstance(condition, dict):
        operator = _as_text(condition.get("operator"))
        return {
            "field": _first_non_empty(_as_text(condition.get("actual")), _as_text(condition.get("left"))),
            "operator": operator,
            "value": condition.get("expected"),
            "min": condition.get("min"),
            "max": condition.get("max"),
        }
    text = _as_text(condition)
    match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|>|<|==|!=)\s*(.+?)\s*$", text)
    if match:
        return {"field": match.group(1), "operator": match.group(2), "value": match.group(3), "min": None, "max": None}
    return {"field": "", "operator": "", "value": text, "min": None, "max": None}


def _resolve_rule_unit(field_name: Any, payload: Dict[str, Any]) -> str:
    target = _as_text(field_name).split(".")[-1]
    if not target:
        return ""
    inputs = _as_dict(payload.get("inputs"))
    input_dto = _as_dict(inputs.get("input_dto"))
    output_dto = _as_dict(inputs.get("output_dto"))
    for source in (input_dto, output_dto):
        item = _as_dict(source.get(target))
        unit = _as_text(item.get("unit"))
        if unit:
            return unit
    return ""


def _gate_logic_fingerprint(gate: Dict[str, Any]) -> Dict[str, Any]:
    logic_keys = ["logic", "decision_logic", "mode", "type"]
    result = {key: gate.get(key) for key in logic_keys if key in gate}
    result["rule_count"] = len(_normalize_list(gate.get("rules")))
    return result


def _fingerprint(payload: Dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _normalize_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _normalize_list_of_dict(value: Any) -> list[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    items: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        items.append(value)
    return items


def _first_non_empty(*values: str) -> str:
    for value in values:
        if value:
            return value
    return ""
