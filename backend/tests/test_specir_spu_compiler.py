from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Dict

import yaml

from backend.app.specir import load_spec
from backend.app.specir.spu_compiler import (
    compile_spec_to_spu,
    compile_specir_payload_to_spu,
    compile_specir_text_to_spu,
    execute_spu,
    validate_spu,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _compaction_input(*, compaction: float, representative: float) -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": "P-SPU-COMPILER-001",
        "compaction_degree": compaction,
        "representative_value": representative,
        "actor_did": "did:test:spu-compiler",
        "inspected_at": "2026-04-24T10:00:00Z",
        "override_requested": False,
    }


def _four_rule_specir_payload() -> Dict[str, Any]:
    return {
        "spec_id": "TEST.SPU.RULES.001",
        "type": "executable_spec",
        "version": "v1.0.0",
        "namespace": "tests.rules",
        "semantics": {
            "standard_id": "TEST_STD",
            "clause_id": "1.0.0",
            "component_name": "rule_types_demo",
        },
        "logic": {"language": "specir/v1"},
        "inputs": {
            "input_dto": {
                "density": {"type": "number", "required": True},
                "embed_depth": {"type": "number", "required": True},
                "pile_diameter": {"type": "number", "required": True},
            },
            "output_dto": {
                "density": {"type": "number"},
                "embed_depth": {"type": "number"},
            },
        },
        "path": {
            "steps": [
                {"step_id": "calc_density_adjusted", "action": "formula", "formula_ref": "density_adjusted", "output_field": "density_adjusted"}
            ],
            "formulas": {"density_adjusted": "density * 1.0"},
            "lookup_tables": {},
            "derived_fields": ["density_adjusted"],
        },
        "gate": {
            "rules": [
                {
                    "rule_id": "range_rule",
                    "condition": {"operator": "between", "actual": "density", "min": 1.1, "max": 1.4},
                    "severity": "blocking",
                    "on_fail": "block",
                    "source": {"norm": "TEST_STD", "clause": "1.0.1", "source_text": "1.1 <= density <= 1.4"},
                },
                {
                    "rule_id": "compare_rule",
                    "condition": "density >= 1.2",
                    "severity": "warning",
                    "on_fail": "warn",
                    "source": {"norm": "TEST_STD", "clause": "1.0.2", "source_text": "density >= 1.2"},
                },
                {
                    "rule_id": "relation_rule",
                    "condition": "embed_depth >= pile_diameter + 0.5",
                    "severity": "critical",
                    "on_fail": "critical",
                    "source": {"norm": "TEST_STD", "clause": "1.0.3", "source_text": "embed_depth >= pile_diameter + 0.5"},
                },
            ],
            "references": ["TEST_STD.1.0.0"],
            "clause_refs": ["TEST_STD.1.0.0"],
        },
        "state": {
            "initial_state": "DRAFT",
            "states": ["DRAFT", "VALIDATED"],
            "allowed_transitions": [{"from_state": "DRAFT", "to_state": "VALIDATED", "trigger": "gate_executed"}],
            "terminal_states": ["VALIDATED"],
        },
        "proof": {
            "proof_fields": ["input", "path_outputs", "gate", "final_status"],
            "hash_algorithm": "sha256",
            "signature": {"algorithm": "hmac_sha256", "key_env": "LAYERPEG_PROOF_HMAC_KEY"},
            "chain": {"enabled": True},
        },
        "metadata": {"confidence": 0.95},
    }


def test_compaction_spec_compiles_to_standard_spu_and_validates() -> None:
    spec_path = _repo_root() / "norms" / "JTG_F80_1_2017" / "4.2.1.compaction.spec.yaml"
    doc = load_spec(spec_path)
    spu = compile_spec_to_spu(doc)

    assert spu["spuId"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert set(["meta", "data", "path", "rules", "proof"]).issubset(set(spu.keys()))
    assert spu["meta"]["norm"] == "JTG_F80_1_2017"
    assert isinstance(spu["data"]["inputs"], dict) and spu["data"]["inputs"]
    assert isinstance(spu["data"]["outputs"], dict) and spu["data"]["outputs"]
    assert isinstance(spu["path"]["steps"], list) and spu["path"]["steps"]
    assert any(item.get("type") == "formula" for item in spu["rules"])

    for rule in spu["rules"]:
        source = rule.get("source", {})
        assert isinstance(source, dict)
        assert source.get("norm")
        assert source.get("clause")
        assert source.get("source_text")

    validation = validate_spu(spu)
    assert validation["valid"] is True
    assert validation["errors"] == []


def test_specir_json_yaml_text_both_supported() -> None:
    payload = _four_rule_specir_payload()
    as_json = json.dumps(payload, ensure_ascii=False)
    as_yaml = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False)

    spu_from_json = compile_specir_text_to_spu(as_json)
    spu_from_yaml = compile_specir_text_to_spu(as_yaml)

    assert spu_from_json["spuId"] == payload["spec_id"]
    assert spu_from_yaml["spuId"] == payload["spec_id"]
    assert spu_from_json["meta"]["norm"] == "TEST_STD"
    assert spu_from_yaml["meta"]["clause"] == "1.0.0"


def test_compiler_supports_range_compare_relation_formula_rule_types() -> None:
    spu = compile_specir_payload_to_spu(_four_rule_specir_payload())
    rule_types = {str(item.get("type")) for item in spu["rules"]}
    assert {"range", "compare", "relation", "formula"}.issubset(rule_types)

    validation = validate_spu(spu)
    assert validation["valid"] is True


def test_execute_spu_runs_path_gate_and_outputs_pass_fail_and_proof_fields() -> None:
    spec_path = _repo_root() / "norms" / "JTG_F80_1_2017" / "4.2.1.compaction.spec.yaml"
    doc = load_spec(spec_path)
    spu = compile_spec_to_spu(doc)

    pass_result = execute_spu(spu, _compaction_input(compaction=95.9, representative=95.9))
    assert pass_result["final_status"] == "PASS"
    assert pass_result["gate"]["summary_status"] == "PASS"
    assert "standard_value" in pass_result["path_outputs"]
    assert "proof_payload" in pass_result
    assert "final_status" in pass_result["proof_fields"]

    fail_result = execute_spu(spu, _compaction_input(compaction=90.0, representative=90.0))
    assert fail_result["final_status"] == "FAIL"
    assert fail_result["gate"]["summary_status"] in {"BLOCKED", "CRITICAL", "WARNING", "FAIL"}


def test_validate_spu_detects_unclosed_formula_and_gate_unexecutable_rule() -> None:
    spu = compile_specir_payload_to_spu(_four_rule_specir_payload())
    invalid_spu = copy.deepcopy(spu)
    invalid_spu["path"]["formulas"]["density_adjusted"] = "(density * 1.0"
    invalid_spu["rules"][0]["condition"] = {"operator": "unknown", "actual": "density", "expected": 1.0}

    validation = validate_spu(invalid_spu)
    assert validation["valid"] is False
    assert any("unclosed bracket/parenthesis" in item for item in validation["errors"])
    assert any("unsupported gate condition operator" in item for item in validation["errors"])

