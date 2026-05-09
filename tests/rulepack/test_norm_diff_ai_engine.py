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


def test_norm_diff_ai_engine_outputs_semantic_diff_report() -> None:
    token = uuid.uuid4().hex[:8]
    norm_id = f"JTG/T-3650-2020-{token}"
    form_code = f"bridge_shi_13_{token}"
    old_v = "2020"
    new_v = "2026"

    old_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": old_v, "norm_version": old_v},
        "rules": [
            {
                "rule_id": "R1",
                "field": "pile.centerXYDiff",
                "operator": "<=",
                "threshold": {"value": 50, "min": None, "max": 50, "unit": "mm", "operator": "<=", "formula": "a+b"},
                "unit": "mm",
                "condition": "pile.centerXYDiff<=50",
                "norm_ref": f"v://norm/{norm_id}/clause/9.7.3",
                "source_clause_id": "9.7.3",
                "source_text": "桩位偏差<=50",
            }
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"], "operator": "all_pass"}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/9.7.3", "source_clause_id": "9.7.3", "source_text": "桩位偏差<=50"}],
    }
    new_payload = {
        "meta": {"form_code": form_code, "spec_code": norm_id, "spec_version": new_v, "norm_version": new_v},
        "rules": [
            {
                "rule_id": "R1",
                "field": "pile.centerXYDiffNew",
                "operator": "<",
                "threshold": {"value": 40, "min": None, "max": 40, "unit": "mm", "operator": "<", "formula": "a-b"},
                "unit": "mm",
                "condition": "pile.centerXYDiffNew<40",
                "norm_ref": f"v://norm/{norm_id}/clause/9.7.3",
                "source_clause_id": "9.7.3",
                "source_text": "桩位偏差<40",
            }
        ],
        "gates": [{"gate_id": "G1", "rule_ids": ["R1"], "operator": "all_pass"}],
        "traceability": [{"rule_id": "R1", "norm_ref": f"v://norm/{norm_id}/clause/9.7.3", "source_clause_id": "9.7.3", "source_text": "桩位偏差<40"}],
    }

    _write_rulepack(f"{norm_id}-{old_v}-{form_code}-old-{token}.rulepack.json".replace("/", "_"), old_payload)
    _write_rulepack(f"{norm_id}-{new_v}-{form_code}-new-{token}.rulepack.json".replace("/", "_"), new_payload)

    out = main.diff_norm_versions(main.NormVersionDiffRequest(norm_id=norm_id, old_norm_version=old_v, new_norm_version=new_v))
    assert out["status"] == "ok"
    path = Path(str(out.get("semantic_diff_report_path") or "").strip())
    assert path.exists()
    rep = json.loads(path.read_text(encoding="utf-8"))
    summary = rep.get("summary", {}) if isinstance(rep.get("summary"), dict) else {}
    assert int(summary.get("threshold_changed_count", 0) or 0) >= 1
    assert int(summary.get("operator_changed_count", 0) or 0) >= 1
    assert int(summary.get("semantic_changed_count", 0) or 0) >= 1
    assert int(summary.get("formula_changed_count", 0) or 0) >= 1

