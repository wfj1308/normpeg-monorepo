from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_formula_intelligence_schema_and_parse() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/formula-intelligence/schema")
    assert schema_resp.status_code == 200
    schema_body = schema_resp.json()
    assert "formula_parser" in schema_body
    assert "ast_schema" in schema_body
    assert "runtime_integration" in schema_body

    parse_resp = client.post(
        "/api/v1/formula-intelligence/parse",
        json={
            "clause": "压实度由干密度与最大干密度计算得到，结果以%表示。",
            "formula": "compactionDegree = (dryDensity / maxDryDensity) * 100",
        },
    )
    assert parse_resp.status_code == 200
    body = parse_resp.json()
    assert "formula_latex" in body
    assert "formula_ast" in body
    assert "inputs" in body
    assert "output" in body
    assert "unit_mapping" in body
    assert "runtime_integration" in body
    runtime_integration = body["runtime_integration"]
    assert "slot_dependency" in runtime_integration
    assert "runtime_formula_executor" in runtime_integration

