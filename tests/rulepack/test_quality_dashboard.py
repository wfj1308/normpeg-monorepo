from __future__ import annotations

import json
import sys
import uuid
from datetime import date, datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_quality_dashboard_supports_trend_and_form_filter() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_dash_{token}"
    day = date.today().isoformat()

    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)
    rp = {
        "meta": {"form_code": form_code},
        "schema_validation": {"valid": True},
        "rules": [{"rule_id": "R1"}],
        "gates": [{"gate_id": "G1"}],
        "unresolved": {"count": 0},
        "docpeg_coverage": {"executable_rate": 1.0, "gate_coverage_rate": 1.0},
    }
    (rp_dir / f"dash-{token}.rulepack.json").write_text(json.dumps(rp, ensure_ascii=False), encoding="utf-8")

    art_dir = REPO_ROOT / "uploads" / "normref" / "artifacts" / f"job_dash_{token}"
    art_dir.mkdir(parents=True, exist_ok=True)
    (art_dir / "12_pipeline_audit.json").write_text(
        json.dumps({"valid": False, "blockers": ["missing_gate"]}, ensure_ascii=False), encoding="utf-8"
    )

    pm_path = REPO_ROOT / "uploads" / "normref" / "publish_metrics.json"
    events = []
    if pm_path.exists():
        try:
            doc = json.loads(pm_path.read_text(encoding="utf-8"))
            if isinstance(doc, dict) and isinstance(doc.get("events"), list):
                events = [x for x in doc["events"] if isinstance(x, dict)]
        except Exception:
            events = []
    events.append({"timestamp": datetime.utcnow().isoformat() + "Z", "form_code": form_code, "success": True})
    events.append({"timestamp": datetime.utcnow().isoformat() + "Z", "form_code": form_code, "success": False, "reason": "schema_invalid"})
    pm_path.write_text(json.dumps({"events": events[-2000:]}, ensure_ascii=False, indent=2), encoding="utf-8")

    rep = main._collect_quality_dashboard(form_code=form_code, date_from=day, date_to=day)
    ov = rep["overview"]
    assert ov["publishable_form_count"] >= 1
    assert ov["unresolved_total"] >= 0
    assert ov["rule_coverage_rate"] >= 0
    assert ov["gate_coverage_rate"] >= 0
    assert ov["build_failure_rate"] >= 0
    assert ov["publish_success_rate"] >= 0
    assert isinstance(ov["top_fail_reasons"], list)
    assert len(rep["trends"]) == 1
    assert rep["trends"][0]["date"] == day
