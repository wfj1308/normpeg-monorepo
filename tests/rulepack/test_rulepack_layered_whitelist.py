from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_rulepack_asset_slice_is_strictly_whitelist_driven() -> None:
    norm_layer = {
        "rules_rows": [
            {"rule_id": "R1", "component_id": "C1", "norm_ref": "N1"},
            {"rule_id": "R2", "component_id": "C2", "norm_ref": "N2"},
        ],
        "gates_rows": [
            {"gate_id": "G1", "rule_ids": ["R1"]},
            {"gate_id": "G2", "rule_ids": ["R2"]},
        ],
        "comp_rows": [
            {"component_id": "C1"},
            {"component_id": "C2"},
        ],
        "counts": {"rules": 2, "gates": 2, "components": 2},
    }
    doc_layer = {
        "asset_whitelist": {
            "allowed_rules": {"R1"},
            "allowed_components": {"C1"},
            "allowed_gates": {"G1"},
            "allowed_normRefs": {"N1"},
        }
    }
    s = main._build_rulepack_asset_slice_from_layers(norm_layer, doc_layer)
    assert len(s["rules"]) == 1
    assert s["rules"][0]["rule_id"] == "R1"
    assert len(s["gates"]) == 1
    assert s["gates"][0]["gate_id"] == "G1"
    assert len(s["components"]) == 1
    assert s["components"][0]["component_id"] == "C1"
