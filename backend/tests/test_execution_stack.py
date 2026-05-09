from __future__ import annotations

from typing import Any, Dict

from fastapi.testclient import TestClient

from backend.app.core.expression_engine import evaluate_condition
from backend.app.core.gate_engine import GateEngine
from backend.app.core.input_validator import InputValidator
from backend.app.core.path_executor import PathExecutor
from backend.app.core.registry import ComponentRegistry
from backend.app.layer3.nl2gate import OpenAIAdapter
from backend.app.core.v_address_resolver import resolve_v_address_target
from backend.app.core.v_address import build_v_address, parse_v_address
import backend.app.main as main_module
from backend.app.main import app, project_utxo_service
from backend.app.services.project_utxo_service import add_output, consume_output, create_project_utxo, fork_branch, resolve_v_address


def _compaction_input() -> Dict[str, Any]:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": "P1",
        "compaction_degree": 94.0,
        "representative_value": 93.5,
        "actor_did": "did:test:zhangsan",
        "actor_name": "zhangsan",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def _flatness_input() -> Dict[str, Any]:
    return {
        "stake": "K20+100",
        "project_id": "P1",
        "surface_type": "asphalt",
        "flatness_measured": 8.5,
        "actor_did": "did:test:lisi",
        "inspected_at": "2026-04-16T12:00:00Z",
    }


def _flatness_input_for_project(project_id: str) -> Dict[str, Any]:
    payload = _flatness_input()
    payload["project_id"] = project_id
    return payload


def _compaction_pass_input() -> Dict[str, Any]:
    return {
        "stake": "K15+220",
        "layer_depth": "0-0.8m",
        "project_id": "P1",
        "compaction_degree": 95.0,
        "representative_value": 95.0,
        "actor_did": "did:test:wangwu",
        "actor_name": "wangwu",
        "inspected_at": "2026-04-16T10:10:00Z",
        "override_requested": False,
    }


def _compaction_raw_input() -> Dict[str, Any]:
    return {
        "stake": "K15+260",
        "layer_depth": "0-0.8m",
        "project_id": "P1",
        "actor_did": "did:test:zhaoliu",
        "actor_name": "zhaoliu",
        "inspected_at": "2026-04-16T10:20:00Z",
        "raw_data": {
            "sand_density": {"value": 1.45, "unit": "g/cm³"},
            "mass_hole_sand": {"value": 5700.0, "unit": "g"},
            "volume_ring": {"value": 2000.0, "unit": "cm³"},
            "moisture_content": {"value": 4.5, "unit": "%"},
            "max_dry_density": {"value": 1.95, "unit": "g/cm³"},
        },
        "override_requested": False,
    }


def _compaction_qualified_input() -> Dict[str, Any]:
    payload = _compaction_pass_input()
    payload["compaction_degree"] = 96.2
    payload["representative_value"] = 96.0
    return payload


def _compaction_rejected_input() -> Dict[str, Any]:
    return _compaction_input()


def _compaction_overridden_input() -> Dict[str, Any]:
    payload = _compaction_input()
    payload["override_requested"] = True
    payload["override_evidence"] = {
        "chief_engineer_did": "did:test:chief001",
        "evidence_id": "proof-ovr-001",
    }
    return payload


def _compaction_archived_input() -> Dict[str, Any]:
    payload = _compaction_qualified_input()
    payload["archive_requested"] = True
    return payload


def _segment_assessment_input() -> Dict[str, Any]:
    return {
        "project_id": "P1",
        "segment_id": "SEG-K15+200-K15+260",
        "segment_zone": "Z96",
        "layer_depth": "0-0.8m",
        "min_pass_rate": 1.0,
        "actor_did": "did:test:zhangsan",
        "actor_name": "zhangsan",
        "inspected_at": "2026-04-16T13:00:00Z",
        "points": [
            {"stake": "K15+200", "compaction_degree": 97.2, "representative_value": 97.2},
            {"stake": "K15+220", "compaction_degree": 97.0, "representative_value": 97.0},
            {"stake": "K15+240", "compaction_degree": 97.6, "representative_value": 97.6},
        ],
    }


def _deflection_input() -> Dict[str, Any]:
    return {
        "stake": "K20+100",
        "project_id": "P1",
        "road_class": "default",
        "deflection": 170,
        "actor_did": "did:test:deflection",
        "inspected_at": "2026-04-16T14:00:00Z",
    }


def _thickness_input() -> Dict[str, Any]:
    return {
        "stake": "K20+100",
        "project_id": "P1",
        "layer_zone": "surface",
        "thickness": 206,
        "design_thickness": 200,
        "actor_did": "did:test:thickness",
        "inspected_at": "2026-04-16T15:00:00Z",
    }


def _patch_payload() -> Dict[str, Any]:
    return {
        "patch_id": "patch-2026-04-16-z96-threshold",
        "component_id": "JTG_F80_1_2017.4.2.1.compaction",
        "target": "path.lookup_tables.standard_by_zone.Z96",
        "operation": "replace",
        "old_value": 95,
        "new_value": 96,
        "effective_date": "2026-04-16",
        "reason": "raise threshold for z96",
        "author": "did:test:quality-admin",
    }


def _override_payload() -> Dict[str, Any]:
    return {
        "override_id": "override-p1-z96-97",
        "component_id": "JTG_F80_1_2017.4.2.1.compaction",
        "project_id": "P1",
        "target": "path.lookup_tables.standard_by_zone.Z96",
        "value": 97,
        "approved_by": "did:test:chief-engineer",
        "evidence": {"doc_id": "ovr-doc-001"},
        "effective_date": "2026-04-16",
    }


def _sample_records() -> list[Dict[str, Any]]:
    return [
        {
            "record_id": "R001",
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "project_id": "P1",
            "path_outputs": {
                "zone_type": "Z96",
                "standard_value": 95,
                "compaction_degree_resolved": 95.5,
            },
        },
        {
            "record_id": "R002",
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "project_id": "P1",
            "path_outputs": {
                "zone_type": "Z94",
                "standard_value": 94,
                "compaction_degree_resolved": 94.3,
            },
        },
    ]


def _submit_review_and_approve(client: TestClient, project_id: str, branch_id: str) -> None:
    submit = client.post(
        "/api/v1/branch/submit-review",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:reviewer_001",
            "comment": "submit for review",
        },
    )
    assert submit.status_code == 200
    approve = client.post(
        "/api/v1/branch/approve",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:chief_engineer",
            "role": "chief_engineer",
            "comment": "approved",
        },
    )
    assert approve.status_code == 200


def _submit_review_and_reject(client: TestClient, project_id: str, branch_id: str) -> None:
    submit = client.post(
        "/api/v1/branch/submit-review",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:reviewer_001",
            "comment": "submit for review",
        },
    )
    assert submit.status_code == 200
    reject = client.post(
        "/api/v1/branch/reject",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:chief_engineer",
            "role": "chief_engineer",
            "comment": "rejected",
        },
    )
    assert reject.status_code == 200


def test_component_loading_from_registry() -> None:
    registry = ComponentRegistry()
    compaction = registry.get_component("JTG_F80_1_2017.4.2.1.compaction")
    flatness = registry.get_component("JTG_F80_1_2017.4.2.1.flatness")

    assert compaction["component_id"].endswith(".compaction")
    assert flatness["component_id"].endswith(".flatness")
    assert compaction["status"] == "active"
    assert "path" in compaction and "gate" in compaction
    assert "path" in flatness and "gate" in flatness


def test_path_executor_runs_component_dsl() -> None:
    registry = ComponentRegistry()
    component = registry.get_component("JTG_F80_1_2017.4.2.1.compaction")
    result = PathExecutor().execute(component=component, input_dto=_compaction_input())

    assert "normalized_input" in result
    assert "path_outputs" in result
    assert "path_trace" in result
    assert result["path_outputs"]["zone_type"] == "Z96"
    assert result["path_outputs"]["standard_value"] == 95.0
    assert result["path_outputs"]["compaction_degree_resolved"] == 94.0
    assert result["path_outputs"]["representative_value_resolved"] == 93.5


def test_path_executor_supports_t_distribution_95_aggregate() -> None:
    registry = ComponentRegistry()
    component = registry.get_component("JTG_F80_1_2017.4.2.1.compaction")
    input_payload = _compaction_input()
    input_payload["paragraph_values"] = [96.0, 95.5, 94.5, 95.0]
    input_payload.pop("representative_value", None)

    result = PathExecutor().execute(component=component, input_dto=input_payload)
    representative = float(result["path_outputs"]["paragraph_representative"])
    mean_value = sum(input_payload["paragraph_values"]) / len(input_payload["paragraph_values"])

    assert representative < mean_value
    assert result["path_outputs"]["representative_value_resolved"] == representative


def test_gate_engine_runs_rules_from_dsl() -> None:
    registry = ComponentRegistry()
    component = registry.get_component("JTG_F80_1_2017.4.2.1.compaction")
    path_result = PathExecutor().execute(component=component, input_dto=_compaction_input())

    gate_result = GateEngine().evaluate(
        component=component,
        normalized_input=path_result["normalized_input"],
        path_outputs=path_result["path_outputs"],
        runtime_context={},
    )

    assert gate_result["overall_status"] == "CRITICAL"
    assert len(gate_result["rule_hits"]) >= 4


def test_expression_engine_condition_output_shape() -> None:
    condition = "compaction_degree_resolved >= standard_value - tolerance"
    context = {
        "compaction_degree_resolved": 94.0,
        "standard_value": 95.0,
        "tolerance": 2.0,
    }
    result = evaluate_condition(condition, context)
    assert result["result"] is True
    assert result["computed_left"] == 94.0
    assert result["computed_right"] == 93.0
    assert isinstance(result["trace"], list)


def test_execute_component_api_returns_unified_result_and_proof_chain() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_input(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["project_id"] == "P1"
    assert isinstance(body["merkle_root"], str) and len(body["merkle_root"]) >= 16
    assert isinstance(body["proof_path"], list)
    assert body["proof"]["signature"]
    assert body["proof"]["proof_id"] == body["proof"]["proof_hash"]
    assert body["proof"]["project_id"] == "P1"
    assert body["proof"]["action"] == "EXECUTE"
    assert body["proof"]["component_id"] == body["component_id"]
    assert body["proof"]["execution_id"] == body["execution_id"]
    assert body["proof"]["branch_id"] == "main"
    assert body["proof"]["parent_branch"] is None
    assert isinstance(body["proof"]["fork_point"], str)
    assert body["proof"]["fork_reason"] == "genesis"
    assert isinstance(body["proof"]["main_chain_hash"], str)
    assert isinstance(body["proof"]["fork_chain_hash"], str)
    assert isinstance(body["proof"]["signatures"], list)
    assert body["proof"]["signatures"][0]["role"] == "executor"
    assert isinstance(body["proof"]["timestamp"], int)
    assert body["proof"]["proof_schema_version"] == "layerpeg.proof.v2"
    assert isinstance(body["proof"]["branch_history"], dict)
    assert isinstance(body["proof"]["workflow_history"], list)
    assert isinstance(body["proof"]["execution_context_hash"], str)
    assert len(body["proof"]["execution_context_hash"]) >= 16
    assert body["proof"]["merkle_root"] == body["merkle_root"]
    assert body["proof"]["proof_path"] == body["proof_path"]
    assert isinstance(body["proof"]["chain_merkle_root"], str)
    assert isinstance(body["proof"]["chain_proof_path"], list)
    assert isinstance(body["proof"]["merkle_root"], str)
    assert isinstance(body["proof"]["proof_path"], list)
    assert body["lifecycle_status"] in {"QUALIFIED", "REJECTED", "OVERRIDDEN", "ARCHIVED"}


def test_execute_component_api_supports_raw_data_mode() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_raw_input(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["final_status"] == "PASS"
    assert "wet_density" in body["path_outputs"]
    assert "dry_density" in body["path_outputs"]
    assert "compaction_degree_from_raw" in body["path_outputs"]
    assert body["normalized_input"]["input_mode"] == "raw_data_dto"


def test_input_validator_selects_resolved_mode_without_compaction_field() -> None:
    component = {
        "input_dto": {
            "project_id": {"type": "string", "required": True},
        },
        "raw_data_dto": {
            "project_id": {"type": "string", "required": True},
            "raw_data": {"type": "object", "required": True},
        },
        "resolved_value_dto": {
            "project_id": {"type": "string", "required": True},
            "strength_mpa": {"type": "number", "required": True},
        },
    }
    payload = {"project_id": "P1", "strength_mpa": 31.2}
    normalized = InputValidator().validate(component=component, input_payload=payload)
    assert normalized["input_mode"] == "resolved_value_dto"
    assert normalized["strength_mpa"] == 31.2


def test_execute_component_patch_then_override_merge_order() -> None:
    client = TestClient(app)
    payload = _compaction_qualified_input()
    payload["patches"] = [
        {
            "patch_id": "patch-runtime-96",
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "target": "path.lookup_tables.standard_by_zone.Z96",
            "operation": "replace",
            "old_value": 95.0,
            "new_value": 96.0,
            "effective_date": "2026-04-16",
            "reason": "runtime patch",
            "author": "did:test:quality-admin",
        }
    ]
    payload["overrides"] = [
        {
            "override_id": "override-runtime-97",
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "project_id": "P1",
            "target": "path.lookup_tables.standard_by_zone.Z96",
            "value": 97.0,
            "approved_by": "did:test:chief-engineer",
            "evidence": {"doc_id": "ovr-001"},
            "effective_date": "2026-04-16",
        }
    ]
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": payload,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["path_outputs"]["standard_value"] == 97.0
    trace = body["path_trace"][0]
    assert trace["merge_order"] == ["base_component", "patch", "branch_override"]
    assert trace["applied_items"][0]["stage"] == "patch"
    assert trace["applied_items"][1]["stage"] == "override"


def test_compaction_raw_data_validation_missing_field() -> None:
    client = TestClient(app)
    payload = _compaction_raw_input()
    payload["raw_data"].pop("mass_hole_sand")
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": payload,
        },
    )
    assert response.status_code == 400
    assert "raw_data_dto.raw_data.mass_hole_sand is required" in response.text


def test_compaction_resolved_value_validation_type_error() -> None:
    client = TestClient(app)
    payload = _compaction_input()
    payload["compaction_degree"] = "94.0"
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": payload,
        },
    )
    assert response.status_code == 400
    assert "compaction_degree must be number" in response.text


def test_compaction_raw_data_validation_unit_and_precision_error() -> None:
    client = TestClient(app)
    payload = _compaction_raw_input()
    payload["raw_data"]["sand_density"] = {"value": 1.4567, "unit": "kg/m3"}
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": payload,
        },
    )
    assert response.status_code == 400
    assert (
        "raw_data_dto.raw_data.sand_density.unit must be g/cm3" in response.text
        or "raw_data_dto.raw_data.sand_density.unit must be g/cm³" in response.text
    )


def test_catalog_list_and_detail_endpoints() -> None:
    client = TestClient(app)

    list_response = client.get("/api/v1/catalogs")
    assert list_response.status_code == 200
    items = list_response.json().get("items", [])
    assert isinstance(items, list)
    assert any(item["catalog_id"] == "JTG_F80_1_2017" for item in items)

    detail_response = client.get("/api/v1/catalogs/JTG_F80_1_2017")
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["catalog_id"] == "JTG_F80_1_2017"
    assert "catalog_name" in detail
    assert "components" in detail
    assert "dependencies" in detail
    assert "metadata" in detail


def test_catalog_components_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/catalogs/JTG_F80_1_2017/components")
    assert response.status_code == 200
    items = response.json().get("items", [])
    assert any(item["component_id"] == "JTG_F80_1_2017.4.2.1.compaction" for item in items)
    assert any(item["component_id"] == "JTG_F80_1_2017.4.2.1.flatness" for item in items)
    assert any(item["component_id"] == "JTG_F80_1_2017.4.2.1.compaction_segment_assessment" for item in items)


def test_execute_api_supports_second_component_without_engine_change() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "input": _flatness_input(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.flatness"
    assert body["final_status"] == "PASS"


def test_execute_api_supports_composable_component() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction_segment_assessment",
            "input": _segment_assessment_input(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["component_id"] == "JTG_F80_1_2017.4.2.1.compaction_segment_assessment"
    assert body["final_status"] == "PASS"
    assert "child_execution_results" in body["path_outputs"]
    assert "child_aggregates" in body["path_outputs"]
    assert body["path_outputs"]["child_aggregates"]["child_count"] == 3


def test_state_lifecycle_four_scenarios() -> None:
    client = TestClient(app)

    qualified = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "input": _compaction_qualified_input()},
    )
    rejected = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "input": _compaction_rejected_input()},
    )
    overridden = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "input": _compaction_overridden_input()},
    )
    archived = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "input": _compaction_archived_input()},
    )

    assert qualified.status_code == 200
    assert rejected.status_code == 200
    assert overridden.status_code == 200
    assert archived.status_code == 200

    q_body = qualified.json()
    r_body = rejected.json()
    o_body = overridden.json()
    a_body = archived.json()

    assert q_body["lifecycle_status"] == "QUALIFIED"
    assert r_body["lifecycle_status"] == "REJECTED"
    assert o_body["lifecycle_status"] == "OVERRIDDEN"
    assert a_body["lifecycle_status"] == "ARCHIVED"
    assert any(item["trigger"] == "remediation_path_triggered" for item in r_body["state_trace"])

    for body in [q_body, r_body, o_body, a_body]:
        for item in body["state_trace"]:
            assert "entered_at" in item
            assert "trigger" in item


def test_state_transition_api() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/state/transition",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "current_state": "VALIDATED",
            "trigger": "all_rules_pass",
            "meta": {"source": "test"},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["from_state"] == "VALIDATED"
    assert body["to_state"] == "QUALIFIED"
    assert body["trigger"] == "all_rules_pass"


def test_catalog_and_work_item_execute_api() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/execute/work-item",
        json={
            "catalog_id": "JTG_F80_1_2017",
            "work_item_id": "earthwork_subgrade",
            "project_id": "P1",
            "component_inputs": {
                "JTG_F80_1_2017.4.2.1.compaction": _compaction_pass_input(),
                "JTG_F80_1_2017.4.2.1.flatness": _flatness_input(),
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["catalog_id"] == "JTG_F80_1_2017"
    assert body["work_item_id"] == "earthwork_subgrade"
    assert body["overall_status"] == "PASS"


def test_specir_family_work_item_execute_api() -> None:
    client = TestClient(app)

    response = client.post(
        "/api/v1/execute/work-item",
        json={
            "catalog_id": "JTG_F80_1_2017",
            "work_item_id": "earthwork_subgrade_specir_family",
            "project_id": "P1",
            "component_inputs": {
                "JTG_F80_1_2017.4.2.1.compaction": _compaction_pass_input(),
                "JTG_F80_1_2017.4.2.2.deflection": _deflection_input(),
                "JTG_F80_1_2017.4.2.3.thickness": _thickness_input(),
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["catalog_id"] == "JTG_F80_1_2017"
    assert body["work_item_id"] == "earthwork_subgrade_specir_family"
    assert body["overall_status"] == "PASS"
    assert set(body["component_results"].keys()) >= {
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
    }


def test_layer3_query_strictly_wraps_execution_result() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 94% pass?",
            "project_id": "P1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["answer_mode"] == "single"
    assert body["branch_results"] == {}
    assert body["execution_request"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["execution_request"]["route"] == "unified_engine"
    assert body["main_result"]["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["main_result"]["source"] == "specir"
    assert body["execution_result"]["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert isinstance(body.get("proof"), dict)
    assert body["proof"]["rule_id"] == "subgrade.compaction"
    assert isinstance(body["proof"]["decision_path"], list)
    assert body["proof"]["rule_version"] == body["rule_version"]
    judgement_card = body.get("judgement_card")
    assert isinstance(judgement_card, dict)
    assert judgement_card["result_source"] == "executor"
    assert judgement_card["result"] in {"PASS", "FAIL"}
    assert isinstance(judgement_card.get("reason"), str) and judgement_card["reason"]
    rule_payload = judgement_card.get("rule")
    assert isinstance(rule_payload, dict)
    assert rule_payload["rule_id"] == "subgrade.compaction"
    basis_payload = judgement_card.get("normative_basis")
    assert isinstance(basis_payload, dict)
    assert basis_payload["source"] == "clause_store"
    assert basis_payload["clause_no"] == "4.2.1"
    assert isinstance(basis_payload.get("clause_content"), str) and basis_payload["clause_content"]
    assert "规范依据：" in body["answer"]
    assert "条款原文（可展开）：" in body["answer"]
    assert body["answer"]


def test_layer3_query_supports_multi_rule_executor_and_aggregates_overall() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "检查 K19+070 这个点是否满足路基验收要求，压实度96%，厚度206，弯沉200",
            "project_id": "P1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["execution_request"]["route"] == "unified_engine"
    assert body["execution_request"]["rule_ids"] == [
        "subgrade.compaction",
        "subgrade.thickness",
        "subgrade.deflection",
    ]
    assert body["aggregation"]["method"] == "all_items_pass_required"
    assert body["aggregation"]["ai_involved"] is False
    assert body["overall"] == "FAIL"
    item_results = {item["name"]: item["result"] for item in body["items"]}
    assert item_results["压实度"] == "PASS"
    assert item_results["厚度"] == "PASS"
    assert item_results["弯沉"] == "FAIL"
    assert isinstance(body.get("rule_results"), list) and len(body["rule_results"]) == 3


def test_layer3_query_supports_deflection_and_thickness_components() -> None:
    client = TestClient(app)

    deflection_resp = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K20+100 deflection 170 pass?",
            "project_id": "P1",
        },
    )
    assert deflection_resp.status_code == 200
    deflection_body = deflection_resp.json()
    assert deflection_body["execution_request"]["spec_id"] == "JTG_F80_1_2017.4.2.2.deflection"
    assert deflection_body["execution_result"]["component_id"] == "JTG_F80_1_2017.4.2.2.deflection"

    thickness_resp = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K20+120 thickness 206 design thickness 200 pass?",
            "project_id": "P1",
        },
    )
    assert thickness_resp.status_code == 200
    thickness_body = thickness_resp.json()
    assert thickness_body["execution_request"]["spec_id"] == "JTG_F80_1_2017.4.2.3.thickness"
    assert thickness_body["execution_result"]["component_id"] == "JTG_F80_1_2017.4.2.3.thickness"


def test_layer3_query_uses_specir_execution_chain_when_direct_component_execution_is_disabled(monkeypatch) -> None:
    monkeypatch.setenv("LAYERPEG_ALLOW_COMPONENT_ID_EXECUTION", "0")
    monkeypatch.setenv("LAYERPEG_ALLOW_BUILTIN_EXECUTION", "0")
    client = TestClient(app)

    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 94% pass?",
            "project_id": "P1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["execution_request"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert body["execution_request"]["route"] == "unified_engine"
    assert body["main_result"]["source"] == "specir"
    assert body["execution_result"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"


def test_layer3_query_rule_based_mode_stays_stable(monkeypatch) -> None:
    monkeypatch.setenv("NL2GATE_MODE", "rule_based")
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 94% pass?",
            "project_id": "P1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["adapter"]["parse"]["adapter_used"] == "rule_based"
    assert body["adapter"]["parse"]["fallback_used"] is False
    assert body["adapter"]["render"]["adapter_used"] == "rule_based"
    assert body["adapter"]["render"]["fallback_used"] is False


def test_unified_execute_endpoint_runs_through_single_rule_contract() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/engine/execute",
        json={
            "rule_id": "subgrade.compaction",
            "inputs": {
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
                "representative_value": 96.0,
                "actor_did": "did:test:unified",
                "inspected_at": "2026-04-16T10:00:00Z",
            },
            "context": {
                "project_id": "P-UNIFIED-001",
                "norm_version": "JTG_F80_1_2017",
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["rule_id"] == "subgrade.compaction"
    assert isinstance(body.get("result"), dict)
    assert isinstance(body.get("proof"), dict)
    assert body["result"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert isinstance(body.get("rule_version"), str) and body["rule_version"]
    assert isinstance(body["proof"].get("execution_id"), str)
    assert isinstance(body["proof"].get("timestamp"), str)
    assert body["proof"]["rule_id"] == "subgrade.compaction"
    assert body["proof"]["rule_version"] == body["rule_version"]
    assert isinstance(body["proof"].get("inputs"), dict)
    assert isinstance(body["proof"].get("result"), dict)
    assert isinstance(body["proof"].get("decision_path"), list)


def test_unified_execute_endpoint_rejects_rule_and_norm_version_mismatch() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/engine/execute",
        json={
            "rule_id": "subgrade.compaction",
            "inputs": {
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
            },
            "context": {
                "project_id": "P-UNIFIED-002",
                "norm_version": "JTG_3450_2019",
            },
        },
    )
    assert response.status_code == 400
    assert "rule_id/norm_version mismatch" in response.text


def test_layer3_query_returns_clarification_and_skips_engine_on_missing_params() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction pass?",
            "project_id": "P1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "NEED_MORE_INFO"
    assert body["needs_clarification"] is True
    assert body["engine_called"] is False
    assert body["execution_request"]["route"] == "skipped_clarification"
    assert body["proof"] is None
    assert body["rule_version"] is None
    assert "compactionDegree" in body["missing_fields"]
    assert isinstance(body.get("question"), str) and "压实度" in body["question"]
    assert "compaction_degree" not in body["question"]
    assert "compactionDegree" not in body["question"]
    assert "missing_params" in body["clarification_reasons"]
    assert any("请提供压实度数值" in item for item in body["clarification_questions"])
    assert isinstance(body.get("retrieval"), dict)
    assert body["retrieval"]["mapped_rule_ids"]


def test_layer3_query_blocks_execution_when_no_clause_found() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "alpha beta gamma qwerty",
            "project_id": "P1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "CLAUSE_NOT_FOUND"
    assert body["engine_called"] is False
    assert body["execution_result"] is None
    assert body["execution_request"]["route"] == "skipped_clause_retrieval"


def test_layer3_query_returns_clause_not_executable_when_no_rule_mapping() -> None:
    client = TestClient(app)
    parse_id = "parse_clause_no_rule_mapping_case"
    main_module.pdf_parse_runtime_store[parse_id] = {
        "parseId": parse_id,
        "status": "success",
        "extractedData": {
            "metadata": {
                "standardCode": "JTG-NO-RULE-2026",
                "normdocId": "JTG-NO-RULE-2026@@v1",
                "version": "v1",
                "publishStatus": "published",
            },
            "chapters": [
                {
                    "id": "9",
                    "title": "No rule chapter",
                    "clauses": [
                        {
                            "id": "9.9.9",
                            "clause": "9.9.9",
                            "title": "Special clause without executable rule",
                            "content": "This clause has no executable rule mapping yet.",
                            "keywords": ["special", "no-rule"],
                        }
                    ],
                }
            ],
        },
    }
    try:
        response = client.post(
            "/api/v1/layer3/query",
            json={
                "message": "请判断 JTG-NO-RULE-2026 第9.9.9条",
                "project_id": "P1",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "CLAUSE_NOT_EXECUTABLE"
        assert body["answer"] == "该条款尚未可执行化"
        assert body["engine_called"] is False
        assert body["execution_result"] is None
        assert body["execution_request"]["route"] == "skipped_clause_retrieval"
    finally:
        main_module.pdf_parse_runtime_store.pop(parse_id, None)


def test_layer3_query_session_state_tracks_multi_turn_missing_fields() -> None:
    client = TestClient(app)
    first_response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "这个点能验收吗？",
            "project_id": "P1",
        },
    )
    assert first_response.status_code == 200
    first_body = first_response.json()
    assert first_body["status"] == "NEED_MORE_INFO"
    assert isinstance(first_body.get("session_id"), str) and first_body["session_id"]
    assert isinstance(first_body.get("session_state"), dict)
    assert first_body["session_state"]["current_step"] == "awaiting_params"
    assert "inspectionPoint" in first_body["session_state"]["missing_fields"]
    assert "compactionDegree" in first_body["session_state"]["missing_fields"]
    assert "thickness" in first_body["session_state"]["missing_fields"]
    assert "deflection" in first_body["session_state"]["missing_fields"]


def test_layer3_query_session_continues_after_partial_supplement_without_reasking_known_fields() -> None:
    client = TestClient(app)
    first_response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "这个点能验收吗？",
            "project_id": "P1",
        },
    )
    assert first_response.status_code == 200
    first_body = first_response.json()
    session_id = first_body["session_id"]

    second_response = client.post(
        "/api/v1/layer3/query",
        json={
            "session_id": session_id,
            "message": "K19+070，压实度 96.7",
            "project_id": "P1",
        },
    )
    assert second_response.status_code == 200
    second_body = second_response.json()
    assert second_body["status"] == "NEED_MORE_INFO"
    assert second_body["session_id"] == session_id
    assert second_body["session_state"]["current_step"] == "awaiting_params"
    assert "thickness" in second_body["session_state"]["missing_fields"]
    assert "deflection" in second_body["session_state"]["missing_fields"]
    assert "inspectionPoint" not in second_body["session_state"]["missing_fields"]
    assert "compactionDegree" not in second_body["session_state"]["missing_fields"]

    final_response = client.post(
        "/api/v1/layer3/query",
        json={
            "session_id": session_id,
            "message": "厚度 18，弯沉 12。",
            "project_id": "P1",
        },
    )
    assert final_response.status_code == 200
    final_body = final_response.json()
    assert final_body.get("status") != "NEED_MORE_INFO"
    assert final_body["session_id"] == session_id
    assert final_body["session_state"]["current_step"] == "completed"
    assert final_body["session_state"]["missing_fields"] == []
    assert final_body["execution_request"]["rule_ids"] == [
        "subgrade.compaction",
        "subgrade.thickness",
        "subgrade.deflection",
    ]
    assert len(final_body["items"]) == 3
    assert final_body["overall"] in {"PASS", "FAIL"}


def test_layer3_query_openai_mode_switches_to_openai_adapter(monkeypatch) -> None:
    def fake_parse(self, raw_text: str, project_id: str | None = None):
        return {
            "intent": "validate",
            "target_v": f"v://{project_id or 'P1'}/K15+200",
            "component_hint": "JTG_F80_1_2017.4.2.1.compaction",
            "entities": {
                "project_id": project_id or "P1",
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
                "representative_value": 96.0,
            },
        }

    def fake_render(self, *, answer_mode, main_result, branch_results, merge_event=None):
        return f"openai-render:{answer_mode}:{main_result.get('final_status', 'UNKNOWN')}"

    monkeypatch.setenv("NL2GATE_MODE", "openai")
    monkeypatch.setattr(OpenAIAdapter, "parse_query", fake_parse)
    monkeypatch.setattr(OpenAIAdapter, "render_answer", fake_render)

    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 96.5 pass?",
            "project_id": "P-OPENAI-MODE-001",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["adapter"]["parse"]["adapter_used"] == "openai"
    assert body["adapter"]["parse"]["fallback_used"] is False
    assert body["adapter"]["render"]["adapter_used"] == "openai"
    assert body["adapter"]["render"]["fallback_used"] is False
    assert body["answer"].startswith("openai-render:")


def test_layer3_query_openai_mode_auto_fallback_to_rule_based(monkeypatch) -> None:
    monkeypatch.setenv("NL2GATE_MODE", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 94% pass?",
            "project_id": "P1",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["adapter"]["parse"]["adapter_used"] == "rule_based"
    assert body["adapter"]["parse"]["fallback_used"] is True
    assert "OPENAI_API_KEY" in str(body["adapter"]["parse"].get("fallback_reason", ""))
    assert body["adapter"]["render"]["adapter_used"] == "rule_based"
    assert body["adapter"]["render"]["fallback_used"] is True
    assert "OPENAI_API_KEY" in str(body["adapter"]["render"].get("fallback_reason", ""))


def test_layer3_query_resolves_v_address_current_branch() -> None:
    client = TestClient(app)
    project_id = "P-NL-VADDR-001"
    fork_id = "fork-nl-current"

    fork_response = client.post(
        "/api/v1/branch/fork",
        json={
            "project_id": project_id,
            "from_branch": "main",
            "new_branch_id": fork_id,
            "reason": "nl v-address routing",
        },
    )
    assert fork_response.status_code == 200

    message = f"check v://{project_id}/K15+200#current compaction 96.5% pass?"
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": message,
            "project_id": project_id,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["resolved_branch"] == fork_id
    assert body["execution_result"]["branch_id"] == fork_id
    assert body["v_address_resolution"]["branch_id"] == "current"
    assert body["v_address_resolution"]["resolved_branch"] == fork_id


def test_patch_analyze_api_returns_affected_records() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/patch/analyze",
        json={
            "patch": _patch_payload(),
            "records": _sample_records(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["update_target"] == "path.lookup_tables.standard_by_zone.Z96"
    assert len(body["affected_records"]) == 1
    assert body["requires_ack"] is True


def test_override_analyze_api_returns_affected_records() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/patch/analyze",
        json={
            "patch": _override_payload(),
            "records": _sample_records(),
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["change_type"] == "override"
    assert body["new_value"] == 97


def test_proof_anchor_create_and_query_api() -> None:
    client = TestClient(app)
    exec_response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )
    assert exec_response.status_code == 200
    proof_hash = exec_response.json()["proof"]["proof_hash"]

    create_response = client.post(
        "/api/v1/proof/anchor",
        json={
            "proof_hash": proof_hash,
            "anchor_type": "mock_anchor",
            "target_system": "local_mock_anchor_service",
            "external_ref": "mock://anchor/local/test-001",
        },
    )
    assert create_response.status_code == 200
    create_body = create_response.json()
    assert "item" in create_body
    assert create_body["item"]["proof_hash"] == proof_hash
    assert create_body["item"]["status"] == "ANCHORED"

    list_response = client.get(f"/api/v1/proof/{proof_hash}/anchors")
    assert list_response.status_code == 200
    list_body = list_response.json()
    assert list_body["proof_hash"] == proof_hash
    assert isinstance(list_body["items"], list)
    assert len(list_body["items"]) >= 1
    assert list_body["items"][0]["anchor_id"].startswith("anchor_")


def test_proof_anchor_api_rejects_invalid_anchor_type() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/proof/anchor",
        json={
            "proof_hash": "a2f6b3d8a5197cc1fca99d2f3ed9f1194f0fc43022f1d49598963cae8a90ac4e",
            "anchor_type": "unsupported_anchor",
            "target_system": "local_mock_anchor_service",
            "external_ref": None,
        },
    )
    assert response.status_code == 400
    assert "anchor schema validation failed" in response.text


def test_v_address_parse_and_build_round_trip() -> None:
    built = build_v_address(
        {
            "projectId": "GXX-2024-XXX",
            "stake": "K15+200",
            "layer": "subgrade",
            "timestamp": 1713196800,
        }
    )
    parsed = parse_v_address(built)

    assert built == "v://GXX-2024-XXX/K15+200?layer=subgrade&time=1713196800"
    assert parsed["projectId"] == "GXX-2024-XXX"
    assert parsed["stake"] == "K15+200"
    assert parsed["layer"] == "subgrade"
    assert parsed["timestamp"] == 1713196800


def test_v_address_parse_and_build_with_branch_fragment() -> None:
    built = build_v_address(
        {
            "projectId": "GXX-2024-XXX",
            "stake": "K15+200",
            "layer": "subgrade",
            "branch": "fork-design-change-001",
            "timestamp": 1713196800,
        }
    )
    parsed = parse_v_address(built)

    assert built == "v://GXX-2024-XXX/K15+200?layer=subgrade&time=1713196800#fork-design-change-001"
    assert parsed["projectId"] == "GXX-2024-XXX"
    assert parsed["stake"] == "K15+200"
    assert parsed["layer"] == "subgrade"
    assert parsed["branch"] == "fork-design-change-001"
    assert parsed["timestamp"] == 1713196800


def test_v_address_resolver_current_prefers_active_fork() -> None:
    branches = {
        "main": {"branch_id": "main", "status": "ACTIVE", "created_at": "2026-04-16T09:00:00Z"},
        "fork-a": {"branch_id": "fork-a", "status": "ACTIVE", "created_at": "2026-04-16T10:00:00Z"},
        "fork-b": {"branch_id": "fork-b", "status": "ACTIVE", "created_at": "2026-04-16T11:00:00Z"},
    }
    resolved = resolve_v_address_target(
        "v://P1/K15+200?layer=subgrade&time=1713196800#current",
        branches=branches,
        current_branch="main",
    )

    assert resolved["project_id"] == "P1"
    assert resolved["stake"] == "K15+200"
    assert resolved["branch_id"] == "current"
    assert resolved["resolved_branch"] == "fork-b"
    assert resolved["context"]["layer"] == "subgrade"
    assert resolved["context"]["time"] == 1713196800


def test_resolve_v_address_supports_current_branch_fragment() -> None:
    project_utxo = create_project_utxo("GXX-2024-CURRENT")
    project_utxo = fork_branch(project_utxo, from_branch="main", new_branch_id="fork-a", reason="test")
    project_utxo["current_branch"] = "fork-a"

    main_output = {
        "utxo_id": "utxo_main",
        "v_address": build_v_address(
            {
                "projectId": "GXX-2024-CURRENT",
                "stake": "K15+200",
                "layer": "subgrade",
                "branch": "main",
                "timestamp": 1713196800,
            }
        ),
        "type": "ComponentExecution",
        "state": "QUALIFIED",
        "payload": {"version": "hash_main", "proof_hash": "hash_main", "branch_id": "main"},
        "created_at": "2026-04-16T10:00:00Z",
        "consumed": False,
    }
    fork_output = {
        "utxo_id": "utxo_fork",
        "v_address": build_v_address(
            {
                "projectId": "GXX-2024-CURRENT",
                "stake": "K15+200",
                "layer": "subgrade",
                "branch": "fork-a",
                "timestamp": 1713200400,
            }
        ),
        "type": "ComponentExecution",
        "state": "QUALIFIED",
        "payload": {"version": "hash_fork", "proof_hash": "hash_fork", "branch_id": "fork-a"},
        "created_at": "2026-04-16T11:00:00Z",
        "consumed": False,
    }
    project_utxo = add_output(project_utxo, main_output)
    project_utxo = add_output(project_utxo, fork_output)

    current_items = resolve_v_address(project_utxo, "v://GXX-2024-CURRENT/K15+200#current")
    main_items = resolve_v_address(project_utxo, "v://GXX-2024-CURRENT/K15+200#main")

    assert len(current_items) == 1
    assert current_items[0]["utxo_id"] == "utxo_fork"
    assert len(main_items) == 1
    assert main_items[0]["utxo_id"] == "utxo_main"


def test_resolve_v_address_pure_function_with_default_timestamp_and_version_rules() -> None:
    project_utxo = create_project_utxo("GXX-2024-XXX")

    old_output = {
        "utxo_id": "utxo_old",
        "v_address": build_v_address(
            {
                "projectId": "GXX-2024-XXX",
                "stake": "K15+200",
                "layer": "subgrade",
                "timestamp": 1713196800,
            }
        ),
        "type": "ComponentExecution",
        "state": "QUALIFIED",
        "payload": {"version": "hash_old", "proof_hash": "hash_old"},
        "created_at": "2026-04-16T10:00:00Z",
        "consumed": False,
    }
    latest_output = {
        "utxo_id": "utxo_latest",
        "v_address": build_v_address(
            {
                "projectId": "GXX-2024-XXX",
                "stake": "K15+200",
                "layer": "subgrade",
                "timestamp": 1713200400,
            }
        ),
        "type": "ComponentExecution",
        "state": "QUALIFIED",
        "payload": {"version": "hash_new", "proof_hash": "hash_new"},
        "created_at": "2026-04-16T11:00:00Z",
        "consumed": False,
    }
    another_stake_output = {
        "utxo_id": "utxo_other",
        "v_address": build_v_address(
            {
                "projectId": "GXX-2024-XXX",
                "stake": "K20+100",
                "layer": "subgrade",
                "timestamp": 1713200400,
            }
        ),
        "type": "ComponentExecution",
        "state": "QUALIFIED",
        "payload": {"version": "hash_other", "proof_hash": "hash_other"},
        "created_at": "2026-04-16T11:00:00Z",
        "consumed": False,
    }

    project_utxo = add_output(project_utxo, old_output)
    project_utxo = add_output(project_utxo, latest_output)
    project_utxo = add_output(project_utxo, another_stake_output)
    project_utxo = consume_output(project_utxo, "utxo_old")

    default_items = resolve_v_address(project_utxo, "v://GXX-2024-XXX/K15+200")
    by_timestamp = resolve_v_address(project_utxo, "v://GXX-2024-XXX/K15+200?time=1713197000")
    by_version = resolve_v_address(project_utxo, "v://GXX-2024-XXX/K15+200?version=hash_old")

    assert len(default_items) == 1
    assert default_items[0]["utxo_id"] == "utxo_latest"
    assert len(by_timestamp) == 1
    assert by_timestamp[0]["utxo_id"] == "utxo_old"
    assert len(by_version) == 1
    assert by_version[0]["utxo_id"] == "utxo_old"


def test_execute_component_api_generates_v_address_and_binds_proof() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["v_address"].startswith("v://P1/K15+220")
    assert body["proof"]["v_address"] == body["v_address"]
    assert body["proof"]["canonical_payload"]["v_address"] == body["v_address"]


def test_execute_component_api_resolves_current_branch_from_v_address() -> None:
    client = TestClient(app)
    project_id = "P-VADDR-CURRENT-001"
    fork_id = "fork-design-change-001"

    fork_response = client.post(
        "/api/v1/branch/fork",
        json={
            "project_id": project_id,
            "from_branch": "main",
            "new_branch_id": fork_id,
            "reason": "address current branch routing",
        },
    )
    assert fork_response.status_code == 200

    input_payload = _compaction_pass_input()
    input_payload["project_id"] = project_id
    input_payload["v_address"] = f"v://{project_id}/K15+220#current"

    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": input_payload,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["branch_id"] == fork_id
    assert body["v_address_resolution"]["branch_id"] == "current"
    assert body["v_address_resolution"]["resolved_branch"] == fork_id
    assert body["v_address_resolution"]["stake"] == "K15+220"


def test_v_address_resolve_api_supports_default_timestamp_and_version_queries() -> None:
    client = TestClient(app)
    older = _compaction_pass_input()
    older["inspected_at"] = "2026-04-16T10:00:00Z"
    older["compaction_degree"] = 95.1
    older["representative_value"] = 95.1

    newer = _compaction_pass_input()
    newer["inspected_at"] = "2026-04-16T11:00:00Z"
    newer["compaction_degree"] = 96.4
    newer["representative_value"] = 96.4

    old_resp = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": older,
        },
    )
    new_resp = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": newer,
        },
    )
    assert old_resp.status_code == 200
    assert new_resp.status_code == 200

    old_body = old_resp.json()
    new_body = new_resp.json()
    old_hash = old_body["proof"]["proof_hash"]
    old_ts = parse_v_address(old_body["v_address"])["timestamp"]
    new_ts = parse_v_address(new_body["v_address"])["timestamp"]
    middle_ts = int((old_ts + new_ts) / 2)

    default_query = client.get("/api/v1/v-address/resolve", params={"v_address": "v://P1/K15+220"})
    version_query = client.get(
        "/api/v1/v-address/resolve",
        params={"v_address": f"v://P1/K15+220?version={old_hash}"},
    )
    timestamp_query = client.get(
        "/api/v1/v-address/resolve",
        params={"v_address": f"v://P1/K15+220?time={middle_ts}"},
    )

    assert default_query.status_code == 200
    assert version_query.status_code == 200
    assert timestamp_query.status_code == 200

    default_items = default_query.json()["items"]
    version_items = version_query.json()["items"]
    timestamp_items = timestamp_query.json()["items"]

    assert len(default_items) == 1
    assert default_items[0]["utxo_id"] == f"utxo_{new_body['execution_id']}"
    assert len(version_items) == 1
    assert version_items[0]["utxo_id"] == f"utxo_{old_body['execution_id']}"
    assert len(timestamp_items) == 1
    assert timestamp_items[0]["utxo_id"] == f"utxo_{old_body['execution_id']}"


def test_protocol_resolve_api_defaults_to_main_branch() -> None:
    client = TestClient(app)
    project_id = "P-RESOLVE-MAIN-001"
    payload = _compaction_pass_input()
    payload["project_id"] = project_id

    exec_response = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "input": payload},
    )
    assert exec_response.status_code == 200
    exec_body = exec_response.json()

    resolve_response = client.get("/api/v1/resolve", params={"v": f"v://{project_id}/K15+220"})
    assert resolve_response.status_code == 200
    body = resolve_response.json()
    assert body["project_id"] == project_id
    assert body["stake"] == "K15+220"
    assert body["branch_id"] == "main"
    assert body["resolved_branch"] == "main"
    assert body["resolved_execution_id"] == exec_body["execution_id"]
    assert body["proof_hash"] == exec_body["proof"]["proof_hash"]


def test_protocol_resolve_api_supports_current_branch_resolution() -> None:
    client = TestClient(app)
    project_id = "P-RESOLVE-CURRENT-001"
    fork_id = "fork-design-change-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={
                "project_id": project_id,
                "from_branch": "main",
                "new_branch_id": fork_id,
                "reason": "resolve current fork",
            },
        ).status_code
        == 200
    )

    main_payload = _compaction_pass_input()
    main_payload["project_id"] = project_id
    main_exec = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "branch_id": "main", "input": main_payload},
    )
    assert main_exec.status_code == 200

    fork_payload = _compaction_pass_input()
    fork_payload["project_id"] = project_id
    fork_exec = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "branch_id": fork_id, "input": fork_payload},
    )
    assert fork_exec.status_code == 200
    fork_body = fork_exec.json()

    resolve_response = client.get("/api/v1/resolve", params={"v": f"v://{project_id}/K15+220#current"})
    assert resolve_response.status_code == 200
    body = resolve_response.json()
    assert body["branch_id"] == "current"
    assert body["resolved_branch"] == fork_id
    assert body["resolved_execution_id"] == fork_body["execution_id"]


def test_protocol_resolve_api_supports_explicit_fork_branch() -> None:
    client = TestClient(app)
    project_id = "P-RESOLVE-FORK-001"
    fork_id = "fork-explicit-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={
                "project_id": project_id,
                "from_branch": "main",
                "new_branch_id": fork_id,
                "reason": "resolve explicit fork",
            },
        ).status_code
        == 200
    )

    fork_payload = _compaction_pass_input()
    fork_payload["project_id"] = project_id
    fork_exec = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "branch_id": fork_id, "input": fork_payload},
    )
    assert fork_exec.status_code == 200
    fork_body = fork_exec.json()

    resolve_response = client.get("/api/v1/resolve", params={"v": f"v://{project_id}/K15+220#{fork_id}"})
    assert resolve_response.status_code == 200
    body = resolve_response.json()
    assert body["branch_id"] == fork_id
    assert body["resolved_branch"] == fork_id
    assert body["resolved_execution_id"] == fork_body["execution_id"]


def test_protocol_resolve_api_supports_time_based_lookup() -> None:
    client = TestClient(app)
    project_id = "P-RESOLVE-TIME-001"

    old_payload = _compaction_pass_input()
    old_payload["project_id"] = project_id
    old_payload["inspected_at"] = "2026-04-16T10:00:00Z"
    old_payload["compaction_degree"] = 95.1
    old_payload["representative_value"] = 95.1
    old_response = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "branch_id": "main", "input": old_payload},
    )
    assert old_response.status_code == 200
    old_body = old_response.json()

    new_payload = _compaction_pass_input()
    new_payload["project_id"] = project_id
    new_payload["inspected_at"] = "2026-04-16T11:00:00Z"
    new_payload["compaction_degree"] = 96.4
    new_payload["representative_value"] = 96.4
    new_response = client.post(
        "/api/v1/execute/component",
        json={"component_id": "JTG_F80_1_2017.4.2.1.compaction", "branch_id": "main", "input": new_payload},
    )
    assert new_response.status_code == 200
    new_body = new_response.json()

    old_ts = parse_v_address(old_body["v_address"])["timestamp"]
    new_ts = parse_v_address(new_body["v_address"])["timestamp"]
    middle_ts = int((old_ts + new_ts) / 2)

    resolve_response = client.get(
        "/api/v1/resolve",
        params={"v": f"v://{project_id}/K15+220?time={middle_ts}"},
    )
    assert resolve_response.status_code == 200
    body = resolve_response.json()
    assert body["branch_id"] == "main"
    assert body["resolved_branch"] == "main"
    assert body["resolved_execution_id"] == old_body["execution_id"]
    assert body["proof_hash"] == old_body["proof"]["proof_hash"]


def test_branch_fork_override_then_execute_differs_from_main() -> None:
    client = TestClient(app)
    project_id = "BR-FORK-001"

    fork_response = client.post(
        "/api/v1/branch/fork",
        json={
            "project_id": project_id,
            "from_branch": "main",
            "new_branch_id": "fork-z96",
            "reason": "raise flatness strictness",
        },
    )
    assert fork_response.status_code == 200

    override_response = client.post(
        "/api/v1/branch/override",
        json={
            "project_id": project_id,
            "branch_id": "fork-z96",
            "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
            "value": 6.0,
        },
    )
    assert override_response.status_code == 200

    main_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    fork_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "fork-z96",
            "input": _flatness_input_for_project(project_id),
        },
    )

    assert main_exec.status_code == 200
    assert fork_exec.status_code == 200
    assert main_exec.json()["final_status"] == "PASS"
    assert fork_exec.json()["final_status"] == "BLOCKED"
    fork_body = fork_exec.json()
    assert fork_body["branch_id"] == "fork-z96"
    assert fork_body["effective_overrides"]["path.lookup_tables.standard_limit_by_surface.asphalt"] == 6.0
    assert fork_body["resolved_context"]["branch_id"] == "fork-z96"
    assert fork_body["resolved_context"]["parent_branch"] == "main"
    assert fork_body["resolved_context"]["fork_reason"] == "raise flatness strictness"
    assert fork_body["resolved_context"]["path"]["lookup_tables"]["standard_limit_by_surface"]["asphalt"] == 6.0
    assert fork_body["proof"]["branch_id"] == "fork-z96"
    assert fork_body["proof"]["parent_branch"] == "main"
    assert fork_body["proof"]["fork_reason"] == "raise flatness strictness"
    assert isinstance(fork_body["proof"]["execution_context_hash"], str)
    assert parse_v_address(fork_body["v_address"])["branch"] == "fork-z96"


def test_branch_override_can_patch_gate_rule_threshold() -> None:
    client = TestClient(app)
    project_id = "BR-GATE-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-gate", "reason": "tighten gate"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-gate",
                "target_path": "gate.rules.0.condition.expected",
                "value": 7.0,
            },
        ).status_code
        == 200
    )

    main_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    fork_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "fork-gate",
            "input": _flatness_input_for_project(project_id),
        },
    )

    assert main_exec.status_code == 200
    assert fork_exec.status_code == 200
    assert main_exec.json()["final_status"] == "PASS"
    assert fork_exec.json()["final_status"] == "BLOCKED"
    fork_body = fork_exec.json()
    assert fork_body["resolved_context"]["gate"]["rules"][0]["condition"]["expected"] == 7.0


def test_compare_branches_api_returns_comparisons_and_diff() -> None:
    client = TestClient(app)
    project_id = "BR-COMPARE-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-compare", "reason": "compare"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-compare",
                "target_path": "path.lookup_tables.standard_by_zone.Z96",
                "value": 97.0,
            },
        ).status_code
        == 200
    )

    input_payload = _compaction_qualified_input()
    input_payload["project_id"] = project_id

    response = client.post(
        "/api/v1/execute/component/compare-branches",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": input_payload,
            "branches": ["main", "fork-compare"],
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert "main" in body["comparisons"]
    assert "fork-compare" in body["comparisons"]
    assert body["comparisons"]["main"]["final_status"] == "PASS"
    assert body["comparisons"]["fork-compare"]["final_status"] != "PASS"
    assert "standard_value" in body["diff"]
    assert body["diff"]["standard_value"]["values"]["main"] == 95.0
    assert body["diff"]["standard_value"]["values"]["fork-compare"] == 97.0
    assert "final_status" in body["diff"]


def test_compare_branches_alias_api_returns_results_and_status() -> None:
    client = TestClient(app)
    project_id = "BR-COMPARE-ALIAS-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-compare-alias", "reason": "compare"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-compare-alias",
                "target_path": "path.lookup_tables.standard_by_zone.Z96",
                "value": 97.0,
            },
        ).status_code
        == 200
    )

    input_payload = _compaction_qualified_input()
    input_payload["project_id"] = project_id

    response = client.post(
        "/api/v1/execute/component/compare",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": input_payload,
            "branches": ["main", "fork-compare-alias"],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "results" in body
    assert body["results"]["main"]["final_status"] == "PASS"
    assert body["results"]["fork-compare-alias"]["final_status"] != "PASS"
    assert body["result_status"]["main"] == "PASS"
    assert body["current_branch"] == "main"
    assert "fork-compare-alias" in body["active_forks"]


def test_branch_fork_api_accepts_branch_id_field() -> None:
    client = TestClient(app)
    project_id = "BR-FORK-FIELD-001"
    response = client.post(
        "/api/v1/branch/fork",
        json={
            "project_id": project_id,
            "from_branch": "main",
            "branch_id": "fork-field",
            "reason": "branch_id field compatibility",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["branches"]["fork-field"]["branch_id"] == "fork-field"
    assert "fork-field" in body["active_forks"]


def test_branch_workflow_submit_review_approve_and_merge() -> None:
    client = TestClient(app)
    project_id = "BR-WF-APPROVE-001"
    branch_id = "fork-wf-approve"

    fork_response = client.post(
        "/api/v1/branch/fork",
        json={
            "project_id": project_id,
            "from_branch": "main",
            "new_branch_id": branch_id,
            "reason": "workflow test",
            "created_by": "did:peg:designer_001",
        },
    )
    assert fork_response.status_code == 200
    assert fork_response.json()["branches"][branch_id]["status"] == "FORK_CREATED"

    submit_response = client.post(
        "/api/v1/branch/submit-review",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:reviewer_001",
            "comment": "submit",
        },
    )
    assert submit_response.status_code == 200
    assert submit_response.json()["branches"][branch_id]["status"] == "UNDER_REVIEW"

    approve_response = client.post(
        "/api/v1/branch/approve",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "actor_did": "did:peg:chief_engineer",
            "role": "chief_engineer",
            "comment": "approve",
        },
    )
    assert approve_response.status_code == 200
    approved_branch = approve_response.json()["branches"][branch_id]
    assert approved_branch["status"] == "APPROVED"
    assert approved_branch["approvals"][-1]["decision"] == "APPROVE"

    merge_response = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "target_branch": "main",
            "decision": "ACCEPTED",
            "operator": "did:peg:chief_engineer",
        },
    )
    assert merge_response.status_code == 200
    assert merge_response.json()["branches"][branch_id]["status"] == "MERGED"


def test_branch_workflow_reject_then_abandon() -> None:
    client = TestClient(app)
    project_id = "BR-WF-REJECT-001"
    branch_id = "fork-wf-reject"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": branch_id, "reason": "wf reject"},
        ).status_code
        == 200
    )

    merge_without_approval = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "target_branch": "main",
            "decision": "ACCEPTED",
            "operator": "did:peg:chief_engineer",
        },
    )
    assert merge_without_approval.status_code == 400
    assert "must be APPROVED before merge" in merge_without_approval.text

    _submit_review_and_reject(client, project_id, branch_id)
    listed = client.get(f"/api/v1/project/{project_id}/branches")
    assert listed.status_code == 200
    assert listed.json()["branches"][branch_id]["status"] == "REJECTED"

    abandon = client.post(
        "/api/v1/branch/abandon",
        json={"project_id": project_id, "branch_id": branch_id, "operator": "did:peg:chief_engineer"},
    )
    assert abandon.status_code == 200
    assert abandon.json()["branches"][branch_id]["status"] == "ABANDONED"


def test_branch_merge_changes_main_result() -> None:
    client = TestClient(app)
    project_id = "BR-MERGE-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-merge", "reason": "temp"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-merge",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_approve(client, project_id, "fork-merge")

    before_merge = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    assert before_merge.status_code == 200
    assert before_merge.json()["final_status"] == "PASS"

    merge_response = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "branch_id": "fork-merge",
            "target_branch": "main",
            "decision": "ACCEPTED",
            "operator": "did:peg:chief_engineer",
        },
    )
    assert merge_response.status_code == 200
    merge_body = merge_response.json()
    assert merge_body["branches"]["fork-merge"]["status"] == "MERGED"
    assert merge_body["branches"]["fork-merge"]["merge_info"]["decision"] == "ACCEPTED"
    assert merge_body["branches"]["fork-merge"]["merge_info"]["merged_by"] == "did:peg:chief_engineer"

    after_merge = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    assert after_merge.status_code == 200
    assert after_merge.json()["final_status"] == "BLOCKED"


def test_branch_merge_api_supports_source_branch_actor_did_and_emits_decision_proof() -> None:
    client = TestClient(app)
    project_id = "BR-MERGE-API-001"
    source_branch = "fork-merge-proof"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": source_branch, "reason": "api"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": source_branch,
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_approve(client, project_id, source_branch)

    response = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "source_branch": source_branch,
            "target_branch": "main",
            "decision": "ACCEPTED",
            "actor_did": "did:peg:chief_engineer",
        },
    )
    assert response.status_code == 200
    body = response.json()
    proof = body["decision_proof"]
    assert proof["action"] == "MERGE"
    assert proof["project_id"] == project_id
    assert proof["branch_id"] == source_branch
    assert proof["parent_branch"] == "main"
    assert proof["source_branch"] == source_branch
    assert proof["target_branch"] == "main"
    assert proof["fork_reason"] == "api"
    assert proof["decision"] == "ACCEPTED"
    assert proof["actor_did"] == "did:peg:chief_engineer"
    assert proof["component_id"] == "__branch_decision__"
    assert isinstance(proof["execution_id"], str) and proof["execution_id"].startswith("branch_decision_merge")
    assert isinstance(proof["proof_id"], str) and proof["proof_id"] == proof["proof_hash"]
    assert proof["hash_method"] == "sha256"
    assert isinstance(proof["main_chain_hash"], str)
    assert isinstance(proof["fork_chain_hash"], str)
    assert isinstance(proof["signatures"], list) and len(proof["signatures"]) >= 1
    assert proof["signatures"][0]["did"] == "did:peg:chief_engineer"
    assert isinstance(proof["timestamp"], int)
    assert isinstance(proof["proof_hash"], str) and len(proof["proof_hash"]) >= 16
    assert isinstance(proof["chain_hash"], str)
    assert isinstance(proof["merkle_root"], str)
    assert isinstance(proof["proof_path"], list)
    assert isinstance(proof["workflow_history"], list)
    assert body["branches"][source_branch]["merge_info"]["decision_proof_hash"] == proof["proof_hash"]

    project = project_utxo_service.get_project_utxo(project_id)
    assert project["current_state"]["status"] == "MERGED"


def test_branch_merge_accept_updates_main_and_proof_metadata() -> None:
    client = TestClient(app)
    project_id = "BR-MERGE-PROOF-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={
                "project_id": project_id,
                "from_branch": "main",
                "new_branch_id": "fork-design-change-001",
                "reason": "设计变更#DC-001",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-design-change-001",
                "target_path": "path.lookup_tables.standard_by_zone.Z96",
                "value": 97.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_approve(client, project_id, "fork-design-change-001")

    payload = _compaction_qualified_input()
    payload["project_id"] = project_id
    payload["stake"] = "K15+200"
    payload["compaction_degree"] = 96.5
    payload["representative_value"] = 96.5

    before_main = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "branch_id": "main",
            "input": payload,
        },
    )
    assert before_main.status_code == 200
    assert before_main.json()["final_status"] == "PASS"

    before_fork = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "branch_id": "fork-design-change-001",
            "input": payload,
        },
    )
    assert before_fork.status_code == 200
    assert before_fork.json()["final_status"] != "PASS"

    merge_response = client.post(
        "/api/v1/branch/merge",
        json={
            "project_id": project_id,
            "branch_id": "fork-design-change-001",
            "target_branch": "main",
            "decision": "ACCEPTED",
            "operator": "did:peg:chief_engineer",
        },
    )
    assert merge_response.status_code == 200
    merge_body = merge_response.json()
    assert merge_body["branches"]["fork-design-change-001"]["status"] == "MERGED"
    assert merge_body["branches"]["main"]["overrides"]["path.lookup_tables.standard_by_zone.Z96"] == 97.0

    after_main = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "branch_id": "main",
            "input": payload,
        },
    )
    assert after_main.status_code == 200
    after_body = after_main.json()
    assert after_body["final_status"] != "PASS"
    assert after_body["path_outputs"]["standard_value"] == 97.0
    assert after_body["proof"]["merge_decision"] == "ACCEPTED"
    assert after_body["proof"]["merged_by"] == "did:peg:chief_engineer"
    assert isinstance(after_body["proof"]["merged_at"], str)
    assert after_body["resolved_context"]["merge_decision"] == "ACCEPTED"

    merged_branch_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "branch_id": "fork-design-change-001",
            "input": payload,
        },
    )
    assert merged_branch_exec.status_code == 400
    assert "not executable" in merged_branch_exec.text


def test_project_branches_endpoint_returns_branch_lifecycle_status() -> None:
    client = TestClient(app)
    project_id = "BR-LIST-001"

    initial = client.get(f"/api/v1/project/{project_id}/branches")
    assert initial.status_code == 200
    assert initial.json()["branches"]["main"]["status"] == "ACTIVE"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-list", "reason": "check"},
        ).status_code
        == 200
    )
    _submit_review_and_reject(client, project_id, "fork-list")
    assert client.post("/api/v1/branch/abandon", json={"project_id": project_id, "branch_id": "fork-list"}).status_code == 200

    listed = client.get(f"/api/v1/project/{project_id}/branches")
    assert listed.status_code == 200
    body = listed.json()
    assert body["branches"]["main"]["status"] == "ACTIVE"
    assert body["branches"]["fork-list"]["status"] == "ABANDONED"


def test_branch_reject_marks_rejected_and_keeps_main() -> None:
    client = TestClient(app)
    project_id = "BR-MERGE-REJECT-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-reject", "reason": "reject"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-reject",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )
    reject_response = client.post(
        "/api/v1/branch/submit-review",
        json={
            "project_id": project_id,
            "branch_id": "fork-reject",
            "actor_did": "did:peg:reviewer_001",
            "comment": "needs review",
        },
    )
    assert reject_response.status_code == 200

    review_reject_response = client.post(
        "/api/v1/branch/reject",
        json={
            "project_id": project_id,
            "branch_id": "fork-reject",
            "actor_did": "did:peg:chief_engineer",
            "role": "chief_engineer",
            "comment": "reject",
        },
    )
    assert review_reject_response.status_code == 200
    reject_body = review_reject_response.json()
    assert reject_body["branches"]["fork-reject"]["status"] == "REJECTED"
    approvals = reject_body["branches"]["fork-reject"]["approvals"]
    assert isinstance(approvals, list) and approvals[-1]["decision"] == "REJECT"

    main_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    assert main_exec.status_code == 200
    assert main_exec.json()["final_status"] == "PASS"


def test_branch_history_endpoint_contains_main_and_merge_info() -> None:
    client = TestClient(app)
    project_id = "BR-HISTORY-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-history", "reason": "history"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-history",
                "target_path": "path.lookup_tables.standard_by_zone.Z96",
                "value": 97.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_approve(client, project_id, "fork-history")
    assert (
        client.post(
            "/api/v1/branch/merge",
            json={
                "project_id": project_id,
                "branch_id": "fork-history",
                "target_branch": "main",
                "decision": "ACCEPTED",
                "operator": "did:peg:chief_engineer",
            },
        ).status_code
        == 200
    )

    response = client.get(f"/api/v1/branch/history?project_id={project_id}")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["main"], list)
    assert len(body["main"]) >= 1
    assert body["fork-history"]["status"] == "MERGED"
    assert body["fork-history"]["merge_info"]["decision"] == "ACCEPTED"


def test_branch_abandon_does_not_affect_main() -> None:
    client = TestClient(app)
    project_id = "BR-ABANDON-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-drop", "reason": "temp"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-drop",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_reject(client, project_id, "fork-drop")
    abandon_response = client.post(
        "/api/v1/branch/abandon",
        json={"project_id": project_id, "branch_id": "fork-drop"},
    )
    assert abandon_response.status_code == 200

    main_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "main",
            "input": _flatness_input_for_project(project_id),
        },
    )
    abandoned_exec = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.flatness",
            "branch_id": "fork-drop",
            "input": _flatness_input_for_project(project_id),
        },
    )

    assert main_exec.status_code == 200
    assert main_exec.json()["final_status"] == "PASS"
    assert abandoned_exec.status_code == 400
    assert "not executable" in abandoned_exec.text


def test_branch_abandon_records_decision_metadata() -> None:
    client = TestClient(app)
    project_id = "BR-ABANDON-META-001"
    branch_id = "fork-abandon-meta"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": branch_id, "reason": "cleanup"},
        ).status_code
        == 200
    )
    _submit_review_and_reject(client, project_id, branch_id)

    abandon_response = client.post(
        "/api/v1/branch/abandon",
        json={
            "project_id": project_id,
            "branch_id": branch_id,
            "operator": "did:peg:chief_engineer",
            "reason": "design withdrawn",
        },
    )
    assert abandon_response.status_code == 200
    body = abandon_response.json()
    branch = body["branches"][branch_id]
    assert branch["status"] == "ABANDONED"
    assert branch["abandon_info"]["abandoned_by"] == "did:peg:chief_engineer"
    assert branch["abandon_info"]["reason"] == "design withdrawn"
    assert branch["abandon_info"]["decision"] == "ABANDONED"


def test_branch_abandon_api_supports_source_branch_actor_did_and_emits_decision_proof() -> None:
    client = TestClient(app)
    project_id = "BR-ABANDON-API-001"
    source_branch = "fork-abandon-proof"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": source_branch, "reason": "api"},
        ).status_code
        == 200
    )
    _submit_review_and_reject(client, project_id, source_branch)

    response = client.post(
        "/api/v1/branch/abandon",
        json={
            "project_id": project_id,
            "source_branch": source_branch,
            "actor_did": "did:peg:chief_engineer",
            "reason": "change canceled",
        },
    )
    assert response.status_code == 200
    body = response.json()
    proof = body["decision_proof"]
    assert proof["action"] == "ABANDON"
    assert proof["project_id"] == project_id
    assert proof["branch_id"] == source_branch
    assert proof["parent_branch"] == "main"
    assert proof["source_branch"] == source_branch
    assert proof["decision"] == "ABANDONED"
    assert proof["actor_did"] == "did:peg:chief_engineer"
    assert proof["component_id"] == "__branch_decision__"
    assert isinstance(proof["execution_id"], str) and proof["execution_id"].startswith("branch_decision_abandon")
    assert isinstance(proof["proof_id"], str) and proof["proof_id"] == proof["proof_hash"]
    assert isinstance(proof["main_chain_hash"], str)
    assert isinstance(proof["fork_chain_hash"], str)
    assert isinstance(proof["signatures"], list) and len(proof["signatures"]) >= 1
    assert proof["signatures"][0]["did"] == "did:peg:chief_engineer"
    assert isinstance(proof["timestamp"], int)
    assert isinstance(proof["proof_hash"], str) and len(proof["proof_hash"]) >= 16
    assert isinstance(proof["chain_hash"], str)
    assert isinstance(proof["merkle_root"], str)
    assert isinstance(proof["proof_path"], list)
    assert body["branches"][source_branch]["abandon_info"]["decision_proof_hash"] == proof["proof_hash"]

    project = project_utxo_service.get_project_utxo(project_id)
    assert project["current_state"]["status"] == "ABANDONED"


def test_layer3_query_returns_branch_dual_results_when_active_fork_exists() -> None:
    client = TestClient(app)
    project_id = "BR-NL2GATE-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-nl", "reason": "compare"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-nl",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K20+100 flatness 8.5 pass?",
            "project_id": project_id,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer_mode"] == "dual"
    assert body["current_branch"] == "main"
    assert "fork-nl" in body["active_forks"]
    assert body["main_result"]["final_status"] == "PASS"
    assert body["branch_results"]["fork-nl"]["final_status"] == "BLOCKED"
    assert "主线" in body["answer"]
    assert "fork-nl" in body["answer"]
    assert body["branch_dual_results"]["main"]["result"] == "PASS"
    assert body["branch_dual_results"]["fork"]["result"] == "BLOCKED"


def test_build_full_proof_api_returns_unified_proof() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )
    assert response.status_code == 200
    body = response.json()
    execution_id = body["execution_id"]

    full_proof_response = client.get(f"/api/v1/proof/full/{execution_id}")
    assert full_proof_response.status_code == 200
    payload = full_proof_response.json()
    proof = payload["proof"]
    assert payload["execution_id"] == execution_id
    assert proof["execution_id"] == execution_id
    assert proof["action"] == "EXECUTE"
    assert proof["project_id"] == body["project_id"]
    assert proof["branch_id"] == body["branch_id"]
    assert proof["proof_id"] == proof["proof_hash"]


def test_get_verifiable_proof_api_returns_merkle_and_chain_material() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )
    assert response.status_code == 200
    body = response.json()
    execution_id = body["execution_id"]

    proof_response = client.get(f"/api/v1/proof/{execution_id}")
    assert proof_response.status_code == 200
    payload = proof_response.json()
    assert payload["execution_id"] == execution_id
    assert isinstance(payload["proof"], dict)
    assert isinstance(payload["merkle_root"], str)
    assert isinstance(payload["proof_path"], list)
    assert isinstance(payload["chain_hash"], str)
    assert isinstance(payload["previous_chain_hash"], str)
    assert isinstance(payload["signatures"], list)
    assert payload["proof"]["execution_id"] == execution_id


def test_verify_proof_api_returns_valid_true_for_untampered_proof() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )
    assert response.status_code == 200
    execution_id = response.json()["execution_id"]

    proof_response = client.get(f"/api/v1/proof/{execution_id}")
    assert proof_response.status_code == 200
    proof_payload = proof_response.json()

    verify_response = client.post(
        "/api/v1/proof/verify",
        json={
            "proof": proof_payload["proof"],
            "expected_root": proof_payload["merkle_root"],
            "expected_chain_hash": proof_payload["chain_hash"],
        },
    )
    assert verify_response.status_code == 200
    verify_body = verify_response.json()
    assert verify_body["valid"] is True
    assert verify_body["checks"]["payload_hash"] is True
    assert verify_body["checks"]["merkle_path"] is True
    assert verify_body["checks"]["chain_hash"] is True
    assert verify_body["reason"] == ""


def test_verify_proof_api_detects_tampered_payload_hash() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "input": _compaction_pass_input(),
        },
    )
    assert response.status_code == 200
    execution_id = response.json()["execution_id"]

    proof_response = client.get(f"/api/v1/proof/{execution_id}")
    assert proof_response.status_code == 200
    proof_payload = proof_response.json()
    tampered_proof = dict(proof_payload["proof"])
    canonical = dict(tampered_proof["canonical_payload"])
    canonical["final_status"] = "FAIL"
    tampered_proof["canonical_payload"] = canonical

    verify_response = client.post(
        "/api/v1/proof/verify",
        json={
            "proof": tampered_proof,
            "expected_root": proof_payload["merkle_root"],
            "expected_chain_hash": proof_payload["chain_hash"],
        },
    )
    assert verify_response.status_code == 200
    verify_body = verify_response.json()
    assert verify_body["valid"] is False
    assert verify_body["checks"]["payload_hash"] is False
    assert "payload_hash mismatch" in verify_body["reason"]


def test_layer3_query_dual_mode_includes_all_active_forks() -> None:
    client = TestClient(app)
    project_id = "BR-NL2GATE-MULTI-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-a", "reason": "compare-a"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/fork",
            json={"project_id": project_id, "from_branch": "main", "new_branch_id": "fork-b", "reason": "compare-b"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-a",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.0,
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-b",
                "target_path": "path.lookup_tables.standard_limit_by_surface.asphalt",
                "value": 6.5,
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K20+100 flatness 8.5 pass?",
            "project_id": project_id,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer_mode"] == "dual"
    assert set(body["branch_results"].keys()) == {"fork-a", "fork-b"}


def test_layer3_query_single_mode_after_merge_uses_merged_template() -> None:
    client = TestClient(app)
    project_id = "BR-NL2GATE-MERGED-001"

    assert (
        client.post(
            "/api/v1/branch/fork",
            json={
                "project_id": project_id,
                "from_branch": "main",
                "new_branch_id": "fork-design-change-001",
                "reason": "设计变更#DC-001",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/branch/override",
            json={
                "project_id": project_id,
                "branch_id": "fork-design-change-001",
                "target_path": "path.lookup_tables.standard_by_zone.Z96",
                "value": 97.0,
            },
        ).status_code
        == 200
    )
    _submit_review_and_approve(client, project_id, "fork-design-change-001")
    assert (
        client.post(
            "/api/v1/branch/merge",
            json={
                "project_id": project_id,
                "branch_id": "fork-design-change-001",
                "target_branch": "main",
                "decision": "ACCEPTED",
                "operator": "did:peg:chief_engineer",
            },
        ).status_code
        == 200
    )

    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K15+200 compaction 96.5 pass?",
            "project_id": project_id,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["answer_mode"] == "single"
    assert body["branch_results"] == {}
    assert body["main_result"]["final_status"] != "PASS"
    assert body["main_result"]["proof"]["merge_decision"] == "ACCEPTED"
    assert "已合入主线" in body["answer"]
    assert "标准提升至97.0%" in body["answer"]
    assert "不合格" in body["answer"]
    assert len(body["branch_history"]["main"]) >= 1


def test_utxo_split_range_preserves_total_length() -> None:
    client = TestClient(app)
    project_id = "BR-SPLIT-001"
    split_input = _compaction_pass_input()
    split_input["project_id"] = project_id
    split_input["stake"] = "K15+000-K25+000"

    exec_response = client.post(
        "/api/v1/execute/component",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "branch_id": "main",
            "input": split_input,
        },
    )
    assert exec_response.status_code == 200

    split_response = client.post(
        "/api/v1/utxo/split",
        json={
            "project_id": project_id,
            "original_range": "K15+000-K25+000",
            "splits": ["K15+000-K20+000", "K20+000-K25+000"],
        },
    )
    assert split_response.status_code == 200
    payload = split_response.json()
    assert len(payload["split_history"]) >= 1
    v_addresses = [item["v_address"] for item in payload["unspent_outputs"].values()]
    assert any("/K15%2B000-K20%2B000" in addr or "/K15+000-K20+000" in addr for addr in v_addresses)
    assert any("/K20%2B000-K25%2B000" in addr or "/K20+000-K25+000" in addr for addr in v_addresses)
