from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple
from uuid import uuid4

import jsonschema


class PatchAnalysisError(ValueError):
    """Raised when patch/override payload or affected-records analysis fails."""


class PatchAnalysisService:
    """Analyze affected records for standard patch and project override payloads."""

    def __init__(
        self,
        patch_schema_path: Path | None = None,
        override_schema_path: Path | None = None,
    ) -> None:
        base_dir = Path(__file__).resolve().parents[1] / "schemas"
        self.patch_schema_path = patch_schema_path or (base_dir / "patch.schema.json")
        self.override_schema_path = override_schema_path or (base_dir / "override.schema.json")
        self.patch_schema = self._load_schema(self.patch_schema_path)
        self.override_schema = self._load_schema(self.override_schema_path)

    def analyze(self, patch: Dict[str, Any], records: List[Dict[str, Any]]) -> Dict[str, Any]:
        kind = self._detect_kind(patch)
        self._validate_change_payload(kind=kind, payload=patch)

        if not isinstance(records, list):
            raise PatchAnalysisError("records must be a list")

        affected: list[Dict[str, Any]] = []
        unaffected: list[Dict[str, Any]] = []

        for record in records:
            if not isinstance(record, dict):
                continue
            if self._is_affected(record, patch, kind):
                affected.append(record)
            else:
                unaffected.append(record)

        requires_ack = len(affected) > 0
        notifications = self._build_notifications(change=patch, affected=affected, requires_ack=requires_ack, kind=kind)

        return {
            "change_type": kind,
            "update_target": str(patch.get("target", "")),
            "old_value": self._resolve_old_value(patch, kind),
            "new_value": self._resolve_new_value(patch, kind),
            "effective_date": str(patch.get("effective_date", "")),
            "affected_records": affected,
            "unaffected_records": unaffected,
            "notifications": notifications,
            "requires_ack": requires_ack,
        }

    @staticmethod
    def _detect_kind(payload: Dict[str, Any]) -> str:
        if not isinstance(payload, dict):
            raise PatchAnalysisError("patch must be an object")
        if "override_id" in payload:
            return "override"
        return "patch"

    def _validate_change_payload(self, kind: str, payload: Dict[str, Any]) -> None:
        schema = self.override_schema if kind == "override" else self.patch_schema
        try:
            jsonschema.validate(instance=payload, schema=schema)
        except jsonschema.ValidationError as exc:
            raise PatchAnalysisError(f"{kind} schema validation failed: {exc.message}") from exc

    def _is_affected(self, record: Dict[str, Any], change: Dict[str, Any], kind: str) -> bool:
        if record.get("component_id") != change.get("component_id"):
            return False

        if kind == "override":
            if record.get("project_id") != change.get("project_id"):
                return False
            target = str(change.get("target", ""))
            new_value = change.get("value")
            record_value, exists = _get_dotted(record, target)
            if exists:
                return record_value != new_value
            table_name, lookup_key = _parse_lookup_target(target)
            if table_name and lookup_key:
                return self._is_lookup_target_affected(record, table_name, lookup_key, new_value)
            return True

        patch_project = change.get("project_id")
        if patch_project is not None and patch_project != record.get("project_id"):
            return False

        target = str(change.get("target", ""))
        old_value = change.get("old_value")
        record_value, exists = _get_dotted(record, target)
        if exists:
            return record_value == old_value

        table_name, lookup_key = _parse_lookup_target(target)
        if table_name and lookup_key:
            return self._is_lookup_target_affected(record, table_name, lookup_key, old_value)

        return False

    @staticmethod
    def _is_lookup_target_affected(record: Dict[str, Any], table_name: str, lookup_key: str, expected_value: Any) -> bool:
        path_outputs = record.get("path_outputs")
        if not isinstance(path_outputs, dict):
            return False

        source_field = _guess_source_field(table_name, path_outputs)
        if source_field and str(path_outputs.get(source_field)) == lookup_key:
            return True

        return str(path_outputs.get("standard_value")) == str(expected_value)

    def _build_notifications(
        self,
        change: Dict[str, Any],
        affected: List[Dict[str, Any]],
        requires_ack: bool,
        kind: str,
    ) -> List[Dict[str, Any]]:
        notifications: list[Dict[str, Any]] = []
        for record in affected:
            record_id = str(record.get("record_id", f"record-{uuid4().hex[:8]}"))
            project_id = str(record.get("project_id", "UNKNOWN"))
            change_id = str(change.get("patch_id") or change.get("override_id") or "unknown")
            message = (
                f"[{kind}] record={record_id} target={change.get('target')} "
                f"old={self._resolve_old_value(change, kind)} new={self._resolve_new_value(change, kind)}"
            )
            notifications.append(
                {
                    "notification_id": f"notif_{uuid4().hex[:16]}",
                    "change_id": change_id,
                    "record_id": record_id,
                    "project_id": project_id,
                    "message": message,
                    "requires_ack": requires_ack,
                    "ack_status": "PENDING" if requires_ack else "NOT_REQUIRED",
                }
            )
        return notifications

    @staticmethod
    def _resolve_old_value(change: Dict[str, Any], kind: str) -> Any:
        if kind == "override":
            return change.get("old_value")
        return change.get("old_value")

    @staticmethod
    def _resolve_new_value(change: Dict[str, Any], kind: str) -> Any:
        if kind == "override":
            return change.get("value")
        return change.get("new_value")

    @staticmethod
    def _load_schema(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise PatchAnalysisError("schema must be an object")
        return payload


def _parse_lookup_target(target: str) -> Tuple[str, str]:
    marker = "path.lookup_tables."
    if not target.startswith(marker):
        return "", ""
    rest = target[len(marker) :]
    parts = rest.split(".")
    if len(parts) < 2:
        return "", ""
    return parts[0], parts[1]


def _guess_source_field(table_name: str, path_outputs: Dict[str, Any]) -> str:
    if "_by_" not in table_name:
        return ""
    suffix = table_name.split("_by_", 1)[1]
    candidates = [suffix, f"{suffix}_type", f"{suffix}_key"]
    for candidate in candidates:
        if candidate in path_outputs:
            return candidate
    return ""


def _get_dotted(payload: Dict[str, Any], dotted_path: str) -> tuple[Any, bool]:
    cursor: Any = payload
    for segment in dotted_path.split("."):
        if isinstance(cursor, dict) and segment in cursor:
            cursor = cursor[segment]
        else:
            return None, False
    return cursor, True
