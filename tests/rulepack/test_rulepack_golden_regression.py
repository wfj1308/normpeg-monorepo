from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _bridge13_rules_and_gates() -> tuple[list[dict], list[dict]]:
    rules = [
        {
            "rule_id": "JTG/T 3650-2020.9_7_1.rule",
            "component_id": "JTG/T 3650-2020.9_7_1.component",
            "source_clause": "9.7.1",
            "field": "hole.inclination",
            "operator": "<=",
            "max": 1.0,
            "unit": "%",
            "source_text": "",
        },
        {
            "rule_id": "JTG/T 3650-2020.9_7_2.rule",
            "component_id": "JTG/T 3650-2020.9_7_2.component",
            "source_clause": "9.7.2",
            "field": "hole.sedimentThickness",
            "operator": "exists",
            "unit": "mm",
            "source_text": "",
        },
        {
            "rule_id": "JTG/T 3650-2020.9_7_3.rule",
            "component_id": "JTG/T 3650-2020.9_7_3.component",
            "source_clause": "9.7.3",
            "field": "pile.centerXYDiff",
            "operator": "<=",
            "max": 50,
            "unit": "mm",
            "source_text": "",
        },
    ]
    gates = [
        {"gate_id": "gate.JTG/T 3650-2020.9_7_1.component", "rule_ids": ["JTG/T 3650-2020.9_7_1.rule"], "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.1"]},
        {"gate_id": "gate.JTG/T 3650-2020.9_7_2.component", "rule_ids": ["JTG/T 3650-2020.9_7_2.rule"], "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.2"]},
        {"gate_id": "gate.JTG/T 3650-2020.9_7_3.component", "rule_ids": ["JTG/T 3650-2020.9_7_3.rule"], "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.3"]},
    ]
    return rules, gates


def test_bridge13_golden_compare_passes() -> None:
    rules, gates = _bridge13_rules_and_gates()
    result = main._compare_rulepack_with_golden(form_code="bridge_shi_13", rules=rules, gates=gates)
    assert result["enabled"] is True
    assert result["passed"] is True
    assert result["diffs"] == []


def test_bridge13_golden_compare_outputs_diff_on_mismatch() -> None:
    rules, gates = _bridge13_rules_and_gates()
    rules[2]["max"] = 60
    result = main._compare_rulepack_with_golden(form_code="bridge_shi_13", rules=rules, gates=gates)
    assert result["enabled"] is True
    assert result["passed"] is False
    assert any(d.get("field_name") == "pile.centerXYDiff" and d.get("key") == "expected_threshold" for d in result["diffs"])
