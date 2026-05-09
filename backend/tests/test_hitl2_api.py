from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_hitl2_confidence_governance_queue_sort_and_learning_loop() -> None:
    client = TestClient(app)

    gov_resp = client.get("/api/v1/hitl2/governance")
    assert gov_resp.status_code == 200
    governance = gov_resp.json().get("confidence_governance", {})
    assert governance.get("policy_id") == "hitl2.confidence.v2"
    assert "bands" in governance

    high_resp = client.post(
        "/api/v1/hitl2/queue/enqueue",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source": "test",
            "candidate": {"field": "compaction_degree"},
            "confidence": 0.95,
            "impact_score": 0.8,
        },
    )
    assert high_resp.status_code == 200
    high_item = high_resp.json()["item"]
    assert high_item["governance_decision"] == "auto_approve_candidate"

    mid_resp = client.post(
        "/api/v1/hitl2/queue/enqueue",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source": "test",
            "candidate": {"field": "compaction_degree"},
            "confidence": 0.8,
            "impact_score": 0.9,
        },
    )
    assert mid_resp.status_code == 200
    mid_item = mid_resp.json()["item"]
    assert mid_item["governance_decision"] == "review_required"

    low_resp = client.post(
        "/api/v1/hitl2/queue/enqueue",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source": "test",
            "candidate": {"field": "compaction_degree"},
            "confidence": 0.6,
            "impact_score": 0.7,
        },
    )
    assert low_resp.status_code == 200
    low_item = low_resp.json()["item"]
    assert low_item["governance_decision"] == "blocked"

    boundary_high_resp = client.post(
        "/api/v1/hitl2/queue/enqueue",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source": "test",
            "candidate": {"field": "compaction_degree"},
            "confidence": 0.92,
            "impact_score": 0.6,
        },
    )
    assert boundary_high_resp.status_code == 200
    assert boundary_high_resp.json()["item"]["governance_decision"] == "auto_approve_candidate"

    boundary_mid_resp = client.post(
        "/api/v1/hitl2/queue/enqueue",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "source": "test",
            "candidate": {"field": "compaction_degree"},
            "confidence": 0.75,
            "impact_score": 0.95,
        },
    )
    assert boundary_mid_resp.status_code == 200
    assert boundary_mid_resp.json()["item"]["governance_decision"] == "review_required"

    queue_resp = client.get("/api/v1/hitl2/queue", params={"include_auto_approved": "true"})
    assert queue_resp.status_code == 200
    items = queue_resp.json().get("items", [])
    assert isinstance(items, list)
    if len(items) >= 2:
        first = items[0]
        second = items[1]
        assert float(first.get("confidence") or 0.0) >= float(second.get("confidence") or 0.0)

    action_resp = client.post(
        "/api/v1/hitl2/queue/action",
        json={
            "patch_id": mid_item["patch_id"],
            "action": "edit",
            "edit_payload": {"threshold": 96},
            "reviewer": "tester",
        },
    )
    assert action_resp.status_code == 200
    action_body = action_resp.json()
    assert action_body["item"]["status"] == "edited"
    assert "ai_learning_loop" in action_body

    missing_reviewer_resp = client.post(
        "/api/v1/hitl2/queue/action",
        json={
            "patch_id": mid_item["patch_id"],
            "action": "accept",
            "edit_payload": {},
            "reviewer": "",
        },
    )
    assert missing_reviewer_resp.status_code == 400

    loop_resp = client.get("/api/v1/hitl2/learning-loop")
    assert loop_resp.status_code == 200
    loop = loop_resp.json().get("ai_learning_loop", {})
    assert int(loop.get("events") or 0) >= 1
    assert "feedback_rate" in loop
