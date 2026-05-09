from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List

from app.layer1.facade import resolve_layer1_component
from app.layer2.gate_engine import evaluate_gate
from app.layer2.path_executor import execute_path
from app.layer2.proof_service import build_proof
from app.layer2.registry import locate_component
from app.layer2.state_machine import build_state_trace
from app.models.execution import CompactionExecutionRequest, ExecutionResult
from app.models.normdoc import Layer1ResolveRequest


def _normalize_execution_input(request: CompactionExecutionRequest) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "project_id": request.project_id,
        "stake": request.stake,
        "layer_depth": request.layer_depth,
        "test_method": request.test_method,
        "actor_did": request.actor_did,
        "actor_name": request.actor_name,
        "inspected_at": (request.inspected_at or datetime.now(timezone.utc)).isoformat(),
    }
    if request.raw_data:
        payload.update(request.raw_data.model_dump())
    if request.compaction_degree is not None:
        payload["compaction_degree"] = request.compaction_degree
    return payload


def execute_compaction(request: CompactionExecutionRequest) -> ExecutionResult:
    resolved = resolve_layer1_component(
        Layer1ResolveRequest(
            project_id=request.project_id,
            component_id=request.component_id,
            version=request.version,
            patch_ids=request.patch_ids,
            use_project_overrides=True,
        )
    )
    normdoc_payload = resolved.normdoc
    component_meta = locate_component(normdoc_payload)

    execution_input = _normalize_execution_input(request)
    path_outputs = execute_path(normdoc_payload, execution_input)
    gate = evaluate_gate(
        normdoc_payload,
        path_outputs,
        request.paragraph_values,
        request.override_requested,
        request.override_evidence,
    )
    states = list(normdoc_payload.get("body", {}).get("state", []))
    state_trace = build_state_trace(states, gate)

    output_status = "PASS"
    if gate.status in {"BLOCKED", "CRITICAL"}:
        output_status = "FAIL"
    if gate.status == "OVERRIDDEN":
        output_status = "OVERRIDDEN"

    output = {
        "compaction_degree": round(float(path_outputs["compaction_degree"]), 3),
        "representative_value": round(float(gate.representative_value), 3),
        "standard_value": float(gate.standard_value),
        "status": output_status,
    }

    proof = build_proof(
        normdoc_payload=normdoc_payload,
        input_payload=execution_input,
        path_outputs=path_outputs,
        gate_payload=gate.model_dump(),
        state_trace=state_trace,
    )

    basis = {
        "component_registry": component_meta,
        "gate_entry": normdoc_payload.get("gate", {}).get("entry", ""),
        "clause_refs": gate.clause_refs,
        "applied_patches": resolved.applied_patches,
        "applied_overrides": resolved.applied_overrides,
    }

    return ExecutionResult(
        component_id=resolved.component_id,
        version=resolved.version,
        project_id=request.project_id,
        state_trace=state_trace,
        input=execution_input,
        path_outputs=path_outputs,
        gate=gate,
        output=output,
        proof=proof,
        explanation_basis=basis,
    )


def execute_compaction_table(rows: List[CompactionExecutionRequest]) -> Dict[str, Any]:
    results = [execute_compaction(row) for row in rows]
    pass_count = sum(1 for item in results if item.output.get("status") == "PASS")
    fail_count = len(results) - pass_count
    return {
        "total": len(results),
        "pass_count": pass_count,
        "fail_count": fail_count,
        "rows": [item.model_dump() for item in results],
    }
