from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_docpeg_coverage_report_fields_and_rates() -> None:
    st = {
        "form_code": "bridge_shi_13",
        "field_nodes": [{"field_key": "a"}, {"field_key": "b"}, {"field_key": "c"}],
        "measurement_pairs": [{"field_key": "a"}, {"field_key": "b"}, {"field_key": "c"}],
        "gate_refs": [{"field_key": "a", "gate_ref": "g1"}, {"field_key": "b", "gate_ref": ""}, {"field_key": "c", "gate_ref": "g3"}],
    }
    mapping = {
        "form_code": "bridge_shi_13",
        "measurement_pair_count": 3,
        "missing_count": 1,
        "passed": False,
        "missing_items": [{"field_key": "b", "reason": "missing_gateRef", "gateRef": ""}],
    }
    rep = main._compute_docpeg_coverage_report(form_code="bridge_shi_13", semantic_tree=st, measurement_gate_mapping=mapping)
    assert rep["field_total"] == 3
    assert rep["auto_gate_count"] == 2
    assert rep["manual_fallback_count"] == 1
    assert rep["missing_gateRef_count"] == 1
    assert abs(rep["executable_rate"] - (2 / 3)) < 1e-9
    assert abs(rep["gate_coverage_rate"] - (2 / 3)) < 1e-9
