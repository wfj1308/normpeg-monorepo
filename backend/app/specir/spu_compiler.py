from __future__ import annotations

import ast
import copy
import json
import re
from pathlib import Path
from typing import Any, Dict, Mapping

import yaml

from ..core.expression_engine import normalize_expression
from ..core.gate_engine import GateEngine, GateExecutionError
from ..core.path_executor import PathExecutionError, PathExecutor
from .models import SpecIRDocument


class SpecIRSPUCompilerError(ValueError):
    """Raised when SpecIR -> SPU compilation or validation fails."""


_ALLOWED_RULE_TYPES = {"range", "compare", "relation", "formula"}
_NON_MANDATORY_TONE_PATTERN = re.compile(r"(宜|可|建议|\bshould\b|\bmay\b|\brecommend(?:ed)?\b)", re.IGNORECASE)
_UNIT_CONVERSION_PATTERN = re.compile(r"(换算|单位|unit\s*conversion|convert(?:ed|ing)?)", re.IGNORECASE)
_RELATION_EXPR_PATTERN = re.compile(
    r"^\s*(?P<left>[A-Za-z_][A-Za-z0-9_\.]*)\s*(?P<operator>>=|<=|>|<|==)\s*"
    r"(?P<right>[A-Za-z_][A-Za-z0-9_\.]*)\s*(?P<sign>[+-])\s*(?P<constant>\d+(?:\.\d+)?)\s*$"
)
_COMPARE_EXPR_PATTERN = re.compile(
    r"^\s*(?P<left>[A-Za-z_][A-Za-z0-9_\.]*)\s*(?P<operator>>=|<=|>|<|==)\s*(?P<right>.+?)\s*$"
)
_RANGE_EXPR_PATTERN = re.compile(
    r"^\s*(?P<min>.+?)\s*(?P<min_op><=|<)\s*(?P<actual>[A-Za-z_][A-Za-z0-9_\.]*)\s*"
    r"(?P<max_op><=|<)\s*(?P<max>.+?)\s*$"
)
_IDENTIFIER_PATTERN = re.compile(r"[A-Za-z_][A-Za-z0-9_\.]*")
_EXPR_FUNCTIONS = {"exists", "if_", "coalesce"}


def compile_spec_to_spu(spec_document: SpecIRDocument) -> Dict[str, Any]:
    if not isinstance(spec_document, SpecIRDocument):
        raise SpecIRSPUCompilerError("spec_document must be SpecIRDocument")
    payload = spec_document.raw if isinstance(spec_document.raw, dict) and spec_document.raw else _rebuild_raw(spec_document)
    return compile_specir_payload_to_spu(payload, source_file=spec_document.source_file)


def compile_specir_payload_to_spu(payload: Mapping[str, Any], *, source_file: str = "<inline>") -> Dict[str, Any]:
    if not isinstance(payload, Mapping):
        raise SpecIRSPUCompilerError("SpecIR payload must be object")

    spec_id = _required_text(payload.get("spec_id"), "spec_id")
    version = _required_text(payload.get("version"), "version")
    namespace = _required_text(payload.get("namespace"), "namespace")
    spec_type = _required_text(payload.get("type"), "type")

    semantics = payload.get("semantics") if isinstance(payload.get("semantics"), Mapping) else {}
    inputs = payload.get("inputs") if isinstance(payload.get("inputs"), Mapping) else {}
    path_block = payload.get("path") if isinstance(payload.get("path"), Mapping) else {}
    gate_block = payload.get("gate") if isinstance(payload.get("gate"), Mapping) else {}
    proof_block = payload.get("proof") if isinstance(payload.get("proof"), Mapping) else {}
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), Mapping) else {}

    if not inputs:
        raise SpecIRSPUCompilerError("inputs is required")
    if not path_block:
        raise SpecIRSPUCompilerError("path is required")
    if not gate_block:
        raise SpecIRSPUCompilerError("gate is required")
    if not proof_block:
        raise SpecIRSPUCompilerError("proof is required")

    input_dto = inputs.get("input_dto") if isinstance(inputs.get("input_dto"), Mapping) else {}
    output_dto = inputs.get("output_dto") if isinstance(inputs.get("output_dto"), Mapping) else {}
    if not input_dto:
        raise SpecIRSPUCompilerError("inputs.input_dto is required")
    if not output_dto:
        output_dto = _default_output_dto(path_block)

    norm = _as_text(semantics.get("standard_id")) or _as_text(semantics.get("catalog_id")) or "UNKNOWN_NORM"
    clause = _as_text(semantics.get("clause_id")) or _first_clause_ref(semantics.get("clause_refs")) or "UNKNOWN_CLAUSE"
    name = (
        _as_text(semantics.get("component_name"))
        or _as_text(semantics.get("name"))
        or _as_text(semantics.get("measured_item"))
        or spec_id
    )

    rules, review_flags = _compile_rules(
        gate_block=gate_block,
        path_block=path_block,
        semantics=semantics,
        metadata=metadata,
    )
    review_flags.extend(_scan_global_review_flags(semantics=semantics, metadata=metadata, rules=rules))
    review_flags = _dedupe_list(review_flags)

    proof_out = _compile_proof(proof_block, spec_id=spec_id, version=version, norm=norm, clause=clause)

    spu: Dict[str, Any] = {
        "spuId": spec_id,
        "component_id": spec_id,
        "source_type": "specir",
        "version": version,
        "meta": {
            "name": name,
            "norm": norm,
            "clause": clause,
            "namespace": namespace,
            "spec_type": spec_type,
            "source_file": source_file,
        },
        "data": {
            "inputs": copy.deepcopy(input_dto),
            "outputs": copy.deepcopy(output_dto),
        },
        "path": _compile_path(path_block),
        "rules": rules,
        "proof": proof_out,
        "reviewRequired": len(review_flags) > 0,
        "reviewFlags": review_flags,
    }

    # Keep a gate block for direct runtime execution compatibility.
    spu["gate"] = {
        "rules": [
            {
                "rule_id": str(rule.get("rule_id")),
                "condition": copy.deepcopy(rule.get("condition")),
                "severity": str(rule.get("severity", "blocking")),
                "on_fail": str(rule.get("on_fail", "block")),
                "source": copy.deepcopy(rule.get("source", {})),
            }
            for rule in rules
            if rule.get("type") != "formula"
        ],
        "references": _normalize_string_list(gate_block.get("references")),
        "clause_refs": _normalize_string_list(gate_block.get("clause_refs")),
    }
    return spu


def compile_specir_text_to_spu(text: str, *, source_file: str = "<inline>") -> Dict[str, Any]:
    payload = parse_specir_text(text)
    return compile_specir_payload_to_spu(payload, source_file=source_file)


def compile_specir_file_to_spu(file_path: str | Path) -> Dict[str, Any]:
    path = Path(file_path).resolve()
    if not path.exists() or not path.is_file():
        raise SpecIRSPUCompilerError(f"spec file not found: {path}")
    text = path.read_text(encoding="utf-8-sig")
    return compile_specir_text_to_spu(text, source_file=str(path))


def parse_specir_text(text: str) -> Dict[str, Any]:
    if not isinstance(text, str) or not text.strip():
        raise SpecIRSPUCompilerError("SpecIR text must be non-empty")

    stripped = text.strip()
    parse_errors: list[str] = []

    if stripped.startswith("{") or stripped.startswith("["):
        try:
            parsed_json = json.loads(stripped)
            if isinstance(parsed_json, dict):
                return parsed_json
            raise SpecIRSPUCompilerError("SpecIR JSON must be object")
        except (json.JSONDecodeError, SpecIRSPUCompilerError) as exc:
            parse_errors.append(f"json: {exc}")

    try:
        parsed_yaml = yaml.safe_load(stripped)
    except yaml.YAMLError as exc:
        parse_errors.append(f"yaml: {exc}")
        raise SpecIRSPUCompilerError("; ".join(parse_errors)) from exc

    if not isinstance(parsed_yaml, dict):
        raise SpecIRSPUCompilerError("SpecIR YAML must be object")
    return parsed_yaml


def dump_spu(spu_payload: Mapping[str, Any], *, format: str = "yaml") -> str:
    if not isinstance(spu_payload, Mapping):
        raise SpecIRSPUCompilerError("spu_payload must be object")

    text_format = str(format or "yaml").strip().lower()
    if text_format == "json":
        return json.dumps(spu_payload, ensure_ascii=False, indent=2, sort_keys=True)
    if text_format == "yaml":
        return yaml.safe_dump(dict(spu_payload), allow_unicode=True, sort_keys=False)
    raise SpecIRSPUCompilerError("format must be 'yaml' or 'json'")


def validate_spu(spu_payload: Mapping[str, Any]) -> Dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []

    if not isinstance(spu_payload, Mapping):
        return {"valid": False, "errors": ["spu must be object"], "warnings": warnings}

    required_fields = ("meta", "data", "path", "rules", "proof")
    for key in required_fields:
        if key not in spu_payload:
            errors.append(f"missing field: {key}")

    meta = spu_payload.get("meta")
    if meta is not None and not isinstance(meta, Mapping):
        errors.append("field must be object: meta")

    data = spu_payload.get("data")
    if data is not None and not isinstance(data, Mapping):
        errors.append("field must be object: data")

    path_obj = spu_payload.get("path")
    if path_obj is not None and not isinstance(path_obj, Mapping):
        errors.append("field must be object: path")

    rules = spu_payload.get("rules")
    if rules is None:
        errors.append("missing field: rules")
        rules = []
    elif not isinstance(rules, list):
        errors.append("field must be array: rules")
        rules = []

    proof_obj = spu_payload.get("proof")
    if proof_obj is not None and not isinstance(proof_obj, Mapping):
        errors.append("field must be object: proof")

    if isinstance(data, Mapping):
        inputs_obj = data.get("inputs")
        outputs_obj = data.get("outputs")
        if not isinstance(inputs_obj, Mapping):
            errors.append("data.inputs must be object")
        if not isinstance(outputs_obj, Mapping):
            errors.append("data.outputs must be object")

    if isinstance(path_obj, Mapping):
        _validate_formula_blocks(path_obj, errors=errors)
    else:
        warnings.append("path does not include formula/steps/outputs/expressions")

    if isinstance(rules, list):
        for index, rule in enumerate(rules, start=1):
            if not isinstance(rule, Mapping):
                errors.append(f"rules[{index}] must be object")
                continue
            _validate_rule(rule, index=index, errors=errors, warnings=warnings)

    _validate_gate_executable(spu_payload, rules=rules, errors=errors)
    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}


def validateSPU(spu_payload: Mapping[str, Any]) -> Dict[str, Any]:  # noqa: N802 - keep external contract name
    """Compatibility alias for upstream contract naming."""
    return validate_spu(spu_payload)


def execute_spu(
    spu_payload: Mapping[str, Any],
    input_payload: Mapping[str, Any],
    *,
    runtime_context: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    if not isinstance(input_payload, Mapping):
        raise SpecIRSPUCompilerError("input_payload must be object")

    validation = validate_spu(spu_payload)
    if not validation["valid"]:
        raise SpecIRSPUCompilerError(f"invalid SPU: {validation['errors']}")

    component = _spu_to_component(spu_payload)
    path_result = PathExecutor().execute(component=component, input_dto=dict(input_payload))
    gate_result = GateEngine().evaluate(
        component=component,
        normalized_input=path_result["normalized_input"],
        path_outputs=path_result["path_outputs"],
        runtime_context=dict(runtime_context or {}),
    )

    summary_status = str(gate_result.get("overall_status", "FAIL")).upper()
    rule_results = [
        {
            "rule_id": str(hit.get("rule_id", "")),
            "passed": bool(hit.get("passed", False)),
            "actual_value": hit.get("actual_value"),
            "expected_value": hit.get("expected_value"),
            "message": str(hit.get("message", "")),
            "source": _extract_rule_source(spu_payload, str(hit.get("rule_id", ""))),
        }
        for hit in gate_result.get("rule_hits", [])
        if isinstance(hit, Mapping)
    ]
    final_status = "PASS" if summary_status == "PASS" else "FAIL"

    scope: Dict[str, Any] = {
        "input": path_result["normalized_input"],
        "normalized_input": path_result["normalized_input"],
        "path_outputs": path_result["path_outputs"],
        "gate": {"summary_status": summary_status, "rule_results": rule_results},
        "final_status": final_status,
    }
    proof_obj = spu_payload.get("proof") if isinstance(spu_payload.get("proof"), Mapping) else {}
    proof_fields = proof_obj.get("proof_fields") if isinstance(proof_obj.get("proof_fields"), list) else []
    if not proof_fields:
        proof_fields = ["input", "normalized_input", "path_outputs", "gate", "final_status"]
    proof_payload = {field: _resolve_dotted(scope, field) for field in proof_fields}

    return {
        "path_outputs": path_result["path_outputs"],
        "path_trace": path_result.get("path_trace", []),
        "gate": {
            "summary_status": summary_status,
            "rule_results": rule_results,
            "failed_rule_ids": [item["rule_id"] for item in rule_results if not item["passed"]],
        },
        "final_status": final_status,
        "proof_fields": proof_fields,
        "proof_payload": proof_payload,
    }


def _compile_path(path_block: Mapping[str, Any]) -> Dict[str, Any]:
    steps = path_block.get("steps")
    if not isinstance(steps, list) or not steps:
        raise SpecIRSPUCompilerError("path.steps must be non-empty array")

    formulas = path_block.get("formulas")
    if not isinstance(formulas, Mapping):
        formulas = {}

    lookup_tables = path_block.get("lookup_tables")
    if not isinstance(lookup_tables, Mapping):
        lookup_tables = {}

    derived_fields = path_block.get("derived_fields")
    if not isinstance(derived_fields, list):
        derived_fields = []

    return {
        "steps": copy.deepcopy(steps),
        "formulas": copy.deepcopy(dict(formulas)),
        "lookup_tables": copy.deepcopy(dict(lookup_tables)),
        "derived_fields": copy.deepcopy(derived_fields),
    }


def _compile_rules(
    *,
    gate_block: Mapping[str, Any],
    path_block: Mapping[str, Any],
    semantics: Mapping[str, Any],
    metadata: Mapping[str, Any],
) -> tuple[list[Dict[str, Any]], list[str]]:
    rules: list[Dict[str, Any]] = []
    review_flags: list[str] = []
    raw_rules = gate_block.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise SpecIRSPUCompilerError("gate.rules must be non-empty array")

    for index, raw_rule in enumerate(raw_rules, start=1):
        if not isinstance(raw_rule, Mapping):
            raise SpecIRSPUCompilerError(f"gate.rules[{index}] must be object")

        condition = _normalize_condition(raw_rule.get("condition"))
        rule_type = _classify_rule_type(condition)
        compiled_rule = {
            "rule_id": _as_text(raw_rule.get("rule_id")) or f"rule_{index}",
            "type": rule_type,
            "condition": copy.deepcopy(condition),
            "severity": _normalize_severity(raw_rule.get("severity")),
            "on_fail": _normalize_on_fail(raw_rule.get("on_fail")),
            "source": _build_rule_source(
                raw_rule=raw_rule,
                condition=condition,
                semantics=semantics,
            ),
        }
        compiled_rule.update(_extract_typed_rule_fields(condition=condition, rule_type=rule_type))
        rules.append(compiled_rule)
        review_flags.extend(_scan_rule_review_flags(compiled_rule))

    path_steps = path_block.get("steps")
    path_formulas = path_block.get("formulas")
    if isinstance(path_steps, list) and isinstance(path_formulas, Mapping):
        for raw_step in path_steps:
            if not isinstance(raw_step, Mapping):
                continue
            if str(raw_step.get("action", "")).strip().lower() != "formula":
                continue
            output_field = _as_text(raw_step.get("output_field") or raw_step.get("output"))
            formula_expr = _resolve_formula_expression(step=raw_step, formulas=path_formulas)
            if not output_field or not formula_expr:
                continue
            formula_text = f"{output_field} = {formula_expr}"
            formula_rule = {
                "rule_id": f"path_formula_{_as_text(raw_step.get('step_id')) or output_field}",
                "type": "formula",
                "output": output_field,
                "formula": formula_text,
                "condition": formula_expr,
                "source": _build_formula_source(
                    formula_text=formula_text,
                    semantics=semantics,
                    metadata=metadata,
                ),
            }
            rules.append(formula_rule)
            review_flags.extend(_scan_rule_review_flags(formula_rule))

    return rules, review_flags


def _extract_typed_rule_fields(*, condition: Any, rule_type: str) -> Dict[str, Any]:
    if rule_type == "range":
        if isinstance(condition, Mapping):
            minimum = condition.get("min", condition.get("lower"))
            maximum = condition.get("max", condition.get("upper"))
            return {
                "actual": condition.get("actual"),
                "min": minimum,
                "max": maximum,
                "include_min": bool(condition.get("include_min", True)),
                "include_max": bool(condition.get("include_max", True)),
            }
        if isinstance(condition, str):
            parsed = _parse_range_expression(condition)
            if parsed:
                return parsed
    if rule_type == "compare":
        if isinstance(condition, Mapping):
            return {
                "actual": condition.get("actual"),
                "operator": condition.get("operator"),
                "expected": condition.get("expected"),
            }
        if isinstance(condition, str):
            parsed = _parse_compare_expression(condition)
            if parsed:
                return parsed
    if rule_type == "relation":
        parsed = _extract_relation_fields(condition)
        if parsed:
            return parsed
    return {}


def _compile_proof(
    proof_block: Mapping[str, Any],
    *,
    spec_id: str,
    version: str,
    norm: str,
    clause: str,
) -> Dict[str, Any]:
    proof_fields = proof_block.get("proof_fields")
    if not isinstance(proof_fields, list) or not proof_fields:
        proof_fields = [
            "execution_id",
            "component_id",
            "version",
            "project_id",
            "input",
            "normalized_input",
            "path_outputs",
            "gate",
            "final_status",
        ]
    canonicalization = proof_block.get("canonicalization")
    if not isinstance(canonicalization, Mapping):
        canonicalization = {"field_order": copy.deepcopy(proof_fields), "sort_keys": True, "null_policy": "keep"}

    hash_algorithm = _as_text(proof_block.get("hash_algorithm") or proof_block.get("hash_method")).lower() or "sha256"
    signature = proof_block.get("signature") if isinstance(proof_block.get("signature"), Mapping) else {}
    chain = proof_block.get("chain") if isinstance(proof_block.get("chain"), Mapping) else {"enabled": True}
    if "enabled" not in chain:
        chain = dict(chain)
        chain["enabled"] = True

    return {
        "proof_fields": copy.deepcopy(proof_fields),
        "canonicalization": copy.deepcopy(dict(canonicalization)),
        "hash_algorithm": hash_algorithm,
        "signature": copy.deepcopy(dict(signature)),
        "chain": copy.deepcopy(dict(chain)),
        "spec_anchor": {"spec_id": spec_id, "version": version, "norm": norm, "clause": clause},
    }


def _default_output_dto(path_block: Mapping[str, Any]) -> Dict[str, Any]:
    output: Dict[str, Any] = {
        "final_status": {"type": "enum", "enum_values": ["PASS", "FAIL", "BLOCKED", "CRITICAL", "WARNING"]},
        "proof_hash": {"type": "string"},
    }
    derived = path_block.get("derived_fields")
    if isinstance(derived, list):
        for field in derived:
            if isinstance(field, str) and field and field not in output:
                output[field] = {"type": "number"}
    return output


def _build_rule_source(
    *,
    raw_rule: Mapping[str, Any],
    condition: Any,
    semantics: Mapping[str, Any],
) -> Dict[str, str]:
    raw_source = raw_rule.get("source") if isinstance(raw_rule.get("source"), Mapping) else {}
    norm = _as_text(raw_source.get("norm")) or _as_text(semantics.get("standard_id")) or _as_text(semantics.get("catalog_id"))
    clause = (
        _as_text(raw_source.get("clause"))
        or _as_text(raw_rule.get("clause_ref"))
        or _first_clause_ref(raw_rule.get("clause_refs"))
        or _as_text(semantics.get("clause_id"))
        or _first_clause_ref(semantics.get("clause_refs"))
    )
    source_text = (
        _as_text(raw_source.get("source_text"))
        or _as_text(raw_rule.get("source_text"))
        or (condition if isinstance(condition, str) else json.dumps(condition, ensure_ascii=False, sort_keys=True))
    )
    return {"norm": norm, "clause": clause, "source_text": source_text}


def _build_formula_source(
    *,
    formula_text: str,
    semantics: Mapping[str, Any],
    metadata: Mapping[str, Any],
) -> Dict[str, str]:
    norm = _as_text(semantics.get("standard_id")) or _as_text(semantics.get("catalog_id"))
    clause = _as_text(semantics.get("clause_id")) or _first_clause_ref(semantics.get("clause_refs"))
    if not clause:
        related_specs = metadata.get("related_specs")
        clause = _first_clause_ref(related_specs)
    return {"norm": norm, "clause": clause, "source_text": formula_text}


def _scan_rule_review_flags(rule: Mapping[str, Any]) -> list[str]:
    flags: list[str] = []
    source = rule.get("source") if isinstance(rule.get("source"), Mapping) else {}
    source_text = _as_text(source.get("source_text"))

    if not _as_text(source.get("norm")) or not _as_text(source.get("clause")):
        flags.append("MISSING_CLAUSE_SOURCE")
    if _UNIT_CONVERSION_PATTERN.search(source_text):
        flags.append("UNIT_CONVERSION")
    if _NON_MANDATORY_TONE_PATTERN.search(source_text):
        flags.append("NON_MANDATORY_TONE")
    return flags


def _scan_global_review_flags(
    *,
    semantics: Mapping[str, Any],
    metadata: Mapping[str, Any],
    rules: list[Dict[str, Any]],
) -> list[str]:
    flags: list[str] = []
    confidence = _coerce_float(
        metadata.get("confidence"),
        semantics.get("confidence"),
        metadata.get("extraction_confidence"),
    )
    if confidence is not None and confidence < 0.9:
        flags.append("LOW_CONFIDENCE")

    for field_map in (
        metadata.get("unit_conversion"),
        semantics.get("unit_conversion"),
    ):
        if isinstance(field_map, Mapping) and field_map:
            flags.append("UNIT_CONVERSION")
            break

    if any(not _as_text((rule.get("source") or {}).get("clause")) for rule in rules):
        flags.append("MISSING_CLAUSE_SOURCE")
    return flags


def _normalize_condition(raw_condition: Any) -> Any:
    if isinstance(raw_condition, str):
        text = raw_condition.strip()
        if not text:
            raise SpecIRSPUCompilerError("gate rule condition cannot be empty")
        return text
    if not isinstance(raw_condition, Mapping):
        raise SpecIRSPUCompilerError("gate rule condition must be string or object")

    condition = copy.deepcopy(dict(raw_condition))
    op_raw = _as_text(condition.get("operator")).lower()
    op_map = {
        "gte": ">=",
        "lte": "<=",
        "gt": ">",
        "lt": "<",
        "eq": "==",
        ">=": ">=",
        "<=": "<=",
        ">": ">",
        "<": "<",
        "==": "==",
        "between": "between",
        "range": "between",
        "tolerance": "tolerance",
    }
    operator = op_map.get(op_raw)
    if operator is None:
        raise SpecIRSPUCompilerError(f"unsupported gate condition operator: {op_raw}")
    condition["operator"] = operator

    if operator == "between":
        if "min" in condition and "max" in condition:
            return condition
        expected = condition.get("expected")
        if isinstance(expected, list) and len(expected) == 2:
            condition["min"] = expected[0]
            condition["max"] = expected[1]
            condition.pop("expected", None)
            return condition
        raise SpecIRSPUCompilerError("between/range condition requires min/max or expected range")
    return condition


def _classify_rule_type(condition: Any) -> str:
    if isinstance(condition, Mapping):
        operator = _as_text(condition.get("operator")).lower()
        if operator == "between":
            return "range"
        if operator in {">=", "<=", ">", "<", "==", "tolerance"}:
            if _extract_relation_fields(condition):
                return "relation"
            return "compare"
        return "compare"

    if not isinstance(condition, str):
        return "compare"

    if _parse_range_expression(condition):
        return "range"
    if _extract_relation_fields(condition):
        return "relation"
    return "compare"


def _extract_relation_fields(condition: Any) -> Dict[str, Any] | None:
    if isinstance(condition, Mapping):
        operator = _as_text(condition.get("operator"))
        if operator not in {">=", "<=", ">", "<", "=="}:
            return None
        actual = condition.get("actual")
        expected = condition.get("expected")
        if isinstance(expected, str):
            relation = _parse_relation_rhs(expected)
            if relation:
                return {
                    "left": actual,
                    "operator": operator,
                    "right": relation["right"],
                    "constant": relation["constant"],
                }
        return None

    if isinstance(condition, str):
        match = _RELATION_EXPR_PATTERN.match(condition)
        if not match:
            return None
        constant = float(match.group("constant"))
        if match.group("sign") == "-":
            constant *= -1
        return {
            "left": match.group("left"),
            "operator": match.group("operator"),
            "right": match.group("right"),
            "constant": constant,
        }
    return None


def _parse_relation_rhs(text: str) -> Dict[str, Any] | None:
    match = re.match(
        r"^\s*(?P<right>[A-Za-z_][A-Za-z0-9_\.]*)\s*(?P<sign>[+-])\s*(?P<constant>\d+(?:\.\d+)?)\s*$",
        text,
    )
    if not match:
        return None
    constant = float(match.group("constant"))
    if match.group("sign") == "-":
        constant *= -1
    return {"right": match.group("right"), "constant": constant}


def _parse_range_expression(text: str) -> Dict[str, Any] | None:
    match = _RANGE_EXPR_PATTERN.match(text)
    if not match:
        return None
    return {
        "min": match.group("min").strip(),
        "actual": match.group("actual").strip(),
        "max": match.group("max").strip(),
        "include_min": match.group("min_op") == "<=",
        "include_max": match.group("max_op") == "<=",
    }


def _parse_compare_expression(text: str) -> Dict[str, Any] | None:
    match = _COMPARE_EXPR_PATTERN.match(text)
    if not match:
        return None
    return {
        "left": match.group("left").strip(),
        "operator": match.group("operator").strip(),
        "right": match.group("right").strip(),
    }


def _validate_formula_blocks(path_obj: Mapping[str, Any], *, errors: list[str]) -> None:
    formulas = path_obj.get("formulas")
    if isinstance(formulas, Mapping):
        for key, expr in formulas.items():
            if not isinstance(expr, str) or not expr.strip():
                errors.append(f"path.formulas.{key} must be non-empty string")
                continue
            _validate_expression(expr, label=f"path.formulas.{key}", errors=errors)

    steps = path_obj.get("steps")
    if isinstance(steps, list):
        for index, step in enumerate(steps, start=1):
            if not isinstance(step, Mapping):
                errors.append(f"path.steps[{index}] must be object")
                continue
            action = _as_text(step.get("action")).lower()
            if action != "formula":
                continue
            expr = _as_text(step.get("formula"))
            if expr:
                _validate_expression(expr, label=f"path.steps[{index}].formula", errors=errors)


def _validate_rule(
    rule: Mapping[str, Any],
    *,
    index: int,
    errors: list[str],
    warnings: list[str],
) -> None:
    rule_id = _as_text(rule.get("rule_id")) or f"rule_{index}"
    rule_type = _as_text(rule.get("type")).lower()
    if not rule_type:
        warnings.append(f"rules[{index}] type is missing; defaulting to compare")
    elif rule_type not in _ALLOWED_RULE_TYPES:
        errors.append(f"rules[{index}] unsupported type: {rule_type}")

    source = rule.get("source")
    if not isinstance(source, Mapping):
        errors.append(f"rules[{index}].source must be object")
    else:
        for key in ("norm", "clause", "source_text"):
            if not _as_text(source.get(key)):
                warnings.append(f"rules[{index}].source.{key} is missing")

    if rule_type == "formula":
        formula_text = _as_text(rule.get("formula"))
        if not formula_text:
            errors.append(f"rules[{index}] formula rule missing formula")
            return
        if "=" not in formula_text:
            errors.append(f"rules[{index}] formula must include '='")
            return
        _, right_expr = formula_text.split("=", 1)
        _validate_expression(right_expr, label=f"rules[{index}].formula", errors=errors)
        return

    condition = rule.get("condition")
    if isinstance(condition, str):
        _validate_expression(condition, label=f"rules[{index}].condition", errors=errors)
    elif isinstance(condition, Mapping):
        try:
            _normalize_condition(condition)
        except SpecIRSPUCompilerError as exc:
            errors.append(f"rules[{index}].condition invalid: {exc}")
    else:
        errors.append(f"rules[{index}] condition must be string or object")

    if not _as_text(rule.get("rule_id")):
        warnings.append(f"rules[{index}] rule_id is empty; using {rule_id}")


def _validate_gate_executable(
    spu_payload: Mapping[str, Any],
    *,
    rules: list[Any],
    errors: list[str],
) -> None:
    gate_rules: list[Dict[str, Any]] = []
    identifiers: set[str] = set()
    for raw_rule in rules:
        if not isinstance(raw_rule, Mapping):
            continue
        if _as_text(raw_rule.get("type")).lower() == "formula":
            continue
        condition = raw_rule.get("condition")
        if not isinstance(condition, (str, Mapping)):
            continue
        gate_rule = {
            "rule_id": _as_text(raw_rule.get("rule_id")) or "rule",
            "condition": copy.deepcopy(condition),
            "severity": _as_text(raw_rule.get("severity")) or "blocking",
            "on_fail": _as_text(raw_rule.get("on_fail")) or "block",
        }
        gate_rules.append(gate_rule)
        identifiers.update(_collect_condition_identifiers(condition))

    if not gate_rules:
        errors.append("gate.rules must be list when provided")
        return

    seed_context: Dict[str, Any] = {}
    for name in identifiers:
        last = name.split(".")[-1].lower()
        if last.endswith("requested") or last.startswith("is_") or last.startswith("has_"):
            seed_context[name] = False
        else:
            seed_context[name] = 1.0

    data = spu_payload.get("data") if isinstance(spu_payload.get("data"), Mapping) else {}
    if isinstance(data, Mapping):
        for schema_name in ("inputs", "outputs"):
            schema_obj = data.get(schema_name)
            if not isinstance(schema_obj, Mapping):
                continue
            for field in schema_obj.keys():
                field_name = _as_text(field)
                if field_name and field_name not in seed_context:
                    seed_context[field_name] = 1.0

    component = {
        "component_id": _as_text(spu_payload.get("component_id") or spu_payload.get("spuId")) or "spu",
        "gate": {"rules": gate_rules},
    }
    try:
        GateEngine().evaluate(
            component=component,
            normalized_input=copy.deepcopy(seed_context),
            path_outputs=copy.deepcopy(seed_context),
            runtime_context={},
        )
    except GateExecutionError as exc:
        errors.append(f"gate execution check failed: {exc}")
    except (PathExecutionError, ValueError) as exc:
        errors.append(f"gate execution check failed: {exc}")


def _validate_expression(text: str, *, label: str, errors: list[str]) -> None:
    expression = _as_text(text)
    if not expression:
        errors.append(f"{label} must be non-empty string")
        return
    if not _is_balanced(expression):
        errors.append(f"{label} has unclosed bracket/parenthesis")
        return
    candidate = normalize_expression(expression)
    try:
        ast.parse(candidate, mode="eval")
    except SyntaxError as exc:
        errors.append(f"{label} syntax invalid: {exc.msg}")


def _is_balanced(text: str) -> bool:
    stack: list[str] = []
    pairs = {")": "(", "]": "[", "}": "{"}
    opens = set(pairs.values())
    for char in text:
        if char in opens:
            stack.append(char)
            continue
        if char in pairs:
            if not stack or stack[-1] != pairs[char]:
                return False
            stack.pop()
    return len(stack) == 0


def _spu_to_component(spu_payload: Mapping[str, Any]) -> Dict[str, Any]:
    data = spu_payload.get("data") if isinstance(spu_payload.get("data"), Mapping) else {}
    input_dto = data.get("inputs") if isinstance(data.get("inputs"), Mapping) else {}
    output_dto = data.get("outputs") if isinstance(data.get("outputs"), Mapping) else {}
    rules = spu_payload.get("rules") if isinstance(spu_payload.get("rules"), list) else []
    gate_rules = []
    for rule in rules:
        if not isinstance(rule, Mapping):
            continue
        if _as_text(rule.get("type")).lower() == "formula":
            continue
        gate_rules.append(
            {
                "rule_id": _as_text(rule.get("rule_id")) or "rule",
                "condition": copy.deepcopy(rule.get("condition")),
                "severity": _as_text(rule.get("severity")) or "blocking",
                "on_fail": _as_text(rule.get("on_fail")) or "block",
            }
        )

    return {
        "component_id": _as_text(spu_payload.get("component_id") or spu_payload.get("spuId")) or "spu",
        "version": _as_text(spu_payload.get("version")) or "v1",
        "source_type": "specir",
        "input_dto": copy.deepcopy(dict(input_dto)),
        "output_dto": copy.deepcopy(dict(output_dto)),
        "path": copy.deepcopy(dict(spu_payload.get("path") if isinstance(spu_payload.get("path"), Mapping) else {})),
        "gate": {"rules": gate_rules},
        "proof": copy.deepcopy(dict(spu_payload.get("proof") if isinstance(spu_payload.get("proof"), Mapping) else {})),
    }


def _collect_condition_identifiers(condition: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(condition, Mapping):
        for key in ("actual", "expected", "min", "max", "lower", "upper", "tolerance"):
            operand = condition.get(key)
            names.update(_extract_operand_identifiers(operand))
        return names
    if isinstance(condition, str):
        normalized = normalize_expression(condition)
        try:
            tree = ast.parse(normalized, mode="eval")
        except SyntaxError:
            return names
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id not in _EXPR_FUNCTIONS:
                names.add(node.id)
            if isinstance(node, ast.Attribute):
                dotted = _attribute_to_dotted(node)
                if dotted:
                    names.add(dotted)
    return names


def _extract_operand_identifiers(operand: Any) -> set[str]:
    names: set[str] = set()
    if isinstance(operand, Mapping):
        if "ref" in operand:
            names.update(_extract_operand_identifiers(operand.get("ref")))
        if "value" in operand:
            names.update(_extract_operand_identifiers(operand.get("value")))
        return names
    if isinstance(operand, str):
        text = operand.strip()
        if not text:
            return names
        if re.fullmatch(r"\d+(?:\.\d+)?", text):
            return names
        for token in _IDENTIFIER_PATTERN.findall(text):
            lower = token.lower()
            if lower in {"true", "false", "and", "or", "not"}:
                continue
            if token in _EXPR_FUNCTIONS:
                continue
            names.add(token)
    return names


def _resolve_formula_expression(step: Mapping[str, Any], formulas: Mapping[str, Any]) -> str:
    if isinstance(step.get("formula"), str) and step.get("formula").strip():
        return str(step.get("formula")).strip()
    formula_ref = _as_text(step.get("formula_ref"))
    if formula_ref and isinstance(formulas.get(formula_ref), str):
        return _as_text(formulas.get(formula_ref))
    return ""


def _extract_rule_source(spu_payload: Mapping[str, Any], rule_id: str) -> Dict[str, Any]:
    rules = spu_payload.get("rules")
    if not isinstance(rules, list):
        return {}
    for rule in rules:
        if not isinstance(rule, Mapping):
            continue
        if _as_text(rule.get("rule_id")) == rule_id:
            source = rule.get("source")
            if isinstance(source, Mapping):
                return dict(source)
            return {}
    return {}


def _resolve_dotted(scope: Mapping[str, Any], dotted: str) -> Any:
    if dotted in scope:
        return scope[dotted]
    current: Any = scope
    for chunk in dotted.split("."):
        if isinstance(current, Mapping) and chunk in current:
            current = current[chunk]
        else:
            return None
    return current


def _attribute_to_dotted(node: ast.Attribute) -> str | None:
    chunks: list[str] = []
    current: ast.AST = node
    while isinstance(current, ast.Attribute):
        chunks.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        chunks.append(current.id)
        return ".".join(reversed(chunks))
    return None


def _normalize_severity(value: Any) -> str:
    text = _as_text(value).lower()
    mapping = {
        "mandatory": "blocking",
        "block": "blocking",
        "error": "blocking",
        "critical": "critical",
        "warning": "warning",
        "warn": "warning",
        "info": "info",
    }
    return mapping.get(text, "blocking")


def _normalize_on_fail(value: Any) -> str:
    text = _as_text(value).lower()
    mapping = {
        "block_submit": "block",
        "blocked": "block",
        "block": "block",
        "critical": "critical",
        "warn": "warn",
        "warning": "warn",
        "manual_override": "manual_override",
        "pass": "pass",
    }
    return mapping.get(text, "block")


def _required_text(value: Any, field_name: str) -> str:
    text = _as_text(value)
    if not text:
        raise SpecIRSPUCompilerError(f"{field_name} is required")
    return text


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _first_clause_ref(value: Any) -> str:
    if isinstance(value, list):
        for item in value:
            text = _as_text(item)
            if text:
                return text
    return ""


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [text for text in (_as_text(item) for item in value) if text]


def _coerce_float(*values: Any) -> float | None:
    for value in values:
        if value is None:
            continue
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return float(value)
        text = _as_text(value)
        if not text:
            continue
        try:
            return float(text)
        except ValueError:
            continue
    return None


def _dedupe_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in values:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def _rebuild_raw(spec_document: SpecIRDocument) -> Dict[str, Any]:
    return {
        "spec_id": spec_document.spec_id,
        "type": spec_document.spec_type,
        "version": spec_document.version,
        "namespace": spec_document.namespace,
        "semantics": copy.deepcopy(spec_document.semantics),
        "logic": copy.deepcopy(spec_document.logic),
        "inputs": copy.deepcopy(spec_document.inputs),
        "path": copy.deepcopy(spec_document.path),
        "gate": copy.deepcopy(spec_document.gate),
        "state": copy.deepcopy(spec_document.state),
        "proof": copy.deepcopy(spec_document.proof),
        "metadata": copy.deepcopy(spec_document.metadata),
    }
