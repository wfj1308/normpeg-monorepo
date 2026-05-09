from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_specir_explain_api_returns_human_readable_structure() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/specir/explain/JTG_F80_1_2017.4.2.2.deflection")
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == "JTG_F80_1_2017.4.2.2.deflection"
    assert body["source"] == "specir"
    assert body["name"] == "Deflection"
    assert "bearing capacity" in body["definition"]
    assert any(item["name"] == "deflection" for item in body["inputs"])
    assert isinstance(body["path_summary"], str) and "normalize_road_class" in body["path_summary"]
    assert isinstance(body["gate_rules"], list) and len(body["gate_rules"]) == 3
    assert body["gate_rules"][0]["rule_id"] == "rule.deflection.single_point_limit"
    assert isinstance(body["state_flow"], list) and body["state_flow"][0]["from_state"] == "DRAFT"


def test_specir_explain_api_aligns_with_execution_result_structure() -> None:
    client = TestClient(app)
    spec_id = "JTG_F80_1_2017.4.2.1.compaction"

    explain_response = client.get(f"/api/v1/specir/explain/{spec_id}")
    assert explain_response.status_code == 200
    explain_body = explain_response.json()

    execute_response = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": {
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "project_id": "P-SPECIR-EXPLAIN-001",
                "compaction_degree": 96.5,
                "representative_value": 96.0,
                "actor_did": "did:test:specir-explain",
                "inspected_at": "2026-04-16T10:00:00Z",
            },
            "branch_id": "main",
        },
    )
    assert execute_response.status_code == 200
    execute_body = execute_response.json()

    assert len(explain_body["gate_rules"]) == len(execute_body["gate"]["rule_results"])
    assert "determine_zone" in explain_body["path_summary"]
    assert any(item.get("step_id") == "determine_zone" for item in execute_body["path_trace"])
    assert explain_body["state_flow"][0]["from_state"] == execute_body["state_trace"][0]["state"]
