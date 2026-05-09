from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping
from uuid import uuid4

import jsonschema

from .config_resolver import ComponentConfigResolver
from .gate_engine import GateEngine
from .input_validator import InputValidator
from .path_executor import PathExecutor
from .proof_builder import ProofBuilder
from .proof_chain_store import ProofChainStore, ProofChainStoreError
from .registry import ComponentRegistry
from .state_engine import StateEngine
from ..utils.merkle_service import build_merkle_tree, get_merkle_root, get_proof_path
from .v_address import build_v_address

_MISSING = object()


class ExecutionEngineError(ValueError):
    """Raised when component execution orchestration fails."""


class ComponentExecutionEngine:
    """Unified Layer2 execution pipeline driven by component DSL."""

    def __init__(
        self,
        registry: ComponentRegistry | None = None,
        path_executor: PathExecutor | None = None,
        gate_engine: GateEngine | None = None,
        config_resolver: ComponentConfigResolver | None = None,
        input_validator: InputValidator | None = None,
        state_engine: StateEngine | None = None,
        proof_builder: ProofBuilder | None = None,
        proof_chain_store: ProofChainStore | None = None,
        execution_schema_path: Path | None = None,
    ) -> None:
        self.registry = registry or ComponentRegistry()
        self.path_executor = path_executor or PathExecutor()
        self.gate_engine = gate_engine or GateEngine()
        self.config_resolver = config_resolver or ComponentConfigResolver()
        self.input_validator = input_validator or InputValidator()
        self.state_engine = state_engine or StateEngine()
        self.proof_builder = proof_builder or ProofBuilder()
        self.proof_chain_store = proof_chain_store or ProofChainStore()
        self.execution_schema_path = execution_schema_path or (
            Path(__file__).resolve().parents[1] / "schemas" / "execution-result.schema.json"
        )
        self.execution_schema = self._load_schema(self.execution_schema_path)

    def execute(
        self,
        component_id: str,
        input_payload: Dict[str, Any],
        _call_stack: list[str] | None = None,
    ) -> Dict[str, Any]:
        if not isinstance(input_payload, dict):
            raise ExecutionEngineError("input_payload must be an object")

        call_stack = list(_call_stack or [])
        if component_id in call_stack:
            chain = " -> ".join(call_stack + [component_id])
            raise ExecutionEngineError(f"circular compose invocation detected: {chain}")
        call_stack.append(component_id)

        base_component = self.registry.get_component(component_id)
        self._ensure_component_executable_source(base_component)
        resolved = self.config_resolver.resolve(component=base_component, input_payload=input_payload)
        component = resolved["component"]
        config_trace = resolved.get("trace", [])
        validated_input = self.input_validator.validate(component=component, input_payload=input_payload)

        path_result = self.path_executor.execute(component=component, input_dto=validated_input)
        if config_trace:
            path_result["path_trace"].insert(
                0,
                {
                    "step_id": "component_config_resolution",
                    "action": "config_resolution",
                    "status": "applied",
                    "merge_order": ["base_component", "patch", "branch_override"],
                    "applied_items": config_trace,
                },
            )
        compose_result = self._execute_compose(
            component=component,
            normalized_input=path_result["normalized_input"],
            call_stack=call_stack,
        )

        if compose_result:
            path_result["path_outputs"].update(compose_result["path_outputs_patch"])
            path_result["path_trace"].append(compose_result["path_trace_item"])

        gate_result = self.gate_engine.evaluate(
            component=component,
            normalized_input=path_result["normalized_input"],
            path_outputs=path_result["path_outputs"],
            runtime_context=compose_result.get("runtime_context", {}) if compose_result else {},
        )

        gate_payload = self._format_gate(component=component, gate_result=gate_result)
        final_status = str(gate_result["overall_status"]).upper()
        execution_merkle_tree = build_merkle_tree(
            [
                {"path_trace": path_result.get("path_trace", [])},
                {"path_outputs": path_result["path_outputs"]},
                {"gate_results": gate_payload.get("rule_results", [])},
            ]
        )
        execution_merkle_root = get_merkle_root(execution_merkle_tree)
        execution_proof_path = get_proof_path(execution_merkle_tree, 2)
        state_result = self.state_engine.resolve_lifecycle(
            component=component,
            gate_status=final_status,
            normalized_input=path_result["normalized_input"],
            gate_result=gate_result,
        )
        state_trace = state_result["state_trace"]
        lifecycle_status = str(state_result["lifecycle_status"]).upper()

        clause_refs = self._collect_clause_refs(component=component, gate_result=gate_result)
        if compose_result:
            for clause_ref in self._collect_child_clause_refs(compose_result["child_results"]):
                if clause_ref not in clause_refs:
                    clause_refs.append(clause_ref)

        project_id = self._resolve_project_id(path_result["normalized_input"], input_payload)
        branch_id = self._resolve_branch_id(path_result["normalized_input"], input_payload)
        parent_branch = self._resolve_parent_branch(path_result["normalized_input"], input_payload)
        fork_point = self._resolve_fork_point(path_result["normalized_input"], input_payload)
        fork_reason = self._resolve_fork_reason(path_result["normalized_input"], input_payload)
        merge_decision = self._resolve_merge_decision(path_result["normalized_input"], input_payload)
        merged_by = self._resolve_merged_by(path_result["normalized_input"], input_payload)
        merged_at = self._resolve_merged_at(path_result["normalized_input"], input_payload)
        branch_history = self._resolve_branch_history(path_result["normalized_input"], input_payload)
        workflow_history = branch_history.get("workflow_history", []) if isinstance(branch_history, dict) else []
        effective_overrides = self._resolve_effective_overrides(path_result["normalized_input"], input_payload)
        test_method = self._resolve_test_method(path_result["normalized_input"], component)
        provenance = self._resolve_execution_provenance(component)
        execution_id = f"exec_{uuid4().hex}"
        address_version = hashlib.sha256(execution_id.encode("utf-8")).hexdigest()
        v_address = self._build_execution_v_address(
            project_id=project_id,
            component_id=component_id,
            normalized_input=path_result["normalized_input"],
            branch_id=branch_id,
            version=address_version,
        )
        resolved_context = {
            "project_id": project_id,
            "branch_id": branch_id,
            "parent_branch": parent_branch,
            "fork_point": fork_point,
            "fork_reason": fork_reason,
            "merge_decision": merge_decision,
            "merged_by": merged_by,
            "merged_at": merged_at,
            "branch_history": copy.deepcopy(branch_history),
            "workflow_history": copy.deepcopy(workflow_history) if isinstance(workflow_history, list) else [],
            "component_id": component_id,
            "component_version": str(component.get("version", "")),
            "merge_order": ["base_component", "patch", "branch_override"],
            "applied_items": copy.deepcopy(config_trace),
            "effective_overrides": copy.deepcopy(effective_overrides),
            "path": {
                "lookup_tables": copy.deepcopy(component.get("path", {}).get("lookup_tables", {}))
                if isinstance(component.get("path"), dict)
                else {},
                "formulas": copy.deepcopy(component.get("path", {}).get("formulas", {}))
                if isinstance(component.get("path"), dict)
                else {},
            },
            "gate": copy.deepcopy(component.get("gate", {})) if isinstance(component.get("gate"), dict) else {},
        }
        execution_context_hash = self._hash_execution_context(resolved_context)

        result: Dict[str, Any] = {
            "execution_id": execution_id,
            "component_id": component_id,
            "version": str(component.get("version", "v1")),
            "project_id": project_id,
            "branch_id": branch_id,
            "effective_overrides": copy.deepcopy(effective_overrides),
            "resolved_context": resolved_context,
            "v_address": v_address,
            "test_method": test_method,
            "source": provenance["source"],
            "spec_id": provenance["spec_id"],
            "spec_version": provenance["spec_version"],
            "spec_file": provenance["spec_file"],
            "compile_hash": provenance["compile_hash"],
            "spec_anchor": copy.deepcopy(provenance["spec_anchor"]),
            "input": validated_input,
            "normalized_input": path_result["normalized_input"],
            "path_outputs": path_result["path_outputs"],
            "path_trace": path_result.get("path_trace", []),
            "gate": gate_payload,
            "gate_trace": gate_result.get("gate_trace", []),
            "merkle_root": execution_merkle_root,
            "proof_path": execution_proof_path,
            "state_trace": state_trace,
            "proof": {},
            "final_status": final_status,
            "lifecycle_status": lifecycle_status,
            "clause_refs": clause_refs,
            "explanation_seed": {
                "template_key": f"result.{final_status.lower()}.default",
                "locale": "zh-CN",
                "facts": {
                    "component_id": component_id,
                    "project_id": project_id,
                    "v_address": v_address,
                    "final_status": final_status,
                    "lifecycle_status": lifecycle_status,
                    "branch_id": branch_id,
                    "parent_branch": parent_branch,
                    "fork_point": fork_point,
                    "fork_reason": fork_reason,
                    "merge_decision": merge_decision,
                    "merged_by": merged_by,
                    "merged_at": merged_at,
                    "branch_history": copy.deepcopy(branch_history),
                    "workflow_history": copy.deepcopy(workflow_history) if isinstance(workflow_history, list) else [],
                    "execution_context_hash": execution_context_hash,
                    "effective_overrides": copy.deepcopy(effective_overrides),
                    "test_method": test_method,
                    "resolved_context": resolved_context,
                    "summary_status": gate_payload.get("summary_status"),
                    "failed_rule_ids": gate_payload.get("failed_rule_ids", []),
                    "path_outputs": path_result["path_outputs"],
                    "config_merge_order": ["base_component", "patch", "branch_override"],
                    "config_applied_items": config_trace,
                    "clause_refs": clause_refs,
                    "is_composed": bool(compose_result),
                    "child_keys": list(compose_result["child_results"].keys()) if compose_result else [],
                    "child_aggregates": compose_result["aggregates"] if compose_result else {},
                },
            },
        }

        proof_payload = self.proof_builder.build(component=component, execution_payload=result)
        proof_payload["proof_id"] = proof_payload.get("proof_hash")
        proof_payload["project_id"] = project_id
        proof_payload["action"] = "EXECUTE"
        proof_payload["component_id"] = component_id
        proof_payload["execution_id"] = result["execution_id"]
        proof_payload["v_address"] = v_address
        proof_payload["branch_id"] = branch_id
        proof_payload["parent_branch"] = parent_branch
        proof_payload["fork_point"] = fork_point
        proof_payload["fork_reason"] = fork_reason
        proof_payload["merge_decision"] = merge_decision
        proof_payload["merged_by"] = merged_by
        proof_payload["merged_at"] = merged_at
        proof_payload["proof_schema_version"] = "layerpeg.proof.v2"
        proof_payload["branch_history"] = copy.deepcopy(branch_history)
        proof_payload["workflow_history"] = copy.deepcopy(workflow_history) if isinstance(workflow_history, list) else []
        proof_payload["execution_context_hash"] = execution_context_hash
        proof_payload["merkle_root"] = execution_merkle_root
        proof_payload["proof_path"] = execution_proof_path
        proof_payload["spec_anchor"] = copy.deepcopy(provenance["spec_anchor"])
        proof_payload["timestamp"] = self._resolve_unix_timestamp(path_result["normalized_input"], input_payload)
        proof_payload["signatures"] = self._resolve_signature_list(
            normalized_input=path_result["normalized_input"],
            input_payload=input_payload,
            proof_payload=proof_payload,
        )
        result["proof"] = proof_payload
        self._append_proof_chain(payload=result, component=component)
        chain_hash = str(proof_payload.get("chain_hash", ""))
        previous_chain_hash = str(proof_payload.get("previous_chain_hash", ""))
        main_chain_hash = chain_hash if branch_id == "main" else (previous_chain_hash or chain_hash)
        proof_payload["main_chain_hash"] = main_chain_hash
        proof_payload["fork_chain_hash"] = chain_hash
        self._validate_execution_result(result)
        return result

    @staticmethod
    def _ensure_component_executable_source(component: Mapping[str, Any]) -> None:
        source_type = str(component.get("source_type", "builtin")).strip().lower() or "builtin"
        if source_type == "specir":
            return
        if _builtin_execution_allowed():
            return
        component_id = str(component.get("component_id", "")).strip() or "<unknown>"
        raise ExecutionEngineError(
            f"component is not executable because source_type={source_type}: {component_id}; use SpecIR execution"
        )

    @staticmethod
    def _resolve_branch_id(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str:
        for source in (normalized_input, input_payload):
            branch_id = source.get("__branch_id")
            if isinstance(branch_id, str) and branch_id.strip():
                return branch_id.strip()
            branch_id = source.get("branch_id")
            if isinstance(branch_id, str) and branch_id.strip():
                return branch_id.strip()
        return "main"

    @staticmethod
    def _resolve_effective_overrides(
        normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]
    ) -> Dict[str, Any]:
        for source in (normalized_input, input_payload):
            overrides = source.get("__effective_overrides")
            if isinstance(overrides, dict):
                return copy.deepcopy(overrides)
            overrides = source.get("effective_overrides")
            if isinstance(overrides, dict):
                return copy.deepcopy(overrides)
        return {}

    @staticmethod
    def _resolve_parent_branch(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__parent_branch" not in source:
                continue
            parent_branch = source.get("__parent_branch")
            if parent_branch is None:
                return None
            if isinstance(parent_branch, str) and parent_branch.strip():
                return parent_branch.strip()
        return None

    @staticmethod
    def _resolve_fork_point(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__fork_point" not in source:
                continue
            fork_point = source.get("__fork_point")
            if isinstance(fork_point, str) and fork_point.strip():
                return fork_point.strip()
        return None

    @staticmethod
    def _resolve_fork_reason(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__fork_reason" not in source:
                continue
            fork_reason = source.get("__fork_reason")
            if isinstance(fork_reason, str) and fork_reason.strip():
                return fork_reason.strip()
        return None

    @staticmethod
    def _resolve_merge_decision(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__merge_decision" not in source:
                continue
            decision = source.get("__merge_decision")
            if isinstance(decision, str) and decision.strip():
                return decision.strip().upper()
        return None

    @staticmethod
    def _resolve_merged_by(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__merged_by" not in source:
                continue
            merged_by = source.get("__merged_by")
            if isinstance(merged_by, str) and merged_by.strip():
                return merged_by.strip()
        return None

    @staticmethod
    def _resolve_merged_at(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> str | None:
        for source in (normalized_input, input_payload):
            if "__merged_at" not in source:
                continue
            merged_at = source.get("__merged_at")
            if isinstance(merged_at, str) and merged_at.strip():
                return merged_at.strip()
        return None

    @staticmethod
    def _resolve_branch_history(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> Dict[str, Any]:
        for source in (normalized_input, input_payload):
            history = source.get("__branch_history")
            if isinstance(history, dict):
                return copy.deepcopy(history)
            history = source.get("branch_history")
            if isinstance(history, dict):
                return copy.deepcopy(history)
        return {}

    @staticmethod
    def _resolve_unix_timestamp(normalized_input: Mapping[str, Any], input_payload: Mapping[str, Any]) -> int:
        for source in (normalized_input, input_payload):
            inspected_at = source.get("inspected_at")
            if isinstance(inspected_at, str) and inspected_at.strip():
                try:
                    return int(datetime.fromisoformat(inspected_at.strip().replace("Z", "+00:00")).timestamp())
                except ValueError:
                    continue
        return int(datetime.now(timezone.utc).timestamp())

    @staticmethod
    def _resolve_signature_list(
        *,
        normalized_input: Mapping[str, Any],
        input_payload: Mapping[str, Any],
        proof_payload: Mapping[str, Any],
    ) -> list[Dict[str, str]]:
        actor_did = ""
        for source in (normalized_input, input_payload):
            value = source.get("actor_did")
            if isinstance(value, str) and value.strip():
                actor_did = value.strip()
                break
        if not actor_did:
            actor_did = "did:layerpeg:executor"
        signature_value = proof_payload.get("signature")
        if not isinstance(signature_value, str) or not signature_value.strip():
            basis = f"{actor_did}:{proof_payload.get('proof_hash', '')}"
            signature_value = hashlib.sha256(basis.encode("utf-8")).hexdigest()
        return [{"did": actor_did, "role": "executor", "signature": signature_value}]

    @staticmethod
    def _hash_execution_context(resolved_context: Mapping[str, Any]) -> str:
        payload = json.dumps(resolved_context, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()

    def _execute_compose(
        self,
        component: Dict[str, Any],
        normalized_input: Dict[str, Any],
        call_stack: list[str],
    ) -> Dict[str, Any]:
        compose_cfg = component.get("compose")
        if not isinstance(compose_cfg, dict):
            return {}

        children_cfg = compose_cfg.get("children", [])
        if not isinstance(children_cfg, list) or not children_cfg:
            return {}

        child_results: Dict[str, list[Dict[str, Any]]] = {}
        compose_trace: list[Dict[str, Any]] = []

        for index, raw_child in enumerate(children_cfg, start=1):
            if not isinstance(raw_child, dict):
                raise ExecutionEngineError(f"compose child at index {index} must be an object")

            child_key = str(raw_child.get("child_key") or f"child_{index}")
            invoke_component = raw_child.get("invoke_component")
            if not isinstance(invoke_component, str) or not invoke_component.strip():
                raise ExecutionEngineError(f"compose child {child_key} missing invoke_component")

            source_items = self._resolve_source_items(
                normalized_input=normalized_input,
                source_field=raw_child.get("source_field"),
            )
            child_results[child_key] = []

            for item_index, source_item in enumerate(source_items, start=1):
                child_input = self._build_child_input(
                    child_cfg=raw_child,
                    parent_input=normalized_input,
                    source_item=source_item,
                )
                executed = self.execute(
                    component_id=invoke_component,
                    input_payload=child_input,
                    _call_stack=call_stack,
                )
                child_results[child_key].append(executed)
                compose_trace.append(
                    {
                        "event": "invoke_component",
                        "child_key": child_key,
                        "invoke_component": invoke_component,
                        "item_index": item_index,
                        "execution_id": executed.get("execution_id"),
                        "final_status": executed.get("final_status"),
                    }
                )

        aggregate_cfg = compose_cfg.get("aggregate_from_children", [])
        if not isinstance(aggregate_cfg, list):
            raise ExecutionEngineError("compose.aggregate_from_children must be an array")

        aggregate_values: Dict[str, Any] = {}
        for index, raw_agg in enumerate(aggregate_cfg, start=1):
            if not isinstance(raw_agg, dict):
                raise ExecutionEngineError(f"compose aggregate at index {index} must be an object")
            aggregate_id = str(raw_agg.get("aggregate_id") or f"aggregate_{index}")
            output_field = str(raw_agg.get("output_field") or aggregate_id)
            value = self._compute_child_aggregate(raw_agg, child_results)
            aggregate_values[output_field] = value
            compose_trace.append(
                {
                    "event": "aggregate_from_children",
                    "aggregate_id": aggregate_id,
                    "output_field": output_field,
                    "method": raw_agg.get("method"),
                    "value": value,
                }
            )

        children_output_field = str(compose_cfg.get("children_output_field", "child_execution_results"))
        aggregate_output_field = str(compose_cfg.get("aggregate_output_field", "child_aggregates"))

        path_outputs_patch: Dict[str, Any] = {}
        path_outputs_patch.update(aggregate_values)
        path_outputs_patch[children_output_field] = child_results
        path_outputs_patch[aggregate_output_field] = aggregate_values

        runtime_context = dict(aggregate_values)
        runtime_context["compose_children"] = child_results
        runtime_context["compose_aggregates"] = aggregate_values

        return {
            "child_results": child_results,
            "aggregates": aggregate_values,
            "path_outputs_patch": path_outputs_patch,
            "runtime_context": runtime_context,
            "path_trace_item": {
                "step_id": "compose",
                "action": "compose",
                "status": "applied",
                "children_count": sum(len(items) for items in child_results.values()),
                "aggregate_keys": list(aggregate_values.keys()),
                "compose_trace": compose_trace,
            },
        }

    def _resolve_source_items(self, normalized_input: Dict[str, Any], source_field: Any) -> list[Dict[str, Any]]:
        if source_field is None:
            return [normalized_input]
        if not isinstance(source_field, str) or not source_field.strip():
            raise ExecutionEngineError("compose child source_field must be a non-empty string")

        found, value = self._try_get_dotted(normalized_input, source_field)
        if not found:
            raise ExecutionEngineError(f"compose source_field not found: {source_field}")

        if isinstance(value, list):
            result: list[Dict[str, Any]] = []
            for index, item in enumerate(value, start=1):
                if not isinstance(item, dict):
                    raise ExecutionEngineError(f"compose source item at index {index} must be an object")
                result.append(item)
            return result

        if isinstance(value, dict):
            return [value]

        raise ExecutionEngineError("compose source_field must resolve to object or array<object>")

    def _build_child_input(
        self,
        child_cfg: Dict[str, Any],
        parent_input: Dict[str, Any],
        source_item: Dict[str, Any],
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}

        defaults = child_cfg.get("defaults", {})
        if isinstance(defaults, dict):
            payload.update(copy.deepcopy(defaults))

        inherit_fields = child_cfg.get("inherit_fields", [])
        if isinstance(inherit_fields, list):
            for raw_field in inherit_fields:
                if not isinstance(raw_field, str) or not raw_field:
                    continue
                found, value = self._try_get_dotted(parent_input, raw_field)
                if found:
                    payload[raw_field] = copy.deepcopy(value)

        input_mapping = child_cfg.get("input_mapping")
        if isinstance(input_mapping, dict) and input_mapping:
            for target, source_spec in input_mapping.items():
                if not isinstance(target, str) or not target:
                    continue
                resolved = self._resolve_mapping_value(source_spec, parent_input, source_item)
                if resolved is not _MISSING:
                    payload[target] = resolved
        else:
            payload.update(copy.deepcopy(source_item))

        if "project_id" not in payload:
            found, project_id = self._try_get_dotted(parent_input, "project_id")
            if found:
                payload["project_id"] = project_id

        return payload

    def _resolve_mapping_value(
        self,
        source_spec: Any,
        parent_input: Dict[str, Any],
        source_item: Dict[str, Any],
    ) -> Any:
        if isinstance(source_spec, str):
            text = source_spec.strip()
            if not text:
                return _MISSING

            if text == "$item":
                return copy.deepcopy(source_item)
            if text == "$parent":
                return copy.deepcopy(parent_input)
            if text.startswith("$item."):
                found, value = self._try_get_dotted(source_item, text[6:])
                return copy.deepcopy(value) if found else _MISSING
            if text.startswith("$parent."):
                found, value = self._try_get_dotted(parent_input, text[8:])
                return copy.deepcopy(value) if found else _MISSING

            found_item, item_value = self._try_get_dotted(source_item, text)
            if found_item:
                return copy.deepcopy(item_value)
            found_parent, parent_value = self._try_get_dotted(parent_input, text)
            if found_parent:
                return copy.deepcopy(parent_value)
            return _MISSING

        if isinstance(source_spec, dict) and "$const" in source_spec:
            return copy.deepcopy(source_spec["$const"])

        if source_spec is None:
            return None

        return copy.deepcopy(source_spec)

    def _compute_child_aggregate(
        self,
        aggregate_cfg: Dict[str, Any],
        child_results: Dict[str, list[Dict[str, Any]]],
    ) -> Any:
        from_child = aggregate_cfg.get("from_child")
        if not isinstance(from_child, str) or not from_child:
            raise ExecutionEngineError("aggregate_from_children.from_child is required")

        entries = child_results.get(from_child)
        if not isinstance(entries, list):
            raise ExecutionEngineError(f"aggregate_from_children child_key not found: {from_child}")

        method = str(aggregate_cfg.get("method", "count")).strip().lower()
        field = aggregate_cfg.get("field")

        if method == "count":
            return len(entries)

        values = self._collect_child_values(entries, field)

        if method in {"mean", "avg"}:
            numbers = self._numeric_values(values, method)
            return sum(numbers) / len(numbers)
        if method == "sum":
            numbers = self._numeric_values(values, method)
            return sum(numbers)
        if method == "min":
            numbers = self._numeric_values(values, method)
            return min(numbers)
        if method == "max":
            numbers = self._numeric_values(values, method)
            return max(numbers)
        if method == "first":
            return values[0]
        if method == "last":
            return values[-1]
        if method == "t_distribution_95":
            numbers = self._numeric_values(values, method)
            return self._t_distribution_95_lower(numbers)
        if method == "pass_rate":
            pass_statuses = aggregate_cfg.get("pass_statuses", ["PASS"])
            if not isinstance(pass_statuses, list):
                raise ExecutionEngineError("pass_statuses must be an array")
            allowed = {str(item).upper() for item in pass_statuses if isinstance(item, str)}
            if not allowed:
                allowed = {"PASS"}
            statuses = [str(item).upper() for item in values]
            if not statuses:
                return 0.0
            passed_count = sum(1 for status in statuses if status in allowed)
            return passed_count / len(statuses)

        raise ExecutionEngineError(f"unsupported aggregate method: {method}")

    def _collect_child_values(self, entries: list[Dict[str, Any]], field: Any) -> list[Any]:
        if not entries:
            raise ExecutionEngineError("aggregate source cannot be empty")

        if not isinstance(field, str) or not field.strip():
            return [entry.get("final_status") for entry in entries]

        values: list[Any] = []
        for index, entry in enumerate(entries, start=1):
            found, value = self._try_get_dotted(entry, field)
            if not found:
                raise ExecutionEngineError(f"aggregate field not found at child index {index}: {field}")
            values.append(value)
        return values

    @staticmethod
    def _numeric_values(values: list[Any], method: str) -> list[float]:
        numeric: list[float] = []
        for index, raw in enumerate(values, start=1):
            if isinstance(raw, bool) or not isinstance(raw, (int, float)):
                raise ExecutionEngineError(f"{method} requires numeric values, got item {index}: {raw}")
            numeric.append(float(raw))
        if not numeric:
            raise ExecutionEngineError(f"{method} requires at least one value")
        return numeric

    def _format_gate(self, component: Dict[str, Any], gate_result: Dict[str, Any]) -> Dict[str, Any]:
        gate_cfg = component.get("gate", {})
        rules_cfg = gate_cfg.get("rules", []) if isinstance(gate_cfg, dict) else []

        rules_by_id: Dict[str, Dict[str, Any]] = {}
        for raw_rule in rules_cfg:
            if isinstance(raw_rule, dict):
                rule_id = raw_rule.get("rule_id")
                if isinstance(rule_id, str):
                    rules_by_id[rule_id] = raw_rule

        rule_results = []
        failed_rule_ids = []

        for hit in gate_result.get("rule_hits", []):
            if not isinstance(hit, dict):
                continue
            rule_id = str(hit.get("rule_id", ""))
            cfg = rules_by_id.get(rule_id, {})
            raw_condition = cfg.get("condition", "")
            condition_text = (
                raw_condition
                if isinstance(raw_condition, str)
                else json.dumps(raw_condition, ensure_ascii=False, sort_keys=True)
            )

            if isinstance(hit.get("passed"), bool):
                passed = bool(hit.get("passed"))
            else:
                passed = str(hit.get("result", "")).upper() == "PASS"
            if not passed and rule_id:
                failed_rule_ids.append(rule_id)

            rule_results.append(
                {
                    "rule_id": rule_id,
                    "condition": condition_text,
                    "severity": str(cfg.get("severity", "info")),
                    "passed": passed,
                    "actual_value": self._scalar_or_string(hit.get("actual_value", hit.get("actual"))),
                    "expected_value": self._scalar_or_string(hit.get("expected_value", hit.get("expected"))),
                    "message": str(hit.get("message", "")),
                }
            )

        return {
            "rule_results": rule_results,
            "summary_status": str(gate_result.get("overall_status", "FAIL")).upper(),
            "failed_rule_ids": failed_rule_ids,
        }

    def _collect_clause_refs(self, component: Dict[str, Any], gate_result: Dict[str, Any]) -> list[str]:
        clause_refs: list[str] = []

        for hit in gate_result.get("rule_hits", []):
            if not isinstance(hit, dict):
                continue
            clause_ref = hit.get("clause_ref")
            if isinstance(clause_ref, str) and clause_ref and clause_ref not in clause_refs:
                clause_refs.append(clause_ref)

        gate_cfg = component.get("gate", {})
        if isinstance(gate_cfg, dict):
            for clause_ref in gate_cfg.get("clause_refs", []):
                if isinstance(clause_ref, str) and clause_ref and clause_ref not in clause_refs:
                    clause_refs.append(clause_ref)

        if not clause_refs:
            clause_refs.append("UNSPECIFIED")
        return clause_refs

    @staticmethod
    def _collect_child_clause_refs(child_results: Dict[str, list[Dict[str, Any]]]) -> list[str]:
        clause_refs: list[str] = []
        for children in child_results.values():
            if not isinstance(children, list):
                continue
            for result in children:
                if not isinstance(result, dict):
                    continue
                refs = result.get("clause_refs", [])
                if not isinstance(refs, list):
                    continue
                for clause_ref in refs:
                    if isinstance(clause_ref, str) and clause_ref and clause_ref not in clause_refs:
                        clause_refs.append(clause_ref)
        return clause_refs

    @staticmethod
    def _resolve_project_id(normalized_input: Dict[str, Any], input_payload: Dict[str, Any]) -> str:
        from_normalized = normalized_input.get("project_id")
        if isinstance(from_normalized, str) and from_normalized.strip():
            return from_normalized

        from_input = input_payload.get("project_id")
        if isinstance(from_input, str) and from_input.strip():
            return from_input

        return "UNSPECIFIED"

    @staticmethod
    def _resolve_test_method(normalized_input: Mapping[str, Any], component: Mapping[str, Any]) -> str | None:
        candidate = normalized_input.get("test_method")
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()

        input_dto = component.get("input_dto")
        if isinstance(input_dto, Mapping):
            field_schema = input_dto.get("test_method")
            if isinstance(field_schema, Mapping):
                default = field_schema.get("default")
                if isinstance(default, str) and default.strip():
                    return default.strip()

        metadata = component.get("metadata")
        if isinstance(metadata, Mapping):
            semantics = metadata.get("semantics")
            if isinstance(semantics, Mapping):
                semantic_method = semantics.get("test_method")
                if isinstance(semantic_method, str) and semantic_method.strip():
                    return semantic_method.strip()

        return None

    @staticmethod
    def _resolve_execution_provenance(component: Mapping[str, Any]) -> Dict[str, Any]:
        metadata = component.get("metadata")
        source = "builtin"
        spec_id: str | None = None
        spec_version: str | None = None
        spec_file: str | None = None
        compile_hash: str | None = None
        spec_anchor: Dict[str, Any] | None = None

        if isinstance(metadata, Mapping):
            if str(component.get("source_type", "")).strip().lower() == "specir":
                source = "specir"
            raw_spec_id = metadata.get("specir_spec_id")
            if isinstance(raw_spec_id, str) and raw_spec_id.strip():
                spec_id = raw_spec_id.strip()
            raw_spec_version = metadata.get("specir_spec_version")
            if isinstance(raw_spec_version, str) and raw_spec_version.strip():
                spec_version = raw_spec_version.strip()
            raw_spec_file = metadata.get("specir_source_file")
            if isinstance(raw_spec_file, str) and raw_spec_file.strip():
                spec_file = raw_spec_file.strip()
            raw_compile_hash = metadata.get("compile_hash")
            if isinstance(raw_compile_hash, str) and raw_compile_hash.strip():
                compile_hash = raw_compile_hash.strip()
            raw_spec_anchor = metadata.get("spec_anchor")
            if isinstance(raw_spec_anchor, Mapping):
                spec_anchor = {
                    "spec_id": str(raw_spec_anchor.get("spec_id") or spec_id or "").strip(),
                    "hash": str(raw_spec_anchor.get("hash") or compile_hash or "").strip(),
                    "version": str(raw_spec_anchor.get("version") or spec_version or "").strip(),
                }

        if source == "specir" and spec_anchor is None:
            spec_anchor = {
                "spec_id": str(spec_id or "").strip(),
                "hash": str(compile_hash or "").strip(),
                "version": str(spec_version or "").strip(),
            }

        if not isinstance(spec_anchor, dict) or not any(spec_anchor.values()):
            spec_anchor = None

        return {
            "source": source,
            "spec_id": spec_id,
            "spec_version": spec_version,
            "spec_file": spec_file,
            "compile_hash": compile_hash,
            "spec_anchor": copy.deepcopy(spec_anchor),
        }

    @staticmethod
    def _build_execution_v_address(
        *,
        project_id: str,
        component_id: str,
        normalized_input: Dict[str, Any],
        branch_id: str,
        version: str | None = None,
    ) -> str:
        stake = ComponentExecutionEngine._resolve_execution_stake(
            normalized_input=normalized_input,
            fallback_component_id=component_id,
        )
        layer = ComponentExecutionEngine._resolve_execution_layer(normalized_input=normalized_input)
        timestamp = ComponentExecutionEngine._resolve_execution_timestamp(normalized_input=normalized_input)
        return build_v_address(
            {
                "projectId": project_id,
                "stake": stake,
                "version": version,
                "layer": layer,
                "branch": branch_id,
                "timestamp": timestamp,
            }
        )

    @staticmethod
    def _resolve_execution_stake(normalized_input: Dict[str, Any], fallback_component_id: str) -> str:
        for key in ("stake", "segment_id", "component_id"):
            value = normalized_input.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return fallback_component_id

    @staticmethod
    def _resolve_execution_layer(normalized_input: Dict[str, Any]) -> str | None:
        for key in ("layer", "layer_depth", "surface_type", "segment_zone"):
            value = normalized_input.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _resolve_execution_timestamp(normalized_input: Dict[str, Any]) -> int | None:
        inspected_at = normalized_input.get("inspected_at")
        if not isinstance(inspected_at, str) or not inspected_at.strip():
            return None
        try:
            return int(datetime.fromisoformat(inspected_at.strip().replace("Z", "+00:00")).timestamp())
        except ValueError:
            return int(datetime.now(timezone.utc).timestamp())

    @staticmethod
    def _scalar_or_string(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float, str)):
            return value
        return json.dumps(value, ensure_ascii=False, sort_keys=True)

    @staticmethod
    def _load_schema(schema_path: Path) -> Dict[str, Any]:
        with schema_path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ExecutionEngineError("execution-result schema must be an object")
        return payload

    def _validate_execution_result(self, payload: Dict[str, Any]) -> None:
        try:
            jsonschema.validate(instance=payload, schema=self.execution_schema)
        except jsonschema.ValidationError as exc:
            raise ExecutionEngineError(f"execution result schema validation failed: {exc.message}") from exc

    def _append_proof_chain(self, payload: Dict[str, Any], component: Dict[str, Any]) -> None:
        proof_cfg = component.get("proof", {})
        chain_cfg = proof_cfg.get("chain", {}) if isinstance(proof_cfg, dict) else {}
        if isinstance(chain_cfg, dict) and chain_cfg.get("enabled") is False:
            return

        proof = payload.get("proof")
        if not isinstance(proof, dict):
            raise ExecutionEngineError("proof payload must be object")
        proof_hash = proof.get("proof_hash")
        execution_id = payload.get("execution_id")
        if not isinstance(proof_hash, str) or not isinstance(execution_id, str):
            raise ExecutionEngineError("proof_hash and execution_id are required for chain append")

        try:
            chain_entry = self.proof_chain_store.append(
                execution_id=execution_id,
                proof_hash=proof_hash,
                proof_metadata={"spec_anchor": proof.get("spec_anchor")},
            )
        except ProofChainStoreError as exc:
            raise ExecutionEngineError(f"proof chain append failed: {exc}") from exc

        proof["ledger_index"] = chain_entry.get("ledger_index")
        proof["previous_chain_hash"] = chain_entry.get("previous_chain_hash")
        proof["chain_hash"] = chain_entry.get("chain_hash")
        proof["chain_merkle_root"] = chain_entry.get("merkle_root")
        proof["chain_proof_path"] = chain_entry.get("proof_path", [])
        proof["merkle_leaf_index"] = chain_entry.get("merkle_leaf_index")
        proof["merkle_tree_size"] = chain_entry.get("merkle_tree_size")

    @staticmethod
    def _try_get_dotted(payload: Mapping[str, Any], dotted_path: str) -> tuple[bool, Any]:
        if not isinstance(dotted_path, str) or not dotted_path:
            return False, None
        if dotted_path in payload:
            return True, payload[dotted_path]

        cursor: Any = payload
        for segment in dotted_path.split("."):
            if isinstance(cursor, Mapping) and segment in cursor:
                cursor = cursor[segment]
                continue
            if hasattr(cursor, segment):
                cursor = getattr(cursor, segment)
                continue
            return False, None
        return True, cursor

    @staticmethod
    def _t_distribution_95_lower(values: list[float]) -> float:
        if len(values) == 1:
            return values[0]

        n = len(values)
        mean = sum(values) / n
        variance = sum((item - mean) ** 2 for item in values) / (n - 1)
        std = math.sqrt(variance)
        dof = n - 1
        t_critical = ComponentExecutionEngine._t_critical_one_sided_95(dof)
        margin = t_critical * std / math.sqrt(n)
        return mean - margin

    @staticmethod
    def _t_critical_one_sided_95(dof: int) -> float:
        table = {
            1: 6.314,
            2: 2.920,
            3: 2.353,
            4: 2.132,
            5: 2.015,
            6: 1.943,
            7: 1.895,
            8: 1.860,
            9: 1.833,
            10: 1.812,
            11: 1.796,
            12: 1.782,
            13: 1.771,
            14: 1.761,
            15: 1.753,
            16: 1.746,
            17: 1.740,
            18: 1.734,
            19: 1.729,
            20: 1.725,
            21: 1.721,
            22: 1.717,
            23: 1.714,
            24: 1.711,
            25: 1.708,
            26: 1.706,
            27: 1.703,
            28: 1.701,
            29: 1.699,
            30: 1.697,
        }
        if dof <= 0:
            return table[1]
        if dof in table:
            return table[dof]
        return 1.645


def _builtin_execution_allowed() -> bool:
    raw = str(os.getenv("LAYERPEG_ALLOW_BUILTIN_EXECUTION", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" in sys.modules
