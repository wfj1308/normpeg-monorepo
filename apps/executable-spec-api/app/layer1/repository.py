from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException

from app.config import NORMDOC_DIR, PATCH_DIR, PROJECT_DIR
from app.models.normdoc import NormDoc, NormPatch, ProjectProfile
from app.services.common import read_json


def _scan_files(root: Path) -> List[Path]:
    if not root.exists():
        return []
    return sorted(root.rglob("*.json"))


def list_components() -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for path in _scan_files(NORMDOC_DIR):
        raw = read_json(path)
        model = NormDoc.model_validate(raw)
        items.append(
            {
                "component_id": model.header.component_id,
                "component_name": model.header.component_name,
                "version": model.header.version,
                "standard_id": model.header.standard_id,
                "path": str(path),
            }
        )
    return items


def load_normdoc(component_id: str, version: str | None = None) -> NormDoc:
    hit: NormDoc | None = None
    for path in _scan_files(NORMDOC_DIR):
        raw = read_json(path)
        model = NormDoc.model_validate(raw)
        if model.header.component_id != component_id:
            continue
        if version and model.header.version != version:
            continue
        hit = model
        break

    if not hit:
        want = f"{component_id}@{version or '*'}"
        raise HTTPException(status_code=404, detail=f"NormDoc not found: {want}")
    return hit


def load_patch(patch_id: str) -> NormPatch:
    for path in _scan_files(PATCH_DIR):
        raw = read_json(path)
        patch = NormPatch.model_validate(raw)
        if patch.patch_id == patch_id:
            return patch
    raise HTTPException(status_code=404, detail=f"Patch not found: {patch_id}")


def load_project(project_id: str) -> ProjectProfile:
    target = PROJECT_DIR / f"{project_id}.project_profile.json"
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"ProjectProfile not found: {project_id}")
    raw = read_json(target)
    return ProjectProfile.model_validate(raw)

