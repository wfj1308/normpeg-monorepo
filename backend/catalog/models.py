from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(frozen=True)
class TestMethod:
    method_id: str
    spec_id: str


@dataclass(frozen=True)
class Component:
    component_id: str
    category: str
    work_item: str
    measured_item: str
    test_method: str
    bound_clause_ids: List[str] = field(default_factory=list)
    input_schema: Dict[str, Any] = field(default_factory=dict)
    path_logic: Dict[str, Any] = field(default_factory=dict)
    gate_condition: Dict[str, Any] = field(default_factory=dict)
    state_machine: Dict[str, Any] = field(default_factory=dict)
    proof_template: Dict[str, Any] = field(default_factory=dict)
    clause_trace: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MeasuredItem:
    measured_item_id: str
    measured_item_name: str
    spec_id: str
    test_methods: List[TestMethod] = field(default_factory=list)
    components: List[Component] = field(default_factory=list)


@dataclass(frozen=True)
class WorkItem:
    work_item_id: str
    work_item_name: str
    measured_items: List[MeasuredItem] = field(default_factory=list)


@dataclass(frozen=True)
class Category:
    category_id: str
    category_name: str
    work_items: List[WorkItem] = field(default_factory=list)


@dataclass(frozen=True)
class Catalog:
    catalog_id: str
    catalog_name: str
    categories: List[Category] = field(default_factory=list)
