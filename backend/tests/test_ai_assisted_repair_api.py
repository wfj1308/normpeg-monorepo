from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_ai_assisted_repair_workflow() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/ai-repair/schema")
    assert schema_resp.status_code == 200
    assert "schema" in schema_resp.json()

    suggest_resp = client.post(
        "/api/v1/ai-repair/suggest",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source_clause": "压实度应满足标准要求",
            "specir": {"spec_id": "JTG_F80_1_2017.4.2.1.compaction"},
            "unresolved_reason": "threshold unresolved",
            "nearby_resolved_rules": [{"field": "compaction_degree", "operator": ">=", "threshold": 95, "unit": "%"}],
            "slot_registry": [{"slotKey": "compaction_degree", "unit": "%", "type": "number"}],
        },
    )
    assert suggest_resp.status_code == 200
    body = suggest_resp.json()
    assert "suggestion_payload" in body
    assert "review_queue_item" in body
    patch_id = body["review_queue_item"]["patch_id"]

    queue_resp = client.get("/api/v1/ai-repair/review-queue")
    assert queue_resp.status_code == 200
    assert isinstance(queue_resp.json().get("items"), list)

    accept_resp = client.post(
        "/api/v1/ai-repair/review-action",
        json={"patch_id": patch_id, "action": "accept_patch", "manual_edit": {}},
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["item"]["status"] == "accepted"

    manual_resp = client.post(
        "/api/v1/ai-repair/review-action",
        json={"patch_id": patch_id, "action": "manual_edit", "manual_edit": {"operator": "<=", "threshold": 96}},
    )
    assert manual_resp.status_code == 200
    assert manual_resp.json()["item"]["status"] == "manual_edited"
