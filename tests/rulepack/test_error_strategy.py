from __future__ import annotations

import sys
from pathlib import Path

from fastapi import HTTPException


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_error_strategy_catalog_contains_required_items() -> None:
    resp = main.get_error_strategies()
    assert resp["status"] == "ok"
    items = resp["items"]
    codes = {str(x.get("error_code") or "") for x in items if isinstance(x, dict)}
    assert main.ERROR_BUILD_TIMEOUT in codes
    assert main.ERROR_RULE_MISSING in codes
    assert main.ERROR_GATE_MISSING in codes
    assert main.ERROR_RULE_STORE_UNAVAILABLE in codes
    assert main.ERROR_PUBLISH_FAILED in codes
    for row in items:
        assert isinstance(row.get("user_message"), str)
        assert isinstance(row.get("retryable"), bool)
        assert isinstance(row.get("rollback"), bool)


def test_raise_policy_http_error_payload_shape() -> None:
    try:
        main._raise_policy_http_error(main.ERROR_GATE_MISSING, user_message="缺少 Gate", detail="gates_count=0")
        assert False, "should raise"
    except HTTPException as exc:
        assert exc.status_code == 400
        assert isinstance(exc.detail, dict)
        d = exc.detail
        assert d["error_code"] == main.ERROR_GATE_MISSING
        assert d["retryable"] is False
        assert d["rollback"] is False
        assert "Gate" in str(d.get("user_message") or "")


def test_http_exception_detail_text_supports_dict_and_string() -> None:
    e1 = HTTPException(status_code=400, detail={"user_message": "u", "detail": "d"})
    e2 = HTTPException(status_code=400, detail="abc")
    assert main._http_exception_detail_text(e1) == "u"
    assert main._http_exception_detail_text(e2) == "abc"
