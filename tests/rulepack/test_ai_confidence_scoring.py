from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_ai_confidence_threshold_marks_review_required() -> None:
    low = main._compute_ai_confidence(
        semantic_match=0.8,
        slot_similarity=0.8,
        historical_mapping=0.8,
        formula_parsing=0.8,
        ocr_quality=0.8,
    )
    high = main._compute_ai_confidence(
        semantic_match=0.98,
        slot_similarity=0.97,
        historical_mapping=0.95,
        formula_parsing=0.99,
        ocr_quality=0.96,
    )
    assert 0.0 <= float(low.get("confidence", 0.0)) <= 1.0
    assert 0.0 <= float(high.get("confidence", 0.0)) <= 1.0
    assert bool(low.get("review_required", False)) is True
    assert bool(high.get("review_required", True)) is False


def test_formula_ir_contains_confidence_and_review_required() -> None:
    out = main._build_formula_ir_artifact(
        spec={"spec_code": "UT-SPEC"},
        formulas=[{"formula_id": "F1", "formula": "a+b"}],
        rules=[{"field": "a"}, {"field": "b"}],
    )
    assert "confidence" in out
    assert "review_required" in out
    rows = out.get("formulas", []) if isinstance(out.get("formulas"), list) else []
    assert len(rows) == 1
    row = rows[0] if isinstance(rows[0], dict) else {}
    assert "confidence" in row
    assert "review_required" in row

