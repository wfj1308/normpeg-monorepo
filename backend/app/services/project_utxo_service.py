from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from copy import deepcopy
from datetime import date, datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Literal, Mapping, TypedDict, cast

import jsonschema

from ..core.proof_chain_store import ProofChainStore, ProofChainStoreError
from ..core.v_address import VAddressError, build_v_address, normalize_project_id, parse_v_address
from ..core.v_address_resolver import resolve as resolve_v_protocol, resolve_branch_reference, resolve_project_v_address
from ..utils.merkle_service import hash_data
from ...utxo.models import create_current_state

if TYPE_CHECKING:
    from ..core import ComponentExecutionEngine


UTXOType = Literal["RoadSection", "Bridge", "ComponentExecution"]
UTXOState = Literal["DRAFT", "COMPUTED", "VALIDATED", "QUALIFIED", "REJECTED"]
BranchStatus = Literal["ACTIVE", "FORK_CREATED", "UNDER_REVIEW", "APPROVED", "REJECTED", "MERGED", "ABANDONED"]
MergeDecision = Literal["ACCEPTED", "REJECTED"]
ApprovalDecision = Literal["APPROVE", "REJECT"]

_FORK_WORKFLOW_ACTIVE_STATUSES: set[str] = {"ACTIVE", "FORK_CREATED", "UNDER_REVIEW", "APPROVED"}
_FORK_WORKFLOW_TERMINAL_STATUSES: set[str] = {"MERGED", "ABANDONED"}


class UTXOOutput(TypedDict):
    utxo_id: str
    v_address: str
    type: UTXOType
    state: UTXOState
    payload: Dict[str, Any]
    created_at: str
    consumed: bool


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
    decision: ApprovalDecision
    comment: str
    timestamp: int


class BranchMergeInfo(TypedDict, total=False):
    merged_at: str
    merged_by: str
    decision: MergeDecision
    target_branch: str
    applied_overrides: list[Dict[str, Any]]
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


class ProjectUTXO(TypedDict):
    id: str
    project_id: str
    genesis_time: str
    current_state: Dict[str, Any]
    unspent_outputs: Dict[str, UTXOOutput]
    branches: Dict[str, Branch]
    current_branch: str
    split_history: list[SplitRecord]


class ProjectUTXOServiceError(ValueError):
    """Raised when ProjectUTXO write/read operations fail."""


def create_project_utxo(project_id: str) -> ProjectUTXO:
    normalized = normalize_project_id(project_id)
    now = _utc_now()
    return {
        "id": f"v://{normalized}",
        "project_id": normalized,
        "genesis_time": now,
        "current_state": create_current_state(
            status="DRAFT",
            branch="main",
            updated_at=now,
            source="genesis",
        ),
        "unspent_outputs": {},
        "branches": {
            "main": {
                "branch_id": "main",
                "parent_branch": None,
                "created_at": now,
                "reason": "genesis",
                "created_by": "did:layerpeg:system",
                "overrides": {},
                "status": "ACTIVE",
                "approvals": [],
                "workflow_history": [
                    {
                        "from_status": None,
                        "to_status": "ACTIVE",
                        "action": "GENESIS",
                        "timestamp": _iso_to_unix(now),
                        "operator": "did:layerpeg:system",
                        "comment": "project genesis",
                    }
                ],
            }
        },
        "current_branch": "main",
        "split_history": [],
    }


def add_output(project_utxo: ProjectUTXO, output: UTXOOutput) -> ProjectUTXO:
    storage_key = _output_storage_key(output)
    if storage_key in project_utxo["unspent_outputs"]:
        raise ProjectUTXOServiceError(f"UTXO already exists: {storage_key}")
    if output["consumed"]:
        raise ProjectUTXOServiceError("new output must be unconsumed")

    next_output = deepcopy(output)
    next_output["consumed"] = False
    if not next_output.get("created_at"):
        next_output["created_at"] = _utc_now()

    next_state = deepcopy(project_utxo)
    next_state["current_state"] = _current_state_from_output(next_output, branch_id=_resolve_output_branch(next_output))
    next_state["unspent_outputs"][storage_key] = next_output
    return next_state


def consume_output(project_utxo: ProjectUTXO, utxo_id: str, *, spent_by: str | None = None, spent_at: str | None = None) -> ProjectUTXO:
    storage_key = _find_output_storage_key(project_utxo, utxo_id)
    current = project_utxo["unspent_outputs"].get(storage_key)
    if current is None:
        raise ProjectUTXOServiceError(f"UTXO not found: {utxo_id}")
    if current["consumed"]:
        raise ProjectUTXOServiceError(f"UTXO already consumed: {utxo_id}")

    next_state = deepcopy(project_utxo)
    next_state["unspent_outputs"][storage_key]["consumed"] = True
    next_state["unspent_outputs"][storage_key]["spent_by"] = spent_by
    next_state["unspent_outputs"][storage_key]["spent_at"] = spent_at or _utc_now()
    return next_state


def get_unspent_outputs(project_utxo: ProjectUTXO) -> list[UTXOOutput]:
    return [deepcopy(item) for item in project_utxo["unspent_outputs"].values() if not item["consumed"]]


def fork_branch(
    project_utxo: ProjectUTXO,
    from_branch: str,
    new_branch_id: str,
    reason: str,
    *,
    created_by: str | None = None,
) -> ProjectUTXO:
    from_id = str(from_branch).strip() or "main"
    new_id = str(new_branch_id).strip()
    if not new_id:
        raise ProjectUTXOServiceError("new_branch_id is required")
    if new_id in project_utxo["branches"]:
        raise ProjectUTXOServiceError(f"branch already exists: {new_id}")

    base = project_utxo["branches"].get(from_id)
    if base is None:
        raise ProjectUTXOServiceError(f"parent branch not found: {from_id}")
    if not _is_branch_active_for_fork(str(base.get("status", ""))):
        raise ProjectUTXOServiceError(f"parent branch is not active for fork: {from_id}")

    next_state = deepcopy(project_utxo)
    now = _utc_now()
    operator = str(created_by or "did:layerpeg:operator").strip() or "did:layerpeg:operator"
    next_state["branches"][new_id] = {
        "branch_id": new_id,
        "parent_branch": from_id,
        "created_at": now,
        "reason": reason.strip() or "fork",
        "created_by": operator,
        "overrides": {},
        "status": "FORK_CREATED",
        "approvals": [],
        "workflow_history": [
            {
                "from_status": None,
                "to_status": "FORK_CREATED",
                "action": "FORK_CREATED",
                "timestamp": _iso_to_unix(now),
                "operator": operator,
                "comment": reason.strip() or "fork",
            }
        ],
    }
    fork_ts = _iso_to_unix(now)
    for output in _branch_outputs(project_utxo, from_id, include_consumed=False):
        try:
            parsed = parse_v_address(output["v_address"])
        except VAddressError:
            continue
        cloned = deepcopy(output)
        cloned["utxo_id"] = f"{output['utxo_id']}_fork_{new_id}"
        cloned["v_address"] = build_v_address(
            {
                "projectId": parsed["projectId"],
                "stake": parsed["stake"],
                "version": _output_version(output),
                "layer": parsed.get("layer"),
                "branch": new_id,
                "timestamp": fork_ts,
            }
        )
        cloned["consumed"] = False
        cloned["spent_at"] = None
        cloned["spent_by"] = None
        cloned["created_at"] = now
        payload = cloned.get("payload", {})
        if not isinstance(payload, dict):
            payload = {}
        payload["branch_id"] = new_id
        payload["forked_from_branch"] = from_id
        payload["forked_from_utxo"] = output["utxo_id"]
        payload["fork_point"] = now
        cloned["payload"] = payload
        next_state["unspent_outputs"][_output_storage_key(cloned)] = cloned
    return next_state


def apply_override(branch: Branch, target_path: str, value: Any) -> Branch:
    target = str(target_path).strip()
    if not target:
        raise ProjectUTXOServiceError("target_path is required")

    next_branch = deepcopy(branch)
    overrides = next_branch.get("overrides", {})
    if not isinstance(overrides, dict):
        overrides = {}
    overrides[target] = deepcopy(value)
    next_branch["overrides"] = overrides
    return next_branch


def submit_branch_review(
    project_utxo: ProjectUTXO,
    *,
    branch_id: str,
    operator: str,
    comment: str | None = None,
) -> ProjectUTXO:
    branch_key = str(branch_id).strip()
    if branch_key in {"", "main"}:
        raise ProjectUTXOServiceError("main branch cannot enter review workflow")

    branch = project_utxo["branches"].get(branch_key)
    if branch is None:
        raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
    status = str(branch.get("status", ""))
    if status != "FORK_CREATED":
        raise ProjectUTXOServiceError(f"branch must be FORK_CREATED before submit-review: {branch_key}")

    next_state = deepcopy(project_utxo)
    updated = next_state["branches"][branch_key]
    updated["status"] = "UNDER_REVIEW"
    _append_workflow_event(
        updated,
        from_status="FORK_CREATED",
        to_status="UNDER_REVIEW",
        action="SUBMIT_REVIEW",
        operator=operator,
        comment=comment or "submitted for review",
    )
    return next_state


def approve_branch_review(
    project_utxo: ProjectUTXO,
    *,
    branch_id: str,
    did: str,
    role: str,
    comment: str | None = None,
) -> ProjectUTXO:
    branch_key = str(branch_id).strip()
    if branch_key in {"", "main"}:
        raise ProjectUTXOServiceError("main branch does not require branch approval")

    branch = project_utxo["branches"].get(branch_key)
    if branch is None:
        raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
    status = str(branch.get("status", ""))
    if status != "UNDER_REVIEW":
        raise ProjectUTXOServiceError(f"branch must be UNDER_REVIEW before approve: {branch_key}")

    next_state = deepcopy(project_utxo)
    updated = next_state["branches"][branch_key]
    updated["status"] = "APPROVED"
    _append_approval(
        updated,
        did=did,
        role=role,
        decision="APPROVE",
        comment=comment or "approved",
    )
    _append_workflow_event(
        updated,
        from_status="UNDER_REVIEW",
        to_status="APPROVED",
        action="APPROVE",
        operator=did,
        comment=comment or "approved",
    )
    return next_state


def reject_branch_review(
    project_utxo: ProjectUTXO,
    *,
    branch_id: str,
    did: str,
    role: str,
    comment: str | None = None,
) -> ProjectUTXO:
    branch_key = str(branch_id).strip()
    if branch_key in {"", "main"}:
        raise ProjectUTXOServiceError("main branch cannot be rejected")

    branch = project_utxo["branches"].get(branch_key)
    if branch is None:
        raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
    status = str(branch.get("status", ""))
    if status != "UNDER_REVIEW":
        raise ProjectUTXOServiceError(f"branch must be UNDER_REVIEW before reject: {branch_key}")

    next_state = deepcopy(project_utxo)
    updated = next_state["branches"][branch_key]
    updated["status"] = "REJECTED"
    _append_approval(
        updated,
        did=did,
        role=role,
        decision="REJECT",
        comment=comment or "rejected",
    )
    _append_workflow_event(
        updated,
        from_status="UNDER_REVIEW",
        to_status="REJECTED",
        action="REJECT",
        operator=did,
        comment=comment or "rejected",
    )
    return next_state


def merge_branch(
    project_utxo: ProjectUTXO,
    branch_id: str,
    *,
    target_branch: str,
    decision: MergeDecision,
    operator: str,
) -> ProjectUTXO:
    branch_key = str(branch_id).strip()
    if branch_key in {"", "main"}:
        raise ProjectUTXOServiceError("main branch cannot be merged into itself")
    target_key = str(target_branch).strip() or "main"
    if not target_key:
        raise ProjectUTXOServiceError("target_branch is required")
    if branch_key == target_key:
        raise ProjectUTXOServiceError("source and target branch cannot be the same")

    branch = project_utxo["branches"].get(branch_key)
    if branch is None:
        raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
    source_status = str(branch.get("status", ""))
    decision_value = str(decision).strip().upper()
    if decision_value == "ACCEPTED" and source_status != "APPROVED":
        raise ProjectUTXOServiceError(f"branch must be APPROVED before merge: {branch_key}")
    if decision_value == "REJECTED" and source_status not in {"UNDER_REVIEW", "APPROVED"}:
        raise ProjectUTXOServiceError(f"branch must be UNDER_REVIEW/APPROVED before reject decision: {branch_key}")
    target = project_utxo["branches"].get(target_key)
    if target is None:
        raise ProjectUTXOServiceError(f"target branch not found: {target_key}")
    if not _is_branch_active_for_fork(str(target.get("status", ""))):
        raise ProjectUTXOServiceError(f"target branch is not active: {target_key}")
    operator_value = str(operator).strip()
    if not operator_value:
        raise ProjectUTXOServiceError("operator is required")
    if decision_value not in {"ACCEPTED", "REJECTED"}:
        raise ProjectUTXOServiceError(f"unsupported merge decision: {decision}")

    next_state = deepcopy(project_utxo)
    now = _utc_now()
    merge_info: BranchMergeInfo = {
        "merged_at": now,
        "merged_by": operator_value,
        "decision": cast(MergeDecision, decision_value),
        "target_branch": target_key,
    }

    if decision_value == "ACCEPTED":
        source_overrides = branch.get("overrides", {})
        if not isinstance(source_overrides, dict):
            source_overrides = {}
        target_overrides = deepcopy(target.get("overrides", {}))
        if not isinstance(target_overrides, dict):
            target_overrides = {}
        applied_overrides: list[Dict[str, Any]] = []
        for target_path, value in source_overrides.items():
            normalized_target = str(target_path)
            old_value = deepcopy(target_overrides.get(normalized_target))
            target_overrides[normalized_target] = deepcopy(value)
            applied_overrides.append(
                {
                    "target": normalized_target,
                    "old_value": old_value,
                    "new_value": deepcopy(value),
                }
            )
        next_state["branches"][target_key]["overrides"] = target_overrides
        merge_info["applied_overrides"] = applied_overrides
        applied_utxos: list[Dict[str, Any]] = []
        source_outputs = _branch_outputs(next_state, branch_key, include_consumed=False)
        for source_output in source_outputs:
            source_parsed = parse_v_address(source_output["v_address"])
            target_input_v_address = build_v_address(
                {
                    "projectId": source_parsed["projectId"],
                    "stake": source_parsed["stake"],
                    "layer": source_parsed.get("layer"),
                    "branch": target_key,
                }
            )
            target_candidates = resolve_v_address(next_state, target_input_v_address)
            selected_target = _select_best_resolved_output(target_candidates)
            if selected_target is not None:
                next_state = consume_output(
                    next_state,
                    selected_target["utxo_id"],
                    spent_by=f"merge:{branch_key}->{target_key}",
                    spent_at=now,
                )

            merged_output = deepcopy(source_output)
            merged_output["utxo_id"] = f"{source_output['utxo_id']}_merge_{target_key}_{_iso_to_unix(now)}"
            merged_output["v_address"] = build_v_address(
                {
                    "projectId": source_parsed["projectId"],
                    "stake": source_parsed["stake"],
                    "version": _output_version(source_output),
                    "layer": source_parsed.get("layer"),
                    "branch": target_key,
                    "timestamp": _output_timestamp(source_output),
                }
            )
            merged_output["created_at"] = now
            merged_output["consumed"] = False
            merged_output["spent_at"] = None
            merged_output["spent_by"] = None
            merged_payload = deepcopy(merged_output.get("payload", {}))
            if not isinstance(merged_payload, dict):
                merged_payload = {}
            merged_payload["branch_id"] = target_key
            merged_payload["merged_from_branch"] = branch_key
            merged_payload["merge_target_branch"] = target_key
            merged_output["payload"] = merged_payload
            next_state = add_output(next_state, merged_output)
            applied_utxos.append(
                {
                    "source_utxo": source_output["utxo_id"],
                    "target_utxo": merged_output["utxo_id"],
                    "source_v_address": source_output["v_address"],
                    "target_v_address": merged_output["v_address"],
                }
            )
        if applied_utxos:
            merge_info["applied_utxos"] = applied_utxos
        next_state["branches"][branch_key]["status"] = "MERGED"
        _append_workflow_event(
            next_state["branches"][branch_key],
            from_status=source_status,
            to_status="MERGED",
            action="MERGE",
            operator=operator_value,
            comment=f"merged to {target_key}",
        )
    else:
        next_state["branches"][branch_key]["status"] = "REJECTED"
        _append_workflow_event(
            next_state["branches"][branch_key],
            from_status=source_status,
            to_status="REJECTED",
            action="REJECT",
            operator=operator_value,
            comment="rejected in merge decision",
        )

    next_state["branches"][branch_key]["merge_info"] = merge_info
    next_state["current_state"] = create_current_state(
        status="MERGED" if decision_value == "ACCEPTED" else "REJECTED",
        branch=target_key if decision_value == "ACCEPTED" else branch_key,
        updated_at=now,
        source="branch_merge",
    )
    if next_state["current_branch"] == branch_key:
        next_state["current_branch"] = target_key if decision_value == "ACCEPTED" else "main"
    return next_state


def abandon_branch(
    project_utxo: ProjectUTXO,
    branch_id: str,
    *,
    operator: str | None = None,
    reason: str | None = None,
) -> ProjectUTXO:
    branch_key = str(branch_id).strip()
    if branch_key in {"", "main"}:
        raise ProjectUTXOServiceError("main branch cannot be abandoned")

    branch = project_utxo["branches"].get(branch_key)
    if branch is None:
        raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
    status = str(branch.get("status", ""))
    if status != "REJECTED":
        raise ProjectUTXOServiceError(f"branch must be REJECTED before abandon: {branch_key}")

    next_state = deepcopy(project_utxo)
    next_state["branches"][branch_key]["status"] = "ABANDONED"
    now = _utc_now()
    next_state["branches"][branch_key]["abandon_info"] = {
        "abandoned_at": now,
        "abandoned_by": (operator or "did:layerpeg:operator").strip() or "did:layerpeg:operator",
        "reason": (reason or "manual_abandon").strip() or "manual_abandon",
        "decision": "ABANDONED",
    }
    _append_workflow_event(
        next_state["branches"][branch_key],
        from_status="REJECTED",
        to_status="ABANDONED",
        action="ABANDON",
        operator=(operator or "did:layerpeg:operator").strip() or "did:layerpeg:operator",
        comment=(reason or "manual_abandon").strip() or "manual_abandon",
    )
    next_state["current_state"] = create_current_state(
        status="ABANDONED",
        branch=branch_key,
        updated_at=now,
        source="branch_abandon",
    )
    if next_state["current_branch"] == branch_key:
        next_state["current_branch"] = "main"
    return next_state


def split_utxo(project_utxo: ProjectUTXO, original_range: str, splits: list[str]) -> ProjectUTXO:
    original = str(original_range).strip()
    if not original:
        raise ProjectUTXOServiceError("original_range is required")
    if not isinstance(splits, list) or len(splits) < 2:
        raise ProjectUTXOServiceError("splits must contain at least 2 ranges")
    split_ranges = [str(item).strip() for item in splits if str(item).strip()]
    if len(split_ranges) < 2:
        raise ProjectUTXOServiceError("splits must contain at least 2 non-empty ranges")

    original_len = _parse_range_length(original)
    split_sum = sum(_parse_range_length(item) for item in split_ranges)
    if abs(original_len - split_sum) > 1e-6:
        raise ProjectUTXOServiceError("split conservation check failed")

    parent_outputs = []
    for output in project_utxo["unspent_outputs"].values():
        try:
            stake = parse_v_address(output["v_address"])["stake"]
        except VAddressError:
            continue
        if stake == original and not output["consumed"]:
            parent_outputs.append(deepcopy(output))
    if not parent_outputs:
        raise ProjectUTXOServiceError(f"no unspent UTXO found for range: {original}")

    next_state = deepcopy(project_utxo)
    for parent in parent_outputs:
        next_state = consume_output(next_state, parent["utxo_id"])
        parsed = parse_v_address(parent["v_address"])
        for index, split_range in enumerate(split_ranges, start=1):
            child = deepcopy(parent)
            child["utxo_id"] = f"{parent['utxo_id']}_split_{index}"
            child["v_address"] = build_v_address(
                {
                    "projectId": parsed["projectId"],
                    "stake": split_range,
                    "version": parsed.get("version"),
                    "layer": parsed.get("layer"),
                    "timestamp": parsed.get("timestamp"),
                }
            )
            child["consumed"] = False
            payload = child.get("payload", {})
            if not isinstance(payload, dict):
                payload = {}
            payload["inherited_from"] = parent["utxo_id"]
            payload["split_index"] = index
            payload["split_total"] = len(split_ranges)
            child["payload"] = payload
            next_state = add_output(next_state, child)

    next_state["split_history"].append(
        {
            "split_id": f"split_{_utc_now().replace(':', '').replace('-', '')}",
            "original_range": original,
            "splits": split_ranges,
            "created_at": _utc_now(),
        }
    )
    return next_state


def resolve_v_address(project_utxo: ProjectUTXO, v_address: str) -> list[UTXOOutput]:
    parsed = parse_v_address(v_address)
    project_id = parsed["projectId"]
    query_stake = parsed["stake"]
    query_version = parsed.get("version")
    query_layer = parsed.get("layer")
    query_timestamp = parsed.get("timestamp")

    current_project_id = normalize_project_id(project_utxo["id"])
    if project_id != current_project_id:
        return []
    branch_resolution = resolve_project_v_address(project_utxo, v_address)
    branch_filter: str | None = None
    raw_branch_id = str(branch_resolution.get("branch_id") or "").strip()
    if raw_branch_id:
        branch_filter = str(branch_resolution.get("resolved_branch") or "").strip() or None
    if isinstance(query_version, str) and query_version.strip().lower() in {"current", "latest"}:
        query_version = None

    candidates: list[UTXOOutput] = []
    for output in project_utxo["unspent_outputs"].values():
        try:
            output_addr = parse_v_address(output["v_address"])
        except VAddressError:
            continue
        if output_addr["stake"] != query_stake:
            continue
        if query_layer is not None and output_addr.get("layer") != query_layer:
            continue
        if branch_filter and _resolve_output_branch(output) != branch_filter:
            continue
        candidates.append(deepcopy(output))

    if query_version:
        candidates = [
            item
            for item in candidates
            if _output_version(item) == query_version or _output_proof_hash(item) == query_version
        ]

    if query_timestamp is not None:
        candidates = [item for item in candidates if _output_timestamp(item) <= query_timestamp]
        if not candidates:
            return []
        latest = max(_output_timestamp(item) for item in candidates)
        return [item for item in candidates if _output_timestamp(item) == latest]

    if query_version is None:
        candidates = [item for item in candidates if not item["consumed"]]
    return candidates


class ProjectUTXOService:
    """In-memory ProjectUTXO registry and v:// branch resolver."""

    def __init__(
        self,
        proof_chain_store: ProofChainStore | None = None,
        *,
        store_path: Path | None = None,
        persist_enabled: bool | None = None,
    ) -> None:
        self._projects: Dict[str, ProjectUTXO] = {}
        self._proof_records: Dict[str, Dict[str, Any]] = {}
        self._proof_chain_store = proof_chain_store or ProofChainStore()
        self._store_path = store_path or (Path(__file__).resolve().parents[2] / "data" / "project_utxo_store.json")
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if persist_enabled is None:
            self._persist_enabled = _default_persist_enabled()
        else:
            self._persist_enabled = bool(persist_enabled)
        schema_path = Path(__file__).resolve().parents[1] / "schemas" / "branch-decision-proof.schema.json"
        with schema_path.open("r", encoding="utf-8-sig") as f:
            self._branch_decision_schema = json.load(f)
        self._load_store()

    def clear(self) -> None:
        self._projects = {}
        self._proof_records = {}
        if self._persist_enabled and self._store_path.exists():
            self._store_path.unlink()

    def get_project_utxo(self, project_id: str) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        current = self._projects.get(key)
        if current is None:
            current = create_project_utxo(key)
            self._projects[key] = current
            self._persist_store()
        return deepcopy(current)

    def get_current_branch(self, project_id: str) -> str:
        project = self.get_project_utxo(project_id)
        return str(project.get("current_branch", "main"))

    def list_active_forks(self, project_id: str) -> list[str]:
        project = self.get_project_utxo(project_id)
        active: list[str] = []
        for branch_id, branch in project["branches"].items():
            if branch_id == "main":
                continue
            if _is_branch_active_for_execution(str(branch.get("status", ""))):
                active.append(branch_id)
        return active

    def get_branch_overview(self, project_id: str) -> Dict[str, Any]:
        project = self.get_project_utxo(project_id)
        return {
            "project_id": normalize_project_id(project_id),
            "current_branch": project["current_branch"],
            "active_forks": self.list_active_forks(project_id),
            "branches": deepcopy(project["branches"]),
        }

    def get_branch_history(self, project_id: str) -> Dict[str, Any]:
        project = self.get_project_utxo(project_id)
        history: Dict[str, Any] = {
            "project_id": normalize_project_id(project_id),
            "current_branch": project["current_branch"],
            "main": [],
        }
        main_merges: list[Dict[str, Any]] = []
        for branch_id, branch in project["branches"].items():
            if branch_id == "main":
                continue
            merge_info = branch.get("merge_info")
            abandon_info = branch.get("abandon_info")
            entry = {
                "status": branch.get("status", "FORK_CREATED"),
                "parent_branch": branch.get("parent_branch"),
                "reason": branch.get("reason"),
                "created_by": branch.get("created_by"),
                "approvals": deepcopy(branch.get("approvals", [])) if isinstance(branch.get("approvals"), list) else [],
                "workflow_history": deepcopy(branch.get("workflow_history", []))
                if isinstance(branch.get("workflow_history"), list)
                else [],
                "merge_info": deepcopy(merge_info) if isinstance(merge_info, dict) else None,
                "abandon_info": deepcopy(abandon_info) if isinstance(abandon_info, dict) else None,
            }
            history[branch_id] = entry
            if (
                isinstance(merge_info, dict)
                and merge_info.get("decision") == "ACCEPTED"
                and str(merge_info.get("target_branch", "")).strip() == "main"
            ):
                main_merges.append(
                    {
                        "branch_id": branch_id,
                        "reason": branch.get("reason"),
                        "merge_info": deepcopy(merge_info),
                    }
                )

        main_merges.sort(key=lambda item: str(item.get("merge_info", {}).get("merged_at", "")))
        history["main"] = main_merges
        return history

    def build_full_proof(self, execution_id: str) -> Dict[str, Any]:
        target_id = str(execution_id).strip()
        if not target_id:
            raise ProjectUTXOServiceError("execution_id is required")
        cached = self._proof_records.get(target_id)
        if isinstance(cached, dict):
            return deepcopy(cached)

        for project in self._projects.values():
            outputs = project.get("unspent_outputs", {})
            for item in outputs.values():
                payload = item.get("payload", {})
                if not isinstance(payload, dict):
                    continue
                if str(payload.get("execution_id", "")).strip() != target_id:
                    continue
                full = payload.get("full_proof")
                if isinstance(full, dict):
                    self._proof_records[target_id] = deepcopy(full)
                    return deepcopy(full)
        raise ProjectUTXOServiceError(f"proof not found for execution_id: {target_id}")

    def get_verifiable_proof(self, execution_id: str) -> Dict[str, Any]:
        proof = self.build_full_proof(execution_id)
        merkle_root, proof_path = _select_merkle_material(proof)
        signatures = proof.get("signatures", [])
        if not isinstance(signatures, list):
            signatures = []
        return {
            "proof": deepcopy(proof),
            "merkle_root": merkle_root,
            "proof_path": deepcopy(proof_path),
            "chain_hash": str(proof.get("chain_hash", "")),
            "previous_chain_hash": str(proof.get("previous_chain_hash", "")),
            "signatures": deepcopy(signatures),
        }

    def verify_proof(
        self,
        *,
        proof: Mapping[str, Any],
        expected_root: str | None = None,
        expected_chain_hash: str | None = None,
    ) -> Dict[str, Any]:
        if not isinstance(proof, Mapping):
            raise ProjectUTXOServiceError("proof must be object")

        proof_payload = dict(proof)
        proof_hash = str(proof_payload.get("proof_hash", "")).strip()
        execution_id = str(proof_payload.get("execution_id", "")).strip()
        previous_chain_hash = str(proof_payload.get("previous_chain_hash", "")).strip()

        checks = {
            "payload_hash": False,
            "merkle_path": False,
            "chain_hash": False,
            "signatures": False,
        }
        reasons: list[str] = []

        computed_payload_hash = _compute_proof_payload_hash(proof_payload)
        expected_payload_hash = str(proof_payload.get("payload_hash") or proof_hash).strip()
        if computed_payload_hash and expected_payload_hash and computed_payload_hash == expected_payload_hash:
            checks["payload_hash"] = True
        else:
            reasons.append("payload_hash mismatch")

        merkle_root_from_proof, proof_path = _select_merkle_material(proof_payload)
        expected_root_value = str(expected_root or merkle_root_from_proof).strip()
        if proof_hash and expected_root_value:
            reconstructed_root = _reconstruct_merkle_root(leaf_hash=proof_hash, proof_path=proof_path)
            checks["merkle_path"] = reconstructed_root == expected_root_value
        if not checks["merkle_path"]:
            reasons.append("merkle_path cannot restore expected merkle_root")

        expected_chain = str(expected_chain_hash or proof_payload.get("chain_hash", "")).strip()
        derived_chain = ""
        if proof_hash and execution_id:
            derived_chain = hashlib.sha256(f"{previous_chain_hash}|{execution_id}|{proof_hash}".encode("utf-8")).hexdigest()
        if derived_chain and expected_chain and derived_chain == expected_chain:
            checks["chain_hash"] = True
        if not checks["chain_hash"]:
            reasons.append("chain_hash mismatch")

        signatures_raw = proof_payload.get("signatures", [])
        signature_entries = signatures_raw if isinstance(signatures_raw, list) else []
        checks["signatures"] = _verify_signature_entries(proof_payload, signature_entries)
        if not checks["signatures"]:
            reasons.append("signature verification failed")

        return {
            "valid": all(checks.values()),
            "checks": checks,
            "reason": "; ".join(reasons),
        }

    def set_current_branch(self, project_id: str, branch_id: str) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        branch_key = str(branch_id).strip()
        branch = project["branches"].get(branch_key)
        if branch is None:
            raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
        if not _is_branch_active_for_execution(str(branch.get("status", ""))):
            raise ProjectUTXOServiceError(f"branch is not executable: {branch_key}")

        next_state = deepcopy(project)
        next_state["current_branch"] = branch_key
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def fork_branch(
        self, project_id: str, from_branch: str, new_branch_id: str, reason: str, *, created_by: str | None = None
    ) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        next_state = fork_branch(
            project,
            from_branch=from_branch,
            new_branch_id=new_branch_id,
            reason=reason,
            created_by=created_by,
        )
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def apply_override(self, project_id: str, branch_id: str, target_path: str, value: Any) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        branch_key = str(branch_id).strip()
        current = project["branches"].get(branch_key)
        if current is None:
            raise ProjectUTXOServiceError(f"branch not found: {branch_key}")
        if not _is_branch_active_for_execution(str(current.get("status", ""))):
            raise ProjectUTXOServiceError(f"branch is not executable for override: {branch_key}")

        next_state = deepcopy(project)
        next_state["branches"][branch_key] = apply_override(current, target_path=target_path, value=value)
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def submit_review(
        self,
        *,
        project_id: str,
        branch_id: str,
        actor_did: str,
        comment: str | None = None,
    ) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        actor = str(actor_did).strip()
        if not actor:
            raise ProjectUTXOServiceError("actor_did is required")
        next_state = submit_branch_review(project, branch_id=branch_id, operator=actor, comment=comment)
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def approve_branch(
        self,
        *,
        project_id: str,
        branch_id: str,
        actor_did: str,
        role: str,
        comment: str | None = None,
    ) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        did = str(actor_did).strip()
        role_value = str(role).strip() or "reviewer"
        if not did:
            raise ProjectUTXOServiceError("actor_did is required")
        next_state = approve_branch_review(
            project,
            branch_id=branch_id,
            did=did,
            role=role_value,
            comment=comment,
        )
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def reject_branch(
        self,
        *,
        project_id: str,
        branch_id: str,
        actor_did: str,
        role: str,
        comment: str | None = None,
    ) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        did = str(actor_did).strip()
        role_value = str(role).strip() or "reviewer"
        if not did:
            raise ProjectUTXOServiceError("actor_did is required")
        next_state = reject_branch_review(
            project,
            branch_id=branch_id,
            did=did,
            role=role_value,
            comment=comment,
        )
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def merge_branch(
        self,
        project_id: str,
        branch_id: str,
        *,
        target_branch: str,
        decision: MergeDecision,
        operator: str,
    ) -> tuple[ProjectUTXO, BranchDecisionProof]:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        source_branch = str(branch_id).strip()
        source_data = project["branches"].get(source_branch)
        if source_data is None:
            raise ProjectUTXOServiceError(f"branch not found: {source_branch}")

        next_state = merge_branch(
            project,
            branch_id=branch_id,
            target_branch=target_branch,
            decision=decision,
            operator=operator,
        )

        now_iso = _utc_now()
        proof_payload: BranchDecisionProof = {
            "action": "MERGE",
            "project_id": key,
            "branch_id": source_branch,
            "parent_branch": cast(str | None, source_data.get("parent_branch")),
            "source_branch": source_branch,
            "target_branch": str(target_branch).strip() or "main",
            "fork_point": cast(str | None, source_data.get("created_at")),
            "fork_reason": cast(str | None, source_data.get("reason")),
            "decision": str(decision).strip().upper(),
            "timestamp": _iso_to_unix(now_iso),
            "actor_did": str(operator).strip(),
            "component_id": "__branch_decision__",
            "execution_id": "",
            "main_chain_hash": "",
            "fork_chain_hash": "",
            "merkle_root": "",
            "proof_path": [],
            "signatures": [],
            "workflow_history": deepcopy(source_data.get("workflow_history", []))
            if isinstance(source_data.get("workflow_history"), list)
            else [],
        }
        decision_proof = self._append_branch_decision_proof(proof_payload)
        branch_merge_info = next_state["branches"].get(source_branch, {}).get("merge_info")
        if isinstance(branch_merge_info, dict):
            branch_merge_info["decision_proof_hash"] = decision_proof["proof_hash"]
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state), decision_proof

    def abandon_branch(self, project_id: str, branch_id: str) -> ProjectUTXO:
        state, _ = self.abandon_branch_with_decision(project_id=project_id, branch_id=branch_id)
        return state

    def abandon_branch_with_decision(
        self,
        *,
        project_id: str,
        branch_id: str,
        operator: str | None = None,
        reason: str | None = None,
    ) -> tuple[ProjectUTXO, BranchDecisionProof]:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        source_branch = str(branch_id).strip()
        source_data = project["branches"].get(source_branch)
        if source_data is None:
            raise ProjectUTXOServiceError(f"branch not found: {source_branch}")

        next_state = abandon_branch(project, branch_id=branch_id, operator=operator, reason=reason)

        now_iso = _utc_now()
        actor_did = (operator or "did:layerpeg:operator").strip() or "did:layerpeg:operator"
        proof_payload: BranchDecisionProof = {
            "action": "ABANDON",
            "project_id": key,
            "branch_id": source_branch,
            "parent_branch": cast(str | None, source_data.get("parent_branch")),
            "source_branch": source_branch,
            "target_branch": cast(str | None, source_data.get("parent_branch")),
            "fork_point": cast(str | None, source_data.get("created_at")),
            "fork_reason": cast(str | None, source_data.get("reason")),
            "decision": "ABANDONED",
            "timestamp": _iso_to_unix(now_iso),
            "actor_did": actor_did,
            "component_id": "__branch_decision__",
            "execution_id": "",
            "main_chain_hash": "",
            "fork_chain_hash": "",
            "merkle_root": "",
            "proof_path": [],
            "signatures": [],
            "workflow_history": deepcopy(source_data.get("workflow_history", []))
            if isinstance(source_data.get("workflow_history"), list)
            else [],
        }
        decision_proof = self._append_branch_decision_proof(proof_payload)
        branch_abandon_info = next_state["branches"].get(source_branch, {}).get("abandon_info")
        if isinstance(branch_abandon_info, dict):
            branch_abandon_info["decision_proof_hash"] = decision_proof["proof_hash"]
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state), decision_proof

    def split_utxo(self, project_id: str, original_range: str, splits: list[str]) -> ProjectUTXO:
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        next_state = split_utxo(project, original_range=original_range, splits=splits)
        self._projects[key] = next_state
        self._persist_store()
        return deepcopy(next_state)

    def execute_component_in_branch(
        self,
        *,
        component_id: str,
        input_payload: Dict[str, Any],
        branch_id: str,
        execution_engine: ComponentExecutionEngine,
    ) -> Dict[str, Any]:
        project_id = _resolve_project_id_from_input(input_payload)
        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        requested_branch = str(branch_id).strip() or project["current_branch"]
        actual_branch = resolve_branch_reference(
            requested_branch,
            branches=project.get("branches", {}),
            current_branch=str(project.get("current_branch", "main")),
        )
        branch = project["branches"].get(actual_branch)
        if branch is None:
            raise ProjectUTXOServiceError(f"branch not found: {actual_branch}")
        if not _is_branch_active_for_execution(str(branch.get("status", ""))):
            raise ProjectUTXOServiceError(f"branch is not executable: {actual_branch}")

        overrides = _resolve_branch_overrides(project, actual_branch)
        merged_input = deepcopy(input_payload)
        merged_input["project_id"] = project_id
        merged_input["__branch_id"] = actual_branch
        merged_input["__effective_overrides"] = deepcopy(overrides)
        merged_input["__parent_branch"] = branch.get("parent_branch")
        merged_input["__fork_point"] = branch.get("created_at")
        merged_input["__fork_reason"] = branch.get("reason")
        merged_input["__branch_history"] = _build_branch_history_payload(project, actual_branch)
        latest_merge = _latest_accepted_merge_for_target(project, target_branch=actual_branch)
        if latest_merge is not None:
            merged_input["__merge_decision"] = latest_merge.get("decision")
            merged_input["__merged_by"] = latest_merge.get("merged_by")
            merged_input["__merged_at"] = latest_merge.get("merged_at")

        runtime_overrides = _branch_overrides_to_runtime_overrides(
            overrides=overrides,
            component_id=component_id,
            project_id=project_id,
            inspected_at=merged_input.get("inspected_at"),
            branch_id=actual_branch,
        )
        if runtime_overrides:
            existing = merged_input.get("overrides", [])
            if existing and not isinstance(existing, list):
                raise ProjectUTXOServiceError("input.overrides must be array when provided")
            merged_input["overrides"] = list(existing or []) + runtime_overrides

        resolved_context = _build_resolved_context(
            execution_engine=execution_engine,
            component_id=component_id,
            merged_input=merged_input,
            project_id=project_id,
            branch_id=actual_branch,
            effective_overrides=overrides,
        )

        self._projects[key] = project
        result = execution_engine.execute(component_id=component_id, input_payload=merged_input)
        result["branch_id"] = actual_branch
        result["effective_overrides"] = deepcopy(overrides)
        result["resolved_context"] = deepcopy(resolved_context)
        facts = result.get("explanation_seed", {}).get("facts")
        if isinstance(facts, dict):
            facts["branch_id"] = actual_branch
            facts["branch_overrides"] = deepcopy(overrides)
            facts["resolved_context"] = deepcopy(resolved_context)
        return result

    def record_execution(self, execution_result: Dict[str, Any], branch_id: str | None = None) -> UTXOOutput:
        if not isinstance(execution_result, dict):
            raise ProjectUTXOServiceError("execution_result must be object")

        project_id = _as_non_empty_text(execution_result.get("project_id"), "project_id")
        execution_id = _as_non_empty_text(execution_result.get("execution_id"), "execution_id")
        component_id = _as_non_empty_text(execution_result.get("component_id"), "component_id")
        v_address = _as_non_empty_text(execution_result.get("v_address"), "v_address")
        final_status = _as_non_empty_text(execution_result.get("final_status"), "final_status")
        lifecycle_status = _as_non_empty_text(execution_result.get("lifecycle_status"), "lifecycle_status")
        created_at = _resolve_created_at(execution_result)
        proof_hash = str(execution_result.get("proof", {}).get("proof_hash", "")).strip()
        resolved_branch_id = branch_id or _resolve_branch_id(execution_result)

        key = normalize_project_id(project_id)
        project = self._projects.get(key) or create_project_utxo(project_id)
        if resolved_branch_id not in project["branches"]:
            project = fork_branch(project, from_branch="main", new_branch_id=resolved_branch_id, reason="auto-created")
        utxo_id = f"utxo_{execution_id}"
        existing = _find_output_by_execution_id(project, execution_id)
        if existing is not None:
            return deepcopy(existing)

        input_v_address = _resolve_input_v_address(execution_result, branch_id=resolved_branch_id)
        working, input_output = _ensure_transition_input(project, input_v_address=input_v_address, branch_id=resolved_branch_id)

        output: UTXOOutput = {
            "utxo_id": utxo_id,
            "v_address": v_address,
            "type": "ComponentExecution",
            "state": _to_utxo_state(lifecycle_status),
            "payload": {
                "execution_id": execution_id,
                "component_id": component_id,
                "result": final_status,
                "version": proof_hash or str(execution_result.get("version", "")).strip(),
                "proof_hash": proof_hash or None,
                "full_proof": deepcopy(execution_result.get("proof", {})),
                "lifecycle_status": lifecycle_status,
                "branch_id": resolved_branch_id,
                "input_v_address": input_v_address,
            },
            "created_at": created_at,
            "consumed": False,
            "spent_at": None,
            "spent_by": None,
        }

        transition = _build_state_transition(
            input_output=input_output,
            output=output,
            execution_id=execution_id,
            proof_hash=proof_hash or None,
            branch_id=resolved_branch_id,
            created_at=created_at,
        )
        output["payload"]["state_transition"] = deepcopy(transition)
        output["payload"]["input_utxo"] = transition["input_utxo"]
        output["payload"]["output_utxo"] = transition["output_utxo"]
        output["payload"]["output_v_address"] = transition["output_v_address"]

        if input_output["utxo_id"] != utxo_id and not input_output["consumed"]:
            working = consume_output(
                working,
                input_output["utxo_id"],
                spent_by=utxo_id,
                spent_at=created_at,
            )

        next_state = add_output(working, output)
        self._projects[key] = next_state

        execution_result["input_v_address"] = input_v_address
        execution_result["input_utxo"] = transition["input_utxo"]
        execution_result["output_utxo"] = transition["output_utxo"]
        execution_result["state_transition"] = deepcopy(transition)

        proof_payload = execution_result.get("proof")
        if isinstance(proof_payload, dict):
            proof_payload["input_utxo"] = transition["input_utxo"]
            proof_payload["output_utxo"] = transition["output_utxo"]
            proof_payload["v_address"] = v_address
            proof_payload["branch"] = resolved_branch_id
            proof_payload["branch_id"] = resolved_branch_id
            self._proof_records[execution_id] = deepcopy(proof_payload)
        self._persist_store()
        return deepcopy(output)

    def resolve(self, v_address: str) -> list[UTXOOutput]:
        parsed = parse_v_address(v_address)
        key = normalize_project_id(parsed["projectId"])
        project = self._projects.get(key)
        if project is None:
            return []
        return resolve_v_address(project, v_address)

    def resolve_protocol_v_address(self, v_address: str) -> Dict[str, Any]:
        parsed = parse_v_address(v_address)
        project_id = normalize_project_id(parsed["projectId"])
        project = self.get_project_utxo(project_id)
        resolution = resolve_project_v_address(project, v_address)
        candidates = resolve_v_address(project, v_address)
        selected = _select_best_resolved_output(candidates)

        resolved_execution_id: str | None = None
        resolved_status: str | None = None
        proof_hash: str | None = None
        selected_utxo_id: str | None = None
        selected_created_at: str | None = None
        selected_timestamp: int | None = None
        if selected is not None:
            payload = selected.get("payload", {})
            if isinstance(payload, Mapping):
                execution_value = payload.get("execution_id")
                if isinstance(execution_value, str) and execution_value.strip():
                    resolved_execution_id = execution_value.strip()
                status_value = payload.get("result")
                if isinstance(status_value, str) and status_value.strip():
                    resolved_status = status_value.strip()
                proof_value = payload.get("proof_hash")
                if isinstance(proof_value, str) and proof_value.strip():
                    proof_hash = proof_value.strip()
            if resolved_status is None:
                state_value = selected.get("state")
                if isinstance(state_value, str) and state_value.strip():
                    resolved_status = state_value.strip()
            selected_utxo_id = str(selected.get("utxo_id", "")).strip() or None
            selected_created_at = str(selected.get("created_at", "")).strip() or None
            selected_timestamp = _output_timestamp(selected)

        context = dict(resolution.get("context", {}))
        context["candidate_count"] = len(candidates)
        context["selected_utxo_id"] = selected_utxo_id
        context["selected_created_at"] = selected_created_at
        context["selected_timestamp"] = selected_timestamp

        response = {
            "input_v_address": v_address,
            "project_id": resolution["project_id"],
            "stake": resolution["stake"],
            "branch": resolution["resolved_branch"],
            "branch_id": resolution["branch_id"],
            "resolved_branch": resolution["resolved_branch"],
            "resolved_execution_id": resolved_execution_id,
            "resolved_status": resolved_status,
            "proof_hash": proof_hash,
            "resolved_output": deepcopy(selected) if selected is not None else None,
            "context": context,
        }
        protocol_payload = resolve_v_protocol(project, v_address, selected)
        response["context"].update(protocol_payload.get("context", {}))
        response["requested_branch"] = protocol_payload.get("requested_branch")
        return response

    def list_project_utxo(self, project_id: str) -> Dict[str, Any]:
        project = self.get_project_utxo(project_id)
        return {
            "project_id": normalize_project_id(project_id),
            "genesis_time": project.get("genesis_time"),
            "current_branch": project.get("current_branch", "main"),
            "current_state": deepcopy(project.get("current_state", {})),
            "branches": deepcopy(project.get("branches", {})),
            "unspent_outputs": deepcopy(project.get("unspent_outputs", {})),
            "split_history": deepcopy(project.get("split_history", [])),
        }

    def execute_utxo_transition(
        self,
        *,
        v_address: str,
        component_id: str,
        input_payload: Dict[str, Any],
        execution_engine: ComponentExecutionEngine,
    ) -> Dict[str, Any]:
        resolution = self.resolve_protocol_v_address(v_address)
        project_id = str(resolution["project_id"])
        branch_id = str(resolution["resolved_branch"])
        execution_input = deepcopy(input_payload)
        execution_input["project_id"] = project_id
        execution_input["stake"] = str(resolution["stake"])
        execution_input["v_address"] = v_address
        execution_input["__v_address_context"] = deepcopy(resolution.get("context", {}))

        result = self.execute_component_in_branch(
            component_id=component_id,
            input_payload=execution_input,
            branch_id=branch_id,
            execution_engine=execution_engine,
        )
        self.record_execution(result, branch_id=branch_id)
        result["v_address_resolution"] = resolution
        return result

    def _append_branch_decision_proof(self, payload: BranchDecisionProof) -> BranchDecisionProof:
        canonical_payload = {
            "action": payload["action"],
            "project_id": payload["project_id"],
            "source_branch": payload["source_branch"],
            "target_branch": payload.get("target_branch"),
            "fork_point": payload.get("fork_point"),
            "decision": payload["decision"],
            "timestamp": _unix_to_iso(payload["timestamp"]),
            "actor_did": payload["actor_did"],
        }
        try:
            jsonschema.validate(instance=canonical_payload, schema=self._branch_decision_schema)
        except jsonschema.ValidationError as exc:
            raise ProjectUTXOServiceError(f"branch decision proof validation failed: {exc.message}") from exc

        raw = json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        proof_hash = hashlib.sha256(raw).hexdigest()
        compact_ts = str(payload["timestamp"])
        execution_id = (
            f"branch_decision_{payload['action'].lower()}_{payload['project_id']}_{payload['source_branch']}_{compact_ts}"
        )
        try:
            chain_entry = self._proof_chain_store.append(execution_id=execution_id, proof_hash=proof_hash)
        except ProofChainStoreError as exc:
            raise ProjectUTXOServiceError(f"branch decision proof chain append failed: {exc}") from exc

        actor_did = str(payload.get("actor_did", "")).strip()
        signatures = []
        if actor_did:
            signatures.append(
                {
                    "did": actor_did,
                    "role": "operator",
                    "signature": hashlib.sha256(f"{actor_did}:{proof_hash}".encode("utf-8")).hexdigest(),
                }
            )

        chain_hash = str(chain_entry.get("chain_hash", ""))
        previous_chain_hash = str(chain_entry.get("previous_chain_hash", ""))
        target_branch = str(payload.get("target_branch") or "main").strip() or "main"
        proof: BranchDecisionProof = {
            **payload,
            "execution_id": execution_id,
            "proof_id": proof_hash,
            "proof_hash": proof_hash,
            "hash_method": "sha256",
            "ledger_index": int(chain_entry.get("ledger_index", 0)),
            "previous_chain_hash": previous_chain_hash,
            "chain_hash": chain_hash,
            "merkle_root": str(chain_entry.get("merkle_root", "")),
            "proof_path": cast(list[Dict[str, str]], chain_entry.get("proof_path", [])),
            "merkle_leaf_index": int(chain_entry.get("merkle_leaf_index", 0)),
            "merkle_tree_size": int(chain_entry.get("merkle_tree_size", 0)),
            "main_chain_hash": chain_hash if target_branch == "main" else (previous_chain_hash or chain_hash),
            "fork_chain_hash": chain_hash,
            "signatures": signatures,
        }
        self._proof_records[execution_id] = deepcopy(proof)
        self._persist_store()
        return proof

    def _load_store(self) -> None:
        if not self._persist_enabled:
            return
        if not self._store_path.exists():
            return
        try:
            with self._store_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            raise ProjectUTXOServiceError(f"failed to load ProjectUTXO store: {exc}") from exc
        if not isinstance(payload, dict):
            raise ProjectUTXOServiceError("invalid ProjectUTXO store format")

        raw_projects = payload.get("projects", {})
        if isinstance(raw_projects, dict):
            loaded_projects: Dict[str, ProjectUTXO] = {}
            for key, item in raw_projects.items():
                if isinstance(key, str) and isinstance(item, dict):
                    normalized = deepcopy(cast(ProjectUTXO, item))
                    genesis_time = str(normalized.get("genesis_time") or normalized.get("genesis") or _utc_now())
                    normalized["project_id"] = str(normalized.get("project_id") or key)
                    normalized["genesis_time"] = genesis_time
                    if "genesis" in normalized:
                        normalized.pop("genesis", None)
                    current_state = normalized.get("current_state")
                    if not isinstance(current_state, dict):
                        normalized["current_state"] = create_current_state(
                            status=str(current_state or "DRAFT"),
                            branch=str(normalized.get("current_branch", "main")),
                            updated_at=genesis_time,
                            source="store_migration",
                        )
                    loaded_projects[key] = normalized
            self._projects = loaded_projects

        raw_proofs = payload.get("proof_records", {})
        if isinstance(raw_proofs, dict):
            loaded_proofs: Dict[str, Dict[str, Any]] = {}
            for key, item in raw_proofs.items():
                if isinstance(key, str) and isinstance(item, dict):
                    loaded_proofs[key] = deepcopy(item)
            self._proof_records = loaded_proofs

    def _persist_store(self) -> None:
        if not self._persist_enabled:
            return
        payload = {
            "projects": self._projects,
            "proof_records": self._proof_records,
        }
        try:
            with self._store_path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        except OSError as exc:
            raise ProjectUTXOServiceError(f"failed to persist ProjectUTXO store: {exc}") from exc


def build_full_proof(service: ProjectUTXOService, execution_id: str) -> Dict[str, Any]:
    return service.build_full_proof(execution_id)


def _is_branch_active_for_fork(status: str) -> bool:
    normalized = str(status).strip().upper()
    if normalized == "MAIN":
        return True
    return normalized in _FORK_WORKFLOW_ACTIVE_STATUSES


def _is_branch_active_for_execution(status: str) -> bool:
    normalized = str(status).strip().upper()
    return normalized in _FORK_WORKFLOW_ACTIVE_STATUSES


def _append_approval(
    branch: Branch,
    *,
    did: str,
    role: str,
    decision: ApprovalDecision,
    comment: str,
) -> None:
    approvals = branch.get("approvals")
    if not isinstance(approvals, list):
        approvals = []
        branch["approvals"] = approvals
    approvals.append(
        {
            "did": str(did).strip(),
            "role": str(role).strip() or "reviewer",
            "decision": decision,
            "comment": str(comment or "").strip(),
            "timestamp": _iso_to_unix(_utc_now()),
        }
    )


def _append_workflow_event(
    branch: Branch,
    *,
    from_status: str | None,
    to_status: str,
    action: str,
    operator: str,
    comment: str | None = None,
) -> None:
    events = branch.get("workflow_history")
    if not isinstance(events, list):
        events = []
        branch["workflow_history"] = events
    now = _utc_now()
    events.append(
        {
            "from_status": from_status,
            "to_status": to_status,
            "action": action,
            "timestamp": _iso_to_unix(now),
            "operator": str(operator).strip(),
            "comment": str(comment or "").strip(),
        }
    )


def _verify_signature_entries(proof_payload: Mapping[str, Any], signature_entries: list[Any]) -> bool:
    if not signature_entries:
        return True

    proof_hash = str(proof_payload.get("proof_hash", "")).strip()
    if not proof_hash:
        return False

    proof_signature = proof_payload.get("signature")
    proof_signature_text = str(proof_signature).strip() if isinstance(proof_signature, str) else ""

    for item in signature_entries:
        if not isinstance(item, Mapping):
            return False
        did = str(item.get("did", "")).strip()
        signature = str(item.get("signature", "")).strip()
        if not signature:
            return False

        if proof_signature_text:
            if signature != proof_signature_text:
                return False
            continue

        if not did:
            return False
        expected = hashlib.sha256(f"{did}:{proof_hash}".encode("utf-8")).hexdigest()
        if signature != expected:
            return False
    return True


def _default_persist_enabled() -> bool:
    raw = str(os.getenv("LAYERPEG_UTXO_PERSIST", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" not in sys.modules


def _select_merkle_material(proof: Mapping[str, Any]) -> tuple[str, list[Dict[str, str]]]:
    if "chain_merkle_root" in proof or "chain_proof_path" in proof:
        root = str(proof.get("chain_merkle_root", "")).strip()
        path = proof.get("chain_proof_path", [])
    else:
        root = str(proof.get("merkle_root", "")).strip()
        path = proof.get("proof_path", [])

    if not isinstance(path, list):
        return root, []
    normalized: list[Dict[str, str]] = []
    for item in path:
        if not isinstance(item, Mapping):
            continue
        sibling_hash = str(item.get("sibling_hash", "")).strip()
        direction = str(item.get("direction", "")).strip().lower()
        if not sibling_hash or direction not in {"left", "right"}:
            continue
        normalized.append({"sibling_hash": sibling_hash, "direction": direction})
    return root, normalized


def _reconstruct_merkle_root(*, leaf_hash: str, proof_path: list[Dict[str, str]]) -> str:
    cursor = str(leaf_hash).strip()
    if not cursor:
        return ""
    for step in proof_path:
        sibling = str(step.get("sibling_hash", "")).strip()
        direction = str(step.get("direction", "")).strip().lower()
        if not sibling or direction not in {"left", "right"}:
            return ""
        cursor = hash_data(f"{sibling}:{cursor}") if direction == "left" else hash_data(f"{cursor}:{sibling}")
    return cursor


def _compute_proof_payload_hash(proof: Mapping[str, Any]) -> str | None:
    canonical_payload = proof.get("canonical_payload")
    if isinstance(canonical_payload, Mapping):
        raw = json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()

    action = str(proof.get("action", "")).strip().upper()
    if action in {"MERGE", "ABANDON"}:
        canonical_payload = _build_branch_decision_canonical_payload(proof)
        if canonical_payload is None:
            return None
        raw = json.dumps(canonical_payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
    return None


def _build_branch_decision_canonical_payload(proof: Mapping[str, Any]) -> Dict[str, Any] | None:
    action = str(proof.get("action", "")).strip().upper()
    project_id = str(proof.get("project_id", "")).strip()
    source_branch = str(proof.get("source_branch", "")).strip()
    decision = str(proof.get("decision", "")).strip()
    actor_did = str(proof.get("actor_did", "")).strip()
    target_branch_raw = proof.get("target_branch")
    fork_point_raw = proof.get("fork_point")
    timestamp_raw = proof.get("timestamp")

    if not (action and project_id and source_branch and decision and actor_did):
        return None
    if isinstance(timestamp_raw, (int, float)):
        timestamp_iso = _unix_to_iso(int(timestamp_raw))
    elif isinstance(timestamp_raw, str) and timestamp_raw.strip().isdigit():
        timestamp_iso = _unix_to_iso(int(timestamp_raw.strip()))
    else:
        timestamp_iso = _unix_to_iso(_iso_to_unix(str(timestamp_raw)))
    target_branch = None if target_branch_raw is None else str(target_branch_raw)
    fork_point = None if fork_point_raw is None else str(fork_point_raw)
    return {
        "action": action,
        "project_id": project_id,
        "source_branch": source_branch,
        "target_branch": target_branch,
        "fork_point": fork_point,
        "decision": decision,
        "timestamp": timestamp_iso,
        "actor_did": actor_did,
    }


def _resolve_branch_overrides(project_utxo: ProjectUTXO, branch_id: str) -> Dict[str, Any]:
    branches = project_utxo.get("branches", {})
    if branch_id not in branches:
        raise ProjectUTXOServiceError(f"branch not found: {branch_id}")

    chain: list[Branch] = []
    cursor = branch_id
    visited: set[str] = set()
    while cursor:
        if cursor in visited:
            raise ProjectUTXOServiceError("branch parent cycle detected")
        visited.add(cursor)
        branch = branches.get(cursor)
        if branch is None:
            raise ProjectUTXOServiceError(f"branch not found: {cursor}")
        chain.append(branch)
        parent = branch.get("parent_branch")
        if not isinstance(parent, str) or not parent.strip():
            break
        cursor = parent.strip()

    merged: Dict[str, Any] = {}
    for item in reversed(chain):
        overrides = item.get("overrides", {})
        if not isinstance(overrides, dict):
            continue
        for target, value in overrides.items():
            merged[str(target)] = deepcopy(value)
    return merged


def _latest_accepted_merge_for_target(project_utxo: ProjectUTXO, *, target_branch: str) -> BranchMergeInfo | None:
    target_key = str(target_branch).strip()
    if not target_key:
        return None
    latest: BranchMergeInfo | None = None
    latest_at = ""
    for branch_id, branch in project_utxo.get("branches", {}).items():
        if branch_id == target_key:
            continue
        merge_info = branch.get("merge_info")
        if not isinstance(merge_info, dict):
            continue
        if str(merge_info.get("decision", "")).upper() != "ACCEPTED":
            continue
        if str(merge_info.get("target_branch", "")).strip() != target_key:
            continue
        merged_at = str(merge_info.get("merged_at", ""))
        if merged_at >= latest_at:
            latest_at = merged_at
            latest = cast(BranchMergeInfo, deepcopy(merge_info))
    return latest


def _build_branch_history_payload(project_utxo: ProjectUTXO, branch_id: str) -> Dict[str, Any]:
    branches = project_utxo.get("branches", {})
    target = branches.get(branch_id)
    if target is None:
        return {}

    ancestry: list[Dict[str, Any]] = []
    cursor = branch_id
    visited: set[str] = set()
    while cursor:
        if cursor in visited:
            break
        visited.add(cursor)
        branch = branches.get(cursor)
        if branch is None:
            break
        ancestry.append(
            {
                "branch_id": cursor,
                "parent_branch": branch.get("parent_branch"),
                "created_at": branch.get("created_at"),
                "reason": branch.get("reason"),
                "status": branch.get("status"),
            }
        )
        parent = branch.get("parent_branch")
        if not isinstance(parent, str) or not parent.strip():
            break
        cursor = parent.strip()
    ancestry.reverse()

    merge_events: list[Dict[str, Any]] = []
    abandon_events: list[Dict[str, Any]] = []
    for source_branch_id, branch in branches.items():
        merge_info = branch.get("merge_info")
        if isinstance(merge_info, dict) and str(merge_info.get("target_branch", "")).strip() == branch_id:
            merge_events.append(
                {
                    "source_branch": source_branch_id,
                    "decision": merge_info.get("decision"),
                    "merged_at": merge_info.get("merged_at"),
                    "merged_by": merge_info.get("merged_by"),
                    "target_branch": merge_info.get("target_branch"),
                }
            )
        abandon_info = branch.get("abandon_info")
        if isinstance(abandon_info, dict):
            abandon_events.append(
                {
                    "branch_id": source_branch_id,
                    "decision": abandon_info.get("decision"),
                    "abandoned_at": abandon_info.get("abandoned_at"),
                    "abandoned_by": abandon_info.get("abandoned_by"),
                    "reason": abandon_info.get("reason"),
                }
            )
    merge_events.sort(key=lambda item: str(item.get("merged_at", "")))
    abandon_events.sort(key=lambda item: str(item.get("abandoned_at", "")))

    active_forks = [
        item_branch_id
        for item_branch_id, item_branch in branches.items()
        if item_branch_id != "main" and _is_branch_active_for_execution(str(item_branch.get("status", "")))
    ]

    workflow_history = deepcopy(target.get("workflow_history", [])) if isinstance(target.get("workflow_history"), list) else []
    approvals = deepcopy(target.get("approvals", [])) if isinstance(target.get("approvals"), list) else []

    return {
        "current_branch": project_utxo.get("current_branch", "main"),
        "active_forks": active_forks,
        "status": target.get("status"),
        "created_by": target.get("created_by"),
        "workflow_history": workflow_history,
        "approvals": approvals,
        "ancestry": ancestry,
        "merge_events": merge_events,
        "abandon_events": abandon_events,
    }


def _branch_overrides_to_runtime_overrides(
    *,
    overrides: Mapping[str, Any],
    component_id: str,
    project_id: str,
    inspected_at: Any,
    branch_id: str,
) -> list[Dict[str, Any]]:
    effective_date = _resolve_effective_date(inspected_at)
    result: list[Dict[str, Any]] = []
    for index, (target, value) in enumerate(overrides.items(), start=1):
        normalized_target = _normalize_override_target(str(target))
        result.append(
            {
                "override_id": f"branch-{branch_id}-{index}",
                "component_id": component_id,
                "project_id": project_id,
                "target": normalized_target,
                "value": deepcopy(value),
                "approved_by": f"branch:{branch_id}",
                "evidence": {"reason": "branch override"},
                "effective_date": effective_date,
            }
        )
    return result


def _normalize_override_target(target_path: str) -> str:
    target = target_path.strip()
    if not target:
        raise ProjectUTXOServiceError("override target cannot be empty")

    if target.startswith(("path.", "gate.", "state.", "compose.", "proof.", "metadata.", "input_dto.")):
        return target
    if target.startswith("lookup."):
        return f"path.lookup_tables.{target[len('lookup.') :]}"
    if target.startswith("standard."):
        zone = target.split(".")[-1]
        return f"path.lookup_tables.standard_by_zone.{zone}"
    if target.startswith("tolerance."):
        zone = target.split(".")[-1]
        return f"path.lookup_tables.tolerance_by_zone.{zone}"
    return target


def _output_storage_key(output: UTXOOutput) -> str:
    v_address = str(output.get("v_address", "")).strip()
    if not v_address:
        raise ProjectUTXOServiceError("v_address is required on utxo output")
    return v_address


def _find_output_storage_key(project_utxo: ProjectUTXO, utxo_ref: str) -> str:
    if utxo_ref in project_utxo["unspent_outputs"]:
        return utxo_ref
    for storage_key, output in project_utxo["unspent_outputs"].items():
        if str(output.get("utxo_id", "")).strip() == utxo_ref:
            return storage_key
    raise ProjectUTXOServiceError(f"UTXO not found: {utxo_ref}")


def _find_output_by_execution_id(project_utxo: ProjectUTXO, execution_id: str) -> UTXOOutput | None:
    target = str(execution_id).strip()
    if not target:
        return None
    for output in project_utxo["unspent_outputs"].values():
        payload = output.get("payload", {})
        if not isinstance(payload, dict):
            continue
        if str(payload.get("execution_id", "")).strip() == target:
            return deepcopy(output)
    return None


def _branch_outputs(project_utxo: ProjectUTXO, branch_id: str, *, include_consumed: bool) -> list[UTXOOutput]:
    outputs: list[UTXOOutput] = []
    for output in project_utxo["unspent_outputs"].values():
        if not include_consumed and output.get("consumed"):
            continue
        if _resolve_output_branch(output) != branch_id:
            continue
        outputs.append(deepcopy(output))
    outputs.sort(
        key=lambda item: (
            _output_timestamp(item),
            _iso_to_unix(str(item.get("created_at", ""))),
            str(item.get("utxo_id", "")),
        ),
        reverse=True,
    )
    return outputs


def _current_state_from_output(output: UTXOOutput, *, branch_id: str) -> Dict[str, Any]:
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
        branch=branch_id,
        latest_utxo=str(output.get("utxo_id", "")).strip() or None,
        latest_v_address=str(output.get("v_address", "")).strip() or None,
        execution_id=execution_id,
        proof_hash=proof_hash,
        updated_at=str(output.get("created_at", "")).strip() or _utc_now(),
        source="utxo_transition",
    )


def _resolve_input_v_address(execution_result: Dict[str, Any], *, branch_id: str) -> str:
    direct = execution_result.get("input_v_address")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    input_payload = execution_result.get("input")
    if isinstance(input_payload, dict):
        raw_v = input_payload.get("v_address")
        if isinstance(raw_v, str) and raw_v.strip():
            return raw_v.strip()

    output_v_address = _as_non_empty_text(execution_result.get("v_address"), "v_address")
    parsed = parse_v_address(output_v_address)
    return build_v_address(
        {
            "projectId": parsed["projectId"],
            "stake": parsed["stake"],
            "layer": parsed.get("layer"),
            "branch": branch_id,
        }
    )


def _ensure_transition_input(
    project_utxo: ProjectUTXO,
    *,
    input_v_address: str,
    branch_id: str,
) -> tuple[ProjectUTXO, UTXOOutput]:
    candidates = resolve_v_address(project_utxo, input_v_address)
    selected = _select_best_resolved_output(candidates)
    if selected is not None:
        return project_utxo, selected

    branch = project_utxo["branches"].get(branch_id, {})
    parent_branch = branch.get("parent_branch") if isinstance(branch, dict) else None
    if isinstance(parent_branch, str) and parent_branch.strip():
        seeded_state, seeded_output = _materialize_seed_output(
            project_utxo,
            input_v_address=input_v_address,
            branch_id=branch_id,
            parent_branch=parent_branch.strip(),
        )
        if seeded_output is not None:
            return seeded_state, seeded_output

    genesis_output = _build_genesis_output(project_utxo, input_v_address=input_v_address, branch_id=branch_id)
    # Idempotency: when the same input v_address is replayed, reuse the existing genesis slot
    # instead of failing with "UTXO already exists".
    genesis_key = _output_storage_key(genesis_output)
    existing_genesis = project_utxo["unspent_outputs"].get(genesis_key)
    if isinstance(existing_genesis, dict):
        return project_utxo, deepcopy(cast(UTXOOutput, existing_genesis))
    next_state = add_output(project_utxo, genesis_output)
    return next_state, genesis_output


def _materialize_seed_output(
    project_utxo: ProjectUTXO,
    *,
    input_v_address: str,
    branch_id: str,
    parent_branch: str,
) -> tuple[ProjectUTXO, UTXOOutput | None]:
    parsed = parse_v_address(input_v_address)
    parent_query = build_v_address(
        {
            "projectId": parsed["projectId"],
            "stake": parsed["stake"],
            "layer": parsed.get("layer"),
            "branch": parent_branch,
        }
    )
    parent_candidates = resolve_v_address(project_utxo, parent_query)
    parent_output = _select_best_resolved_output(parent_candidates)
    if parent_output is None:
        return project_utxo, None

    branch_meta = project_utxo["branches"].get(branch_id, {})
    fork_point = str(branch_meta.get("created_at", "")).strip() or str(project_utxo.get("genesis_time", _utc_now()))
    fork_ts = _iso_to_unix(fork_point)
    parent_parsed = parse_v_address(parent_output["v_address"])
    clone = deepcopy(parent_output)
    clone["utxo_id"] = f"{parent_output['utxo_id']}_seed_{branch_id}"
    clone["v_address"] = build_v_address(
        {
            "projectId": parent_parsed["projectId"],
            "stake": parent_parsed["stake"],
            "version": _output_version(parent_output),
            "layer": parent_parsed.get("layer"),
            "branch": branch_id,
            "timestamp": fork_ts,
        }
    )
    clone["created_at"] = fork_point
    clone["consumed"] = False
    clone["spent_at"] = None
    clone["spent_by"] = None
    payload = clone.get("payload", {})
    if not isinstance(payload, dict):
        payload = {}
    payload["branch_id"] = branch_id
    payload["seed_from_utxo"] = parent_output["utxo_id"]
    payload["seed_from_branch"] = parent_branch
    payload["fork_point"] = fork_point
    clone["payload"] = payload
    clone_key = _output_storage_key(clone)
    existing_clone = project_utxo["unspent_outputs"].get(clone_key)
    if isinstance(existing_clone, dict):
        return project_utxo, deepcopy(cast(UTXOOutput, existing_clone))
    next_state = add_output(project_utxo, clone)
    return next_state, clone


def _build_genesis_output(project_utxo: ProjectUTXO, *, input_v_address: str, branch_id: str) -> UTXOOutput:
    parsed = parse_v_address(input_v_address)
    genesis_time = str(project_utxo.get("genesis_time", _utc_now()))
    genesis_ts = _iso_to_unix(genesis_time)
    seed_material = f"{parsed['projectId']}|{parsed['stake']}|{branch_id}"
    return {
        "utxo_id": f"utxo_genesis_{hashlib.sha256(seed_material.encode('utf-8')).hexdigest()[:12]}",
        "v_address": build_v_address(
            {
                "projectId": parsed["projectId"],
                "stake": parsed["stake"],
                "version": "genesis",
                "layer": parsed.get("layer"),
                "branch": branch_id,
                "timestamp": genesis_ts,
            }
        ),
        "type": "ComponentExecution",
        "state": "DRAFT",
        "payload": {
            "execution_id": None,
            "component_id": "__genesis__",
            "result": "GENESIS",
            "version": "genesis",
            "proof_hash": None,
            "full_proof": {},
            "lifecycle_status": "DRAFT",
            "branch_id": branch_id,
            "genesis": True,
            "input_v_address": input_v_address,
        },
        "created_at": genesis_time,
        "consumed": False,
        "spent_at": None,
        "spent_by": None,
    }


def _build_state_transition(
    *,
    input_output: UTXOOutput,
    output: UTXOOutput,
    execution_id: str,
    proof_hash: str | None,
    branch_id: str,
    created_at: str,
) -> Dict[str, Any]:
    return {
        "input_utxo": str(input_output.get("utxo_id", "")).strip(),
        "output_utxo": str(output.get("utxo_id", "")).strip(),
        "input_v_address": str(input_output.get("v_address", "")).strip(),
        "output_v_address": str(output.get("v_address", "")).strip(),
        "state": str(output.get("state", "")).strip(),
        "execution_id": execution_id,
        "proof_hash": proof_hash,
        "branch": branch_id,
        "timestamp": _iso_to_unix(created_at),
    }


def _resolve_project_id_from_input(input_payload: Dict[str, Any]) -> str:
    project_id = input_payload.get("project_id")
    if isinstance(project_id, str) and project_id.strip():
        return project_id.strip()
    return "UNSPECIFIED"


def _resolve_branch_id(execution_result: Dict[str, Any]) -> str:
    branch_id = execution_result.get("branch_id")
    if isinstance(branch_id, str) and branch_id.strip():
        return branch_id.strip()

    normalized_input = execution_result.get("normalized_input")
    if isinstance(normalized_input, dict):
        branch_id = normalized_input.get("__branch_id")
        if isinstance(branch_id, str) and branch_id.strip():
            return branch_id.strip()
    input_payload = execution_result.get("input")
    if isinstance(input_payload, dict):
        branch_id = input_payload.get("__branch_id")
        if isinstance(branch_id, str) and branch_id.strip():
            return branch_id.strip()
    return "main"


def _resolve_output_branch(output: UTXOOutput) -> str:
    payload = output.get("payload", {})
    if isinstance(payload, dict):
        branch_id = payload.get("branch_id")
        if isinstance(branch_id, str) and branch_id.strip():
            return branch_id.strip()
    return "main"


def _build_resolved_context(
    *,
    execution_engine: ComponentExecutionEngine,
    component_id: str,
    merged_input: Dict[str, Any],
    project_id: str,
    branch_id: str,
    effective_overrides: Mapping[str, Any],
) -> Dict[str, Any]:
    base_component = execution_engine.registry.get_component(component_id)
    resolved = execution_engine.config_resolver.resolve(component=base_component, input_payload=merged_input)
    component = resolved["component"]
    trace = resolved.get("trace", [])
    if not isinstance(trace, list):
        trace = []

    path_cfg = component.get("path", {})
    if not isinstance(path_cfg, dict):
        path_cfg = {}
    gate_cfg = component.get("gate", {})
    if not isinstance(gate_cfg, dict):
        gate_cfg = {}

    return {
        "project_id": project_id,
        "branch_id": branch_id,
        "parent_branch": merged_input.get("__parent_branch"),
        "fork_point": merged_input.get("__fork_point"),
        "fork_reason": merged_input.get("__fork_reason"),
        "merge_decision": merged_input.get("__merge_decision"),
        "merged_by": merged_input.get("__merged_by"),
        "merged_at": merged_input.get("__merged_at"),
        "component_id": component_id,
        "component_version": str(component.get("version", "")),
        "merge_order": ["base_component", "patch", "branch_override"],
        "applied_items": deepcopy(trace),
        "effective_overrides": deepcopy(dict(effective_overrides)),
        "path": {
            "lookup_tables": deepcopy(path_cfg.get("lookup_tables", {})),
            "formulas": deepcopy(path_cfg.get("formulas", {})),
        },
        "gate": deepcopy(gate_cfg),
    }


def _to_utxo_state(lifecycle_status: str) -> UTXOState:
    text = lifecycle_status.strip().upper()
    if text == "QUALIFIED":
        return "QUALIFIED"
    if text == "REJECTED":
        return "REJECTED"
    if text == "VALIDATED":
        return "VALIDATED"
    if text == "COMPUTED":
        return "COMPUTED"
    if text == "DRAFT":
        return "DRAFT"
    if text == "OVERRIDDEN":
        return "QUALIFIED"
    if text == "ARCHIVED":
        return "QUALIFIED"
    return "REJECTED"


def _output_version(output: UTXOOutput) -> str | None:
    try:
        parsed = parse_v_address(output["v_address"])
        if parsed.get("version"):
            return cast(str, parsed["version"])
    except VAddressError:
        pass

    payload = output.get("payload", {})
    if isinstance(payload, dict):
        for key in ("version", "proof_hash"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _output_proof_hash(output: UTXOOutput) -> str | None:
    payload = output.get("payload", {})
    if not isinstance(payload, dict):
        return None
    value = payload.get("proof_hash")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _output_timestamp(output: UTXOOutput) -> int:
    try:
        parsed = parse_v_address(output["v_address"])
        if parsed.get("timestamp") is not None:
            return cast(int, parsed["timestamp"])
    except VAddressError:
        pass
    return _iso_to_unix(output["created_at"])


def _select_best_resolved_output(outputs: list[UTXOOutput]) -> UTXOOutput | None:
    if not outputs:
        return None
    ranked = sorted(
        outputs,
        key=lambda item: (
            _output_timestamp(item),
            _iso_to_unix(str(item.get("created_at", ""))),
            str(item.get("utxo_id", "")),
        ),
        reverse=True,
    )
    return deepcopy(ranked[0])


def _resolve_created_at(execution_result: Dict[str, Any]) -> str:
    normalized_input = execution_result.get("normalized_input", {})
    if isinstance(normalized_input, dict):
        inspected_at = normalized_input.get("inspected_at")
        if isinstance(inspected_at, str) and inspected_at.strip():
            return inspected_at.strip()
    input_payload = execution_result.get("input", {})
    if isinstance(input_payload, dict):
        inspected_at = input_payload.get("inspected_at")
        if isinstance(inspected_at, str) and inspected_at.strip():
            return inspected_at.strip()
    return _utc_now()


def _resolve_effective_date(inspected_at: Any) -> str:
    if isinstance(inspected_at, str) and inspected_at.strip():
        try:
            return datetime.fromisoformat(inspected_at.strip().replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            pass
    return date.today().isoformat()


def _parse_range_length(range_text: str) -> float:
    text = range_text.strip().upper()
    match = re.match(r"^(.+)-(.+)$", text)
    if not match:
        raise ProjectUTXOServiceError(f"invalid range format: {range_text}")
    start = _parse_stake_point(match.group(1))
    end = _parse_stake_point(match.group(2))
    if end <= start:
        raise ProjectUTXOServiceError(f"range must increase: {range_text}")
    return float(end - start)


def _parse_stake_point(raw: str) -> float:
    text = raw.strip().upper()
    if text.startswith("K"):
        text = text[1:]
    if "+" in text:
        km_raw, meter_raw = text.split("+", 1)
        try:
            km = float(km_raw)
            meter = float(meter_raw)
        except ValueError as exc:
            raise ProjectUTXOServiceError(f"invalid stake point: {raw}") from exc
        return km * 1000 + meter
    try:
        return float(text) * 1000
    except ValueError as exc:
        raise ProjectUTXOServiceError(f"invalid stake point: {raw}") from exc


def _as_non_empty_text(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProjectUTXOServiceError(f"{field_name} is required")
    return value.strip()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _iso_to_unix(value: str) -> int:
    text = str(value).strip()
    if not text:
        return 0
    try:
        return int(datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return 0


def _unix_to_iso(value: int) -> str:
    try:
        ts = int(value)
    except (TypeError, ValueError):
        ts = 0
    if ts <= 0:
        return _utc_now()
    return datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
