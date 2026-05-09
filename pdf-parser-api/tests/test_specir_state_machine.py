from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / "pdf-parser-api"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from app.services.specir_state_machine import can_enter_rulepack, can_publish, transition_specir_status


def _specir(status: str = "draft") -> dict:
    return {"specir_id": "sp1", "status": status, "version": "v1"}


def test_draft_cannot_enter_rulepack() -> None:
    assert can_enter_rulepack("draft") is False


def test_reviewing_cannot_publish() -> None:
    assert can_publish("reviewing") is False


def test_only_approved_can_enter_rulepack() -> None:
    assert can_enter_rulepack("approved") is True
    assert can_enter_rulepack("rejected") is False
    assert can_enter_rulepack("revised") is False


def test_rejected_requires_reason() -> None:
    step1 = transition_specir_status(_specir("draft"), to_status="reviewing", actor="u1")
    assert step1.ok is True
    step2 = transition_specir_status(step1.specir, to_status="rejected", actor="u2", reason="")
    assert step2.ok is False
    assert any("requires reason" in b for b in step2.blockers)


def test_revised_requires_diff() -> None:
    step1 = transition_specir_status(_specir("rejected"), to_status="revised", actor="u3", diff={})
    assert step1.ok is False
    assert any("requires non-empty diff" in b for b in step1.blockers)


def test_published_modify_must_create_new_version() -> None:
    sp = _specir("published")
    out = transition_specir_status(sp, to_status="revised", actor="u4", diff={"field": "changed"})
    assert out.ok is True
    assert out.specir["status"] == "revised"
    assert out.specir["version"] != "v1"
    assert out.specir.get("base_version") == "v1"


def test_happy_path_full_flow() -> None:
    sp = _specir("draft")
    for to_status, reason, diff in [
        ("reviewing", "", None),
        ("approved", "", None),
        ("published", "", None),
    ]:
        out = transition_specir_status(sp, to_status=to_status, actor="u", reason=reason, diff=diff)
        assert out.ok is True
        sp = out.specir
    assert sp["status"] == "published"

