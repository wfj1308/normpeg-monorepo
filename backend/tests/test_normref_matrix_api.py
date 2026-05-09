from __future__ import annotations

from urllib.parse import quote

from fastapi.testclient import TestClient

from backend.app.main import app


def _auth_client() -> TestClient:
    return TestClient(app, headers={"Authorization": "Bearer test-token"})


def _compaction_component_input() -> dict:
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


def _gate_demo_input() -> dict:
    return {
        "massHoleSand": 2850.5,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def test_pdf_parse_and_spu_generate_compat_endpoints() -> None:
    client = _auth_client()

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 100 Td (Hello PDF) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        b"0000000207 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n310\n%%EOF"
    )
    parse_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", pdf_bytes, "application/pdf")},
        data={
            "standardCode": "JTG F80/1-2017",
            "options": '{"extractTables":true,"extractFormulas":true}',
        },
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()
    assert parse_payload["status"] == "success"
    assert parse_payload["parseId"]
    assert parse_payload["estimatedSPU"] == "highway.subgrade.compaction.4.2.1@v1"
    assert parse_payload["extractedData"]["clauseCount"] >= 2
    assert parse_payload["extractedData"]["clauseCatalog"][0]["id"] == "4.2.1"
    first_clause = parse_payload["extractedData"]["clauseCatalog"][0]
    assert first_clause["clause"] == "4.2.1"
    assert first_clause["normdoc_id"] == "JTG-F80-1-2017"
    assert isinstance(first_clause["page"], int)
    assert isinstance(first_clause["keywords"], list)
    assert first_clause["content"]

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": parse_payload["parseId"],
            "clauseId": "4.2.1",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    assert spu_payload["status"] == "generated"
    assert spu_payload["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert isinstance(spu_payload["formats"], dict)
    assert spu_payload["formats"]["yaml"].startswith("https://api.normref.com/v1/spu/")
    assert spu_payload["bundle"].startswith("https://api.normref.com/v1/spu/")
    assert "4.2.1" in spu_payload["availableClauseIds"]


def test_mapping_resolve_contract_fields() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {"layer": "96区", "time": "2026-04-17T10:00:00Z"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["location"]["stake"] == "K15+200"
    assert "coordinates" in payload["location"]
    assert payload["containers"][0]["containerId"] == "DB-01"
    assert payload["containers"][0]["range"] == "K15+000~K16+000"
    assert payload["volumes"][0]["unit"] == "m\u00b3"
    assert payload["activeSpecs"][0]["lastProof"] == "0xabc123def456..."
    assert payload["activeSpecs"][0]["executedAt"] == "2026-04-15T14:30:00Z"
    assert "name" in payload["activeSpecs"][0]
    assert "description" in payload["pendingActions"][0]


def test_spec_get_and_validate_endpoints() -> None:
    client = _auth_client()

    get_resp = client.get("/api/v1/spec/highway.subgrade.compaction.4.2.1.soil@v1")
    assert get_resp.status_code == 200
    get_payload = get_resp.json()
    assert get_payload["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"
    assert get_payload["resolvedSpuId"] == "JTG_F80_1_2017.4.2.1.compaction"

    validate_id_resp = client.post(
        "/api/v1/spec/validate",
        json={"spuId": "highway.subgrade.compaction.4.2.1.soil@v1"},
    )
    assert validate_id_resp.status_code == 200
    assert validate_id_resp.json()["valid"] is True

    validate_spu_resp = client.post(
        "/api/v1/spec/validate",
        json={"spu": {"gate": {}, "state": {}}},
    )
    assert validate_spu_resp.status_code == 200
    validate_spu_payload = validate_spu_resp.json()
    assert validate_spu_payload["valid"] is False
    assert any("missing field: path" in item for item in validate_spu_payload["errors"])


def test_gate_path_proof_endpoints() -> None:
    client = _auth_client()

    gate_request_payload = {
        "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
        "inputs": _gate_demo_input(),
        "context": {"projectId": "dajin-2024", "layerZone": "96区", "designSpeed": 100},
    }
    gate_resp = client.post("/api/v1/gate/evaluate", json=gate_request_payload)
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()
    assert gate_payload["executionId"]
    assert gate_payload["status"] in {"PASS", "FAIL"}
    assert isinstance(gate_payload["gateResults"], list)
    assert "proof" in gate_payload

    fail_gate_resp = client.post(
        "/api/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2000,
                "massSandCone": 0,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "dajin-2024", "layerZone": "96区", "designSpeed": 100},
        },
    )
    assert fail_gate_resp.status_code == 200
    fail_gate_payload = fail_gate_resp.json()
    assert fail_gate_payload["status"] == "FAIL"
    assert fail_gate_payload["gateResults"][0]["message"] == "压实度必须 ≥ 93%"

    path_resp = client.post(
        "/api/v1/path/execute",
        json={
            "spuId": "JTG_F80_1_2017.4.2.1.compaction",
            "inputs": _compaction_component_input(),
            "context": {"projectId": "P1"},
        },
    )
    assert path_resp.status_code == 200
    path_payload = path_resp.json()
    assert path_payload["executionId"]
    assert isinstance(path_payload["outputs"], dict)

    proof_resp = client.post(
        "/api/v1/proof/generate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": _gate_demo_input(),
            "context": {"projectId": "dajin-2024"},
        },
    )
    assert proof_resp.status_code == 200
    proof_payload = proof_resp.json()
    assert proof_payload["status"] == "generated"
    assert proof_payload["proof"]["hash"]

    verify_resp = client.post(
        "/api/v1/proof/verify",
        json={
            "proofHash": proof_payload["proof"]["hash"],
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": True},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["status"] in {"valid", "invalid"}
    assert "verification" in verify_payload


def test_state_transition_and_state_query_endpoints() -> None:
    client = _auth_client()

    legacy_resp = client.post(
        "/api/v1/state/transition",
        json={
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "current_state": "VALIDATED",
            "trigger": "all_rules_pass",
            "meta": {"source": "test"},
        },
    )
    assert legacy_resp.status_code == 200
    assert legacy_resp.json()["to_state"] == "QUALIFIED"

    compat_resp = client.post(
        "/api/v1/state/transition",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert compat_resp.status_code == 200
    compat_payload = compat_resp.json()
    assert compat_payload["status"] == "completed"
    assert compat_payload["stateMachine"]["current"] == "VALIDATED"
    assert compat_payload["history"][0]["state"] == "DRAFT"

    target_vuri = "v:/cn.highway/dajin/subgrade/DB-01/K15+200"
    state_resp = client.get(f"/api/v1/state/{quote(target_vuri, safe='')}")
    assert state_resp.status_code == 200
    state_payload = state_resp.json()
    assert state_payload["vuri"] == target_vuri
    assert state_payload["currentState"]


def test_input_output_layer_smoke_endpoints() -> None:
    client = _auth_client()

    image_resp = client.post(
        "/api/v1/image/recognize",
        json={"imageUrl": "https://example.com/demo.jpg"},
    )
    assert image_resp.status_code == 200
    assert image_resp.json()["status"] == "success"

    voice_resp = client.post(
        "/api/v1/voice/transcribe",
        json={"audioText": "K15+200 压实度95.0"},
    )
    assert voice_resp.status_code == 200
    assert voice_resp.json()["status"] == "success"

    form_resp = client.post(
        "/api/v1/form/render",
        json={"spuId": "highway.subgrade.compaction.4.2.1.soil@v1", "context": {"layer": "96区"}},
    )
    assert form_resp.status_code == 200
    assert form_resp.json()["spuId"] == "highway.subgrade.compaction.4.2.1.soil@v1"

    report_resp = client.post(
        "/api/v1/report/generate",
        json={"projectId": "P1", "scope": {"startStake": "K15+000", "endStake": "K16+000"}, "data": {"a": 1}},
    )
    assert report_resp.status_code == 200
    assert report_resp.json()["status"] == "generated"


def test_demo_script_api_chain_six_steps() -> None:
    client = _auth_client()

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 10 10 Td (4.2.1 Compaction) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        b"0000000195 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n300\n%%EOF"
    )
    parse_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": '{"extractTables":true,"extractFormulas":true}'},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()
    assert parse_payload["parseId"]

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": parse_payload["parseId"],
            "clauseId": "4.2.1",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    spu_id = spu_payload["spuId"]

    gate_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_id,
            "inputs": {
                "massHoleSand": 2850.5,
                "massSandCone": 0,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {
                "projectId": "dajin-2024",
                "layerZone": "96区",
                "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            },
        },
    )
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()
    proof = gate_payload["proof"]
    assert proof["proofId"].startswith("proof_")
    assert proof["hash"].startswith("0x")

    state_resp = client.post(
        "/v1/state/transition",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "spuId": spu_id,
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert state_resp.status_code == 200
    assert state_resp.json()["status"] == "completed"

    verify_resp = client.post(
        "/v1/proof/verify",
        json={
            "proofId": proof["proofId"],
            "proofHash": proof["hash"],
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": True},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["status"] in {"valid", "invalid"}
    assert verify_payload["proofId"] == proof["proofId"]

    mapping_resp = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {"layer": "96区", "time": "2026-04-17T10:00:00Z"},
        },
    )
    assert mapping_resp.status_code == 200
    mapping_payload = mapping_resp.json()
    assert mapping_payload["location"]["stake"] == "K15+200"
    assert isinstance(mapping_payload["activeSpecs"], list)
