from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_engineering_llm_layer_schema_and_build() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/engineering-llm/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.json().get("engineering_llm_schema", {})
    assert "training_inputs" in schema
    assert "capabilities" in schema

    build_resp = client.post(
        "/api/v1/engineering-llm/build",
        json={
            "specir": [{"specir_id": "S1", "clause": "4.2.1"}],
            "slot_graph": {"nodes": [{"id": "compaction_degree"}], "edges": []},
            "runtime_traces": [{"execution_id": "exec_1", "trace": []}],
            "proof": [{"proof_hash": "p1"}],
            "human_reviews": [{"review_id": "r1", "decision": "accept"}],
            "conflict_resolutions": [{"conflict_id": "c1", "resolution": "override"}],
        },
    )
    assert build_resp.status_code == 200
    body = build_resp.json()
    assert "model_architecture" in body
    assert "fine_tuning_pipeline" in body
    assert "retrieval_integration" in body
    status = body.get("capabilities_status", {})
    for key in [
        "semantic parsing",
        "slot recommendation",
        "conflict resolution",
        "compliance reasoning",
        "runtime explanation",
    ]:
        assert status.get(key) == "enabled"

