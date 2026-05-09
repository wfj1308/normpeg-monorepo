from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def page_layout() -> Dict[str, Any]:
    return {
        "name": "bim_runtime_linkage_page.v1",
        "panels": [
            "left: bim_component_tree + risk_filter",
            "center: bim_model_canvas_with_highlight",
            "right: specir_rule_gate_detail + proof_viewer + impact_hint",
        ],
        "interactions": [
            "select BIM component -> show related SpecIR/Rule/Gate",
            "gate fail -> highlight BIM component",
            "click component -> show proof",
            "design parameter change -> show impacted gates",
            "filter components by risk level",
        ],
    }


def binding_rules() -> Dict[str, Any]:
    return {
        "rules": [
            "BIMObject.related_specir_ids -> SpecIR nodes",
            "BIMObject.related_slotKeys -> Rule/Gate inputs",
            "runtime gate result by gate_id + form_code maps to BIMObject via related_form_code and slot overlap",
            "proof record by gate_id/rule_id/form_code attaches to selected BIMObject details",
            "risk level from risk engine tags component visibility/filter state",
        ],
        "join_keys": ["bim_object_id", "related_form_code", "related_slotKeys", "related_specir_ids", "gate_id", "rule_id", "form_code"],
    }


def highlight_states() -> Dict[str, Any]:
    return {
        "states": [
            {"state": "normal", "color": "#94a3b8", "meaning": "no active risk/failure"},
            {"state": "pass", "color": "#16a34a", "meaning": "latest gate pass"},
            {"state": "warning", "color": "#f59e0b", "meaning": "medium risk or pending review"},
            {"state": "fail", "color": "#dc2626", "meaning": "gate failed"},
            {"state": "unverifiable", "color": "#7c3aed", "meaning": "proof missing/unverifiable"},
            {"state": "high_risk", "color": "#b91c1c", "meaning": "predicted high-risk component"},
        ]
    }


def build_linkage_view(
    *,
    bim_objects: list[Dict[str, Any]],
    specir_records: list[Dict[str, Any]],
    rule_gate_records: list[Dict[str, Any]],
    runtime_results: list[Dict[str, Any]],
    proof_records: list[Dict[str, Any]],
    risk_items: list[Dict[str, Any]],
    selected_bim_object_id: str = "",
    risk_level_filter: str = "",
    design_change: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    objs = [x for x in bim_objects if isinstance(x, dict)]
    risks = [x for x in risk_items if isinstance(x, dict)]
    selected = next((x for x in objs if str(x.get("bim_object_id") or "") == selected_bim_object_id), objs[0] if objs else None)

    cards = []
    for obj in objs:
        state = _derive_highlight_state(obj=obj, runtime_results=runtime_results, proof_records=proof_records, risk_items=risks)
        risk_level = str(_component_risk_level(obj=obj, risk_items=risks))
        if risk_level_filter and risk_level_filter.strip().lower() != risk_level.lower():
            continue
        cards.append(
            {
                "bim_object_id": obj.get("bim_object_id"),
                "object_type": obj.get("object_type"),
                "related_form_code": obj.get("related_form_code"),
                "risk_level": risk_level,
                "highlight_state": state,
            }
        )

    detail = _build_component_detail(
        selected=selected,
        specir_records=specir_records,
        rule_gate_records=rule_gate_records,
        runtime_results=runtime_results,
        proof_records=proof_records,
    )
    impact_hint = _design_change_impact(selected=selected, design_change=design_change or {}, rule_gate_records=rule_gate_records)

    return {
        "page_layout": page_layout(),
        "binding_rules": binding_rules(),
        "highlight_states": highlight_states(),
        "component_cards": cards,
        "selected_component_detail": detail,
        "design_change_impact_hint": impact_hint,
        "meta": {"generated_at": _now()},
    }


def _derive_highlight_state(*, obj: Dict[str, Any], runtime_results: list[Dict[str, Any]], proof_records: list[Dict[str, Any]], risk_items: list[Dict[str, Any]]) -> str:
    form = str(obj.get("related_form_code") or "")
    slots = {str(x) for x in (obj.get("related_slotKeys") or [])}
    related_runtime = [
        x
        for x in runtime_results
        if str(x.get("form_code") or "") == form and (not slots or str(x.get("slotKey") or "") in slots)
    ]
    if any(str(x.get("result") or x.get("status") or "").upper() in {"FAIL", "ERROR", "BLOCK"} for x in related_runtime):
        return "fail"
    if any(str(x.get("proof_status") or "").lower() == "unverifiable" or bool(x.get("proof_missing", False)) for x in proof_records if str(x.get("form_code") or "") == form):
        return "unverifiable"
    lvl = _component_risk_level(obj=obj, risk_items=risk_items).lower()
    if lvl == "high":
        return "high_risk"
    if lvl == "medium":
        return "warning"
    if related_runtime:
        return "pass"
    return "normal"


def _component_risk_level(*, obj: Dict[str, Any], risk_items: list[Dict[str, Any]]) -> str:
    form = str(obj.get("related_form_code") or "")
    for row in risk_items:
        if str(row.get("form_code") or "") != form:
            continue
        lvl = str(row.get("risk_level") or "").strip()
        if lvl:
            return lvl
        score = float(row.get("risk_score") or 0)
        if score >= 0.75:
            return "high"
        if score >= 0.45:
            return "medium"
    return "low"


def _build_component_detail(
    *,
    selected: Dict[str, Any] | None,
    specir_records: list[Dict[str, Any]],
    rule_gate_records: list[Dict[str, Any]],
    runtime_results: list[Dict[str, Any]],
    proof_records: list[Dict[str, Any]],
) -> Dict[str, Any]:
    if not selected:
        return {}
    form = str(selected.get("related_form_code") or "")
    specir_ids = {str(x) for x in (selected.get("related_specir_ids") or [])}
    slots = {str(x) for x in (selected.get("related_slotKeys") or [])}
    related_specir = [x for x in specir_records if str(x.get("specir_id") or x.get("spec_id") or "") in specir_ids]
    related_rules = [
        x
        for x in rule_gate_records
        if (not form or str(x.get("form_code") or "") == form) and (not slots or str(x.get("slotKey") or "") in slots)
    ]
    related_runtime = [x for x in runtime_results if str(x.get("form_code") or "") == form]
    related_proof = [x for x in proof_records if str(x.get("form_code") or "") == form]
    return {
        "bim_object": selected,
        "related_specir": related_specir,
        "related_rule_gate": related_rules,
        "related_runtime": related_runtime,
        "related_proof": related_proof,
    }


def _design_change_impact(*, selected: Dict[str, Any] | None, design_change: Dict[str, Any], rule_gate_records: list[Dict[str, Any]]) -> Dict[str, Any]:
    if not selected:
        return {"impacted_gates": [], "message": "no component selected"}
    changed_slot = str(design_change.get("slotKey") or "").strip()
    if not changed_slot:
        return {"impacted_gates": [], "message": "no design change slot provided"}
    form = str(selected.get("related_form_code") or "")
    impacted = [
        {
            "gate_id": str(x.get("gate_id") or ""),
            "rule_id": str(x.get("rule_id") or ""),
            "reason": f"design parameter maps to slotKey={changed_slot}",
        }
        for x in rule_gate_records
        if str(x.get("form_code") or "") == form and str(x.get("slotKey") or "") == changed_slot
    ]
    return {"impacted_gates": impacted, "message": "design change may affect these gates"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

