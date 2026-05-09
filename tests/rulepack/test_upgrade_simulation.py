from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _write_rulepack(name: str, payload: dict) -> None:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def test_upgrade_simulation_report_contains_required_sections() -> None:
    token = uuid.uuid4().hex[:8]
    norm_id = f"JTG/T-3650-2020-{token}"
    form_code = f"bridge_shi_13_{token}"
    old_v = "2020"
    new_v = "2026"
    old_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "norm_version": old_v, "spec_version": old_v},
        "rules": [{"rule_id": "R1", "field": "x", "operator": "<=", "threshold": {"value": 50, "operator": "<="}, "unit": "mm", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1", "source_text": "x<=50"}],
        "unresolved": {"count": 0, "items": []},
        "runtime_regression": {"passed": True, "failed_samples": 0, "total_samples": 2},
    }
    new_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "norm_version": new_v, "spec_version": new_v},
        "rules": [{"rule_id": "R1", "field": "x", "operator": "<=", "threshold": {"value": 40, "operator": "<="}, "unit": "mm", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1", "source_text": "x<=40"}],
        "unresolved": {"count": 2, "items": [{"rule_id": "R1"}]},
        "runtime_regression": {"passed": False, "failed_samples": 1, "total_samples": 2},
    }
    _write_rulepack(f"{norm_id}-{old_v}-{form_code}-old-{token}.rulepack.json".replace("/", "_"), old_payload)
    _write_rulepack(f"{norm_id}-{new_v}-{form_code}-new-{token}.rulepack.json".replace("/", "_"), new_payload)

    out = main.simulate_norm_upgrade(
        main.UpgradeSimulationRequest(norm_id=norm_id, old_norm_version=old_v, new_norm_version=new_v)
    )
    assert out["status"] == "ok"
    assert isinstance(out.get("affected_forms"), list)
    assert isinstance(out.get("affected_gates"), list)
    assert isinstance(out.get("regression_risk"), dict)
    assert isinstance(out.get("unresolved_increase"), dict)
    assert isinstance(out.get("runtime_impact"), dict)
    report_path = Path(str(out.get("report_path") or "").strip())
    assert report_path.exists()
    rep = json.loads(report_path.read_text(encoding="utf-8"))
    assert str(rep.get("schema_version") or "").strip() == "upgrade_simulation_report.v1"

