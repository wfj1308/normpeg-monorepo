from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def confidence_governance() -> Dict[str, Any]:
    return {
        "policy_id": "hitl2.confidence.v2",
        "review_objective": "human_only_for_low_confidence",
        "sort_policy": ["confidence DESC", "impact_score DESC", "created_at DESC"],
        "bands": [
            {"min": 0.92, "max": 1.0, "decision": "auto_approve_candidate", "status": "auto_approved"},
            {"min": 0.75, "max": 0.92, "decision": "review_required", "status": "pending_review"},
            {"min": 0.0, "max": 0.75, "decision": "blocked", "status": "blocked"},
        ],
    }


def enqueue_candidate(
    *,
    queue_dir: Path,
    form_code: str,
    source: str,
    candidate: Dict[str, Any],
    confidence: float,
    impact_score: float,
) -> Dict[str, Any]:
    queue_dir.mkdir(parents=True, exist_ok=True)
    decision = classify_confidence(confidence)
    normalized_confidence = round(_clamp_01(confidence), 4)
    normalized_impact = round(_clamp_01(impact_score), 4)
    item = {
        "patch_id": f"hitl2_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "form_code": form_code,
        "source": source,
        "candidate": candidate,
        "confidence": normalized_confidence,
        "impact_score": normalized_impact,
        "governance_decision": decision,
        "status": _decision_to_status(decision),
        "review_required": decision == "review_required",
        "created_at": _now(),
    }
    _append_jsonl(queue_dir / "review_queue.jsonl", item)
    return item


def list_review_queue(
    *,
    queue_dir: Path,
    include_auto_approved: bool = True,
) -> list[Dict[str, Any]]:
    items = _read_jsonl(queue_dir / "review_queue.jsonl")
    if not include_auto_approved:
        items = [x for x in items if str(x.get("governance_decision")) != "auto_approve_candidate"]
    items.sort(
        key=lambda x: (
            float(x.get("confidence") or 0.0),
            float(x.get("impact_score") or 0.0),
            str(x.get("created_at") or ""),
        ),
        reverse=True,
    )
    return items


def reviewer_action(
    *,
    queue_dir: Path,
    learning_dir: Path,
    patch_id: str,
    action: str,
    edit_payload: Dict[str, Any] | None = None,
    reviewer: str = "",
) -> Dict[str, Any]:
    action_norm = str(action or "").strip().lower()
    if action_norm not in {"accept", "edit", "reject"}:
        raise ValueError("action must be accept/edit/reject")
    reviewer_id = str(reviewer or "").strip()
    if not reviewer_id:
        raise ValueError("reviewer is required")

    items = _read_jsonl(queue_dir / "review_queue.jsonl")
    target: Dict[str, Any] | None = None
    for item in items:
        if str(item.get("patch_id")) == patch_id:
            target = item
            break
    if target is None:
        raise ValueError(f"patch not found: {patch_id}")

    previous_status = str(target.get("status") or "")
    if action_norm == "accept":
        target["status"] = "accepted"
    elif action_norm == "edit":
        target["status"] = "edited"
        if isinstance(edit_payload, dict):
            target["edit_payload"] = edit_payload
    else:
        target["status"] = "rejected"
    target["reviewer"] = reviewer_id
    target["updated_at"] = _now()
    _write_jsonl(queue_dir / "review_queue.jsonl", items)

    learning_dir.mkdir(parents=True, exist_ok=True)
    learning_event = {
        "event_id": f"learn_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
        "patch_id": patch_id,
        "action": action_norm,
        "reviewer": reviewer_id,
        "confidence": float(target.get("confidence") or 0.0),
        "impact_score": float(target.get("impact_score") or 0.0),
        "governance_decision": str(target.get("governance_decision") or ""),
        "previous_status": previous_status,
        "status_after_action": str(target.get("status") or ""),
        "candidate": target.get("candidate"),
        "edit_payload": edit_payload if isinstance(edit_payload, dict) else {},
        "created_at": _now(),
    }
    _append_jsonl(learning_dir / "learning_loop.jsonl", learning_event)
    return target


def learning_loop_summary(learning_dir: Path) -> Dict[str, Any]:
    rows = _read_jsonl(learning_dir / "learning_loop.jsonl")
    accept = sum(1 for row in rows if str(row.get("action")) == "accept")
    edit = sum(1 for row in rows if str(row.get("action")) == "edit")
    reject = sum(1 for row in rows if str(row.get("action")) == "reject")
    total = len(rows)
    feedback_rate = round((accept + edit + reject) / total, 4) if total > 0 else 0.0
    return {
        "ai_learning_loop": {
            "events": total,
            "accept": accept,
            "edit": edit,
            "reject": reject,
            "feedback_rate": feedback_rate,
            "latest_events": rows[-20:],
        }
    }


def classify_confidence(confidence: float) -> str:
    score = _clamp_01(confidence)
    if score >= 0.92:
        return "auto_approve_candidate"
    if score >= 0.75:
        return "review_required"
    return "blocked"


def _decision_to_status(decision: str) -> str:
    if decision == "auto_approve_candidate":
        return "auto_approved"
    if decision == "review_required":
        return "pending_review"
    return "blocked"


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


def _clamp_01(value: float) -> float:
    score = float(value)
    if score < 0.0:
        return 0.0
    if score > 1.0:
        return 1.0
    return score
