from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_compliance_ai_engine_schema_and_evaluate() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/compliance/schema")
    assert schema_resp.status_code == 200
    schema_body = schema_resp.json()
    assert "compliance_schema" in schema_body
    assert "scoring_strategy" in schema_body
    assert "reasoning_design" in schema_body

    eval_resp = client.post(
        "/api/v1/compliance/evaluate",
        json={
            "project_peg": {"project_id": "P1"},
            "runtime_records": [
                {
                    "execution_id": "exec_1",
                    "proof_hash": "proof_hash_1",
                    "gate": {
                        "rule_results": [
                            {
                                "rule_id": "single_point_rule",
                                "passed": False,
                                "severity": "critical",
                                "expected_value": 95,
                                "actual_value": 93,
                                "message": "compaction below threshold",
                            }
                        ]
                    },
                }
            ],
            "rulepack": {"gate": {"rules": [{"rule_id": "single_point_rule", "severity": "critical"}]}},
            "proof_records": [{"proof_hash": "proof_hash_2"}],
        },
    )
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    assert "compliance_engine" in body
    assert "scoring_strategy" in body
    assert "reasoning_design" in body
    assert "project_trace" in body
    assert "result" in body
    result = body["result"]
    for key in ["compliance_score", "failed_rules", "risk_summary", "suggested_actions", "reasoning_chain"]:
        assert key in result

