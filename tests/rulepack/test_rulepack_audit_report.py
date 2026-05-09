from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_rulepack_audit_report_has_required_fields() -> None:
    rules = [
        {"rule_id": "R1", "component_id": "C1", "field": "f1", "operator": "<=", "threshold": {"value": 1, "min": None, "max": 1, "unit": "mm", "operator": "<=", "raw_text": "x"}, "unit": "mm", "condition": "f1<=1", "norm_ref": "N1", "source_clause": "1.1"},
        {"rule_id": "R2", "component_id": "C2", "field": "f2", "operator": "exists", "threshold": {"value": None, "min": None, "max": None, "unit": "mm", "operator": "exists", "raw_text": "x"}, "unit": "mm", "condition": "exists(f2)", "norm_ref": "N2", "source_clause": "1.2"},
    ]
    rep = main._build_rulepack_audit_report(
        job_id="ut_audit",
        form_code="bridge_shi_13",
        norm_version="v1",
        pre_counts={"rules": 10},
        selected_components_count=2,
        selected_rules=rules,
        selected_gates_count=2,
        unresolved_count=1,
    )
    for k in [
        "job_id",
        "form_code",
        "norm_version",
        "selected_components_count",
        "selected_rules_count",
        "selected_gates_count",
        "filtered_out_count",
        "added_rules",
        "removed_rules",
        "changed_rules",
        "unresolved_count",
    ]:
        assert k in rep
    assert rep["selected_rules_count"] == 2
    assert rep["filtered_out_count"] == 8
