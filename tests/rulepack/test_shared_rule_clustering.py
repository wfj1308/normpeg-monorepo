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


def test_shared_rule_clustering_builds_clusters_and_current_refs() -> None:
    token = uuid.uuid4().hex[:8]
    norm_id = f"JTG/T-3650-2020-{token}"
    rp_a = {
        "meta": {"form_code": f"bridge_shi_13_{token}", "spec_code": norm_id, "norm_version": "2026"},
        "rules": [
            {
                "rule_id": "R1",
                "field": "concrete_strength",
                "component_id": "concrete_strength",
                "operator": ">=",
                "unit": "MPa",
                "norm_ref": f"v://norm/{norm_id}/clause/6.1",
                "source_clause_id": "6.1",
                "threshold": {"min": 40, "max": None, "value": 40, "unit": "MPa", "operator": ">="},
            }
        ],
    }
    rp_b = {
        "meta": {"form_code": f"bridge_shi_14_{token}", "spec_code": norm_id, "norm_version": "2026"},
        "rules": [
            {
                "rule_id": "R2",
                "field": "concrete_strength",
                "component_id": "concrete_strength",
                "operator": ">=",
                "unit": "MPa",
                "norm_ref": f"v://norm/{norm_id}/clause/6.1",
                "source_clause_id": "6.1",
                "threshold": {"min": 40, "max": None, "value": 40, "unit": "MPa", "operator": ">="},
            }
        ],
    }
    _write_rulepack(f"{norm_id}-a-{token}.rulepack.json".replace("/", "_"), rp_a)
    _write_rulepack(f"{norm_id}-b-{token}.rulepack.json".replace("/", "_"), rp_b)

    current_payload = {
        "meta": {"form_code": f"bridge_shi_17_{token}", "spec_code": norm_id, "norm_version": "2026"},
        "rules": [
            {
                "rule_id": "R3",
                "field": "concrete_strength",
                "component_id": "concrete_strength",
                "operator": ">=",
                "unit": "MPa",
                "norm_ref": f"v://norm/{norm_id}/clause/6.1",
                "source_clause_id": "6.1",
                "threshold": {"min": 40, "max": None, "value": 40, "unit": "MPa", "operator": ">="},
            }
        ],
    }
    out = main._build_shared_rule_clusters(
        norm_id=norm_id,
        current_rulepack_name=f"{norm_id}-current-{token}.rulepack.json".replace("/", "_"),
        current_payload=current_payload,
    )
    assert str(out.get("schema_version") or "").strip() == "shared_rule_clusters.v1"
    assert int(out.get("cluster_count", 0) or 0) >= 1
    refs = out.get("current_rule_references", {}) if isinstance(out.get("current_rule_references"), dict) else {}
    assert "R3" in refs
    assert len(refs.get("R3", [])) >= 1

