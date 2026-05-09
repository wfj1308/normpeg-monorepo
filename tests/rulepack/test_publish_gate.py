from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_publish_gate_blocks_on_missing_gate_ref_and_unresolved() -> None:
    job_id = "ut_publish_gate_block"
    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp_path = rp_dir / f"X-v1-bridge_shi_13-{job_id}.rulepack.json"
    payload = {
        "meta": {"form_code": "bridge_shi_13", "job_id": job_id},
        "schema_validation": {"valid": True},
        "rules": [{"rule_id": "R1"}],
        "gates": [{"gate_id": "G1"}],
        "unresolved": {"count": 1},
        "measurement_gate_mapping": {"missing_count": 1},
    }
    rp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    rep = main._publish_gate_check_rulepacks(job_id)
    assert rep["ok"] is False
    txt = "\n".join(rep["blockers"])
    assert "unresolved_count=1" in txt
    assert "missing_gateRef_count=1" in txt


def test_quality_redlines_and_quality_gate_result_file() -> None:
    job_id = "ut_quality_redline"
    form_code = "bridge_shi_13"
    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)

    prev_name = f"X-v1-{form_code}-ut_quality_prev.rulepack.json"
    prev_payload = {
        "meta": {"form_code": form_code, "job_id": "ut_quality_prev"},
        "schema_validation": {"valid": True},
        "rules": [{"rule_id": "R1"}],
        "gates": [{"gate_id": "G1"}],
        "unresolved": {"count": 0},
        "measurement_gate_mapping": {"missing_count": 0},
        "docpeg_coverage": {"missing_gateRef_rate": 0.0},
        "e2e_validation": {"enabled": True, "passed": True, "expected": {"pass_case": "PASS", "fail_case": "FAIL"}, "actual": {"pass_case": "PASS", "fail_case": "FAIL"}},
    }
    (rp_dir / prev_name).write_text(json.dumps(prev_payload, ensure_ascii=False), encoding="utf-8")

    cur_name = f"X-v1-{form_code}-{job_id}.rulepack.json"
    cur_payload = {
        "meta": {"form_code": form_code, "job_id": job_id},
        "schema_validation": {"valid": True},
        "rules": [{"rule_id": "R1", "padding": "x" * 2000000}],
        "gates": [{"gate_id": "G1"}],
        "unresolved": {"count": 1},
        "measurement_gate_mapping": {"missing_count": 1},
        "docpeg_coverage": {"missing_gateRef_rate": 0.1},
        "e2e_validation": {"enabled": True, "passed": False, "expected": {"pass_case": "PASS", "fail_case": "FAIL"}, "actual": {"pass_case": "FAIL", "fail_case": "FAIL"}},
    }
    (rp_dir / cur_name).write_text(json.dumps(cur_payload, ensure_ascii=False), encoding="utf-8")

    rep = main._publish_gate_check_rulepacks(job_id)
    assert rep["ok"] is False
    txt = "\n".join(rep["blockers"])
    assert "gateRef 缺失率" in txt
    assert "unresolved_count=1" in txt
    assert "大小异常增长 >30%" in txt
    assert rep.get("rollback_required") is True
    qg = REPO_ROOT / "uploads" / "normref" / "artifacts" / job_id / "quality_gate_result.json"
    assert qg.exists()
