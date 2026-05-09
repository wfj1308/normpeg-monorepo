from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_cross_form_ai_propagation_preview() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/cross-form-propagation/schema")
    assert schema_resp.status_code == 200
    assert "propagation_schema" in schema_resp.json()

    preview_resp = client.post(
        "/api/v1/cross-form-propagation/preview",
        json={
            "specir": {
                "specir_id": "JTG_F80_1_2017.4.2.1.compaction",
                "slotKey": "compaction_degree",
                "semantic_text": "Compaction degree representative value must be >=95.",
            },
            "slot_graph": {"nodes": [{"id": "compaction_degree"}, {"id": "sample_count"}], "edges": []},
            "form_blueprint": {
                "forms": [
                    {"form_code": "T0921-2019", "fields": ["compaction_degree", "sample_count", "station"]},
                    {"form_code": "T0912-2019", "fields": ["thickness", "station"]},
                ]
            },
            "historical_usage": [
                {"form_code": "T0921-2019", "usage": 100},
                {"form_code": "T0921-2019", "usage": 80},
                {"form_code": "T0912-2019", "usage": 40},
            ],
            "dry_run": True,
        },
    )
    assert preview_resp.status_code == 200
    body = preview_resp.json()
    assert "propagation_engine" in body
    assert "impact_reasoning" in body
    assert "preview_workflow" in body
    assert "affected_forms" in body

    rows = body.get("affected_forms", [])
    assert isinstance(rows, list)
    if rows:
        first = rows[0]
        assert "confidence" in first
        assert "propagation_reasoning" in first

