from __future__ import annotations

import json
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_graph_schema() -> Dict[str, Any]:
    return {
        "schema_id": "specir.knowledge.graph.v2",
        "node_types": [
            "Clause",
            "SpecIR",
            "Slot",
            "Rule",
            "Gate",
            "Runtime",
            "Proof",
            "Form",
            "DTO",
            "Executor",
            "Standard",
        ],
        "edge_types": ["derives", "validates", "impacts", "conflicts", "overrides", "propagates_to", "depends_on"],
    }


def build_specir_knowledge_graph(*, spec_entries: list[Dict[str, Any]], output_dir: Path) -> Dict[str, Any]:
    nodes: list[Dict[str, Any]] = []
    edges: list[Dict[str, Any]] = []
    node_ids: set[str] = set()

    def add_node(node_id: str, node_type: str, props: Dict[str, Any]) -> None:
        if node_id in node_ids:
            return
        node_ids.add(node_id)
        nodes.append({"id": node_id, "type": node_type, "properties": props})

    def add_edge(src: str, dst: str, etype: str, props: Dict[str, Any] | None = None) -> None:
        edges.append({"from": src, "to": dst, "type": etype, "properties": props or {}})

    for entry in spec_entries:
        spec_id = str(entry.get("spec_id") or "").strip()
        if not spec_id:
            continue
        semantics = _as_dict(entry.get("semantics"))
        inputs = _as_dict(entry.get("inputs"))
        gate = _as_dict(entry.get("gate"))
        standard_id = str(semantics.get("standard_id") or semantics.get("catalog_id") or "UNKNOWN_STANDARD").strip()
        clause_refs = [str(c).strip() for c in _as_list(semantics.get("clause_refs")) if str(c).strip()]

        specir_id = f"specir:{spec_id}"
        form_id = f"form:{spec_id}"
        executor_id = f"executor:{spec_id}"
        dto_id = f"dto:{spec_id}"
        gate_id = f"gate:{spec_id}"
        runtime_id = f"runtime:{spec_id}"
        proof_id = f"proof:{spec_id}"
        standard_node_id = f"standard:{standard_id}"

        add_node(standard_node_id, "Standard", {"standard_id": standard_id})
        add_node(specir_id, "SpecIR", {"spec_id": spec_id, "version": entry.get("version")})
        add_node(form_id, "Form", {"form_code": spec_id})
        add_node(executor_id, "Executor", {"executor_id": spec_id})
        add_node(dto_id, "DTO", {"dto_id": spec_id})
        add_node(gate_id, "Gate", {"gate_id": spec_id})
        add_node(runtime_id, "Runtime", {"runtime_id": spec_id})
        add_node(proof_id, "Proof", {"proof_id": spec_id})

        add_edge(specir_id, standard_node_id, "derives")
        add_edge(executor_id, specir_id, "depends_on")
        add_edge(form_id, dto_id, "depends_on")
        add_edge(dto_id, specir_id, "derives")
        add_edge(gate_id, specir_id, "derives")
        add_edge(gate_id, form_id, "impacts")
        add_edge(gate_id, runtime_id, "impacts")
        add_edge(runtime_id, proof_id, "derives")
        add_edge(runtime_id, form_id, "impacts")
        add_edge(runtime_id, executor_id, "depends_on")
        add_edge(executor_id, proof_id, "propagates_to")

        for clause in clause_refs:
            clause_id = f"clause:{clause}"
            add_node(clause_id, "Clause", {"clause_id": clause})
            add_edge(clause_id, specir_id, "derives")
            add_edge(standard_node_id, clause_id, "depends_on")

        input_dto = _as_dict(inputs.get("input_dto"))
        for slot_key, slot_def in input_dto.items():
            sk = str(slot_key).strip()
            if not sk:
                continue
            slot_id = f"slot:{sk}"
            add_node(slot_id, "Slot", {"slotKey": sk, **(_as_dict(slot_def))})
            add_edge(slot_id, dto_id, "validates")
            add_edge(slot_id, specir_id, "depends_on")

        rules = [item for item in _as_list(gate.get("rules")) if isinstance(item, dict)]
        for idx, rule in enumerate(rules):
            rid_raw = str(rule.get("rule_id") or f"{spec_id}.rule_{idx + 1}").strip()
            rule_id = f"rule:{rid_raw}"
            add_node(
                rule_id,
                "Rule",
                {
                    "rule_id": rid_raw,
                    "field": rule.get("field"),
                    "operator": rule.get("operator"),
                    "threshold": rule.get("threshold"),
                    "unit": rule.get("unit"),
                },
            )
            add_edge(rule_id, gate_id, "validates")
            add_edge(rule_id, specir_id, "derives")
            add_edge(rule_id, form_id, "impacts")
            add_edge(rule_id, runtime_id, "impacts")

    # infer conflicts / overrides for same rule_id
    rule_index: Dict[str, list[Dict[str, Any]]] = {}
    for node in nodes:
        if node.get("type") != "Rule":
            continue
        rid = str(_as_dict(node.get("properties")).get("rule_id") or "")
        if not rid:
            continue
        rule_index.setdefault(rid, []).append(node)
    for rid, items in rule_index.items():
        if len(items) < 2:
            continue
        base = _as_dict(items[0].get("properties"))
        for other in items[1:]:
            right = _as_dict(other.get("properties"))
            if base.get("threshold") != right.get("threshold") or base.get("operator") != right.get("operator"):
                add_edge(items[0]["id"], other["id"], "conflicts", {"rule_id": rid})
            else:
                add_edge(items[0]["id"], other["id"], "overrides", {"rule_id": rid})

    # infer propagates_to across forms by shared slots
    form_to_slots: Dict[str, set[str]] = {}
    for edge in edges:
        if str(edge.get("type")) != "validates":
            continue
        src = str(edge.get("from"))
        dst = str(edge.get("to"))
        if not src.startswith("slot:") or not dst.startswith("dto:"):
            continue
        form_id = f"form:{dst.replace('dto:', '', 1)}"
        form_to_slots.setdefault(form_id, set()).add(src.replace("slot:", "", 1))
    form_ids = sorted(list(form_to_slots.keys()))
    for i in range(len(form_ids)):
        for j in range(i + 1, len(form_ids)):
            left = form_ids[i]
            right = form_ids[j]
            shared = form_to_slots[left] & form_to_slots[right]
            if not shared:
                continue
            add_edge(left, right, "propagates_to", {"shared_slots": sorted(list(shared))})
            add_edge(right, left, "propagates_to", {"shared_slots": sorted(list(shared))})

    graph = {
        "schema": build_graph_schema(),
        "meta": {"generated_at": _now(), "node_count": len(nodes), "edge_count": len(edges)},
        "nodes": nodes,
        "edges": edges,
        "edge_model": {
            "derives": "derived-from relation",
            "depends_on": "dependency relation",
            "validates": "validation relation",
            "impacts": "impact relation",
            "overrides": "override relation",
            "conflicts": "conflict relation",
            "propagates_to": "cross-form propagation relation",
        },
        "traversal_engine": {
            "name": "semantic_traversal_engine_v1",
            "supported": ["semantic traversal", "impact analysis", "runtime tracing"],
        },
        "semantic_query_engine": {
            "name": "semantic_query_engine_v1",
            "supported": ["semantic search", "slot full-chain impact", "ai retrieval"],
        },
        "page_plan": {
            "page_name": "Knowledge Graph Explorer",
            "blocks": [
                "graph schema",
                "semantic traversal",
                "impact analysis",
                "runtime tracing",
                "ai retrieval",
                "slotKey full-chain impact",
            ],
        },
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "knowledge_graph.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2), encoding="utf-8")
    return graph


def graph_query(graph: Dict[str, Any], *, node_type: str | None = None, keyword: str | None = None) -> Dict[str, Any]:
    nodes = _as_list(graph.get("nodes"))
    edges = _as_list(graph.get("edges"))
    selected = []
    kw = str(keyword or "").strip().lower()
    ntype = str(node_type or "").strip()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        if ntype and str(node.get("type")) != ntype:
            continue
        if kw:
            text = json.dumps(node, ensure_ascii=False).lower()
            if kw not in text:
                continue
        selected.append(node)
    selected_ids = {str(n.get("id")) for n in selected}
    sub_edges = [
        edge
        for edge in edges
        if isinstance(edge, dict) and (str(edge.get("from")) in selected_ids or str(edge.get("to")) in selected_ids)
    ]
    return {"nodes": selected, "edges": sub_edges}


def impact_traversal(graph: Dict[str, Any], *, start_node_id: str, max_depth: int = 3) -> Dict[str, Any]:
    nodes = {str(node.get("id")): node for node in _as_list(graph.get("nodes")) if isinstance(node, dict)}
    edges = [edge for edge in _as_list(graph.get("edges")) if isinstance(edge, dict)]
    if start_node_id not in nodes:
        return {"visited": [], "paths": []}
    queue: deque[tuple[str, int]] = deque([(start_node_id, 0)])
    visited = {start_node_id}
    paths: list[Dict[str, Any]] = []
    while queue:
        node_id, depth = queue.popleft()
        if depth >= max_depth:
            continue
        for edge in edges:
            if str(edge.get("from")) != node_id:
                continue
            to_id = str(edge.get("to"))
            paths.append({"from": node_id, "to": to_id, "type": edge.get("type"), "depth": depth + 1})
            if to_id not in visited:
                visited.add(to_id)
                queue.append((to_id, depth + 1))
    return {"visited": [nodes[node_id] for node_id in visited if node_id in nodes], "paths": paths}


def semantic_search(graph: Dict[str, Any], *, query: str, limit: int = 20) -> Dict[str, Any]:
    q = str(query or "").strip().lower()
    if not q:
        return {"items": []}
    scored: list[tuple[int, Dict[str, Any]]] = []
    for node in _as_list(graph.get("nodes")):
        if not isinstance(node, dict):
            continue
        text = json.dumps(node, ensure_ascii=False).lower()
        score = text.count(q)
        if score > 0:
            scored.append((score, node))
    scored.sort(key=lambda x: x[0], reverse=True)
    return {"items": [item for _, item in scored[:limit]]}


def slotkey_usage_query(graph: Dict[str, Any], *, slot_key: str) -> Dict[str, Any]:
    target = str(slot_key or "").strip()
    if not target:
        return {"slotKey": "", "standards": [], "specirs": [], "forms": [], "runtime": [], "proof": []}
    slot_node_id = f"slot:{target}"
    edges = [edge for edge in _as_list(graph.get("edges")) if isinstance(edge, dict)]

    dto_ids: set[str] = set()
    spec_ids: set[str] = set()
    standard_ids: set[str] = set()
    form_ids: set[str] = set()
    runtime_ids: set[str] = set()
    proof_ids: set[str] = set()

    for edge in edges:
        if str(edge.get("from")) == slot_node_id and str(edge.get("type")) == "validates":
            to_id = str(edge.get("to"))
            if to_id.startswith("dto:"):
                dto_ids.add(to_id)

    for dto_id in dto_ids:
        spec_id = dto_id.replace("dto:", "", 1)
        spec_node_id = f"specir:{spec_id}"
        spec_ids.add(spec_id)
        form_ids.add(f"form:{spec_id}")
        runtime_ids.add(f"runtime:{spec_id}")
        proof_ids.add(f"proof:{spec_id}")
        for edge in edges:
            if str(edge.get("from")) == spec_node_id and str(edge.get("to")).startswith("standard:") and str(edge.get("type")) == "derives":
                standard_ids.add(str(edge.get("to")).replace("standard:", "", 1))

    full_chain = runtime_trace(graph, slot_key=target, max_depth=6)
    return {
        "slotKey": target,
        "specirs": sorted(list(spec_ids)),
        "standards": sorted(list(standard_ids)),
        "forms": sorted(list(form_ids)),
        "runtime": sorted(list(runtime_ids)),
        "proof": sorted(list(proof_ids)),
        "full_chain_impact": full_chain.get("full_chain_impact", []),
        "explanation": f"slotKey {target} full-chain impact traced across DTO/SpecIR/Rule/Gate/Runtime/Proof/Form.",
    }


def runtime_trace(graph: Dict[str, Any], *, slot_key: str, max_depth: int = 6) -> Dict[str, Any]:
    slot_node_id = f"slot:{str(slot_key or '').strip()}"
    node_ids = {str(node.get("id")) for node in _as_list(graph.get("nodes")) if isinstance(node, dict)}
    if not slot_key or slot_node_id not in node_ids:
        return {"slotKey": str(slot_key or ""), "full_chain_impact": [], "visited_nodes": []}
    traversed = impact_traversal(graph, start_node_id=slot_node_id, max_depth=max_depth)
    paths = _as_list(traversed.get("paths"))
    visited = _as_list(traversed.get("visited"))
    return {
        "slotKey": str(slot_key),
        "full_chain_impact": paths,
        "visited_nodes": visited,
        "summary": {
            "path_count": len(paths),
            "node_count": len(visited),
        },
    }


def ai_retrieval(graph: Dict[str, Any], *, query: str, limit: int = 20) -> Dict[str, Any]:
    semantic = semantic_search(graph, query=query, limit=limit)
    items = _as_list(semantic.get("items"))
    reasoning = []
    for item in items[: min(10, len(items))]:
        if not isinstance(item, dict):
            continue
        reasoning.append(f"{str(item.get('type') or '')} {str(item.get('id') or '')} matched semantic query")
    return {
        "query": query,
        "retrieval_items": items,
        "semantic_query_engine": {
            "name": "ai_native_semantic_query_engine_v1",
            "strategy": "token-match over graph node payload + ranking by hit frequency",
        },
        "reasoning": reasoning,
    }


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
