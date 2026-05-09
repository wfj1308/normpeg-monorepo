from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_auto_norm_subscription_schema_and_run() -> None:
    client = TestClient(app)

    schema_resp = client.get("/api/v1/norm-subscription/schema")
    assert schema_resp.status_code == 200
    assert "subscription_schema" in schema_resp.json()

    run_resp = client.post(
        "/api/v1/norm-subscription/run",
        json={
            "sources": [
                {"source_id": "mot", "name": "交通部", "type": "government"},
                {"source_id": "mohurd", "name": "住建部", "type": "government"},
                {"source_id": "enterprise", "name": "企业标准源", "type": "enterprise"},
            ],
            "discovered_norms": [
                {"norm_id": "MOT-NEW-2026-001", "title": "交通部新规范示例"},
                {"norm_id": "MOHURD-NEW-2026-001", "title": "住建部新规范示例"},
            ],
            "dry_run": True,
        },
    )
    assert run_resp.status_code == 200
    body = run_resp.json()
    assert "source_monitor" in body
    assert "auto_ingestion_pipeline" in body
    assert "update_workflow" in body
    workflow = body["update_workflow"]
    assert "steps" in workflow

