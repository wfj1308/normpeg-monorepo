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
        "actor_did": "did:test:project-override",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def test_project_override_set_and_read_back() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-OVERRIDE-001"

    create = client.post(
        "/api/v1/project/create",
        json={
            "project_id": project_id,
            "catalog_id": "JTG_F80_1_2017",
            "selected_specs": ["4.2.1.compaction"],
        },
    )
    assert create.status_code == 200

    set_override = client.post(
        "/api/v1/project/override",
        json={
            "project_id": project_id,
            "spec_id": "4.2.1.compaction",
            "override": {"standard_by_zone": {"Z96": 97}},
        },
    )
    assert set_override.status_code == 200
    override_body = set_override.json()
    assert override_body["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert override_body["branch_id"] == "main"
    assert override_body["effective_override"]["standard_by_zone"]["Z96"] == 97

    get_project = client.get(f"/api/v1/project/{project_id}")
    assert get_project.status_code == 200
    project_body = get_project.json()
    assert (
        project_body["overrides_by_branch"]["main"]["JTG_F80_1_2017.4.2.1.compaction"]["standard_by_zone"]["Z96"] == 97
    )


def test_project_execute_fork_without_branch_override_falls_back_to_main_override() -> None:
    client = TestClient(app)
    project_id = "P-PROJECT-OVERRIDE-002"

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
                "new_branch_id": "fork-design-change-001",
                "reason": "test fallback",
            },
        ).status_code
        == 200
    )

    execute = client.post(
        "/api/v1/project/execute",
        json={
            "project_id": project_id,
            "measured_item_id": "compaction",
            "branch_id": "fork-design-change-001",
            "input": _compaction_input(project_id),
        },
    )
    assert execute.status_code == 200
    body = execute.json()
    assert body["path_outputs"]["standard_value"] == 96.0
