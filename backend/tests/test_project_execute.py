from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.main import app


def _compaction_input(project_id: str) -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": project_id,
        "compaction_degree": 96.0,
        "representative_value": 96.0,
        "actor_did": "did:test:project-execute",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def test_project_execute_applies_override_96_to_97() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-001"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.1.compaction"],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/override",
            json={
                "project_id": project_id,
                "spec_id": "4.2.1.compaction",
                "override": {"standard_by_zone": {"Z96": 97}},
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["path_outputs"]["standard_value"] == 97.0
    assert body["final_status"] != "PASS"
    assert body["project_context"]["override_applied"] is True


def test_project_execute_rejects_spec_not_in_selected_specs() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-002"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.2.deflection"],
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id),
        },
    )
    assert response.status_code == 400
    assert "not selected in project" in response.text


def test_project_execute_branch_override_wins_over_main() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-003"
    fork_branch = "fork-design-change-001"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.1.compaction"],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/override",
            json={
                "project_id": project_id,
                "spec_id": "4.2.1.compaction",
                "branch_id": "main",
                "override": {"standard_by_zone": {"Z96": 96}},
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/fork",
            json={
                "project_id": project_id,
                "from_branch": "main",
                "new_branch_id": fork_branch,
                "reason": "design change",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/override",
            json={
                "project_id": project_id,
                "spec_id": "4.2.1.compaction",
                "branch_id": fork_branch,
                "override": {"standard_by_zone": {"Z96": 97}},
            },
        ).status_code
        == 200
    )

    main_response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "branch_id": "main",
            "input": _compaction_input(project_id),
        },
    )
    fork_response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "branch_id": fork_branch,
            "input": _compaction_input(project_id),
        },
    )
    assert main_response.status_code == 200
    assert fork_response.status_code == 200

    main_body = main_response.json()
    fork_body = fork_response.json()
    assert main_body["path_outputs"]["standard_value"] == 96.0
    assert fork_body["path_outputs"]["standard_value"] == 97.0
    assert main_body["final_status"] == "PASS"
    assert fork_body["final_status"] != "PASS"


def test_project_execute_auto_locates_measured_item_from_input() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-004"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.1.compaction"],
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "input": _compaction_input(project_id),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["project_context"]["resolved_measured_item_id"] == "compaction"
    assert body["project_context"]["auto_located"] is True


def test_project_execute_enforces_role_binding_for_measured_item() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-005"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.1.compaction"],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/role-bindings",
            json={
                "project_id": project_id,
                "bindings": [
                    {
                        "did": "did:test:authorized",
                        "measured_item_ids": ["compaction"],
                        "actions": ["execute"],
                    }
                ],
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id),
        },
    )
    assert response.status_code == 400
    assert "actor_did is not bound to measured item" in response.text


def test_project_execute_enforces_instrument_binding() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-006"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "selected_specs": ["4.2.1.compaction"],
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/instrument-bindings",
            json={
                "project_id": project_id,
                "bindings": [
                    {
                        "instrument_id": "SB_001",
                        "measured_item_ids": ["compaction"],
                        "start_stake": "K15+000",
                        "end_stake": "K20+000",
                        "valid_from": "2026-01-01T00:00:00Z",
                        "valid_to": "2026-12-31T23:59:59Z",
                    }
                ],
            },
        ).status_code
        == 200
    )

    missing_instrument = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id),
        },
    )
    assert missing_instrument.status_code == 400
    assert "instrument_id/deviceId is required" in missing_instrument.text

    payload = _compaction_input(project_id)
    payload["instrument_id"] = "SB_001"
    ok_response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "input": payload,
        },
    )
    assert ok_response.status_code == 200


def test_project_execute_returns_resolved_scope_in_project_context() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-EXEC-007"

    assert (
        client.post(
            "/api/v1/project/create",
            json={
                "project_id": project_id,
                "catalog_id": "JTG_F80_1_2017",
                "include_categories": ["subgrade", "pavement"],
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "input": _compaction_input(project_id),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "resolved_scope" in body["project_context"]
    scope = body["project_context"]["resolved_scope"]
    assert scope["selection_source"] == "category_scope"
    assert "subgrade" in scope["category_ids"]
    assert "pavement" in scope["category_ids"]
    assert scope["counts"]["specs"] >= 1
