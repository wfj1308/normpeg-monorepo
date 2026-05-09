from __future__ import annotations

from typing import Any, Dict, List

from app.models.execution import ProofDTO
from app.services.common import stable_hash, utc_now


def build_proof(
    normdoc_payload: Dict[str, Any],
    input_payload: Dict[str, Any],
    path_outputs: Dict[str, Any],
    gate_payload: Dict[str, Any],
    state_trace: List[str],
) -> ProofDTO:
    proof_fields = list(normdoc_payload.get("trailer", {}).get("proof_fields", []))
    canonical_payload: Dict[str, Any] = {
        "component": normdoc_payload.get("header", {}),
        "input": input_payload,
        "path_outputs": path_outputs,
        "gate": gate_payload,
        "state_trace": state_trace,
        "generated_at": utc_now(),
    }
    digest = stable_hash(canonical_payload)
    payload = canonical_payload
    if proof_fields:
        payload = {
            "proof_fields": proof_fields,
            "canonical_payload": canonical_payload,
        }
    return ProofDTO(proof_hash=digest, generated_at=utc_now(), payload=payload)

