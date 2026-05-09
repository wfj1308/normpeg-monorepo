from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_load_form_asset_whitelist_has_required_keys() -> None:
    cfg = main._load_form_asset_whitelist("bridge_shi_13")
    assert "allowed_specir_ids" in cfg
    assert "allowed_components" in cfg
    assert "allowed_rules" in cfg
    assert "allowed_gates" in cfg
    assert "allowed_normRefs" in cfg
    assert isinstance(cfg["allowed_specir_ids"], set)
    assert isinstance(cfg["allowed_rules"], set)
    assert len(cfg["allowed_rules"]) >= 1
