from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_rule_test_framework_generates_report() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/rule-test/run",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "rulepack": {
                "component_id": "JTG_F80_1_2017.4.2.1.compaction",
                "inputs": {"input_dto": {"compaction_degree": {"type": "number", "required": True}}},
                "gate": {"rules": [{"rule_id": "r1", "condition": "compaction_degree >= 95", "on_fail": "block"}]},
            },
            "pass_rate_threshold": 0.8,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "rule_tests" in body
    assert "gate_tests" in body
    assert "executor_tests" in body
    assert "sandbox_cases" in body
    assert "summary" in body


def test_register_blocked_when_test_pass_rate_below_threshold() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/component/register",
        json={
            "catalog_id": "TEST_CAT",
            "component_id": "test.form",
            "component_name": "test.form",
            "version": "v1",
            "definition": {
                "component_id": "test.form",
                "inputs": {"input_dto": {}},
                "gate": {"rules": []},
            },
            "enforce_golden_gate": False,
        },
    )
    assert response.status_code == 409
