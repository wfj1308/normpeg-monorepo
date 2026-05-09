from __future__ import annotations

import copy
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import jsonschema


class ComponentConfigResolveError(ValueError):
    """Raised when patch/override config resolution fails."""


class ComponentConfigResolver:
    """Resolve component runtime config by applying patch then project override."""

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

    def resolve(self, component: Dict[str, Any], input_payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(component, dict):
            raise ComponentConfigResolveError("component must be object")
        if not isinstance(input_payload, dict):
            raise ComponentConfigResolveError("input_payload must be object")

        merged = copy.deepcopy(component)
        component_id = str(merged.get("component_id", "")).strip()
        if not component_id:
            raise ComponentConfigResolveError("component.component_id is required")

        effective_on = self._resolve_effective_date(input_payload)
        project_id = input_payload.get("project_id")
        project_id_str = str(project_id) if isinstance(project_id, str) else ""

        patches = self._collect_items(
            from_component=merged.get("patches"),
            from_input=input_payload.get("patches"),
            item_name="patches",
        )
        overrides = self._collect_items(
            from_component=merged.get("overrides"),
            from_input=input_payload.get("overrides"),
            item_name="overrides",
        )

        trace: List[Dict[str, Any]] = []

        for patch in sorted(patches, key=self._sort_key):
            self._validate_patch(patch)
            if str(patch.get("component_id")) != component_id:
                continue
            if not self._is_effective(str(patch.get("effective_date")), effective_on):
                continue
            self._apply_patch(merged, patch)
            trace.append(
                {
                    "stage": "patch",
                    "id": patch.get("patch_id"),
                    "target": patch.get("target"),
                    "operation": patch.get("operation"),
                    "effective_date": patch.get("effective_date"),
                }
            )

        for override in sorted(overrides, key=self._sort_key):
            self._validate_override(override)
            if str(override.get("component_id")) != component_id:
                continue
            if project_id_str and str(override.get("project_id")) != project_id_str:
                continue
            if not self._is_effective(str(override.get("effective_date")), effective_on):
                continue
            self._apply_override(merged, override)
            trace.append(
                {
                    "stage": "override",
                    "id": override.get("override_id"),
                    "target": override.get("target"),
                    "operation": "replace",
                    "effective_date": override.get("effective_date"),
                    "project_id": override.get("project_id"),
                }
            )

        return {"component": merged, "trace": trace}

    @staticmethod
    def _collect_items(from_component: Any, from_input: Any, item_name: str) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for raw in [from_component, from_input]:
            if raw is None:
                continue
            if not isinstance(raw, list):
                raise ComponentConfigResolveError(f"{item_name} must be array")
            for entry in raw:
                if not isinstance(entry, dict):
                    raise ComponentConfigResolveError(f"{item_name} entries must be objects")
                items.append(copy.deepcopy(entry))
        return items

    @staticmethod
    def _sort_key(item: Dict[str, Any]) -> tuple[str, str]:
        return (str(item.get("effective_date", "")), str(item.get("patch_id") or item.get("override_id") or ""))

    @staticmethod
    def _load_schema(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ComponentConfigResolveError(f"schema must be object: {path.name}")
        return payload

    def _validate_patch(self, patch: Dict[str, Any]) -> None:
        try:
            jsonschema.validate(instance=patch, schema=self.patch_schema)
        except jsonschema.ValidationError as exc:
            raise ComponentConfigResolveError(f"invalid patch: {exc.message}") from exc

    def _validate_override(self, override: Dict[str, Any]) -> None:
        try:
            jsonschema.validate(instance=override, schema=self.override_schema)
        except jsonschema.ValidationError as exc:
            raise ComponentConfigResolveError(f"invalid override: {exc.message}") from exc

    @staticmethod
    def _resolve_effective_date(input_payload: Dict[str, Any]) -> date:
        inspected_at = input_payload.get("inspected_at")
        if isinstance(inspected_at, str) and inspected_at.strip():
            dt = _parse_datetime(inspected_at.strip())
            return dt.date()
        return datetime.now(timezone.utc).date()

    @staticmethod
    def _is_effective(effective_date_raw: str, effective_on: date) -> bool:
        try:
            effective_date = date.fromisoformat(effective_date_raw)
        except ValueError as exc:
            raise ComponentConfigResolveError(f"invalid effective_date: {effective_date_raw}") from exc
        return effective_date <= effective_on

    def _apply_patch(self, component: Dict[str, Any], patch: Dict[str, Any]) -> None:
        target = str(patch["target"])
        operation = str(patch["operation"])
        old_value = patch.get("old_value")
        new_value = patch.get("new_value")

        parent, key, exists = self._resolve_parent_and_key(component, target, create_missing=operation in {"add", "replace"})

        if operation == "replace":
            if exists and self._get_container_value(parent, key) != old_value:
                raise ComponentConfigResolveError(
                    f"patch old_value mismatch at {target}, expected {old_value}, got {self._get_container_value(parent, key)}"
                )
            self._set_container_value(parent, key, copy.deepcopy(new_value))
            return

        if operation == "add":
            self._set_container_value(parent, key, copy.deepcopy(new_value))
            return

        if operation == "remove":
            if not exists:
                raise ComponentConfigResolveError(f"patch remove target not found: {target}")
            if isinstance(parent, dict):
                parent.pop(str(key), None)
            elif isinstance(parent, list):
                if not isinstance(key, int):
                    raise ComponentConfigResolveError(f"patch remove list index must be integer at {target}")
                parent.pop(key)
            else:
                raise ComponentConfigResolveError(f"patch remove target parent must be object/array at {target}")
            return

        raise ComponentConfigResolveError(f"unsupported patch operation: {operation}")

    def _apply_override(self, component: Dict[str, Any], override: Dict[str, Any]) -> None:
        target = str(override["target"])
        value = override.get("value")
        parent, key, _ = self._resolve_parent_and_key(component, target, create_missing=True)
        self._set_container_value(parent, key, copy.deepcopy(value))

    @staticmethod
    def _resolve_parent_and_key(
        payload: Dict[str, Any],
        dotted_path: str,
        create_missing: bool,
    ) -> tuple[Any, Any, bool]:
        parts = [part for part in dotted_path.split(".") if part]
        if not parts:
            raise ComponentConfigResolveError("target path cannot be empty")

        cursor: Any = payload
        for index, segment in enumerate(parts[:-1]):
            next_segment = parts[index + 1]
            expect_list = ComponentConfigResolver._is_int_segment(next_segment)

            if isinstance(cursor, dict):
                current = cursor.get(segment)
                if current is None:
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=False)
                        return cursor, terminal, False
                    current = [] if expect_list else {}
                    cursor[segment] = current
                elif expect_list and not isinstance(current, list):
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=False)
                        return cursor, terminal, False
                    current = []
                    cursor[segment] = current
                elif not expect_list and not isinstance(current, dict):
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=False)
                        return cursor, terminal, False
                    current = {}
                    cursor[segment] = current
                cursor = current
                continue

            if isinstance(cursor, list):
                if not ComponentConfigResolver._is_int_segment(segment):
                    raise ComponentConfigResolveError(f"array path segment must be integer index: {segment}")
                list_index = int(segment)
                if list_index < 0:
                    raise ComponentConfigResolveError(f"array index must be non-negative: {segment}")

                if list_index >= len(cursor):
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=True)
                        return cursor, terminal, False
                    while len(cursor) <= list_index:
                        cursor.append([] if expect_list else {})

                current = cursor[list_index]
                if expect_list and not isinstance(current, list):
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=True)
                        return cursor, terminal, False
                    current = []
                    cursor[list_index] = current
                elif not expect_list and not isinstance(current, dict):
                    if not create_missing:
                        terminal = ComponentConfigResolver._parse_terminal_key(parts[-1], parent_is_list=True)
                        return cursor, terminal, False
                    current = {}
                    cursor[list_index] = current
                cursor = current
                continue

            raise ComponentConfigResolveError(f"target path parent must be object/array at segment: {segment}")

        key = parts[-1]
        if isinstance(cursor, dict):
            return cursor, key, key in cursor
        if isinstance(cursor, list):
            if not ComponentConfigResolver._is_int_segment(key):
                raise ComponentConfigResolveError(f"array terminal segment must be integer index: {key}")
            list_index = int(key)
            if list_index < 0:
                raise ComponentConfigResolveError(f"array index must be non-negative: {key}")
            exists = list_index < len(cursor)
            if create_missing and not exists:
                while len(cursor) <= list_index:
                    cursor.append(None)
            return cursor, list_index, exists
        raise ComponentConfigResolveError(f"target path terminal parent must be object/array: {dotted_path}")

    @staticmethod
    def _is_int_segment(segment: str) -> bool:
        return segment.isdigit()

    @staticmethod
    def _parse_terminal_key(segment: str, *, parent_is_list: bool) -> Any:
        if not parent_is_list:
            return segment
        if not ComponentConfigResolver._is_int_segment(segment):
            raise ComponentConfigResolveError(f"array terminal segment must be integer index: {segment}")
        value = int(segment)
        if value < 0:
            raise ComponentConfigResolveError(f"array index must be non-negative: {segment}")
        return value

    @staticmethod
    def _get_container_value(parent: Any, key: Any) -> Any:
        if isinstance(parent, dict):
            return parent.get(str(key))
        if isinstance(parent, list):
            if not isinstance(key, int):
                raise ComponentConfigResolveError(f"list key must be integer, got: {key}")
            if 0 <= key < len(parent):
                return parent[key]
            return None
        raise ComponentConfigResolveError("target parent must be object/array")

    @staticmethod
    def _set_container_value(parent: Any, key: Any, value: Any) -> None:
        if isinstance(parent, dict):
            parent[str(key)] = value
            return
        if isinstance(parent, list):
            if not isinstance(key, int):
                raise ComponentConfigResolveError(f"list key must be integer, got: {key}")
            if key < 0:
                raise ComponentConfigResolveError(f"list key must be non-negative, got: {key}")
            while len(parent) <= key:
                parent.append(None)
            parent[key] = value
            return
        raise ComponentConfigResolveError("target parent must be object/array")


def _parse_datetime(raw: str) -> datetime:
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError as exc:
        raise ComponentConfigResolveError(f"invalid inspected_at datetime: {raw}") from exc
