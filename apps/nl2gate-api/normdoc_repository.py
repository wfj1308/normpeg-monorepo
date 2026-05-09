from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


NormDocStatus = Literal["draft", "published", "deprecated"]


class NormDocRecord(BaseModel):
    normdoc_id: str
    standard_code: str
    standard_name: str
    version: str
    status: NormDocStatus
    specbundle_path: str
    bundle_hash: str
    specir_path: str
    spec_md_path: str
    spec_json_path: str
    created_by: str
    published_by: str
    published_at: str
    rule_count: int = 0
    component_count: int = 0


class NormDocCreatePayload(BaseModel):
    normdoc_id: str
    standard_code: str
    standard_name: str
    version: str
    specbundle_path: str
    bundle_hash: str
    specir_path: str
    spec_md_path: str
    spec_json_path: str
    created_by: str
    published_by: str = ""
    published_at: str = ""
    rule_count: int = 0
    component_count: int = 0
    status: NormDocStatus = "draft"


class NormDocPublishPayload(BaseModel):
    published_by: str


class NormDocRepository:
    def __init__(self, store_path: Path):
        self._store_path = Path(store_path).resolve()
        self._store_path.parent.mkdir(parents=True, exist_ok=True)

    def _read_rows(self) -> List[Dict]:
        if not self._store_path.exists():
            return []
        text = self._store_path.read_text(encoding="utf-8-sig").strip()
        if not text:
            return []
        payload = json.loads(text)
        if not isinstance(payload, list):
            return []
        return [item for item in payload if isinstance(item, dict)]

    def _write_rows(self, rows: List[Dict]) -> None:
        self._store_path.write_text(
            json.dumps(rows, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def list(self, *, status: Optional[NormDocStatus] = None) -> List[NormDocRecord]:
        rows = self._read_rows()
        items: List[NormDocRecord] = []
        for row in rows:
            try:
                item = NormDocRecord.model_validate(row)
            except Exception:
                continue
            if status and item.status != status:
                continue
            items.append(item)
        return items

    def get(self, normdoc_id: str) -> Optional[NormDocRecord]:
        target = str(normdoc_id or "").strip()
        if not target:
            return None
        for row in self._read_rows():
            if str(row.get("normdoc_id", "")).strip() == target:
                try:
                    return NormDocRecord.model_validate(row)
                except Exception:
                    return None
        return None

    def upsert(self, payload: NormDocCreatePayload) -> NormDocRecord:
        rows = self._read_rows()
        model = NormDocRecord.model_validate(payload.model_dump())
        target = model.normdoc_id
        replaced = False
        for idx, row in enumerate(rows):
            if str(row.get("normdoc_id", "")).strip() == target:
                rows[idx] = model.model_dump()
                replaced = True
                break
        if not replaced:
            rows.append(model.model_dump())
        self._write_rows(rows)
        return model

    def publish(self, normdoc_id: str, published_by: str) -> NormDocRecord:
        target = str(normdoc_id or "").strip()
        actor = str(published_by or "").strip()
        if not target:
            raise ValueError("normdoc_id is required")
        if not actor:
            raise ValueError("published_by is required")

        rows = self._read_rows()
        for idx, row in enumerate(rows):
            if str(row.get("normdoc_id", "")).strip() != target:
                continue
            record = NormDocRecord.model_validate(row)
            updated = record.model_copy(
                update={
                    "status": "published",
                    "published_by": actor,
                    "published_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                }
            )
            rows[idx] = updated.model_dump()
            self._write_rows(rows)
            return updated
        raise ValueError(f"normdoc not found: {target}")

