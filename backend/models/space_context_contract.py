from __future__ import annotations

from typing import Final

# Space container lifecycle states (container-level state machine).
SPACE_STATE_DRAFT: Final[str] = "DRAFT"
SPACE_STATE_RUNNING: Final[str] = "RUNNING"
SPACE_STATE_VALIDATED: Final[str] = "VALIDATED"
SPACE_STATE_REJECTED: Final[str] = "REJECTED"
SPACE_STATE_ARCHIVED: Final[str] = "ARCHIVED"

SPACE_CONTAINER_LIFECYCLE_STATES: Final[tuple[str, ...]] = (
    SPACE_STATE_DRAFT,
    SPACE_STATE_RUNNING,
    SPACE_STATE_VALIDATED,
    SPACE_STATE_REJECTED,
    SPACE_STATE_ARCHIVED,
)

# Spec-binding execution states (SPU-level state in a container).
SPACE_SPEC_STATUS_DRAFT: Final[str] = "DRAFT"
SPACE_SPEC_STATUS_RUNNING: Final[str] = "RUNNING"
SPACE_SPEC_STATUS_PASS: Final[str] = "PASS"
SPACE_SPEC_STATUS_FAIL: Final[str] = "FAIL"

SPACE_SPEC_BINDING_STATES: Final[tuple[str, ...]] = (
    SPACE_SPEC_STATUS_DRAFT,
    SPACE_SPEC_STATUS_RUNNING,
    SPACE_SPEC_STATUS_PASS,
    SPACE_SPEC_STATUS_FAIL,
)

# Node completion status.
SPACE_NODE_RESULT_STATES: Final[tuple[str, ...]] = (
    SPACE_SPEC_STATUS_PASS,
    SPACE_SPEC_STATUS_FAIL,
)

# Runtime pending actions.
SPACE_PENDING_ACTION_IDLE: Final[str] = ""
SPACE_PENDING_ACTION_EXECUTE_NODE: Final[str] = "EXECUTE_NODE"
SPACE_PENDING_ACTION_RETEST: Final[str] = "RETEST"
SPACE_PENDING_ACTION_READY_TO_ARCHIVE: Final[str] = "READY_TO_ARCHIVE"
SPACE_PENDING_ACTION_MANUAL_REVIEW: Final[str] = "MANUAL_REVIEW"
SPACE_PENDING_ACTION_LOCKED: Final[str] = "LOCKED"

SPACE_PENDING_ACTIONS: Final[tuple[str, ...]] = (
    SPACE_PENDING_ACTION_IDLE,
    SPACE_PENDING_ACTION_EXECUTE_NODE,
    SPACE_PENDING_ACTION_RETEST,
    SPACE_PENDING_ACTION_READY_TO_ARCHIVE,
    SPACE_PENDING_ACTION_MANUAL_REVIEW,
    SPACE_PENDING_ACTION_LOCKED,
)

# Container proof minimal required fields.
SPACE_CONTAINER_PROOF_REQUIRED_FIELDS: Final[tuple[str, ...]] = (
    "container_id",
    "geo_slot_ref",
    "slot_ref",
    "volume_ref",
    "spec_results",
    "overall_status",
    "signatures",
    "timestamp",
    "archived_at",
    "audit_trail",
)
