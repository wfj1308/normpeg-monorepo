from __future__ import annotations

from typing import Any, Dict, List

from app.models.normdoc import NormDoc, NormPatch
from app.services.common import deepcopy_dict, set_by_path


def apply_patch(normdoc: NormDoc, patch: NormPatch) -> Dict[str, Any]:
    payload = deepcopy_dict(normdoc.model_dump(by_alias=True))
    for op in patch.operations:
        if op.op != "replace":
            continue
        set_by_path(payload, op.path, op.value)
    return payload


def apply_patches(normdoc: NormDoc, patches: List[NormPatch]) -> Dict[str, Any]:
    output = deepcopy_dict(normdoc.model_dump(by_alias=True))
    for patch in patches:
        for op in patch.operations:
            if op.op != "replace":
                continue
            set_by_path(output, op.path, op.value)
    return output

