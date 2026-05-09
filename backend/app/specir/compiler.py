from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Dict

from ..core import ComponentRegistry
from .loader import build_registry_from_index
from .models import SpecIRDocument


class SpecIRCompilerError(ValueError):
    """Raised when SpecIR compilation fails."""


_compiled_components: Dict[str, Dict[str, Any]] = {}


def compile_spec_to_component(spec_document: SpecIRDocument) -> Dict[str, Any]:
    if not isinstance(spec_document, SpecIRDocument):
        raise SpecIRCompilerError("spec_document must be SpecIRDocument")

    semantics = spec_document.semantics if isinstance(spec_document.semantics, dict) else {}
    logic = spec_document.logic if isinstance(spec_document.logic, dict) else {}
    inputs = spec_document.inputs if isinstance(spec_document.inputs, dict) else {}
    path_block = spec_document.path if isinstance(spec_document.path, dict) else {}
    gate_block = spec_document.gate if isinstance(spec_document.gate, dict) else {}
    state_block = spec_document.state if isinstance(spec_document.state, dict) else {}
    proof = spec_document.proof if isinstance(spec_document.proof, dict) else {}
    metadata = spec_document.metadata if isinstance(spec_document.metadata, dict) else {}

    component_id = _non_empty_text(spec_document.spec_id, "component_id")
    component_name = _non_empty_text(
        semantics.get("component_name") or semantics.get("name") or semantics.get("measured_item") or component_id,
        "component_name",
    )
    catalog_id = _non_empty_text(
        semantics.get("catalog_id") or semantics.get("standard_id"),
        "catalog_id",
    )
    standard_id = _non_empty_text(
        semantics.get("standard_id"),
        "standard_id",
    )
    standard_version = _non_empty_text(
        semantics.get("standard_version"),
        "standard_version",
    )
    version = _non_empty_text(spec_document.version, "version")

    input_dto = _compile_input_dto(inputs=inputs)
    path = _compile_path(path=path_block)
    gate = _compile_gate(gate=gate_block, semantics=semantics)
    state = _compile_state(state=state_block)
    proof_block = _compile_proof(proof=proof)

    output_dto = inputs.get("output_dto")
    if not isinstance(output_dto, dict) or not output_dto:
        output_dto = _default_output_dto(path=path)

    raw_data_dto = inputs.get("raw_data_dto")
    if not isinstance(raw_data_dto, dict):
        raw_data_dto = {}

    resolved_value_dto = inputs.get("resolved_value_dto")
    if not isinstance(resolved_value_dto, dict):
        resolved_value_dto = {}

    compile_hash = _build_compile_hash(spec_document)
    spec_anchor = {
        "spec_id": spec_document.spec_id,
        "hash": compile_hash,
        "version": spec_document.version,
    }
    metadata_out = {
        "source": "specir_compiler",
        "specir_spec_id": spec_document.spec_id,
        "specir_source_file": spec_document.source_file,
        "specir_spec_version": spec_document.version,
        "specir_type": spec_document.spec_type,
        "specir_namespace": spec_document.namespace,
        "compile_hash": compile_hash,
        "spec_anchor": copy.deepcopy(spec_anchor),
        "semantics": copy.deepcopy(semantics),
        "logic": copy.deepcopy(logic),
        "metadata": copy.deepcopy(metadata),
        "warnings": list(spec_document.warnings),
    }

    component: Dict[str, Any] = {
        "component_id": component_id,
        "source_type": "specir",
        "catalog_id": catalog_id,
        "standard_id": standard_id,
        "standard_version": standard_version,
        "component_name": component_name,
        "version": version,
        "status": _normalize_component_status(semantics.get("status")),
        "metadata": metadata_out,
        "input_dto": _normalize_field_definitions(input_dto),
        "raw_data_dto": _normalize_field_definitions(raw_data_dto),
        "resolved_value_dto": _normalize_field_definitions(resolved_value_dto),
        "output_dto": _normalize_field_definitions(output_dto),
        "path": path,
        "gate": gate,
        "state": state,
        "proof": proof_block,
        "patches": [],
        "overrides": [],
    }

    _compiled_components[spec_document.spec_id] = copy.deepcopy(component)
    return component


def compile_all_specs_to_registry(
    index_json_path: str | Path | None = None,
    registry: ComponentRegistry | None = None,
) -> Dict[str, Dict[str, Any]]:
    index_path = Path(index_json_path).resolve() if index_json_path else _default_index_path()
    spec_registry = build_registry_from_index(index_path)
    compiled: Dict[str, Dict[str, Any]] = {}
    for spec_id, entry in spec_registry.items():
        if entry.document is None:
            continue
        component = compile_spec_to_component(entry.document)
        compiled[spec_id] = component
        if registry is not None:
            registry.register_runtime_component(component, source_label=f"specir:{spec_id}")
    return compiled


def get_compiled_component(spec_id: str) -> Dict[str, Any] | None:
    key = str(spec_id or "").strip()
    if not key:
        return None
    payload = _compiled_components.get(key)
    if payload is None:
        return None
    return copy.deepcopy(payload)


def clear_compiled_components() -> None:
    _compiled_components.clear()


def _build_compile_hash(spec_document: SpecIRDocument) -> str:
    if not isinstance(spec_document.raw, dict) or not spec_document.raw:
        raise SpecIRCompilerError("spec_document.raw is required for compile hash generation")
    body = json.dumps(spec_document.raw, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def _default_index_path() -> Path:
    return Path(__file__).resolve().parents[3] / "norms" / "index.json"


def _compile_input_dto(*, inputs: Dict[str, Any]) -> Dict[str, Any]:
    input_dto = inputs.get("input_dto")
    if isinstance(input_dto, dict) and input_dto:
        return copy.deepcopy(input_dto)

    raise SpecIRCompilerError("inputs.input_dto is required for compilation")


def _compile_path(*, path: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(path, dict):
        raise SpecIRCompilerError("path must be object")
    steps = path.get("steps")
    if not isinstance(steps, list) or not steps:
        raise SpecIRCompilerError("path.steps must be non-empty array")
    formulas = path.get("formulas")
    if not isinstance(formulas, dict):
        formulas = {}
    lookup_tables = path.get("lookup_tables")
    if not isinstance(lookup_tables, dict):
        lookup_tables = {}
    derived_fields = path.get("derived_fields")
    if not isinstance(derived_fields, list):
        derived_fields = []
    return {
        "steps": copy.deepcopy(steps),
        "formulas": copy.deepcopy(formulas),
        "lookup_tables": copy.deepcopy(lookup_tables),
        "derived_fields": copy.deepcopy(derived_fields),
    }


def _compile_gate(*, gate: Dict[str, Any], semantics: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(gate, dict):
        raise SpecIRCompilerError("gate must be object")

    raw_rules = gate.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise SpecIRCompilerError("gate.rules must be non-empty array")

    normalized_rules: list[Dict[str, Any]] = []
    for index, raw_rule in enumerate(raw_rules, start=1):
        if not isinstance(raw_rule, dict):
            raise SpecIRCompilerError(f"gate.rules[{index}] must be object")
        item = {
            "rule_id": str(raw_rule.get("rule_id") or f"rule_{index}"),
            "condition": _normalize_condition(raw_rule.get("condition")),
            "severity": _normalize_severity(raw_rule.get("severity")),
            "on_fail": _normalize_on_fail(raw_rule.get("on_fail")),
        }
        clause_refs = raw_rule.get("clause_refs")
        if isinstance(clause_refs, list):
            item["clause_refs"] = [str(value) for value in clause_refs if isinstance(value, str) and value.strip()]
        normalized_rules.append(item)

    references = gate.get("references")
    if not isinstance(references, list):
        references = []
    if not references:
        clause_refs = semantics.get("clause_refs")
        if isinstance(clause_refs, list):
            references = [str(item) for item in clause_refs if isinstance(item, str) and item.strip()]

    clause_refs_block = gate.get("clause_refs")
    if not isinstance(clause_refs_block, list):
        clause_refs_block = []

    return {
        "rules": normalized_rules,
        "references": copy.deepcopy(references),
        "clause_refs": copy.deepcopy(clause_refs_block),
    }


def _normalize_condition(raw_condition: Any) -> Any:
    if isinstance(raw_condition, str):
        text = raw_condition.strip()
        if not text:
            raise SpecIRCompilerError("gate rule condition cannot be empty")
        return text
    if not isinstance(raw_condition, dict):
        raise SpecIRCompilerError("gate rule condition must be string or object")

    condition = copy.deepcopy(raw_condition)
    op_raw = str(condition.get("operator", "")).strip().lower()
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
        raise SpecIRCompilerError(f"unsupported gate condition operator: {op_raw}")

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
        raise SpecIRCompilerError("between/range condition requires min/max or expected range")
    return condition


def _compile_state(*, state: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(state, dict):
        raise SpecIRCompilerError("state must be object")
    required = ("initial_state", "states", "allowed_transitions", "terminal_states")
    for key in required:
        if key not in state:
            raise SpecIRCompilerError(f"state.{key} is required")

    item = copy.deepcopy(state)
    transitions = item.get("allowed_transitions")
    if isinstance(transitions, list) and "transitions" not in item:
        item["transitions"] = copy.deepcopy(transitions)
    return item


def _compile_proof(*, proof: Dict[str, Any]) -> Dict[str, Any]:
    item = copy.deepcopy(proof)
    proof_fields = item.get("proof_fields")
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
            "state_trace",
            "final_status",
            "clause_refs",
        ]
    canonicalization = item.get("canonicalization")
    if not isinstance(canonicalization, dict):
        canonicalization = {
            "field_order": copy.deepcopy(proof_fields),
            "sort_keys": True,
            "null_policy": "keep",
        }
    hash_algorithm = str(item.get("hash_algorithm") or item.get("hash_method") or "sha256").strip().lower()
    if hash_algorithm not in {"sha256", "sha3_256", "blake3"}:
        hash_algorithm = "sha256"

    signature = item.get("signature")
    if not isinstance(signature, dict):
        signature = {"algorithm": "hmac_sha256", "key_env": "LAYERPEG_PROOF_HMAC_KEY"}
    if str(signature.get("algorithm", "")).strip() != "hmac_sha256":
        signature["algorithm"] = "hmac_sha256"
    if not isinstance(signature.get("key_env"), str) or not str(signature.get("key_env")).strip():
        signature["key_env"] = "LAYERPEG_PROOF_HMAC_KEY"

    chain = item.get("chain")
    if not isinstance(chain, dict):
        chain = {"enabled": True}
    if "enabled" not in chain:
        chain["enabled"] = True

    item["proof_fields"] = copy.deepcopy(proof_fields)
    item["canonicalization"] = canonicalization
    item["hash_algorithm"] = hash_algorithm
    item["signature"] = signature
    item["chain"] = chain
    return item


def _default_output_dto(*, path: Dict[str, Any]) -> Dict[str, Any]:
    output: Dict[str, Any] = {
        "final_status": {"type": "enum", "enum_values": ["PASS", "FAIL", "BLOCKED", "CRITICAL", "WARNING"]},
        "lifecycle_status": {"type": "string"},
        "clause_refs": {"type": "array", "items": {"type": "string"}},
        "proof_hash": {"type": "string"},
    }
    derived = path.get("derived_fields")
    if isinstance(derived, list):
        for field in derived:
            if isinstance(field, str) and field and field not in output:
                output[field] = {"type": "number"}
    return output


def _normalize_field_definitions(schema: Dict[str, Any]) -> Dict[str, Any]:
    return copy.deepcopy(schema)


def _normalize_component_status(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in {"active", "draft", "deprecated", "archived"}:
        return text
    if text in {"enabled", "published"}:
        return "active"
    return "draft"


def _normalize_severity(value: Any) -> str:
    text = str(value or "").strip().lower()
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
    text = str(value or "").strip().lower()
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


def _non_empty_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise SpecIRCompilerError(f"{field_name} is required")
    return text

