from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_p2_readiness_schema_and_evaluate() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/p2-readiness/schema")
    assert schema_resp.status_code == 200
    assert "p2_report_schema" in schema_resp.json()

    eval_resp = client.post(
        "/api/v1/p2-readiness/evaluate",
        json={
            "metrics": {
                "auto_specir_extraction_rate": 0.91,
                "slot_auto_bind_accuracy": 0.93,
                "ai_gate_synthesis_rate": 0.86,
                "low_confidence_review_rate": 0.09,
                "semantic_conflict_detection_pass": True,
                "runtime_traceability_complete": True,
                "propagation_accuracy": 0.91,
                "ai_patch_acceptance_rate": 0.71,
                "norm_diff_accuracy": 0.96,
                "compliance_reasoning_available": True,
            },
            "evidence": {"auto_specir_extraction_rate": "benchmark://run-001"},
        },
    )
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    assert "metrics" in body
    assert "summary" in body
    assert "maturity_level" in body
    assert "remaining_blockers" in body
    assert body["summary"]["failed"] == 0

