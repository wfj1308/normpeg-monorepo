from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_health() -> None:
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_execute_compaction_fail_on_94() -> None:
    payload = {
        "project_id": "GXX_2024_XXX",
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "test_method": "T0921",
        "compaction_degree": 94.0,
        "paragraph_values": [94.0]
    }
    resp = client.post("/api/v1/layer2/execute/compaction", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["output"]["status"] == "FAIL"
    assert data["gate"]["status"] in {"CRITICAL", "BLOCKED"}
    assert data["proof"]["proof_hash"]


def test_execute_compaction_table() -> None:
    payload = {
        "project_id": "GXX_2024_XXX",
        "rows": [
            {
                "project_id": "GXX_2024_XXX",
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "test_method": "T0921",
                "compaction_degree": 94.0,
                "paragraph_values": [94.0]
            },
            {
                "project_id": "GXX_2024_XXX",
                "stake": "K15+300",
                "layer_depth": "0-0.8m",
                "test_method": "T0921",
                "compaction_degree": 96.6,
                "paragraph_values": [96.6]
            }
        ]
    }
    resp = client.post("/api/v1/layer2/execute/compaction-table", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert data["pass_count"] == 1
    assert data["fail_count"] == 1


def test_execute_compaction_from_raw_data() -> None:
    payload = {
        "project_id": "GXX_2024_XXX",
        "stake": "K15+210",
        "layer_depth": "0-0.8m",
        "test_method": "T0921",
        "raw_data": {
            "sand_density": 1.5,
            "mass_hole_sand": 3250,
            "volume_ring": 1500,
            "moisture_content": 6.0,
            "max_dry_density": 1.45
        },
        "paragraph_values": [93.9]
    }
    resp = client.post("/api/v1/layer2/execute/compaction", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "wet_density" in data["path_outputs"]
    assert "dry_density" in data["path_outputs"]
    assert data["output"]["status"] == "FAIL"


def test_layer3_query() -> None:
    resp = client.post(
        "/api/v1/layer3/query",
        json={"project_id": "GXX_2024_XXX", "message": "K15+200 compaction 94 pass?"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["parse_trace"]["entities"]["stake"] == "K15+200"
    assert body["execution_result"]["output"]["status"] == "FAIL"
    assert "FAIL" in body["natural_language_reply"]


def test_rule_update_impact() -> None:
    payload = {
        "update": {
            "project_id": "GXX_2024_XXX",
            "component_id": "JTG_F80_1_2017.4.2.1.compaction",
            "target": "body.path.lookup_tables.standard_by_zone.Z96",
            "old_value": 95.0,
            "new_value": 96.0,
            "effective_date": "2026-04-20",
            "reason": "standard update",
            "clause_id": "JTG_F80_1_2017.4.2.1"
        },
        "records": [
            {
                "record_id": "r1",
                "stake": "K15+200",
                "checked_at": "2026-04-10T09:00:00Z",
                "compaction_degree": 95.3,
                "layer_depth": "0-0.8m",
                "status": "PASS"
            },
            {
                "record_id": "r2",
                "stake": "K15+500",
                "checked_at": "2026-04-10T11:00:00Z",
                "compaction_degree": 96.2,
                "layer_depth": "0-0.8m",
                "status": "PASS"
            }
        ]
    }
    resp = client.post("/api/v1/layer2/rule-update-impact", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["impact"]["affected_count"] == 1
    assert len(data["notifications"]) == 1
