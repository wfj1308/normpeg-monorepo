from __future__ import annotations

from typing import Any, Dict, List, Tuple

from app.models.normdoc import ProjectProfile
from app.services.common import set_by_path


def apply_project_overrides(normdoc_payload: Dict[str, Any], project: ProjectProfile) -> Tuple[Dict[str, Any], List[str]]:
    applied: List[str] = []
    for rule in project.overrides:
        set_by_path(normdoc_payload, rule.target, rule.value)
        applied.append(f"{rule.target}={rule.value}")
    return normdoc_payload, applied

