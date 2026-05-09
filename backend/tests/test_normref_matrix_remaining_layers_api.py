from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_asset_layer_boq_price_contract_endpoints() -> None:
    client = TestClient(app)

    boq_resp = client.get("/v1/boq/dajin-2024")
    assert boq_resp.status_code == 200
    boq_payload = boq_resp.json()
    assert boq_payload["projectId"] == "dajin-2024"
    assert "summary" in boq_payload

    calc_resp = client.post(
        "/v1/boq/calculate",
        json={
            "projectId": "dajin-2024",
            "currency": "CNY",
            "items": [
                {"itemId": "A-1", "description": "subgrade fill", "quantity": 10, "unit": "m3", "unitPrice": 98},
                {"itemId": "A-2", "description": "c30 concrete", "quantity": 2, "unit": "m3", "unitPrice": 420},
            ],
        },
    )
    assert calc_resp.status_code == 200
    calc_payload = calc_resp.json()
    assert calc_payload["status"] == "calculated"
    assert calc_payload["total"] == 1820.0

    price_resp = client.get("/v1/price/c30_concrete")
    assert price_resp.status_code == 200
    price_payload = price_resp.json()
    assert price_payload["material"] == "c30_concrete"
    assert price_payload["unitPrice"] > 0

    payment_resp = client.post(
        "/v1/contract/payment",
        json={
            "projectId": "dajin-2024",
            "contractId": "ct-001",
            "completedAmount": 12000,
            "claimedAmount": 10000,
            "retentionRate": 5,
            "requiredDocuments": ["inspection_report", "invoice"],
            "providedDocuments": ["inspection_report"],
        },
    )
    assert payment_resp.status_code == 200
    payment_payload = payment_resp.json()
    assert payment_payload["status"] == "rejected"
    assert "invoice" in payment_payload["missingDocuments"]


def test_identity_layer_did_trip_sign_endpoints() -> None:
    client = TestClient(app)

    register_resp = client.post(
        "/v1/did/register",
        json={"name": "inspector_1", "role": "inspector", "organization": "normref"},
    )
    assert register_resp.status_code == 200
    register_payload = register_resp.json()
    did = register_payload["did"]
    assert did.startswith("did:peg:inspector:")

    verify_resp = client.post("/v1/did/verify", json={"did": did})
    assert verify_resp.status_code == 200
    assert verify_resp.json()["valid"] is True

    trip_resp = client.post(
        "/v1/trip/check",
        json={"did": did, "action": "gate.evaluate", "resource": "v:/cn.highway/dajin/K15+200"},
    )
    assert trip_resp.status_code == 200
    trip_payload = trip_resp.json()
    assert trip_payload["allowed"] is True

    sign_payload = {"spuId": "highway.subgrade.compaction.4.2.1.soil@v1", "result": "PASS"}
    sign_resp = client.post(
        "/v1/sign/sign",
        json={"did": did, "payload": sign_payload, "purpose": "form_submit"},
    )
    assert sign_resp.status_code == 200
    sign_result = sign_resp.json()
    assert sign_result["signature"]

    sign_verify_resp = client.post(
        "/v1/sign/verify",
        json={"did": did, "payload": sign_payload, "signature": sign_result["signature"]},
    )
    assert sign_verify_resp.status_code == 200
    assert sign_verify_resp.json()["valid"] is True


def test_system_layer_webhook_sync_export_endpoints() -> None:
    client = TestClient(app)

    webhook_resp = client.post(
        "/v1/webhook/subscribe",
        json={"event": "state.changed", "callbackUrl": "https://example.com/hook", "secret": "demo"},
    )
    assert webhook_resp.status_code == 200
    webhook_payload = webhook_resp.json()
    assert webhook_payload["status"] == "active"
    assert webhook_payload["subscriptionId"]

    push_resp = client.post(
        "/v1/sync/push",
        json={
            "projectId": "dajin-2024",
            "deviceId": "device-A",
            "records": [{"type": "measurement", "stake": "K15+200", "value": 95.9}],
        },
    )
    assert push_resp.status_code == 200
    push_payload = push_resp.json()
    assert push_payload["status"] == "accepted"
    token = push_payload["nextToken"]

    pull_resp = client.post(
        "/v1/sync/pull",
        json={"projectId": "dajin-2024", "deviceId": "device-B", "lastToken": None},
    )
    assert pull_resp.status_code == 200
    pull_payload = pull_resp.json()
    assert pull_payload["pulled"] >= 1

    pull_again_resp = client.post(
        "/v1/sync/pull",
        json={"projectId": "dajin-2024", "deviceId": "device-B", "lastToken": token},
    )
    assert pull_again_resp.status_code == 200
    assert pull_again_resp.json()["pulled"] == 0

    export_resp = client.post(
        "/v1/export/project",
        json={"projectId": "dajin-2024", "format": "zip", "includeProofs": True, "includeMapping": True, "includeState": True},
    )
    assert export_resp.status_code == 200
    export_payload = export_resp.json()
    assert export_payload["status"] == "generated"
    assert export_payload["exportId"]
