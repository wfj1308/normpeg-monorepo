from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_rule_heatmap_dashboard_metrics() -> None:
    client = TestClient(app)
    spu_id = "JTG_F80_1_2017.4.2.1.compaction"
    payload = {
        "spuId": spu_id,
        "inputs": {
            "stake": "K2+000",
            "layer_depth": "0-0.8m",
            "project_id": "P-HEAT-1",
            "compaction_degree": 90.0,
            "actor_did": "did:test:heat",
            "inspected_at": "2026-05-08T00:02:00Z",
        },
        "context": {"project_id": "P-HEAT-1", "rulepack_version": "v1", "standard_code": "JTG_F80_1_2017"},
    }
    assert client.post("/api/v1/gate/evaluate", json=payload).status_code == 200

    resp = client.get(
        "/api/v1/runtime/rule-heatmap",
        params={"standard": "JTG_F80_1_2017", "form_code": spu_id, "project": "P-HEAT-1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "heatmap_metrics" in body
    assert "aggregation_pipeline" in body
    assert "top_risky_rules" in body
    assert "most_failing_gates" in body
    assert "most_overridden_rules" in body
