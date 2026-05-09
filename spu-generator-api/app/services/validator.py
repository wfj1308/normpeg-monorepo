from __future__ import annotations

from typing import Any, Dict, List

from app.models.schemas import ValidationResponse


def validate_spu_schema(spu: Dict[str, Any], target_schema: str) -> ValidationResponse:
    errors: List[str] = []
    if target_schema != "SPU-v1":
        errors.append(f"UNSUPPORTED_SCHEMA:{target_schema}")

    if not isinstance(spu, dict):
        return ValidationResponse(valid=False, errors=["spu must be object"])

    required_top = ["spuId", "meta", "data", "path", "rules", "proof"]
    for key in required_top:
        if key not in spu:
            errors.append(f"missing field: {key}")

    meta = spu.get("meta", {})
    if not isinstance(meta, dict):
        errors.append("meta must be object")
    else:
        for key in ("name", "norm", "clause", "version"):
            if not meta.get(key):
                errors.append(f"meta.{key} is required")

    data = spu.get("data", {})
    if not isinstance(data, dict):
        errors.append("data must be object")
    else:
        if not isinstance(data.get("inputs"), list) or len(data.get("inputs", [])) == 0:
            errors.append("data.inputs must be non-empty list")
        if not isinstance(data.get("outputs"), list) or len(data.get("outputs", [])) == 0:
            errors.append("data.outputs must be non-empty list")

    if not isinstance(spu.get("path"), list) or len(spu.get("path", [])) == 0:
        errors.append("path must be non-empty list")
    if not isinstance(spu.get("rules"), list) or len(spu.get("rules", [])) == 0:
        errors.append("rules must be non-empty list")

    proof = spu.get("proof", {})
    if not isinstance(proof, dict):
        errors.append("proof must be object")
    else:
        if not proof.get("resultField"):
            errors.append("proof.resultField is required")
        if not isinstance(proof.get("requiredSignatures"), list):
            errors.append("proof.requiredSignatures must be list")

    return ValidationResponse(valid=len(errors) == 0, errors=errors)

