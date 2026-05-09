from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.main import app


def _compaction_input() -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": "P-CATALOG-EXEC-001",
        "compaction_degree": 96.5,
        "representative_value": 96.0,
        "actor_did": "did:test:catalog-exec",
        "actor_name": "catalog_exec",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def _pavement_compaction_input() -> Dict[str, Any]:
    return {
        "stake": "K18+100",
        "project_id": "P-CATALOG-EXEC-001",
        "layer_type": "base",
        "zone_type": "Z98",
        "compaction_degree": 98.3,
        "representative_value": 98.0,
        "actor_did": "did:test:pavement",
        "inspected_at": "2026-04-16T11:00:00Z",
    }


def _pile_strength_input() -> Dict[str, Any]:
    return {
        "stake": "K30+050",
        "project_id": "P-CATALOG-EXEC-001",
        "pile_no": "ZK-12",
        "concrete_grade": "C30",
        "compressive_strength": 32.5,
        "actor_did": "did:test:bridge",
        "inspected_at": "2026-04-16T12:00:00Z",
    }


def test_catalog_measured_item_maps_to_spec_id() -> None:
    client = TestClient(app)

    by_id = client.get("/api/v1/catalog/measured-item/compaction")
    assert by_id.status_code == 200
    by_id_body = by_id.json()
    assert by_id_body["item"]["measured_item_id"] == "compaction"
    assert by_id_body["item"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert [item["method_id"] for item in by_id_body["item"]["test_methods"]] == ["T0921", "T0923", "T0924"]

    by_spec = client.get("/api/v1/catalog/by-spec/4.2.1.compaction")
    assert by_spec.status_code == 200
    by_spec_body = by_spec.json()
    assert by_spec_body["item"]["measured_item_id"] == "compaction"
    assert by_spec_body["item"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"


def test_catalog_tree_returns_full_semantic_hierarchy() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/catalog/tree")
    assert response.status_code == 200
    body = response.json()

    assert body["catalog_id"] == "JTG_F80_1_2017"
    category = body["categories"][0]
    assert category["category_id"] == "subgrade"
    work_item = category["work_items"][0]
    assert work_item["work_item_id"] == "earthwork"
    compaction = next(item for item in work_item["measured_items"] if item["measured_item_id"] == "compaction")
    assert [method["method_id"] for method in compaction["test_methods"]] == ["T0921", "T0923", "T0924"]
    assert compaction["test_methods"][0]["spec_id"] == "JTG_3450_2019.T0921"
    category_ids = {item["category_id"] for item in body["categories"]}
    assert {"subgrade", "pavement", "bridge"}.issubset(category_ids)


def test_catalog_test_method_api_returns_context() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/catalog/test-method/T0921")
    assert response.status_code == 200
    body = response.json()

    assert body["item"]["method_id"] == "T0921"
    assert body["item"]["spec_id"] == "JTG_3450_2019.T0921"
    assert body["catalog_context"]["category_id"] == "subgrade"
    assert body["catalog_context"]["work_item_id"] == "earthwork"
    assert body["catalog_context"]["measured_item_id"] == "compaction"


def test_catalog_execute_returns_catalog_context() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/catalog/execute/compaction",
        json={
            "input": _compaction_input(),
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["source"] == "specir"
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["test_method"] == "T0921"
    assert "catalog_context" in body
    assert body["catalog_context"]["category_id"] == "subgrade"
    assert body["catalog_context"]["work_item_id"] == "earthwork"
    assert body["catalog_context"]["measured_item_id"] == "compaction"


def test_catalog_measured_item_to_test_method_to_spec_api_chain() -> None:
    client = TestClient(app)

    measured_resp = client.get("/api/v1/catalog/measured-item/compaction")
    assert measured_resp.status_code == 200
    measured_body = measured_resp.json()
    first_method = measured_body["item"]["test_methods"][0]
    assert first_method["method_id"] == "T0921"
    assert first_method["spec_id"] == "JTG_3450_2019.T0921"

    method_resp = client.get("/api/v1/catalog/test-method/T0921")
    assert method_resp.status_code == 200
    method_body = method_resp.json()
    assert method_body["item"]["spec_id"] == "JTG_3450_2019.T0921"

    spec_resp = client.get("/api/v1/specir/specs/JTG_3450_2019.T0921")
    assert spec_resp.status_code == 200
    spec_body = spec_resp.json()
    assert spec_body["spec_id"] == "JTG_3450_2019.T0921"
    assert spec_body["document"]["semantics"]["test_method"] == "T0921"


def test_catalog_execute_pavement_compaction_returns_context() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/catalog/execute/pavement_compaction",
        json={
            "input": _pavement_compaction_input(),
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["spec_id"] == "JTG_F80_1_2017.5.2.1.pavement_compaction"
    assert body["catalog_context"]["category_id"] == "pavement"
    assert body["catalog_context"]["work_item_id"] == "base_subbase"
    assert body["catalog_context"]["measured_item_id"] == "pavement_compaction"


def test_catalog_execute_bridge_strength_returns_context() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/catalog/execute/pile_concrete_strength",
        json={
            "input": _pile_strength_input(),
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["spec_id"] == "JTG_F80_1_2017.8.1.1.pile_concrete_strength"
    assert body["catalog_context"]["category_id"] == "bridge"
    assert body["catalog_context"]["work_item_id"] == "bored_pile"
    assert body["catalog_context"]["measured_item_id"] == "pile_concrete_strength"
