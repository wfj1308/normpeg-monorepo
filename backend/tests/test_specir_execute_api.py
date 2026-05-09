from __future__ import annotations

import pytest
from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.main import app


def _compaction_direct_input() -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": "P-SPECIR-EXEC-001",
        "compaction_degree": 96.5,
        "representative_value": 96.0,
        "actor_did": "did:test:specir-runner",
        "actor_name": "specir_runner",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def test_specir_execute_compaction_yaml_directly() -> None:
    client = TestClient(app)
    spec_id = "JTG_F80_1_2017.4.2.1.compaction"

    response = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": _compaction_direct_input(),
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == spec_id
    assert body["source"] == "specir"
    assert body["compiled_component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["spec_file"].endswith("4.2.1.compaction.spec.yaml")
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["branch_id"] == "main"
    assert body["spec_version"] == "v2.1.0"
    assert isinstance(body["compile_hash"], str) and len(body["compile_hash"]) == 64
    assert body["test_method"] == "T0921"
    assert "final_status" in body
    assert isinstance(body["gate"], dict)
    assert isinstance(body["path_outputs"], dict)
    assert isinstance(body["proof"], dict)
    assert body["proof"]["spec_anchor"]["spec_id"] == body["spec_id"]
    assert body["proof"]["spec_anchor"]["version"] == body["spec_version"]
    assert body["proof"]["spec_anchor"]["hash"] == body["compile_hash"]
    assert body["proof"]["canonical_payload"]["spec_anchor"]["hash"] == body["compile_hash"]


def test_specir_execute_t0921_test_method_spec_directly() -> None:
    client = TestClient(app)
    spec_id = "JTG_3450_2019.T0921"

    response = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": {
                "stake": "K15+200",
                "project_id": "P-SPECIR-T0921-001",
                "actor_did": "did:test:t0921-runner",
                "inspected_at": "2026-04-16T10:00:00Z",
                "sand_density": 1.45,
                "mass_hole_sand": 2900.0,
                "volume_ring": 1400.0,
                "moisture_content": 5.0,
                "max_dry_density": 1.95,
            },
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == spec_id
    assert body["source"] == "specir"
    assert body["component_id"] == spec_id
    assert body["spec_version"] == "v1.0.0"
    assert isinstance(body["compile_hash"], str) and len(body["compile_hash"]) == 64
    assert body["test_method"] == "T0921"
    assert body["path_outputs"]["compaction_degree"] > 0
    assert isinstance(body["proof"], dict)
    assert body["proof"]["spec_anchor"]["spec_id"] == spec_id
    assert body["proof"]["spec_anchor"]["hash"] == body["compile_hash"]


def test_specir_execute_deflection_yaml_directly() -> None:
    client = TestClient(app)
    spec_id = "JTG_F80_1_2017.4.2.2.deflection"

    response = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": {
                "project_id": "P-SPECIR-EXEC-DEFLECTION-001",
                "deflection": 170,
                "actor_did": "did:test:specir-runner-deflection",
                "inspected_at": "2026-04-16T10:00:00Z",
            },
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == spec_id
    assert body["source"] == "specir"
    assert body["compiled_component_id"] == spec_id
    assert body["component_id"] == spec_id
    assert body["final_status"] in {"PASS", "WARNING", "BLOCKED", "CRITICAL", "FAIL"}
    assert isinstance(body["gate"], dict)
    assert isinstance(body["path_outputs"], dict)
    assert isinstance(body["proof"], dict)


def test_specir_execute_thickness_yaml_directly() -> None:
    client = TestClient(app)
    spec_id = "JTG_F80_1_2017.4.2.3.thickness"

    response = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": {
                "project_id": "P-SPECIR-EXEC-THICKNESS-001",
                "layer_zone": "surface",
                "thickness": 210,
                "design_thickness": 200,
                "actor_did": "did:test:specir-runner-thickness",
                "inspected_at": "2026-04-16T10:00:00Z",
            },
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["spec_id"] == spec_id
    assert body["source"] == "specir"
    assert body["compiled_component_id"] == spec_id
    assert body["component_id"] == spec_id
    assert body["final_status"] in {"PASS", "WARNING", "BLOCKED", "CRITICAL", "FAIL"}
    assert isinstance(body["gate"], dict)
    assert isinstance(body["path_outputs"], dict)
    assert isinstance(body["proof"], dict)


def test_specir_execute_result_matches_original_component_on_key_fields() -> None:
    client = TestClient(app)
    component_id = "JTG_F80_1_2017.4.2.1.compaction"
    spec_id = "JTG_F80_1_2017.4.2.1.compaction"
    payload = _compaction_direct_input()
    payload["project_id"] = "P-SPECIR-EXEC-002"

    base_resp = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": component_id,
            "input": payload,
            "branch_id": "main",
        },
    )
    assert base_resp.status_code == 200
    base = base_resp.json()

    spec_resp = client.post(
        f"/api/v1/specir/execute/{spec_id}",
        json={
            "input": payload,
            "branch_id": "main",
        },
    )
    assert spec_resp.status_code == 200
    spec = spec_resp.json()

    assert spec["final_status"] == base["final_status"]
    assert spec["gate"]["summary_status"] == base["gate"]["summary_status"]
    assert spec["gate"]["failed_rule_ids"] == base["gate"]["failed_rule_ids"]
    assert spec["path_outputs"] == base["path_outputs"]

    base_proof = base.get("proof", {})
    spec_proof = spec.get("proof", {})
    assert isinstance(base_proof, dict)
    assert isinstance(spec_proof, dict)
    required_proof_fields = {
        "proof_hash",
        "canonical_payload",
        "chain_hash",
        "previous_chain_hash",
        "merkle_root",
        "proof_path",
    }
    assert required_proof_fields.issubset(set(base_proof.keys()))
    assert required_proof_fields.issubset(set(spec_proof.keys()))
    assert spec_proof.get("hash_method") == base_proof.get("hash_method")
    assert isinstance(spec_proof.get("proof_hash"), str) and spec_proof["proof_hash"]


def test_specir_execute_guide_endpoint_for_debug_flow() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/specir/execute/guide")
    assert response.status_code == 200
    body = response.json()
    assert "steps" in body and isinstance(body["steps"], list)
    assert "available_specs" in body and isinstance(body["available_specs"], list)
    assert "JTG_F80_1_2017.4.2.1.compaction" in body["available_specs"]


def test_builtin_component_execution_is_rejected_when_test_mode_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LAYERPEG_ALLOW_COMPONENT_ID_EXECUTION", "0")
    monkeypatch.setenv("LAYERPEG_ALLOW_BUILTIN_EXECUTION", "0")
    client = TestClient(app)

    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "input": {
                "stake": "K20+100",
                "project_id": "P-BUILTIN-REJECT-001",
                "surface_type": "asphalt",
                "flatness_measured": 8.5,
                "actor_did": "did:test:builtin-reject",
                "inspected_at": "2026-04-16T10:00:00Z",
            },
            "branch_id": "main",
        },
    )
    assert response.status_code == 400
    assert "direct component execution is disabled" in response.text


def test_specir_execution_still_works_when_direct_component_execution_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LAYERPEG_ALLOW_COMPONENT_ID_EXECUTION", "0")
    monkeypatch.setenv("LAYERPEG_ALLOW_BUILTIN_EXECUTION", "0")
    client = TestClient(app)

    response = client.post(
        "/api/v1/specir/execute/JTG_F80_1_2017.4.2.1.compaction",
        json={
            "input": _compaction_direct_input(),
            "branch_id": "main",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "specir"
    assert body["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
