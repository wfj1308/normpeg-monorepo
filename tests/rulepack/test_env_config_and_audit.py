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


def test_env_config_override_and_audit_log() -> None:
    token = uuid.uuid4().hex[:8]
    temp_dir = REPO_ROOT / "uploads" / "normref" / f"cfg_env_{token}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = temp_dir / "form_asset_whitelists.json"
    cfg_path.write_text(
        json.dumps(
            {
                "form_x": {
                    "allowed_components": ["C1"],
                    "allowed_rules": ["R1"],
                    "allowed_gates": ["G1"],
                    "allowed_normRefs": ["N1"],
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    old_env = main.APP_ENV
    old_dir = main.ENV_CONFIG_DIR
    old_audit = main.NORMREF_CONFIG_AUDIT_PATH
    old_state = main.NORMREF_CONFIG_AUDIT_STATE_PATH
    try:
        main.APP_ENV = f"ut_{token}"
        main.ENV_CONFIG_DIR = temp_dir
        main.NORMREF_CONFIG_AUDIT_PATH = temp_dir / "audit.jsonl"
        main.NORMREF_CONFIG_AUDIT_STATE_PATH = temp_dir / "audit_state.json"
        out = main._load_form_asset_whitelist("form_x")
        assert out["allowed_rules"] == {"R1"}
        assert main.NORMREF_CONFIG_AUDIT_PATH.exists()
        lines = main.NORMREF_CONFIG_AUDIT_PATH.read_text(encoding="utf-8").splitlines()
        assert any("form_asset_whitelists.json" in x for x in lines)
    finally:
        main.APP_ENV = old_env
        main.ENV_CONFIG_DIR = old_dir
        main.NORMREF_CONFIG_AUDIT_PATH = old_audit
        main.NORMREF_CONFIG_AUDIT_STATE_PATH = old_state
