from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict


def compliance_schema() -> Dict[str, Any]:
    return {
        "schema_id": "live_compliance_engine.v2",
        "input_fields": [
            "project_peg",
            "runtime_events",
            "runtime_records",
            "rulepack",
            "specir",
            "proof_records",
            "project_context",
        ],
        "output_fields": [
            "compliance_score",
            "failed_gates",
            "risk_level",
            "affected_forms",
            "suggested_actions",
            "reasoning_chain",
        ],
        "capabilities": ["project_level_tracing", "state_machine", "specir_clause_traceability", "manual_override_review_queue"],
        "states": ["pass", "fail", "unverifiable", "review_required"],
    }


def scoring_strategy() -> Dict[str, Any]:
    return {
        "name": "live_weighted_compliance_scoring_v2",
        "formula": "score = base(100) - failed_gate_penalty - critical_gate_extra_penalty - unverifiable_penalty - override_review_penalty",
        "weights": {
            "failed_gate_penalty_each": 8.0,
            "critical_gate_extra_penalty_each": 12.0,
            "unverifiable_penalty_each": 5.0,
            "manual_override_penalty_each": 3.0,
        },
        "state_overrides": {
            "critical_gate_failed": "fail",
            "missing_proof": "unverifiable",
            "manual_override": "review_required",
        },
    }


def reasoning_design() -> Dict[str, Any]:
    return {
        "name": "live_compliance_reasoning_chain_v2",
        "steps": [
            "1) Parse runtime events/records + rulepack + specir + proof + project context",
            "2) Apply compliance state machine",
            "3) Detect critical gate failures, proof gaps, and manual overrides",
            "4) Trace failed gates back to SpecIR and source clauses",
            "5) Build risk level, affected forms, and suggested actions",
            "6) Compute compliance score with governance penalties",
        ],
    }


def evaluate_project_compliance(
    *,
    project_peg: Dict[str, Any],
    runtime_records: list[Dict[str, Any]],
    runtime_events: list[Dict[str, Any]] | None = None,
    rulepack: Dict[str, Any],
    specir: list[Dict[str, Any]] | Dict[str, Any] | None = None,
    proof_records: list[Dict[str, Any]],
    project_context: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    runtime_rows = [row for row in runtime_records if isinstance(row, dict)]
    event_rows = [row for row in (runtime_events or []) if isinstance(row, dict)]
    if event_rows:
        runtime_rows = runtime_rows + _runtime_records_from_events(event_rows)
    proof_rows = [row for row in proof_records if isinstance(row, dict)]
    rules = _extract_rule_rows(rulepack)
    spec_rows = _normalize_specir_rows(specir)

    failed_gates = _collect_failed_gates(runtime_rows, rules)
    critical_failed = [row for row in failed_gates if str(row.get("severity", "")).lower() in {"critical", "blocking"}]
    missing_proof = _collect_missing_proof(runtime_rows, proof_rows)
    manual_override = _collect_manual_override(event_rows)
    affected_forms = sorted(
        {
            str(row.get("form_code") or row.get("formCode") or "").strip()
            for row in runtime_rows
            if str(row.get("form_code") or row.get("formCode") or "").strip()
        }
    )
    failed_gates = _attach_traceability(failed_gates=failed_gates, spec_rows=spec_rows)
    compliance_state = _resolve_state(critical_failed=critical_failed, missing_proof=missing_proof, manual_override=manual_override)

    strategy = scoring_strategy()
    failed_pen = len(failed_gates) * float(strategy["weights"]["failed_gate_penalty_each"])
    critical_pen = len(critical_failed) * float(strategy["weights"]["critical_gate_extra_penalty_each"])
    unverifiable_pen = len(missing_proof) * float(strategy["weights"]["unverifiable_penalty_each"])
    override_pen = len(manual_override) * float(strategy["weights"]["manual_override_penalty_each"])
    compliance_score = max(0.0, round(100.0 - failed_pen - critical_pen - unverifiable_pen - override_pen, 2))
    risk_level = _risk_level(compliance_score=compliance_score, state=compliance_state)
    suggested_actions = _suggest_actions(
        failed_gates=failed_gates,
        missing_proof=missing_proof,
        manual_override=manual_override,
        state=compliance_state,
        risk_level=risk_level,
    )

    reasoning_chain = [
        f"Loaded runtime_records={len(runtime_rows)}, runtime_events={len(event_rows)}, rules={len(rules)}, specir={len(spec_rows)}, proof_records={len(proof_rows)}.",
        f"State machine decided state={compliance_state} (critical_failed={len(critical_failed)}, missing_proof={len(missing_proof)}, manual_override={len(manual_override)}).",
        f"Detected failed_gates={len(failed_gates)} and affected_forms={len(affected_forms)}.",
        "Attached traceability for failed gates to SpecIR IDs and source clauses where matched.",
        f"Applied scoring penalties: failed={failed_pen}, critical={critical_pen}, unverifiable={unverifiable_pen}, override={override_pen}.",
        f"Computed compliance_score={compliance_score}, risk_level={risk_level}.",
    ]
    review_queue = _build_manual_override_review_queue(
        project_id=str(project_peg.get("project_id") or project_peg.get("id") or "").strip(),
        manual_override=manual_override,
    )

    return {
        "compliance_engine": {
            "name": "live_compliance_engine_v2",
            "project_level_tracing": True,
            "state_machine": {
                "states": ["pass", "fail", "unverifiable", "review_required"],
                "rules": [
                    "if any critical gate failed -> fail",
                    "if any missing proof -> unverifiable",
                    "if any manual override -> review_required",
                    "else -> pass",
                ],
            },
        },
        "scoring_strategy": strategy,
        "reasoning_design": reasoning_design(),
        "project_trace": {
            "runtime_events": event_rows,
            "runtime_records": runtime_rows,
            "failed_gate_trace": failed_gates,
            "missing_proof_trace": missing_proof,
            "manual_override_trace": manual_override,
            "specir_trace": spec_rows,
            "project_context": project_context or {},
        },
        "result": {
            "compliance_state": compliance_state,
            "compliance_score": compliance_score,
            "failed_gates": failed_gates,
            "risk_level": risk_level,
            "affected_forms": affected_forms,
            "suggested_actions": suggested_actions,
            "reasoning_chain": reasoning_chain,
        },
        "manual_review_queue": review_queue,
        "meta": {
            "generated_at": _now(),
            "project_id": str(project_peg.get("project_id") or project_peg.get("id") or ""),
        },
    }


def _extract_rule_rows(rulepack: Dict[str, Any]) -> list[Dict[str, Any]]:
    gate = rulepack.get("gate")
    if isinstance(gate, dict) and isinstance(gate.get("rules"), list):
        return [r for r in gate.get("rules", []) if isinstance(r, dict)]
    if isinstance(rulepack.get("rules"), list):
        return [r for r in rulepack.get("rules", []) if isinstance(r, dict)]
    return []


def _collect_failed_gates(runtime_rows: list[Dict[str, Any]], rules: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    rule_lookup = {str(r.get("rule_id") or "").strip(): r for r in rules}
    out: list[Dict[str, Any]] = []
    for row in runtime_rows:
        gate = row.get("gate")
        if not isinstance(gate, dict):
            continue
        rule_results = gate.get("rule_results")
        if not isinstance(rule_results, list):
            continue
        for result in rule_results:
            if not isinstance(result, dict):
                continue
            passed = bool(result.get("passed"))
            if passed:
                continue
            rid = str(result.get("rule_id") or "").strip()
            rule_meta = rule_lookup.get(rid, {})
            out.append(
                {
                    "gate_id": str(row.get("gate_id") or row.get("gateId") or "default").strip() or "default",
                    "rule_id": rid,
                    "slotKey": str(row.get("slotKey") or "").strip(),
                    "form_code": str(row.get("form_code") or row.get("formCode") or "").strip(),
                    "message": str(result.get("message") or ""),
                    "severity": str(result.get("severity") or rule_meta.get("severity") or "unknown"),
                    "expected": result.get("expected_value"),
                    "actual": result.get("actual_value"),
                }
            )
    return out


def _collect_missing_proof(runtime_rows: list[Dict[str, Any]], proof_rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    proof_hashes = {
        str((row.get("proof_hash") if isinstance(row, dict) else "") or "").strip()
        for row in proof_rows
        if isinstance(row, dict)
    }
    out: list[Dict[str, Any]] = []
    for row in runtime_rows:
        p_hash = str(row.get("proof_hash") or "").strip()
        exec_id = str(row.get("execution_id") or "").strip()
        if not p_hash:
            out.append({"execution_id": exec_id, "reason": "missing proof_hash in runtime record"})
            continue
        if p_hash not in proof_hashes:
            out.append({"execution_id": exec_id, "proof_hash": p_hash, "reason": "proof_hash not found in proof records"})
    return out


def _risk_level(*, compliance_score: float, state: str) -> str:
    if state in {"fail", "unverifiable"}:
        return "high"
    if state == "review_required":
        return "medium"
    score = compliance_score
    if score >= 90:
        return "low"
    if score >= 75:
        return "medium"
    return "high"


def _suggest_actions(
    *,
    failed_gates: list[Dict[str, Any]],
    missing_proof: list[Dict[str, Any]],
    manual_override: list[Dict[str, Any]],
    state: str,
    risk_level: str,
) -> list[str]:
    actions: list[str] = []
    if failed_gates:
        actions.append("Fix failed gates and re-run runtime execution for affected forms.")
    if any(str(item.get("severity", "")).lower() in {"critical", "blocking"} for item in failed_gates):
        actions.append("Critical gate failures found. Mark local compliance status as fail and block release.")
    if missing_proof:
        actions.append("Missing proof detected. Status is unverifiable until proof is generated/anchored.")
    if manual_override:
        actions.append("Manual override detected. Push records into reviewer queue before final approval.")
    if state == "review_required":
        actions.append("Complete human review queue and re-evaluate live compliance.")
    if risk_level == "high":
        actions.append("Block release and trigger compliance review board workflow.")
    if not actions:
        actions.append("Compliance is healthy. Keep live monitoring enabled.")
    return actions


def _runtime_records_from_events(event_rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for row in event_rows:
        event_type = str(row.get("event_type") or "").strip().lower()
        rule_id = str(row.get("rule_id") or "").strip()
        gate_id = str(row.get("gate_id") or "").strip() or "default"
        passed = event_type == "gate_passed"
        failed = event_type == "gate_failed"
        if not rule_id or (not passed and not failed and event_type != "rule_executed"):
            continue
        out.append(
            {
                "execution_id": str(row.get("event_id") or "").strip(),
                "form_code": str(row.get("form_code") or "").strip(),
                "slotKey": str(row.get("slotKey") or "").strip(),
                "gate_id": gate_id,
                "proof_hash": str(row.get("proof_ref") or "").strip(),
                "gate": {
                    "rule_results": [
                        {
                            "rule_id": rule_id,
                            "passed": passed if (passed or failed) else str(row.get("result") or "").strip().upper() in {"PASS", "OK"},
                            "severity": "",
                            "message": str(row.get("result") or ""),
                            "expected_value": (row.get("output_values") or {}).get("threshold")
                            if isinstance(row.get("output_values"), dict)
                            else None,
                            "actual_value": (row.get("input_values") or {}).get(str(row.get("slotKey") or ""))
                            if isinstance(row.get("input_values"), dict)
                            else None,
                        }
                    ]
                },
            }
        )
    return out


def _collect_manual_override(event_rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    for row in event_rows:
        if str(row.get("event_type") or "").strip().lower() != "manual_override":
            continue
        out.append(
            {
                "event_id": str(row.get("event_id") or "").strip(),
                "project_id": str(row.get("project_id") or "").strip(),
                "form_code": str(row.get("form_code") or "").strip(),
                "gate_id": str(row.get("gate_id") or "").strip(),
                "rule_id": str(row.get("rule_id") or "").strip(),
                "operator": str(row.get("operator") or "").strip(),
                "timestamp": str(row.get("timestamp") or "").strip(),
            }
        )
    return out


def _resolve_state(*, critical_failed: list[Dict[str, Any]], missing_proof: list[Dict[str, Any]], manual_override: list[Dict[str, Any]]) -> str:
    if critical_failed:
        return "fail"
    if missing_proof:
        return "unverifiable"
    if manual_override:
        return "review_required"
    return "pass"


def _normalize_specir_rows(specir: list[Dict[str, Any]] | Dict[str, Any] | None) -> list[Dict[str, Any]]:
    if isinstance(specir, list):
        return [item for item in specir if isinstance(item, dict)]
    if isinstance(specir, dict):
        if isinstance(specir.get("items"), list):
            return [item for item in specir.get("items", []) if isinstance(item, dict)]
        return [specir]
    return []


def _attach_traceability(*, failed_gates: list[Dict[str, Any]], spec_rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    rule_to_spec: Dict[str, Dict[str, str]] = {}
    gate_to_spec: Dict[str, Dict[str, str]] = {}
    for row in spec_rows:
        specir_id = str(row.get("specir_id") or row.get("spec_id") or row.get("id") or "").strip()
        clause = str(row.get("clause") or row.get("clause_text") or row.get("source_text") or "").strip()
        for rid in _as_id_list(row.get("rule_id"), row.get("rule_ids"), row.get("rules")):
            rule_to_spec[rid] = {"specir_id": specir_id, "clause_text": clause}
        for gid in _as_id_list(row.get("gate_id"), row.get("gate_ids"), row.get("gates")):
            gate_to_spec[gid] = {"specir_id": specir_id, "clause_text": clause}

    out: list[Dict[str, Any]] = []
    for item in failed_gates:
        rid = str(item.get("rule_id") or "").strip()
        gid = str(item.get("gate_id") or "").strip()
        trace = rule_to_spec.get(rid) or gate_to_spec.get(gid) or {}
        merged = dict(item)
        merged["traceability"] = {
            "specir_id": trace.get("specir_id", ""),
            "clause_text": trace.get("clause_text", ""),
        }
        out.append(merged)
    return out


def _as_id_list(*values: Any) -> list[str]:
    out: list[str] = []
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                out.append(text)
            continue
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    text = item.strip()
                    if text:
                        out.append(text)
                elif isinstance(item, dict):
                    for key in ("rule_id", "gate_id", "id"):
                        text = str(item.get(key) or "").strip()
                        if text:
                            out.append(text)
                            break
    return out


def _build_manual_override_review_queue(*, project_id: str, manual_override: list[Dict[str, Any]]) -> Dict[str, Any]:
    queue_items = []
    for idx, item in enumerate(manual_override, start=1):
        row = dict(item)
        row["queue_id"] = f"moq_{idx}"
        row["status"] = "pending_review"
        queue_items.append(row)
    _append_manual_override_queue(project_id=project_id, items=queue_items)
    return {"items": queue_items, "count": len(queue_items)}


def _append_manual_override_queue(*, project_id: str, items: list[Dict[str, Any]]) -> None:
    if not items:
        return
    base = Path(__file__).resolve().parents[2] / "data" / "compliance"
    base.mkdir(parents=True, exist_ok=True)
    path = base / "manual_override_review_queue.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        for item in items:
            payload = {"project_id": project_id, "recorded_at": _now(), **item}
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
