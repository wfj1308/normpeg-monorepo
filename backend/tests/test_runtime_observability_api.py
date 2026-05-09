from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_runtime_metrics_dashboard_and_filters() -> None:
    client = TestClient(app)
    spu_id = "JTG_F80_1_2017.4.2.1.compaction"

    pass_payload = {
        "spuId": spu_id,
        "inputs": {
            "stake": "K1+000",
            "layer_depth": "0-0.8m",
            "project_id": "P-OBS-1",
            "compaction_degree": 96.0,
            "actor_did": "did:test:obs",
            "inspected_at": "2026-05-08T00:00:00Z",
        },
        "context": {"project_id": "P-OBS-1", "rulepack_version": "v1"},
    }
    fail_payload = {
        "spuId": spu_id,
        "inputs": {
            "stake": "K1+010",
            "layer_depth": "0-0.8m",
            "project_id": "P-OBS-1",
            "compaction_degree": 90.0,
            "actor_did": "did:test:obs",
            "inspected_at": "2026-05-08T00:01:00Z",
        },
        "context": {"project_id": "P-OBS-1", "rulepack_version": "v1"},
    }

    assert client.post("/api/v1/gate/evaluate", json=pass_payload).status_code == 200
    assert client.post("/api/v1/gate/evaluate", json=fail_payload).status_code == 200

    schema_resp = client.get("/api/v1/runtime/observability/schema")
    assert schema_resp.status_code == 200
    assert "schema" in schema_resp.json()

    metrics_resp = client.get(
        "/api/v1/runtime/metrics",
        params={"form_code": spu_id, "rulepack_version": "v1", "project_id": "P-OBS-1"},
    )
    assert metrics_resp.status_code == 200
    body = metrics_resp.json()
    assert "summary" in body
    assert "pass_rate" in body["summary"]
    assert "fail_rate" in body["summary"]
    assert "slot_missing_rate" in body["summary"]
    assert "unresolved_rate" in body["summary"]
    assert "executor_latency" in body["summary"]
    assert "top_failing_rules" in body
