from __future__ import annotations

import copy
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List

from ..core import ComponentNotFoundError, ComponentRegistry


class ComponentRegistryServiceError(ValueError):
    """Raised when component registry operations fail."""


class ComponentVersionNotFoundError(LookupError):
    """Raised when a component version cannot be found."""


class ComponentRegistryService:
    """Registry service layered on top of local file-based component storage."""

    def __init__(self, registry: ComponentRegistry | None = None) -> None:
        self.registry = registry or ComponentRegistry()

    def register_component(
        self,
        *,
        catalog_id: str,
        component_id: str,
        component_name: str,
        version: str,
        definition: Dict[str, Any],
    ) -> Dict[str, Any]:
        catalog_id_value = _non_empty_text(catalog_id, "catalog_id")
        component_id_value = _non_empty_text(component_id, "component_id")
        component_name_value = _non_empty_text(component_name, "component_name")
        version_value = _non_empty_text(version, "version")
        if not isinstance(definition, dict):
            raise ComponentRegistryServiceError("definition must be an object")

        payload = copy.deepcopy(definition)
        payload["catalog_id"] = catalog_id_value
        payload["component_id"] = component_id_value
        payload["component_name"] = component_name_value
        payload["version"] = version_value

        self.registry.validate_component_payload(payload, source_label=f"{component_id_value}@{version_value}")

        target_path = self._resolve_storage_path(component_id=component_id_value, version=version_value)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with target_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
            f.write("\n")

        return {
            "component_id": component_id_value,
            "component_name": component_name_value,
            "catalog_id": catalog_id_value,
            "version": version_value,
            "status": str(payload.get("status", "")).strip(),
            "registered_file": target_path.name,
            "definition": payload,
        }

    def list_components(
        self,
        *,
        catalog_id: str | None = None,
        tag: str | None = None,
        status: str | None = None,
    ) -> List[Dict[str, Any]]:
        latest_by_id: Dict[str, Dict[str, Any]] = {}
        for entry in self.registry.list_component_entries():
            component_id = str(entry.get("component_id", "")).strip()
            if not component_id:
                continue
            cached = latest_by_id.get(component_id)
            if cached is None or entry["__version_key"] > cached["__version_key"]:
                latest_by_id[component_id] = entry

        catalog_filter = str(catalog_id or "").strip()
        tag_filter = str(tag or "").strip().lower()
        status_filter = str(status or "").strip().lower()

        items: List[Dict[str, Any]] = []
        for component_id in sorted(latest_by_id.keys()):
            payload = latest_by_id[component_id]
            summary = _to_component_summary(payload)

            if catalog_filter and summary["catalog_id"] != catalog_filter:
                continue
            if status_filter and summary["status"].lower() != status_filter:
                continue
            if tag_filter:
                tags = [item.lower() for item in summary["tags"]]
                if tag_filter not in tags:
                    continue
            items.append(summary)
        return items

    def get_latest_component(self, component_id: str) -> Dict[str, Any]:
        target = _non_empty_text(component_id, "component_id")
        try:
            return self.registry.get_component(target)
        except ComponentNotFoundError as exc:
            raise ComponentVersionNotFoundError(str(exc)) from exc

    def get_component_versions(self, component_id: str) -> List[Dict[str, Any]]:
        target = _non_empty_text(component_id, "component_id")
        try:
            versions = self.registry.get_component_versions(target)
        except ComponentNotFoundError as exc:
            raise ComponentVersionNotFoundError(str(exc)) from exc
        if not versions:
            raise ComponentVersionNotFoundError(f"component not found: {target}")
        return versions

    def _resolve_storage_path(self, *, component_id: str, version: str) -> Path:
        for entry in self.registry.list_component_entries():
            if str(entry.get("component_id", "")).strip() != component_id:
                continue
            if str(entry.get("version", "")).strip() != version:
                continue
            source_file = entry.get("__source_file")
            if isinstance(source_file, str) and source_file.strip():
                candidate = Path(source_file)
                if candidate.exists():
                    return candidate

        filename = _build_filename(component_id=component_id, version=version)
        candidate = self.registry.base_dir / filename
        if not candidate.exists():
            return candidate

        digest = hashlib.sha256(f"{component_id}@{version}".encode("utf-8")).hexdigest()[:8]
        return self.registry.base_dir / f"{candidate.stem}-{digest}{candidate.suffix}"


def _non_empty_text(raw: str, field_name: str) -> str:
    text = str(raw or "").strip()
    if not text:
        raise ComponentRegistryServiceError(f"{field_name} is required")
    return text


def _slugify(raw: str) -> str:
    cleaned = re.sub(r"[^0-9A-Za-z._-]+", "_", raw).strip("._")
    return cleaned or "component"


def _build_filename(*, component_id: str, version: str) -> str:
    return f"{_slugify(component_id)}__{_slugify(version)}.component.json"


def _extract_tags(payload: Dict[str, Any]) -> List[str]:
    values: List[str] = []
    for source in (payload, payload.get("metadata", {})):
        if not isinstance(source, dict):
            continue
        raw_tags = source.get("tags")
        if isinstance(raw_tags, list):
            for item in raw_tags:
                if isinstance(item, str) and item.strip():
                    values.append(item.strip())
        elif isinstance(raw_tags, str) and raw_tags.strip():
            values.append(raw_tags.strip())
    deduped: List[str] = []
    for item in values:
        if item not in deduped:
            deduped.append(item)
    return deduped


def _to_component_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    component_id = str(payload.get("component_id", "")).strip()
    component_name = str(payload.get("component_name", "")).strip() or component_id
    source_type = str(payload.get("source_type", "")).strip().lower() or "builtin"
    if source_type not in {"builtin", "specir"}:
        source_type = "builtin"
    source_file = str(payload.get("source_file", payload.get("__source_file", ""))).strip()
    spec_id_raw = payload.get("spec_id")
    spec_id = str(spec_id_raw).strip() if isinstance(spec_id_raw, str) and str(spec_id_raw).strip() else None
    return {
        "component_id": component_id,
        "component_name": component_name,
        "catalog_id": str(payload.get("catalog_id", "")).strip(),
        "version": str(payload.get("version", "")).strip(),
        "status": str(payload.get("status", "")).strip(),
        "tags": _extract_tags(payload),
        "source_type": source_type,
        "source_file": source_file,
        "spec_id": spec_id,
    }
