from __future__ import annotations

from dataclasses import dataclass
from typing import Final, Literal

UnifiedState = Literal[
    "INIT",
    "READY",
    "RUNNING",
    "BLOCKED",
    "PASSED",
    "FAILED",
    "SIGNING",
    "ARCHIVED",
]
StateScope = Literal["NODE", "CONTAINER"]

STATE_INIT: Final[UnifiedState] = "INIT"
STATE_READY: Final[UnifiedState] = "READY"
STATE_RUNNING: Final[UnifiedState] = "RUNNING"
STATE_BLOCKED: Final[UnifiedState] = "BLOCKED"
STATE_PASSED: Final[UnifiedState] = "PASSED"
STATE_FAILED: Final[UnifiedState] = "FAILED"
STATE_SIGNING: Final[UnifiedState] = "SIGNING"
STATE_ARCHIVED: Final[UnifiedState] = "ARCHIVED"

UNIFIED_STATES: Final[tuple[UnifiedState, ...]] = (
    STATE_INIT,
    STATE_READY,
    STATE_RUNNING,
    STATE_BLOCKED,
    STATE_PASSED,
    STATE_FAILED,
    STATE_SIGNING,
    STATE_ARCHIVED,
)

STATE_SCOPE_NODE: Final[StateScope] = "NODE"
STATE_SCOPE_CONTAINER: Final[StateScope] = "CONTAINER"

ERROR_UNKNOWN_SCOPE: Final[str] = "SM_STATE_UNKNOWN_SCOPE"
ERROR_UNKNOWN_STATUS: Final[str] = "SM_STATE_UNKNOWN_STATUS"
ERROR_ILLEGAL_TRANSITION: Final[str] = "SM_STATE_ILLEGAL_TRANSITION"

ERROR_DEFINITIONS: Final[dict[str, str]] = {
    ERROR_UNKNOWN_SCOPE: "State machine scope is invalid.",
    ERROR_UNKNOWN_STATUS: "State value is unknown and cannot be mapped.",
    ERROR_ILLEGAL_TRANSITION: "State transition is not allowed.",
}

STATE_TEXT_MAP_ZH_CN: Final[dict[UnifiedState, str]] = {
    STATE_INIT: "草稿",
    STATE_READY: "就绪",
    STATE_RUNNING: "执行中",
    STATE_BLOCKED: "已阻断",
    STATE_PASSED: "通过",
    STATE_FAILED: "不通过",
    STATE_SIGNING: "签名中",
    STATE_ARCHIVED: "已归档",
}

_STATE_ALIASES: Final[dict[str, UnifiedState]] = {
    "INIT": STATE_INIT,
    "READY": STATE_READY,
    "RUNNING": STATE_RUNNING,
    "BLOCKED": STATE_BLOCKED,
    "PASSED": STATE_PASSED,
    "FAILED": STATE_FAILED,
    "SIGNING": STATE_SIGNING,
    "ARCHIVED": STATE_ARCHIVED,
    # Legacy backend/frontend states.
    "DRAFT": STATE_INIT,
    "PENDING": STATE_INIT,
    "UNLOCKED": STATE_READY,
    "IN_PROGRESS": STATE_RUNNING,
    "COMPUTED": STATE_RUNNING,
    "GATED": STATE_RUNNING,
    "PASS": STATE_PASSED,
    "FINAL_PASS": STATE_PASSED,
    "QUALIFIED": STATE_PASSED,
    "VALIDATED": STATE_PASSED,
    "VERIFIED": STATE_PASSED,
    "SUCCESS": STATE_PASSED,
    "OVERRIDDEN": STATE_PASSED,
    "FAIL": STATE_FAILED,
    "FINAL_FAIL": STATE_FAILED,
    "REJECTED": STATE_FAILED,
    "CRITICAL": STATE_FAILED,
    "ERROR": STATE_FAILED,
    "LOCKED": STATE_BLOCKED,
}

_PAGE_TEXT_ALIASES: Final[dict[str, UnifiedState]] = {
    "草稿": STATE_INIT,
    "就绪": STATE_READY,
    "可执行": STATE_READY,
    "执行中": STATE_RUNNING,
    "进行中": STATE_RUNNING,
    "阻塞": STATE_BLOCKED,
    "受阻": STATE_BLOCKED,
    "已阻断": STATE_BLOCKED,
    "通过": STATE_PASSED,
    "已完成": STATE_PASSED,
    "已验证": STATE_PASSED,
    "合格": STATE_PASSED,
    "不通过": STATE_FAILED,
    "未通过": STATE_FAILED,
    "已驳回": STATE_FAILED,
    "签名中": STATE_SIGNING,
    "已归档": STATE_ARCHIVED,
}

_NODE_TRANSITIONS: Final[dict[UnifiedState, tuple[UnifiedState, ...]]] = {
    STATE_INIT: (STATE_READY, STATE_RUNNING, STATE_BLOCKED, STATE_PASSED, STATE_FAILED, STATE_SIGNING, STATE_ARCHIVED),
    STATE_READY: (STATE_RUNNING, STATE_BLOCKED, STATE_ARCHIVED),
    STATE_RUNNING: (STATE_PASSED, STATE_FAILED, STATE_BLOCKED, STATE_SIGNING, STATE_ARCHIVED),
    STATE_BLOCKED: (STATE_READY, STATE_RUNNING, STATE_FAILED, STATE_ARCHIVED),
    STATE_PASSED: (STATE_SIGNING, STATE_RUNNING, STATE_ARCHIVED),
    STATE_FAILED: (STATE_READY, STATE_RUNNING, STATE_SIGNING, STATE_ARCHIVED),
    STATE_SIGNING: (STATE_PASSED, STATE_FAILED, STATE_ARCHIVED),
    STATE_ARCHIVED: (),
}

_CONTAINER_TRANSITIONS: Final[dict[UnifiedState, tuple[UnifiedState, ...]]] = {
    STATE_INIT: (STATE_READY, STATE_RUNNING, STATE_BLOCKED),
    STATE_READY: (STATE_RUNNING, STATE_BLOCKED, STATE_ARCHIVED),
    STATE_RUNNING: (STATE_READY, STATE_BLOCKED, STATE_PASSED, STATE_FAILED, STATE_SIGNING, STATE_ARCHIVED),
    STATE_BLOCKED: (STATE_READY, STATE_RUNNING, STATE_FAILED, STATE_ARCHIVED),
    STATE_PASSED: (STATE_RUNNING, STATE_SIGNING, STATE_ARCHIVED),
    STATE_FAILED: (STATE_READY, STATE_RUNNING, STATE_SIGNING, STATE_ARCHIVED),
    STATE_SIGNING: (STATE_PASSED, STATE_FAILED, STATE_ARCHIVED),
    STATE_ARCHIVED: (),
}

_TRANSITIONS_BY_SCOPE: Final[dict[StateScope, dict[UnifiedState, tuple[UnifiedState, ...]]]] = {
    STATE_SCOPE_NODE: _NODE_TRANSITIONS,
    STATE_SCOPE_CONTAINER: _CONTAINER_TRANSITIONS,
}


@dataclass(frozen=True)
class StateTransitionError(ValueError):
    code: str
    message: str
    scope: str | None = None
    current: str | None = None
    target: str | None = None
    allowed: tuple[str, ...] = ()

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.message

    def as_dict(self) -> dict[str, object]:
        return {
            "code": self.code,
            "message": self.message,
            "scope": self.scope,
            "current": self.current,
            "target": self.target,
            "allowed": list(self.allowed),
        }


def _normalize_token(value: str | None) -> str:
    return str(value or "").strip().upper()


def _normalize_scope(scope: StateScope | str) -> StateScope:
    raw = _normalize_token(scope)
    if raw == STATE_SCOPE_NODE:
        return STATE_SCOPE_NODE
    if raw == STATE_SCOPE_CONTAINER:
        return STATE_SCOPE_CONTAINER
    raise StateTransitionError(
        code=ERROR_UNKNOWN_SCOPE,
        message=f"{ERROR_DEFINITIONS[ERROR_UNKNOWN_SCOPE]} scope={scope!r}",
        scope=str(scope),
    )


def normalize_state(value: str | None, *, scope: StateScope | str | None = None) -> UnifiedState:
    if scope is not None:
        _normalize_scope(scope)
    normalized = _normalize_token(value)
    mapped = _STATE_ALIASES.get(normalized)
    if mapped is not None:
        return mapped
    raise StateTransitionError(
        code=ERROR_UNKNOWN_STATUS,
        message=f"{ERROR_DEFINITIONS[ERROR_UNKNOWN_STATUS]} status={value!r}",
        scope=None if scope is None else _normalize_token(str(scope)),
        current=str(value),
    )


def normalize_page_status_text(value: str | None) -> UnifiedState:
    normalized = str(value or "").strip()
    if not normalized:
        raise StateTransitionError(
            code=ERROR_UNKNOWN_STATUS,
            message=f"{ERROR_DEFINITIONS[ERROR_UNKNOWN_STATUS]} status_text={value!r}",
        )
    mapped = _PAGE_TEXT_ALIASES.get(normalized)
    if mapped is not None:
        return mapped
    return normalize_state(normalized)


def allowed_targets(scope: StateScope | str, current_state: str | None) -> tuple[UnifiedState, ...]:
    normalized_scope = _normalize_scope(scope)
    normalized_current = normalize_state(current_state, scope=normalized_scope)
    transitions = _TRANSITIONS_BY_SCOPE[normalized_scope]
    return transitions[normalized_current]


def can_transition(scope: StateScope | str, current_state: str | None, target_state: str | None) -> bool:
    normalized_scope = _normalize_scope(scope)
    normalized_current = normalize_state(current_state, scope=normalized_scope)
    normalized_target = normalize_state(target_state, scope=normalized_scope)
    if normalized_current == normalized_target:
        return True
    return normalized_target in _TRANSITIONS_BY_SCOPE[normalized_scope][normalized_current]


def assert_transition(scope: StateScope | str, current_state: str | None, target_state: str | None) -> UnifiedState:
    normalized_scope = _normalize_scope(scope)
    normalized_current = normalize_state(current_state, scope=normalized_scope)
    normalized_target = normalize_state(target_state, scope=normalized_scope)
    if normalized_current == normalized_target:
        return normalized_target
    allowed = _TRANSITIONS_BY_SCOPE[normalized_scope][normalized_current]
    if normalized_target not in allowed:
        raise StateTransitionError(
            code=ERROR_ILLEGAL_TRANSITION,
            message=(
                f"{ERROR_DEFINITIONS[ERROR_ILLEGAL_TRANSITION]} "
                f"{normalized_scope}:{normalized_current}->{normalized_target}"
            ),
            scope=normalized_scope,
            current=normalized_current,
            target=normalized_target,
            allowed=tuple(allowed),
        )
    return normalized_target


def transition(scope: StateScope | str, current_state: str | None, target_state: str | None) -> UnifiedState:
    return assert_transition(scope=scope, current_state=current_state, target_state=target_state)
