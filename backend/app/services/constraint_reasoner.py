from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict


def condition_schema() -> Dict[str, Any]:
    return {
        "schema_id": "constraint.condition.v1",
        "fields": {
            "work_condition": {"type": "array[string]"},
            "scope": {"type": "array[string]"},
            "special_exception": {"type": "array[string]"},
            "precondition": {"type": "array[string]"},
            "joint_condition": {"type": "array[string]"},
        },
    }


def reason_clause(*, clause: str) -> Dict[str, Any]:
    text = str(clause or "").strip()
    subject = _detect_subject(text)
    operator = _detect_operator(text)
    threshold = _detect_threshold(text)
    unit = _detect_unit(text)
    condition = _detect_condition(text)
    return {
        "condition_schema": condition_schema(),
        "reasoning_engine": {
            "name": "constraint_reasoner_v1",
            "supports": ["work_condition", "scope", "special_exception", "precondition", "joint_condition"],
        },
        "explainability_design": {
            "page_name": "Constraint Tree",
            "views": ["condition tree", "constraint reasoning", "evidence span"],
        },
        "constraint": {
            "subject": subject,
            "condition": condition,
            "operator": operator,
            "threshold": threshold,
            "unit": unit,
        },
        "constraint_reasoning": _build_reasoning(text, subject, condition, operator, threshold, unit),
        "meta": {"generated_at": _now()},
    }


def _detect_subject(text: str) -> str:
    if "压实" in text:
        return "compaction.degree"
    if "厚度" in text:
        return "thickness"
    if "弯沉" in text:
        return "deflection"
    return "unknown.subject"


def _detect_operator(text: str) -> str:
    if any(k in text for k in ["不得小于", "不小于", "至少", "不低于"]):
        return ">="
    if any(k in text for k in ["不得大于", "不大于", "至多", "不高于"]):
        return "<="
    for op in [">=", "<=", ">", "<", "="]:
        if op in text:
            return op
    return ">="


def _detect_threshold(text: str) -> float | None:
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", text)
    if not m:
        return None
    return float(m.group(1))


def _detect_unit(text: str) -> str:
    if "%" in text or "％" in text:
        return "%"
    if "mm" in text.lower():
        return "mm"
    return ""


def _detect_condition(text: str) -> Dict[str, Any]:
    road_type: list[str] = []
    if "高速公路" in text:
        road_type.append("highway")
    if "一级公路" in text:
        road_type.append("grade1")
    return {
        "road_type": road_type,
        "work_condition": _collect_by_keywords(text, ["工况", "施工", "雨天", "低温"]),
        "scope": _collect_by_keywords(text, ["适用", "范围", "路基", "桥梁", "隧道"]),
        "special_exception": _collect_by_keywords(text, ["除", "例外", "特殊"]),
        "precondition": _collect_by_keywords(text, ["前提", "前置", "先", "之后"]),
        "joint_condition": _collect_by_keywords(text, ["且", "并且", "同时"]),
    }


def _collect_by_keywords(text: str, keywords: list[str]) -> list[str]:
    hits: list[str] = []
    for kw in keywords:
        if kw in text:
            hits.append(kw)
    return hits


def _build_reasoning(
    text: str,
    subject: str,
    condition: Dict[str, Any],
    operator: str,
    threshold: float | None,
    unit: str,
) -> Dict[str, Any]:
    snippet = text[:180]
    return {
        "format": "constraint_reasoning_v1",
        "steps": [
            f"识别主体: {subject}",
            f"识别条件树: road_type={condition.get('road_type', [])}",
            f"识别约束: {operator} {threshold if threshold is not None else 'null'} {unit}".strip(),
        ],
        "evidence_span": {"text_snippet": snippet, "char_range": [0, len(snippet)]},
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

