from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_rule_impact_analysis_returns_graph_and_impacts() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/rule/impact-analysis",
        json={
            "specir_id": "JTG_F80_1_2017.4.2.1.compaction",
            "rule_id": "single_point_rule",
            "gate_id": "default",
            "slotKey": "compaction_degree",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "dependency_graph" in body
    assert "propagation_algorithm" in body
    assert "upstream_trace" in body
    assert "downstream_impacts" in body
    assert "impact_summary" in body
    assert "form_code" in body["impact_summary"]
    assert "question_answer" in body["impact_summary"]

