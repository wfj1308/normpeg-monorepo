from __future__ import annotations

import ast
import re
from typing import Any, Dict, List


REVIEW_STATUS_AUTO_VALIDATED = "AUTO_VALIDATED"
REVIEW_STATUS_NEEDS_REVIEW = "NEEDS_REVIEW"


def _norm_text(value: str) -> str:
    return re.sub(r"[\s\-_/]+", "", value or "").lower()


def _extract_clause_candidates(extracted_data: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []
    clauses = extracted_data.get("clauses")
    if isinstance(clauses, list):
        for item in clauses:
            if isinstance(item, dict):
                for key in ("clauseId", "clause", "id", "title"):
                    val = str(item.get(key) or "").strip()
                    if val:
                        candidates.append(val)
            elif isinstance(item, str):
                candidates.append(item.strip())

    text_pool: List[str] = []
    for section_key in ("chapters",):
        section = extracted_data.get(section_key)
        if isinstance(section, list):
            for item in section:
                if isinstance(item, dict):
                    text_pool.extend([str(item.get("title") or ""), str(item.get("text") or "")])
                elif isinstance(item, str):
                    text_pool.append(item)
    if not candidates:
        for text in text_pool:
            for match in re.findall(r"\b\d+(?:\.\d+){1,4}\b", text):
                candidates.append(match)
    return list(dict.fromkeys([item for item in candidates if item]))


def _extract_norm_candidates(extracted_data: Dict[str, Any], standard_code: str) -> List[str]:
    values: List[str] = []
    if standard_code:
        values.append(standard_code)
    metadata = extracted_data.get("metadata")
    if isinstance(metadata, dict):
        for key in ("standardCode", "norm", "standard", "code", "title"):
            val = str(metadata.get(key) or "").strip()
            if val:
                values.append(val)
    raw_text = str(extracted_data.get("rawText") or "")
    if raw_text:
        for match in re.findall(r"[A-Z]{2,}\s*[A-Z0-9/.-]+-\d{4}", raw_text):
            values.append(match)
    return list(dict.fromkeys([item for item in values if item]))


def _is_formula_valid(formula: str) -> bool:
    if not formula or not isinstance(formula, str):
        return False
    try:
        expr = ast.parse(formula, mode="eval")
    except Exception:
        return False

    allowed_nodes = (
        ast.Expression,
        ast.BinOp,
        ast.UnaryOp,
        ast.Constant,
        ast.Name,
        ast.Load,
        ast.Add,
        ast.Sub,
        ast.Mult,
        ast.Div,
        ast.Mod,
        ast.Pow,
        ast.USub,
        ast.UAdd,
        ast.FloorDiv,
    )
    for node in ast.walk(expr):
        if not isinstance(node, allowed_nodes):
            return False
    return True


def _add_issue(issues: List[Dict[str, Any]], *, code: str, level: str, message: str, field: str | None = None) -> None:
    issue: Dict[str, Any] = {"code": code, "level": level, "message": message}
    if field:
        issue["field"] = field
    issues.append(issue)


def validate_generated_spu(spu: Dict[str, Any], extracted_data: Dict[str, Any], confidence: float, standard_code: str = "") -> Dict[str, Any]:
    issues: List[Dict[str, Any]] = []
    spu = spu if isinstance(spu, dict) else {}
    extracted_data = extracted_data if isinstance(extracted_data, dict) else {}

    spu_id = str(spu.get("spuId") or "").strip()
    meta = spu.get("meta") if isinstance(spu.get("meta"), dict) else {}
    data_obj = spu.get("data") if isinstance(spu.get("data"), dict) else {}
    inputs = data_obj.get("inputs")
    path = spu.get("path")
    rules = spu.get("rules")
    proof = spu.get("proof")

    if not spu_id:
        _add_issue(issues, code="MISSING_META", level="error", field="spuId", message="spuId is required.")
    required_meta_fields = ("name", "norm", "clause", "version")
    missing_meta = [key for key in required_meta_fields if not str(meta.get(key) or "").strip()]
    if missing_meta:
        _add_issue(
            issues,
            code="MISSING_META",
            level="error",
            field="meta",
            message=f"meta is missing required fields: {', '.join(missing_meta)}",
        )
    if not isinstance(inputs, list) or len(inputs) == 0:
        _add_issue(issues, code="MISSING_META", level="error", field="data.inputs", message="data.inputs is required.")
    if not isinstance(path, list) or len(path) == 0:
        _add_issue(issues, code="MISSING_PATH", level="error", field="path", message="path is required.")
    if not isinstance(rules, list) or len(rules) == 0:
        _add_issue(issues, code="MISSING_RULES", level="error", field="rules", message="rules are required.")
    if not isinstance(proof, dict) or len(proof) == 0:
        _add_issue(issues, code="MISSING_META", level="error", field="proof", message="proof is required.")

    clause_candidates = _extract_clause_candidates(extracted_data)
    spu_clause = str(meta.get("clause") or "").strip()
    if clause_candidates:
        if not spu_clause:
            _add_issue(issues, code="CLAUSE_MISMATCH", level="error", field="meta.clause", message="SPU clause is missing.")
        else:
            clause_norm = _norm_text(spu_clause)
            candidate_norm_set = {_norm_text(item) for item in clause_candidates}
            if clause_norm not in candidate_norm_set:
                _add_issue(
                    issues,
                    code="CLAUSE_MISMATCH",
                    level="warning",
                    field="meta.clause",
                    message=f"SPU clause '{spu_clause}' does not match extracted clauses.",
                )

    norm_candidates = _extract_norm_candidates(extracted_data, standard_code=standard_code)
    spu_norm = str(meta.get("norm") or "").strip()
    if spu_norm and norm_candidates:
        spu_norm_key = _norm_text(spu_norm)
        candidate_keys = {_norm_text(item) for item in norm_candidates}
        if spu_norm_key not in candidate_keys:
            _add_issue(
                issues,
                code="NORM_MISMATCH",
                level="error",
                field="meta.norm",
                message=f"SPU norm '{spu_norm}' does not match extracted/target norm.",
            )
    elif not spu_norm:
        _add_issue(issues, code="NORM_MISMATCH", level="error", field="meta.norm", message="SPU meta.norm is missing.")

    if isinstance(rules, list):
        for idx, rule in enumerate(rules):
            if not isinstance(rule, dict):
                _add_issue(issues, code="MISSING_RULES", level="error", field=f"rules[{idx}]", message="Rule must be an object.")
                continue
            if not str(rule.get("field") or "").strip():
                _add_issue(issues, code="MISSING_RULES", level="error", field=f"rules[{idx}].field", message="Rule field is required.")
            if not str(rule.get("operator") or "").strip():
                _add_issue(issues, code="MISSING_RULES", level="error", field=f"rules[{idx}].operator", message="Rule operator is required.")
            if "value" not in rule and "threshold" not in rule:
                _add_issue(
                    issues,
                    code="MISSING_RULES",
                    level="error",
                    field=f"rules[{idx}].value",
                    message="Rule value (or threshold) is required.",
                )
            if not str(rule.get("message") or "").strip():
                _add_issue(issues, code="MISSING_RULES", level="error", field=f"rules[{idx}].message", message="Rule message is required.")

    if isinstance(path, list):
        for idx, step in enumerate(path):
            if not isinstance(step, dict):
                _add_issue(issues, code="INVALID_FORMULA", level="error", field=f"path[{idx}]", message="Path step must be an object.")
                continue
            formula = str(step.get("formula") or "").strip()
            if not _is_formula_valid(formula):
                _add_issue(
                    issues,
                    code="INVALID_FORMULA",
                    level="error",
                    field=f"path[{idx}].formula",
                    message=f"Formula is not executable: {formula or '(empty)'}",
                )

    if confidence < 0.9:
        _add_issue(
            issues,
            code="LOW_CONFIDENCE",
            level="warning",
            field="confidence",
            message="Confidence is below 0.9. Manual confirmation is recommended.",
        )

    error_count = sum(1 for issue in issues if issue.get("level") == "error")
    warning_count = sum(1 for issue in issues if issue.get("level") == "warning")
    score = max(0.0, min(1.0, 1.0 - error_count * 0.2 - warning_count * 0.08))

    passed = error_count == 0 and confidence >= 0.9
    review_status = REVIEW_STATUS_AUTO_VALIDATED if passed else REVIEW_STATUS_NEEDS_REVIEW

    return {
        "passed": passed,
        "reviewStatus": review_status,
        "issues": issues,
        "score": round(score, 4),
    }
