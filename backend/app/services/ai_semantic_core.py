from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict


SEMANTIC_TYPES = [
    "threshold_constraint",
    "range_constraint",
    "process_requirement",
    "material_requirement",
    "method_requirement",
    "sequencing_requirement",
    "existence_requirement",
    "reference_requirement",
]


def semantic_parser_schema() -> Dict[str, Any]:
    return {
        "schema_id": "ai.semantic.core.v1",
        "input_fields": ["clause_text", "table_cell", "formula", "note"],
        "output_fields": [
            "semantic_type",
            "subject",
            "condition",
            "constraint",
            "scope",
            "runtime_requirement",
            "confidence",
            "reasoning",
            "evidence_span",
        ],
        "semantic_types": SEMANTIC_TYPES,
    }


def parse_semantic_specir(
    *,
    clause_text: str,
    table_cell: str,
    formula: str,
    note: str,
) -> Dict[str, Any]:
    text = "\n".join([str(clause_text or ""), str(table_cell or ""), str(formula or ""), str(note or "")]).strip()
    semantic_type = _detect_semantic_type(text)
    subject = _detect_subject(text)
    condition = _detect_condition(text)
    constraint = _detect_constraint(text, semantic_type)
    scope = _detect_scope(text)
    runtime_requirement = _detect_runtime_requirement(text, semantic_type)
    confidence = _estimate_confidence(text, semantic_type)
    evidence_span = _extract_evidence_span(text, semantic_type)
    reasoning = _build_reasoning(
        semantic_type=semantic_type,
        subject=subject,
        condition=condition,
        constraint=constraint,
        scope=scope,
        evidence_span=evidence_span,
    )
    return {
        "schema": semantic_parser_schema(),
        "meta": {"generated_at": _now()},
        "semantic_specir": {
            "semantic_type": semantic_type,
            "subject": subject,
            "condition": condition,
            "constraint": constraint,
            "scope": scope,
            "runtime_requirement": runtime_requirement,
            "confidence": confidence,
        },
        "reasoning": reasoning,
        "evidence_span": evidence_span,
        "confidence": confidence,
    }


def _detect_semantic_type(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(>=|<=|>|<|≥|≤)\b", t) or "不应小于" in text or "不得低于" in text:
        return "threshold_constraint"
    if re.search(r"\d+\s*[-~至]\s*\d+", text):
        return "range_constraint"
    if any(k in text for k in ["工序", "步骤", "应按", "流程"]):
        return "process_requirement"
    if any(k in text for k in ["材料", "配合比", "强度等级", "含量"]):
        return "material_requirement"
    if any(k in text for k in ["试验方法", "检测方法", "按", "T09"]):
        return "method_requirement"
    if any(k in text for k in ["先", "后", "之后", "完成后"]):
        return "sequencing_requirement"
    if any(k in text for k in ["应设置", "应有", "必须有", "存在"]):
        return "existence_requirement"
    if any(k in text for k in ["见", "参照", "依据", "按规范"]):
        return "reference_requirement"
    return "process_requirement"


def _detect_subject(text: str) -> str:
    for token in ["压实度", "厚度", "弯沉", "平整度", "强度", "材料", "试验方法"]:
        if token in text:
            return token
    return "规范对象"


def _detect_condition(text: str) -> str:
    match = re.search(r"(当.*?时|在.*?条件下|如.*?则)", text)
    if match:
        return match.group(0).strip()
    return "默认工况"


def _detect_constraint(text: str, semantic_type: str) -> str:
    if semantic_type in {"threshold_constraint", "range_constraint"}:
        for pattern in [r"([A-Za-z_\u4e00-\u9fa5]+)\s*(>=|<=|>|<|≥|≤)\s*([0-9]+(?:\.[0-9]+)?)", r"([0-9]+(?:\.[0-9]+)?\s*[-~至]\s*[0-9]+(?:\.[0-9]+)?)"]:
            match = re.search(pattern, text)
            if match:
                return match.group(0).strip()
    return "应满足规范要求"


def _detect_scope(text: str) -> str:
    for token in ["路基", "桥梁", "路面", "隧道", "基层", "桩基"]:
        if token in text:
            return token
    return "通用范围"


def _detect_runtime_requirement(text: str, semantic_type: str) -> str:
    if semantic_type in {"threshold_constraint", "range_constraint"}:
        return "runtime must evaluate numeric constraint and emit PASS/FAIL"
    if semantic_type == "sequencing_requirement":
        return "runtime must validate execution order dependency"
    return "runtime must validate clause requirement"


def _extract_evidence_span(text: str, semantic_type: str) -> Dict[str, Any]:
    snippet = text[:180]
    return {
        "semantic_type_signal": semantic_type,
        "text_snippet": snippet,
        "char_range": [0, len(snippet)],
    }


def _build_reasoning(
    *,
    semantic_type: str,
    subject: str,
    condition: str,
    constraint: str,
    scope: str,
    evidence_span: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "format": "semantic_reasoning_v1",
        "steps": [
            f"识别语义类型为 {semantic_type}",
            f"识别主体为 {subject}",
            f"识别条件为 {condition}",
            f"识别约束为 {constraint}",
            f"识别适用范围为 {scope}",
        ],
        "why_this_specir": f"AI 根据证据片段 `{evidence_span.get('text_snippet')}` 提取出上述 Semantic SpecIR。",
    }


def _estimate_confidence(text: str, semantic_type: str) -> float:
    score = 0.55
    if len(text) > 20:
        score += 0.1
    if semantic_type in {"threshold_constraint", "range_constraint", "method_requirement"}:
        score += 0.15
    if re.search(r"\d", text):
        score += 0.1
    return round(min(score, 0.98), 2)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
