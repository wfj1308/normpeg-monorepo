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


def test_norm_change_workflow_transition_rollback_and_compatibility() -> None:
    token = uuid.uuid4().hex[:8]
    norm_id = f"JTG/T-3650-2020-{token}"
    form_code = f"bridge_shi_13_flow_{token}"
    old_v = "2020"
    new_v = "2026"

    main.upsert_norm_version(
        main.NormVersionUpsertRequest(
            norm_id=norm_id,
            norm_name="测试规范",
            version=old_v,
            effective_date="2020-01-01",
            source_file_hash="sha256:old",
            status="approved",
            created_by="u1",
            approved_by="r1",
        )
    )
    main.upsert_norm_version(
        main.NormVersionUpsertRequest(
            norm_id=norm_id,
            norm_name="测试规范",
            version=new_v,
            effective_date="2026-01-01",
            source_file_hash="sha256:new",
            status="approved",
            created_by="u2",
            approved_by="r2",
        )
    )

    old_rp = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": old_v, "norm_version": old_v},
        "rules": [{"rule_id": "R1", "field": "x", "operator": "<=", "threshold": {"value": 1, "min": None, "max": 1, "unit": "mm", "operator": "<=", "raw_text": ""}, "unit": "mm", "condition": "x<=1", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1", "source_text": "x<=1"}],
    }
    new_rp = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": new_v, "norm_version": new_v},
        "rules": [{"rule_id": "R1", "field": "x", "operator": "<=", "threshold": {"value": 2, "min": None, "max": 2, "unit": "mm", "operator": "<=", "raw_text": ""}, "unit": "mm", "condition": "x<=2", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/1.1", "source_clause_id": "1.1", "source_text": "x<=2"}],
    }
    _write_rulepack(f"{norm_id}-{old_v}-{form_code}-old.rulepack.json".replace("/", "_"), old_rp)
    _write_rulepack(f"{norm_id}-{new_v}-{form_code}-new.rulepack.json".replace("/", "_"), new_rp)

    a = main.transition_norm_change(
        main.NormChangeTransitionRequest(
            norm_id=norm_id,
            old_norm_version=old_v,
            new_norm_version=new_v,
            target_state="reviewed",
            operator="op1",
        )
    )
    assert a["status"] == "ok"
    cid = a["change"]["change_id"]
    b = main.transition_norm_change(
        main.NormChangeTransitionRequest(
            norm_id=norm_id,
            old_norm_version=old_v,
            new_norm_version=new_v,
            target_state="gray_release",
            operator="op2",
        )
    )
    assert b["change"]["state"] == "gray_release"
    rb = main.rollback_norm_change(main.NormChangeRollbackRequest(change_id=cid, operator="op3", reason="canary issue"))
    assert rb["change"]["state"] == "reviewed"

    c = main.transition_norm_change(
        main.NormChangeTransitionRequest(
            norm_id=norm_id,
            old_norm_version=old_v,
            new_norm_version=new_v,
            target_state="gray_release",
            operator="op4",
        )
    )
    assert c["change"]["state"] == "gray_release"
    d = main.transition_norm_change(
        main.NormChangeTransitionRequest(
            norm_id=norm_id,
            old_norm_version=old_v,
            new_norm_version=new_v,
            target_state="full_release",
            operator="op5",
        )
    )
    assert d["change"]["state"] == "full_release"
    assert int(d["change"]["impact_analysis"]["changed_clause_count"]) >= 1

    reg = main.list_norm_versions(norm_id=norm_id)
    rows = reg["versions"]
    old_row = [x for x in rows if str(x.get("version")) == old_v][0]
    new_row = [x for x in rows if str(x.get("version")) == new_v][0]
    assert str(old_row.get("status")) == "compatibility"
    assert "compatibility_until" in old_row
    assert str(new_row.get("status")) == "active"
