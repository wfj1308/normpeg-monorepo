from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_compare_norm_versions_by_spec_id() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/norm/version/compare",
        json={
            "old_spec_id": "JTG_F80_1_2017.4.2.1.compaction",
            "new_spec_id": "JTG_F80_1_2017.4.2.2.deflection",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "rule_diff" in body
    assert "gate_diff" in body
    assert "slot_diff" in body
    assert "impact_preview" in body
    assert "DTO" in body["impact_preview"]


def test_compare_norm_versions_by_raw_payload() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/norm/version/compare",
        json={
            "old_spec": {
                "spec_id": "demo.spec@v1",
                "inputs": {"input_dto": {"x": {"type": "number", "unit": "%"}}},
                "gate": {"rules": [{"rule_id": "r1", "condition": "x >= 95", "on_fail": "block"}]},
            },
            "new_spec": {
                "spec_id": "demo.spec@v2",
                "inputs": {"input_dto": {"x": {"type": "number", "unit": "%"}}},
                "gate": {"rules": [{"rule_id": "r1", "condition": "x >= 96", "on_fail": "block"}]},
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    modified_rules = body["rule_diff"]["modified"]
    assert len(modified_rules) == 1
    assert "threshold_changed" in modified_rules[0]["change_types"]
