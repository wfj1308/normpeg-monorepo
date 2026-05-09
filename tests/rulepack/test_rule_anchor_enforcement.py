from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_rule_anchor_validation_detects_missing_fields() -> None:
    anchor = {
        "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.3",
        "source_clause": "9.7.3",
        "source_page": None,
        "source_text": "",
        "quote_start": None,
        "quote_end": None,
    }
    errs = main._validate_rule_anchor_fields(anchor)
    assert "source_page missing" in errs
    assert "source_text missing" in errs
    assert "quote_start missing" in errs
    assert "quote_end missing" in errs


def test_locate_rule_source_returns_anchor(tmp_path: Path) -> None:
    job_id = "ut_rule_anchor"
    art_dir = REPO_ROOT / "uploads" / "normref" / "artifacts" / job_id
    art_dir.mkdir(parents=True, exist_ok=True)
    rules_doc = {
        "rules": [
            {
                "rule_id": "R1",
                "norm_ref": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "source_clause": "9.7.3",
                "source_text": "桩位偏差应小于50mm",
                "quote_start": 0,
                "quote_end": 11,
            }
        ]
    }
    normref_doc = {
        "entries": [
            {
                "normRef": "v://norm/JTG-T-3650-2020/clause/9.7.3",
                "locator": {"source": {"page_start": 123, "source_text": "桩位偏差应小于50mm"}}
            }
        ]
    }
    (art_dir / "07_rules.json").write_text(json.dumps(rules_doc, ensure_ascii=False), encoding="utf-8")
    (art_dir / "norm_ref_index.json").write_text(json.dumps(normref_doc, ensure_ascii=False), encoding="utf-8")
    resp = main.locate_rule_source(job_id=job_id, rule_id="R1")
    assert resp["status"] == "ok"
    assert resp["valid"] is True
    assert resp["anchor"]["source_page"] == 123
    assert "click_url" in resp
