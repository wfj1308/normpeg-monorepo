from __future__ import annotations

import copy
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _valid_contract_payload() -> dict:
    lineage = {
        "norm_id": "JTG/T-3650-2020",
        "norm_version": "2020",
        "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.3",
        "source_text": "pile.centerXYDiff <= 50",
        "source_file_hash": "sha256:abc",
        "created_by": "extractor_a",
        "reviewed_by": "reviewer_b",
        "published_by": "",
        "published_at": "",
    }
    return {
        "meta": {
            "form_code": "bridge_shi_13",
            "spec_code": "JTG/T-3650-2020",
            "spec_version": "2020",
            "package_version": "v1",
            "selection_mode": "whitelist",
            "generated_at": "2026-05-07T10:00:00Z",
        },
        "components": [
            {
                "component_id": "JTG/T 3650-2020.9_7_3.component",
                "title": "桩位偏差",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause": "9.7.3",
                "type": "measurement",
            }
        ],
        "rules": [
            {
                "rule_id": "JTG/T 3650-2020.9_7_3.rule",
                "component_id": "JTG/T 3650-2020.9_7_3.component",
                "source_clause": "9.7.3",
                "field": "pile.centerXYDiff",
                "operator": "<=",
                "threshold": {
                    "value": 50,
                    "min": None,
                    "max": 50,
                    "unit": "mm",
                    "operator": "<=",
                    "raw_text": "pile.centerXYDiff <= 50",
                },
                "unit": "mm",
                "condition": "pile.centerXYDiff <= 50",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_page": 123,
                "source_text": "桩位偏差应小于等于50mm",
                "quote_start": 0,
                "quote_end": 12,
                "lineage": lineage,
            }
        ],
        "gates": [
            {
                "gate_id": "gate.JTG/T 3650-2020.9_7_3.component",
                "type": "ALL_PASS",
                "rule_ids": ["JTG/T 3650-2020.9_7_3.rule"],
                "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.3"],
                "on_pass": "pass",
                "on_fail": "fail",
                "lineage": lineage,
            }
        ],
        "semantic_tree": {
            "form_code": "bridge_shi_13",
            "field_nodes": [{"field_key": "pile.centerXYDiff"}],
            "measurement_pairs": [{"field_key": "pile.centerXYDiff"}],
            "gate_refs": [{"field_key": "pile.centerXYDiff", "gate_ref": "gate.JTG/T 3650-2020.9_7_3.component"}],
        },
    }


def test_rulepack_contract_valid_payload_passes() -> None:
    payload = _valid_contract_payload()
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is True
    assert out["blockers"] == []


def test_rulepack_contract_detects_missing_rule_ref() -> None:
    payload = _valid_contract_payload()
    payload["gates"][0]["rule_ids"] = ["not_exists_rule"]
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is False
    assert any("gate_rule_ref_missing" in x for x in out["blockers"])


def test_rulepack_contract_detects_missing_gate_ref() -> None:
    payload = _valid_contract_payload()
    payload["semantic_tree"]["gate_refs"][0]["gate_ref"] = "gate.not.exists"
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is False
    assert any("measurement_gate_ref_missing" in x for x in out["blockers"])


def test_rulepack_contract_detects_missing_norm_anchor() -> None:
    payload = _valid_contract_payload()
    bad = copy.deepcopy(payload["rules"][0])
    bad.pop("source_page", None)
    bad.pop("source_text", None)
    payload["rules"][0] = bad
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is False
    assert any("normref_anchor_missing" in x for x in out["blockers"])


def test_rulepack_contract_detects_duplicate_component_id() -> None:
    payload = _valid_contract_payload()
    payload["components"].append(copy.deepcopy(payload["components"][0]))
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is False
    assert any("duplicate_component_id" in x for x in out["blockers"])


def test_rulepack_contract_requires_norm_version_binding() -> None:
    payload = _valid_contract_payload()
    payload["meta"].pop("spec_version", None)
    payload["meta"].pop("norm_version", None)
    out = main._validate_rulepack_contract(payload)
    assert out["ok"] is False
    assert any("norm_version_missing" in x for x in out["blockers"])
