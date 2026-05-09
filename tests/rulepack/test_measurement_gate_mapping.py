from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_measurement_pair_gate_mapping_passes_when_one_to_one() -> None:
    st = {
        "form_code": "bridge_shi_13",
        "field_nodes": [{"field_key": "pile.centerXYDiff"}],
        "measurement_pairs": [{"field_key": "pile.centerXYDiff"}],
        "gate_refs": [{"field_key": "pile.centerXYDiff", "gate_ref": "gate.1"}],
    }
    gates = [{"gate_id": "gate.1", "rule_ids": ["R1"]}]
    res = main._validate_measurement_pair_gate_mapping(form_code="bridge_shi_13", semantic_tree=st, gates_rows=gates)
    assert res["passed"] is True
    assert res["missing_count"] == 0


def test_measurement_pair_gate_mapping_reports_missing_list() -> None:
    st = {
        "form_code": "bridge_shi_13",
        "field_nodes": [{"field_key": "hole.inclination"}],
        "measurement_pairs": [{"field_key": "hole.inclination"}],
        "gate_refs": [{"field_key": "hole.inclination", "gate_ref": ""}],
    }
    gates = [{"gate_id": "gate.1", "rule_ids": ["R1"]}]
    res = main._validate_measurement_pair_gate_mapping(form_code="bridge_shi_13", semantic_tree=st, gates_rows=gates)
    assert res["passed"] is False
    assert res["missing_count"] == 1
    assert res["missing_items"][0]["reason"] == "missing_gateRef"


def test_measurement_pair_gate_mapping_summary_blocks_publish_condition() -> None:
    job_id = "ut_measurement_gate_summary"
    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp_path = rp_dir / f"demo-{job_id}.rulepack.json"
    rp = {
        "measurement_gate_mapping": {
            "form_code": "bridge_shi_13",
            "measurement_pair_count": 2,
            "missing_count": 1,
            "passed": False,
            "missing_items": [{"field_key": "a", "reason": "gateRef_not_found_in_gates", "gateRef": "x"}],
        }
    }
    rp_path.write_text(json.dumps(rp, ensure_ascii=False), encoding="utf-8")
    s = main._collect_measurement_gate_mapping_summary_for_job(job_id)
    assert s["missing_count"] >= 1
    assert s["blocked"] is True
