from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Tuple

from backend.app.specir.loader import build_registry_from_index

from .models import Catalog, Category, Component, MeasuredItem, TestMethod, WorkItem


class CatalogLoaderError(ValueError):
    """Raised when catalog loading or validation fails."""


def load_catalog() -> Catalog:
    return _load_catalog_from_paths(_catalog_json_path(), _specir_index_path())


def get_measured_item(spec_id: str) -> MeasuredItem:
    resolved_spec = _resolve_spec_id(
        spec_id=spec_id,
        registry_ids=_registry_spec_ids(_specir_index_path()),
    )
    catalog = load_catalog()
    for category in catalog.categories:
        for work_item in category.work_items:
            for measured_item in work_item.measured_items:
                if measured_item.spec_id == resolved_spec:
                    return measured_item
    raise CatalogLoaderError(f"measured item not found by spec_id: {spec_id}")


def get_measured_item_by_id(measured_item_id: str) -> Tuple[MeasuredItem, WorkItem, Category]:
    target = str(measured_item_id or "").strip()
    if not target:
        raise CatalogLoaderError("measured_item_id is required")

    catalog = load_catalog()
    for category in catalog.categories:
        for work_item in category.work_items:
            for measured_item in work_item.measured_items:
                if measured_item.measured_item_id == target:
                    return measured_item, work_item, category
    raise CatalogLoaderError(f"measured item not found: {target}")


def get_test_method_by_id(method_id: str) -> Tuple[TestMethod, MeasuredItem, WorkItem, Category]:
    target = str(method_id or "").strip()
    if not target:
        raise CatalogLoaderError("method_id is required")

    catalog = load_catalog()
    for category in catalog.categories:
        for work_item in category.work_items:
            for measured_item in work_item.measured_items:
                for test_method in measured_item.test_methods:
                    if test_method.method_id == target:
                        return test_method, measured_item, work_item, category
    raise CatalogLoaderError(f"test method not found: {target}")


@lru_cache(maxsize=1)
def _load_catalog_from_paths(catalog_path: Path, specir_index_path: Path) -> Catalog:
    if not catalog_path.exists() or not catalog_path.is_file():
        raise CatalogLoaderError(f"catalog file not found: {catalog_path}")

    try:
        payload = json.loads(catalog_path.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as exc:
        raise CatalogLoaderError(f"catalog JSON parse failed: {catalog_path}") from exc

    if not isinstance(payload, dict):
        raise CatalogLoaderError("catalog root must be object")

    spec_ids = _registry_spec_ids(specir_index_path)
    return _parse_catalog(payload, spec_ids=spec_ids)


@lru_cache(maxsize=1)
def _registry_spec_ids(specir_index_path: Path) -> frozenset[str]:
    registry = build_registry_from_index(specir_index_path)
    return frozenset(registry.keys())


def _parse_catalog(payload: dict[str, Any], *, spec_ids: Iterable[str]) -> Catalog:
    registry_ids = frozenset(str(item).strip() for item in spec_ids if str(item).strip())

    catalog_id = _require_text(payload.get("catalog_id"), "catalog.catalog_id")
    catalog_name = _require_text(payload.get("catalog_name"), "catalog.catalog_name")

    raw_categories = payload.get("categories")
    if not isinstance(raw_categories, list):
        raise CatalogLoaderError("catalog.categories must be list")

    categories: list[Category] = []
    for idx_cat, raw_category in enumerate(raw_categories, start=1):
        if not isinstance(raw_category, dict):
            raise CatalogLoaderError(f"catalog.categories[{idx_cat}] must be object")
        category_id = _require_text(raw_category.get("category_id"), f"categories[{idx_cat}].category_id")
        category_name = _require_text(raw_category.get("category_name"), f"categories[{idx_cat}].category_name")

        raw_work_items = raw_category.get("work_items")
        if not isinstance(raw_work_items, list):
            raise CatalogLoaderError(f"categories[{idx_cat}].work_items must be list")

        work_items: list[WorkItem] = []
        for idx_work, raw_work_item in enumerate(raw_work_items, start=1):
            if not isinstance(raw_work_item, dict):
                raise CatalogLoaderError(f"work_items[{idx_work}] must be object")
            work_item_id = _require_text(raw_work_item.get("work_item_id"), f"work_items[{idx_work}].work_item_id")
            work_item_name = _require_text(
                raw_work_item.get("work_item_name"),
                f"work_items[{idx_work}].work_item_name",
            )

            raw_measured_items = raw_work_item.get("measured_items")
            if not isinstance(raw_measured_items, list):
                raise CatalogLoaderError(f"work_items[{idx_work}].measured_items must be list")

            measured_items: list[MeasuredItem] = []
            for idx_measured, raw_measured_item in enumerate(raw_measured_items, start=1):
                if not isinstance(raw_measured_item, dict):
                    raise CatalogLoaderError(f"measured_items[{idx_measured}] must be object")
                measured_item_id = _require_text(
                    raw_measured_item.get("measured_item_id"),
                    f"measured_items[{idx_measured}].measured_item_id",
                )
                measured_item_name = _require_text(
                    raw_measured_item.get("measured_item_name"),
                    f"measured_items[{idx_measured}].measured_item_name",
                )
                spec_id = _resolve_spec_id(
                    spec_id=raw_measured_item.get("spec_id"),
                    registry_ids=registry_ids,
                )

                raw_test_methods = raw_measured_item.get("test_methods")
                test_methods: list[TestMethod] = []
                if raw_test_methods is not None:
                    if not isinstance(raw_test_methods, list):
                        raise CatalogLoaderError(f"measured_items[{idx_measured}].test_methods must be list")
                    for idx_method, raw_method in enumerate(raw_test_methods, start=1):
                        method_field = f"measured_items[{idx_measured}].test_methods[{idx_method}]"
                        if isinstance(raw_method, str):
                            method_id = _require_text(raw_method, f"{method_field}.method_id")
                            test_methods.append(
                                TestMethod(
                                    method_id=method_id,
                                    spec_id=_infer_test_method_spec_id(method_id),
                                )
                            )
                            continue
                        if not isinstance(raw_method, dict):
                            raise CatalogLoaderError(f"{method_field} must be object")
                        method_id = _require_text(raw_method.get("method_id"), f"{method_field}.method_id")
                        method_spec_id = _require_text(raw_method.get("spec_id"), f"{method_field}.spec_id")
                        test_methods.append(TestMethod(method_id=method_id, spec_id=method_spec_id))

                raw_components = raw_measured_item.get("components")
                if not isinstance(raw_components, list) or len(raw_components) == 0:
                    raise CatalogLoaderError(
                        f"measured_items[{idx_measured}].components must be a non-empty list"
                    )
                components: list[Component] = []
                for idx_component, raw_component in enumerate(raw_components, start=1):
                    component_field = f"measured_items[{idx_measured}].components[{idx_component}]"
                    if not isinstance(raw_component, dict):
                        raise CatalogLoaderError(f"{component_field} must be object")
                    component_id = _require_text(raw_component.get("component_id"), f"{component_field}.component_id")
                    category = _require_text(raw_component.get("category"), f"{component_field}.category")
                    work_item = _require_text(raw_component.get("work_item"), f"{component_field}.work_item")
                    measured_item_name_ref = _require_text(
                        raw_component.get("measured_item"),
                        f"{component_field}.measured_item",
                    )
                    test_method = _require_text(raw_component.get("test_method"), f"{component_field}.test_method")
                    bound_clause_ids = _require_text_list(
                        raw_component.get("bound_clause_ids"),
                        f"{component_field}.bound_clause_ids",
                    )
                    input_schema = _require_mapping(raw_component.get("input_schema"), f"{component_field}.input_schema")
                    path_logic = _require_mapping(raw_component.get("path_logic"), f"{component_field}.path_logic")
                    gate_condition = _require_mapping(
                        raw_component.get("gate_condition"),
                        f"{component_field}.gate_condition",
                    )
                    state_machine = _require_mapping(
                        raw_component.get("state_machine"),
                        f"{component_field}.state_machine",
                    )
                    proof_template = _require_mapping(
                        raw_component.get("proof_template"),
                        f"{component_field}.proof_template",
                    )
                    clause_trace = _require_mapping(raw_component.get("clause_trace"), f"{component_field}.clause_trace")
                    _require_text(clause_trace.get("clause_id"), f"{component_field}.clause_trace.clause_id")
                    _require_text(
                        clause_trace.get("original_text"),
                        f"{component_field}.clause_trace.original_text",
                    )

                    components.append(
                        Component(
                            component_id=component_id,
                            category=category,
                            work_item=work_item,
                            measured_item=measured_item_name_ref,
                            test_method=test_method,
                            bound_clause_ids=bound_clause_ids,
                            input_schema=input_schema,
                            path_logic=path_logic,
                            gate_condition=gate_condition,
                            state_machine=state_machine,
                            proof_template=proof_template,
                            clause_trace=clause_trace,
                        )
                    )

                measured_items.append(
                    MeasuredItem(
                        measured_item_id=measured_item_id,
                        measured_item_name=measured_item_name,
                        spec_id=spec_id,
                        test_methods=test_methods,
                        components=components,
                    )
                )

            work_items.append(
                WorkItem(
                    work_item_id=work_item_id,
                    work_item_name=work_item_name,
                    measured_items=measured_items,
                )
            )

        categories.append(
            Category(
                category_id=category_id,
                category_name=category_name,
                work_items=work_items,
            )
        )

    return Catalog(catalog_id=catalog_id, catalog_name=catalog_name, categories=categories)


def _resolve_spec_id(*, spec_id: Any, registry_ids: frozenset[str]) -> str:
    text = _require_text(spec_id, "measured_item.spec_id")
    if text in registry_ids:
        return text

    suffix = f".{text}"
    matched = [item for item in registry_ids if item.endswith(suffix)]
    if len(matched) == 1:
        return matched[0]
    if len(matched) > 1:
        raise CatalogLoaderError(f"spec_id is ambiguous in registry: {text}")
    raise CatalogLoaderError(f"spec_id not found in SpecIR registry: {text}")


def _require_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise CatalogLoaderError(f"{field_name} is required")
    return text


def _require_text_list(value: Any, field_name: str) -> list[str]:
    if not isinstance(value, list) or len(value) == 0:
        raise CatalogLoaderError(f"{field_name} must be non-empty list")
    result: list[str] = []
    for idx, item in enumerate(value, start=1):
        result.append(_require_text(item, f"{field_name}[{idx}]"))
    return result


def _require_mapping(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict) or len(value) == 0:
        raise CatalogLoaderError(f"{field_name} must be non-empty object")
    return value


def _infer_test_method_spec_id(method_id: str) -> str:
    return f"JTG_3450_2019.{method_id}"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _catalog_json_path() -> Path:
    return _repo_root() / "norms" / "catalog.json"


def _specir_index_path() -> Path:
    return _repo_root() / "norms" / "index.json"
