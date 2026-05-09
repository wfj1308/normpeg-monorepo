from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def _write_review_pkg(job_id: str, status: str = "draft") -> None:
    review_dir = REPO_ROOT / "uploads" / "normref" / "review"
    review_dir.mkdir(parents=True, exist_ok=True)
    pkg = {
        "job_id": job_id,
        "review_status": "pending_review",
        "review_summary": {"draft": 1, "extracted": 0, "reviewed": 0, "approved": 0, "rejected": 0},
        "candidates": [
            {
                "candidate_id": "c1",
                "rule_id": "r1",
                "status": status,
                "workflow": {"history": []},
            }
        ],
    }
    (review_dir / f"{job_id}.review.json").write_text(json.dumps(pkg, ensure_ascii=False), encoding="utf-8")


def test_dual_review_transition_and_diff_history() -> None:
    job_id = "ut_dual_review_flow"
    _write_review_pkg(job_id, "draft")
    r1 = main._apply_candidate_transition(
        job_id=job_id,
        candidate_id="c1",
        to_status="extracted",
        actor_id="u.extractor",
        actor_name="Extractor",
        actor_role="extractor",
        comment="extract done",
    )
    assert r1["candidate"]["status"] == "extracted"
    r2 = main._apply_candidate_transition(
        job_id=job_id,
        candidate_id="c1",
        to_status="reviewed",
        actor_id="u.reviewer",
        actor_name="Reviewer",
        actor_role="reviewer",
        comment="review done",
    )
    assert r2["candidate"]["status"] == "reviewed"
    hist = r2["candidate"]["workflow"]["history"]
    assert len(hist) >= 2
    assert "diff" in hist[-1]


def test_extractor_and_reviewer_cannot_be_same() -> None:
    job_id = "ut_dual_review_same_user"
    _write_review_pkg(job_id, "draft")
    main._apply_candidate_transition(
        job_id=job_id,
        candidate_id="c1",
        to_status="extracted",
        actor_id="u.same",
        actor_name="SameUser",
        actor_role="extractor",
        comment="extract",
    )
    try:
        main._apply_candidate_transition(
            job_id=job_id,
            candidate_id="c1",
            to_status="reviewed",
            actor_id="u.same",
            actor_name="SameUser",
            actor_role="reviewer",
            comment="review",
        )
        assert False, "expected HTTPException"
    except Exception as exc:
        assert "不能是同一人" in str(exc)
