from __future__ import annotations

import copy
import io
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from zipfile import ZIP_DEFLATED, ZipFile


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _slug(text: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "_", (text or "").strip()).strip("_").lower()
    return value or "unknown"


def _normalize_text(text: str) -> str:
    return re.sub(r"[\s\-_/]+", "", (text or "").lower())


def _extract_numbered_clauses(text: str) -> List[str]:
    if not text:
        return []
    return re.findall(r"\b\d+(?:\.\d+){1,4}\b", text)


def _extract_clause_candidates(extracted_data: Dict[str, Any]) -> List[str]:
    candidates: List[str] = []
    clauses = extracted_data.get("clauses")
    if isinstance(clauses, list):
        for item in clauses:
            if isinstance(item, dict):
                for key in ("clauseId", "clause", "id", "title"):
                    value = str(item.get(key) or "").strip()
                    if value:
                        candidates.append(value)
            elif isinstance(item, str):
                candidates.append(item.strip())

    chapters = extracted_data.get("chapters")
    if isinstance(chapters, list):
        for item in chapters:
            if isinstance(item, dict):
                candidates.extend(_extract_numbered_clauses(str(item.get("title") or "")))
                candidates.extend(_extract_numbered_clauses(str(item.get("text") or "")))
            elif isinstance(item, str):
                candidates.extend(_extract_numbered_clauses(item))

    return list(dict.fromkeys([item for item in candidates if item]))


def _extract_first_clause(extracted_data: Dict[str, Any]) -> str:
    candidates = _extract_clause_candidates(extracted_data)
    if not candidates:
        return ""
    for item in candidates:
        numeric = _extract_numbered_clauses(item)
        if numeric:
            return numeric[0]
    return candidates[0]


def _text_blob_from_extracted(extracted_data: Dict[str, Any]) -> str:
    chunks: List[str] = []
    for section_name in ("clauses", "chapters"):
        section = extracted_data.get(section_name)
        if not isinstance(section, list):
            continue
        for item in section:
            if isinstance(item, dict):
                chunks.append(str(item.get("title") or ""))
                chunks.append(str(item.get("text") or ""))
            else:
                chunks.append(str(item))
    return "\n".join(chunks)


def infer_measured_item(extracted_data: Dict[str, Any], spu: Dict[str, Any] | None = None) -> str:
    if isinstance(spu, dict):
        meta = spu.get("meta")
        if isinstance(meta, dict):
            measured_item = str(meta.get("measuredItem") or "").strip()
            if measured_item:
                return measured_item

    blob = _text_blob_from_extracted(extracted_data).lower()
    if "压实度" in blob or "compaction" in blob:
        return "压实度"
    if "弯沉" in blob or "deflection" in blob:
        return "弯沉"
    if "厚度" in blob or "thickness" in blob:
        return "厚度"
    return "unknown"


def infer_category_and_workitem(extracted_data: Dict[str, Any], spu: Dict[str, Any] | None = None) -> tuple[str, str]:
    if isinstance(spu, dict):
        meta = spu.get("meta")
        if isinstance(meta, dict):
            category = str(meta.get("category") or "").strip()
            work_item = str(meta.get("workItem") or "").strip()
            if category or work_item:
                return category or "general", work_item or "generic-work-item"

    blob = _text_blob_from_extracted(extracted_data).lower()
    if "路基" in blob or "subgrade" in blob:
        return "subgrade", "土方路基"
    return "general", "通用工程项"


def infer_template_query(standard_code: str, extracted_data: Dict[str, Any], spu: Dict[str, Any] | None = None) -> Dict[str, Any]:
    clause = _extract_first_clause(extracted_data)
    measured_item = infer_measured_item(extracted_data=extracted_data, spu=spu)
    category, work_item = infer_category_and_workitem(extracted_data=extracted_data, spu=spu)
    return {
        "standardCode": standard_code,
        "norm": standard_code,
        "clause": clause,
        "measuredItem": measured_item,
        "category": category,
        "workItem": work_item,
    }


def render_markdown_from_spu(spu: Dict[str, Any]) -> str:
    meta = spu.get("meta") if isinstance(spu.get("meta"), dict) else {}
    data_obj = spu.get("data") if isinstance(spu.get("data"), dict) else {}
    inputs = data_obj.get("inputs") if isinstance(data_obj.get("inputs"), list) else []
    path = spu.get("path") if isinstance(spu.get("path"), list) else []
    rules = spu.get("rules") if isinstance(spu.get("rules"), list) else []

    lines = [
        f"# {meta.get('name') or spu.get('spuId') or 'SPU'}",
        "",
        "## Spec Source",
        f"- Standard: {meta.get('norm') or '-'}",
        f"- Clause: {meta.get('clause') or '-'}",
        "",
        "## Scope",
        f"- Category: {meta.get('category') or '-'}",
        f"- Work Item: {meta.get('workItem') or '-'}",
        f"- Measured Item: {meta.get('measuredItem') or '-'}",
        "",
        "## Input Parameters",
    ]
    for field in inputs:
        if isinstance(field, dict):
            lines.append(
                f"- {field.get('name')}: {field.get('label') or field.get('name')} ({field.get('type') or 'number'})"
            )
    lines.extend(
        [
            "",
            "## Detection Steps",
        ]
    )
    for step in path:
        if isinstance(step, dict):
            lines.append(f"- {step.get('step')}: `{step.get('formula')}`")
    lines.extend(
        [
            "",
            "## Acceptance Criteria",
        ]
    )
    for rule in rules:
        if isinstance(rule, dict):
            value = rule.get("value", rule.get("threshold"))
            lines.append(f"- {rule.get('field')} {rule.get('operator')} {value}: {rule.get('message')}")
    lines.extend(
        [
            "",
            "## System Integration",
            "- This artifact can be imported into Runtime / Registry directly.",
            "",
        ]
    )
    return "\n".join(lines).strip() + "\n"


def build_specbundle(spu: Dict[str, Any], markdown: str) -> bytes:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as zf:
        zf.writestr("spec.md", markdown)
        zf.writestr("spec.json", json.dumps(spu, ensure_ascii=False, indent=2))
        zf.writestr("README.txt", "Generated by translation-bot template flow.\n")
    return buffer.getvalue()


def build_spu_from_template(template_spu: Dict[str, Any], *, standard_code: str, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
    spu = copy.deepcopy(template_spu or {})
    meta = spu.get("meta")
    if not isinstance(meta, dict):
        meta = {}

    clause = _extract_first_clause(extracted_data) or str(meta.get("clause") or "")
    measured_item = infer_measured_item(extracted_data=extracted_data, spu=spu)
    category, work_item = infer_category_and_workitem(extracted_data=extracted_data, spu=spu)

    meta["norm"] = standard_code or str(meta.get("norm") or "")
    meta["clause"] = clause
    meta["measuredItem"] = measured_item
    meta["category"] = category
    meta["workItem"] = work_item
    meta["name"] = str(meta.get("name") or f"{work_item}-{measured_item}")
    version = str(meta.get("version") or "v1")
    meta["version"] = version
    spu["meta"] = meta

    clause_token = _slug(clause.replace(".", "_"))
    category_token = _slug(category)
    measured_token = _slug(measured_item)
    spu["spuId"] = f"generated.{category_token}.{measured_token}.{clause_token}@{version}"
    return spu


class TemplateLibrary:
    def __init__(self, runtime_dir: Path):
        self.runtime_dir = runtime_dir
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.library_path = self.runtime_dir / "template_library.json"
        self.audit_path = self.runtime_dir / "template_audit.jsonl"
        self._lock = threading.Lock()
        self._items: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        if not self.library_path.exists():
            self._items = {}
            return
        try:
            payload = json.loads(self.library_path.read_text(encoding="utf-8"))
        except Exception:
            self._items = {}
            return
        templates = payload.get("templates") if isinstance(payload, dict) else None
        if not isinstance(templates, list):
            self._items = {}
            return
        self._items = {
            str(item.get("templateId")): item
            for item in templates
            if isinstance(item, dict) and item.get("templateId")
        }

    def _persist(self) -> None:
        payload = {
            "templates": list(self._items.values()),
            "updatedAt": _utc_now(),
        }
        self.library_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def log_event(self, event: Dict[str, Any]) -> None:
        log_line = dict(event)
        if "timestamp" not in log_line:
            log_line["timestamp"] = _utc_now()
        self.audit_path.parent.mkdir(parents=True, exist_ok=True)
        with self.audit_path.open("a", encoding="utf-8") as file:
            file.write(json.dumps(log_line, ensure_ascii=False) + "\n")

    def list_templates(self) -> List[Dict[str, Any]]:
        with self._lock:
            items = [copy.deepcopy(item) for item in self._items.values()]
        return sorted(items, key=lambda item: str(item.get("approvedAt") or item.get("updatedAt") or ""), reverse=True)

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._items.get(template_id)
            return copy.deepcopy(item) if item else None

    def delete_template(self, template_id: str) -> bool:
        with self._lock:
            if template_id not in self._items:
                return False
            del self._items[template_id]
            self._persist()
        return True

    def _find_duplicate_template_id(self, template: Dict[str, Any]) -> Optional[str]:
        spu_id = str(template.get("spuId") or "")
        version = str(template.get("version") or "")
        norm = str(template.get("norm") or "")
        clause = str(template.get("clause") or "")
        measured = str(template.get("measuredItem") or "")

        for item in self._items.values():
            same_spu = str(item.get("spuId") or "") == spu_id and str(item.get("version") or "") == version
            same_semantics = (
                _normalize_text(str(item.get("norm") or "")) == _normalize_text(norm)
                and _normalize_text(str(item.get("clause") or "")) == _normalize_text(clause)
                and _normalize_text(str(item.get("measuredItem") or "")) == _normalize_text(measured)
                and str(item.get("version") or "") == version
            )
            if same_spu or same_semantics:
                return str(item.get("templateId"))
        return None

    def add_template(self, template: Dict[str, Any]) -> Dict[str, Any]:
        new_item = copy.deepcopy(template)
        with self._lock:
            duplicate_id = self._find_duplicate_template_id(new_item)
            if duplicate_id and duplicate_id in self._items:
                current = self._items[duplicate_id]
                usage_count = int(current.get("usageCount") or 0)
                current.update(new_item)
                current["templateId"] = duplicate_id
                current["usageCount"] = usage_count
                current["updatedAt"] = _utc_now()
                self._items[duplicate_id] = current
                self._persist()
                return copy.deepcopy(current)

            template_id = str(new_item.get("templateId") or "").strip()
            if not template_id:
                template_id = f"tpl_{_slug(str(new_item.get('spuId') or 'spu'))}"
            new_item["templateId"] = template_id
            new_item["usageCount"] = int(new_item.get("usageCount") or 0)
            new_item["updatedAt"] = _utc_now()
            self._items[template_id] = new_item
            self._persist()
            return copy.deepcopy(new_item)

    def increment_usage(self, template_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            item = self._items.get(template_id)
            if item is None:
                return None
            item["usageCount"] = int(item.get("usageCount") or 0) + 1
            item["updatedAt"] = _utc_now()
            self._items[template_id] = item
            self._persist()
            return copy.deepcopy(item)

    def build_template_from_spu(
        self,
        *,
        spu: Dict[str, Any],
        source_type: str,
        review_status: str,
        approved_by: str,
        approved_at: str,
    ) -> Dict[str, Any]:
        meta = spu.get("meta") if isinstance(spu.get("meta"), dict) else {}
        version = str(meta.get("version") or "v1")
        template_id = f"tpl_{_slug(str(spu.get('spuId') or 'spu'))}_{_slug(version)}"
        return {
            "templateId": template_id,
            "sourceType": source_type,
            "spuId": str(spu.get("spuId") or ""),
            "name": str(meta.get("name") or spu.get("spuId") or ""),
            "norm": str(meta.get("norm") or ""),
            "clause": str(meta.get("clause") or ""),
            "category": str(meta.get("category") or ""),
            "workItem": str(meta.get("workItem") or ""),
            "measuredItem": str(meta.get("measuredItem") or ""),
            "version": version,
            "reviewStatus": review_status,
            "approvedAt": approved_at,
            "approvedBy": approved_by,
            "usageCount": 0,
            "spu": copy.deepcopy(spu),
        }

    def find_similar_templates(self, query: Dict[str, Any]) -> List[Dict[str, Any]]:
        norm = str(query.get("norm") or query.get("standardCode") or "")
        clause = str(query.get("clause") or "")
        measured_item = str(query.get("measuredItem") or "")
        category = str(query.get("category") or "")
        work_item = str(query.get("workItem") or "")

        norm_key = _normalize_text(norm)
        clause_key = _normalize_text(clause)
        measured_key = _normalize_text(measured_item)
        category_key = _normalize_text(category)
        work_item_key = _normalize_text(work_item)

        results: List[Dict[str, Any]] = []
        with self._lock:
            templates = [copy.deepcopy(item) for item in self._items.values()]

        for template in templates:
            tmpl_norm = _normalize_text(str(template.get("norm") or ""))
            tmpl_clause = _normalize_text(str(template.get("clause") or ""))
            tmpl_measured = _normalize_text(str(template.get("measuredItem") or ""))
            tmpl_category = _normalize_text(str(template.get("category") or ""))
            tmpl_work_item = _normalize_text(str(template.get("workItem") or ""))

            reasons: List[str] = []
            score = 0.0

            if norm_key and clause_key and measured_key and tmpl_norm == norm_key and tmpl_clause == clause_key and tmpl_measured == measured_key:
                score = 0.95
                reasons = ["norm match", "clause match", "measuredItem match"]
            elif category_key and work_item_key and measured_key and tmpl_category == category_key and tmpl_work_item == work_item_key and tmpl_measured == measured_key:
                score = 0.85
                reasons = ["category match", "workItem match", "measuredItem match"]
            elif norm_key and measured_key and tmpl_norm == norm_key and tmpl_measured == measured_key:
                score = 0.80
                reasons = ["norm match", "measuredItem match"]

            if score <= 0:
                continue

            results.append(
                {
                    "templateId": template.get("templateId"),
                    "score": round(score, 4),
                    "matchReason": reasons,
                    "sourceType": template.get("sourceType"),
                    "usageCount": int(template.get("usageCount") or 0),
                    "name": template.get("name"),
                    "spuId": template.get("spuId"),
                    "norm": template.get("norm"),
                    "clause": template.get("clause"),
                    "measuredItem": template.get("measuredItem"),
                    "category": template.get("category"),
                    "workItem": template.get("workItem"),
                }
            )

        return sorted(
            results,
            key=lambda item: (float(item.get("score") or 0.0), int(item.get("usageCount") or 0)),
            reverse=True,
        )
