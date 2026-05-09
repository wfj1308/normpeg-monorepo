from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_constraint_reasoner_schema_and_reasoning() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/constraint-reasoner/schema")
    assert schema_resp.status_code == 200
    schema = schema_resp.json().get("condition_schema", {})
    assert "fields" in schema

    reason_resp = client.post(
        "/api/v1/constraint-reasoner/reason",
        json={"clause": "高速公路一级公路压实度不得小于95%"},
    )
    assert reason_resp.status_code == 200
    body = reason_resp.json()
    assert "constraint" in body
    assert "constraint_reasoning" in body
    constraint = body["constraint"]
    assert constraint["subject"] == "compaction.degree"
    assert constraint["operator"] == ">="
    assert constraint["threshold"] == 95.0
    assert constraint["unit"] == "%"
    condition = constraint["condition"]
    assert "road_type" in condition
    assert "highway" in condition["road_type"]
    assert "grade1" in condition["road_type"]

