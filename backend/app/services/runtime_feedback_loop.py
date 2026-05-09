from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


FEEDBACK_TYPES = {
    "suspected_bad_rule",
    "suspected_bad_mapping",
    "missing_runtime_input",
    "unclear_specir",
    "need_human_review",
}


def feedback_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.feedback.loop.v1",
        "trigger_conditions": [
            "high_frequency_gate_fail",
            "high_frequency_slot_missing",
            "high_frequency_rule_override",
            "high_frequency_proof_missing",
            "high_frequency_gate_appeal",
        ],
        "feedback_outputs": sorted(FEEDBACK_TYPES),
        "governance_constraints": {
            "no_auto_modify_published_rule": True,
            "fix_requires_new_rulepack_version": True,
        },
        "review_queue": {
            "queue_name": "specir_review_queue",
            "default_status": "pending_review",
            "actions": ["accept", "reject", "resolve_with_fix"],
        },
        "page_hints": {
            "severity_levels": ["high", "medium", "low"],
            "hint_types": ["banner", "toast", "inline_chip"],
        },
    }


def detect_feedback_candidates(
    *,
    project_id: str,
    gate_results: list[Dict[str, Any]],
    slot_missing_events: list[Dict[str, Any]],
    overrides: list[Dict[str, Any]],
    proof_records: list[Dict[str, Any]],
    appeals: list[Dict[str, Any]],
    thresholds: Dict[str, int] | None = None,
) -> list[Dict[str, Any]]:
    t = _merged_thresholds(thresholds or {})
    items: list[Dict[str, Any]] = []

    gate_fail_counts: Dict[str, int] = {}
    gate_fail_evidence: Dict[str, list[Dict[str, Any]]] = {}
    for row in gate_results:
        gate_id = _as_text(row.get("gate_id") or row.get("gateId")) or "unknown_gate"
        status = _as_text(row.get("status") or row.get("result") or row.get("decision")).upper()
        failed = status in {"FAIL", "FAILED", "BLOCK", "REJECTED"} or bool(row.get("failed"))
        if not failed:
            continue
        gate_fail_counts[gate_id] = gate_fail_counts.get(gate_id, 0) + 1
        gate_fail_evidence.setdefault(gate_id, []).append(_pick_evidence(row))
    for gate_id, count in gate_fail_counts.items():
        if count < t["gate_fail_count"]:
            continue
        items.append(
            _feedback_item(
                project_id=project_id,
                feedback_type="suspected_bad_rule",
                subject={"gate_id": gate_id},
                trigger="high_frequency_gate_fail",
                metrics={"fail_count": count, "threshold": t["gate_fail_count"]},
                evidence=gate_fail_evidence.get(gate_id, [])[:20],
            )
        )

    slot_missing_counts: Dict[str, int] = {}
    slot_missing_evidence: Dict[str, list[Dict[str, Any]]] = {}
    for row in slot_missing_events:
        slot_key = _as_text(row.get("slotKey") or row.get("slot_key")) or "unknown_slot"
        slot_missing_counts[slot_key] = slot_missing_counts.get(slot_key, 0) + 1
        slot_missing_evidence.setdefault(slot_key, []).append(_pick_evidence(row))
    for slot_key, count in slot_missing_counts.items():
        if count < t["slot_missing_count"]:
            continue
        items.append(
            _feedback_item(
                project_id=project_id,
                feedback_type="missing_runtime_input",
                subject={"slotKey": slot_key},
                trigger="high_frequency_slot_missing",
                metrics={"missing_count": count, "threshold": t["slot_missing_count"]},
                evidence=slot_missing_evidence.get(slot_key, [])[:20],
            )
        )

    override_counts: Dict[str, int] = {}
    override_evidence: Dict[str, list[Dict[str, Any]]] = {}
    for row in overrides:
        rule_id = _as_text(row.get("rule_id") or row.get("ruleId")) or "unknown_rule"
        override_counts[rule_id] = override_counts.get(rule_id, 0) + 1
        override_evidence.setdefault(rule_id, []).append(_pick_evidence(row))
    for rule_id, count in override_counts.items():
        if count < t["rule_override_count"]:
            continue
        items.append(
            _feedback_item(
                project_id=project_id,
                feedback_type="need_human_review",
                subject={"rule_id": rule_id},
                trigger="high_frequency_rule_override",
                metrics={"override_count": count, "threshold": t["rule_override_count"]},
                evidence=override_evidence.get(rule_id, [])[:20],
            )
        )

    proof_missing_counts: Dict[str, int] = {}
    proof_missing_evidence: Dict[str, list[Dict[str, Any]]] = {}
    for row in proof_records:
        gate_id = _as_text(row.get("gate_id") or row.get("gateId")) or "unknown_gate"
        has_hash = bool(_as_text(row.get("proof_hash") or row.get("hash")))
        complete = row.get("complete")
        missing = (complete is False) or (not has_hash)
        if not missing:
            continue
        proof_missing_counts[gate_id] = proof_missing_counts.get(gate_id, 0) + 1
        proof_missing_evidence.setdefault(gate_id, []).append(_pick_evidence(row))
    for gate_id, count in proof_missing_counts.items():
        if count < t["proof_missing_count"]:
            continue
        items.append(
            _feedback_item(
                project_id=project_id,
                feedback_type="unclear_specir",
                subject={"gate_id": gate_id},
                trigger="high_frequency_proof_missing",
                metrics={"proof_missing_count": count, "threshold": t["proof_missing_count"]},
                evidence=proof_missing_evidence.get(gate_id, [])[:20],
            )
        )

    appeal_counts: Dict[str, int] = {}
    appeal_evidence: Dict[str, list[Dict[str, Any]]] = {}
    for row in appeals:
        gate_id = _as_text(row.get("gate_id") or row.get("gateId")) or "unknown_gate"
        appeal_counts[gate_id] = appeal_counts.get(gate_id, 0) + 1
        appeal_evidence.setdefault(gate_id, []).append(_pick_evidence(row))
    for gate_id, count in appeal_counts.items():
        if count < t["gate_appeal_count"]:
            continue
        items.append(
            _feedback_item(
                project_id=project_id,
                feedback_type="suspected_bad_mapping",
                subject={"gate_id": gate_id},
                trigger="high_frequency_gate_appeal",
                metrics={"appeal_count": count, "threshold": t["gate_appeal_count"]},
                evidence=appeal_evidence.get(gate_id, [])[:20],
            )
        )

    return items


def enqueue_feedback_items(*, queue_dir: Path, items: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    queue_dir.mkdir(parents=True, exist_ok=True)
    path = queue_dir / "specir_review_queue.jsonl"
    stored: list[Dict[str, Any]] = []
    for item in items:
        row = dict(item)
        row["feedback_id"] = _new_feedback_id()
        row["status"] = "pending_review"
        row["created_at"] = _now()
        row["updated_at"] = row["created_at"]
        row["governance_constraints"] = {
            "no_auto_modify_published_rule": True,
            "fix_requires_new_rulepack_version": True,
        }
        _append_jsonl(path, row)
        stored.append(row)
    return stored


def list_specir_review_queue(queue_dir: Path, *, status: str = "") -> list[Dict[str, Any]]:
    rows = _read_jsonl(queue_dir / "specir_review_queue.jsonl")
    normalized_status = _as_text(status).lower()
    if normalized_status:
        rows = [row for row in rows if _as_text(row.get("status")).lower() == normalized_status]
    rows.sort(key=lambda row: _as_text(row.get("created_at")), reverse=True)
    return rows


def apply_review_action(
    *,
    queue_dir: Path,
    feedback_id: str,
    action: str,
    reviewer: str,
    resolution: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    normalized_action = _as_text(action).lower()
    if normalized_action not in {"accept", "reject", "resolve_with_fix"}:
        raise ValueError("action must be accept/reject/resolve_with_fix")
    reviewer_id = _as_text(reviewer)
    if not reviewer_id:
        raise ValueError("reviewer is required")
    rows = _read_jsonl(queue_dir / "specir_review_queue.jsonl")
    target = None
    for row in rows:
        if _as_text(row.get("feedback_id")) == feedback_id:
            target = row
            break
    if not isinstance(target, dict):
        raise ValueError(f"feedback not found: {feedback_id}")

    resolution_obj = resolution if isinstance(resolution, dict) else {}
    if normalized_action == "resolve_with_fix":
        apply_mode = _as_text(resolution_obj.get("apply_mode")).lower()
        if apply_mode in {"auto_modify_published_rule", "auto_modify"}:
            raise ValueError("auto modification on published rules is forbidden")
        new_version = _as_text(resolution_obj.get("new_rulepack_version"))
        if not new_version:
            raise ValueError("new_rulepack_version is required when resolve_with_fix")
        current_version = _as_text(target.get("rulepack_version") or resolution_obj.get("current_rulepack_version"))
        if current_version and new_version == current_version:
            raise ValueError("new_rulepack_version must be different from current version")
        target["status"] = "resolved_with_new_rulepack"
    elif normalized_action == "accept":
        target["status"] = "accepted"
    else:
        target["status"] = "rejected"

    target["reviewer"] = reviewer_id
    target["action"] = normalized_action
    target["resolution"] = resolution_obj
    target["updated_at"] = _now()
    _write_jsonl(queue_dir / "specir_review_queue.jsonl", rows)
    return target


def build_page_hints(queue_items: list[Dict[str, Any]]) -> Dict[str, Any]:
    pending = [item for item in queue_items if _as_text(item.get("status")).lower() == "pending_review"]
    high_items = [item for item in pending if _as_text(item.get("severity")).lower() == "high"]
    count = len(pending)
    hints: list[Dict[str, Any]] = []
    if count > 0:
        hints.append(
            {
                "hint_type": "banner",
                "severity": "high" if high_items else "medium",
                "title": "SpecIR Review Queue has pending runtime feedback",
                "message": f"{count} feedback item(s) waiting for triage.",
                "cta": {"label": "Open Review Queue", "path": "/governance/specir-review-queue"},
            }
        )
    for item in pending[:5]:
        hints.append(
            {
                "hint_type": "inline_chip",
                "severity": _as_text(item.get("severity")) or "medium",
                "title": _as_text(item.get("feedback_type")) or "need_human_review",
                "message": _as_text(item.get("trigger")) or "runtime_feedback_detected",
                "cta": {"label": "Review", "feedback_id": _as_text(item.get("feedback_id"))},
            }
        )
    return {"page_hints": hints, "pending_count": count}


def _feedback_item(
    *,
    project_id: str,
    feedback_type: str,
    subject: Dict[str, Any],
    trigger: str,
    metrics: Dict[str, Any],
    evidence: list[Dict[str, Any]],
) -> Dict[str, Any]:
    if feedback_type not in FEEDBACK_TYPES:
        feedback_type = "need_human_review"
    severity = "high" if int(metrics.get("threshold") or 0) <= int(metrics.get(next(iter(metrics.keys())), 0) or 0) else "medium"
    return {
        "project_id": project_id,
        "feedback_type": feedback_type,
        "subject": subject,
        "trigger": trigger,
        "metrics": metrics,
        "severity": severity,
        "evidence": evidence,
    }


def _merged_thresholds(thresholds: Dict[str, int]) -> Dict[str, int]:
    base = {
        "gate_fail_count": 3,
        "slot_missing_count": 3,
        "rule_override_count": 3,
        "proof_missing_count": 3,
        "gate_appeal_count": 3,
    }
    for key in list(base.keys()):
        raw = thresholds.get(key)
        if isinstance(raw, (int, float)):
            base[key] = max(int(raw), 1)
    return base


def _pick_evidence(row: Dict[str, Any]) -> Dict[str, Any]:
    out = {
        "timestamp": _as_text(row.get("timestamp") or row.get("created_at") or row.get("createdAt")),
        "gate_id": _as_text(row.get("gate_id") or row.get("gateId")),
        "rule_id": _as_text(row.get("rule_id") or row.get("ruleId")),
        "slotKey": _as_text(row.get("slotKey") or row.get("slot_key")),
        "message": _as_text(row.get("message") or row.get("reason") or row.get("detail")),
    }
    return {k: v for k, v in out.items() if v}


def _new_feedback_id() -> str:
    return f"rfb_{int(datetime.now(timezone.utc).timestamp() * 1000)}"


def _append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _read_jsonl(path: Path) -> list[Dict[str, Any]]:
    if not path.exists():
        return []
    out: list[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        t = line.strip()
        if not t:
            continue
        try:
            obj = json.loads(t)
        except Exception:
            continue
        if isinstance(obj, dict):
            out.append(obj)
    return out


def _write_jsonl(path: Path, rows: list[Dict[str, Any]]) -> None:
    text = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
    path.write_text(f"{text}\n" if text else "", encoding="utf-8")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _as_text(value: Any) -> str:
    return str(value or "").strip()

