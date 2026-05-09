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


def test_cross_form_propagation_returns_affected_forms_with_confidence() -> None:
    token = uuid.uuid4().hex[:8]
    norm_id = f"JTG/T-3650-2020-{token}"
    forms = ["bridge_shi_13", "bridge_shi_14", "bridge_shi_17"]
    for idx, fc in enumerate(forms):
        rp = {
            "meta": {"form_code": fc, "spec_code": norm_id, "spec_version": "2026", "norm_version": "2026"},
            "rules": [
                {
                    "rule_id": f"R{idx+1}",
                    "field": "concrete.strength",
                    "slot": "concrete_strength",
                    "condition": "concrete_strength>=40",
                    "source_text": "混凝土强度不低于40MPa",
                    "norm_ref": f"v://norm/{norm_id}/clause/6.{idx+1}",
                    "source_clause_id": f"6.{idx+1}",
                }
            ],
            "gates": [{"gate_id": f"G{idx+1}", "rule_ids": [f'R{idx+1}']}],
            "traceability": [{"rule_id": f"R{idx+1}", "source_text": "混凝土强度", "norm_ref": f"v://norm/{norm_id}/clause/6.{idx+1}"}],
        }
        _write_rulepack(f"{norm_id}-2026-{fc}-{token}.rulepack.json".replace("/", "_"), rp)

    out = main._compute_cross_form_propagation(
        clause_text="混凝土强度",
        slots=["concrete_strength"],
        norm_id=norm_id,
        source_form="bridge13",
        min_confidence=0.1,
        top_k=10,
    )
    assert isinstance(out.get("affected_forms"), list)
    rows = out["affected_forms"]
    assert len(rows) >= 3
    got_forms = {str(x.get("form_code") or "") for x in rows if isinstance(x, dict)}
    assert "bridge_shi_13" in got_forms
    assert "bridge_shi_14" in got_forms
    assert "bridge_shi_17" in got_forms
    for row in rows:
        assert "confidence" in row
        assert isinstance(row.get("confidence"), float)

