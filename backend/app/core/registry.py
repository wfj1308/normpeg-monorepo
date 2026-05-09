from __future__ import annotations

import copy
import json
from pathlib import Path
import re
from typing import Any, Dict, List

import jsonschema


class ComponentNotFoundError(FileNotFoundError):
    """Raised when a component instance cannot be located."""


class ComponentSchemaError(ValueError):
    """Raised when a component instance violates component schema."""


class ComponentRegistry:
    """File-based component registry for local development."""

    def __init__(self, base_dir: Path | None = None, schema_path: Path | None = None) -> None:
        self.base_dir = base_dir or Path(__file__).resolve().parents[1] / "components" / "instances"
        self.schema_path = schema_path or Path(__file__).resolve().parents[1] / "schemas" / "component.schema.json"
        self.component_schema = self._load_schema(self.schema_path)
        self._runtime_components: Dict[tuple[str, str], Dict[str, Any]] = {}

    def get_component(self, component_id: str) -> Dict[str, Any]:
        versions = self.get_component_versions(component_id)
        if not versions:
            raise ComponentNotFoundError(f"component not found: {component_id}")
        return versions[0]

    def list_components(self) -> List[Dict[str, Any]]:
        latest_by_id: Dict[str, Dict[str, Any]] = {}
        for entry in self.list_component_entries():
            component_id = str(entry.get("component_id", "")).strip()
            if not component_id:
                continue
            cached = latest_by_id.get(component_id)
            if cached is None or entry["__version_key"] > cached["__version_key"]:
                latest_by_id[component_id] = entry

        items: List[Dict[str, Any]] = []
        for component_id in sorted(latest_by_id.keys()):
            payload = latest_by_id[component_id]
            component_name = str(payload.get("component_name", "")).strip() or component_id
            items.append(
                {
                    "component_id": component_id,
                    "component_name": component_name,
                    "source_type": str(payload.get("source_type", "builtin")),
                    "source_file": str(payload.get("source_file", payload.get("__source_file", ""))),
                    "spec_id": payload.get("spec_id"),
                }
            )
        return items

    def get_component_versions(self, component_id: str) -> List[Dict[str, Any]]:
        target = str(component_id or "").strip()
        if not target:
            raise ComponentNotFoundError("component_id is required")

        matched: List[Dict[str, Any]] = []
        for entry in self.list_component_entries():
            if str(entry.get("component_id", "")).strip() == target:
                matched.append(entry)

        matched.sort(key=lambda item: item["__version_key"], reverse=True)
        return [self._strip_internal(item) for item in matched]

    def list_component_entries(self) -> List[Dict[str, Any]]:
        entries_by_key: Dict[tuple[str, str], Dict[str, Any]] = {}
        for file_path in sorted(self.base_dir.glob("*.json")):
            payload = self._read_json(file_path)
            self._validate_component(payload, file_path)
            component_id = str(payload.get("component_id", "")).strip()
            version = str(payload.get("version", "")).strip()
            if not component_id:
                continue
            entry = copy.deepcopy(payload)
            entry["__source_file"] = str(file_path)
            entry["__source_type"] = "file"
            entry["source_type"] = "builtin"
            entry["source_file"] = str(file_path)
            entry["spec_id"] = None
            entry["__version_key"] = _version_key(str(payload.get("version", "")))
            entries_by_key[(component_id, version)] = entry

        for key, runtime_payload in self._runtime_components.items():
            component_id, version = key
            entry = copy.deepcopy(runtime_payload)
            entry["__source_file"] = str(entry.get("__source_file", f"runtime://{component_id}@{version}"))
            entry["__source_type"] = "runtime"
            source_type = str(entry.get("source_type", "")).strip().lower() or "builtin"
            if source_type not in {"builtin", "specir"}:
                source_type = "builtin"
            entry["source_type"] = source_type
            if not isinstance(entry.get("source_file"), str) or not str(entry.get("source_file")).strip():
                entry["source_file"] = str(entry.get("__source_file", ""))
            if "spec_id" not in entry:
                entry["spec_id"] = None
            entry["__version_key"] = _version_key(version)
            entries_by_key[(component_id, version)] = entry

        return [entries_by_key[key] for key in sorted(entries_by_key.keys())]

    def register_runtime_component(self, payload: Dict[str, Any], *, source_label: str = "runtime") -> None:
        if not isinstance(payload, dict):
            raise ComponentSchemaError("runtime component payload must be an object")
        self.validate_component_payload(payload, source_label=source_label)

        component_id = str(payload.get("component_id", "")).strip()
        version = str(payload.get("version", "")).strip()
        if not component_id or not version:
            raise ComponentSchemaError("runtime component must include component_id and version")

        item = copy.deepcopy(payload)
        source_file = f"runtime://{source_label}/{component_id}@{version}"
        source_type, spec_id = self._infer_runtime_source(payload=item, source_label=source_label)
        item["__source_file"] = source_file
        item["source_type"] = source_type
        item["source_file"] = source_file
        item["spec_id"] = spec_id
        self._runtime_components[(component_id, version)] = item

    def clear_runtime_components(self) -> None:
        self._runtime_components.clear()

    @staticmethod
    def _infer_runtime_source(payload: Dict[str, Any], source_label: str) -> tuple[str, str | None]:
        metadata = payload.get("metadata", {})
        spec_id: str | None = None
        if isinstance(metadata, dict):
            raw_spec_id = metadata.get("specir_spec_id")
            if isinstance(raw_spec_id, str) and raw_spec_id.strip():
                spec_id = raw_spec_id.strip()
        label = str(source_label or "").strip().lower()
        if label.startswith("specir:"):
            maybe = source_label.split(":", 1)[1].strip()
            if maybe and not spec_id:
                spec_id = maybe
            return "specir", spec_id
        if spec_id:
            return "specir", spec_id
        return "builtin", None

    def validate_component_payload(self, payload: Dict[str, Any], source_label: str = "runtime payload") -> None:
        try:
            jsonschema.validate(instance=payload, schema=self.component_schema)
        except jsonschema.ValidationError as exc:
            raise ComponentSchemaError(f"invalid component at {source_label}: {exc.message}") from exc

    @staticmethod
    def _read_json(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError(f"component file must be object: {path}")
        return payload

    @staticmethod
    def _load_schema(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ComponentSchemaError("component schema must be an object")
        return payload

    def _validate_component(self, payload: Dict[str, Any], file_path: Path) -> None:
        try:
            jsonschema.validate(instance=payload, schema=self.component_schema)
        except jsonschema.ValidationError as exc:
            raise ComponentSchemaError(f"invalid component at {file_path.name}: {exc.message}") from exc

    @staticmethod
    def _strip_internal(payload: Dict[str, Any]) -> Dict[str, Any]:
        clean: Dict[str, Any] = {}
        for key, value in payload.items():
            if isinstance(key, str) and key.startswith("__"):
                continue
            clean[key] = copy.deepcopy(value)
        return clean


def _version_key(raw_version: str) -> tuple[Any, ...]:
    text = str(raw_version or "").strip().lower()
    numbers = tuple(int(item) for item in re.findall(r"\d+", text)) or (0,)

    stage = 0
    if "snapshot" in text:
        stage = -4
    elif "alpha" in text:
        stage = -3
    elif "beta" in text:
        stage = -2
    elif "rc" in text:
        stage = -1

    return numbers, stage, text
