from __future__ import annotations

import re
from typing import Any, Dict, List


def _to_text(value: Any) -> str:
    return str(value or "").strip()


def _looks_like_decision_clause(text: str) -> bool:
    if not text:
        return False
    if any(op in text for op in (">=", "<=", ">", "<", "≥", "≤")):
        return True
    if re.search(r"\d+(?:\.\d+)?\s*%", text):
        return True
    if re.search(r"\d+(?:\.\d+)?\s*(?:~|～|-|—|至|到)\s*\d+(?:\.\d+)?", text):
        return True
    keywords = (
        "不得",
        "不应",
        "必须",
        "应当",
        "严禁",
        "合格",
        "不合格",
        "不小于",
        "不大于",
        "不低于",
        "不高于",
        "不超过",
        "范围",
        "上限",
        "下限",
        "阈值",
    )
    return any(k in text for k in keywords)


def _is_structured_threshold(threshold: Any) -> bool:
    if threshold is None:
        return False
    if isinstance(threshold, (int, float)):
        return True
    if isinstance(threshold, str):
        return bool(threshold.strip())
    if isinstance(threshold, list):
        return len(threshold) > 0 and all(isinstance(x, (int, float, str)) for x in threshold)
    if isinstance(threshold, dict):
        return len(threshold) > 0
    return False


def check_specir_quality(specir: Dict[str, Any]) -> Dict[str, Any]:
    issues: List[Dict[str, str]] = []
    status = "healthy"

    def add(level: str, code: str, message: str) -> None:
        nonlocal status
        issues.append({"level": level, "code": code, "message": message})
        if level == "error":
            status = "error"
        elif level == "warning" and status != "error":
            status = "warning"

    specir_id = _to_text(specir.get("specir_id"))
    norm_ref = _to_text(specir.get("normRef"))
    source = specir.get("source") if isinstance(specir.get("source"), dict) else {}
    semantic = specir.get("semantic") if isinstance(specir.get("semantic"), dict) else {}
    body = specir.get("body") if isinstance(specir.get("body"), dict) else {}
    gate = specir.get("gate") if isinstance(specir.get("gate"), dict) else {}
    cal = specir.get("cal") if isinstance(specir.get("cal"), dict) else {}

    source_text = _to_text(source.get("source_text"))
    condition = _to_text(semantic.get("condition"))
    gate_type = _to_text(gate.get("type"))
    gate_unit = _to_text(gate.get("unit"))
    threshold = gate.get("threshold")
    cal_type = _to_text(cal.get("type"))
    cal_formula = _to_text(cal.get("formula"))
    cal_inputs = cal.get("inputs") if isinstance(cal.get("inputs"), list) else []
    cal_output = _to_text(cal.get("output"))

    # 1. normRef
    if not norm_ref:
        add("error", "MISSING_NORMREF", "normRef is required")

    # 2. source_text
    if not source_text:
        add("error", "MISSING_SOURCE_TEXT", "source.source_text is required")

    # 3. body.slots completeness
    slots = body.get("slots") if isinstance(body.get("slots"), list) else None
    if slots is None or len(slots) == 0:
        add("warning", "MISSING_SLOTS", "body.slots is missing or empty")
    else:
        for idx, slot in enumerate(slots):
            if not isinstance(slot, dict):
                add("warning", "INVALID_SLOT", f"body.slots[{idx}] must be object")
                continue
            for key in ("key", "label", "type", "required"):
                if key not in slot:
                    add("warning", "INCOMPLETE_SLOT", f"body.slots[{idx}].{key} is missing")

    # 4. gate executability
    if gate_type and gate_type != "none":
        operator = _to_text(gate.get("operator"))
        if not operator:
            add("error", "GATE_NOT_EXECUTABLE", "gate.operator is required for executable gate")
        if threshold is None:
            add("error", "GATE_NOT_EXECUTABLE", "gate.threshold is required for executable gate")
    elif gate_type == "none" and _looks_like_decision_clause(source_text or _to_text(semantic.get("title"))):
        add("warning", "MISSING_GATE_FOR_DECISION_CLAUSE", "gate.type=none but clause looks like decision rule")

    # 5. cal clarity
    if cal_type in {"formula", "lookup", "direct"}:
        if cal_type == "formula" and not cal_formula:
            add("warning", "CAL_UNCLEAR", "cal.formula is required when cal.type=formula")
        if cal_type in {"formula", "lookup"} and len(cal_inputs) == 0:
            add("warning", "CAL_UNCLEAR", "cal.inputs should not be empty")
        if not cal_output:
            add("warning", "CAL_UNCLEAR", "cal.output should not be empty")

    # 6. condition missing
    if not condition:
        add("warning", "MISSING_CONDITION", "semantic.condition is missing")

    # 7. unit missing
    has_threshold = threshold is not None and threshold != ""
    if gate_type in {"min", "max", "range"} and has_threshold and not gate_unit:
        add("error", "MISSING_UNIT", "gate.unit is required when gate has numeric threshold")
    elif has_threshold and not gate_unit:
        add("warning", "MISSING_UNIT", "gate.unit is missing while threshold exists")

    # 8. threshold structured
    if gate_type and gate_type != "none":
        if not _is_structured_threshold(threshold):
            add("warning", "UNSTRUCTURED_THRESHOLD", "gate.threshold is not structured")

    return {"specir_id": specir_id, "status": status, "issues": issues}


def check_specir_quality_batch(specirs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [check_specir_quality(item if isinstance(item, dict) else {}) for item in specirs]
