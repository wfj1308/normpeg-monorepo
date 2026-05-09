from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_norm_qa_engine_schema_and_ask() -> None:
    client = TestClient(app)

    # Ensure graph has useful sample nodes first.
    build_resp = client.post(
        "/api/v1/knowledge-graph/build",
        json={
            "specs": [
                {
                    "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
                    "version": "v1",
                    "semantics": {"standard_id": "JTG_F80_1_2017", "clause_refs": ["4.2.1"]},
                    "inputs": {"input_dto": {"compaction_degree": {"type": "number", "unit": "%"}}},
                    "gate": {"rules": [{"rule_id": "r.compaction", "field": "compaction_degree", "operator": ">=", "threshold": 95, "unit": "%"}]},
                }
            ]
        },
    )
    assert build_resp.status_code == 200

    schema_resp = client.get("/api/v1/norm-qa/schema")
    assert schema_resp.status_code == 200
    schema_body = schema_resp.json()
    assert "qa_schema" in schema_body
    assert "retrieval_strategy" in schema_body
    assert "citation_design" in schema_body

    ask_resp = client.post(
        "/api/v1/norm-qa/ask",
        json={"question": "桩顶高程偏差要求是什么？", "top_k": 20},
    )
    assert ask_resp.status_code == 200
    body = ask_resp.json()
    assert "answer" in body
    assert "evidence" in body
    assert "results" in body
    results = body.get("results", {})
    for key in ["clause", "specir", "rule", "gate", "affected_forms", "proof_templates"]:
        assert key in results

