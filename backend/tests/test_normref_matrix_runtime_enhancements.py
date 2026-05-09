from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.main import app


def _auth_client() -> TestClient:
    return TestClient(app, headers={"Authorization": "Bearer test-token"})


def _gate_demo_input() -> dict:
    return {
        "massHoleSand": 2850.5,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def _strip_0x(value: str | None) -> str:
    text = str(value or "").strip()
    return text[2:] if text.lower().startswith("0x") else text


def test_state_query_prefers_runtime_transition_state() -> None:
    client = _auth_client()
    vuri = "v:/cn.highway/dajin/subgrade/DB-01/K15+200"
    spu_id = "highway.subgrade.compaction.4.2.1.soil@v1"

    transition_resp = client.post(
        "/api/v1/state/transition",
        json={
            "vuri": vuri,
            "spuId": spu_id,
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert transition_resp.status_code == 200

    state_resp = client.get(
        f"/api/v1/state/{quote(vuri, safe='')}",
        params={"spuId": spu_id},
    )
    assert state_resp.status_code == 200
    state_payload = state_resp.json()
    assert state_payload["currentState"] == "VALIDATED"
    assert state_payload["formStatus"] == "validated"
    assert state_payload["spuId"] == spu_id


def test_state_transition_uses_realtime_timeline_by_default() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/state/transition",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+701",
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    history = payload["history"]
    draft = datetime.fromisoformat(history[0]["enteredAt"].replace("Z", "+00:00"))
    computed = datetime.fromisoformat(history[1]["enteredAt"].replace("Z", "+00:00"))
    validated = datetime.fromisoformat(history[2]["enteredAt"].replace("Z", "+00:00"))
    deadline = datetime.fromisoformat(payload["nextActions"][0]["deadline"].replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    assert draft < computed < validated < deadline
    assert abs((validated - now).total_seconds()) < 120


def test_state_transition_can_use_fixed_demo_timeline(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_STATE_TRANSITION_FIXED_TIMELINE", "1")
    client = _auth_client()
    response = client.post(
        "/v1/state/transition",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+702",
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["history"][0]["enteredAt"] == "2026-04-17T09:00:00Z"
    assert payload["history"][1]["enteredAt"] == "2026-04-17T10:00:01Z"
    assert payload["history"][2]["enteredAt"] == "2026-04-17T10:15:30Z"
    assert payload["nextActions"][0]["deadline"] == "2026-04-17T18:00:00Z"


def test_proof_verify_uses_anchor_records_when_available() -> None:
    client = _auth_client()

    proof_resp = client.post(
        "/api/v1/proof/generate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": _gate_demo_input(),
            "context": {"projectId": "dajin-2024", "layerZone": "96区"},
        },
    )
    assert proof_resp.status_code == 200
    proof_payload = proof_resp.json()
    proof_hash = proof_payload["proof"]["hash"]
    assert proof_hash

    anchor_resp = client.post(
        "/api/v1/proof/anchor",
        json={
            "proof_hash": proof_hash,
            "anchor_type": "mock_anchor",
            "target_system": "local_mock_anchor_service",
            "external_ref": "arweave:tx-proof-001",
        },
    )
    assert anchor_resp.status_code == 200

    verify_resp = client.post(
        "/api/v1/proof/verify",
        json={
            "proofHash": proof_hash,
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": True},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert "verification" in verify_payload
    assert verify_payload["verification"]["anchorValid"] is True
    assert verify_payload["verification"]["anchorLocation"]
    assert verify_payload["timeline"]["anchored"]


def test_image_and_voice_extract_structured_fields() -> None:
    client = _auth_client()

    image_resp = client.post(
        "/api/v1/image/recognize",
        json={
            "imageUrl": "https://example.com/demo.jpg",
            "options": {"ocrText": "K15+200 压实度95.0%"},
        },
    )
    assert image_resp.status_code == 200
    image_payload = image_resp.json()
    assert image_payload["recognizedData"]["fields"]["stake"] == "K15+200"
    assert image_payload["recognizedData"]["fields"]["compactionDegree"] == 95.0

    voice_resp = client.post(
        "/api/v1/voice/transcribe",
        json={"audioText": "K15+200 压实度95.0"},
    )
    assert voice_resp.status_code == 200
    voice_payload = voice_resp.json()
    assert voice_payload["structuredData"]["fields"]["stake"] == "K15+200"
    assert voice_payload["structuredData"]["fields"]["compactionDegree"] == 95.0


def test_report_generate_returns_formats_and_runtime_query() -> None:
    client = _auth_client()

    report_resp = client.post(
        "/api/v1/report/generate",
        json={
            "projectId": "P1",
            "scope": {"startStake": "K15+000", "endStake": "K16+000"},
            "data": {"passCount": 10, "failCount": 1},
        },
    )
    assert report_resp.status_code == 200
    report_payload = report_resp.json()
    assert "formats" in report_payload
    report_id = report_payload["reportId"]
    assert report_payload["formats"]["pdf"].endswith(f"/v1/report/{report_id}.pdf")
    assert report_payload["formats"]["excel"].endswith(f"/v1/report/{report_id}.excel")
    assert report_payload["formats"]["xlsx"].endswith(f"/v1/report/{report_id}.xlsx")
    assert report_payload["formats"]["json"].endswith(f"/v1/report/{report_id}.json")

    query_resp = client.get(f"/api/v1/report/{report_id}", params={"format": "json"})
    assert query_resp.status_code == 200
    query_payload = query_resp.json()
    assert query_payload["status"] == "ready"
    assert query_payload["content"]["reportId"] == report_id
    assert isinstance(query_payload["content"]["rows"], list)

    pdf_resp = client.get(f"/v1/report/{report_id}.pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.content.startswith(b"%PDF")

    excel_resp = client.get(f"/v1/report/{report_id}.excel")
    assert excel_resp.status_code == 200
    assert b"field,value" in excel_resp.content

    xlsx_resp = client.get(f"/v1/report/{report_id}.xlsx")
    assert xlsx_resp.status_code == 200
    assert xlsx_resp.content.startswith(b"PK")

    json_file_resp = client.get(f"/v1/report/{report_id}.json")
    assert json_file_resp.status_code == 200
    assert json_file_resp.json()["reportId"] == report_id


def test_spu_generate_rejects_unknown_parse_id() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/spu/generate",
        json={
            "parseId": "parse_not_exists",
            "clauseId": "4.2.1",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert response.status_code == 400
    assert "parseId not found" in response.text


def test_spu_artifact_endpoints_after_generate() -> None:
    client = _auth_client()

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF"
    )
    parse_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": '{"extractTables":true,"extractFormulas":true}'},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": parse_payload["parseId"],
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    spu_id = spu_payload["spuId"]

    yaml_resp = client.get(f"/v1/spu/{spu_id}.yaml")
    assert yaml_resp.status_code == 200
    assert "spuId:" in yaml_resp.text
    assert spu_id in yaml_resp.text

    json_resp = client.get(f"/v1/spu/{spu_id}.json")
    assert json_resp.status_code == 200
    assert json_resp.json()["spuId"] == spu_id

    md_resp = client.get(f"/v1/spu/{spu_id}.md")
    assert md_resp.status_code == 200
    assert "Manifest (JSON)" in md_resp.text

    bundle_resp = client.get(f"/v1/spu/{spu_id}.specbundle")
    assert bundle_resp.status_code == 200
    assert len(bundle_resp.content) > 0
    with zipfile.ZipFile(io.BytesIO(bundle_resp.content)) as archive:
        names = set(archive.namelist())
    assert f"{spu_id}.yaml" in names
    assert f"{spu_id}.json" in names
    assert f"{spu_id}.md" in names


def test_spu_generate_selects_requested_clause_from_parse_catalog() -> None:
    client = _auth_client()
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF"
    )
    parse_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": "{}"},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()
    assert parse_payload["extractedData"]["clauseCount"] >= 2

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": parse_payload["parseId"],
            "clauseId": "4.2.2",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    assert spu_payload["clauseId"] == "4.2.2"
    assert spu_payload["spuId"] == "highway.subgrade.deflection.4.2.2@v1"
    assert spu_payload["clauseTitle"] == "弯沉"


def test_spu_generate_rejects_clause_not_in_parse_catalog() -> None:
    client = _auth_client()
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF"
    )
    parse_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": "{}"},
    )
    assert parse_resp.status_code == 200
    parse_payload = parse_resp.json()

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": parse_payload["parseId"],
            "clauseId": "9.9.9",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 400
    error_payload = spu_resp.json()
    assert "clauseId not found in parseId" in error_payload["detail"]["message"]
    assert "4.2.1" in error_payload["detail"]["availableClauseIds"]
    assert "4.2.2" in error_payload["detail"]["availableClauseIds"]


def test_spec_validate_rejects_invalid_gate_rules_type() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/spec/validate",
        json={
            "spu": {
                "path": {"formulas": [{"id": "a", "expr": "x=1"}]},
                "gate": {"rules": {"id": "wrong"}},
                "state": {"initial": "DRAFT", "transitions": []},
                "proof": {},
            }
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    assert any("gate.rules must be list when provided" in item for item in payload["errors"])


def test_runtime_spu_resolution_validate_and_form_render_flow() -> None:
    client = _auth_client()
    spu_generate_resp = client.post(
        "/v1/spu/generate",
        json={
            "clauseId": "9.9.9",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_generate_resp.status_code == 200
    spu_payload = spu_generate_resp.json()
    spu_id = spu_payload["spuId"]
    assert spu_id == "highway.spec.9_9_9@v1"

    spec_get_resp = client.get(f"/api/v1/spec/{spu_id}")
    assert spec_get_resp.status_code == 200
    spec_get_payload = spec_get_resp.json()
    assert spec_get_payload["source"] == "runtime_spu"
    assert spec_get_payload["spec"]["manifest"]["spuId"] == spu_id
    assert spec_get_payload["artifacts"]["yaml"].endswith(f"/v1/spu/{spu_id}.yaml")

    validate_resp = client.post("/api/v1/spec/validate", json={"spuId": spu_id})
    assert validate_resp.status_code == 200
    validate_payload = validate_resp.json()
    assert validate_payload["valid"] is True
    assert validate_payload["errors"] == []

    form_resp = client.post("/api/v1/form/render", json={"spuId": spu_id})
    assert form_resp.status_code == 200
    form_payload = form_resp.json()
    assert form_payload["form"]["fields"]
    field_names = {item["name"] for item in form_payload["form"]["fields"]}
    assert {"massHoleSand", "volumeSand", "moistureContent", "maxDryDensity"} <= field_names


def test_image_and_voice_support_multipart_uploads() -> None:
    client = _auth_client()

    image_resp = client.post(
        "/api/v1/image/recognize",
        files={"file": ("K15+210_95.jpg", b"image-bytes", "image/jpeg")},
        data={
            "options": '{"ocrText":"K15+210 compaction 95.0%"}',
            "metadata": '{"scene":"site-photo"}',
        },
    )
    assert image_resp.status_code == 200
    image_payload = image_resp.json()
    assert image_payload["recognizedData"]["fields"]["stake"] == "K15+210"
    assert image_payload["recognizedData"]["fields"]["compactionDegree"] == 95.0
    assert image_payload["recognizedData"]["metadata"]["upload"]["fileName"] == "K15+210_95.jpg"

    voice_resp = client.post(
        "/api/v1/voice/transcribe",
        files={"file": ("voice.txt", b"K15+211 compaction 94.5%", "audio/wav")},
        data={
            "metadata": '{"source":"inspector"}',
        },
    )
    assert voice_resp.status_code == 200
    voice_payload = voice_resp.json()
    assert voice_payload["structuredData"]["fields"]["stake"] == "K15+211"
    assert voice_payload["structuredData"]["fields"]["compactionDegree"] == 94.5
    assert voice_payload["structuredData"]["metadata"]["upload"]["fileName"] == "voice.txt"


def test_runtime_generated_spu_can_execute_gate_path_and_proof() -> None:
    client = _auth_client()

    spu_generate_resp = client.post(
        "/v1/spu/generate",
        json={
            "clauseId": "9.9.8",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_generate_resp.status_code == 200
    spu_id = spu_generate_resp.json()["spuId"]
    assert spu_id == "highway.spec.9_9_8@v1"

    gate_payload = {
        "spuId": spu_id,
        "inputs": {
            "massHoleSand": 2850.5,
            "volumeSand": 2000,
            "moistureContent": 8.5,
            "maxDryDensity": 2.35,
        },
        "context": {"projectId": "runtime-spu-demo", "layerZone": "96区"},
    }
    gate_resp = client.post("/v1/gate/evaluate", json=gate_payload)
    assert gate_resp.status_code == 200
    gate_result = gate_resp.json()
    assert gate_result["status"] in {"PASS", "FAIL"}
    assert "compactionDegree" in gate_result["outputs"]
    assert gate_result["proof"]["hash"]

    path_resp = client.post("/v1/path/execute", json=gate_payload)
    assert path_resp.status_code == 200
    path_result = path_resp.json()
    assert path_result["status"] in {"PASS", "FAIL"}
    assert "compactionDegree" in path_result["outputs"]

    proof_resp = client.post("/v1/proof/generate", json=gate_payload)
    assert proof_resp.status_code == 200
    proof_result = proof_resp.json()
    proof_hash = proof_result["proof"]["hash"]
    assert proof_hash

    verify_resp = client.post(
        "/v1/proof/verify",
        json={
            "proofHash": proof_hash,
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": False},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["status"] == "valid"
    assert verify_payload["verification"]["hashValid"] is True
    assert verify_payload["verification"]["signaturesValid"] is True


def test_gate_execution_auto_syncs_state_without_manual_transition() -> None:
    client = _auth_client()
    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "clauseId": "9.9.7",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_id = spu_resp.json()["spuId"]
    vuri = "v:/cn.highway/dajin/subgrade/DB-01/K15+280"

    gate_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_id,
            "inputs": {
                "massHoleSand": 2000,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "runtime-spu-demo", "layerZone": "96区", "vuri": vuri},
        },
    )
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()
    assert gate_payload["status"] == "FAIL"

    state_resp = client.get(f"/v1/state/{quote(vuri, safe='')}", params={"spuId": spu_id})
    assert state_resp.status_code == 200
    state_payload = state_resp.json()
    assert state_payload["spuId"] == spu_id
    assert state_payload["currentState"] == "REJECTED"
    assert isinstance(state_payload["pendingActions"], list)
    assert state_payload["pendingActions"]


def test_gate_sync_prefers_vuri_project_context_for_mapping_visibility() -> None:
    client = _auth_client()
    stake = "K15+812"
    vuri = f"v:/cn.highway/dajin/subgrade/DB-01/{stake}"
    spu_id = "highway.subgrade.compaction.4.2.1.soil@v1"

    gate_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_id,
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {
                "projectId": "dajin-2024",
                "layerZone": "96区",
                "vuri": vuri,
            },
        },
    )
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()
    assert gate_payload["status"] in {"PASS", "FAIL"}

    mapping_resp = client.post(
        "/v1/mapping/resolve",
        json={"vuri": vuri, "context": {"layer": "96区", "time": "2026-04-17T10:00:00Z"}},
    )
    assert mapping_resp.status_code == 200
    mapping_payload = mapping_resp.json()
    assert mapping_payload["location"]["stake"] == stake
    assert mapping_payload["containers"]
    assert mapping_payload["activeSpecs"]

    target_spec = next(
        item for item in mapping_payload["activeSpecs"] if item["spuId"] == spu_id
    )
    assert target_spec["formStatus"] in {"qualified", "validated", "pending", "draft"}
    assert _strip_0x(target_spec.get("lastProof")) == _strip_0x(gate_payload["proof"]["hash"])


def test_v1_matrix_endpoints_require_bearer_token() -> None:
    client = TestClient(app)
    response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert response.status_code == 401
    payload = response.json()
    assert payload["detail"] == "MISSING_BEARER_TOKEN"


def test_v1_matrix_endpoints_validate_expected_bearer_token(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_BEARER_TOKEN", "demo-secret")
    client = TestClient(app, headers={"Authorization": "Bearer wrong-token"})
    reject_response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert reject_response.status_code == 401
    assert reject_response.json()["detail"] == "INVALID_BEARER_TOKEN"

    accepted_client = TestClient(app, headers={"Authorization": "Bearer demo-secret"})
    accepted_response = accepted_client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert accepted_response.status_code == 200


def test_api_v1_matrix_endpoints_allow_anonymous_by_default() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert response.status_code == 200


def test_api_v1_matrix_endpoints_can_require_bearer_token(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_REQUIRE_AUTH_API_V1", "1")
    monkeypatch.setenv("NORMREF_BEARER_TOKEN", "demo-token")
    client = TestClient(app)
    reject_response = client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert reject_response.status_code == 401
    assert reject_response.json()["detail"] == "MISSING_BEARER_TOKEN"

    accepted_client = TestClient(app, headers={"Authorization": "Bearer demo-token"})
    accepted_response = accepted_client.post(
        "/api/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert accepted_response.status_code == 200


def test_v1_matrix_endpoints_return_config_missing_when_bearer_secret_absent(monkeypatch) -> None:
    monkeypatch.delenv("NORMREF_BEARER_TOKEN", raising=False)
    monkeypatch.setenv("NORMREF_ALLOW_ANY_BEARER", "0")
    client = TestClient(app, headers={"Authorization": "Bearer any-token"})
    response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200"},
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "AUTH_CONFIG_MISSING"


def test_pdf_provider_can_fallback_to_mock_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_PDF_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_PDF_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "1")

    client = _auth_client()
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    response = client.post(
        "/v1/pdf/parse",
        files={"file": ("fallback.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": "{}"},
    )
    assert response.status_code == 200
    payload = response.json()
    provider = payload["extractedData"]["metadata"]["provider"]
    assert provider["mode"] == "mock"
    assert provider["fallback"] is True
    assert provider["requestedMode"] == "http"


def test_pdf_provider_strict_mode_returns_502_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_PDF_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_PDF_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "0")

    client = _auth_client()
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    response = client.post(
        "/v1/pdf/parse",
        files={"file": ("strict.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": "{}"},
    )
    assert response.status_code == 502
    assert "PDF_PROVIDER_ERROR" in response.text


def test_image_provider_can_fallback_to_mock_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_IMAGE_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_IMAGE_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "1")

    client = _auth_client()
    response = client.post(
        "/v1/image/recognize",
        json={
            "imageUrl": "https://example.com/k15_200.jpg",
            "options": {"ocrText": "K15+200 compaction 95.0%"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    provider = payload["recognizedData"]["metadata"]["provider"]
    assert provider["mode"] == "mock"
    assert provider["fallback"] is True
    assert provider["requestedMode"] == "http"
    assert payload["recognizedData"]["fields"]["stake"] == "K15+200"


def test_image_provider_strict_mode_returns_502_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_IMAGE_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_IMAGE_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "0")

    client = _auth_client()
    response = client.post(
        "/v1/image/recognize",
        json={
            "imageUrl": "https://example.com/k15_200.jpg",
            "options": {"ocrText": "K15+200 compaction 95.0%"},
        },
    )
    assert response.status_code == 502
    assert "IMAGE_PROVIDER_ERROR" in response.text


def test_voice_provider_can_fallback_to_mock_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_VOICE_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_VOICE_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "1")

    client = _auth_client()
    response = client.post(
        "/v1/voice/transcribe",
        json={"audioText": "K15+201 compaction 94.5"},
    )
    assert response.status_code == 200
    payload = response.json()
    provider = payload["structuredData"]["metadata"]["provider"]
    assert provider["mode"] == "mock"
    assert provider["fallback"] is True
    assert provider["requestedMode"] == "http"
    assert payload["structuredData"]["fields"]["stake"] == "K15+201"


def test_voice_provider_strict_mode_returns_502_when_provider_fails(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_VOICE_PROVIDER", "http")
    monkeypatch.delenv("NORMREF_VOICE_PROVIDER_URL", raising=False)
    monkeypatch.setenv("NORMREF_PROVIDER_FALLBACK", "0")

    client = _auth_client()
    response = client.post(
        "/v1/voice/transcribe",
        json={"audioText": "K15+201 compaction 94.5"},
    )
    assert response.status_code == 502
    assert "VOICE_PROVIDER_ERROR" in response.text


def test_gate_response_exposes_calculation_metadata() -> None:
    client = _auth_client()
    spu_id = "highway.subgrade.compaction.4.2.1.soil@v1"
    response = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_id,
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "demo", "layerZone": "96区"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["calculation"]["mode"] in {"demo_calibrated", "strict_formula"}
    assert payload["calculation"]["displayFormula"] == "compactionDegree = (dryDensity / maxDryDensity) * 100"
    assert payload["trace"][-1]["formula"] == "compactionDegree = (dryDensity / maxDryDensity) * 100"
    assert "appliedFormula" in payload["trace"][-1]


def test_gate_strict_formula_mode_is_supported(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_STRICT_COMPACTION_FORMULA", "1")
    client = _auth_client()
    response = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "demo", "layerZone": "96区"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["calculation"]["mode"] == "strict_formula"
    assert payload["trace"][-1]["appliedFormula"] == "compactionDegree = (dryDensity / maxDryDensity) * 100"


def test_gate_can_switch_formula_mode_via_request_context() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {
                "projectId": "demo",
                "layerZone": "96区",
                "formulaMode": "strict_formula",
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["calculation"]["mode"] == "strict_formula"
    assert payload["trace"][-1]["appliedFormula"] == "compactionDegree = (dryDensity / maxDryDensity) * 100"
    assert payload["outputs"]["compactionDegree"] < 93


def test_path_execute_honors_context_formula_mode_switch() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/path/execute",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {
                "projectId": "demo",
                "layerZone": "96区",
                "compactionFormulaMode": "strict_formula",
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["outputs"]["compactionDegree"] < 93


def test_pdf_builtin_provider_exposes_extraction_metadata(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_PDF_PROVIDER", "builtin")
    client = _auth_client()
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 53 >>\nstream\nBT /F1 12 Tf 10 10 Td (4.2.1 Compaction) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        b"0000000195 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n300\n%%EOF"
    )
    response = client.post(
        "/v1/pdf/parse",
        files={"file": ("builtin.pdf", pdf_bytes, "application/pdf")},
        data={"standardCode": "JTG F80/1-2017", "options": '{"extractTables":true,"extractFormulas":true}'},
    )
    assert response.status_code == 200
    payload = response.json()
    metadata = payload["extractedData"]["metadata"]
    assert metadata["provider"]["mode"] == "builtin"
    assert metadata["textExtractEngine"] in {"pypdf", "none"}
    assert isinstance(metadata["detectedClauseCount"], int)
    assert payload["extractedData"]["clauseCount"] >= 2


def test_image_builtin_provider_reports_builtin_metadata(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_IMAGE_PROVIDER", "builtin")
    client = _auth_client()
    response = client.post(
        "/v1/image/recognize",
        json={
            "imageUrl": "https://example.com/site.jpg",
            "options": {"ocrText": "K15+222 compaction 95.2%"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["recognizedData"]["fields"]["stake"] == "K15+222"
    assert payload["recognizedData"]["fields"]["compactionDegree"] == 95.2
    provider = payload["recognizedData"]["metadata"]["provider"]
    assert provider["mode"] == "builtin"
    assert "ocrEngine" in provider


def test_voice_builtin_provider_can_parse_uploaded_text_blob(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_VOICE_PROVIDER", "builtin")
    client = _auth_client()
    response = client.post(
        "/v1/voice/transcribe",
        files={"file": ("voice.txt", b"K15+223 compaction 94.8", "audio/wav")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["structuredData"]["fields"]["stake"] == "K15+223"
    assert payload["structuredData"]["fields"]["compactionDegree"] == 94.8
    provider = payload["structuredData"]["metadata"]["provider"]
    assert provider["mode"] == "builtin"
    assert payload["structuredData"]["metadata"]["transcriber"]["engine"] == "rule_based_builtin"


def test_image_builtin_provider_can_ocr_fetched_remote_bytes(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_IMAGE_PROVIDER", "builtin")
    monkeypatch.setattr(main_module, "_fetch_remote_bytes", lambda url: b"image-bytes")
    monkeypatch.setattr(
        main_module,
        "_extract_text_from_image_builtin",
        lambda payload, language: ("K15+456 compaction 96.3%", "pytesseract"),
    )

    client = _auth_client()
    response = client.post(
        "/v1/image/recognize",
        json={"imageUrl": "https://example.com/remote-site.jpg", "options": {}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["recognizedData"]["fields"]["stake"] == "K15+456"
    assert payload["recognizedData"]["fields"]["compactionDegree"] == 96.3
    provider = payload["recognizedData"]["metadata"]["provider"]
    assert provider["mode"] == "builtin"
    assert provider["ocrEngine"] == "pytesseract"


def test_voice_builtin_provider_can_transcribe_audio_bytes_via_engine(monkeypatch) -> None:
    monkeypatch.setenv("NORMREF_VOICE_PROVIDER", "builtin")
    monkeypatch.setattr(
        main_module,
        "_transcribe_audio_bytes_builtin",
        lambda payload, language: ("K15+457 compaction 94.9", "speech_recognition_google"),
    )

    client = _auth_client()
    response = client.post(
        "/v1/voice/transcribe",
        files={"file": ("voice.wav", b"RIFF\x00\x00", "audio/wav")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["structuredData"]["fields"]["stake"] == "K15+457"
    assert payload["structuredData"]["fields"]["compactionDegree"] == 94.9
    provider = payload["structuredData"]["metadata"]["provider"]
    assert provider["mode"] == "builtin"
    assert provider["engine"] == "speech_recognition_google"
    assert payload["structuredData"]["metadata"]["transcriber"]["engine"] == "speech_recognition_google"


def test_proof_verify_supports_gate_proof_id_without_hash() -> None:
    client = _auth_client()
    gate_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "demo-proof-id", "layerZone": "96区"},
        },
    )
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()
    proof = gate_payload["proof"]
    assert proof["proofId"].startswith("proof_")
    assert proof["hash"].startswith("0x")

    verify_resp = client.post(
        "/v1/proof/verify",
        json={
            "proofId": proof["proofId"],
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": False},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["status"] == "valid"
    assert verify_payload["proofId"] == proof["proofId"]


def test_gate_repeat_same_vuri_is_idempotent_and_no_utxo_conflict() -> None:
    client = _auth_client()
    payload = {
        "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
        "inputs": {
            "massHoleSand": 2850.5,
            "volumeSand": 2000,
            "moistureContent": 8.5,
            "maxDryDensity": 2.35,
        },
        "context": {
            "projectId": "demo-idempotent",
            "layerZone": "96",
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+777",
        },
    }

    first = client.post("/v1/gate/evaluate", json=payload)
    assert first.status_code == 200
    second = client.post("/v1/gate/evaluate", json=payload)
    assert second.status_code == 200
    second_payload = second.json()
    assert second_payload["status"] in {"PASS", "FAIL"}
    assert second_payload["proof"]["hash"].startswith("0x")


def test_proof_verify_content_uses_stake_from_vuri_context() -> None:
    client = _auth_client()
    target_stake = "K15+778"
    vuri = f"v:/cn.highway/dajin/subgrade/DB-01/{target_stake}"
    gate_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": "highway.subgrade.compaction.4.2.1.soil@v1",
            "inputs": {
                "massHoleSand": 2850.5,
                "volumeSand": 2000,
                "moistureContent": 8.5,
                "maxDryDensity": 2.35,
            },
            "context": {"projectId": "demo-stake-propagation", "layerZone": "96", "vuri": vuri},
        },
    )
    assert gate_resp.status_code == 200
    gate_payload = gate_resp.json()

    verify_resp = client.post(
        "/v1/proof/verify",
        json={
            "proofId": gate_payload["proof"]["proofId"],
            "proofHash": gate_payload["proof"]["hash"],
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": False},
        },
    )
    assert verify_resp.status_code == 200
    verify_payload = verify_resp.json()
    assert verify_payload["status"] == "valid"
    assert verify_payload["content"]["inputs"]["stake"] == target_stake


def test_mapping_resolve_unknown_stake_returns_synthetic_non_empty_view() -> None:
    client = _auth_client()
    response = client.post(
        "/v1/mapping/resolve",
        json={"vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+889", "context": {"layer": "96"}},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["location"]["stake"] == "K15+889"
    assert payload["containers"]
    assert payload["volumes"]
    assert payload["activeSpecs"]
    assert payload["pendingActions"]
