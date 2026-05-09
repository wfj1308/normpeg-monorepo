from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_multi_standard_fusion_conflict_resolution() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/fusion/multi-standard",
        json={
            "standards": [
                {
                    "standard_id": "GB",
                    "standard_type": "national",
                    "rules": [{"rule_id": "r1", "field": "compaction_degree", "operator": ">=", "threshold": 95, "unit": "%"}],
                },
                {
                    "standard_id": "ENT",
                    "standard_type": "enterprise",
                    "rules": [{"rule_id": "r1", "field": "compaction_degree", "operator": ">=", "threshold": 98, "unit": "%"}],
                },
                {
                    "standard_id": "LOCAL_DUP",
                    "standard_type": "local",
                    "rules": [{"rule_id": "r_dup", "field": "thickness", "operator": ">=", "threshold": 200, "unit": "mm"}],
                },
                {
                    "standard_id": "IND_DUP",
                    "standard_type": "industry",
                    "rules": [{"rule_id": "r_dup2", "field": "thickness", "operator": ">=", "threshold": 200, "unit": "mm"}],
                },
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "fusion_engine" in body
    assert "priority_strategy" in body
    assert "conflict_resolver" in body
    assert "fused_rules" in body
    assert "duplicated_rule" in body["conflict_resolver"]
