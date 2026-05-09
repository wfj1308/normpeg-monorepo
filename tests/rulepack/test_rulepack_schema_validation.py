from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _valid_rulepack_payload() -> dict:
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
    }


def test_rulepack_v1_valid_payload_passes_schema() -> None:
    payload = _valid_rulepack_payload()
    ok, errs, canonical = main._validate_rulepack_v1_schema(payload)
    assert ok is True
    assert errs == []
    assert canonical["meta"]["rulepack_version"] == "v1"


def test_rulepack_v1_invalid_payload_reports_precise_path() -> None:
    payload = _valid_rulepack_payload()
    # Break threshold structure so schema validation fails with path info.
    del payload["rules"][0]["threshold"]
    payload["rules"][0]["operator"] = ""
    payload["rules"][0]["unit"] = ""
    ok, errs, _ = main._validate_rulepack_v1_schema(payload)
    assert ok is False
    assert any("rules[0].threshold.operator" in e for e in errs)


def test_rulepack_v1_to_v2_migration_and_validation() -> None:
    payload = _valid_rulepack_payload()
    ok1, errs1, canonical_v1 = main._validate_rulepack_v1_schema(payload)
    assert ok1 is True
    assert errs1 == []
    migrated = main._migrate_rulepack_v1_to_v2_in_memory(canonical_v1)
    assert migrated["meta"]["schema_version"] == "v2"
    ok2, errs2, _ = main._validate_rulepack_v2_schema(migrated)
    assert ok2 is True
    assert errs2 == []
