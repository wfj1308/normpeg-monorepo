from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.mapping_service import buildResponse, findContainers, parseStake, stakeToChainage


def _auth_client() -> TestClient:
    return TestClient(app, headers={"Authorization": "Bearer test-token"})


def test_mapping_helpers_minimal_flow() -> None:
    stake = parseStake("v:/cn.highway/dajin/subgrade/DB-01/K15+200")
    assert stake == "K15+200"

    chainage = stakeToChainage(stake)
    assert chainage == 15200

    containers = findContainers(chainage, [])
    assert containers == []


def test_mapping_helpers_support_query_and_fragment_vuri() -> None:
    stake = parseStake("v://P1/K15+200?layer=zone-96&time=1776333600#main")
    assert stake == "K15+200"


def test_mapping_resolve_returns_container_spec_and_pending_actions() -> None:
    client = _auth_client()

    response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload["location"]["stake"] == "K15+200"
    assert payload["location"]["absoluteChainage"] == 15200
    assert payload["location"]["projectOffset"] == 5200

    container = payload["containers"][0]
    assert container["containerId"] == "DB-01"
    assert container["type"] == "subgrade"
    assert container["state"] == "active"
    assert container["range"] == "K15+000~K16+000"

    assert payload["volumes"][0]["volumeId"] == "K15+200"
    assert payload["volumes"][0]["quantity"] == 1250.5

    spec_map = {item["spuId"]: item["formStatus"] for item in payload["activeSpecs"]}
    assert spec_map["highway.subgrade.compaction.4.2.1.soil@v1"] == "qualified"
    assert spec_map["highway.subgrade.deflection.4.2.2@v1"] == "pending"
    proof_map = {item["spuId"]: item["lastProof"] for item in payload["activeSpecs"]}
    assert proof_map["highway.subgrade.compaction.4.2.1.soil@v1"] == "0xabc123def456..."
    assert proof_map["highway.subgrade.deflection.4.2.2@v1"] is None

    assert payload["pendingActions"][0]["actionType"] == "deflection_test_required"
    assert payload["pendingActions"][0]["assignedTo"] == "did:peg:ins_002"


def test_mapping_resolve_supports_context_layer_filter() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {"layer": "zone-96", "time": "2026-04-17T10:00:00Z"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["volumes"]
    assert payload["volumes"][0]["volumeId"] == "K15+200"


def test_mapping_resolve_supports_context_time_and_version() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {
                "time": "2026-04-17T10:00:00Z",
                "version": "v1",
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["containers"][0]["state"] == "active"

    missing_version = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {"version": "v2"},
        },
    )
    assert missing_version.status_code == 200
    assert missing_version.json()["containers"] == []


def test_mapping_query_range_returns_items_with_filter() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/mapping/query-range",
        json={
            "startStake": "K15+000",
            "endStake": "K16+000",
            "filters": {"type": ["subgrade"], "state": ["active"]},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["range"]["startChainage"] == 15000
    assert payload["range"]["endChainage"] == 16000
    assert len(payload["items"]) >= 1
    assert all(item["type"] == "subgrade" for item in payload["items"])
    assert all(item["state"] == "active" for item in payload["items"])
    target_item = next((item for item in payload["items"] if item["containerId"] == "DB-01-K15+200"), None)
    assert isinstance(target_item, dict)
    assert target_item["activeSpecs"][0]["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"


def test_mapping_reverse_container_volume_form_and_proof() -> None:
    client = _auth_client()

    container_response = client.post(
        "/v1/mapping/reverse",
        json={"containerId": "DB-01-K15+200", "objectType": "container"},
    )
    assert container_response.status_code == 200
    container_payload = container_response.json()
    assert container_payload["ranges"][0]["startStake"] == "K15+200"
    assert container_payload["ranges"][0]["endStake"] == "K15+250"

    volume_response = client.post(
        "/v1/mapping/reverse",
        json={"containerId": "K15+200", "objectType": "volume"},
    )
    assert volume_response.status_code == 200
    volume_payload = volume_response.json()
    assert volume_payload["ranges"][0]["startStake"] == "K15+200"
    assert volume_payload["ranges"][0]["endStake"] == "K15+250"

    form_response = client.post(
        "/v1/mapping/reverse",
        json={"containerId": "highway.subgrade.compaction.4.2.1.soil@v1", "objectType": "form"},
    )
    assert form_response.status_code == 200
    form_payload = form_response.json()
    assert form_payload["ranges"][0]["containerId"] == "DB-01-K15+200"
    assert form_payload["ranges"][0]["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"

    proof_response = client.post(
        "/v1/mapping/reverse",
        json={"containerId": "0xabc123def456...", "objectType": "proof"},
    )
    assert proof_response.status_code == 200
    proof_payload = proof_response.json()
    assert proof_payload["ranges"][0]["containerId"] == "DB-01-K15+200"
    assert proof_payload["ranges"][0]["proofId"] == "0xabc123def456..."


def test_mapping_history_returns_window_items() -> None:
    client = _auth_client()
    response = client.get(
        "/v1/mapping/history",
        params={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "from": "2026-04-16T00:00:00Z",
            "to": "2026-04-20T00:00:00Z",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["location"]["stake"] == "K15+200"
    assert payload["items"]
    assert payload["items"][0]["containerId"] == "DB-01-K15+200"


def test_mapping_api_prefix_alias_endpoints() -> None:
    client = _auth_client()

    resolve_response = client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert resolve_response.status_code == 200
    assert resolve_response.json()["location"]["stake"] == "K15+200"

    history_response = client.get(
        "/api/v1/mapping/history",
        params={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "from": "2026-04-16T00:00:00Z",
            "to": "2026-04-20T00:00:00Z",
        },
    )
    assert history_response.status_code == 200
    assert history_response.json()["location"]["stake"] == "K15+200"


def test_mapping_sync_execution_updates_runtime_and_history() -> None:
    client = _auth_client()
    sync_response = client.post(
        "/api/v1/mapping/sync/execution",
        json={
            "execution": {
                "project_id": "TMAP",
                "component_id": "highway.subgrade.deflection.4.2.2@v1",
                "v_address": "v://TMAP/K99+001?layer=zone-96&version=v-sync-1#feature-a",
                "final_status": "FAIL",
                "lifecycle_status": "REJECTED",
                "proof": {"proof_hash": "0xproof-sync-001"},
                "input": {"inspected_at": "2026-04-21T09:00:00Z"},
            }
        },
    )
    assert sync_response.status_code == 200
    assert sync_response.json()["projectId"] == "TMAP"

    resolve_response = client.post(
        "/api/v1/mapping/resolve",
        json={
            "vuri": "v://TMAP/K99+001#feature-a",
            "context": {"version": "0xproof-sync-001"},
        },
    )
    assert resolve_response.status_code == 200
    payload = resolve_response.json()
    assert payload["containers"]
    assert payload["containers"][0]["branchId"] == "feature-a"
    assert payload["containers"][0]["state"] == "active"
    assert payload["activeSpecs"][0]["spuId"] == "highway.subgrade.deflection.4.2.2@v1"
    assert payload["activeSpecs"][0]["lastProof"] == "0xproof-sync-001"
    assert payload["pendingActions"][0]["actionType"] == "manual_review_required"

    history_response = client.get(
        "/api/v1/mapping/history",
        params={
            "vuri": "v://TMAP/K99+001?version=0xproof-sync-001#feature-a",
            "from": "2026-04-21T00:00:00Z",
            "to": "2026-04-22T00:00:00Z",
        },
    )
    assert history_response.status_code == 200
    history_payload = history_response.json()
    assert history_payload["items"]
    assert history_payload["items"][-1]["branchId"] == "feature-a"


def test_mapping_sync_execution_supports_branch_routing() -> None:
    client = _auth_client()
    main_sync = client.post(
        "/api/v1/mapping/sync/execution",
        json={
            "execution": {
                "project_id": "TMAP2",
                "component_id": "spu.main",
                "v_address": "v://TMAP2/K88+888?version=v-main#main",
                "final_status": "PASS",
                "lifecycle_status": "QUALIFIED",
                "proof": {"proof_hash": "0xmain"},
            }
        },
    )
    assert main_sync.status_code == 200

    feature_sync = client.post(
        "/api/v1/mapping/sync/execution",
        json={
            "execution": {
                "project_id": "TMAP2",
                "component_id": "spu.feature",
                "v_address": "v://TMAP2/K88+888?version=v-feature#feature-x",
                "final_status": "FAIL",
                "lifecycle_status": "REJECTED",
                "proof": {"proof_hash": "0xfeature"},
            }
        },
    )
    assert feature_sync.status_code == 200

    main_resolve = client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v://TMAP2/K88+888#main"},
    )
    assert main_resolve.status_code == 200
    assert main_resolve.json()["activeSpecs"][0]["spuId"] == "spu.main"

    feature_resolve = client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v://TMAP2/K88+888#feature-x"},
    )
    assert feature_resolve.status_code == 200
    assert feature_resolve.json()["activeSpecs"][0]["spuId"] == "spu.feature"


def test_mapping_export_and_upsert_endpoints() -> None:
    client = _auth_client()
    upsert_container = client.post(
        "/api/v1/mapping/upsert/container",
        json={
            "container": {
                "containerId": "MANUAL-C1",
                "projectId": "MANUAL",
                "branchId": "main",
                "stationStart": 77000,
                "stationEnd": 77010,
                "type": "bridge",
                "vuri": "v://MANUAL/K77+000#main",
                "runtime": {"state": "active"},
                "versions": ["v-manual-1"],
                "specs": [],
                "pendingActions": [],
                "history": [],
            }
        },
    )
    assert upsert_container.status_code == 200

    upsert_volume = client.post(
        "/api/v1/mapping/upsert/volume",
        json={
            "volume": {
                "volumeId": "MANUAL-V1",
                "containerId": "MANUAL-C1",
                "projectId": "MANUAL",
                "branchId": "main",
                "stationStart": 77000,
                "stationEnd": 77010,
                "layer": "zone-96",
                "quantity": 10,
                "geometry": {},
            }
        },
    )
    assert upsert_volume.status_code == 200

    export_response = client.get("/api/v1/mapping/export")
    assert export_response.status_code == 200
    payload = export_response.json()
    assert payload["containers"]
    assert payload["volumes"]


def test_build_response_shape() -> None:
    source = {
        "containerId": "DB-01-K15+200",
        "type": "subgrade",
        "vuri": "v:/cn.highway/dajin/subgrade/DB-01/container/K15+200",
        "runtime": {"state": "active"},
        "specs": [{"spuId": "a", "formStatus": "pending", "lastProof": None}],
        "pendingActions": [{"actionType": "todo", "deadline": "2026-04-20", "assignedTo": "did:peg:test"}],
    }
    item = buildResponse(source)
    assert item["container"]["containerId"] == "DB-01-K15+200"
    assert item["activeSpecs"][0]["spuId"] == "a"
    assert item["activeSpecs"][0]["lastProof"] is None
    assert item["pendingActions"][0]["actionType"] == "todo"
    assert item["pendingActions"][0]["assignedTo"] == "did:peg:test"
