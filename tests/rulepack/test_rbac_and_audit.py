from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

from fastapi import HTTPException


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_require_role_denied_and_audited() -> None:
    old = main.SECURITY_AUDIT_PATH.read_text(encoding="utf-8") if main.SECURITY_AUDIT_PATH.exists() else None
    orig = main._load_rbac_roles
    try:
        main._load_rbac_roles = lambda: {"users": {"u1": ["editor"]}, "strict": True}  # type: ignore[assignment]
        try:
            main._require_role("u1", "publisher", action="rulepack_release", target="bridge_shi_13")
            assert False, "should raise"
        except HTTPException as exc:
            assert exc.status_code == 403
        rows = main.get_security_audit(limit=20).get("items", [])
        assert any(str(x.get("result") or "") == "denied" and str(x.get("action") or "") == "rulepack_release" for x in rows if isinstance(x, dict))
    finally:
        if old is None:
            if main.SECURITY_AUDIT_PATH.exists():
                main.SECURITY_AUDIT_PATH.unlink()
        else:
            main.SECURITY_AUDIT_PATH.write_text(old, encoding="utf-8")
        main._load_rbac_roles = orig  # type: ignore[assignment]


def test_publish_must_be_separated_from_editor_reviewer() -> None:
    orig = main._load_rbac_roles
    token = uuid.uuid4().hex[:8]
    job_id = f"ut_rbac_sep_{token}"
    pkg = {
        "job_id": job_id,
        "candidates": [
            {"candidate_id": "c1", "workflow": {"extractor_id": "alice", "reviewer_id": "bob"}, "status": "approved"}
        ],
    }
    main._save_review_package(pkg)
    main._load_rbac_roles = lambda: {"users": {"alice": ["publisher"]}, "strict": True}  # type: ignore[assignment]
    req = main.PublishNormDocWorkflowRequest(
        normRef="v://std/JTG-T-3650-2020/chapter/9/section/7/table/3",
        job_id=job_id,
        published_by="alice",
        signature="sig",
    )
    try:
        main.publish_normdoc_workflow(req)
        assert False, "should raise"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "publisher 不能是 editor/reviewer" in str(exc.detail)
    finally:
        main._load_rbac_roles = orig  # type: ignore[assignment]


def test_release_requires_publisher_role() -> None:
    orig = main._load_rbac_roles
    main._load_rbac_roles = lambda: {"users": {"opx": ["reviewer"]}, "strict": True}  # type: ignore[assignment]
    req = main.RulepackReleaseRequest(form_code="bridge_shi_13", version="no_need.rulepack.json", operator="opx")
    try:
        main.release_rulepack_by_form(req)
        assert False, "should raise"
    except HTTPException as exc:
        assert exc.status_code == 403
    finally:
        main._load_rbac_roles = orig  # type: ignore[assignment]
