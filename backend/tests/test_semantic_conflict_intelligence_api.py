from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_semantic_conflict_intelligence_api() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/semantic-conflict/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.json().get("conflict_schema", {})
    assert "supported_conflicts" in schema

    analyze_resp = client.post(
        "/api/v1/semantic-conflict/analyze",
        json={
            "rules": [
                {
                    "rule_id": "R1",
                    "slotKey": "compaction_degree",
                    "operator": ">=",
                    "threshold": 95,
                    "scope": "highway_level_1",
                    "semantic_text": "Compaction degree must be at least 95.",
                    "standard_level": "industry",
                    "version": "v1",
                },
                {
                    "rule_id": "R2",
                    "slotKey": "compaction_degree",
                    "operator": ">=",
                    "threshold": 96,
                    "scope": "highway_level_1",
                    "semantic_text": "Compaction degree shall not be below 96.",
                    "standard_level": "local",
                    "version": "v2",
                },
                {
                    "rule_id": "R3",
                    "slotKey": "compaction_degree",
                    "operator": "<=",
                    "threshold": 94,
                    "scope": "bridge",
                    "semantic_text": "Compaction degree must not exceed 94.",
                    "standard_level": "enterprise",
                    "version": "v1",
                },
            ]
        },
    )
    assert analyze_resp.status_code == 200
    body = analyze_resp.json()

    assert "conflict_engine" in body
    assert "semantic_compare_algorithm" in body
    assert "precedence_rules" in body

    conflicts = body.get("conflicts", [])
    assert isinstance(conflicts, list)
    if conflicts:
        first = conflicts[0]
        assert "conflict_reasoning" in first
        assert "recommended_resolution" in first
        assert "precedence_suggestion" in first

