from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.pegbot_cli import main as pegbot_cli_main


def _project_id(tag: str) -> str:
    return f"P-E2E-{tag}-{uuid4().hex[:8]}"


def _assert_executor_status_and_proof(payload: dict) -> None:
    execution_result = payload.get("execution_result")
    assert isinstance(execution_result, dict)
    final_status = str(execution_result.get("final_status") or "").strip().upper()
    assert final_status

    proof = payload.get("proof")
    assert isinstance(proof, dict)
    proof_result = proof.get("result")
    assert isinstance(proof_result, dict)
    assert str(proof_result.get("final_status") or "").strip().upper() == final_status


def _run_cli_json(argv: list[str], capsys) -> dict:
    code = pegbot_cli_main(argv + ["--json"])
    output = capsys.readouterr().out.strip()
    assert code == 0
    assert output
    payload = json.loads(output)
    assert isinstance(payload, dict)
    return payload


def test_e2e_01_form_execution() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/engine/execute",
        json={
            "rule_id": "subgrade.compaction",
            "inputs": {
                "stake": "K19+070",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
                "representative_value": 96.5,
                "actor_did": "did:test:e2e",
                "inspected_at": "2026-04-25T10:00:00Z",
            },
            "context": {
                "project_id": _project_id("FORM"),
                "norm_version": "JTG_F80_1_2017",
            },
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert isinstance(body.get("result"), dict)
    assert isinstance(body.get("proof"), dict)
    assert isinstance(body.get("engine_proof"), dict)
    assert str(body["result"].get("final_status") or "").strip().upper()
    assert body["proof"]["result"]["final_status"] == body["result"]["final_status"]
    assert body["proof"]["rule_version"] == body["rule_version"]


def test_e2e_02_natural_language_execution() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K19+070 compaction 94.5% pass?",
            "project_id": _project_id("NL"),
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["execution_request"]["route"] == "unified_engine"
    _assert_executor_status_and_proof(body)
    assert isinstance(body.get("rule_version"), str) and body["rule_version"]
    assert body["proof"]["rule_version"] == body["rule_version"]
    assert isinstance(body.get("engine_proof"), dict)
    assert body["engine_proof"]["execution_id"] == body["execution_result"]["execution_id"]


def test_e2e_03_multi_turn_supplement_execution() -> None:
    client = TestClient(app)
    project_id = _project_id("MULTI_TURN")

    first = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K19+070 compaction pass?",
            "project_id": project_id,
        },
    )
    assert first.status_code == 200
    first_body = first.json()
    assert first_body["status"] == "NEED_MORE_INFO"
    assert first_body["engine_called"] is False
    assert first_body["proof"] is None
    assert isinstance(first_body.get("session_id"), str) and first_body["session_id"]

    second = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "94.5%",
            "project_id": project_id,
            "session_id": first_body["session_id"],
        },
    )
    assert second.status_code == 200
    second_body = second.json()
    assert second_body.get("status") != "NEED_MORE_INFO"
    assert second_body["execution_request"]["route"] == "unified_engine"
    _assert_executor_status_and_proof(second_body)
    assert second_body["session_state"]["current_step"] == "completed"


def test_e2e_04_multi_rule_combination_execution() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "subgrade acceptance for K19+070 compaction 96 thickness 206 deflection 200",
            "project_id": _project_id("MULTI_RULE"),
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
    assert isinstance(body.get("proof"), dict)
    assert isinstance(body.get("rule_results"), list) and len(body["rule_results"]) == 3

    execution_result = body["execution_result"]
    assert execution_result["execution_mode"] == "multi_rule"
    item_details = execution_result.get("item_details")
    assert isinstance(item_details, list) and len(item_details) == 3
    for detail in item_details:
        assert isinstance(detail, dict)
        engine_status = str(detail.get("engine_status") or "").strip().upper()
        assert engine_status
        expected_binary = "PASS" if engine_status == "PASS" else "FAIL"
        assert detail["result"] == expected_binary
        assert isinstance(detail.get("proof"), dict)
        nested_execution = detail.get("execution_result")
        assert isinstance(nested_execution, dict)
        assert str(nested_execution.get("final_status") or "").strip().upper() == engine_status


def test_e2e_05_cli_execution(capsys) -> None:
    project_id = _project_id("CLI")
    payload = _run_cli_json(
        [
            "ask",
            "K19+070 compaction 94.5% pass?",
            "--project-id",
            project_id,
        ],
        capsys,
    )

    assert payload["execution_request"]["route"] == "unified_engine"
    _assert_executor_status_and_proof(payload)
    assert payload["proof"]["rule_version"] == payload["rule_version"]


def test_e2e_06_proof_generation() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/proof/generate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "stake": "K19+070",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
                "representative_value": 96.5,
                "actor_did": "did:test:e2e",
                "inspected_at": "2026-04-25T10:00:00Z",
            },
            "context": {
                "projectId": _project_id("PROOF"),
            },
        },
    )
    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "generated"
    assert isinstance(body.get("proof"), dict)
    assert isinstance(body.get("executionId"), str) and body["executionId"]
    assert isinstance(body.get("content"), dict)
    assert isinstance(body["content"].get("trace"), list)
    assert isinstance(body["content"].get("gateResults"), list)


def test_e2e_07_rule_version_trace_and_shared_interface(capsys) -> None:
    client = TestClient(app)
    project_id = _project_id("TRACE")

    form = client.post(
        "/api/v1/engine/execute",
        json={
            "rule_id": "subgrade.compaction",
            "inputs": {
                "stake": "K19+070",
                "layer_depth": "0-0.8m",
                "compaction_degree": 95.9,
                "representative_value": 95.9,
                "actor_did": "did:test:e2e",
                "inspected_at": "2026-04-25T10:00:00Z",
            },
            "context": {
                "project_id": project_id,
                "norm_version": "JTG_F80_1_2017",
            },
        },
    )
    assert form.status_code == 200
    form_body = form.json()

    nl = client.post(
        "/api/v1/layer3/query",
        json={
            "message": "K19+070 compaction 95.9% pass?",
            "project_id": project_id,
        },
    )
    assert nl.status_code == 200
    nl_body = nl.json()

    cli_body = _run_cli_json(
        [
            "ask",
            "K19+070 compaction 95.9% pass?",
            "--project-id",
            project_id,
        ],
        capsys,
    )

    form_rule_version = str(form_body.get("rule_version") or "").strip()
    nl_rule_version = str(nl_body.get("rule_version") or "").strip()
    cli_rule_version = str(cli_body.get("rule_version") or "").strip()
    assert form_rule_version
    assert nl_rule_version
    assert cli_rule_version
    assert form_rule_version == nl_rule_version == cli_rule_version
    assert form_body["proof"]["rule_version"] == form_rule_version
    assert nl_body["proof"]["rule_version"] == nl_rule_version
    assert cli_body["proof"]["rule_version"] == cli_rule_version

    # Shared interface: UI and CLI both hit Layer3 query endpoint contract.
    ui_app_path = Path(__file__).resolve().parents[2] / "apps" / "nl2gate-web" / "src" / "App.tsx"
    ui_source = ui_app_path.read_text(encoding="utf-8")
    assert "/api/v1/layer3/query" in ui_source
    assert nl_body["execution_request"]["route"] == "unified_engine"
    assert cli_body["execution_request"]["route"] == "unified_engine"
