from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import HTTPException

from app.config import REPO_ROOT, SPU_REGISTRY_FILE
from app.models.compiler import SpuRegistryItem
from app.services.common import read_json, write_json


def list_spu_registry_items() -> List[Dict[str, Any]]:
    payload = _load_registry_payload()
    items = payload.get("items", [])
    if not isinstance(items, list):
        return []
    normalized = [SpuRegistryItem.model_validate(item).model_dump() for item in items if isinstance(item, dict)]
    return sorted(normalized, key=lambda item: (item["name"], item["spuId"]))


def register_compiled_spu(item: Dict[str, Any]) -> Dict[str, Any]:
    registry_item = SpuRegistryItem.model_validate(item)
    payload = _load_registry_payload()
    items = payload.get("items", [])
    if not isinstance(items, list):
        items = []

    next_items: List[Dict[str, Any]] = []
    replaced = False
    for existing in items:
        if not isinstance(existing, dict):
            continue
        if str(existing.get("spuId", "")) == registry_item.spuId:
            next_items.append(registry_item.model_dump())
            replaced = True
        else:
            next_items.append(SpuRegistryItem.model_validate(existing).model_dump())

    if not replaced:
        next_items.append(registry_item.model_dump())

    payload["items"] = sorted(next_items, key=lambda entry: (entry["name"], entry["spuId"]))
    _save_registry_payload(payload)
    return registry_item.model_dump()


def load_spu_asset_text(spu_id: str) -> str:
    for item in list_spu_registry_items():
        if item["spuId"] != spu_id:
            continue
        asset_path = Path(str(item["assetPath"]))
        target = (REPO_ROOT / asset_path).resolve()
        if not target.exists():
            raise HTTPException(status_code=404, detail=f"SPU asset not found for {spu_id}")
        return target.read_text(encoding="utf-8")
    raise HTTPException(status_code=404, detail=f"SPU registry item not found: {spu_id}")


def _load_registry_payload() -> Dict[str, Any]:
    if not SPU_REGISTRY_FILE.exists():
        return {"items": []}
    payload = read_json(SPU_REGISTRY_FILE)
    if not isinstance(payload, dict):
        return {"items": []}
    return payload


def _save_registry_payload(payload: Dict[str, Any]) -> None:
    write_json(SPU_REGISTRY_FILE, payload)
