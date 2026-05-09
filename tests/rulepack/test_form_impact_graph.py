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


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _write_rulepack(name: str, payload: dict) -> None:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    (d / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def test_form_impact_graph_build_propagation_and_diff() -> None:
    token = uuid.uuid4().hex[:8]
    job_id = f"ut_form_impact_{token}"
    norm_id = f"JTG/T-3650-2020-{token}"
    form_code = f"bridge_shi_13_{token}"
    alt_form = f"bridge_shi_14_{token}"

    art = main._artifact_dir_for_job(job_id)
    _write_json(
        art / "13_specir.json",
        {"slots": [{"slotKey": "concrete_strength"}], "items": [{"specir_id": "S1", "slot": "concrete_strength", "source_clause_id": "6.1"}]},
    )
    _write_json(
        art / "07_rules.json",
        {"rules": [{"rule_id": "R1", "field": "concrete_strength", "component_id": "concrete_strength", "norm_ref": f"v://norm/{norm_id}/clause/6.1"}]},
    )
    _write_json(art / "08_gates.json", {"gates": [{"gate_id": "G1", "rule_ids": ["R1"]}]})
    _write_json(art / "norm_ref_index.json", {"entries": [{"normRef": f"v://norm/{norm_id}/clause/6.1"}]})

    rp_old = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "norm_version": "2020"},
        "rules": [{"rule_id": "R1", "field": "concrete_strength", "component_id": "concrete_strength", "norm_ref": f"v://norm/{norm_id}/clause/6.1"}],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
    }
    rp_new = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "norm_version": "2026"},
        "rules": [
            {"rule_id": "R1", "field": "concrete_strength", "component_id": "concrete_strength", "norm_ref": f"v://norm/{norm_id}/clause/6.1"},
            {"rule_id": "R2", "field": "cement_ratio", "component_id": "cement_ratio", "norm_ref": f"v://norm/{norm_id}/clause/6.2"},
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1", "R2"]}],
    }
    rp_alt = {
        "meta": {"form_code": alt_form, "spec_code": norm_id, "norm_version": "2026"},
        "rules": [{"rule_id": "R3", "field": "concrete_strength", "component_id": "concrete_strength", "norm_ref": f"v://norm/{norm_id}/clause/6.1"}],
        "gates": [{"gate_id": "G2", "rule_ids": ["R3"]}],
    }
    _write_rulepack(f"{norm_id}-2020-{form_code}-a-{job_id}.rulepack.json".replace("/", "_"), rp_old)
    _write_rulepack(f"{norm_id}-2026-{form_code}-b-{job_id}.rulepack.json".replace("/", "_"), rp_new)
    _write_rulepack(f"{norm_id}-2026-{alt_form}-c-{token}.rulepack.json".replace("/", "_"), rp_alt)

    graph = main._build_specir_knowledge_graph(job_id)
    nodes = graph.get("nodes", []) if isinstance(graph.get("nodes"), list) else []
    assert any(isinstance(n, dict) and str(n.get("type") or "") == "rulepack" for n in nodes)

    seed = f"slot:concrete_strength"
    prop = main._auto_propagate_on_form_impact_graph(graph, seed_node_ids=[seed], max_depth=3, min_confidence=0.1)
    assert isinstance(prop.get("affected_forms"), list)
    assert any(str(x.get("form_code") or "") == alt_form for x in prop.get("affected_forms", []) if isinstance(x, dict))

    diff = main._diff_form_impact_graph_versions(job_id=job_id)
    assert diff.get("status") == "ok"
    assert int(((diff.get("summary") if isinstance(diff.get("summary"), dict) else {}).get("added_node_count") or 0)) >= 1

