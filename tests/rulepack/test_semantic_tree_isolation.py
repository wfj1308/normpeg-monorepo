from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_semantic_tree_must_match_form_code() -> None:
    ok, errs = main._validate_semantic_tree_for_form(
        "bridge_shi_13",
        {
            "form_code": "bridge_shi_1",
            "field_nodes": [],
            "measurement_pairs": [],
            "gate_refs": [],
        },
    )
    assert ok is False
    assert any("form_code mismatch" in e for e in errs)


def test_specbundle_load_backfills_semantic_tree_per_form() -> None:
    bundle_id = "ut.semantic.bundle@v1"
    form_code = "bridge_shi_13"
    p = main._bundle_file_path(bundle_id, "v1", form_code)
    p.parent.mkdir(parents=True, exist_ok=True)
    raw = {
        "bundleId": bundle_id,
        "bundleVersion": "v1",
        "formCode": form_code,
        "fieldRuleMap": [{"fieldKey": "pile.centerXYDiff", "fieldName": "桩位偏差", "ruleId": "R1"}],
        "rules": [],
    }
    p.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    b = main._load_specbundle(bundle_id, "v1", form_code)
    st = b.get("semanticTree", {})
    assert st.get("form_code") == form_code
    assert isinstance(st.get("field_nodes"), list)
    assert isinstance(st.get("measurement_pairs"), list)
    assert isinstance(st.get("gate_refs"), list)
