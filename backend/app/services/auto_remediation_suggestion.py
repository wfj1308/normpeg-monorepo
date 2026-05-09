from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict


def remediation_schema() -> Dict[str, Any]:
    return {
        "schema_id": "auto_remediation_suggestion.v1",
        "input_fields": [
            "failed_gate",
            "input_values",
            "threshold",
            "specir",
            "historical_fixes",
            "project_context",
        ],
        "output_fields": [
            "remediation_action",
            "required_evidence",
            "responsible_role",
            "expected_result",
            "deadline_suggestion",
        ],
        "constraints": [
            "suggestion only; no automatic data mutation",
            "all suggestions must trace to spec clause",
            "after remediation, gate must be re-executed and new proof generated",
        ],
    }


def remediation_loop_flow() -> Dict[str, Any]:
    return {
        "name": "remediation_closed_loop_v1",
        "steps": [
            "1) parse failed gate and threshold gap",
            "2) retrieve related SpecIR clause + historical fixes",
            "3) generate remediation suggestion package (action/evidence/role/deadline)",
            "4) execute remediation manually on site",
            "5) re-run gate with updated inputs",
            "6) generate and anchor new proof",
            "7) mark remediation case closed if gate passes",
        ],
        "hard_checks": [
            "no auto data change from engine",
            "spec clause traceability required",
            "gate rerun + proof regeneration required",
        ],
    }


def suggest_remediation(
    *,
    failed_gate: Dict[str, Any],
    input_values: Dict[str, Any],
    threshold: Dict[str, Any],
    specir: Dict[str, Any],
    historical_fixes: list[Dict[str, Any]],
    project_context: Dict[str, Any],
) -> Dict[str, Any]:
    gate_id = str(failed_gate.get("gate_id") or failed_gate.get("gateId") or "unknown_gate").strip()
    rule_id = str(failed_gate.get("rule_id") or failed_gate.get("ruleId") or "unknown_rule").strip()
    slot_key = str(
        failed_gate.get("slotKey") or threshold.get("slotKey") or next(iter(input_values.keys()), "unknown_slot")
    ).strip()
    actual = _num(input_values.get(slot_key))
    target = _num(threshold.get("value") if "value" in threshold else threshold.get("threshold"))
    operator = str(threshold.get("operator") or ">=").strip() or ">="
    gap = None if (actual is None or target is None) else round(target - actual, 4)

    clause = str(specir.get("clause_text") or specir.get("source_text") or "").strip()
    norm_ref = str(specir.get("normRef") or specir.get("norm_ref") or "").strip()
    specir_id = str(specir.get("specir_id") or specir.get("spec_id") or "").strip()
    role = _infer_role(slot_key=slot_key, project_context=project_context, historical_fixes=historical_fixes)
    deadline = _deadline(project_context=project_context, severity=str(failed_gate.get("severity") or "medium"))
    expected_result = f"{slot_key} {operator} {target}" if target is not None else f"{slot_key} meets gate condition"

    action = _build_action(slot_key=slot_key, gap=gap, operator=operator, target=target, historical_fixes=historical_fixes)
    evidence = _build_evidence(clause=clause, norm_ref=norm_ref, specir_id=specir_id, slot_key=slot_key, gate_id=gate_id, rule_id=rule_id)

    return {
        "remediation_schema": remediation_schema(),
        "remediation_closed_loop": remediation_loop_flow(),
        "suggestion": {
            "remediation_action": action,
            "required_evidence": evidence,
            "responsible_role": role,
            "expected_result": expected_result,
            "deadline_suggestion": deadline,
        },
        "traceability": {
            "specir_id": specir_id,
            "normRef": norm_ref,
            "clause_text": clause,
            "gate_id": gate_id,
            "rule_id": rule_id,
        },
        "execution_guard": {
            "auto_modify_data": False,
            "must_rerun_gate": True,
            "must_generate_new_proof": True,
            "status": "suggestion_only",
        },
        "meta": {"generated_at": _now()},
    }


def _build_action(*, slot_key: str, gap: float | None, operator: str, target: float | None, historical_fixes: list[Dict[str, Any]]) -> str:
    if gap is None:
        return f"Inspect {slot_key} acquisition chain and apply standard remediation process based on latest spec requirement."
    reuse = _find_historical_pattern(slot_key=slot_key, historical_fixes=historical_fixes)
    if reuse:
        return f"Apply historical fix pattern: {reuse}. Then verify {slot_key} {operator} {target}."
    if gap > 0:
        return f"Increase {slot_key} by at least {gap} to satisfy {slot_key} {operator} {target}."
    return f"Stabilize {slot_key} around threshold and re-test to ensure durable pass condition."


def _build_evidence(*, clause: str, norm_ref: str, specir_id: str, slot_key: str, gate_id: str, rule_id: str) -> list[Dict[str, Any]]:
    return [
        {"type": "spec_clause", "specir_id": specir_id, "normRef": norm_ref, "clause_text": clause},
        {"type": "gate_trace", "gate_id": gate_id, "rule_id": rule_id, "slotKey": slot_key},
        {"type": "rerun_required", "action": "re_execute_gate_and_generate_proof"},
    ]


def _infer_role(*, slot_key: str, project_context: Dict[str, Any], historical_fixes: list[Dict[str, Any]]) -> str:
    for row in historical_fixes:
        if not isinstance(row, dict):
            continue
        if str(row.get("slotKey") or "").strip() == slot_key:
            role = str(row.get("responsible_role") or "").strip()
            if role:
                return role
    phase = str(project_context.get("phase") or "").lower()
    if "lab" in phase:
        return "lab_engineer"
    return "site_engineer"


def _deadline(*, project_context: Dict[str, Any], severity: str) -> str:
    sev = severity.strip().lower()
    days = 1 if sev in {"critical", "blocking", "high"} else 3
    due = datetime.now(timezone.utc) + timedelta(days=days)
    return due.date().isoformat()


def _find_historical_pattern(*, slot_key: str, historical_fixes: list[Dict[str, Any]]) -> str:
    for row in historical_fixes:
        if not isinstance(row, dict):
            continue
        if str(row.get("slotKey") or "").strip() != slot_key:
            continue
        txt = str(row.get("action") or row.get("fix") or "").strip()
        if txt:
            return txt
    return ""


def _num(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

