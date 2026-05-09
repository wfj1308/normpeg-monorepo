from __future__ import annotations

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
APP_DIR = REPO_ROOT / "pdf-parser-api"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from app.services.specir_signature import ensure_resign_required_after_modify, sign_specir


def _specir() -> dict:
    return {
        "specir_id": "sp1",
        "version": "v1",
        "checklist": [
            {
                "item_id": "normref_correct",
                "label": "normRef 是否正确",
                "result": "pass",
                "comment": "",
                "reviewer_id": "r1",
                "reviewed_at": "2026-05-07T00:00:00Z",
            }
        ],
    }


def test_sign_no_direct_overwrite_same_version() -> None:
    sp = _specir()
    first = sign_specir(sp, signer_id="u1", signer_role="reviewer", editor_id="e1")
    assert first["ok"] is True
    second = sign_specir(first["specir"], signer_id="u2", signer_role="reviewer", editor_id="e1")
    assert second["ok"] is False
    assert second["error"] == "SIGNATURE_ALREADY_EXISTS"


def test_modify_requires_resign() -> None:
    sp = _specir()
    signed = sign_specir(sp, signer_id="u1", signer_role="reviewer", editor_id="e1")
    assert signed["ok"] is True
    before = signed["specir"]
    after = dict(before)
    after["semantic"] = {"title": "changed"}
    check = ensure_resign_required_after_modify(before, after)
    assert check["changed"] is True
    assert check["resign_required"] is True


def test_editor_and_reviewer_cannot_be_same() -> None:
    out = sign_specir(_specir(), signer_id="same_user", signer_role="reviewer", editor_id="same_user")
    assert out["ok"] is False
    assert out["error"] == "EDITOR_REVIEWER_CONFLICT"


def test_signature_contains_required_fields() -> None:
    out = sign_specir(_specir(), signer_id="u1", signer_role="reviewer", editor_id="e1")
    assert out["ok"] is True
    sig = out["signature"]
    for key in ("signer_id", "signer_role", "signed_at", "specir_version", "checklist_hash", "signature_hash"):
        assert key in sig
        assert str(sig[key]).strip() != ""

