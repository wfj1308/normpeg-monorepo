from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_ai_patch_auto_repair_flow() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/ai-patch/schema")
    assert schema_resp.status_code == 200
    assert "patch_schema" in schema_resp.json()

    suggest_resp = client.post(
        "/api/v1/ai-patch/suggest",
        json={
            "form_code": "JTG_F80_1_2017.4.2.1.compaction",
            "unresolved_reason": "threshold unresolved",
            "nearby_rules": [{"slotKey": "compaction_degree", "threshold": 95, "operator": ">=", "formula": "compaction_degree >= 95", "gate_logic": "AND"}],
            "slot_graph": {"nodes": [{"id": "compaction_degree"}]},
            "historical_fixes": [{"slotKey": "compaction_degree", "threshold": 96, "operator": ">=", "formula": "compaction_degree >= 96", "gate_logic": "AND"}],
            "semantic_context": {"clause": "4.2.1"},
        },
    )
    assert suggest_resp.status_code == 200
    body = suggest_resp.json()
    assert "suggestion_payload" in body
    assert "patch_record" in body
    assert "patch_schema" in body
    assert "patch_review_workflow" in body
    assert "revert_strategy" in body
    suggested_patch = body["suggestion_payload"]["suggested_patch"]
    for key in ["slotKey", "threshold", "operator", "formula", "gate_logic"]:
        assert key in suggested_patch
    patch_id = body["patch_record"]["patch_id"]
    assert int(body["patch_record"]["version"]) >= 1

    list_resp = client.get("/api/v1/ai-patch/list")
    assert list_resp.status_code == 200
    assert isinstance(list_resp.json().get("items"), list)

    review_resp = client.post(
        "/api/v1/ai-patch/review",
        json={"patch_id": patch_id, "action": "edit", "edit_payload": {"threshold": 97}},
    )
    assert review_resp.status_code == 200
    assert review_resp.json()["item"]["status"] == "edited"

    revert_resp = client.post("/api/v1/ai-patch/revert", json={"patch_id": patch_id})
    assert revert_resp.status_code == 200
    assert revert_resp.json()["item"]["status"] == "reverted"
