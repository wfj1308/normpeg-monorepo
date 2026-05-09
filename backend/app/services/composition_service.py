from __future__ import annotations

import copy
from typing import Any, Callable, Dict, List
from uuid import uuid4

from ..core import ComponentExecutionEngine
from .catalog_service import CatalogService


class CompositionService:
    """Execute work-item by composing multiple components from catalog DSL."""

    def __init__(
        self,
        execution_engine: ComponentExecutionEngine | None = None,
        catalog_service: CatalogService | None = None,
    ) -> None:
        self.execution_engine = execution_engine or ComponentExecutionEngine()
        self.catalog_service = catalog_service or CatalogService()

    def execute_work_item(
        self,
        catalog_id: str,
        work_item_id: str,
        component_inputs: Dict[str, Dict[str, Any]],
        project_id: str | None = None,
        execute_component: Callable[[str, Dict[str, Any]], Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        catalog = self.catalog_service.get_catalog(catalog_id)
        work_item = self.catalog_service.get_work_item(catalog_id, work_item_id)
        component_ids = work_item.get("component_ids", [])
        if not isinstance(component_ids, list) or not component_ids:
            raise ValueError("work_item.component_ids must be a non-empty list")

        results: Dict[str, Any] = {}
        clause_refs: list[str] = []

        for component_id in component_ids:
            if not isinstance(component_id, str):
                continue

            payload = component_inputs.get(component_id, {})
            if not isinstance(payload, dict):
                raise ValueError(f"input for component {component_id} must be an object")

            merged_input = dict(payload)
            if project_id and not merged_input.get("project_id"):
                merged_input["project_id"] = project_id
            self._inject_catalog_level_changes(
                merged_input=merged_input,
                catalog=catalog,
                component_id=component_id,
                project_id=project_id or str(merged_input.get("project_id", "")),
            )

            if execute_component is not None:
                result = execute_component(component_id, merged_input)
            else:
                result = self.execution_engine.execute(component_id=component_id, input_payload=merged_input)
            results[component_id] = result

            for clause_ref in result.get("clause_refs", []):
                if isinstance(clause_ref, str) and clause_ref and clause_ref not in clause_refs:
                    clause_refs.append(clause_ref)

        work_item_gate = _evaluate_work_item_gate(work_item, results)
        for clause_ref in work_item_gate.get("clause_refs", []):
            if isinstance(clause_ref, str) and clause_ref and clause_ref not in clause_refs:
                clause_refs.append(clause_ref)

        return {
            "composite_execution_id": f"wexec_{uuid4().hex}",
            "catalog_id": catalog_id,
            "work_item_id": work_item_id,
            "project_id": project_id or _resolve_any_project(results),
            "overall_status": work_item_gate["overall_status"],
            "gate": work_item_gate,
            "component_results": results,
            "clause_refs": clause_refs,
            "summary": {
                "component_count": len(results),
                "pass_count": sum(1 for item in results.values() if item.get("final_status") == "PASS"),
                "fail_count": sum(1 for item in results.values() if item.get("final_status") != "PASS"),
            },
        }

    @staticmethod
    def _inject_catalog_level_changes(
        merged_input: Dict[str, Any],
        catalog: Dict[str, Any],
        component_id: str,
        project_id: str | None,
    ) -> None:
        catalog_patches = catalog.get("patches", [])
        catalog_overrides = catalog.get("overrides", [])

        patches = _filter_patches(catalog_patches, component_id=component_id, project_id=project_id)
        overrides = _filter_overrides(catalog_overrides, component_id=component_id, project_id=project_id)

        existing_patches = merged_input.get("patches", [])
        if existing_patches and not isinstance(existing_patches, list):
            raise ValueError("input.patches must be array when provided")
        existing_overrides = merged_input.get("overrides", [])
        if existing_overrides and not isinstance(existing_overrides, list):
            raise ValueError("input.overrides must be array when provided")

        if patches:
            merged_input["patches"] = list(existing_patches or []) + patches
        if overrides:
            merged_input["overrides"] = list(existing_overrides or []) + overrides


def _evaluate_work_item_gate(work_item: Dict[str, Any], results: Dict[str, Any]) -> Dict[str, Any]:
    gate_cfg = work_item.get("gate", {})
    if not isinstance(gate_cfg, dict):
        gate_cfg = {}
    rules = gate_cfg.get("rules", [])
    if not isinstance(rules, list) or not rules:
        overall = _compose_overall_status(results)
        return {
            "overall_status": overall,
            "rule_hits": [],
            "clause_refs": [],
        }

    rule_hits: list[Dict[str, Any]] = []
    failed_levels: list[str] = []
    clause_refs: list[str] = []

    for index, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict):
            raise ValueError(f"work_item gate rule at index {index} must be object")

        rule_id = str(rule.get("rule_id") or f"work_item_rule_{index}")
        operator = str(rule.get("operator") or "").strip()
        severity = str(rule.get("severity", "info"))
        clause_ref = _first_clause_ref(rule)
        if clause_ref and clause_ref not in clause_refs:
            clause_refs.append(clause_ref)

        if operator == "all_components_in_status":
            hit = _eval_all_components_in_status(rule_id, severity, rule, results, clause_ref)
        elif operator == "pass_rate_gte":
            hit = _eval_pass_rate_gte(rule_id, severity, rule, results, clause_ref)
        else:
            raise ValueError(f"unsupported work_item gate operator: {operator}")

        rule_hits.append(hit)
        if not hit["passed"]:
            failed_levels.append(_resolve_fail_level(rule))

    return {
        "overall_status": _derive_overall_status(failed_levels),
        "rule_hits": rule_hits,
        "clause_refs": clause_refs,
    }


def _eval_all_components_in_status(
    rule_id: str,
    severity: str,
    rule: Dict[str, Any],
    results: Dict[str, Any],
    clause_ref: str,
) -> Dict[str, Any]:
    component_ids = _string_list(rule.get("component_ids"))
    if not component_ids:
        raise ValueError(f"{rule_id}: component_ids is required")
    allowed = [item.upper() for item in _string_list(rule.get("allowed_statuses"))]
    if not allowed:
        allowed = ["PASS"]

    failed_components: list[Dict[str, str]] = []
    status_map: Dict[str, str] = {}
    for component_id in component_ids:
        status = str(results.get(component_id, {}).get("final_status", "MISSING")).upper()
        status_map[component_id] = status
        if status not in allowed:
            failed_components.append({"component_id": component_id, "status": status})

    passed = len(failed_components) == 0
    return {
        "rule_id": rule_id,
        "operator": "all_components_in_status",
        "severity": severity,
        "passed": passed,
        "actual_value": failed_components if failed_components else status_map,
        "expected_value": allowed,
        "message": (
            f"{rule_id}: all target components in {allowed}"
            if passed
            else f"{rule_id}: failed components={failed_components}"
        ),
        "clause_ref": clause_ref,
    }


def _eval_pass_rate_gte(
    rule_id: str,
    severity: str,
    rule: Dict[str, Any],
    results: Dict[str, Any],
    clause_ref: str,
) -> Dict[str, Any]:
    component_ids = _string_list(rule.get("component_ids")) or list(results.keys())
    pass_statuses = [item.upper() for item in _string_list(rule.get("pass_statuses"))]
    if not pass_statuses:
        pass_statuses = ["PASS"]

    min_rate_raw = rule.get("min_rate", 1.0)
    if isinstance(min_rate_raw, bool) or not isinstance(min_rate_raw, (int, float)):
        raise ValueError(f"{rule_id}: min_rate must be number")
    min_rate = float(min_rate_raw)
    if min_rate < 0 or min_rate > 1:
        raise ValueError(f"{rule_id}: min_rate must be in [0,1]")

    total = 0
    passed_count = 0
    for component_id in component_ids:
        status = str(results.get(component_id, {}).get("final_status", "MISSING")).upper()
        total += 1
        if status in pass_statuses:
            passed_count += 1

    pass_rate = passed_count / total if total > 0 else 0.0
    passed = pass_rate >= min_rate

    return {
        "rule_id": rule_id,
        "operator": "pass_rate_gte",
        "severity": severity,
        "passed": passed,
        "actual_value": round(pass_rate, 4),
        "expected_value": min_rate,
        "message": (
            f"{rule_id}: pass_rate={pass_rate:.4f} >= {min_rate:.4f}"
            if passed
            else f"{rule_id}: pass_rate={pass_rate:.4f} < {min_rate:.4f}"
        ),
        "clause_ref": clause_ref,
    }


def _compose_overall_status(results: Dict[str, Any]) -> str:
    statuses = [str(item.get("final_status", "")).upper() for item in results.values() if isinstance(item, dict)]
    if not statuses:
        return "UNKNOWN"
    if "CRITICAL" in statuses:
        return "CRITICAL"
    if "BLOCKED" in statuses:
        return "BLOCKED"
    if "FAIL" in statuses:
        return "FAIL"
    if "WARNING" in statuses:
        return "WARNING"
    if "OVERRIDDEN" in statuses:
        return "OVERRIDDEN"
    if all(status == "PASS" for status in statuses):
        return "PASS"
    return statuses[0]


def _resolve_any_project(results: Dict[str, Any]) -> str:
    for item in results.values():
        if isinstance(item, dict):
            project_id = item.get("project_id")
            if isinstance(project_id, str) and project_id:
                return project_id
    return "UNSPECIFIED"


def _string_list(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str) and item]


def _first_clause_ref(rule: Dict[str, Any]) -> str:
    clause_refs = rule.get("clause_refs")
    if isinstance(clause_refs, list):
        for item in clause_refs:
            if isinstance(item, str) and item:
                return item
    return ""


def _resolve_fail_level(rule: Dict[str, Any]) -> str:
    severity = str(rule.get("severity", "info")).strip().lower()
    on_fail = str(rule.get("on_fail", "")).strip().lower()

    if on_fail == "critical" or severity == "critical":
        return "CRITICAL"
    if on_fail in {"block", "blocked"} or severity == "blocking":
        return "BLOCKED"
    if on_fail in {"warn", "warning"} or severity == "warning":
        return "WARNING"
    return "FAIL"


def _derive_overall_status(failed_levels: list[str]) -> str:
    if not failed_levels:
        return "PASS"
    if "CRITICAL" in failed_levels:
        return "CRITICAL"
    if "BLOCKED" in failed_levels:
        return "BLOCKED"
    if "WARNING" in failed_levels:
        return "WARNING"
    return "FAIL"


def _filter_patches(raw: Any, component_id: str, project_id: str | None) -> list[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if item.get("component_id") != component_id:
            continue
        patch_project = item.get("project_id")
        if patch_project is not None and project_id and patch_project != project_id:
            continue
        out.append(copy.deepcopy(item))
    return out


def _filter_overrides(raw: Any, component_id: str, project_id: str | None) -> list[Dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[Dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if item.get("component_id") != component_id:
            continue
        if project_id and item.get("project_id") != project_id:
            continue
        out.append(copy.deepcopy(item))
    return out
