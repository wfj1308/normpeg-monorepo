from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, Mapping

from backend.app.core.v_address import parse_v_address


def resolve_branch_reference(
    branch_id: str | None,
    *,
    branches: Mapping[str, Mapping[str, Any]] | None = None,
    current_branch: str | None = None,
) -> str:
    requested = str(branch_id or "main").strip() or "main"
    if requested.lower() != "current":
        return requested

    active_forks = _list_active_forks(branches)
    current = str(current_branch or "").strip()
    if current in active_forks:
        return current
    return active_forks[0] if active_forks else "main"


def resolve_v_address_target(
    v_address: str,
    *,
    branches: Mapping[str, Mapping[str, Any]] | None = None,
    current_branch: str | None = None,
) -> Dict[str, Any]:
    parsed = parse_v_address(v_address)
    branch = str(parsed.get("branch") or "main").strip() or "main"
    resolved_branch = resolve_branch_reference(branch, branches=branches, current_branch=current_branch)
    return {
        "project_id": str(parsed["projectId"]),
        "stake": str(parsed["stake"]),
        "branch": branch,
        "branch_id": branch,
        "resolved_branch": resolved_branch,
        "context": {
            "version": parsed.get("version"),
            "layer": parsed.get("layer"),
            "time": parsed.get("timestamp"),
            "active_forks": _list_active_forks(branches),
        },
    }


def resolve_project_v_address(project_utxo: Mapping[str, Any], v_address: str) -> Dict[str, Any]:
    raw_branches = project_utxo.get("branches")
    branches = raw_branches if isinstance(raw_branches, Mapping) else {}
    current_branch = project_utxo.get("current_branch")
    return resolve_v_address_target(
        v_address,
        branches=branches,
        current_branch=str(current_branch) if isinstance(current_branch, str) else "main",
    )


def resolve(project_utxo: Mapping[str, Any], v_address: str, resolved_output: Mapping[str, Any] | None = None) -> Dict[str, Any]:
    resolved = resolve_project_v_address(project_utxo, v_address)
    response = {
        "project_id": resolved["project_id"],
        "stake": resolved["stake"],
        "branch": resolved["resolved_branch"],
        "requested_branch": resolved["branch"],
        "resolved_output": deepcopy(dict(resolved_output)) if isinstance(resolved_output, Mapping) else None,
        "context": deepcopy(dict(resolved.get("context", {}))),
    }
    return response


def _list_active_forks(branches: Mapping[str, Mapping[str, Any]] | None) -> list[str]:
    if not isinstance(branches, Mapping):
        return []

    entries: list[tuple[str, str]] = []
    for branch_id, branch in branches.items():
        if str(branch_id).strip() == "main":
            continue
        if not isinstance(branch, Mapping):
            continue
        status = str(branch.get("status", "")).strip().upper()
        if status not in {"ACTIVE", "FORK_CREATED", "UNDER_REVIEW", "APPROVED"}:
            continue
        entries.append((str(branch_id).strip(), str(branch.get("created_at", "")).strip()))
    entries.sort(key=lambda item: (item[1], item[0]), reverse=True)
    return [item[0] for item in entries]
