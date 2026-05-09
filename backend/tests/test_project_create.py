from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app.main import app


def test_project_create_and_get_with_catalog_subset() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-001",
            "catalog_id": "JTG_F80_1_2017",
            "selected_specs": ["4.2.1.compaction", "4.2.2.deflection"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == "P-PROJECT-CREATE-001"
    assert body["catalog_id"] == "JTG_F80_1_2017"
    assert set(body["selected_specs"]) == {
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
    }
    assert body["selection_source"] == "explicit_specs"
    assert body["overrides_by_branch"]["main"] == {}

    get_response = client.get("/api/v1/project/P-PROJECT-CREATE-001")
    assert get_response.status_code == 200
    get_body = get_response.json()
    assert get_body["project_id"] == "P-PROJECT-CREATE-001"
    assert set(get_body["selected_specs"]) == set(body["selected_specs"])


def test_project_create_rejects_spec_outside_catalog_subset() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-002",
            "catalog_id": "JTG_F80_1_2017",
            "selected_specs": ["JTG_F80_1_2017.4.2.1.flatness"],
        },
    )
    assert response.status_code in {400, 404}
    assert "spec" in response.text.lower()


def test_project_create_by_category_scope_without_selected_specs() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-003",
            "catalog_id": "JTG_F80_1_2017",
            "include_categories": ["subgrade", "pavement", "bridge"],
            "exclude_categories": ["tunnel"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["selection_source"] == "category_scope"
    assert body["scope_filters"]["include_categories"] == ["subgrade", "pavement", "bridge"]
    assert set(body["selected_specs"]) == {
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
        "JTG_F80_1_2017.5.2.1.pavement_compaction",
        "JTG_F80_1_2017.8.1.1.pile_concrete_strength",
    }


def test_project_create_by_work_item_scope_and_exclusion() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-004",
            "catalog_id": "JTG_F80_1_2017",
            "include_work_items": ["earthwork", "base_subbase", "bored_pile"],
            "exclude_work_items": ["earthwork"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["selection_source"] == "work_item_scope"
    assert body["scope_filters"]["include_work_items"] == ["earthwork", "base_subbase", "bored_pile"]
    assert set(body["selected_specs"]) == {
        "JTG_F80_1_2017.5.2.1.pavement_compaction",
        "JTG_F80_1_2017.8.1.1.pile_concrete_strength",
    }


def test_project_get_returns_resolved_scope() -> None:
    client = TestClient(app)
    create_response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-005",
            "catalog_id": "JTG_F80_1_2017",
            "include_categories": ["subgrade", "pavement", "bridge"],
        },
    )
    assert create_response.status_code == 200
    body = create_response.json()
    assert "resolved_scope" in body
    assert body["resolved_scope"]["selection_source"] == "category_scope"
    assert set(body["resolved_scope"]["category_ids"]) == {"subgrade", "pavement", "bridge"}
    assert body["resolved_scope"]["counts"]["specs"] == len(body["selected_specs"])

    get_response = client.get("/api/v1/project/P-PROJECT-CREATE-005")
    assert get_response.status_code == 200
    get_body = get_response.json()
    assert "resolved_scope" in get_body
    assert get_body["resolved_scope"]["selection_source"] == "category_scope"
    assert set(get_body["resolved_scope"]["category_ids"]) == {"subgrade", "pavement", "bridge"}


def test_project_create_with_selected_specs_and_scope_is_mixed() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": "P-PROJECT-CREATE-006",
            "catalog_id": "JTG_F80_1_2017",
            "include_categories": ["subgrade", "pavement"],
            "selected_specs": ["4.2.1.compaction"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["selection_source"] == "mixed"
    assert body["selected_specs"] == ["JTG_F80_1_2017.4.2.1.compaction"]
