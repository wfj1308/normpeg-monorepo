from __future__ import annotations

import json
from typing import Any, Dict
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import pegbot_cli
from backend.app.main import app, project_utxo_service, spu_runtime_store


def _demo_pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 100 Td (Hello PDF) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        b"0000000207 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n310\n%%EOF"
    )


def _new_project_id() -> str:
    return f"P-FINAL-CLOSE-LOOP-{uuid4().hex[:8]}"


def _run_replay_check(client: TestClient, execution_id: str) -> None:
    verifiable_resp = client.get(f"/api/v1/proof/{execution_id}")
    assert verifiable_resp.status_code == 200
    verifiable = verifiable_resp.json()

    verify_resp = client.post(
        "/api/v1/proof/verify",
        json={
            "proof": verifiable["proof"],
            "expected_root": verifiable["merkle_root"],
            "expected_chain_hash": verifiable["chain_hash"],
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["valid"] is True
    checks = verify_payload.get("checks")
    assert isinstance(checks, dict)
    assert checks.get("payload_hash") is True
    assert checks.get("merkle_path") is True
    assert checks.get("chain_hash") is True


def _compact_text(value: Any) -> str:
    return "".join(str(value or "").split())


def test_final_closed_loop_acceptance(monkeypatch, capsys) -> None:
    client = TestClient(app)
    project_id = _new_project_id()
    point = "K19+070"
    standard_code = "JTG-F80-2017"
    norm_version = "JTG_F80_1_2017"

    proof_count_before_dark = len(project_utxo_service._proof_records)  # type: ignore[attr-defined]
    spu_count_before_dark = len(spu_runtime_store)

    # 1) Dark page: upload spec.
    parse_resp = client.post(
        "/api/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", _demo_pdf_bytes(), "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": '{"extractTables":true}'},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()
    parse_id = str(parse_payload.get("parseId") or "").strip()
    assert parse_id

    # 2) Dark page: generate candidate rules (SPU candidate).
    spu_resp = client.post(
        "/api/v1/spu/generate",
        json={
            "parseId": parse_id,
            "clauseId": "4.2.1",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    assert spu_payload["status"] == "generated"
    spu_id = str(spu_payload.get("spuId") or "").strip()
    assert spu_id

    # 3) Manual confirmation.
    validate_resp = client.post("/api/v1/spec/validate", json={"spuId": spu_id})
    assert validate_resp.status_code == 200
    assert validate_resp.json()["valid"] is True

    # 4) Expert signature.
    did_resp = client.post(
        "/api/v1/did/register",
        json={"name": "chief-reviewer", "role": "supervisor", "organization": "normpeg-qa"},
    )
    assert did_resp.status_code == 200
    reviewer_did = did_resp.json()["did"]

    approval_payload = {
        "action": "manual_confirm",
        "parseId": parse_id,
        "spuId": spu_id,
        "projectId": project_id,
    }
    sign_resp = client.post(
        "/api/v1/sign/sign",
        json={"did": reviewer_did, "payload": approval_payload, "purpose": "expert_approval"},
    )
    assert sign_resp.status_code == 200
    signature = sign_resp.json()["signature"]
    verify_sign_resp = client.post(
        "/api/v1/sign/verify",
        json={"did": reviewer_did, "payload": approval_payload, "signature": signature},
    )
    assert verify_sign_resp.status_code == 200
    assert verify_sign_resp.json()["valid"] is True

    # Deep page is preparation only: no formal acceptance execution yet.
    proof_count_after_dark = len(project_utxo_service._proof_records)  # type: ignore[attr-defined]
    assert proof_count_after_dark == proof_count_before_dark
    spu_count_after_dark = len(spu_runtime_store)
    assert spu_count_after_dark >= spu_count_before_dark + 1

    # 5) Publish NormDoc to Rule Store (simulated published payload).
    normdoc_id = f"{standard_code}@@v1"
    published_normdoc = {
        "normdoc_id": normdoc_id,
        "standard_code": standard_code,
        "name": "JTG F80/1-2017",
        "version": "v1",
        "status": "published",
        "spu_id": spu_id,
    }
    published_package = {
        "package_id": "pkg-final-acceptance",
        "normdoc_id": normdoc_id,
        "name": "final-acceptance-package",
        "version": "v1",
        "status": "published",
    }
    published_rule = {
        "rule_id": "subgrade.compaction",
        "package_id": "pkg-final-acceptance",
        "clause": "4.2.1",
        "item_name": "compaction",
        "input_fields": ["compaction_degree", "representative_value", "layer_depth"],
        "enabled": True,
        "version": "v1",
        "status": "published",
    }

    rule_store_calls: list[str] = []
    executor_requests: list[Dict[str, Any]] = []
    executor_execution_ids: list[str] = []

    def fake_request_platform_json(
        *,
        method: str,
        base_url: str,
        path: str,
        query: Dict[str, Any] | None = None,
        body: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        assert base_url == "http://127.0.0.1:8790"
        rule_store_calls.append(path)

        if path == "/api/rule-store/normdocs":
            return {"status": "ok", "source": "Rule Store", "data": {"items": [published_normdoc]}}
        if path == "/api/rule-store/packages":
            assert query == {"normdoc_id": normdoc_id}
            return {"status": "ok", "source": "Rule Store", "data": {"items": [published_package]}}
        if path == f"/api/rule-store/packages/{published_package['package_id']}/rules":
            return {"status": "ok", "source": "Rule Store", "data": {"items": [published_rule]}}
        if path == "/api/slots/import":
            assert method.upper() == "POST"
            return {"slot": {"slotId": "slot-final-001"}}
        if path == "/api/containers":
            assert method.upper() == "POST"
            assert isinstance(body, dict)
            assert body.get("geoSlotRef") == "slot-final-001"
            return {"container": {"containerId": "container-final-001"}}
        if path == "/api/executor/run":
            assert method.upper() == "POST"
            assert isinstance(body, dict)
            executor_requests.append(dict(body))

            inputs = dict(body.get("inputs") or {})
            context = dict(body.get("context") or {})
            inputs.setdefault("stake", context.get("point") or point)
            inputs.setdefault("layer_depth", "0-0.8m")
            inputs.setdefault("representative_value", inputs.get("compaction_degree"))
            inputs.setdefault("actor_did", "did:pegbot:cli")
            inputs.setdefault("inspected_at", "2026-04-25T10:00:00Z")

            execute_resp = client.post(
                "/api/v1/engine/execute",
                json={
                    "rule_id": body.get("rule_id"),
                    "inputs": inputs,
                    "context": {
                        "project_id": context.get("project_id") or project_id,
                        "norm_version": norm_version,
                    },
                },
            )
            assert execute_resp.status_code == 200
            execute_payload = execute_resp.json()
            execution_result = execute_payload["result"]
            proof = execution_result["proof"]
            final_status = str(execution_result.get("final_status") or "").strip().upper()
            execution_id = str(execution_result.get("execution_id") or "").strip()
            executor_execution_ids.append(execution_id)

            return {
                "status": final_status,
                "executionId": execution_id,
                "proof": {"proofId": proof["proof_id"], "hash": proof["proof_hash"]},
                "result": {
                    "executionId": execution_id,
                    "passed": final_status == "PASS",
                    "outcome": final_status,
                    "gateStatus": final_status,
                    "outputs": execution_result.get("path_outputs", {}),
                    "full_proof": proof,
                },
                "proofFragment": {"proof_id": proof["proof_id"], "proof_hash": proof["proof_hash"]},
            }

        raise AssertionError(f"unexpected path: {path}")

    monkeypatch.setattr(pegbot_cli, "_request_platform_json", fake_request_platform_json)

    # 6/7/8) White page selects NormDoc + item and runs form execution.
    shared_inputs = {
        "stake": point,
        "layer_depth": "0-0.8m",
        "compaction_degree": 95.9,
        "representative_value": 95.9,
        "actor_did": "did:test:form",
        "inspected_at": "2026-04-25T10:00:00Z",
    }
    form_resp = client.post(
        "/api/v1/engine/execute",
        json={
            "rule_id": "subgrade.compaction",
            "inputs": shared_inputs,
            "context": {"project_id": project_id, "norm_version": norm_version},
        },
    )
    assert form_resp.status_code == 200
    form_payload = form_resp.json()
    form_status = str(form_payload["result"].get("final_status") or "").strip().upper()
    assert form_status

    # 9) PegBot executes same inspection.
    pegbot_resp = client.post(
        "/api/v1/layer3/query",
        json={"message": f"{point} compaction 95.9% pass?", "project_id": project_id},
    )
    assert pegbot_resp.status_code == 200
    pegbot_payload = pegbot_resp.json()
    pegbot_status = str(pegbot_payload["execution_result"].get("final_status") or "").strip().upper()
    assert pegbot_payload["execution_request"]["route"] == "unified_engine"
    assert pegbot_status

    # 10) CLI executes same inspection in Rule Store + Executor mode.
    cli_code = pegbot_cli.main(
        [
            "check",
            "--api-base",
            "http://127.0.0.1:8790",
            "--project-id",
            project_id,
            "--normdoc",
            standard_code,
            "--item",
            "compaction",
            "--point",
            point,
            "--value",
            "95.9",
            "--input",
            "representative_value=95.9",
            "--input",
            "layer_depth=0-0.8m",
            "--json",
        ]
    )
    cli_output = capsys.readouterr().out.strip()
    assert cli_code == 0
    assert cli_output
    cli_payload = json.loads(cli_output)
    cli_status = str(
        cli_payload["execution"].get("status")
        or cli_payload["execution"].get("result", {}).get("gateStatus")
        or cli_payload["execution"].get("result", {}).get("outcome")
        or ""
    ).strip().upper()
    assert cli_status

    # 11) Three entries are consistent.
    assert form_status == pegbot_status == cli_status

    # Pass criterion: rules must come from Rule Store.
    assert cli_payload["mode"] == "rule_store_executor"
    assert cli_payload["rule"]["source"] == "Rule Store"
    assert "/api/rule-store/normdocs" in rule_store_calls
    assert "/api/rule-store/packages" in rule_store_calls
    assert f"/api/rule-store/packages/{published_package['package_id']}/rules" in rule_store_calls
    assert executor_requests
    assert executor_requests[0]["rule_id"] == published_rule["rule_id"]
    assert executor_requests[0]["rule_version"] == published_rule["version"]

    # Pass criterion: decisions must come from Executor, not hardcoded thresholds.
    assert len(executor_execution_ids) == 1
    assert "condition" not in executor_requests[0]
    assert "threshold" not in executor_requests[0]
    assert "expr" not in executor_requests[0]

    # 12) All results have proofs.
    form_execution_id = str(form_payload["result"].get("execution_id") or "").strip()
    pegbot_execution_id = str(pegbot_payload["execution_result"].get("execution_id") or "").strip()
    cli_execution_id = str(
        cli_payload["execution"].get("executionId")
        or cli_payload["execution"].get("result", {}).get("executionId")
        or ""
    ).strip()
    assert form_execution_id and pegbot_execution_id and cli_execution_id
    assert str(form_payload["result"]["proof"].get("proof_hash") or "").strip()
    assert str(pegbot_payload["engine_proof"].get("proof_hash") or "").strip()
    assert str(cli_payload["execution"]["proof"].get("proofId") or "").strip()

    # 13) Proofs are replayable.
    for execution_id in (form_execution_id, pegbot_execution_id, cli_execution_id):
        _run_replay_check(client, execution_id)

    # Pass criterion: white page must not generate rules.
    assert len(spu_runtime_store) == spu_count_after_dark

    # 14) Generate acceptance report.
    report_resp = client.post(
        "/api/v1/report/generate",
        json={
            "reportType": "acceptance_closure",
            "projectId": project_id,
            "scope": {"point": point},
            "data": {
                "normdocId": normdoc_id,
                "formStatus": form_status,
                "pegbotStatus": pegbot_status,
                "cliStatus": cli_status,
                "formExecutionId": form_execution_id,
                "pegbotExecutionId": pegbot_execution_id,
                "cliExecutionId": cli_execution_id,
            },
        },
    )
    assert report_resp.status_code == 200
    report_payload = report_resp.json()
    report_id = str(report_payload.get("reportId") or "").strip()
    assert report_payload["status"] == "generated"
    assert report_id
    assert report_payload["formats"]["pdf"].endswith(f"/v1/report/{report_id}.pdf")
    assert report_payload["formats"]["xlsx"].endswith(f"/v1/report/{report_id}.xlsx")
    assert report_payload["formats"]["json"].endswith(f"/v1/report/{report_id}.json")

    # Pass criterion: dark page did not perform formal acceptance execution.
    final_proof_count = len(project_utxo_service._proof_records)  # type: ignore[attr-defined]
    assert final_proof_count >= proof_count_after_dark + 3


def test_retrieval_layer_end_to_end_acceptance_traceability() -> None:
    client = TestClient(app)
    project_id = _new_project_id()
    keyword_query = "\u538b\u5b9e\u5ea6"
    standard_code = "JTG-F80-1-2017"
    norm_version = "JTG_F80_1_2017"

    # 1) Import standard and refresh Clause Store corpus.
    parse_resp = client.post(
        "/api/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", _demo_pdf_bytes(), "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": '{"extractTables":true}'},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()
    assert str(parse_payload.get("parseId") or "").strip()

    # 2/3) Search by keyword and locate clause 4.2.1 with original content.
    search_resp = client.get(
        "/api/clauses/search",
        params={"q": keyword_query, "standard_code": standard_code, "version": "v1"},
    )
    assert search_resp.status_code == 200
    search_payload = search_resp.json()
    assert search_payload["query"] == keyword_query
    results = search_payload.get("results")
    assert isinstance(results, list) and results
    clause_item = next((item for item in results if isinstance(item, dict) and item.get("clause_no") == "4.2.1"), None)
    assert isinstance(clause_item, dict)
    assert clause_item["standard_code"] == standard_code
    assert clause_item["version"] == "v1"
    clause_id = str(clause_item.get("clause_id") or clause_item.get("clause_no") or "").strip()
    assert clause_id
    clause_content = str(clause_item.get("content") or "").strip()
    assert clause_content

    # 4/9) Verify Clause -> RuleItem mapping and PegBot references the same clause.
    layer3_resp = client.post(
        "/api/v1/layer3/query",
        json={"message": "K19+070 compaction 96.5 pass?", "project_id": project_id},
    )
    assert layer3_resp.status_code == 200
    layer3_payload = layer3_resp.json()
    retrieval = layer3_payload.get("retrieval")
    assert isinstance(retrieval, dict)
    selected_clause = retrieval.get("selected_clause")
    assert isinstance(selected_clause, dict)
    assert selected_clause["clause_no"] == "4.2.1"
    assert str(selected_clause.get("clause_id") or selected_clause.get("clause_no") or "").strip() == clause_id
    mapped_rule_ids = retrieval.get("mapped_rule_ids")
    assert isinstance(mapped_rule_ids, list) and "subgrade.compaction" in mapped_rule_ids
    clause_rule_links = retrieval.get("clause_rule_links")
    assert isinstance(clause_rule_links, list)
    assert any(
        isinstance(item, dict)
        and str(item.get("clause_no") or "") == "4.2.1"
        and "subgrade.compaction" in (item.get("rule_ids") or [])
        for item in clause_rule_links
    )
    assert layer3_payload["execution_request"]["pre_route"] == "clause_search_then_rule_mapping"
    assert layer3_payload["execution_request"]["route"] == "unified_engine"

    judgement_card = layer3_payload.get("judgement_card")
    assert isinstance(judgement_card, dict)
    assert judgement_card["result_source"] == "executor"
    basis_payload = judgement_card.get("normative_basis")
    assert isinstance(basis_payload, dict)
    assert basis_payload["source"] == "clause_store"
    assert basis_payload["clause_no"] == "4.2.1"
    assert str(basis_payload.get("clause_id") or "").strip() == clause_id
    basis_content = str(basis_payload.get("clause_content") or "").strip()
    assert basis_content
    assert _compact_text(basis_content) == _compact_text(clause_content)

    answer = str(layer3_payload.get("answer") or "")
    assert "4.2.1" in answer
    assert _compact_text(clause_content[:8]) in _compact_text(answer)

    # 5/6) Execute compaction check and assert PASS/FAIL contract.
    engine_resp = client.post(
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
            "context": {"project_id": project_id, "norm_version": norm_version},
        },
    )
    assert engine_resp.status_code == 200
    engine_payload = engine_resp.json()
    final_status = str(engine_payload.get("result", {}).get("final_status") or "").strip().upper()
    assert final_status in {"PASS", "FAIL", "CRITICAL", "BLOCKED"}
    assert final_status == "PASS"
    execution_id = str(engine_payload.get("result", {}).get("execution_id") or "").strip()
    assert execution_id

    # 7/8) Simulate "view original clause content" via clause neighbors API.
    neighbors_resp = client.get(
        f"/api/clauses/{clause_id}/neighbors",
        params={"normdoc_id": standard_code, "version": "v1"},
    )
    assert neighbors_resp.status_code == 200
    neighbors_payload = neighbors_resp.json()
    current_clause = neighbors_payload.get("current")
    assert isinstance(current_clause, dict)
    assert current_clause["clause_no"] == "4.2.1"
    assert str(current_clause.get("clause_id") or "").strip() == clause_id
    assert _compact_text(current_clause.get("content")) == _compact_text(clause_content)

    # 10) Proof keeps clause traceability via clause_refs containing 4.2.1.
    proof_resp = client.get(f"/api/v1/proof/{execution_id}")
    assert proof_resp.status_code == 200
    proof_payload = proof_resp.json()
    proof_block = proof_payload.get("proof")
    assert isinstance(proof_block, dict)
    canonical_payload = proof_block.get("canonical_payload")
    assert isinstance(canonical_payload, dict)
    clause_refs = canonical_payload.get("clause_refs")
    assert isinstance(clause_refs, list) and clause_refs
    assert any("4.2.1" in str(item) for item in clause_refs)
