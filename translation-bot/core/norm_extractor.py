from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import requests

from .models import ClauseSemantics, DocumentStructure, Formula, NormSemantics


_UNIT_RE = r"(mm|cm|m|%|MPa|kPa|g/cm3|kg/m3|g/cm\^?3|kg/m\^?3)"
_NUMBER_RE = r"-?\d+(?:\.\d+)?"
_RANGE_SEP_RE = r"~|\uff5e|\u301c|\u81f3|\u2014|\uff0d|\u2212|-"

_CJK_GTE_WORDS = [
    "\u4e0d\u5c0f\u4e8e",  # not less than
    "\u4e0d\u5c11\u4e8e",  # no less than
    "\u5927\u4e8e\u7b49\u4e8e",  # greater than or equal to
    "\u5e94\u4e0d\u5c0f\u4e8e",
    "\u4e0d\u5f97\u5c0f\u4e8e",
]
_CJK_LTE_WORDS = [
    "\u4e0d\u5927\u4e8e",
    "\u4e0d\u9ad8\u4e8e",
    "\u5c0f\u4e8e\u7b49\u4e8e",
    "\u5e94\u4e0d\u5927\u4e8e",
    "\u4e0d\u5f97\u5927\u4e8e",
]
_CJK_GT_WORDS = ["\u5927\u4e8e", "\u9ad8\u4e8e"]
_CJK_LT_WORDS = ["\u5c0f\u4e8e", "\u4f4e\u4e8e"]
_CJK_STDVAL_WORDS = ["\u6807\u51c6\u503c", "\u89c4\u5b9a\u503c", "\u8bbe\u8ba1\u503c", "\u9650\u503c"]
_MEASUREMENT_TERMS = (
    "\u5b9e\u6d4b",
    "\u62bd\u68c0",
    "\u5141\u8bb8\u504f\u5dee",
    "\u6807\u51c6\u503c",
    "\u89c4\u5b9a\u503c",
    "\u4ee3\u8868\u503c",
    "\u5408\u683c\u7387",
    "\u8bd5\u9a8c\u65b9\u6cd5",
    "\u8bd5\u9a8c\u9891\u7387",
    "\u538b\u5b9e\u5ea6",
    "\u5f2f\u6c89",
    "\u539a\u5ea6",
    "\u5e73\u6574\u5ea6",
    "\u542b\u6c34\u7387",
    "cbr",
    "iri",
)
_STRONG_FIELD_TERMS = (
    "\u538b\u5b9e\u5ea6",
    "\u5f2f\u6c89",
    "\u539a\u5ea6",
    "\u5e73\u6574\u5ea6",
    "\u56de\u5f39\u6a21\u91cf",
    "cbr",
    "iri",
)
_PROCESS_TERMS = (
    "\u6761\u6587\u8bf4\u660e",
    "\u65bd\u5de5\u51c6\u5907",
    "\u65bd\u5de5",
    "\u5de5\u827a",
    "\u8bd5\u9a8c\u8def\u6bb5",
    "\u65bd\u5de5\u603b\u7ed3",
    "\u4e0b\u5217\u60c5\u51b5",
    "\u5e94\u5305\u62ec",
    "\u53ef\u91c7\u7528",
    "\u63aa\u65bd",
    "\u5efa\u8bae",
    "\u9700\u6c42",
)
_NON_MEASUREMENT_PATTERNS = (
    "\u8bd5\u9a8c\u9879\u76ee\u5e94\u5305\u62ec",
    "\u8bd5\u9a8c\u8def\u6bb5\u5e94\u9009\u62e9",
    "\u65bd\u5de5\u603b\u7ed3\u5b9c\u5305\u62ec",
    "\u4e0b\u5217\u60c5\u51b5\u5e94\u8fdb\u884c",
    "\u6761\u6587\u8bf4\u660e",
)
_THRESHOLD_CUES = (
    "\u4e0d\u5c0f\u4e8e",
    "\u4e0d\u5927\u4e8e",
    "\u4e0d\u5f97\u5c0f\u4e8e",
    "\u4e0d\u5f97\u5927\u4e8e",
    "\u5927\u4e8e",
    "\u5c0f\u4e8e",
    "\u4f4e\u4e8e",
    "\u9ad8\u4e8e",
    "\u4e0d\u4f4e\u4e8e",
    "\u4e0d\u9ad8\u4e8e",
    "\u5e94\u6ee1\u8db3",
    "\u5e94\u8fbe\u5230",
    "\u5b9c",
)


def _compile_operator_pattern(tokens: Sequence[str]) -> re.Pattern[str]:
    escaped = "|".join(re.escape(token) for token in tokens)
    return re.compile(rf"(?:{escaped})\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)


_RANGE_RE = re.compile(rf"({_NUMBER_RE})\s*(?:{_RANGE_SEP_RE})\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)
_GTE_RE = re.compile(rf"(?:>=|>=|\u2265)\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)
_LTE_RE = re.compile(rf"(?:<=|<=|\u2264)\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)
_GT_RE = re.compile(rf">\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)
_LT_RE = re.compile(rf"<\s*({_NUMBER_RE})\s*{_UNIT_RE}?", re.IGNORECASE)
_GTE_CJK_RE = _compile_operator_pattern(_CJK_GTE_WORDS)
_LTE_CJK_RE = _compile_operator_pattern(_CJK_LTE_WORDS)
_GT_CJK_RE = _compile_operator_pattern(_CJK_GT_WORDS)
_LT_CJK_RE = _compile_operator_pattern(_CJK_LT_WORDS)

_STDVAL_TOKENS = "|".join(re.escape(token) for token in _CJK_STDVAL_WORDS)
_STANDARD_VALUE_RE = re.compile(
    rf"(?:{_STDVAL_TOKENS})\s*[:\uff1a]?\s*(>=|<=|>|<|\u2265|\u2264)?\s*({_NUMBER_RE})\s*{_UNIT_RE}?",
    re.IGNORECASE,
)


class NormExtractor:
    """Stage 2: semantic extraction with rule heuristics + optional LLM assist."""

    def __init__(self, prompt_dir: Path):
        self.prompt_dir = prompt_dir
        self.prompt_templates = self._load_prompts(prompt_dir)
        self.ai_model = os.getenv("NORMPEG_AI_MODEL", "gpt-4o-mini")
        self.ai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        self.ai_api_key = os.getenv("OPENAI_API_KEY", "")

    def extract(self, clause_text: str, extraction_type: str) -> Dict[str, Any]:
        if extraction_type == "measured_item":
            return self._extract_measured_item(clause_text)
        if extraction_type == "gate_rule":
            return {"rules": self._extract_gate_rules(clause_text)}
        if extraction_type == "formula":
            return {"formulas": self._extract_formula_candidates(clause_text)}
        raise ValueError(f"unsupported extraction_type: {extraction_type}")

    def batch_extract(self, structure: DocumentStructure) -> NormSemantics:
        clauses: List[ClauseSemantics] = []
        for clause in structure.clause_tree.leaves():
            clause_text = str(clause.get("text", "")).strip()
            clause_title = str(clause.get("title", "")).strip()
            clause_id = str(clause.get("clause_id", ""))

            with ThreadPoolExecutor(max_workers=3) as pool:
                measured_future = pool.submit(self.extract, clause_text, "measured_item")
                formulas_future = pool.submit(self.extract, clause_text, "formula")
                gates_future = pool.submit(self.extract, clause_text, "gate_rule")

            measured = measured_future.result()
            formulas = formulas_future.result().get("formulas", [])
            gates = gates_future.result().get("rules", [])

            llm_boost = self._try_llm_enrich(clause_text=clause_text)
            if llm_boost:
                measured = self._merge_measured_item(measured, llm_boost.get("measured_item", {}))
                formulas = self._merge_formulas(formulas, llm_boost.get("formulas", []))
                gates = self._merge_gate_rules(gates, llm_boost.get("gate_rules", []))

            confidence = self.calculate_confidence(measured, formulas, gates, clause_text)
            clauses.append(
                ClauseSemantics(
                    clause_id=clause_id,
                    clause_title=clause_title,
                    measured_item=measured,
                    formulas=formulas,
                    gate_rules=gates,
                    confidence=confidence,
                    evidence={"text_preview": clause_text[:280], "llm_enhanced": bool(llm_boost)},
                )
            )

        avg = round(sum(item.confidence for item in clauses) / len(clauses), 4) if clauses else 0.0
        return NormSemantics(standard_code=structure.standard_code, clauses=clauses, avg_confidence=avg)

    def _extract_measured_item(self, text: str) -> Dict[str, Any]:
        normalized_text = self._normalize_clause_text(text)
        line = self._first_non_empty_line(normalized_text) or "Measured item"
        name, field_key = self._infer_name_and_field(line, normalized_text)
        operator, threshold_value, unit = self._extract_threshold(normalized_text)
        is_measurement_clause = self._is_measurement_clause(normalized_text, field_key, threshold_value)

        tolerance = "0"
        if operator == "range" and ".." in threshold_value:
            low, high = threshold_value.split("..", 1)
            tolerance = f"{low}..{high}"

        return {
            "name": name,
            "field_key": field_key,
            "definition": line[:180],
            "standard_value": threshold_value,
            "tolerance": tolerance,
            "test_method": self._infer_test_method(normalized_text),
            "frequency": self._infer_frequency(normalized_text),
            "operator": operator,
            "unit": unit,
            "is_measurement_clause": is_measurement_clause,
            "parameters": [{"name": field_key, "unit": unit or "", "required": True}],
        }

    def _extract_formula_candidates(self, text: str) -> List[Dict[str, Any]]:
        formulas: List[Dict[str, Any]] = []
        for hit in re.finditer(r"([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^\n]{2,120})", text):
            expression = f"{hit.group(1)} = {hit.group(2).strip()}"
            formulas.append(
                {
                    "expression": expression,
                    "formula_latex": expression,
                    "formula_code": expression,
                    "output_variable": hit.group(1),
                    "unit": "",
                }
            )
        return formulas

    def _extract_gate_rules(self, text: str) -> List[Dict[str, Any]]:
        rules: List[Dict[str, Any]] = []
        normalized_text = self._normalize_clause_text(text)
        operator, threshold_value, unit = self._extract_threshold(normalized_text)
        if threshold_value:
            field_name = self._infer_name_and_field(normalized_text[:120], normalized_text)[1]
            if operator == "range":
                condition = f"{field_name} in [{threshold_value}]"
            else:
                condition = f"{field_name} {operator} {threshold_value}{unit or ''}".strip()
            rules.append(
                {
                    "condition": condition,
                    "action": "BLOCK",
                    "message": f"{field_name} does not satisfy {condition}",
                    "severity": "critical",
                }
            )
        else:
            rules.append(
                {
                    "condition": "manual_review_required",
                    "action": "WARNING",
                    "message": "No explicit threshold was extracted; review required.",
                    "severity": "warning",
                }
            )
        return rules

    def calculate_confidence(
        self,
        measured_item: Dict[str, Any],
        formulas: Sequence[Dict[str, Any]],
        gates: Sequence[Dict[str, Any]],
        clause_text: str,
    ) -> float:
        score = 0.48
        if measured_item.get("standard_value"):
            score += 0.18
            if measured_item.get("operator") in {"gte", "lte", "range", "gt", "lt"}:
                score += 0.04
        if measured_item.get("unit"):
            score += 0.08
        if formulas:
            score += 0.08
        if gates:
            score += 0.10
        if len(clause_text) > 150:
            score += 0.06
        if not measured_item.get("is_measurement_clause", True):
            score = max(score, 0.72)
        return round(min(score, 0.98), 4)

    def _load_prompts(self, prompt_dir: Path) -> Dict[str, str]:
        templates: Dict[str, str] = {}
        mapping = {
            "measured_item": "measured_item.txt",
            "formula": "formula.txt",
            "gate_rule": "gate_rule.txt",
        }
        for key, filename in mapping.items():
            path = prompt_dir / filename
            templates[key] = path.read_text(encoding="utf-8") if path.exists() else ""
        return templates

    def _first_non_empty_line(self, text: str) -> str:
        for line in (text or "").splitlines():
            clean = line.strip()
            if clean:
                return clean
        return ""

    def _infer_name_and_field(self, line: str, full_text: str) -> Tuple[str, str]:
        text = f"{line} {full_text}".lower()
        is_compaction_process_context = ("\u538b\u5b9e\u5de5\u827a" in text) and ("\u538b\u5b9e\u5ea6" not in text)
        mapping = [
            (("\u538b\u5b9e", "compaction"), ("Compaction Degree", "compaction_degree")),
            (("\u539a\u5ea6", "thickness"), ("Layer Thickness", "thickness")),
            (("\u5f2f\u6c89", "deflection"), ("Deflection", "deflection")),
            (("\u5e73\u6574", "iri", "roughness"), ("Roughness IRI", "roughness_iri")),
            (("\u6297\u538b\u5f3a\u5ea6", "\u56de\u5f39\u6a21\u91cf", "strength"), ("Strength", "strength")),
            (("\u542b\u6c34", "moisture"), ("Moisture Content", "moisture_content")),
            (("\u5e72\u5bc6\u5ea6", "\u6700\u5927\u5e72\u5bc6\u5ea6", "density"), ("Density", "density")),
        ]
        for terms, (name, field_key) in mapping:
            if field_key == "compaction_degree" and is_compaction_process_context:
                continue
            if any(term in text for term in terms):
                return name, field_key
        return "Measured Value", "measured_value"

    def _extract_threshold(self, text: str) -> Tuple[str, str, str]:
        std_hit = _STANDARD_VALUE_RE.search(text)
        if std_hit:
            op = self._normalize_operator((std_hit.group(1) or "").strip())
            return op, std_hit.group(2), std_hit.group(3) or ""

        matchers: Sequence[Tuple[re.Pattern[str], str]] = (
            (_RANGE_RE, "range"),
            (_GTE_RE, "gte"),
            (_GTE_CJK_RE, "gte"),
            (_LTE_RE, "lte"),
            (_LTE_CJK_RE, "lte"),
            (_GT_RE, "gt"),
            (_GT_CJK_RE, "gt"),
            (_LT_RE, "lt"),
            (_LT_CJK_RE, "lt"),
        )
        for pattern, operator in matchers:
            hit = pattern.search(text)
            if not hit:
                continue
            if operator == "range":
                low = hit.group(1)
                high = hit.group(2)
                unit = hit.group(3) or ""
                return operator, f"{low}..{high}", unit
            value = hit.group(1)
            unit = hit.group(2) or ""
            return operator, value, unit

        compaction_hit = re.search(r"(?:\u538b\u5b9e\u5ea6|\u538b\u5b9e)\D{0,16}(%s)\s*%%" % _NUMBER_RE, text, re.IGNORECASE)
        if compaction_hit:
            return "gte", compaction_hit.group(1), "%"

        density_hit = re.search(
            r"(?:\u5bc6\u5ea6|g/cm3|kg/m3)\D{0,16}(%s)\s*(g/cm3|kg/m3)" % _NUMBER_RE,
            text,
            re.IGNORECASE,
        )
        if density_hit:
            return "gte", density_hit.group(1), density_hit.group(2)
        return "eq", "", ""

    def _infer_test_method(self, text: str) -> str:
        for code in ("T0921", "T0912", "T0931", "T0951"):
            if code in text:
                return code
        return ""

    def _infer_frequency(self, text: str) -> str:
        candidates = [
            "\u6bcf100m",
            "\u6bcf\u8f66\u9053",
            "\u6bcf\u5c42",
            "\u6bcf\u5de5\u4f5c\u73ed",
            "\u6bcf1000m2",
            "\u6bcf1000m^2",
            "\u6bcf1000m\u00b2",
            "\u6bcf\u5904",
            "\u6bcf\u6bb5",
        ]
        for item in candidates:
            if item in text:
                return item
        return ""

    def _normalize_operator(self, raw_op: str) -> str:
        value = raw_op.strip()
        if value in {">=", "\u2265", "\u4e0d\u5c0f\u4e8e", "\u4e0d\u5c11\u4e8e"}:
            return "gte"
        if value in {"<=", "\u2264", "\u4e0d\u5927\u4e8e", "\u4e0d\u9ad8\u4e8e"}:
            return "lte"
        if value in {">", "\u5927\u4e8e", "\u9ad8\u4e8e"}:
            return "gt"
        if value in {"<", "\u5c0f\u4e8e", "\u4f4e\u4e8e"}:
            return "lt"
        return "eq"

    def _is_measurement_clause(self, text: str, field_key: str, threshold_value: str) -> bool:
        if threshold_value:
            return True
        low_text = text.lower()
        if any(marker in low_text for marker in _NON_MEASUREMENT_PATTERNS):
            return False
        has_process_context = any(marker in low_text for marker in _PROCESS_TERMS)
        has_measurement_term = any(marker in low_text for marker in _MEASUREMENT_TERMS)
        has_threshold_cue = any(marker in low_text for marker in _THRESHOLD_CUES)
        has_symbol_operator = bool(re.search(r"(>=|<=|>|<|\u2264|\u2265|~|\uff5e)", low_text))
        has_numeric_limit = bool(re.search(rf"{_NUMBER_RE}\s*{_UNIT_RE}", low_text, re.IGNORECASE))
        has_quantified_requirement = has_threshold_cue or has_symbol_operator or has_numeric_limit

        if has_process_context and not has_measurement_term and not has_quantified_requirement:
            return False
        if has_measurement_term:
            return True

        number_hits = len(re.findall(_NUMBER_RE, low_text))
        unit_hits = len(re.findall(_UNIT_RE, low_text, re.IGNORECASE))
        has_operator = bool(re.search(r"(>=|<=|>|<|\u2264|\u2265)", low_text))

        if field_key != "measured_value":
            if has_operator and number_hits >= 1:
                return True
            if unit_hits >= 1 and number_hits >= 2 and has_threshold_cue:
                return True
            if any(token in low_text for token in _STRONG_FIELD_TERMS) and number_hits >= 1 and has_quantified_requirement:
                return True
            return False

        return False

    def _normalize_clause_text(self, text: str) -> str:
        normalized = (text or "").replace("\u3000", " ")
        replacements = {
            "\uff05": "%",
            "\ufe6a": "%",
            "\uff5e": "~",
            "\u301c": "~",
            "\u2014": "-",
            "\uff0d": "-",
            "\u2212": "-",
            "\u2264": "<=",
            "\u2265": ">=",
            "\uff1a": ":",
            "\uff0c": ",",
            "\u3002": ".",
        }
        for src, dest in replacements.items():
            normalized = normalized.replace(src, dest)

        normalized = re.sub(r"(\d)\s+(mm|cm|m|%|MPa|kPa|g/cm3|kg/m3)\b", r"\1\2", normalized, flags=re.IGNORECASE)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    def _try_llm_enrich(self, clause_text: str) -> Dict[str, Any]:
        if not clause_text.strip():
            return {}
        if not self.ai_base_url:
            return {}
        if not self.ai_api_key and "11434" not in self.ai_base_url and "ollama" not in self.ai_base_url:
            return {}

        system_prompt = (
            "You extract engineering standard semantics. "
            "Return JSON only with keys: measured_item, formulas, gate_rules."
        )
        user_prompt = (
            "Input clause:\n"
            f"{clause_text[:6000]}\n\n"
            "JSON schema:\n"
            "{"
            '"measured_item":{"name":"","field_key":"","definition":"","standard_value":"","tolerance":"","test_method":"","frequency":"","operator":"","unit":""},'
            '"formulas":[{"expression":"","formula_latex":"","formula_code":"","output_variable":"","unit":""}],'
            '"gate_rules":[{"condition":"","action":"PASS/BLOCK/CRITICAL/WARNING","message":"","severity":""}]'
            "}"
        )

        endpoint = self.ai_base_url
        if not endpoint.endswith("/chat/completions"):
            endpoint = endpoint.rstrip("/") + "/chat/completions"
        if not endpoint.endswith("/v1/chat/completions") and "/v1/" not in endpoint:
            endpoint = endpoint.replace("/chat/completions", "/v1/chat/completions")

        headers = {"Content-Type": "application/json"}
        if self.ai_api_key:
            headers["Authorization"] = f"Bearer {self.ai_api_key}"

        payload = {
            "model": self.ai_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }

        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=40)
            response.raise_for_status()
            body = response.json()
            choices = body.get("choices", [])
            if not isinstance(choices, list) or not choices:
                return {}
            message = choices[0].get("message", {})
            content = message.get("content", "") if isinstance(message, dict) else ""
            if isinstance(content, list):
                text_parts = []
                for item in content:
                    if isinstance(item, dict):
                        text_parts.append(str(item.get("text", "")))
                content = "\n".join(text_parts)
            parsed = self._extract_json_object(str(content))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    def _extract_json_object(self, text: str) -> Dict[str, Any]:
        raw = text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?", "", raw, flags=re.IGNORECASE).strip()
            raw = re.sub(r"```$", "", raw).strip()
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            start = raw.find("{")
            end = raw.rfind("}")
            if start >= 0 and end > start:
                try:
                    parsed = json.loads(raw[start : end + 1])
                    return parsed if isinstance(parsed, dict) else {}
                except Exception:
                    return {}
            return {}

    def _merge_measured_item(self, base: Dict[str, Any], llm: Dict[str, Any]) -> Dict[str, Any]:
        merged = dict(base)
        for key in (
            "name",
            "field_key",
            "definition",
            "standard_value",
            "tolerance",
            "test_method",
            "frequency",
            "operator",
            "unit",
            "is_measurement_clause",
        ):
            if key == "is_measurement_clause":
                if key in llm:
                    merged[key] = bool(llm[key])
                continue
            if llm.get(key):
                merged[key] = llm[key]
        if llm.get("parameters") and isinstance(llm["parameters"], list):
            merged["parameters"] = llm["parameters"]
        return merged

    def _merge_formulas(self, base: Sequence[Dict[str, Any]], llm: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for source in (list(llm), list(base)):
            for item in source:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("expression", "")).strip()
                if not key or key in seen:
                    continue
                seen.add(key)
                merged.append(item)
        return merged

    def _merge_gate_rules(self, base: Sequence[Dict[str, Any]], llm: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for source in (list(llm), list(base)):
            for item in source:
                if not isinstance(item, dict):
                    continue
                key = str(item.get("condition", "")).strip()
                if not key or key in seen:
                    continue
                seen.add(key)
                merged.append(item)
        return merged

    @staticmethod
    def from_formulas(formulas: Sequence[Formula]) -> List[Dict[str, Any]]:
        return [
            {
                "expression": item.expression,
                "formula_latex": item.latex,
                "formula_code": item.formula_code,
                "output_variable": item.output_variable,
                "unit": item.unit,
            }
            for item in formulas
        ]
