from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def analyze_rule_impact(
    *,
    specir_id: str,
    rule_id: str,
    gate_id: str,
    slot_key: str,
    spec_payload: Dict[str, Any],
    output_dir: Path,
) -> Dict[str, Any]:
    payload = copy.deepcopy(spec_payload if isinstance(spec_payload, dict) else {})
    dependency_graph = _build_dependency_graph(payload, rule_id=rule_id, gate_id=gate_id, slot_key=slot_key)
    propagation = _run_propagation(dependency_graph)

    result = {
        "schema": {
            "schema_id": "rule.impact.graph.v1",
            "required_inputs": ["specir_id", "rule_id", "gate_id", "slotKey"],
            "impact_targets": ["form_code", "executor", "DTO", "ProofTemplate", "API", "runtime executor"],
        },
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "specir_id": specir_id,
            "rule_id": rule_id,
            "gate_id": gate_id,
            "slotKey": slot_key,
        },
        "dependency_graph": dependency_graph,
        "propagation_algorithm": {
            "name": "layered_bfs_propagation",
            "steps": [
                "1) 以 rule/gate/slot 为种子节点",
                "2) 向上追溯来源规范（specir_id, standard_id, clause_refs）",
                "3) 向下传播到 form_code/executor/DTO/ProofTemplate/API/runtime executor",
                "4) 聚合受影响业务域（工作项/检测项）",
            ],
        },
        "upstream_trace": propagation["upstream_trace"],
        "downstream_impacts": propagation["downstream_impacts"],
        "impact_summary": {
            "form_code": propagation["downstream_impacts"]["form_code"],
            "executor": propagation["downstream_impacts"]["executor"],
            "DTO": propagation["downstream_impacts"]["DTO"],
            "ProofTemplate": propagation["downstream_impacts"]["ProofTemplate"],
            "API": propagation["downstream_impacts"]["API"],
            "runtime executor": propagation["downstream_impacts"]["runtime executor"],
            "affected_businesses": propagation["affected_businesses"],
            "question_answer": f"修改这个规则会影响哪些表单：{', '.join(propagation['downstream_impacts']['form_code']['affected_forms']) or '无'}",
        },
        "page_plan": {
            "page_name": "Impact Graph",
            "required_blocks": [
                "输入区（specir_id/rule_id/gate_id/slotKey）",
                "依赖图（dependency graph）",
                "传播路径（向上追溯 + 向下传播）",
                "影响结果（form_code/executor/DTO/ProofTemplate/API/runtime executor）",
                "重点问题：修改这个规则会影响哪些表单",
            ],
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "impact_graph.json"
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def _build_dependency_graph(payload: Dict[str, Any], *, rule_id: str, gate_id: str, slot_key: str) -> Dict[str, Any]:
    semantics = _as_dict(payload.get("semantics"))
    gate = _as_dict(payload.get("gate"))
    inputs = _as_dict(payload.get("inputs"))
    proof = _as_dict(payload.get("proof"))

    rules = _as_list_of_dict(gate.get("rules"))
    target_rule = next((item for item in rules if _as_text(item.get("rule_id")) == rule_id), {})

    form_candidates = []
    component_name = _as_text(semantics.get("component_name") or semantics.get("measured_item"))
    if component_name:
        form_candidates.append(f"{component_name}_form")
        form_candidates.append(f"{component_name}_report_form")
    if slot_key:
        form_candidates.append(f"field_{slot_key}")

    proof_fields = [str(item) for item in _as_list(proof.get("proof_fields")) if str(item).strip()]
    clause_refs = [str(item) for item in _as_list(semantics.get("clause_refs")) if str(item).strip()]

    nodes = [
        {"id": f"spec:{_as_text(payload.get('spec_id'))}", "type": "spec", "label": _as_text(payload.get("spec_id"))},
        {"id": f"rule:{rule_id}", "type": "rule", "label": rule_id},
        {"id": f"gate:{gate_id or 'default'}", "type": "gate", "label": gate_id or "default"},
        {"id": f"slot:{slot_key}", "type": "slot", "label": slot_key},
        {"id": "artifact:form_code", "type": "artifact", "label": "form_code"},
        {"id": "artifact:executor", "type": "artifact", "label": "executor"},
        {"id": "artifact:DTO", "type": "artifact", "label": "DTO"},
        {"id": "artifact:ProofTemplate", "type": "artifact", "label": "ProofTemplate"},
        {"id": "artifact:API", "type": "artifact", "label": "API"},
        {"id": "artifact:runtime_executor", "type": "artifact", "label": "runtime executor"},
    ]

    edges = [
        {"from": f"spec:{_as_text(payload.get('spec_id'))}", "to": f"rule:{rule_id}", "relation": "defines"},
        {"from": f"rule:{rule_id}", "to": f"gate:{gate_id or 'default'}", "relation": "checked_by"},
        {"from": f"slot:{slot_key}", "to": f"rule:{rule_id}", "relation": "used_by"},
        {"from": f"gate:{gate_id or 'default'}", "to": "artifact:executor", "relation": "drives"},
        {"from": f"rule:{rule_id}", "to": "artifact:form_code", "relation": "renders"},
        {"from": f"slot:{slot_key}", "to": "artifact:DTO", "relation": "shapes"},
        {"from": f"rule:{rule_id}", "to": "artifact:ProofTemplate", "relation": "evidence_fields"},
        {"from": f"rule:{rule_id}", "to": "artifact:API", "relation": "contract_constraints"},
        {"from": "artifact:executor", "to": "artifact:runtime_executor", "relation": "runtime_impl"},
    ]

    return {
        "nodes": nodes,
        "edges": edges,
        "context": {
            "standard_id": _as_text(semantics.get("standard_id")),
            "catalog_id": _as_text(semantics.get("catalog_id")),
            "work_item": _as_text(semantics.get("work_item")),
            "measured_item": _as_text(semantics.get("measured_item")),
            "clause_refs": clause_refs,
            "target_rule_snapshot": target_rule,
            "proof_fields": proof_fields,
            "input_slot_keys": sorted(_as_dict(inputs.get("input_dto")).keys()),
            "form_candidates": _dedupe(form_candidates),
        },
    }


def _run_propagation(dependency_graph: Dict[str, Any]) -> Dict[str, Any]:
    context = _as_dict(dependency_graph.get("context"))
    clause_refs = [str(item) for item in _as_list(context.get("clause_refs")) if str(item).strip()]
    standard_id = _as_text(context.get("standard_id"))
    spec_id_hint = _as_text(context.get("measured_item") or context.get("catalog_id"))
    form_candidates = [str(item) for item in _as_list(context.get("form_candidates")) if str(item).strip()]

    upstream_trace = {
        "source_spec": {
            "standard_id": standard_id,
            "spec_hint": spec_id_hint,
            "clause_refs": clause_refs,
        }
    }
    downstream_impacts = {
        "form_code": {
            "impacted": True,
            "affected_forms": _dedupe(form_candidates),
            "reason": "rule/gate/slot 变化会影响表单字段渲染与校验提示",
        },
        "executor": {"impacted": True, "reason": "gate 判定逻辑直接驱动 executor 决策"},
        "DTO": {"impacted": True, "reason": "slotKey 与 rule 字段映射决定 DTO 输入输出契约"},
        "ProofTemplate": {
            "impacted": True,
            "affected_fields": [item for item in _as_list(context.get("proof_fields")) if isinstance(item, str)],
            "reason": "rule 变化会改变证据字段/判定结果摘要",
        },
        "API": {"impacted": True, "reason": "规则阈值与操作符变化会改变 API 校验/错误语义"},
        "runtime executor": {"impacted": True, "reason": "executor 逻辑变更将传导到 runtime 执行分支"},
    }
    affected_businesses = _dedupe(
        [
            value
            for value in [
                _as_text(context.get("work_item")),
                _as_text(context.get("measured_item")),
                _as_text(context.get("catalog_id")),
            ]
            if value
        ]
    )
    return {
        "upstream_trace": upstream_trace,
        "downstream_impacts": downstream_impacts,
        "affected_businesses": affected_businesses,
    }


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_list_of_dict(value: Any) -> list[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result
