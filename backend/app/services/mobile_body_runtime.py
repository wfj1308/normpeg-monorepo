from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def mobile_page_structure() -> Dict[str, Any]:
    return {
        "page": "mobile_body_only_runtime.v1",
        "sections": [
            "current_form",
            "current_slot",
            "input_value",
            "spec_requirement",
            "gate_result",
            "proof_upload_entry",
            "remediation_suggestion",
        ],
        "ui_rules": [
            "no complex JSON on mobile view",
            "show only current field related specification",
            "when gate fails, show reason + source clause",
            "support offline cache and proof sync after reconnect",
        ],
    }


def offline_sync_strategy() -> Dict[str, Any]:
    return {
        "name": "offline_proof_sync_queue_v1",
        "steps": [
            "1) cache body input/proof metadata locally when offline",
            "2) generate local operation_id and timestamp",
            "3) retry sync on reconnect with FIFO queue",
            "4) mark synced items with remote_ack_id",
            "5) keep failed items for manual retry",
        ],
        "storage": "local_device_queue",
    }


def conflict_resolution() -> Dict[str, Any]:
    return {
        "name": "mobile_runtime_conflict_resolution_v1",
        "rules": [
            "compare by slotKey + form_code + timestamp",
            "if server newer than local: keep server value and flag local as stale",
            "if local newer and unsynced: require manual confirmation before overwrite",
            "proof conflicts always require human review",
        ],
        "outputs": ["server_wins", "local_pending_review", "proof_conflict_review_required"],
    }


def evaluate_mobile_gate(
    *,
    form_code: str,
    slotKey: str,
    input_value: float,
    operator: str,
    threshold: float,
    clause_text: str,
    norm_ref: str,
) -> Dict[str, Any]:
    passed = _judge(input_value=input_value, operator=operator, threshold=threshold)
    if passed:
        gate_status = "PASS"
        reason = "输入值满足规范阈值。"
        remediation = "保持当前工艺，完成 Proof 上传。"
    else:
        gate_status = "FAIL"
        reason = f"输入值 {input_value} 未满足条件 {slotKey} {operator} {threshold}。"
        remediation = "按整改建议处理后复测，并重新执行 Gate 与生成 Proof。"
    return {
        "current_form": form_code,
        "current_slot": slotKey,
        "input_value": input_value,
        "spec_requirement": {
            "slotKey": slotKey,
            "operator": operator,
            "threshold": threshold,
            "normRef": norm_ref,
            "source_clause": clause_text,
        },
        "gate_result": {
            "status": gate_status,
            "reason": reason,
            "source_clause": clause_text,
            "normRef": norm_ref,
        },
        "proof_upload_entry": {"required": True, "status": "pending"},
        "remediation_suggestion": remediation,
        "timestamp": _now(),
    }


def _judge(*, input_value: float, operator: str, threshold: float) -> bool:
    op = operator.strip()
    if op == ">=":
        return input_value >= threshold
    if op == ">":
        return input_value > threshold
    if op == "<=":
        return input_value <= threshold
    if op == "<":
        return input_value < threshold
    if op == "==":
        return input_value == threshold
    return False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

