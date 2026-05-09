from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, Literal, TypedDict

UTXOType = Literal["RoadSection", "Bridge", "ComponentExecution"]
UTXOState = Literal["DRAFT", "COMPUTED", "VALIDATED", "QUALIFIED", "REJECTED", "MERGED", "ABANDONED"]
BranchStatus = Literal["ACTIVE", "FORK_CREATED", "UNDER_REVIEW", "APPROVED", "REJECTED", "MERGED", "ABANDONED"]


class UTXOTransition(TypedDict, total=False):
    input_utxo: str
    output_utxo: str
    input_v_address: str
    output_v_address: str
    state: str
    execution_id: str
    proof_hash: str | None
    branch: str
    timestamp: int


class UTXOOutput(TypedDict, total=False):
    utxo_id: str
    v_address: str
    type: UTXOType
    state: UTXOState
    payload: Dict[str, Any]
    created_at: str
    consumed: bool
    spent_at: str | None
    spent_by: str | None


class Branch(TypedDict, total=False):
    branch_id: str
    parent_branch: str | None
    created_at: str
    reason: str
    created_by: str
    overrides: Dict[str, Any]
    status: BranchStatus
    approvals: list["BranchApproval"]
    workflow_history: list[Dict[str, Any]]
    merge_info: "BranchMergeInfo"
    abandon_info: "BranchAbandonInfo"


class BranchApproval(TypedDict, total=False):
    did: str
    role: str
    decision: Literal["APPROVE", "REJECT"]
    comment: str
    timestamp: int


class BranchMergeInfo(TypedDict, total=False):
    merged_at: str
    merged_by: str
    decision: Literal["ACCEPTED", "REJECTED"]
    target_branch: str
    applied_overrides: list[Dict[str, Any]]
    applied_utxos: list[Dict[str, Any]]
    decision_proof_hash: str


class BranchAbandonInfo(TypedDict, total=False):
    abandoned_at: str
    abandoned_by: str
    reason: str
    decision: Literal["ABANDONED"]
    decision_proof_hash: str


class BranchDecisionProof(TypedDict, total=False):
    proof_id: str
    action: Literal["MERGE", "ABANDON"]
    project_id: str
    branch_id: str
    parent_branch: str | None
    fork_point: str | None
    fork_reason: str | None
    decision: str
    actor_did: str
    source_branch: str
    target_branch: str | None
    component_id: str
    execution_id: str
    main_chain_hash: str
    fork_chain_hash: str
    merkle_root: str
    proof_path: list[Dict[str, str]]
    signatures: list[Dict[str, str]]
    timestamp: int
    proof_hash: str
    hash_method: Literal["sha256"]
    ledger_index: int
    previous_chain_hash: str
    chain_hash: str
    merkle_leaf_index: int
    merkle_tree_size: int
    workflow_history: list[Dict[str, Any]]


class SplitRecord(TypedDict):
    split_id: str
    original_range: str
    splits: list[str]
    created_at: str


class ProjectStateSnapshot(TypedDict, total=False):
    status: str
    branch: str
    latest_utxo: str | None
    latest_v_address: str | None
    execution_id: str | None
    proof_hash: str | None
    updated_at: str
    source: str


class ProjectUTXO(TypedDict):
    id: str
    project_id: str
    genesis_time: str
    current_state: ProjectStateSnapshot
    unspent_outputs: Dict[str, UTXOOutput]
    branches: Dict[str, Branch]
    current_branch: str
    split_history: list[SplitRecord]


def create_current_state(
    *,
    status: str,
    branch: str,
    latest_utxo: str | None = None,
    latest_v_address: str | None = None,
    execution_id: str | None = None,
    proof_hash: str | None = None,
    updated_at: str | None = None,
    source: str = "system",
) -> ProjectStateSnapshot:
    return {
        "status": str(status).strip() or "DRAFT",
        "branch": str(branch).strip() or "main",
        "latest_utxo": latest_utxo,
        "latest_v_address": latest_v_address,
        "execution_id": execution_id,
        "proof_hash": proof_hash,
        "updated_at": updated_at or _utc_now(),
        "source": str(source).strip() or "system",
    }


def current_state_from_output(output: UTXOOutput, *, branch: str, source: str = "utxo_transition") -> ProjectStateSnapshot:
    payload = output.get("payload", {})
    execution_id = None
    proof_hash = None
    if isinstance(payload, dict):
        raw_execution_id = payload.get("execution_id")
        raw_proof_hash = payload.get("proof_hash")
        if isinstance(raw_execution_id, str) and raw_execution_id.strip():
            execution_id = raw_execution_id.strip()
        if isinstance(raw_proof_hash, str) and raw_proof_hash.strip():
            proof_hash = raw_proof_hash.strip()
    return create_current_state(
        status=str(output.get("state", "DRAFT")),
        branch=branch,
        latest_utxo=str(output.get("utxo_id", "")).strip() or None,
        latest_v_address=str(output.get("v_address", "")).strip() or None,
        execution_id=execution_id,
        proof_hash=proof_hash,
        updated_at=str(output.get("created_at", "")).strip() or _utc_now(),
        source=source,
    )


def deepcopy_state(state: ProjectStateSnapshot) -> ProjectStateSnapshot:
    return deepcopy(state)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
