from __future__ import annotations

from pathlib import Path
from typing import Dict

from app.config import REPO_ROOT, WEB_SPU_ASSET_DIR


def save_compiled_spu_asset(spu_id: str, yaml_text: str) -> Dict[str, str]:
    WEB_SPU_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    filename = _build_asset_filename(spu_id)
    target = WEB_SPU_ASSET_DIR / filename
    target.write_text(yaml_text, encoding="utf-8")
    return {
        "filePath": str(target),
        "assetPath": str(target.relative_to(REPO_ROOT)).replace("\\", "/"),
        "spuId": spu_id,
    }


def _build_asset_filename(spu_id: str) -> str:
    sanitized = spu_id.replace("@", "_").replace("/", "_").replace("\\", "_")
    return f"{sanitized}.spu.yaml"
