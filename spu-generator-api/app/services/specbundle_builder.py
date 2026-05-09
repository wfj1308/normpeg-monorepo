from __future__ import annotations

import io
import json
import zipfile
from typing import Any, Dict


def build_readme(spu_id: str) -> str:
    return (
        "SPU SpecBundle\n"
        f"- spuId: {spu_id}\n"
        "- files: spec.md, spec.json, README.txt\n"
        "- purpose: import into SPU registry/runtime\n"
    )


def build_specbundle_bytes(markdown: str, spec_json: Dict[str, Any]) -> bytes:
    payload = io.BytesIO()
    with zipfile.ZipFile(payload, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("spec.md", markdown)
        zf.writestr("spec.json", json.dumps(spec_json, ensure_ascii=False, indent=2))
        zf.writestr("README.txt", build_readme(str(spec_json.get("spuId", ""))))
    return payload.getvalue()

