from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _write_bridge13_rulepack(name: str) -> None:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {"form_code": "bridge_shi_13", "spec_code": "JTG/T-3650-2020", "spec_version": "2020", "job_id": "ut_e2e"},
        "rules": [
            {"rule_id": "R.top", "field": "pile.topElevation.diff", "operator": "<=", "max": 100, "unit": "mm"},
            {"rule_id": "R.xy", "field": "pile.centerXYDiff", "operator": "<=", "max": 50, "unit": "mm"},
            {"rule_id": "R.incl", "field": "hole.inclination", "operator": "<=", "max": 1, "unit": "%"},
        ],
        "gates": [
            {"gate_id": "G.top", "rule_ids": ["R.top"]},
            {"gate_id": "G.xy", "rule_ids": ["R.xy"]},
            {"gate_id": "G.incl", "rule_ids": ["R.incl"]},
        ],
        "components": [
            {"component_id": "C.top"},
            {"component_id": "C.xy"},
            {"component_id": "C.incl"},
        ],
    }
    payload["e2e_validation"] = main._run_rulepack_e2e_validation("bridge_shi_13", payload)
    (d / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_e2e_form_select_download_execute_bridge13() -> None:
    version = f"bridge13-e2e-{uuid.uuid4().hex[:8]}.rulepack.json"
    _write_bridge13_rulepack(version)
    client = TestClient(main.app)
    # 避免快照回归门禁受历史基线影响，先做一次人工确认。
    ra = client.post(
        "/normref/rulepack/snapshot/approve",
        json={"form_code": "bridge_shi_13", "version": version, "operator": "ut", "reason": "e2e test baseline"},
    )
    assert ra.status_code == 200

    # 1) 页面选择 form_code -> 发布对应版本
    r1 = client.post("/normref/rulepack/release", json={"form_code": "bridge_shi_13", "version": version, "operator": "ut"})
    assert r1.status_code == 200

    # 2) 解析运行时版本并下载 rulepack
    r2 = client.get("/normref/runtime/rulepack/resolve", params={"form_code": "bridge_shi_13", "subject": "u1"})
    assert r2.status_code == 200
    selected = r2.json()["selected_version"]
    assert selected == version
    r3 = client.get(f"/normref/rulepack/download/{selected}")
    assert r3.status_code == 200
    payload = json.loads(r3.content.decode("utf-8"))

    # 3/4) 固定样本执行并校验 PASS/FAIL
    sample = main._load_rulepack_e2e_sample("bridge_shi_13")
    pass_eval = main._evaluate_rulepack_with_input(payload, sample["pass_input"])
    fail_eval = main._evaluate_rulepack_with_input(payload, sample["fail_input"])
    assert pass_eval["result"] == "PASS"
    assert fail_eval["result"] == "FAIL"


def test_publish_gate_blocks_when_e2e_failed() -> None:
    job_id = f"ut_e2e_block_{uuid.uuid4().hex[:8]}"
    name = f"X-v1-bridge_shi_13-{job_id}.rulepack.json"
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {"form_code": "bridge_shi_13", "job_id": job_id},
        "schema_validation": {"valid": True},
        "rules": [{"rule_id": "R1"}],
        "gates": [{"gate_id": "G1"}],
        "unresolved": {"count": 0},
        "measurement_gate_mapping": {"missing_count": 0},
        "e2e_validation": {"enabled": True, "passed": False, "expected": {"pass_case": "PASS"}, "actual": {"pass_case": "FAIL"}},
    }
    (d / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    rep = main._publish_gate_check_rulepacks(job_id)
    assert rep["ok"] is False
    assert any("E2E 校验失败" in x for x in rep["blockers"])
