from __future__ import annotations

import pytest

from backend.app.state_machine import (
    ERROR_ILLEGAL_TRANSITION,
    ERROR_UNKNOWN_SCOPE,
    ERROR_UNKNOWN_STATUS,
    STATE_ARCHIVED,
    STATE_FAILED,
    STATE_INIT,
    STATE_PASSED,
    STATE_READY,
    STATE_RUNNING,
    STATE_SCOPE_CONTAINER,
    STATE_SCOPE_NODE,
    StateTransitionError,
    allowed_targets,
    can_transition,
    normalize_page_status_text,
    normalize_state,
    transition,
)


def test_node_transition_happy_path() -> None:
    assert transition(STATE_SCOPE_NODE, STATE_INIT, STATE_READY) == STATE_READY
    assert transition(STATE_SCOPE_NODE, STATE_READY, STATE_RUNNING) == STATE_RUNNING
    assert transition(STATE_SCOPE_NODE, STATE_RUNNING, STATE_PASSED) == STATE_PASSED
    assert transition(STATE_SCOPE_NODE, STATE_PASSED, STATE_ARCHIVED) == STATE_ARCHIVED


def test_container_transition_happy_path() -> None:
    assert transition(STATE_SCOPE_CONTAINER, "DRAFT", "RUNNING") == STATE_RUNNING
    assert transition(STATE_SCOPE_CONTAINER, "RUNNING", "VALIDATED") == STATE_PASSED
    assert transition(STATE_SCOPE_CONTAINER, "VALIDATED", "ARCHIVED") == STATE_ARCHIVED


def test_illegal_transition_raises_error_code() -> None:
    with pytest.raises(StateTransitionError) as exc_info:
        transition(STATE_SCOPE_NODE, STATE_READY, STATE_PASSED)
    assert exc_info.value.code == ERROR_ILLEGAL_TRANSITION
    assert exc_info.value.current == STATE_READY
    assert exc_info.value.target == STATE_PASSED
    assert STATE_RUNNING in exc_info.value.allowed


def test_unknown_scope_raises_error_code() -> None:
    with pytest.raises(StateTransitionError) as exc_info:
        transition("WORKITEM", STATE_INIT, STATE_READY)
    assert exc_info.value.code == ERROR_UNKNOWN_SCOPE


def test_unknown_status_raises_error_code() -> None:
    with pytest.raises(StateTransitionError) as exc_info:
        normalize_state("NOT_A_REAL_STATUS")
    assert exc_info.value.code == ERROR_UNKNOWN_STATUS


def test_legacy_status_mapping() -> None:
    assert normalize_state("DRAFT") == STATE_INIT
    assert normalize_state("FINAL_PASS") == STATE_PASSED
    assert normalize_state("REJECTED") == STATE_FAILED
    assert normalize_state("VERIFIED") == STATE_PASSED


def test_page_label_mapping() -> None:
    assert normalize_page_status_text("草稿") == STATE_INIT
    assert normalize_page_status_text("可执行") == STATE_READY
    assert normalize_page_status_text("执行中") == STATE_RUNNING
    assert normalize_page_status_text("已归档") == STATE_ARCHIVED


def test_allowed_targets_and_can_transition() -> None:
    targets = allowed_targets(STATE_SCOPE_CONTAINER, "VALIDATED")
    assert STATE_RUNNING in targets
    assert STATE_ARCHIVED in targets
    assert can_transition(STATE_SCOPE_CONTAINER, "VALIDATED", "RUNNING")
    assert not can_transition(STATE_SCOPE_CONTAINER, "ARCHIVED", "RUNNING")
