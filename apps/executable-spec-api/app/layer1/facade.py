from __future__ import annotations

from typing import Any, Dict, List

from app.layer1.override_service import apply_project_overrides
from app.layer1.patch_service import apply_patches
from app.layer1.repository import list_components, load_normdoc, load_patch, load_project
from app.models.normdoc import Layer1ResolveRequest, Layer1ResolveResponse


def list_layer1_components() -> List[Dict[str, Any]]:
    return list_components()


def resolve_layer1_component(request: Layer1ResolveRequest) -> Layer1ResolveResponse:
    project = load_project(request.project_id)
    normdoc = load_normdoc(request.component_id, request.version or project.default_component_version)

    patches = [load_patch(pid) for pid in request.patch_ids]
    resolved = apply_patches(normdoc, patches)
    applied_patches = [patch.patch_id for patch in patches]

    applied_overrides: List[str] = []
    if request.use_project_overrides:
        resolved, applied_overrides = apply_project_overrides(resolved, project)

    header = resolved.get("header", {})
    return Layer1ResolveResponse(
        component_id=str(header.get("component_id", request.component_id)),
        version=str(header.get("version", request.version or project.default_component_version)),
        applied_patches=applied_patches,
        applied_overrides=applied_overrides,
        normdoc=resolved,
    )

