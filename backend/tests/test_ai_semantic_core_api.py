from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_ai_semantic_core_parse_and_explainability() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/semantic-core/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.json().get("schema", {})
    assert "semantic_types" in schema

    parse_resp = client.post(
        "/api/v1/semantic-core/parse",
        json={
            "clause_text": "路基压实度代表值不得低于95%，且应按T0921方法检测。",
            "table_cell": "压实度 | >=95%",
            "formula": "compaction_degree >= 95",
            "note": "特殊工况需复核",
        },
    )
    assert parse_resp.status_code == 200
    body = parse_resp.json()
    assert "semantic_specir" in body
    assert "reasoning" in body
    assert "evidence_span" in body
    assert "confidence" in body
