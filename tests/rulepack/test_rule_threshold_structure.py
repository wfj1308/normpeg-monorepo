from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_threshold_struct_normalization_success() -> None:
    rule = {
        "operator": "<=",
        "max": 50,
        "unit": "mm",
        "source_text": "桩位偏差应<=50mm",
    }
    thr, errs = main._normalize_threshold_struct(rule)
    assert errs == []
    assert thr["operator"] == "<="
    assert thr["max"] == 50.0
    assert thr["unit"] == "mm"
    assert "raw_text" in thr


def test_threshold_struct_marks_unresolved_when_missing_value_and_unit() -> None:
    rule = {
        "operator": "<=",
        "source_text": "偏差应符合规范要求",
    }
    thr, errs = main._normalize_threshold_struct(rule)
    assert thr["operator"] == "<="
    assert "missing_unit" in errs
    assert "missing_value_range" in errs
    assert "natural_language_only_threshold" in errs
