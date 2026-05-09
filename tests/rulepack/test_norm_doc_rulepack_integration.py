from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _prepare_bridge13_integration_assets(job_id: str) -> None:
    art_dir = main._artifact_dir_for_job(job_id)
    _write_json(
        art_dir / "00_pipeline_index.json",
        {
            "job_id": job_id,
            "spec_code": "JTG/T-3650-2020",
            "spec_version": "2020",
            "source_doc_hash": "sha256:test-bridge13",
            "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.0",
        },
    )
    _write_json(main._review_path_for_job(job_id), {"job_id": job_id, "std_code": "JTG/T-3650-2020"})

    components = {
        "components": [
            {
                "component_id": "JTG/T 3650-2020.9_7_1.component",
                "title": "桩顶高程偏差",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.1",
                "source_clause": "9.7.1",
                "type": "measurement",
            },
            {
                "component_id": "JTG/T 3650-2020.9_7_2.component",
                "title": "桩位偏差",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.2",
                "source_clause": "9.7.2",
                "type": "measurement",
            },
            {
                "component_id": "JTG/T 3650-2020.9_7_3.component",
                "title": "倾斜度偏差",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause": "9.7.3",
                "type": "measurement",
            },
        ]
    }
    _write_json(art_dir / "05_components.json", components)

    rules = {
        "rules": [
            {
                "rule_id": "JTG/T 3650-2020.9_7_1.rule",
                "component_id": "JTG/T 3650-2020.9_7_1.component",
                "field": "pile.topElevation.diff",
                "operator": "<=",
                "max": 100,
                "unit": "mm",
                "condition": "pile.topElevation.diff <= 100",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.1",
                "source_clause": "9.7.1",
                "source_text": "桩顶标高允许偏差100mm",
                "quote_start": 0,
                "quote_end": 12,
            },
            {
                "rule_id": "JTG/T 3650-2020.9_7_2.rule",
                "component_id": "JTG/T 3650-2020.9_7_2.component",
                "field": "pile.centerXYDiff",
                "operator": "<=",
                "max": 50,
                "unit": "mm",
                "condition": "pile.centerXYDiff <= 50",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.2",
                "source_clause": "9.7.2",
                "source_text": "桩位偏差应小于50mm",
                "quote_start": 0,
                "quote_end": 11,
            },
            {
                "rule_id": "JTG/T 3650-2020.9_7_3.rule",
                "component_id": "JTG/T 3650-2020.9_7_3.component",
                "field": "hole.inclination",
                "operator": "<=",
                "max": 1,
                "unit": "%",
                "condition": "hole.inclination <= 1",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause": "9.7.3",
                "source_text": "倾斜度不应大于1%",
                "quote_start": 0,
                "quote_end": 9,
            },
        ]
    }
    _write_json(art_dir / "07_rules.json", rules)

    gates = {
        "gates": [
            {
                "gate_id": "gate.JTG/T 3650-2020.9_7_1.component",
                "type": "ALL_PASS",
                "rule_ids": ["JTG/T 3650-2020.9_7_1.rule"],
                "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.1"],
                "on_pass": "pass",
                "on_fail": "fail",
            },
            {
                "gate_id": "gate.JTG/T 3650-2020.9_7_2.component",
                "type": "ALL_PASS",
                "rule_ids": ["JTG/T 3650-2020.9_7_2.rule"],
                "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.2"],
                "on_pass": "pass",
                "on_fail": "fail",
            },
            {
                "gate_id": "gate.JTG/T 3650-2020.9_7_3.component",
                "type": "ALL_PASS",
                "rule_ids": ["JTG/T 3650-2020.9_7_3.rule"],
                "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.3"],
                "on_pass": "pass",
                "on_fail": "fail",
            },
        ]
    }
    _write_json(art_dir / "08_gates.json", gates)

    _write_json(
        art_dir / "norm_ref_index.json",
        {
            "entries": [
                {
                    "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.1",
                    "locator": {"source": {"page_start": 120, "source_text": "桩顶标高允许偏差100mm"}},
                },
                {
                    "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.2",
                    "locator": {"source": {"page_start": 121, "source_text": "桩位偏差应小于50mm"}},
                },
                {
                    "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                    "locator": {"source": {"page_start": 122, "source_text": "倾斜度不应大于1%"}},
                },
            ]
        },
    )

    specbundle_path = main._bundle_file_path("highway.bridge.pile@v1", "v1", "bridge_shi_13")
    _write_json(
        specbundle_path,
        {
            "bundleId": "highway.bridge.pile@v1",
            "bundleVersion": "v1",
            "formCode": "bridge_shi_13",
            "formName": "桥施13表",
            "dtoType": "pile",
            "stage": "integration_test",
            "rules": [],
            "fieldRuleMap": [
                {"fieldKey": "pile.topElevation.diff", "fieldName": "桩顶高程偏差", "ruleId": "gate.JTG/T 3650-2020.9_7_1.component"},
                {"fieldKey": "pile.centerXYDiff", "fieldName": "桩位偏差", "ruleId": "gate.JTG/T 3650-2020.9_7_2.component"},
                {"fieldKey": "hole.inclination", "fieldName": "倾斜度", "ruleId": "gate.JTG/T 3650-2020.9_7_3.component"},
            ],
            "semanticTree": {
                "form_code": "bridge_shi_13",
                "field_nodes": [
                    {"field_key": "pile.topElevation.diff"},
                    {"field_key": "pile.centerXYDiff"},
                    {"field_key": "hole.inclination"},
                ],
                "measurement_pairs": [
                    {"field_key": "pile.topElevation.diff"},
                    {"field_key": "pile.centerXYDiff"},
                    {"field_key": "hole.inclination"},
                ],
                "gate_refs": [
                    {"field_key": "pile.topElevation.diff", "gate_ref": "gate.JTG/T 3650-2020.9_7_1.component"},
                    {"field_key": "pile.centerXYDiff", "gate_ref": "gate.JTG/T 3650-2020.9_7_2.component"},
                    {"field_key": "hole.inclination", "gate_ref": "gate.JTG/T 3650-2020.9_7_3.component"},
                ],
            },
            "metadata": {"source": "ut.integration"},
        },
    )


def _execute_gates(payload: dict, values: dict) -> str:
    rules = [x for x in payload.get("rules", []) if isinstance(x, dict)]
    gates = [x for x in payload.get("gates", []) if isinstance(x, dict)]
    evaluated = {str(r.get("rule_id") or "").strip(): main._evaluate_rule_with_input(r, values) for r in rules}
    gate_pass = []
    for g in gates:
        rule_ids = main._gate_rule_ids(g)
        rows = [evaluated.get(rid, {"passed": False}) for rid in rule_ids]
        gate_pass.append(len(rows) > 0 and all(bool(x.get("passed", False)) for x in rows))
    return "PASS" if len(gate_pass) > 0 and all(gate_pass) else "FAIL"


def _build_passing_values_from_payload(payload: dict) -> dict:
    vals: dict = {}
    for r in payload.get("rules", []):
        if not isinstance(r, dict):
            continue
        field = str(r.get("field") or "").strip()
        op = str(r.get("operator") or "").strip()
        if not field:
            continue
        if op in {"<=", "<"} and isinstance(r.get("max"), (int, float)):
            vals[field] = float(r["max"]) - 0.1
        elif op in {">=", ">"} and isinstance(r.get("min"), (int, float)):
            vals[field] = float(r["min"]) + 0.1
        elif op == "=" and (isinstance(r.get("min"), (int, float)) or isinstance(r.get("max"), (int, float))):
            vals[field] = float(r.get("min") if r.get("min") is not None else r.get("max"))
        elif op == "exists":
            vals[field] = 1
        else:
            vals[field] = 1
    return vals


def test_norm_doc_rulepack_integration_bridge_shi_13_pass_and_fail() -> None:
    job_id = "ut_bridge13_integration"
    _prepare_bridge13_integration_assets(job_id)

    out = main.build_rulepack(
        main.BuildRulePackRequest(
            job_id=job_id,
            form_code="bridge_shi_13",
            schema_version="v1",
            enforce_quality_gate=False,
        )
    )

    assert out["status"] == "ok"
    assert str(out["meta"].get("form_code")) == "bridge_shi_13"
    assert str(out["meta"].get("spec_code")) == "JTG/T-3650-2020"
    assert out["counts"]["components"] == 3
    assert out["counts"]["rules"] == 3
    assert out["counts"]["gates"] == 3

    rp_path = Path(str(out["rulepack_path"]))
    payload = json.loads(rp_path.read_text(encoding="utf-8"))

    pass_values = _build_passing_values_from_payload(payload)
    assert _execute_gates(payload, pass_values) == "PASS"

    fail_values = dict(pass_values)
    # Force one numeric threshold rule to fail.
    for r in payload.get("rules", []):
        if not isinstance(r, dict):
            continue
        field = str(r.get("field") or "").strip()
        op = str(r.get("operator") or "").strip()
        if op in {"<=", "<"} and isinstance(r.get("max"), (int, float)) and field:
            fail_values[field] = float(r["max"]) + 1
            break
        if op in {">=", ">"} and isinstance(r.get("min"), (int, float)) and field:
            fail_values[field] = float(r["min"]) - 1
            break
    assert _execute_gates(payload, fail_values) == "FAIL"
