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


def test_auto_patch_generator_supports_preview_dry_run_and_rollback() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_patch_{token}"
    v1 = f"{form_code}.v1.rulepack.json"
    v2 = f"{form_code}.v2.rulepack.json"

    p1 = {
        "meta": {"form_code": form_code, "spec_code": f"JTG-{token}", "norm_version": "2020"},
        "rules": [{"rule_id": "R1", "field": "a", "operator": "<=", "threshold": {"value": 10, "operator": "<="}, "unit": "mm"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"], "operator": "all_pass"}],
    }
    p2 = {
        "meta": {"form_code": form_code, "spec_code": f"JTG-{token}", "norm_version": "2026"},
        "rules": [
            {"rule_id": "R2", "field": "b", "operator": ">=", "threshold": {"value": 20, "operator": ">="}, "unit": "mm"},
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R2"], "operator": "all_pass"}],
    }
    _write_rulepack(v1, p1)
    _write_rulepack(v2, p2)

    reg = main._load_rulepack_release_registry()
    forms = reg.get("forms", {}) if isinstance(reg.get("forms"), dict) else {}
    forms[form_code] = {
        "form_code": form_code,
        "active_version": v2,
        "stable_version": v2,
        "history": [
            {"action": "release", "version": v1, "from_version": "", "to_version": v1, "time": "2026-01-01T00:00:00Z", "operator": "u1"},
            {"action": "release", "version": v2, "from_version": v1, "to_version": v2, "time": "2026-02-01T00:00:00Z", "operator": "u2"},
        ],
    }
    reg["forms"] = forms
    main._save_rulepack_release_registry(reg)

    out = main.auto_generate_rulepack_patch(
        main.AutoPatchGenerateRequest(form_code=form_code, base_version=v1, target_version=v2, dry_run=True, preview=True, rollback=False)
    )
    assert out["status"] == "ok"
    assert isinstance(out.get("added_rules"), list)
    assert isinstance(out.get("removed_rules"), list)
    assert isinstance(out.get("modified_gates"), list)
    assert out.get("affected_forms") == [form_code]
    assert any(str(x.get("rule_id") or "") == "R2" for x in out.get("added_rules", []))
    assert any(str(x.get("rule_id") or "") == "R1" for x in out.get("removed_rules", []))

    rb = main.auto_generate_rulepack_patch(
        main.AutoPatchGenerateRequest(form_code=form_code, operator="op_patch", dry_run=True, rollback=True, rollback_reason="test")
    )
    assert rb["status"] == "ok"
    assert rb["mode"] == "rollback"
    assert isinstance(rb.get("rollback_result"), dict)

