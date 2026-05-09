from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Dict, Optional

from app.models.schemas import SPUGenerationResult


class OutputStore:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = runtime_dir
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._items: Dict[str, SPUGenerationResult] = {}

    def put(self, result: SPUGenerationResult, bundle_bytes: bytes | None = None) -> None:
        with self._lock:
            self._items[result.taskId] = result
            (self.runtime_dir / f"{result.taskId}.json").write_text(
                json.dumps(result.model_dump(by_alias=True), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            if bundle_bytes is not None:
                (self.runtime_dir / f"{result.taskId}.specbundle").write_bytes(bundle_bytes)

    def get(self, task_id: str) -> Optional[SPUGenerationResult]:
        with self._lock:
            item = self._items.get(task_id)
            if item is not None:
                return item

        target = self.runtime_dir / f"{task_id}.json"
        if not target.exists():
            return None
        loaded = SPUGenerationResult.model_validate_json(target.read_text(encoding="utf-8"))
        with self._lock:
            self._items[task_id] = loaded
        return loaded

    def bundle_path(self, task_id: str) -> Path:
        return self.runtime_dir / f"{task_id}.specbundle"
