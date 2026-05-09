from __future__ import annotations

import json
import os
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from .models import Project


class ProjectStoreError(ValueError):
    """Raised when project store operations fail."""


class ProjectStore:
    def __init__(self, *, store_path: Path | None = None, persist_enabled: bool | None = None) -> None:
        self._projects: Dict[str, Project] = {}
        self._overrides_by_branch: Dict[str, Dict[str, Dict[str, dict]]] = {}
        self._store_path = store_path or (Path(__file__).resolve().parents[1] / "data" / "project_store.json")
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if persist_enabled is None:
            self._persist_enabled = _default_persist_enabled()
        else:
            self._persist_enabled = bool(persist_enabled)
        self._load_store()

    def clear(self) -> None:
        self._projects = {}
        self._overrides_by_branch = {}
        if self._persist_enabled and self._store_path.exists():
            self._store_path.unlink()

    def create_project(
        self,
        project_id: str,
        catalog_id: str,
        selected_specs: list[str],
        *,
        selection_source: str = "explicit_specs",
        scope_filters: dict | None = None,
    ) -> Project:
        normalized_project_id = _normalize_text(project_id, "project_id")
        normalized_catalog_id = _normalize_text(catalog_id, "catalog_id")
        normalized_selected_specs = _normalize_specs(selected_specs)
        normalized_selection_source = _normalize_selection_source(selection_source)
        normalized_scope_filters = _normalize_scope_filters(scope_filters if isinstance(scope_filters, dict) else {})

        now = datetime.now(timezone.utc)
        current = self._projects.get(normalized_project_id)
        if current is None:
            project = Project(
                project_id=normalized_project_id,
                catalog_id=normalized_catalog_id,
                selected_specs=normalized_selected_specs,
                overrides={},
                role_bindings=[],
                instrument_bindings=[],
                selection_source=normalized_selection_source,
                scope_filters=normalized_scope_filters,
                created_at=now,
            )
        else:
            # Upsert semantics: keep creation timestamp, refresh selected spec subset and catalog binding.
            project = Project(
                project_id=normalized_project_id,
                catalog_id=normalized_catalog_id,
                selected_specs=normalized_selected_specs,
                overrides=deepcopy(current.overrides),
                role_bindings=deepcopy(current.role_bindings),
                instrument_bindings=deepcopy(current.instrument_bindings),
                selection_source=normalized_selection_source,
                scope_filters=normalized_scope_filters,
                created_at=current.created_at,
            )

        self._projects[normalized_project_id] = project
        self._overrides_by_branch.setdefault(normalized_project_id, {"main": deepcopy(project.overrides)})
        self._persist_store()
        return deepcopy(project)

    def get_project(self, project_id: str) -> Project:
        normalized_project_id = _normalize_text(project_id, "project_id")
        project = self._projects.get(normalized_project_id)
        if project is None:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")
        return deepcopy(project)

    def set_override(self, project_id: str, spec_id: str, override_dict: dict, branch_id: str = "main") -> None:
        normalized_project_id = _normalize_text(project_id, "project_id")
        normalized_spec_id = _normalize_text(spec_id, "spec_id")
        normalized_branch_id = _normalize_branch_id(branch_id)
        if not isinstance(override_dict, dict):
            raise ProjectStoreError("override must be object")
        if normalized_project_id not in self._projects:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")

        project_branch_overrides = self._overrides_by_branch.setdefault(normalized_project_id, {"main": {}})
        branch_overrides = project_branch_overrides.setdefault(normalized_branch_id, {})
        branch_overrides[normalized_spec_id] = deepcopy(override_dict)

        if normalized_branch_id == "main":
            project = self._projects[normalized_project_id]
            project.overrides[normalized_spec_id] = deepcopy(override_dict)

        self._persist_store()

    def get_override(self, project_id: str, spec_id: str, branch_id: str = "main") -> dict | None:
        normalized_project_id = _normalize_text(project_id, "project_id")
        normalized_spec_id = _normalize_text(spec_id, "spec_id")
        normalized_branch_id = _normalize_branch_id(branch_id)

        branch_overrides = self._overrides_by_branch.get(normalized_project_id, {})
        if normalized_branch_id in branch_overrides:
            current = branch_overrides[normalized_branch_id].get(normalized_spec_id)
            if isinstance(current, dict):
                return deepcopy(current)

        fallback = branch_overrides.get("main", {}).get(normalized_spec_id)
        if isinstance(fallback, dict):
            return deepcopy(fallback)
        return None

    def get_all_branch_overrides(self, project_id: str) -> Dict[str, Dict[str, dict]]:
        normalized_project_id = _normalize_text(project_id, "project_id")
        items = self._overrides_by_branch.get(normalized_project_id, {})
        return deepcopy(items)

    def set_role_bindings(self, project_id: str, bindings: list[dict]) -> list[dict]:
        normalized_project_id = _normalize_text(project_id, "project_id")
        project = self._projects.get(normalized_project_id)
        if project is None:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")
        normalized = _normalize_role_bindings(bindings)
        project.role_bindings = normalized
        self._persist_store()
        return deepcopy(project.role_bindings)

    def get_role_bindings(self, project_id: str) -> list[dict]:
        normalized_project_id = _normalize_text(project_id, "project_id")
        project = self._projects.get(normalized_project_id)
        if project is None:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")
        return deepcopy(project.role_bindings)

    def set_instrument_bindings(self, project_id: str, bindings: list[dict]) -> list[dict]:
        normalized_project_id = _normalize_text(project_id, "project_id")
        project = self._projects.get(normalized_project_id)
        if project is None:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")
        normalized = _normalize_instrument_bindings(bindings)
        project.instrument_bindings = normalized
        self._persist_store()
        return deepcopy(project.instrument_bindings)

    def get_instrument_bindings(self, project_id: str) -> list[dict]:
        normalized_project_id = _normalize_text(project_id, "project_id")
        project = self._projects.get(normalized_project_id)
        if project is None:
            raise ProjectStoreError(f"project not found: {normalized_project_id}")
        return deepcopy(project.instrument_bindings)

    def _load_store(self) -> None:
        if not self._persist_enabled:
            return
        if not self._store_path.exists():
            return
        try:
            with self._store_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            raise ProjectStoreError(f"failed to load project store: {exc}") from exc
        if not isinstance(payload, dict):
            raise ProjectStoreError("invalid project store payload")

        raw_projects = payload.get("projects", {})
        if isinstance(raw_projects, dict):
            loaded_projects: Dict[str, Project] = {}
            for key, item in raw_projects.items():
                if not isinstance(key, str) or not isinstance(item, dict):
                    continue
                created_at = _parse_datetime(item.get("created_at"))
                selected_specs_raw = item.get("selected_specs", [])
                selected_specs = _normalize_specs(selected_specs_raw if isinstance(selected_specs_raw, list) else [])
                overrides_raw = item.get("overrides", {})
                overrides = deepcopy(overrides_raw) if isinstance(overrides_raw, dict) else {}
                role_bindings = _normalize_role_bindings(item.get("role_bindings", []))
                instrument_bindings = _normalize_instrument_bindings(item.get("instrument_bindings", []))
                selection_source = _normalize_selection_source(item.get("selection_source", "explicit_specs"))
                scope_filters = _normalize_scope_filters(item.get("scope_filters", {}))
                loaded_projects[key] = Project(
                    project_id=key,
                    catalog_id=str(item.get("catalog_id", "")).strip(),
                    selected_specs=selected_specs,
                    overrides=overrides,
                    role_bindings=role_bindings,
                    instrument_bindings=instrument_bindings,
                    selection_source=selection_source,
                    scope_filters=scope_filters,
                    created_at=created_at,
                )
            self._projects = loaded_projects

        raw_overrides_by_branch = payload.get("overrides_by_branch", {})
        if isinstance(raw_overrides_by_branch, dict):
            loaded_overrides: Dict[str, Dict[str, Dict[str, dict]]] = {}
            for project_id, branch_payload in raw_overrides_by_branch.items():
                if not isinstance(project_id, str) or not isinstance(branch_payload, dict):
                    continue
                branch_map: Dict[str, Dict[str, dict]] = {}
                for branch_id, spec_payload in branch_payload.items():
                    if not isinstance(branch_id, str) or not isinstance(spec_payload, dict):
                        continue
                    normalized_spec_payload: Dict[str, dict] = {}
                    for spec_id, override in spec_payload.items():
                        if not isinstance(spec_id, str) or not isinstance(override, dict):
                            continue
                        normalized_spec_payload[spec_id] = deepcopy(override)
                    branch_map[branch_id] = normalized_spec_payload
                loaded_overrides[project_id] = branch_map
            self._overrides_by_branch = loaded_overrides

        for project_id, project in self._projects.items():
            self._overrides_by_branch.setdefault(project_id, {}).setdefault("main", deepcopy(project.overrides))

    def _persist_store(self) -> None:
        if not self._persist_enabled:
            return
        projects_payload: Dict[str, Dict[str, Any]] = {}
        for project_id, project in self._projects.items():
            projects_payload[project_id] = {
                "project_id": project.project_id,
                "catalog_id": project.catalog_id,
                "selected_specs": list(project.selected_specs),
                "overrides": deepcopy(project.overrides),
                "role_bindings": deepcopy(project.role_bindings),
                "instrument_bindings": deepcopy(project.instrument_bindings),
                "selection_source": project.selection_source,
                "scope_filters": deepcopy(project.scope_filters),
                "created_at": project.created_at.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }

        payload = {
            "projects": projects_payload,
            "overrides_by_branch": deepcopy(self._overrides_by_branch),
        }
        try:
            with self._store_path.open("w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        except OSError as exc:
            raise ProjectStoreError(f"failed to persist project store: {exc}") from exc


def create_project(
    project_id: str,
    catalog_id: str,
    selected_specs: list[str],
    *,
    selection_source: str = "explicit_specs",
    scope_filters: dict | None = None,
) -> Project:
    return _default_store.create_project(
        project_id=project_id,
        catalog_id=catalog_id,
        selected_specs=selected_specs,
        selection_source=selection_source,
        scope_filters=scope_filters,
    )


def get_project(project_id: str) -> Project:
    return _default_store.get_project(project_id=project_id)


def set_override(project_id: str, spec_id: str, override_dict: dict, branch_id: str = "main") -> None:
    _default_store.set_override(
        project_id=project_id,
        spec_id=spec_id,
        override_dict=override_dict,
        branch_id=branch_id,
    )


def get_override(project_id: str, spec_id: str, branch_id: str = "main") -> dict | None:
    return _default_store.get_override(project_id=project_id, spec_id=spec_id, branch_id=branch_id)


def get_all_branch_overrides(project_id: str) -> Dict[str, Dict[str, dict]]:
    return _default_store.get_all_branch_overrides(project_id=project_id)


def set_role_bindings(project_id: str, bindings: list[dict]) -> list[dict]:
    return _default_store.set_role_bindings(project_id=project_id, bindings=bindings)


def get_role_bindings(project_id: str) -> list[dict]:
    return _default_store.get_role_bindings(project_id=project_id)


def set_instrument_bindings(project_id: str, bindings: list[dict]) -> list[dict]:
    return _default_store.set_instrument_bindings(project_id=project_id, bindings=bindings)


def get_instrument_bindings(project_id: str) -> list[dict]:
    return _default_store.get_instrument_bindings(project_id=project_id)


def clear_store() -> None:
    _default_store.clear()


def _normalize_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ProjectStoreError(f"{field_name} is required")
    return text


def _normalize_specs(values: list[Any]) -> list[str]:
    if not isinstance(values, list):
        raise ProjectStoreError("selected_specs must be list")
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        item = str(raw or "").strip()
        if not item or item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    if not normalized:
        raise ProjectStoreError("selected_specs must contain at least 1 spec")
    return normalized


def _normalize_branch_id(branch_id: Any) -> str:
    text = str(branch_id or "main").strip()
    return text or "main"


def _normalize_text_list(values: Any, *, field_name: str) -> list[str]:
    if not isinstance(values, list):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _normalize_role_bindings(values: Any) -> list[dict]:
    if not isinstance(values, list):
        return []
    normalized: list[dict] = []
    for raw in values:
        if not isinstance(raw, dict):
            continue
        did = str(raw.get("did", "")).strip()
        if not did:
            continue
        normalized.append(
            {
                "did": did,
                "measured_item_ids": _normalize_text_list(raw.get("measured_item_ids", []), field_name="measured_item_ids"),
                "spec_ids": _normalize_text_list(raw.get("spec_ids", []), field_name="spec_ids"),
                "actions": _normalize_text_list(raw.get("actions", []), field_name="actions"),
            }
        )
    return normalized


def _normalize_instrument_bindings(values: Any) -> list[dict]:
    if not isinstance(values, list):
        return []
    normalized: list[dict] = []
    for raw in values:
        if not isinstance(raw, dict):
            continue
        instrument_id = str(raw.get("instrument_id", "")).strip()
        if not instrument_id:
            continue
        start_stake = str(raw.get("start_stake", "")).strip() or None
        end_stake = str(raw.get("end_stake", "")).strip() or None
        valid_from = str(raw.get("valid_from", "")).strip() or None
        valid_to = str(raw.get("valid_to", "")).strip() or None
        normalized.append(
            {
                "instrument_id": instrument_id,
                "measured_item_ids": _normalize_text_list(raw.get("measured_item_ids", []), field_name="measured_item_ids"),
                "spec_ids": _normalize_text_list(raw.get("spec_ids", []), field_name="spec_ids"),
                "start_stake": start_stake,
                "end_stake": end_stake,
                "valid_from": valid_from,
                "valid_to": valid_to,
            }
        )
    return normalized


def _normalize_selection_source(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "explicit_specs"
    return text


def _normalize_scope_filters(raw: Any) -> dict:
    if not isinstance(raw, dict):
        return {}
    return {
        "include_categories": _normalize_text_list(raw.get("include_categories", []), field_name="include_categories"),
        "include_work_items": _normalize_text_list(raw.get("include_work_items", []), field_name="include_work_items"),
        "exclude_categories": _normalize_text_list(raw.get("exclude_categories", []), field_name="exclude_categories"),
        "exclude_work_items": _normalize_text_list(raw.get("exclude_work_items", []), field_name="exclude_work_items"),
    }


def _parse_datetime(raw: Any) -> datetime:
    if isinstance(raw, str) and raw.strip():
        text = raw.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(text)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _default_persist_enabled() -> bool:
    raw = str(os.getenv("LAYERPEG_PROJECT_PERSIST", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" not in sys.modules


_default_store = ProjectStore()
