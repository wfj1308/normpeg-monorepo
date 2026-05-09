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


def _write_rulepack(name: str, payload: dict) -> Path:
    d = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return p


def test_norm_version_diff_outputs_and_marks_needs_review() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_diff_{token}"
    norm_id = "JTG/T-3650-2020"
    old_v = "2020"
    new_v = "2026"
    old_name = f"{norm_id}-{old_v}-{form_code}-old-{token}.rulepack.json".replace("/", "_")
    new_name = f"{norm_id}-{new_v}-{form_code}-new-{token}.rulepack.json".replace("/", "_")
    old_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": old_v, "norm_version": old_v},
        "rules": [
            {
                "rule_id": "R1",
                "field": "pile.centerXYDiff",
                "operator": "<=",
                "threshold": {"value": 50, "min": None, "max": 50, "unit": "mm", "operator": "<=", "raw_text": ""},
                "unit": "mm",
                "condition": "pile.centerXYDiff<=50",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause_id": "9.7.3",
                "source_text": "桩位偏差<=50",
            }
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3", "source_clause_id": "9.7.3", "source_text": "桩位偏差<=50"}],
    }
    new_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": new_v, "norm_version": new_v},
        "rules": [
            {
                "rule_id": "R1",
                "field": "pile.centerXYDiff",
                "operator": "<=",
                "threshold": {"value": 40, "min": None, "max": 40, "unit": "mm", "operator": "<=", "raw_text": ""},
                "unit": "mm",
                "condition": "pile.centerXYDiff<=40",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause_id": "9.7.3",
                "source_text": "桩位偏差<=40",
            }
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"]}],
        "traceability": [{"rule_id": "R1", "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3", "source_clause_id": "9.7.3", "source_text": "桩位偏差<=40"}],
    }
    _write_rulepack(old_name, old_payload)
    new_path = _write_rulepack(new_name, new_payload)

    out = main.diff_norm_versions(
        main.NormVersionDiffRequest(
            norm_id=norm_id,
            old_norm_version=old_v,
            new_norm_version=new_v,
        )
    )
    assert out["status"] == "ok"
    assert len(out["changed_clauses"]) >= 1
    assert any(str(x.get("normRef") or "").startswith("v://norm/") for x in out["changed_clauses"])
    assert any(str(x.get("rule_id") or "") == "R1" for x in out["affected_rules"])
    assert any(str(x.get("gate_id") or "") == "G1" for x in out["affected_gates"])
    assert form_code in out["affected_form_codes"]

    assert len(out.get("needs_review_rulepacks", [])) >= 1
    touched_path = Path(str(out["needs_review_rulepacks"][0]))
    updated = json.loads(touched_path.read_text(encoding="utf-8"))
    meta = updated.get("meta", {}) if isinstance(updated.get("meta"), dict) else {}
    assert meta.get("needs_review") is True
