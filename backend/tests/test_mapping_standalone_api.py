from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.mapping_api import app


def test_mapping_standalone_api_resolve_smoke() -> None:
    client = TestClient(app)
    response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["location"]["stake"] == "K15+200"
