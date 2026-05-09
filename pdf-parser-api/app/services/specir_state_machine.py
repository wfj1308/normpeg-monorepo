from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List


SPECIR_STATES = {"draft", "reviewing", "approved", "rejected", "revised", "published"}

ALLOWED_TRANSITIONS = {
    "draft": {"reviewing"},
    "reviewing": {"approved", "rejected"},
    "approved": {"published", "revised"},
    "rejected": {"revised"},
    "revised": {"approved", "reviewing"},
    "published": {"revised"},
}


@dataclass
class TransitionResult:
    ok: bool
    blockers: List[str]
    specir: Dict[str, Any]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def can_enter_rulepack(status: str) -> bool:
    return str(status or "").strip() == "approved"


def can_publish(status: str) -> bool:
    return str(status or "").strip() == "approved"


def transition_specir_status(specir: Dict[str, Any], *, to_status: str, actor: str, reason: str = "", diff: Dict[str, Any] | None = None) -> TransitionResult:
    row = dict(specir if isinstance(specir, dict) else {})
    blockers: List[str] = []
    from_status = str(row.get("status", "draft")).strip() or "draft"
    to_status = str(to_status or "").strip()

    if from_status not in SPECIR_STATES:
        blockers.append(f"invalid from_status: {from_status}")
    if to_status not in SPECIR_STATES:
        blockers.append(f"invalid to_status: {to_status}")
    if not blockers and to_status not in ALLOWED_TRANSITIONS.get(from_status, set()):
        blockers.append(f"illegal transition: {from_status} -> {to_status}")

    if to_status == "rejected" and not str(reason or "").strip():
        blockers.append("rejected requires reason")
    if to_status == "revised":
        if not isinstance(diff, dict) or len(diff) == 0:
            blockers.append("revised requires non-empty diff")
    if from_status == "published" and to_status == "revised":
        version = str(row.get("version", "")).strip() or "v1"
        row["base_version"] = version
        row["version"] = f"{version}+rev{_utc_now()}"

    if blockers:
        return TransitionResult(ok=False, blockers=blockers, specir=row)

    history = row.get("review_history")
    if not isinstance(history, list):
        history = []
    history.append(
        {
            "from": from_status,
            "to": to_status,
            "actor": str(actor or "").strip(),
            "reason": str(reason or "").strip(),
            "diff": diff if isinstance(diff, dict) else {},
            "at": _utc_now(),
        }
    )
    row["review_history"] = history
    row["status"] = to_status
    if to_status == "rejected":
        row["rejected_reason"] = str(reason or "").strip()
    if to_status == "revised":
        row["revision_diff"] = diff if isinstance(diff, dict) else {}

    return TransitionResult(ok=True, blockers=[], specir=row)

