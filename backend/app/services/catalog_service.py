from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import jsonschema


class CatalogNotFoundError(FileNotFoundError):
    """Raised when catalog file cannot be found."""


class WorkItemNotFoundError(LookupError):
    """Raised when work-item is not defined in catalog."""


class CatalogSchemaError(ValueError):
    """Raised when catalog payload violates schema."""


class CatalogService:
    """Load and query catalog/work-item definitions."""

    def __init__(self, base_dir: Path | None = None, schema_path: Path | None = None) -> None:
        self.base_dir = base_dir or Path(__file__).resolve().parents[1] / "catalogs"
        self.schema_path = schema_path or Path(__file__).resolve().parents[1] / "schemas" / "catalog.schema.json"
        self.schema = self._load_schema(self.schema_path)

    def list_catalogs(self) -> List[Dict[str, str]]:
        items: List[Dict[str, str]] = []
        for path in sorted(self.base_dir.glob("*.json")):
            payload = self._read_catalog(path)
            items.append(
                {
                    "catalog_id": str(payload["catalog_id"]),
                    "catalog_name": str(payload.get("catalog_name", payload["catalog_id"])),
                    "standard_id": str(payload["standard_id"]),
                    "standard_version": str(payload["standard_version"]),
                    "version": str(payload["version"]),
                    "status": str(payload["status"]),
                }
            )
        return items

    def get_catalog(self, catalog_id: str) -> Dict[str, Any]:
        for path in sorted(self.base_dir.glob("*.json")):
            payload = self._read_catalog(path)
            if payload.get("catalog_id") == catalog_id:
                return payload
        raise CatalogNotFoundError(f"catalog not found: {catalog_id}")

    def get_catalog_components(self, catalog_id: str) -> List[Dict[str, Any]]:
        catalog = self.get_catalog(catalog_id)
        components = catalog.get("components", [])
        if isinstance(components, list) and components:
            normalized: list[Dict[str, Any]] = []
            for item in components:
                if isinstance(item, dict) and isinstance(item.get("component_id"), str):
                    normalized.append(item)
            if normalized:
                return normalized
        return self._derive_components_from_categories(catalog)

    def get_work_item(self, catalog_id: str, work_item_id: str) -> Dict[str, Any]:
        catalog = self.get_catalog(catalog_id)
        categories = catalog.get("categories", [])
        if not isinstance(categories, list):
            raise CatalogSchemaError("catalog.categories must be a list")

        for category in categories:
            if not isinstance(category, dict):
                continue
            work_items = category.get("work_items", [])
            if not isinstance(work_items, list):
                continue
            for item in work_items:
                if isinstance(item, dict) and item.get("work_item_id") == work_item_id:
                    return item

        raise WorkItemNotFoundError(f"work_item not found: {work_item_id}")

    def _derive_components_from_categories(self, catalog: Dict[str, Any]) -> List[Dict[str, Any]]:
        categories = catalog.get("categories", [])
        if not isinstance(categories, list):
            return []

        collected: list[Dict[str, Any]] = []
        seen: set[str] = set()

        for category in categories:
            if not isinstance(category, dict):
                continue
            work_items = category.get("work_items", [])
            if not isinstance(work_items, list):
                continue
            for work_item in work_items:
                if not isinstance(work_item, dict):
                    continue
                component_ids = work_item.get("component_ids", [])
                if not isinstance(component_ids, list):
                    continue
                for component_id in component_ids:
                    if not isinstance(component_id, str):
                        continue
                    if component_id in seen:
                        continue
                    seen.add(component_id)
                    collected.append({"component_id": component_id})

        return collected

    def _read_catalog(self, path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise CatalogSchemaError(f"catalog file must be object: {path.name}")
        try:
            jsonschema.validate(instance=payload, schema=self.schema)
        except jsonschema.ValidationError as exc:
            raise CatalogSchemaError(f"invalid catalog {path.name}: {exc.message}") from exc
        return payload

    @staticmethod
    def _load_schema(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise CatalogSchemaError("catalog schema must be an object")
        return payload

