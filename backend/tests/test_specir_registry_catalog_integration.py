from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.main import app


def _flatness_input(project_id: str) -> Dict[str, Any]:
    return {
        "stake": "K20+100",
        "project_id": project_id,
        "surface_type": "asphalt",
        "flatness_measured": 8.5,
        "actor_did": "did:test:lisi",
        "inspected_at": "2026-04-16T12:00:00Z",
    }


def _compaction_input(project_id: str) -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": project_id,
        "compaction_degree": 96.5,
        "representative_value": 96.0,
        "actor_did": "did:test:specir",
        "actor_name": "specir",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def test_components_list_exposes_three_specir_components() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/components")
    assert response.status_code == 200
    items = response.json().get("items", [])
    assert isinstance(items, list)

    specir_items = [item for item in items if isinstance(item, dict) and item.get("source_type") == "specir"]
    assert len(specir_items) >= 3

    specir_ids = {str(item.get("spec_id", "")) for item in specir_items}
    assert {
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
    }.issubset(specir_ids)

    for item in items:
        assert "source_type" in item
        assert "source_file" in item
        assert "spec_id" in item


def test_catalog_components_include_source_fields() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/catalogs/JTG_F80_1_2017/components")
    assert response.status_code == 200
    items = response.json().get("items", [])
    assert isinstance(items, list) and len(items) > 0
    for item in items:
        assert "source_type" in item
        assert "source_file" in item
        assert "spec_id" in item


def test_catalog_components_include_deflection_and_thickness() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/catalogs/JTG_F80_1_2017/components")
    assert response.status_code == 200
    items = response.json().get("items", [])
    ids = {str(item.get("component_id", "")) for item in items if isinstance(item, dict)}
    assert "JTG_F80_1_2017.4.2.2.deflection" in ids
    assert "JTG_F80_1_2017.4.2.3.thickness" in ids


def test_builtin_and_specir_execution_can_coexist_without_conflict() -> None:
    client = TestClient(app)
    project_id = "P-SPECIR-BUILTIN-COEXIST-001"

    builtin_response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "input": _flatness_input(project_id),
            "branch_id": "main",
        },
    )
    assert builtin_response.status_code == 200
    builtin_body = builtin_response.json()
    assert builtin_body["component_id"] == "JTG_F80_1_2017.4.2.1.flatness"
    assert builtin_body["final_status"] == "PASS"

    specir_response = client.post(
        "/api/v1/specir/execute/JTG_F80_1_2017.4.2.1.compaction",
        json={
            "input": _compaction_input(project_id),
            "branch_id": "main",
        },
    )
    assert specir_response.status_code == 200
    specir_body = specir_response.json()
    assert specir_body["source"] == "specir"
    assert specir_body["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert specir_body["compiled_component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert specir_body["final_status"] in {"PASS", "WARNING", "BLOCKED", "CRITICAL", "FAIL"}
