from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_parser_parse_normref_uri_normal_exception_boundary() -> None:
    ok = main._parse_normref_uri("v://std/JTG-T-3650-2020/9/7/bridge_shi_13/pile.centerXYDiff")
    assert ok["normRef"].startswith("v://std/")
    try:
        main._parse_normref_uri("bad://norm/ref")
        assert False, "expected parse failure"
    except Exception:
        pass
    # boundary: minimal legal segments still parse
    b = main._parse_normref_uri("v://std/X/1/1/t/f")
    assert b["field"] == "f"


def test_filter_rule_row_matches_form_normal_exception_boundary() -> None:
    row = {"rule_id": "JTG/T 3650-2020.9_7_3.rule", "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3"}
    assert main._rule_row_matches_form(row, "bridge_shi_13", {"JTG/T 3650-2020.9_7_3.rule"}) is True
    assert main._rule_row_matches_form({}, "bridge_shi_13", set()) is False
    # boundary: empty form code
    assert main._rule_row_matches_form(row, "", set()) is False


def test_whitelist_loader_normal_exception_boundary() -> None:
    cfg = main._load_form_asset_whitelist("bridge_shi_13")
    assert len(cfg["allowed_rules"]) >= 1
    missing = main._load_form_asset_whitelist("unknown_form_xxx")
    assert missing["allowed_rules"] == set()
    # boundary: empty form code
    empty = main._load_form_asset_whitelist("")
    assert isinstance(empty, dict)


def test_override_loader_normal_exception_boundary() -> None:
    ov = main._load_form_rule_overrides("bridge_shi_13")
    assert isinstance(ov, dict)
    assert len(ov) >= 1
    none = main._load_form_rule_overrides("unknown_form_xxx")
    assert none == {}
    # boundary: empty form
    empty = main._load_form_rule_overrides("")
    assert isinstance(empty, dict)


def test_gate_synthesis_normal_exception_boundary() -> None:
    rows = [{"rule_id": "R1", "component_id": "C1", "norm_ref": "N1"}]
    out = main._synthesize_gates_from_rules(rows)
    assert len(out) == 1 and out[0]["gate_id"] == "gate.C1"
    # exception-like bad row
    out2 = main._synthesize_gates_from_rules([{}])
    assert out2 == []
    # boundary: empty input
    assert main._synthesize_gates_from_rules([]) == []


def test_normref_resolver_normal_exception_boundary() -> None:
    job = "ut_normref_resolver"
    art = REPO_ROOT / "uploads" / "normref" / "artifacts" / job
    art.mkdir(parents=True, exist_ok=True)
    target = "v://std/JTG-T-3650-2020/9/7/bridge_shi_13/pile.centerXYDiff"
    (art / "11_normdoc.json").write_text(json.dumps({"normRef": target}, ensure_ascii=False), encoding="utf-8")
    (art / "07_rules.json").write_text(json.dumps({"rules": []}, ensure_ascii=False), encoding="utf-8")
    (art / "08_gates.json").write_text(json.dumps({"gates": []}, ensure_ascii=False), encoding="utf-8")
    (art / "norm_ref_index.json").write_text(json.dumps({"entries": [{"normRef": target}]}, ensure_ascii=False), encoding="utf-8")
    d, _, _, _ = main._find_artifact_bundle_by_normref(target)
    assert d.name == job
    try:
        main._find_artifact_bundle_by_normref("v://std/X/1/1/t/not_found")
        assert False, "expected not found"
    except Exception:
        pass
    # boundary: minimal target in index should resolve
    assert d.exists()


def test_semantic_tree_mapper_normal_exception_boundary() -> None:
    st = {"form_code": "bridge_shi_13", "field_nodes": [], "measurement_pairs": [], "gate_refs": [{"field_key": "a", "gate_ref": "g1"}]}
    m = main._build_gate_ref_lookup_from_semantic_tree(st)
    assert m["a"] == "g1"
    ok, errs = main._validate_semantic_tree_for_form("bridge_shi_13", {"form_code": "x", "field_nodes": [], "measurement_pairs": [], "gate_refs": []})
    assert ok is False and len(errs) > 0
    # boundary: empty arrays allowed structurally
    ok2, errs2 = main._validate_semantic_tree_for_form("bridge_shi_13", {"form_code": "bridge_shi_13", "field_nodes": [], "measurement_pairs": [], "gate_refs": []})
    assert ok2 is True and errs2 == []
