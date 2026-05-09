from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def _baseline_rulepack() -> dict:
    return {
        "component_id": "JTG_F80_1_2017.4.2.1.compaction",
        "component_name": "compaction",
        "catalog_id": "JTG_F80_1_2017",
        "standard_id": "JTG_F80_1_2017",
        "version": "v1",
        "gate": {
            "rules": [
                {"rule_id": "single_point_rule", "condition": "compaction_degree >= 95", "severity": "blocking", "on_fail": "block"}
            ]
        },
    }


def test_golden_regression_report_and_release_gate_block() -> None:
    client = TestClient(app)
    form_code = "JTG_F80_1_2017.4.2.1.compaction"

    baseline_resp = client.post(
        "/api/v1/golden/baseline/upsert",
        json={
            "form_code": form_code,
            "baseline_rulepack": _baseline_rulepack(),
            "baseline_runtime_result": {"final_status": "PASS"},
            "baseline_publish_result": {"version": "v1", "published": True},
            "sample_input": {"compaction_degree": 96.0},
        },
    )
    assert baseline_resp.status_code == 200

    candidate = _baseline_rulepack()
    candidate["gate"]["rules"] = [
        {"rule_id": "single_point_rule", "condition": "compaction_degree >= 96", "severity": "blocking", "on_fail": "block"}
    ]

    check_resp = client.post(
        "/api/v1/golden/regression/check",
        json={
            "form_code": form_code,
            "candidate_rulepack": candidate,
            "candidate_publish_result": {"version": "v2", "published": True},
        },
    )
    assert check_resp.status_code == 200
    check_body = check_resp.json()
    assert check_body["gate"]["blocked"] is True

    register_resp = client.post(
        "/api/v1/component/register",
        json={
            "catalog_id": "JTG_F80_1_2017",
            "component_id": form_code,
            "component_name": "compaction",
            "version": "v2",
            "definition": candidate,
            "enforce_golden_gate": True,
        },
    )
    assert register_resp.status_code == 409
