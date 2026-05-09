from __future__ import annotations

import json
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

import jsonschema
import yaml

from .models import SpecIRDocument, SpecIRRegistryEntry


class SpecIRLoaderError(ValueError):
    """Raised when SpecIR loading/parsing fails."""


def load_spec(file_path: str | Path) -> SpecIRDocument:
    path = Path(file_path).resolve()
    if not path.exists() or not path.is_file():
        raise SpecIRLoaderError(f"spec file not found: {path}")

    with path.open("r", encoding="utf-8-sig") as f:
        payload = yaml.safe_load(f)

    if not isinstance(payload, dict):
        raise SpecIRLoaderError(f"spec YAML must be object: {path}")

    _validate_spec_schema(payload, path)
    warning_messages = _warn_extra_top_level_fields(payload, path)

    semantics = _as_object(payload.get("semantics"), "semantics", path)
    logic = _as_object(payload.get("logic"), "logic", path)
    inputs = _as_object(payload.get("inputs"), "inputs", path)
    path_block = _as_object(payload.get("path"), "path", path)
    gate = _as_object(payload.get("gate"), "gate", path)
    state = _as_object(payload.get("state"), "state", path)
    proof = _as_object(payload.get("proof"), "proof", path)
    metadata = _as_object(payload.get("metadata"), "metadata", path)
    spec_id = _required_text(payload.get("spec_id"), "spec_id", path)
    spec_type = _required_text(payload.get("type"), "type", path)
    version = _required_text(payload.get("version"), "version", path)
    namespace = _required_text(payload.get("namespace"), "namespace", path)

    return SpecIRDocument(
        spec_id=spec_id,
        spec_type=spec_type,
        version=version,
        namespace=namespace,
        semantics=semantics,
        logic=logic,
        inputs=inputs,
        path=path_block,
        gate=gate,
        state=state,
        proof=proof,
        metadata=metadata,
        source_file=str(path),
        raw=payload,
        warnings=tuple(warning_messages),
    )


def load_all_specs(root_dir: str | Path) -> Dict[str, SpecIRDocument]:
    root = Path(root_dir).resolve()
    if not root.exists() or not root.is_dir():
        raise SpecIRLoaderError(f"root_dir not found: {root}")

    docs: Dict[str, SpecIRDocument] = {}
    for path in sorted(root.rglob("*.spec.yaml")):
        doc = load_spec(path)
        docs[doc.spec_id] = doc
    return docs


def build_registry_from_index(index_json_path: str | Path) -> Dict[str, SpecIRRegistryEntry]:
    index_path = Path(index_json_path).resolve()
    if not index_path.exists() or not index_path.is_file():
        raise SpecIRLoaderError(f"index file not found: {index_path}")

    with index_path.open("r", encoding="utf-8-sig") as f:
        payload = json.load(f)
    if not isinstance(payload, list):
        raise SpecIRLoaderError(f"index.json must be an array: {index_path}")

    registry: Dict[str, SpecIRRegistryEntry] = {}
    for row in payload:
        if not isinstance(row, dict):
            continue

        index_spec_id = str(row.get("spec_id", "")).strip()
        file_path = str(row.get("file_path", "")).strip()
        if not index_spec_id or not file_path:
            continue

        resolved_file = _resolve_index_entry_file(index_path=index_path, raw_file_path=file_path)
        try:
            doc = load_spec(resolved_file)
            if doc.spec_id != index_spec_id:
                raise SpecIRLoaderError(
                    f"spec_id mismatch: index={index_spec_id}, doc={doc.spec_id}, file={resolved_file}"
                )
            entry = SpecIRRegistryEntry(
                spec_id=index_spec_id,
                source_file=str(Path(resolved_file).resolve()),
                loaded_status="loaded",
                document=doc,
            )
        except Exception as exc:  # noqa: BLE001 - keep bad files visible in debug API
            entry = SpecIRRegistryEntry(
                spec_id=index_spec_id,
                source_file=str(Path(resolved_file).resolve()),
                loaded_status="error",
                error=str(exc),
            )

        registry[index_spec_id] = entry
    return registry


def _as_object(value: Any, field_name: str, source_path: Path) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    raise SpecIRLoaderError(f"{field_name} must be object: {source_path}")


def _required_text(value: Any, field_name: str, source_path: Path) -> str:
    text = str(value or "").strip()
    if not text:
        raise SpecIRLoaderError(f"{field_name} is required: {source_path}")
    return text


def _validate_spec_schema(payload: Dict[str, Any], source_path: Path) -> None:
    schema = _load_specir_schema()
    try:
        jsonschema.validate(instance=payload, schema=schema)
    except jsonschema.ValidationError as exc:
        field_path = ".".join(str(item) for item in exc.absolute_path)
        if field_path:
            raise SpecIRLoaderError(f"spec schema validation failed at {field_path}: {exc.message} ({source_path})") from exc
        raise SpecIRLoaderError(f"spec schema validation failed: {exc.message} ({source_path})") from exc


def _warn_extra_top_level_fields(payload: Dict[str, Any], source_path: Path) -> list[str]:
    allowed = {
        "spec_id",
        "type",
        "version",
        "namespace",
        "semantics",
        "logic",
        "inputs",
        "path",
        "gate",
        "state",
        "proof",
        "metadata",
    }
    extras = sorted(key for key in payload.keys() if key not in allowed)
    messages: list[str] = []
    for field_name in extras:
        message = f"extra top-level SpecIR field '{field_name}' ignored by standard loader: {source_path}"
        warnings.warn(message, UserWarning, stacklevel=2)
        messages.append(message)
    return messages


@lru_cache(maxsize=1)
def _load_specir_schema() -> Dict[str, Any]:
    schema_path = Path(__file__).resolve().parents[1] / "schemas" / "specir.schema.json"
    try:
        payload = json.loads(schema_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SpecIRLoaderError(f"specir schema load failed: {schema_path}") from exc
    if not isinstance(payload, dict):
        raise SpecIRLoaderError(f"specir schema must be object: {schema_path}")
    return payload


def _resolve_index_entry_file(*, index_path: Path, raw_file_path: str) -> Path:
    candidate = Path(raw_file_path)
    if candidate.is_absolute():
        return candidate

    repo_root = index_path.parent.parent
    attempts = [
        repo_root / candidate,
        index_path.parent / candidate,
        Path.cwd() / candidate,
    ]
    for path in attempts:
        if path.exists():
            return path
    return attempts[0]
