from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List


class StateEngineError(ValueError):
    """Raised when state transition resolution fails."""


REQUIRED_LIFECYCLE_STATES = {
    "DRAFT",
    "COMPUTED",
    "VALIDATED",
    "QUALIFIED",
    "REJECTED",
    "OVERRIDDEN",
    "ARCHIVED",
}


class StateEngine:
    """Resolve lifecycle trace and support explicit transition simulation."""

    def resolve(
        self,
        component: Dict[str, Any],
        final_status: str,
        normalized_input: Dict[str, Any] | None = None,
        gate_result: Dict[str, Any] | None = None,
    ) -> List[Dict[str, Any]]:
        result = resolve_state_lifecycle(
            component=component,
            gate_status=final_status,
            normalized_input=normalized_input,
            gate_result=gate_result,
        )
        return result["state_trace"]

    def resolve_lifecycle(
        self,
        component: Dict[str, Any],
        gate_status: str,
        normalized_input: Dict[str, Any] | None = None,
        gate_result: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return resolve_state_lifecycle(
            component=component,
            gate_status=gate_status,
            normalized_input=normalized_input,
            gate_result=gate_result,
        )

    def transition(
        self,
        component: Dict[str, Any],
        current_state: str,
        trigger: str,
        meta: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return transition_state(component=component, current_state=current_state, trigger=trigger, meta=meta)


def resolve_state(component: Dict[str, Any], final_status: str) -> List[Dict[str, Any]]:
    result = resolve_state_lifecycle(component=component, gate_status=final_status)
    return result["state_trace"]


def resolve_state_lifecycle(
    component: Dict[str, Any],
    gate_status: str,
    normalized_input: Dict[str, Any] | None = None,
    gate_result: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    state_cfg = component.get("state", {})
    if not isinstance(state_cfg, dict):
        raise StateEngineError("component.state must be a dict")

    states = _collect_states(state_cfg)
    transitions = _collect_transitions(state_cfg)
    terminal_states = _collect_terminal_states(state_cfg)
    _validate_lifecycle_definition(states=states, transitions=transitions, terminal_states=terminal_states)

    normalized_input = normalized_input if isinstance(normalized_input, dict) else {}
    gate_result = gate_result if isinstance(gate_result, dict) else {}

    current_state = _resolve_initial_state(state_cfg, states, transitions)
    trace: List[Dict[str, Any]] = [_trace_item(current_state, "input_received", 0)]

    current_state = _apply_transition(
        current_state=current_state,
        target_state="COMPUTED",
        transitions=transitions,
        trigger="path_executed",
        trace=trace,
        time_offset=1,
    )
    current_state = _apply_transition(
        current_state=current_state,
        target_state="VALIDATED",
        transitions=transitions,
        trigger="gate_executed",
        trace=trace,
        time_offset=2,
        meta={"gate_status": str(gate_status).upper()},
    )

    adjudication = _resolve_adjudication_state(
        gate_status=gate_status,
        normalized_input=normalized_input,
        state_cfg=state_cfg,
        gate_result=gate_result,
    )
    current_state = _apply_transition(
        current_state=current_state,
        target_state=adjudication["state"],
        transitions=transitions,
        trigger=adjudication["trigger"],
        trace=trace,
        time_offset=3,
        meta=adjudication["meta"],
    )

    remediation_added = False
    if current_state == "REJECTED" and _remediation_on_rejected_enabled(state_cfg):
        remediation_path = _resolve_remediation_path(normalized_input, state_cfg)
        trace.append(
            _trace_item(
                current_state,
                "remediation_path_triggered",
                4,
                {
                    "remediation_required": True,
                    "remediation_path": remediation_path,
                    "gate_status": str(gate_status).upper(),
                },
            )
        )
        remediation_added = True

    archive_requested = bool(normalized_input.get(_archive_trigger_field(state_cfg), False))
    if archive_requested:
        current_state = _apply_transition(
            current_state=current_state,
            target_state="ARCHIVED",
            transitions=transitions,
            trigger="archive_requested",
            trace=trace,
            time_offset=5 if remediation_added else 4,
            meta={"archive_requested": True},
        )

    lifecycle_status = current_state
    return {
        "state_trace": trace,
        "lifecycle_status": lifecycle_status,
    }


def transition_state(
    component: Dict[str, Any],
    current_state: str,
    trigger: str,
    meta: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    if not isinstance(component, dict):
        raise StateEngineError("component must be object")
    if not isinstance(current_state, str) or not current_state:
        raise StateEngineError("current_state is required")
    if not isinstance(trigger, str) or not trigger:
        raise StateEngineError("trigger is required")

    state_cfg = component.get("state", {})
    if not isinstance(state_cfg, dict):
        raise StateEngineError("component.state must be object")

    transitions = _collect_transitions(state_cfg)
    if not transitions:
        raise StateEngineError("state transitions are empty")

    for item in transitions:
        if item["from_state"] == current_state and item["trigger"] == trigger:
            trace = [
                _trace_item(current_state, "transition_request", 0),
                _trace_item(item["to_state"], trigger, 1, meta),
            ]
            return {
                "from_state": current_state,
                "trigger": trigger,
                "to_state": item["to_state"],
                "state_trace": trace,
            }

    raise StateEngineError(f"transition not allowed: {current_state} --{trigger}--> ?")


def _resolve_adjudication_state(
    gate_status: str,
    normalized_input: Dict[str, Any],
    state_cfg: Dict[str, Any],
    gate_result: Dict[str, Any],
) -> Dict[str, Any]:
    status = str(gate_status).upper()
    override_requested_key = str(state_cfg.get("override_requested_field", "override_requested"))
    override_evidence_key = str(state_cfg.get("override_evidence_field", "override_evidence"))
    override_requested = bool(normalized_input.get(override_requested_key, False))
    override_evidence = normalized_input.get(override_evidence_key)
    override_approved = override_requested and override_evidence is not None

    if override_approved and status in {"FAIL", "BLOCKED", "CRITICAL"}:
        return {
            "state": "OVERRIDDEN",
            "trigger": "manual_override_approved",
            "meta": {
                "override_requested": True,
                "override_approved": True,
                "gate_status": status,
            },
        }

    if status in {"PASS", "WARNING", "QUALIFIED"}:
        return {
            "state": "QUALIFIED",
            "trigger": "all_rules_pass",
            "meta": {"gate_status": status},
        }

    return {
        "state": "REJECTED",
        "trigger": "rule_failed",
        "meta": {
            "gate_status": status,
            "failed_rule_count": len(gate_result.get("rule_hits", [])) if isinstance(gate_result.get("rule_hits"), list) else None,
        },
    }


def _archive_trigger_field(state_cfg: Dict[str, Any]) -> str:
    raw = state_cfg.get("archive_trigger_field", "archive_requested")
    if isinstance(raw, str) and raw.strip():
        return raw
    return "archive_requested"


def _remediation_on_rejected_enabled(state_cfg: Dict[str, Any]) -> bool:
    raw = state_cfg.get("remediation_on_rejected", True)
    if isinstance(raw, bool):
        return raw
    return True


def _resolve_remediation_path(normalized_input: Dict[str, Any], state_cfg: Dict[str, Any]) -> str:
    remediation_field = state_cfg.get("remediation_path_field", "remediation_path")
    if isinstance(remediation_field, str) and remediation_field.strip():
        candidate = normalized_input.get(remediation_field)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    default_path = state_cfg.get("default_remediation_path", "default_remediation_path")
    if isinstance(default_path, str) and default_path.strip():
        return default_path.strip()
    return "default_remediation_path"


def _collect_states(state_cfg: Dict[str, Any]) -> list[str]:
    states = state_cfg.get("states", [])
    if not isinstance(states, list):
        raise StateEngineError("component.state.states must be list")
    normalized = [item for item in states if isinstance(item, str) and item]
    if not normalized:
        raise StateEngineError("component.state.states cannot be empty")
    return normalized


def _collect_transitions(state_cfg: Dict[str, Any]) -> list[Dict[str, Any]]:
    transitions = state_cfg.get("allowed_transitions", state_cfg.get("transitions", []))
    if not isinstance(transitions, list):
        raise StateEngineError("component.state.allowed_transitions must be list")

    normalized: list[Dict[str, Any]] = []
    for transition in transitions:
        if not isinstance(transition, dict):
            continue
        from_state = transition.get("from_state")
        to_state = transition.get("to_state")
        trigger = transition.get("trigger")
        if isinstance(from_state, str) and isinstance(to_state, str) and isinstance(trigger, str):
            normalized.append(
                {
                    "from_state": from_state,
                    "to_state": to_state,
                    "trigger": trigger,
                }
            )
    if not normalized:
        raise StateEngineError("component.state.allowed_transitions cannot be empty")
    return normalized


def _collect_terminal_states(state_cfg: Dict[str, Any]) -> list[str]:
    terminal_states = state_cfg.get("terminal_states", [])
    if not isinstance(terminal_states, list):
        raise StateEngineError("component.state.terminal_states must be list")
    normalized = [item for item in terminal_states if isinstance(item, str) and item]
    if not normalized:
        raise StateEngineError("component.state.terminal_states cannot be empty")
    return normalized


def _validate_lifecycle_definition(
    states: list[str],
    transitions: list[Dict[str, Any]],
    terminal_states: list[str],
) -> None:
    state_set = set(states)
    missing = REQUIRED_LIFECYCLE_STATES - state_set
    if missing:
        raise StateEngineError(f"state lifecycle is incomplete, missing: {sorted(missing)}")

    for terminal in terminal_states:
        if terminal not in state_set:
            raise StateEngineError(f"terminal_state not in states: {terminal}")

    for transition in transitions:
        if transition["from_state"] not in state_set:
            raise StateEngineError(f"transition.from_state not in states: {transition['from_state']}")
        if transition["to_state"] not in state_set:
            raise StateEngineError(f"transition.to_state not in states: {transition['to_state']}")


def _resolve_initial_state(
    state_cfg: Dict[str, Any],
    states: list[str],
    transitions: list[Dict[str, Any]],
) -> str:
    initial = state_cfg.get("initial_state")
    if isinstance(initial, str) and initial:
        if initial not in set(states):
            raise StateEngineError(f"initial_state not in states: {initial}")
        return initial
    if states:
        return states[0]
    if transitions:
        return transitions[0]["from_state"]
    return "DRAFT"


def _apply_transition(
    current_state: str,
    target_state: str,
    transitions: list[Dict[str, Any]],
    trigger: str,
    trace: list[Dict[str, Any]],
    time_offset: int,
    meta: Dict[str, Any] | None = None,
) -> str:
    explicit_to = _find_transition_target(current_state, trigger, transitions)
    if explicit_to:
        next_state = explicit_to
        item_meta = dict(meta or {})
        if next_state != target_state:
            item_meta["requested_target_state"] = target_state
            item_meta["resolved_by"] = "allowed_transition"
    else:
        next_state = target_state
        item_meta = dict(meta or {})
        item_meta["resolved_by"] = "fallback_target_state"

    if next_state != current_state:
        trace.append(_trace_item(next_state, trigger, time_offset, item_meta or None))
    return next_state


def _find_transition_target(current_state: str, trigger: str, transitions: list[Dict[str, Any]]) -> str | None:
    for transition in transitions:
        if transition["from_state"] == current_state and transition["trigger"] == trigger:
            return transition["to_state"]
    return None


def _trace_item(state: str, trigger: str, seconds_offset: int, meta: Dict[str, Any] | None = None) -> Dict[str, Any]:
    entered_at = (datetime.now(timezone.utc) + timedelta(seconds=seconds_offset)).replace(microsecond=0)
    item: Dict[str, Any] = {
        "state": state,
        "entered_at": entered_at.isoformat().replace("+00:00", "Z"),
        "trigger": trigger,
    }
    if meta:
        item["meta"] = meta
    return item
