from __future__ import annotations

import json
import threading
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from .models import TaskResult


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class TaskStore:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = runtime_dir
        self.results_dir = runtime_dir / "results"
        self.templates_dir = runtime_dir / "templates"
        self.audit_log_path = runtime_dir / "review_audit.jsonl"
        self.results_dir.mkdir(parents=True, exist_ok=True)
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._items: Dict[str, TaskResult] = {}

    def create(self, task_id: str, standard_code: str, input_file: str) -> TaskResult:
        with self._lock:
            now = _utc_now()
            result = TaskResult(
                task_id=task_id,
                status="processing",
                standard_code=standard_code,
                input_file=input_file,
                created_at=now,
                updated_at=now,
                parse_status="queued",
                parse_progress=0.0,
                review_status="DRAFT",
                review_history=[
                    {
                        "from": "",
                        "to": "DRAFT",
                        "timestamp": now,
                        "reason": "generated",
                    }
                ],
            )
            self._items[task_id] = result
            self._persist(result)
            return result

    def update_parse_state(
        self,
        task_id: str,
        *,
        parse_id: str | None = None,
        parse_status: str | None = None,
        parse_progress: float | None = None,
        parse_error: str | None = None,
    ) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            if parse_id is not None:
                result.parse_id = parse_id
            if parse_status is not None:
                result.parse_status = parse_status
            if parse_progress is not None:
                result.parse_progress = max(0.0, min(1.0, float(parse_progress)))
            if parse_error is not None:
                result.parse_error = parse_error
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def restart_processing(self, task_id: str) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            result.status = "processing"
            result.error = ""
            result.confidence = 0.0
            result.result_yaml = ""
            result.result_markdown = ""
            result.result_json = {}
            result.result_spu = {}
            result.spu_result = {}
            result.spu_validate_result = {}
            result.bundle_download_url = ""
            result.execution_entry = {}
            result.template_saved_path = ""
            result.review_required = False
            result.review_status = "DRAFT"
            result.review_score = 0.0
            result.review_passed = False
            result.review_issues = []
            result.review_points = []
            result.review_decision = {}
            result.template_query = {}
            result.template_recommendations = []
            result.template_action = ""
            result.template_selected_id = ""
            result.auto_registry = {}
            result.parse_status = "queued"
            result.parse_progress = 0.0
            result.parse_error = ""
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def mark_done(
        self,
        task_id: str,
        yaml_text: str,
        confidence: float,
        review_points: list,
        parse_result: dict | None = None,
        validate_result: dict | None = None,
        result_markdown: str | None = None,
        result_json: dict | None = None,
        result_spu: dict | None = None,
        spu_result: dict | None = None,
        spu_validate_result: dict | None = None,
        bundle_download_url: str = "",
        bundle_bytes: bytes | None = None,
        review_required: bool = False,
        review_status: str = "DRAFT",
        review_score: float = 0.0,
        review_passed: bool = False,
        review_issues: list | None = None,
        template_query: dict | None = None,
        template_recommendations: list | None = None,
        template_action: str = "",
        template_selected_id: str = "",
        auto_registry: dict | None = None,
    ) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")

            now = _utc_now()
            previous_status = result.review_status

            result.status = "done"
            result.result_yaml = yaml_text
            result.result_markdown = result_markdown if result_markdown is not None else yaml_text
            result.result_json = dict(result_json or {})
            result.result_spu = dict(result_spu or {})
            result.confidence = confidence
            result.review_points = list(review_points)
            result.parse_result = dict(parse_result or {})
            result.parse_id = str((result.parse_result or {}).get("parseId") or result.parse_id or "")
            result.parse_status = "success"
            result.parse_progress = 1.0
            result.parse_error = ""
            result.validate_result = dict(validate_result or {})
            result.spu_result = dict(spu_result or {})
            result.spu_validate_result = dict(spu_validate_result or {})
            result.bundle_download_url = bundle_download_url
            result.review_required = bool(review_required)
            result.review_status = review_status
            result.review_score = float(review_score)
            result.review_passed = bool(review_passed)
            result.review_issues = list(review_issues or [])
            result.template_query = dict(template_query or {})
            result.template_recommendations = list(template_recommendations or [])
            result.template_action = template_action
            result.template_selected_id = template_selected_id
            result.auto_registry = dict(auto_registry or {})
            result.updated_at = now
            self._append_review_history(result, from_status=previous_status, to_status=review_status, reason="auto_validate", timestamp=now)

            self._items[task_id] = result
            self._persist(result)
            (self.results_dir / f"{task_id}.yaml").write_text(yaml_text, encoding="utf-8")
            (self.results_dir / f"{task_id}.md").write_text(result.result_markdown, encoding="utf-8")
            if result.result_json:
                (self.results_dir / f"{task_id}.spu.json").write_text(
                    json.dumps(result.result_json, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            if bundle_bytes is not None:
                (self.results_dir / f"{task_id}.specbundle").write_bytes(bundle_bytes)
            return result

    def update_template_state(
        self,
        task_id: str,
        *,
        template_query: dict | None = None,
        template_recommendations: list | None = None,
        template_action: str | None = None,
        template_selected_id: str | None = None,
    ) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            if template_query is not None:
                result.template_query = dict(template_query)
            if template_recommendations is not None:
                result.template_recommendations = list(template_recommendations)
            if template_action is not None:
                result.template_action = template_action
            if template_selected_id is not None:
                result.template_selected_id = template_selected_id
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def mark_execution_entry(self, task_id: str, execution_entry: dict) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            result.execution_entry = dict(execution_entry or {})
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def save_template(self, task_id: str, spu: dict, markdown: str = "") -> Path:
        if not isinstance(spu, dict) or not spu:
            raise ValueError("empty spu")
        spu_id = str(spu.get("spuId") or "").strip()
        if not spu_id:
            raise ValueError("spuId missing")
        safe_name = "".join(ch if ch.isalnum() or ch in ("-", "_", ".", "@") else "_" for ch in spu_id)
        json_path = self.templates_dir / f"{safe_name}.json"
        md_path = self.templates_dir / f"{safe_name}.md"
        json_path.write_text(json.dumps(spu, ensure_ascii=False, indent=2), encoding="utf-8")
        if markdown:
            md_path.write_text(markdown, encoding="utf-8")
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            result.template_saved_path = str(json_path)
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
        return json_path

    def approve_review(self, task_id: str, reviewer: str) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            previous_status = result.review_status
            now = _utc_now()
            result.review_status = "APPROVED"
            result.review_required = False
            result.review_decision = {
                "decision": "APPROVED",
                "reviewer": reviewer,
                "timestamp": now,
            }
            self._append_review_history(result, from_status=previous_status, to_status="APPROVED", reason="manual_approve", timestamp=now)
            event = {
                "eventType": "SPU_REVIEW_APPROVED",
                "taskId": task_id,
                "reviewer": reviewer,
                "timestamp": now,
            }
            self._append_review_audit(result, event)
            result.updated_at = now
            self._items[task_id] = result
            self._persist(result)
            return result

    def reject_review(self, task_id: str, reviewer: str, reason: str) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            previous_status = result.review_status
            now = _utc_now()
            result.review_status = "REJECTED"
            result.review_required = True
            result.review_decision = {
                "decision": "REJECTED",
                "reviewer": reviewer,
                "reason": reason,
                "timestamp": now,
            }
            self._append_review_history(result, from_status=previous_status, to_status="REJECTED", reason="manual_reject", timestamp=now)
            event = {
                "eventType": "SPU_REVIEW_REJECTED",
                "taskId": task_id,
                "reviewer": reviewer,
                "reason": reason,
                "timestamp": now,
            }
            self._append_review_audit(result, event)
            result.updated_at = now
            self._items[task_id] = result
            self._persist(result)
            return result

    def update_auto_registry(self, task_id: str, auto_registry: dict) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            result.auto_registry = dict(auto_registry or {})
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def mark_error(self, task_id: str, error: str) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            result.status = "error"
            result.error = error
            if not result.parse_status:
                result.parse_status = "failed"
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def get(self, task_id: str) -> Optional[TaskResult]:
        with self._lock:
            if task_id in self._items:
                return self._items[task_id]
        file_path = self.results_dir / f"{task_id}.json"
        if not file_path.exists():
            return None
        payload = json.loads(file_path.read_text(encoding="utf-8"))
        item = TaskResult(**payload)
        with self._lock:
            self._items[task_id] = item
        return item

    def yaml_path(self, task_id: str) -> Path:
        return self.results_dir / f"{task_id}.yaml"

    def bundle_path(self, task_id: str) -> Path:
        return self.results_dir / f"{task_id}.specbundle"

    def _append_review_history(self, result: TaskResult, *, from_status: str, to_status: str, reason: str, timestamp: str) -> None:
        if from_status == to_status:
            return
        result.review_history.append(
            {
                "from": from_status,
                "to": to_status,
                "reason": reason,
                "timestamp": timestamp,
            }
        )

    def _append_review_audit(self, result: TaskResult, event: Dict[str, Any]) -> None:
        result.review_audit_events.append(dict(event))
        self.audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    def append_audit_event(self, task_id: str, event: Dict[str, Any]) -> TaskResult:
        with self._lock:
            result = self._items.get(task_id)
            if result is None:
                raise KeyError(f"task not found: {task_id}")
            self._append_review_audit(result, event)
            result.updated_at = _utc_now()
            self._items[task_id] = result
            self._persist(result)
            return result

    def _persist(self, result: TaskResult) -> None:
        path = self.results_dir / f"{result.task_id}.json"
        path.write_text(json.dumps(asdict(result), ensure_ascii=False, indent=2), encoding="utf-8")
