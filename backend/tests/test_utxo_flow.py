from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.core.v_address import parse_v_address
from backend.app.main import app


def _create_project(client: TestClient, project_id: str) -> None:
    response = client.post(
        "/api/v1/project/create",
        json={
            "project_id": project_id,
            "catalog_id": "JTG_F80_1_2017",
            "selected_specs": ["4.2.1.compaction"],
        },
    )
    assert response.status_code == 200


def _compaction_input(project_id: str, *, inspected_at: str, degree: float) -> Dict[str, Any]:
    return {
        "project_id": project_id,
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "compaction_degree": degree,
        "representative_value": degree,
        "actor_did": "did:test:utxo",
        "inspected_at": inspected_at,
        "override_requested": False,
    }


def test_utxo_execute_produces_new_output_and_spends_previous_output() -> None:
    client = TestClient(app)
    project_id = "UTXO-FLOW-001"
    _create_project(client, project_id)

    first = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#current",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T10:00:00Z", degree=95.1),
        },
    )
    second = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#current",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T11:00:00Z", degree=96.3),
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200

    first_body = first.json()
    second_body = second.json()
    assert first_body["new_v_address"].startswith(f"v://{project_id}/K15+200")
    assert second_body["new_v_address"].startswith(f"v://{project_id}/K15+200")
    assert second_body["state_transition"]["input_utxo"] == first_body["state_transition"]["output_utxo"]

    project_utxo = client.get(f"/api/v1/utxo/{project_id}")
    assert project_utxo.status_code == 200
    outputs = project_utxo.json()["unspent_outputs"]
    first_output = next(item for item in outputs.values() if item["utxo_id"] == first_body["state_transition"]["output_utxo"])
    second_output = next(item for item in outputs.values() if item["utxo_id"] == second_body["state_transition"]["output_utxo"])
    assert first_output["consumed"] is True
    assert second_output["consumed"] is False


def test_fork_execution_does_not_change_main_utxo_lineage() -> None:
    client = TestClient(app)
    project_id = "UTXO-FLOW-002"
    fork_id = "fork-utxo-001"
    _create_project(client, project_id)

    baseline = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#main",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T10:00:00Z", degree=95.2),
        },
    )
    assert baseline.status_code == 200

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": fork_id, "reason": "fork-utxo"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/override",
            json={
                "project_id": project_id,
                "spec_id": "4.2.1.compaction",
                "branch_id": fork_id,
                "override": {"standard_by_zone": {"Z96": 97}},
            },
        ).status_code
        == 200
    )

    fork_exec = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#{fork_id}",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T11:00:00Z", degree=96.2),
        },
    )
    assert fork_exec.status_code == 200

    main_resolve = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200#main"})
    fork_resolve = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200#{fork_id}"})
    assert main_resolve.status_code == 200
    assert fork_resolve.status_code == 200
    assert main_resolve.json()["resolved_output"]["utxo_id"] == baseline.json()["state_transition"]["output_utxo"]
    assert fork_resolve.json()["resolved_output"]["utxo_id"] == fork_exec.json()["state_transition"]["output_utxo"]


def test_merge_promotes_fork_utxo_to_main_branch() -> None:
    client = TestClient(app)
    project_id = "UTXO-FLOW-003"
    fork_id = "fork-utxo-merge"
    _create_project(client, project_id)

    assert (
        client.post(
            "/api/v1/utxo/execute",
            json={
                "v_address": f"v://{project_id}/K15+200#main",
                "measured_item_id": "compaction",
                "input": _compaction_input(project_id, inspected_at="2026-04-16T10:00:00Z", degree=95.1),
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": fork_id, "reason": "merge-utxo"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/project/override",
            json={
                "project_id": project_id,
                "spec_id": "4.2.1.compaction",
                "branch_id": fork_id,
                "override": {"standard_by_zone": {"Z96": 97}},
            },
        ).status_code
        == 200
    )
    fork_exec = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#{fork_id}",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T11:00:00Z", degree=96.1),
        },
    )
    assert fork_exec.status_code == 200

    assert (
        client.post(
            "/api/v1/branch/submit-review",
            json={"project_id": project_id, "branch_id": fork_id, "actor_did": "did:test:reviewer"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/approve",
            json={"project_id": project_id, "branch_id": fork_id, "actor_did": "did:test:chief", "role": "chief"},
        ).status_code
        == 200
    )
    merge = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "branch_id": fork_id,
            "target_branch": "main",
            "decision": "ACCEPTED",
            "actor_did": "did:test:chief",
        },
    )
    assert merge.status_code == 200

    project_utxo = client.get(f"/api/v1/utxo/{project_id}")
    assert project_utxo.status_code == 200
    assert project_utxo.json()["current_state"]["status"] == "MERGED"

    resolved_main = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200#main"})
    assert resolved_main.status_code == 200
    resolved_output = resolved_main.json()["resolved_output"]
    assert resolved_output["payload"]["merged_from_branch"] == fork_id
    assert resolved_output["payload"]["branch_id"] == "main"


def test_v_address_resolve_supports_branch_time_and_version() -> None:
    client = TestClient(app)
    project_id = "UTXO-FLOW-004"
    _create_project(client, project_id)

    older = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#main",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T10:00:00Z", degree=95.1),
        },
    )
    newer = client.post(
        "/api/v1/utxo/execute",
        json={
            "v_address": f"v://{project_id}/K15+200#main",
            "measured_item_id": "compaction",
            "input": _compaction_input(project_id, inspected_at="2026-04-16T11:00:00Z", degree=96.1),
        },
    )
    assert older.status_code == 200
    assert newer.status_code == 200

    old_exec = older.json()["execution_result"]
    new_exec = newer.json()["execution_result"]
    old_ts = parse_v_address(old_exec["v_address"])["timestamp"]
    new_ts = parse_v_address(new_exec["v_address"])["timestamp"]
    middle_ts = int((old_ts + new_ts) / 2)
    old_hash = old_exec["proof"]["proof_hash"]

    default_resolve = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200#main"})
    version_resolve = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200?version={old_hash}#main"})
    time_resolve = client.get("/api/v1/utxo/resolve", params={"v": f"v://{project_id}/K15+200?time={middle_ts}#main"})

    assert default_resolve.status_code == 200
    assert version_resolve.status_code == 200
    assert time_resolve.status_code == 200
    assert default_resolve.json()["resolved_output"]["utxo_id"] == new_exec["output_utxo"]
    assert version_resolve.json()["resolved_output"]["utxo_id"] == old_exec["output_utxo"]
    assert time_resolve.json()["resolved_output"]["utxo_id"] == old_exec["output_utxo"]
