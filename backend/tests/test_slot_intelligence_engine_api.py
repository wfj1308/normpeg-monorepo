from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_slot_intelligence_recommendation_and_review_queue() -> None:
    client = TestClient(app)

    resp = client.post(
        "/api/v1/slot-intelligence/recommend",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "clause": "压实度代表值不得低于95%",
            "semantic_type": "threshold_constraint",
            "nearby_slots": [
                {"slotKey": "compaction_degree"},
                {"slotKey": "dry_density"},
            ],
            "historical_mappings": [
                {"slotKey": "compaction_degree"},
                {"slotKey": "compaction_degree"},
                {"slotKey": "dry_density"},
            ],
            "blueprint_context": {"dto_fields": ["compaction_degree"]},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "slot_recommendation_engine" in body
    assert "similarity_strategy" in body
    assert "recommended_slot_keys" in body
    assert "auto_bound" in body
    assert "human_review_queue" in body

    recommended = body.get("recommended_slot_keys") or []
    assert isinstance(recommended, list)
    if recommended:
        assert "slotKey" in recommended[0]
        assert "confidence" in recommended[0]
        assert "reasoning" in recommended[0]
        assert "semantic_similarity" in recommended[0]
        assert "historical_support" in recommended[0]

    for item in body.get("auto_bound", []):
        assert float(item.get("confidence") or 0.0) >= 0.92
    for item in body.get("human_review_queue", []):
        assert float(item.get("confidence") or 0.0) < 0.92

    queue_resp = client.get("/api/v1/slot-intelligence/review-queue")
    assert queue_resp.status_code == 200
    queue_body = queue_resp.json()
    assert isinstance(queue_body.get("items"), list)
