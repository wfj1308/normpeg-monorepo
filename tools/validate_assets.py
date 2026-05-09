from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

from jsonschema import Draft202012Validator


def _load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def _collect_files(root: Path, pattern: str) -> List[Path]:
    return sorted(p for p in root.glob(pattern) if p.is_file())


def _validate_schema(path: Path, validator: Draft202012Validator, errors: List[str]) -> None:
    try:
        data = _load_json(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{path}: invalid JSON ({exc})")
        return

    schema_errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    for err in schema_errors:
        location = ".".join(str(x) for x in err.path) or "<root>"
        errors.append(f"{path}: {location}: {err.message}")


def _check_project_bindings(repo_root: Path, project_path: Path, errors: List[str]) -> None:
    try:
        project = _load_json(project_path)
    except Exception:
        return

    norm_root = repo_root / "normdocs" / "library" / "cn" / "mot"
    std_root = repo_root / "standards" / "library" / "cn" / "mot"

    bindings = project.get("normdoc_bindings", {})
    if isinstance(bindings, dict):
        for form_type, rel in bindings.items():
            rel_path = str(rel).replace("\\", "/")
            target = norm_root / rel_path
            if not target.exists():
                errors.append(
                    f"{project_path}: normdoc_bindings[{form_type}] points to missing file: {target}"
                )

    digital = project.get("digital_standards", {})
    standards = digital.get("standards", []) if isinstance(digital, dict) else []
    if isinstance(standards, list):
        for item in standards:
            if not isinstance(item, dict):
                continue
            code = str(item.get("code", "")).strip()
            rel = str(item.get("file", "")).replace("\\", "/")
            if not rel:
                errors.append(f"{project_path}: digital_standards item {code or '<unknown>'} missing file")
                continue
            target = std_root / rel
            if not target.exists():
                errors.append(
                    f"{project_path}: digital_standards[{code or '<unknown>'}] points to missing file: {target}"
                )


def _build_validator(schema_path: Path) -> Draft202012Validator:
    schema = _load_json(schema_path)
    return Draft202012Validator(schema)


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]

    schema_root = repo_root / "packages" / "normpeg-schemas" / "jsonschema"
    standard_validator = _build_validator(schema_root / "standarddoc.schema.json")
    normdoc_validator = _build_validator(schema_root / "normdoc.schema.json")
    project_validator = _build_validator(schema_root / "project-profile.schema.json")

    standard_files = _collect_files(repo_root, "standards/library/**/standarddoc.json")
    normdoc_files = _collect_files(repo_root, "normdocs/library/**/normdoc.json")
    project_files = _collect_files(repo_root, "projects/**/project.profile.json")

    errors: List[str] = []

    for p in standard_files:
        _validate_schema(p, standard_validator, errors)

    for p in normdoc_files:
        _validate_schema(p, normdoc_validator, errors)

    for p in project_files:
        _validate_schema(p, project_validator, errors)
        _check_project_bindings(repo_root, p, errors)

    print(
        json.dumps(
            {
                "status": "pass" if not errors else "fail",
                "counts": {
                    "standards": len(standard_files),
                    "normdocs": len(normdoc_files),
                    "projects": len(project_files),
                },
                "error_count": len(errors),
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if errors:
        print("\nValidation errors:")
        for idx, err in enumerate(errors, start=1):
            print(f"{idx}. {err}")
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
