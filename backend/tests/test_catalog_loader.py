from __future__ import annotations

import pytest

from backend.catalog.catalog_loader import CatalogLoaderError, _parse_catalog, get_measured_item, get_test_method_by_id, load_catalog


def test_catalog_loader_can_load_catalog_json() -> None:
    catalog = load_catalog()
    assert catalog.catalog_id == "JTG_F80_1_2017"
    assert len(catalog.categories) >= 1

    first_category = catalog.categories[0]
    assert first_category.category_id == "subgrade"
    assert len(first_category.work_items) >= 1

    first_work_item = first_category.work_items[0]
    measured_ids = {item.measured_item_id for item in first_work_item.measured_items}
    assert {"compaction", "deflection", "thickness"}.issubset(measured_ids)
    compaction = next(item for item in first_work_item.measured_items if item.measured_item_id == "compaction")
    assert [method.method_id for method in compaction.test_methods] == ["T0921", "T0923", "T0924"]
    assert compaction.test_methods[0].spec_id == "JTG_3450_2019.T0921"


def test_catalog_loader_validates_spec_id_exists_in_registry() -> None:
    payload = {
        "catalog_id": "TEST",
        "catalog_name": "TEST",
        "categories": [
            {
                "category_id": "cat",
                "category_name": "cat",
                "work_items": [
                    {
                        "work_item_id": "work",
                        "work_item_name": "work",
                        "measured_items": [
                            {
                                "measured_item_id": "m1",
                                "measured_item_name": "m1",
                                "spec_id": "9.9.9.not_exists",
                            }
                        ],
                    }
                ],
            }
        ],
    }
    with pytest.raises(CatalogLoaderError, match="spec_id not found"):
        _parse_catalog(payload, spec_ids={"JTG_F80_1_2017.4.2.1.compaction"})


def test_catalog_loader_can_resolve_short_spec_id() -> None:
    item = get_measured_item("4.2.2.deflection")
    assert item.spec_id == "JTG_F80_1_2017.4.2.2.deflection"


def test_catalog_loader_can_find_test_method_by_id() -> None:
    method, measured_item, work_item, category = get_test_method_by_id("T0921")
    assert method.method_id == "T0921"
    assert method.spec_id == "JTG_3450_2019.T0921"
    assert measured_item.measured_item_id == "compaction"
    assert work_item.work_item_id == "earthwork"
    assert category.category_id == "subgrade"


def test_catalog_loader_supports_measured_item_to_test_method_to_spec_chain() -> None:
    measured_item = get_measured_item("JTG_F80_1_2017.4.2.1.compaction")
    method = next(item for item in measured_item.test_methods if item.method_id == "T0921")
    assert method.spec_id == "JTG_3450_2019.T0921"
