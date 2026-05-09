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


def _write_dummy_rulepack(name: str) -> None:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(json.dumps({"meta": {"form_code": "bridge_shi_13"}}, ensure_ascii=False), encoding="utf-8")


def test_release_and_resolve_runtime_with_gray() -> None:
    form_code = f"bridge_shi_13_release_ut_{uuid.uuid4().hex[:8]}"
    _write_dummy_rulepack("vA.rulepack.json")
    _write_dummy_rulepack("vB.rulepack.json")
    main.approve_rulepack_snapshot_diff(main.RulepackSnapshotApproveRequest(form_code=form_code, version="vA.rulepack.json", operator="ut"))
    main.approve_rulepack_snapshot_diff(main.RulepackSnapshotApproveRequest(form_code=form_code, version="vB.rulepack.json", operator="ut"))
    req = main.RulepackReleaseRequest(form_code=form_code, version="vA.rulepack.json", operator="op1", gray_ratio=1.0, canary_version="vB.rulepack.json")
    r = main.release_rulepack_by_form(req)
    assert r["status"] == "ok"
    resolved = main.resolve_runtime_rulepack(form_code, subject="user1")
    assert resolved["status"] == "ok"
    assert resolved["selected_version"] == "vB.rulepack.json"


def test_rollback_to_previous_version() -> None:
    form_code = f"bridge_shi_13_rollback_ut_{uuid.uuid4().hex[:8]}"
    _write_dummy_rulepack("v1.rulepack.json")
    _write_dummy_rulepack("v2.rulepack.json")
    main.approve_rulepack_snapshot_diff(main.RulepackSnapshotApproveRequest(form_code=form_code, version="v1.rulepack.json", operator="ut"))
    main.approve_rulepack_snapshot_diff(main.RulepackSnapshotApproveRequest(form_code=form_code, version="v2.rulepack.json", operator="ut"))
    main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version="v1.rulepack.json", operator="op1"))
    main.release_rulepack_by_form(main.RulepackReleaseRequest(form_code=form_code, version="v2.rulepack.json", operator="op2"))
    rb = main.rollback_rulepack_by_form(main.RulepackRollbackRequest(form_code=form_code, operator="op3"))
    assert rb["status"] == "ok"
    cur = main.get_current_rulepack_release(form_code)
    assert cur["current"]["active_version"] == "v1.rulepack.json"
