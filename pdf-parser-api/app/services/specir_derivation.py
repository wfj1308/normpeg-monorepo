from __future__ import annotations

import hashlib
from typing import Any, Dict, List


def _to_rule(specir: Dict[str, Any]) -> Dict[str, Any]:
    specir_id = str(specir.get("specir_id", "")).strip()
    norm_ref = str(specir.get("normRef", "")).strip()
    semantic = specir.get("semantic") if isinstance(specir.get("semantic"), dict) else {}
    body = specir.get("body") if isinstance(specir.get("body"), dict) else {}
    gate = specir.get("gate") if isinstance(specir.get("gate"), dict) else {}
    source = specir.get("source") if isinstance(specir.get("source"), dict) else {}

    slots = body.get("slots") if isinstance(body.get("slots"), list) else []
    slot = slots[0] if slots and isinstance(slots[0], dict) else {}
    field_key = str(slot.get("key", "")).strip() or "measured_value"
    condition = str(semantic.get("condition", "")).strip()

    rid_seed = f"{specir_id}|{field_key}|{norm_ref}"
    rule_id = "rule_" + hashlib.sha1(rid_seed.encode("utf-8")).hexdigest()[:16]

    return {
        "rule_id": rule_id,
        "specir_id": specir_id,
        "field": field_key,
        "operator": str(gate.get("operator", "")).strip(),
        "threshold": gate.get("threshold"),
        "unit": str(gate.get("unit", "")).strip(),
        "condition": condition,
        "source_specir_id": specir_id,
        "normRef": norm_ref,
        "source_text": str(source.get("source_text", "")).strip(),
    }


def _to_gate(specir: Dict[str, Any], rule_id: str) -> Dict[str, Any]:
    specir_id = str(specir.get("specir_id", "")).strip()
    norm_ref = str(specir.get("normRef", "")).strip()
    source = specir.get("source") if isinstance(specir.get("source"), dict) else {}
    gate = specir.get("gate") if isinstance(specir.get("gate"), dict) else {}
    gid_seed = f"{specir_id}|{rule_id}"
    gate_id = "gate_" + hashlib.sha1(gid_seed.encode("utf-8")).hexdigest()[:16]
    return {
        "gate_id": gate_id,
        "rule_id": rule_id,
        "source_specir_id": specir_id,
        "normRef": norm_ref,
        "source_text": str(source.get("source_text", "")).strip(),
        "type": str(gate.get("type", "")).strip(),
        "decision_logic": str(gate.get("decision_logic", "")).strip(),
        "on_pass": "pass",
        "on_fail": str(gate.get("on_fail", "")).strip() or "reject",
    }


def derive_rules_and_gates_from_specir(specir_candidates: Dict[str, Any]) -> Dict[str, Any]:
    specirs = specir_candidates.get("specirs") if isinstance(specir_candidates, dict) else None
    if not isinstance(specirs, list):
        return {"rules": [], "gates": [], "unresolved": {"count": 0, "items": []}}

    rules: List[Dict[str, Any]] = []
    gates: List[Dict[str, Any]] = []
    unresolved_items: List[Dict[str, Any]] = []

    for row in specirs:
        if not isinstance(row, dict):
            continue
        specir_id = str(row.get("specir_id", "")).strip()
        if not specir_id:
            continue
        rule = _to_rule(row)
        rules.append(rule)

        gate = row.get("gate") if isinstance(row.get("gate"), dict) else {}
        gate_type = str(gate.get("type", "")).strip()
        if gate_type == "none":
            unresolved_items.append(
                {
                    "specir_id": specir_id,
                    "rule_id": rule["rule_id"],
                    "type": "MISSING_GATE",
                    "reason": "SpecIR gate.type is none",
                    "action": "BLOCK_OR_MANUAL_FALLBACK",
                }
            )
            continue
        gates.append(_to_gate(row, rule["rule_id"]))

    return {
        "rules": rules,
        "gates": gates,
        "unresolved": {
            "count": len(unresolved_items),
            "items": unresolved_items,
        },
        "publish_blocked": len(unresolved_items) > 0,
    }
