from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Dict, Optional

from app.models.schemas import ParseResult, ParseTaskRecord


class ParseResultStore:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = runtime_dir
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._items: Dict[str, ParseTaskRecord] = {}

    def create_task(self, parse_id: str) -> ParseTaskRecord:
        with self._lock:
            task = ParseTaskRecord(parseId=parse_id, status="queued", progress=0.0, error=None, result=None)
            self._items[parse_id] = task
            self._persist(task)
            return task

    def set_processing(self, parse_id: str, progress: float = 0.0) -> ParseTaskRecord:
        return self._update(parse_id=parse_id, status="processing", progress=progress, stage="upload", error=None)

    def set_progress(self, parse_id: str, progress: float) -> ParseTaskRecord:
        return self._update(parse_id=parse_id, progress=progress)

    def set_stage(self, parse_id: str, stage: str, *, progress: float | None = None) -> ParseTaskRecord:
        return self._update(parse_id=parse_id, stage=stage, progress=progress)

    def append_step_log(self, parse_id: str, row: Dict[str, object]) -> ParseTaskRecord:
        with self._lock:
            task = self._items.get(parse_id)
            if task is None:
                task = ParseTaskRecord(parseId=parse_id, status="queued", progress=0.0, error=None, result=None)
            logs = list(task.step_logs)
            logs.append(dict(row))
            task.step_logs = logs
            self._items[parse_id] = task
            self._persist(task)
            return task

    def add_artifact(self, parse_id: str, name: str, path: Path) -> ParseTaskRecord:
        with self._lock:
            task = self._items.get(parse_id)
            if task is None:
                task = ParseTaskRecord(parseId=parse_id, status="queued", progress=0.0, error=None, result=None)
            art = dict(task.artifacts)
            art[str(name)] = str(path)
            task.artifacts = art
            self._items[parse_id] = task
            self._persist(task)
            return task

    def set_success(self, parse_id: str, result: ParseResult) -> ParseTaskRecord:
        return self._update(parse_id=parse_id, status="success", progress=1.0, error=None, result=result)

    def set_failed(self, parse_id: str, error: str) -> ParseTaskRecord:
        return self._update(parse_id=parse_id, status="failed", error=error, progress=1.0)

    def get_task(self, parse_id: str) -> Optional[ParseTaskRecord]:
        with self._lock:
            hit = self._items.get(parse_id)
            if hit is not None:
                return hit

        target = self.runtime_dir / f"{parse_id}.json"
        if not target.exists():
            return None

        parsed = ParseTaskRecord.model_validate_json(target.read_text(encoding="utf-8"))
        with self._lock:
            self._items[parse_id] = parsed
        return parsed

    def _update(
        self,
        *,
        parse_id: str,
        status: str | None = None,
        progress: float | None = None,
        error: str | None = None,
        result: ParseResult | None = None,
        stage: str | None = None,
    ) -> ParseTaskRecord:
        with self._lock:
            task = self._items.get(parse_id)
            if task is None:
                task = ParseTaskRecord(parseId=parse_id, status="queued", progress=0.0, error=None, result=None)

            if status is not None:
                task.status = status  # type: ignore[assignment]
            if progress is not None:
                task.progress = max(0.0, min(1.0, float(progress)))
            if stage is not None:
                task.stage = str(stage).strip() or task.stage
            if error is not None or status == "failed":
                task.error = error
            elif status in {"queued", "processing", "success"}:
                task.error = None
            if result is not None:
                task.result = result

            self._items[parse_id] = task
            self._persist(task)
            return task

    def _persist(self, task: ParseTaskRecord) -> None:
        target = self.runtime_dir / f"{task.parseId}.json"
        target.write_text(json.dumps(task.model_dump(), ensure_ascii=False, indent=2), encoding="utf-8")

    def write_document_ir(self, parse_id: str, document_ir: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "document_ir.json"
        target.write_text(json.dumps(document_ir, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "document_ir.json", target)
        return target

    def write_specir_candidates(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "specir_candidates.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "specir_candidates.json", target)
        return target

    def write_rules(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "rules.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "rules.json", target)
        return target

    def write_gates(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "gates.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "gates.json", target)
        return target

    def write_unresolved(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "unresolved.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "unresolved.json", target)
        return target

    def write_normref(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "normref.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "normref.json", target)
        return target

    def write_specir_approved(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "specir_approved.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "specir_approved.json", target)
        return target

    def write_publish_record(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "publish_record.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "publish_record.json", target)
        return target

    def write_quality_report(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "quality_report.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "quality_report.json", target)
        return target

    def write_specir_diff_report(self, parse_id: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / parse_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        target = artifact_dir / "specir_diff_report.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact(parse_id, "specir_diff_report.json", target)
        return target

    def write_rulepack(self, form_code: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / "rulepacks"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(form_code or "").strip())
        safe = safe or "unknown_form"
        target = artifact_dir / f"{safe}.rulepack.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact("rulepack", f"{safe}.rulepack.json", target)
        return target

    def write_traceability_report(self, form_code: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / "rulepacks"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(form_code or "").strip())
        safe = safe or "unknown_form"
        target = artifact_dir / f"{safe}.traceability_report.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact("rulepack", f"{safe}.traceability_report.json", target)
        return target

    def write_rulepack_diff(self, form_code: str, payload: Dict[str, object]) -> Path:
        artifact_dir = self.runtime_dir / "rulepacks"
        artifact_dir.mkdir(parents=True, exist_ok=True)
        safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in str(form_code or "").strip())
        safe = safe or "unknown_form"
        target = artifact_dir / f"{safe}.rulepack_diff.json"
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        self.add_artifact("rulepack", f"{safe}.rulepack_diff.json", target)
        return target
