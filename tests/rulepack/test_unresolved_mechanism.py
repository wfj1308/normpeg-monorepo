from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_unresolved_type_mapping() -> None:
    row = {"unresolved_reason": ""}
    assert main._resolve_unresolved_type("missing_value_range", row) == "MISSING_THRESHOLD"
    assert main._resolve_unresolved_type("missing_unit", row) == "MISSING_UNIT"
    assert main._resolve_unresolved_type("natural_language_only_threshold", row) == "AMBIGUOUS_SEMANTIC"


def test_unresolved_stats_group_by_type() -> None:
    job_id = "ut_unresolved_stats"
    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp_path = rp_dir / f"demo-{job_id}.rulepack.json"
    payload = {
        "unresolved": {
            "count": 2,
            "type_counts": {
                "MISSING_THRESHOLD": 1,
                "MISSING_UNIT": 1,
                "AMBIGUOUS_SEMANTIC": 0,
                "CONFLICTING_CLAUSE": 0,
                "MISSING_SOURCE": 0,
                "GATE_SYNTHESIS_FAILED": 0
            },
            "items": [
                {"rule_id": "R1", "type": "MISSING_THRESHOLD", "reason": "missing_value_range", "normRef": "v://n/1", "source_clause": "1.1"},
                {"rule_id": "R2", "type": "MISSING_UNIT", "reason": "missing_unit", "normRef": "v://n/2", "source_clause": "1.2"}
            ]
        }
    }
    rp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    summary = main._collect_rulepack_unresolved_summary_for_job(job_id)
    assert summary["unresolved_count"] >= 2
    assert summary["type_counts"]["MISSING_THRESHOLD"] >= 1
    assert summary["type_counts"]["MISSING_UNIT"] >= 1
    assert summary["blocked"] is True
