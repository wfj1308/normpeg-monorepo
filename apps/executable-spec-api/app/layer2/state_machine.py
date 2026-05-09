from __future__ import annotations

from typing import List

from app.models.execution import GateDecision


def build_state_trace(available_states: List[str], gate: GateDecision) -> List[str]:
    trace: List[str] = []
    for state in ("DRAFT", "COMPUTED", "VALIDATED", "AGGREGATED"):
        if state in available_states:
            trace.append(state)

    if gate.status in {"PASS", "OVERRIDDEN"}:
        if gate.status == "OVERRIDDEN" and "OVERRIDDEN" in available_states:
            trace.append("OVERRIDDEN")
        if "QUALIFIED" in available_states:
            trace.append("QUALIFIED")
    else:
        if "REJECTED" in available_states:
            trace.append("REJECTED")
    return trace

