from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def _gate_pass_inputs() -> dict:
    return {
        "massHoleSand": 2850.5,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def _gate_fail_inputs() -> dict:
    return {
        "massHoleSand": 2000,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def _create_slot(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/space/slot",
        json={
            "geo": {
                "station": "K19+999",
                "chainage": 19999,
                "coords": {"x": 1.0, "y": 2.0},
                "elevation": 3.0,
                "alignment": "A1",
            },
            "created_from": "gate-api-test",
        },
    )
    assert response.status_code == 200
    return response.json()["item"]


def _create_container(client: TestClient, slot_ref: str, spu_id: str) -> dict:
    response = client.post(
        "/api/v1/space/container",
        json={
            "slot_ref": slot_ref,
            "spuId": spu_id,
        },
    )
    assert response.status_code == 200
    return response.json()["item"]


def test_gate_evaluate_pass_returns_stable_executor_shape() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": _gate_pass_inputs(),
            "context": {"projectId": "gate-api-pass"},
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "PASS"
    assert payload["result"]["outcome"] == "PASS"
    assert payload["result"]["executionId"]
    assert isinstance(payload["matchedRules"], list)
    assert payload["explanation"]["code"] == "GATE_PASS"
    assert isinstance(payload["statePatch"], dict)
    assert isinstance(payload["proofFragment"], dict)
    assert payload["proofFragment"]["kind"] == "proofFragment"
    assert payload["proofFragment"]["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert payload["proofFragment"]["archiveStatus"] == "NOT_ARCHIVED"
    assert isinstance(payload["proofFragment"]["matchedRules"], list)
    assert isinstance(payload["proofFragment"]["timestamps"], dict)
    assert payload["finalProof"] is None

    # compatibility fields
    assert payload["executionId"]
    assert isinstance(payload["gateResults"], list)
    assert isinstance(payload["proof"], dict)


def test_gate_evaluate_fail_block_returns_block_outcome() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": _gate_fail_inputs(),
            "context": {"projectId": "gate-api-block"},
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "FAIL"
    assert payload["result"]["outcome"] == "BLOCK"
    assert payload["explanation"]["code"] == "GATE_BLOCKED"
    assert any(not bool(item.get("passed")) for item in payload["matchedRules"])


def test_gate_evaluate_requires_spu_id() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/gate/evaluate",
        json={
            "inputs": _gate_pass_inputs(),
            "context": {"projectId": "gate-api-missing"},
        },
    )
    assert response.status_code == 422


def test_gate_evaluate_dependency_unmet_returns_block_without_execution() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    container = _create_container(client, slot["v_address"], "highway.subgrade.deflection.4.2.2@v1")

    response = client.post(
        "/api/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "containerId": container["v_address"],
            "inputs": _gate_pass_inputs(),
            "context": {"projectId": "gate-api-dep"},
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["status"] == "FAIL"
    assert payload["result"]["executionId"] is None
    assert payload["result"]["outcome"] == "BLOCK"
    assert payload["explanation"]["code"] == "GATE_DEPENDENCY_UNMET"
    assert payload["proofFragment"]["status"] == "BLOCK"
    assert payload["proofFragment"]["kind"] == "proofFragment"
    assert payload["proofFragment"]["archiveStatus"] == "NOT_ARCHIVED"


def test_gate_preview_returns_executor_shape() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/gate/preview",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": _gate_pass_inputs(),
            "context": {"projectId": "gate-api-preview"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"PASS", "FAIL"}
    assert payload["result"]["outcome"] in {"PASS", "FAIL", "BLOCK"}
    assert isinstance(payload["matchedRules"], list)
