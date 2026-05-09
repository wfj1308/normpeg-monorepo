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


def _prepare_job_artifacts(job_id: str) -> None:
    art = REPO_ROOT / "uploads" / "normref" / "artifacts" / job_id
    art.mkdir(parents=True, exist_ok=True)
    (art / "00_pipeline_index.json").write_text(
        json.dumps({"standard_code": "JTG/T-3650-2020", "version_tag": "2020"}, ensure_ascii=False),
        encoding="utf-8",
    )
    (art / "07_rules.json").write_text(
        json.dumps({"rules": [{"rule_id": "R1", "field": "pile.centerXYDiff", "operator": "<=", "max": 50}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    (art / "08_gates.json").write_text(
        json.dumps({"gates": [{"gate_id": "G1", "rule_ids": ["R1"], "norm_refs": ["v://norm/JTG-T-3650-2020/clause/9.7.3"]}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    (art / "11_normdoc.json").write_text(
        json.dumps({"rules": [{"rule_id": "R1"}], "gates": [{"gate_id": "G1"}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    rp_dir = REPO_ROOT / "uploads" / "normref" / "rulepacks"
    rp_dir.mkdir(parents=True, exist_ok=True)
    (rp_dir / f"rp-{job_id}.rulepack.json").write_text(
        json.dumps({"meta": {"job_id": job_id, "form_code": "bridge_shi_13"}}, ensure_ascii=False),
        encoding="utf-8",
    )


def test_rule_change_audit_records_diff_and_filters() -> None:
    old = main.RULE_CHANGE_AUDIT_PATH.read_text(encoding="utf-8") if main.RULE_CHANGE_AUDIT_PATH.exists() else None
    orig_append = main._append_pipeline_asset_review
    orig_refresh = main._refresh_artifact_business_valid
    try:
        job_id = f"ut_audit_{uuid.uuid4().hex[:8]}"
        _prepare_job_artifacts(job_id)
        main._append_pipeline_asset_review = lambda request: {"status": "ok"}  # type: ignore[assignment]
        main._refresh_artifact_business_valid = lambda _job_id: {"status": "ok"}  # type: ignore[assignment]

        main.patch_ingest_asset(
            main.AssetPatchRequest(
                job_id=job_id,
                object_type="rule",
                object_id="R1",
                patch={"max": 40},
                reviewer_id="editor_x",
                comment="tighten threshold",
            )
        )
        main.patch_ingest_asset(
            main.AssetPatchRequest(
                job_id=job_id,
                object_type="gate",
                object_id="G1",
                patch={"on_fail": "block"},
                reviewer_id="editor_x",
                comment="block on fail",
            )
        )

        by_rule = main.get_rule_change_audit(rule_id="R1", limit=50)
        assert by_rule["status"] == "ok"
        assert by_rule["immutable"] is True
        assert any(str(x.get("rule_id") or "") == "R1" for x in by_rule["items"])
        hit = next(x for x in by_rule["items"] if str(x.get("rule_id") or "") == "R1")
        assert str(hit.get("form_code") or "") == "bridge_shi_13"
        assert str(hit.get("norm_version") or "") != ""
        assert str(hit.get("effective_at") or "") != ""
        assert "max" in (hit.get("diff", {}) or {})

        by_form = main.get_rule_change_audit(form_code="bridge_shi_13", limit=50)
        assert any(str(x.get("object_type") or "") == "gate" for x in by_form["items"])
        gate_ref = "v://norm/JTG-T-3650-2020/clause/9.7.3"
        by_ref = main.get_rule_change_audit(gateRef=gate_ref, limit=50)
        assert any(str(x.get("gateRef") or "") == gate_ref for x in by_ref["items"])
    finally:
        main._append_pipeline_asset_review = orig_append  # type: ignore[assignment]
        main._refresh_artifact_business_valid = orig_refresh  # type: ignore[assignment]
        if old is None:
            if main.RULE_CHANGE_AUDIT_PATH.exists():
                main.RULE_CHANGE_AUDIT_PATH.unlink()
        else:
            main.RULE_CHANGE_AUDIT_PATH.write_text(old, encoding="utf-8")
