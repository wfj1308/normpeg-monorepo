from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_collect_observability_metrics_rates_and_counts() -> None:
    path = main.OBS_METRICS_PATH
    old = path.read_text(encoding="utf-8") if path.exists() else None
    try:
        doc = {
            "build_total": 10,
            "build_success": 9,
            "publish_total": 8,
            "publish_success": 6,
            "rollback_count": 2,
            "last_rule_count": 5,
            "last_gate_count": 4,
            "last_unresolved_count": 1,
            "updated_at": "2026-01-01T00:00:00Z",
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        out = main._collect_observability_metrics()
        assert abs(out["build_success_rate"] - 0.9) < 1e-9
        assert abs(out["publish_success_rate"] - 0.75) < 1e-9
        assert out["rule_count"] == 5
        assert out["gate_count"] == 4
        assert out["unresolved_count"] == 1
        assert out["rollback_count"] == 2
    finally:
        if old is None:
            if path.exists():
                path.unlink()
        else:
            path.write_text(old, encoding="utf-8")


def test_observability_metrics_endpoint_shape() -> None:
    resp = main.get_observability_metrics()
    assert resp["status"] == "ok"
    m = resp["metrics"]
    assert "build_success_rate" in m
    assert "publish_success_rate" in m
    assert "rule_count" in m
    assert "gate_count" in m
    assert "unresolved_count" in m
    assert "rollback_count" in m
