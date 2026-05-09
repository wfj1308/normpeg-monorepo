from __future__ import annotations

import json
import sys
import uuid
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_sla_auto_classification_and_dashboard_status() -> None:
    token = uuid.uuid4().hex[:8]
    form_code = f"bridge_shi_13_sla_{token}"
    job_id = f"ut_sla_{token}"
    ad = REPO_ROOT / "uploads" / "normref" / "artifacts" / job_id
    ad.mkdir(parents=True, exist_ok=True)

    qg = {
        "ok": False,
        "blockers": [
            f"X-{form_code}.rulepack.json: gateRef 缺失率=0.1 (redline > 0), missing_gateRef_count=1",
            "发布失败：Rulepack 发布门禁未通过",
        ],
        "alerts": [
            "X.rulepack.json: 关键字段误判率=0.5 (>0.01), mismatch=1/2，触发回滚",
            "coverage_drop: gate_coverage 1.0 -> 0.7",
        ],
        "checked": [{"form_code": form_code}],
    }
    (ad / "quality_gate_result.json").write_text(json.dumps(qg, ensure_ascii=False), encoding="utf-8")

    today = date.today().isoformat()
    rep = main._collect_quality_dashboard(form_code=form_code, date_from=today, date_to=today)
    issues = rep.get("sla_issues", [])
    assert isinstance(issues, list)
    assert any(x.get("priority") == "P1" and "gateRef" in str(x.get("reason")) for x in issues)
    assert any(x.get("priority") == "P1" and "发布失败" in str(x.get("reason")) for x in issues)
    assert any(x.get("priority") == "P1" and "关键字段误判" in str(x.get("reason")) for x in issues)
    assert any(x.get("priority") == "P2" for x in issues)
    assert all(str(x.get("status")) in {"on_track", "overdue"} for x in issues)
