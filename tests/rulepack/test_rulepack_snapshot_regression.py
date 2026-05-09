from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _write_rulepack(name: str, *, form_code: str, rules: list[dict], gates: list[dict], components: list[dict]) -> None:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {"form_code": form_code, "spec_code": "JTG/T-3650-2020", "spec_version": "2020", "package_version": "v1"},
        "rules": rules,
        "gates": gates,
        "components": components,
    }
    (d / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def test_release_blocks_when_snapshot_diff_unapproved() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_snapshot_block_ut_{token}"
    v1 = f"snap-block-v1-{token}.rulepack.json"
    v2 = f"snap-block-v2-{token}.rulepack.json"
    _write_rulepack(
        v1,
        form_code=form_code,
        rules=[{"rule_id": "R1", "field": "a", "max": 1}],
        gates=[{"gate_id": "G1", "rule_ids": ["R1"]}],
        components=[{"component_id": "C1"}],
    )
    _write_rulepack(
        v2,
        form_code=form_code,
        rules=[{"rule_id": "R2", "field": "b", "max": 2}],
        gates=[{"gate_id": "G2", "rule_ids": ["R2"]}],
        components=[{"component_id": "C2"}],
    )
    main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version=v1, operator="op1"))
    with pytest.raises(main.HTTPException) as ei:
        main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version=v2, operator="op2"))
    assert ei.value.status_code == 400
    assert "snapshot 差异且未经确认" in str(ei.value.detail)


def test_release_passes_after_snapshot_diff_approval() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_snapshot_approve_ut_{token}"
    v1 = f"snap-approve-v1-{token}.rulepack.json"
    v2 = f"snap-approve-v2-{token}.rulepack.json"
    _write_rulepack(
        v1,
        form_code=form_code,
        rules=[{"rule_id": "R1", "field": "a", "max": 1}],
        gates=[{"gate_id": "G1", "rule_ids": ["R1"]}],
        components=[{"component_id": "C1"}],
    )
    _write_rulepack(
        v2,
        form_code=form_code,
        rules=[{"rule_id": "R1", "field": "a", "max": 9}],  # changed
        gates=[{"gate_id": "G1", "rule_ids": ["R1"]}],
        components=[{"component_id": "C1"}],
    )
    main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version=v1, operator="op1"))
    ap = main.approve_rulepack_snapshot_diff(
        main.RulepackSnapshotApproveRequest(form_code=form_code, version=v2, operator="reviewer", reason="expected update")
    )
    assert ap["status"] == "ok"
    out = main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version=v2, operator="op2"))
    assert out["status"] == "ok"
    assert out["current"]["active_version"] == v2
