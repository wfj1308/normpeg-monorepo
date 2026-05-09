from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _looks_like_should_have_gate(text: str) -> bool:
    t = str(text or "")
    if any(op in t for op in (">=", "<=", ">", "<", "≥", "≤")):
        return True
    if re.search(r"\d+(?:\.\d+)?\s*%", t):
        return True
    return any(k in t for k in ("不小于", "不大于", "不得", "应", "必须", "阈值", "范围"))


def evaluate_specir_quality_gate(specirs: List[Dict[str, Any]], *, min_confidence: float = 0.92) -> Dict[str, Any]:
    rows: List[Dict[str, Any]] = []
    healthy_count = 0
    warning_count = 0
    error_count = 0
    unresolved_count = 0

    for item in specirs:
        if not isinstance(item, dict):
            continue
        issues: List[Dict[str, str]] = []
        level = "healthy"
        sid = str(item.get("specir_id", "")).strip()
        norm_ref = str(item.get("normRef", "")).strip()
        source = item.get("source") if isinstance(item.get("source"), dict) else {}
        source_text = str(source.get("source_text", "")).strip()
        gate = item.get("gate") if isinstance(item.get("gate"), dict) else {}
        gate_type = str(gate.get("type", "")).strip()
        threshold = gate.get("threshold")
        unit = str(gate.get("unit", "")).strip()
        body = item.get("body") if isinstance(item.get("body"), dict) else {}
        slots = body.get("slots") if isinstance(body.get("slots"), list) else []
        quality = item.get("quality") if isinstance(item.get("quality"), dict) else {}
        confidence = float(quality.get("confidence", 0) or 0)
        unresolved = bool(quality.get("unresolved", False))
        if unresolved:
            unresolved_count += 1

        def add(level_name: str, code: str, message: str) -> None:
            nonlocal level
            issues.append({"level": level_name, "code": code, "message": message})
            if level_name == "error":
                level = "error"
            elif level_name == "warning" and level != "error":
                level = "warning"

        if not norm_ref:
            add("error", "MISSING_NORMREF", "normRef is required")
        if not source_text:
            add("error", "MISSING_SOURCE_TEXT", "source_text is required")
        if gate_type == "none" and _looks_like_should_have_gate(source_text):
            add("warning", "MISSING_GATE", "gate.type=none but clause appears executable")
        if threshold not in (None, "") and not unit:
            add("error", "THRESHOLD_MISSING_UNIT", "threshold exists but unit is missing")
        if not isinstance(slots, list) or len(slots) == 0:
            add("error", "EMPTY_BODY_SLOTS", "body.slots is empty")
        if confidence < float(min_confidence):
            add("error", "LOW_CONFIDENCE", f"confidence {confidence:.4f} < {min_confidence:.4f}")

        if level == "healthy":
            healthy_count += 1
        elif level == "warning":
            warning_count += 1
        else:
            error_count += 1

        rows.append({"specir_id": sid, "status": level, "issues": issues})

    return {
        "generated_at": _utc_now(),
        "min_confidence": min_confidence,
        "healthy_count": healthy_count,
        "warning_count": warning_count,
        "error_count": error_count,
        "unresolved_count": unresolved_count,
        "items": rows,
        "publish_blocked": error_count > 0,
    }


def write_quality_report(path: Path, report: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

