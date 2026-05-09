from __future__ import annotations

from urllib.parse import quote

from fastapi.testclient import TestClient

from backend.app.main import app


def _slot_payload() -> dict:
    return {
        "geo": {
            "station": "K19+070",
            "chainage": 19070,
            "coords": {
                "x": 128.25,
                "y": 62.5,
            },
            "elevation": 135.4,
            "alignment": "A1",
        },
        "created_from": "api",
    }


def _create_slot(client: TestClient) -> dict:
    response = client.post("/api/v1/space/slot", json=_slot_payload())
    assert response.status_code == 200
    return response.json()["item"]


def _create_container(client: TestClient, slot_address: str, payload: dict) -> dict:
    response = client.post("/api/v1/space/container", json={"slot_address": slot_address, **payload})
    assert response.status_code == 200
    return response.json()["item"]


def _create_container_node(client: TestClient, container_id: str, spu_id: str) -> dict:
    response = client.post(f"/api/v1/container/{container_id}/node", json={"spuId": spu_id})
    assert response.status_code == 200
    return response.json()


def _complete_container_node(
    client: TestClient,
    container_id: str,
    node_id: str,
    *,
    status: str,
    proof: dict | None = None,
    force_rejected: bool = False,
) -> dict:
    response = client.post(
        f"/api/v1/container/{container_id}/node/{node_id}/complete",
        json={
            "status": status,
            "proof": proof,
            "force_rejected": force_rejected,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_create_space_slot_api() -> None:
    client = TestClient(app)
    item = _create_slot(client)
    assert isinstance(item["v_address"], str) and item["v_address"].startswith("v://space/slot/")
    assert item["slot_id"].startswith("slot-")
    assert item["slot_type"] == "geo_reference"
    assert item["geo"]["station"] == "K19+070"
    assert item["geo"]["coords"]["x"] == 128.25
    assert item["geo"]["x"] == 128.25
    assert item["geo"]["y"] == 62.5
    assert item["created_from"] == "api"
    assert item["is_static"] is True


def test_import_space_slots_api_with_rows() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/space/slot/import",
        json={
            "source_file": "design_file_k19.csv",
            "rows": [
                {
                    "station": "K19+070",
                    "chainage": 19070,
                    "x": 128.25,
                    "y": 62.5,
                    "elevation": 135.4,
                    "alignment": "A1",
                },
                {
                    "station": "K19+080",
                    "chainage": 19080,
                    "x": 130.0,
                    "y": 64.2,
                    "elevation": 135.6,
                    "alignment": "A1",
                },
            ],
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_file"] == "design_file_k19.csv"
    assert payload["count"] == 2
    assert payload["items"][0]["created_from"] == "design_file_k19.csv"
    assert payload["items"][0]["geo"]["station"] == "K19+070"
    assert payload["items"][1]["geo"]["station"] == "K19+080"


def test_import_space_slots_api_with_csv_content() -> None:
    client = TestClient(app)
    csv_content = "\n".join(
        [
            "station,chainage,X,Y,elevation,alignment",
            "K19+090,19090,131.7,65.1,135.8,A2",
            "K19+100,19100,133.2,66.0,136.0,A2",
        ]
    )
    response = client.post(
        "/api/v1/space/slot/import",
        json={
            "source_file": "cad_export_k19_090_100.csv",
            "csv_content": csv_content,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_file"] == "cad_export_k19_090_100.csv"
    assert payload["count"] == 2
    assert payload["items"][0]["geo"]["coords"]["x"] == 131.7
    assert payload["items"][1]["geo"]["coords"]["y"] == 66.0


def test_import_space_slots_api_requires_rows_or_csv() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/space/slot/import",
        json={
            "source_file": "design_file_k19.csv",
        },
    )
    assert response.status_code == 400
    assert "rows or csv_content is required" in response.json()["detail"]


def test_create_space_container_from_slot_api_backward_compatible_single_spu() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    item = _create_container(
        client,
        slot["v_address"],
        {
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inspector": "inspector_zhang",
            "supervisor": "supervisor_li",
        },
    )
    assert isinstance(item["v_address"], str) and item["v_address"].startswith("v://space/container/")
    assert isinstance(item["container_id"], str) and item["container_id"].startswith("container-")
    assert item["container_type"] == "execution_instance"
    assert item["geo_slot_ref"] == slot["v_address"]
    assert item["slot_ref"] == slot["v_address"]
    assert item["norm_execution"]["specs_bound"] == ["highway.subgrade.compaction.4.2.1.soil@v1"]
    assert item["norm_execution"]["current_state"] == "DRAFT"
    assert item["lifecycle_state"] == "DRAFT"
    assert item["locked"] is False
    assert item["nodes"] == []
    assert len(item["spec_bindings"]) == 1
    assert item["spec_bindings"][0]["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert item["trip_binding"]["inspector"] == "inspector_zhang"
    assert item["trip_binding"]["supervisor"] == "supervisor_li"
    assert item["geo_slot"]["geo"]["station"] == "K19+070"


def test_create_space_container_supports_slot_ref_alias_and_volume_ref() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    item = _create_container(
        client,
        slot["v_address"],
        {
            "slot_ref": slot["v_address"],
            "slot_address": None,
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "volume_ref": "v://space/volume/K19+070",
        },
    )
    assert item["geo_slot_ref"] == slot["v_address"]
    assert item["slot_ref"] == slot["v_address"]
    assert item["volume_ref"] == "v://space/volume/K19+070"
    container_id = quote(item["v_address"], safe="")
    node_payload = _create_container_node(client, container_id, "highway.subgrade.compaction.4.2.1.soil@v1")
    assert node_payload["node"]["volume_ref"] == "v://space/volume/K19+070"


def test_create_space_container_with_multiple_spu_bindings() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    item = _create_container(
        client,
        slot["v_address"],
        {
            "spuIds": [
                "highway.subgrade.compaction.4.2.1.soil@v1",
                "highway.subgrade.deflection.4.2.2@v1",
                "highway.subgrade.thickness.4.2.3@v1",
            ]
        },
    )
    assert item["norm_execution"]["specs_bound"] == [
        "highway.subgrade.compaction.4.2.1.soil@v1",
        "highway.subgrade.deflection.4.2.2@v1",
        "highway.subgrade.thickness.4.2.3@v1",
    ]
    assert [entry["spuId"] for entry in item["spec_bindings"]] == item["norm_execution"]["specs_bound"]
    assert all(entry["status"] == "DRAFT" for entry in item["spec_bindings"])
    assert item["can_archive"] is False


def test_container_lifecycle_supports_multi_attempts_per_spu() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    container = _create_container(
        client,
        slot["v_address"],
        {
            "spuIds": [
                "highway.subgrade.compaction.4.2.1.soil@v1",
                "highway.subgrade.deflection.4.2.2@v1",
            ]
        },
    )
    container_id = quote(container["v_address"], safe="")

    first_compaction_payload = _create_container_node(client, container_id, "highway.subgrade.compaction.4.2.1.soil@v1")
    first_compaction_node = first_compaction_payload["node"]
    assert first_compaction_node["spu_id"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert first_compaction_node["attempt_index"] == 1
    assert first_compaction_payload["container"]["lifecycle_state"] == "RUNNING"

    complete_first = _complete_container_node(
        client,
        container_id,
        quote(first_compaction_node["node_id"], safe=""),
        status="FAIL",
        proof={"result": {"field": "compactionDegree", "value": 90.1, "status": "FAIL"}},
    )
    assert complete_first["container"]["lifecycle_state"] == "RUNNING"

    second_compaction_payload = _create_container_node(client, container_id, "highway.subgrade.compaction.4.2.1.soil@v1")
    second_compaction_node = second_compaction_payload["node"]
    assert second_compaction_node["attempt_index"] == 2

    _complete_container_node(
        client,
        container_id,
        quote(second_compaction_node["node_id"], safe=""),
        status="PASS",
        proof={"result": {"field": "compactionDegree", "value": 95.8, "status": "PASS"}},
    )

    first_deflection_payload = _create_container_node(client, container_id, "highway.subgrade.deflection.4.2.2@v1")
    first_deflection_node = first_deflection_payload["node"]
    assert first_deflection_node["attempt_index"] == 1
    complete_deflection = _complete_container_node(
        client,
        container_id,
        quote(first_deflection_node["node_id"], safe=""),
        status="PASS",
        proof={"result": {"field": "deflection", "value": 2.3, "status": "PASS"}},
    )
    assert complete_deflection["container"]["lifecycle_state"] == "VALIDATED"

    container_get = client.get(f"/api/v1/container/{container_id}")
    assert container_get.status_code == 200
    item = container_get.json()["item"]
    assert item["lifecycle_state"] == "VALIDATED"
    assert item["can_archive"] is True
    assert item["node_history_by_spu"]["highway.subgrade.compaction.4.2.1.soil@v1"][0]["attempt_index"] == 1
    assert item["node_history_by_spu"]["highway.subgrade.compaction.4.2.1.soil@v1"][1]["attempt_index"] == 2
    assert item["node_history_by_spu"]["highway.subgrade.deflection.4.2.2@v1"][0]["attempt_index"] == 1
    binding_map = {entry["spuId"]: entry for entry in item["spec_bindings"]}
    assert binding_map["highway.subgrade.compaction.4.2.1.soil@v1"]["status"] == "PASS"
    assert binding_map["highway.subgrade.deflection.4.2.2@v1"]["status"] == "PASS"


def test_archive_requires_all_spu_pass_and_generates_multi_spec_proof() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    container = _create_container(
        client,
        slot["v_address"],
        {
            "spuIds": [
                "highway.subgrade.compaction.4.2.1.soil@v1",
                "highway.subgrade.deflection.4.2.2@v1",
            ]
        },
    )
    container_id = quote(container["v_address"], safe="")

    compaction = _create_container_node(client, container_id, "highway.subgrade.compaction.4.2.1.soil@v1")["node"]
    _complete_container_node(
        client,
        container_id,
        quote(compaction["node_id"], safe=""),
        status="PASS",
        proof={"result": {"field": "compactionDegree", "value": 95.8, "status": "PASS"}},
    )

    archive_before_all_pass = client.post(
        f"/api/v1/container/{container_id}/archive",
        json={"signatures": [{"role": "inspector"}]},
    )
    assert archive_before_all_pass.status_code == 400

    deflection = _create_container_node(client, container_id, "highway.subgrade.deflection.4.2.2@v1")["node"]
    _complete_container_node(
        client,
        container_id,
        quote(deflection["node_id"], safe=""),
        status="PASS",
        proof={"result": {"field": "deflection", "value": 2.3, "status": "PASS"}},
    )

    archive = client.post(
        f"/api/v1/container/{container_id}/archive",
        json={"signatures": [{"role": "inspector", "did": "did:test:inspector"}]},
    )
    assert archive.status_code == 200
    payload = archive.json()
    assert payload["container"]["lifecycle_state"] == "ARCHIVED"
    assert payload["container"]["locked"] is True
    assert payload["proof"]["container_id"] == container["v_address"]
    assert payload["proof"]["overall_status"] == "PASS"
    assert payload["proof"]["slot_ref"] == container["geo_slot_ref"]
    assert payload["proof"]["geo_slot_ref"] == container["geo_slot_ref"]
    assert payload["proof"]["volume_ref"] is None
    assert len(payload["proof"]["spec_results"]) == 2
    assert all(item["status"] == "PASS" for item in payload["proof"]["spec_results"])
    assert all(item["attempts"] >= 1 for item in payload["proof"]["spec_results"])
    assert len(payload["proof"]["signatures"]) == 1
    assert isinstance(payload["proof"]["archived_at"], str) and payload["proof"]["archived_at"]

    create_after_archive = client.post(
        f"/api/v1/container/{container_id}/node",
        json={"spuId": "highway.subgrade.compaction.4.2.1.soil@v1"},
    )
    assert create_after_archive.status_code == 400


def test_container_force_rejected_is_still_supported() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    container = _create_container(
        client,
        slot["v_address"],
        {
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
        },
    )
    container_id = quote(container["v_address"], safe="")

    created = _create_container_node(client, container_id, "highway.subgrade.compaction.4.2.1.soil@v1")
    node_id = quote(created["node"]["node_id"], safe="")
    completed = _complete_container_node(
        client,
        container_id,
        node_id,
        status="FAIL",
        force_rejected=True,
    )
    assert completed["container"]["lifecycle_state"] == "REJECTED"


def test_get_space_container_api_supports_v_address_path() -> None:
    client = TestClient(app)
    slot = _create_slot(client)
    container = _create_container(
        client,
        slot["v_address"],
        {
            "spuId": "highway.subgrade.thickness.4.2.3@v1",
        },
    )
    quoted_id = quote(container["v_address"], safe="")
    get_response = client.get(f"/api/v1/space/container/{quoted_id}")
    assert get_response.status_code == 200
    item = get_response.json()["item"]
    assert item["v_address"] == container["v_address"]
    assert item["geo_slot_ref"] == slot["v_address"]
    assert item["slot_ref"] == slot["v_address"]
    assert item["geo_slot"]["geo"]["station"] == "K19+070"
