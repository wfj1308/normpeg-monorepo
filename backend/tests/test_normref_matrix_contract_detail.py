from __future__ import annotations

from urllib.parse import quote

from fastapi.testclient import TestClient

from backend.app.main import app


def _auth_client() -> TestClient:
    return TestClient(app, headers={"Authorization": "Bearer test-token"})


def _demo_pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n"
        b"4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 100 100 Td (Hello PDF) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n"
        b"0000000207 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n310\n%%EOF"
    )


def _gate_pass_input() -> dict:
    return {
        "massHoleSand": 2850.5,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def _gate_fail_input() -> dict:
    return {
        "massHoleSand": 2000,
        "massSandCone": 0,
        "volumeSand": 2000,
        "moistureContent": 8.5,
        "maxDryDensity": 2.35,
    }


def test_normref_full_matrix_contract_detail() -> None:
    client = _auth_client()

    pdf_resp = client.post(
        "/v1/pdf/parse",
        files={"file": ("JTG_F80_1_2017.pdf", _demo_pdf_bytes(), "application/pdf")},
        data={
            "standardCode": "JTG F80/1-2017",
            "options": '{"extractTables":true,"extractFormulas":true}',
        },
    )
    assert pdf_resp.status_code == 200
    pdf_payload = pdf_resp.json()
    assert pdf_payload["parseId"]
    assert pdf_payload["status"] == "success"
    assert pdf_payload["confidence"] > 0
    assert pdf_payload["reviewRequired"] in {True, False}
    assert pdf_payload["estimatedSPU"]
    assert pdf_payload["extractedData"]["metadata"]["standardCode"] == "JTG F80/1-2017"
    assert pdf_payload["extractedData"]["clauseCount"] >= 2
    assert isinstance(pdf_payload["extractedData"]["chapters"], list)
    assert isinstance(pdf_payload["extractedData"]["tables"], list)
    assert isinstance(pdf_payload["extractedData"]["formulas"], list)

    image_resp = client.post(
        "/v1/image/recognize",
        json={
            "imageUrl": "https://example.com/demo.jpg",
            "options": {"ocrText": "K15+200 compaction 95.0%"},
        },
    )
    assert image_resp.status_code == 200
    image_payload = image_resp.json()
    assert image_payload["recognizeId"]
    assert image_payload["status"] == "success"
    assert image_payload["recognizedData"]["fields"]["stake"] == "K15+200"

    voice_resp = client.post(
        "/v1/voice/transcribe",
        json={"audioText": "K15+201 compaction 94.5"},
    )
    assert voice_resp.status_code == 200
    voice_payload = voice_resp.json()
    assert voice_payload["transcribeId"]
    assert voice_payload["status"] == "success"
    assert voice_payload["structuredData"]["fields"]["stake"] == "K15+201"

    mapping_resp = client.post(
        "/v1/mapping/resolve",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "context": {"layer": "96", "time": "2026-04-17T10:00:00Z"},
        },
    )
    assert mapping_resp.status_code == 200
    mapping_payload = mapping_resp.json()
    assert mapping_payload["location"]["stake"] == "K15+200"
    assert isinstance(mapping_payload["location"]["absoluteChainage"], int)
    assert "coordinates" in mapping_payload["location"]
    assert isinstance(mapping_payload["containers"], list) and mapping_payload["containers"]
    assert mapping_payload["containers"][0]["containerId"] == "DB-01"
    assert mapping_payload["containers"][0]["range"] == "K15+000~K16+000"
    assert isinstance(mapping_payload["volumes"], list) and mapping_payload["volumes"]
    assert mapping_payload["volumes"][0]["unit"] == "m\u00b3"
    geometry = mapping_payload["volumes"][0]["geometry"]
    assert set(["length", "width", "height", "slopeRatio"]) <= set(geometry.keys())
    assert isinstance(mapping_payload["activeSpecs"], list)
    assert isinstance(mapping_payload["pendingActions"], list)
    assert mapping_payload["activeSpecs"][0]["lastProof"] == "0xabc123def456..."
    assert mapping_payload["activeSpecs"][0]["executedAt"] == "2026-04-15T14:30:00Z"
    assert any(item.get("name") == "\u8def\u57fa\u538b\u5b9e\u5ea6\uff08\u571f\u8d28\uff09" for item in mapping_payload["activeSpecs"])
    assert any(
        item.get("description") == "\u538b\u5b9e\u5ea6\u5df2\u5408\u683c\uff0c\u9700\u8fdb\u884c\u5f2f\u6c89\u68c0\u6d4b"
        for item in mapping_payload["pendingActions"]
    )

    mapping_range_resp = client.post(
        "/v1/mapping/query-range",
        json={
            "startStake": "K15+000",
            "endStake": "K16+000",
            "filters": {},
        },
    )
    assert mapping_range_resp.status_code == 200
    mapping_range_payload = mapping_range_resp.json()
    assert mapping_range_payload["range"]["startStake"] == "K15+000"
    assert mapping_range_payload["range"]["endStake"] == "K16+000"

    spu_resp = client.post(
        "/v1/spu/generate",
        json={
            "parseId": pdf_payload["parseId"],
            "clauseId": "4.2.1",
            "standardCode": "JTG F80/1-2017",
            "options": {"includeForm": True, "includePath": True, "includeGate": True},
        },
    )
    assert spu_resp.status_code == 200
    spu_payload = spu_resp.json()
    assert spu_payload["status"] == "generated"
    assert spu_payload["spuId"]
    assert spu_payload["formats"]["yaml"].startswith("https://api.normref.com/v1/spu/")
    assert spu_payload["formats"]["json"].startswith("https://api.normref.com/v1/spu/")
    assert spu_payload["formats"]["markdown"].startswith("https://api.normref.com/v1/spu/")
    assert spu_payload["bundle"].startswith("https://api.normref.com/v1/spu/")
    assert spu_payload["formats"]["yaml"].endswith(".yaml")
    assert spu_payload["formats"]["json"].endswith(".json")
    assert spu_payload["formats"]["markdown"].endswith(".md")
    assert spu_payload["bundle"].endswith(".specbundle")

    spec_get_resp = client.get(f"/v1/spec/{spu_payload['spuId']}")
    assert spec_get_resp.status_code == 200
    spec_validate_resp = client.post("/v1/spec/validate", json={"spuId": spu_payload["spuId"]})
    assert spec_validate_resp.status_code == 200
    assert spec_validate_resp.json()["valid"] is True

    gate_pass_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_payload["spuId"],
            "inputs": _gate_pass_input(),
            "context": {
                "projectId": "dajin-2024",
                "layerZone": "96",
                "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            },
        },
    )
    assert gate_pass_resp.status_code == 200
    gate_pass_payload = gate_pass_resp.json()
    assert gate_pass_payload["executionId"]
    assert gate_pass_payload["status"] == "PASS"
    assert gate_pass_payload["outputs"]["compactionDegree"] >= 90
    assert set(gate_pass_payload["outputs"].keys()) == {"wetDensity", "dryDensity", "compactionDegree"}
    assert isinstance(gate_pass_payload["trace"], list) and gate_pass_payload["trace"]
    assert gate_pass_payload["trace"][-1]["formula"] == "compactionDegree = (dryDensity / maxDryDensity) * 100"
    assert isinstance(gate_pass_payload["gateResults"], list) and gate_pass_payload["gateResults"]
    assert gate_pass_payload["proof"]["proofId"]
    assert gate_pass_payload["proof"]["hash"].startswith("0x")
    assert gate_pass_payload["proof"]["status"] == "pending_signatures"
    assert set(gate_pass_payload["proof"]["requiredSignatures"]) == {"lab", "supervision"}

    gate_fail_resp = client.post(
        "/v1/gate/evaluate",
        json={
            "spuId": spu_payload["spuId"],
            "inputs": _gate_fail_input(),
            "context": {"projectId": "dajin-2024", "layerZone": "96"},
        },
    )
    assert gate_fail_resp.status_code == 200
    gate_fail_payload = gate_fail_resp.json()
    assert gate_fail_payload["status"] == "FAIL"
    assert gate_fail_payload["gateResults"][0]["message"] == "压实度必须 ≥ 93%"
    assert gate_fail_payload["proof"]["status"] == "rejected"
    assert gate_fail_payload["proof"]["requiredSignatures"] == []
    assert "85.1%" in gate_fail_payload["proof"]["blockReason"]
    assert "93%" in gate_fail_payload["proof"]["blockReason"]

    path_resp = client.post(
        "/v1/path/execute",
        json={
            "spuId": spu_payload["spuId"],
            "inputs": _gate_pass_input(),
            "context": {"projectId": "dajin-2024", "layerZone": "96"},
        },
    )
    assert path_resp.status_code == 200
    path_payload = path_resp.json()
    assert path_payload["executionId"]
    assert isinstance(path_payload["outputs"], dict)

    state_transition_resp = client.post(
        "/v1/state/transition",
        json={
            "vuri": "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
            "spuId": spu_payload["spuId"],
            "fromState": "COMPUTED",
            "toState": "VALIDATED",
            "triggeredBy": "did:peg:ins_001",
            "signatures": {"lab": "0xsign123"},
        },
    )
    assert state_transition_resp.status_code == 200
    state_transition_payload = state_transition_resp.json()
    assert state_transition_payload["transitionId"]
    assert state_transition_payload["status"] == "completed"
    assert state_transition_payload["stateMachine"]["current"] == "VALIDATED"

    vuri = "v:/cn.highway/dajin/subgrade/DB-01/K15+200"
    state_get_resp = client.get(f"/v1/state/{quote(vuri, safe='')}", params={"spuId": spu_payload["spuId"]})
    assert state_get_resp.status_code == 200
    state_get_payload = state_get_resp.json()
    assert state_get_payload["vuri"] == vuri
    assert state_get_payload["spuId"] == spu_payload["spuId"]
    assert state_get_payload["currentState"]

    proof_generate_resp = client.post(
        "/v1/proof/generate",
        json={
            "spuId": spu_payload["spuId"],
            "inputs": _gate_pass_input(),
            "context": {"projectId": "dajin-2024"},
        },
    )
    assert proof_generate_resp.status_code == 200
    proof_generate_payload = proof_generate_resp.json()
    proof_hash = proof_generate_payload["proof"]["hash"]
    assert proof_hash

    proof_verify_resp = client.post(
        "/v1/proof/verify",
        json={
            "proofHash": proof_hash,
            "verifyOptions": {"includeTrace": True, "verifySignatures": True, "checkAnchor": True},
        },
    )
    assert proof_verify_resp.status_code == 200
    proof_verify_payload = proof_verify_resp.json()
    assert proof_verify_payload["status"] in {"valid", "invalid"}
    assert "hashValid" in proof_verify_payload["verification"]
    assert "signaturesValid" in proof_verify_payload["verification"]
    assert "anchorValid" in proof_verify_payload["verification"]
    assert proof_verify_payload["content"]["spuId"] == spu_payload["spuId"]
    assert "compactionDegree" in proof_verify_payload["content"]["outputs"]
    assert set(proof_verify_payload["content"]["outputs"].keys()) == {"wetDensity", "dryDensity", "compactionDegree"}
    assert isinstance(proof_verify_payload["content"]["gateResults"], list)
    assert proof_verify_payload["content"]["gateResults"]
    assert "ruleId" in proof_verify_payload["content"]["gateResults"][0]
    assert isinstance(proof_verify_payload["content"]["trace"], list)
    assert proof_verify_payload["content"]["trace"]
    assert proof_verify_payload["timeline"]["anchored"]
    assert str(proof_verify_payload["reproductionHash"]).startswith("0x")

    form_render_resp = client.post("/v1/form/render", json={"spuId": spu_payload["spuId"], "context": {}, "values": {}})
    assert form_render_resp.status_code == 200
    form_render_payload = form_render_resp.json()
    assert form_render_payload["spuId"] == spu_payload["spuId"]
    assert isinstance(form_render_payload["form"]["fields"], list)

    report_generate_resp = client.post(
        "/v1/report/generate",
        json={
            "reportType": "quality_assessment",
            "projectId": "dajin-2024",
            "scope": {"startStake": "K15+000", "endStake": "K16+000"},
            "data": {"passCount": 10, "failCount": 1},
        },
    )
    assert report_generate_resp.status_code == 200
    report_payload = report_generate_resp.json()
    report_id = report_payload["reportId"]
    assert report_payload["status"] == "generated"
    assert report_payload["formats"]["pdf"].endswith(f"/v1/report/{report_id}.pdf")
    assert report_payload["formats"]["excel"].endswith(f"/v1/report/{report_id}.excel")
    assert report_payload["formats"]["xlsx"].endswith(f"/v1/report/{report_id}.xlsx")
    assert report_payload["formats"]["json"].endswith(f"/v1/report/{report_id}.json")
