from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def qa_schema() -> Dict[str, Any]:
    return {
        "schema_id": "norm_qa_engine.v1",
        "query_fields": ["question", "top_k"],
        "answer_fields": ["answer", "evidence"],
        "result_fields": ["clause", "specir", "rule", "gate", "affected_forms", "proof_templates"],
        "requirements": ["semantic_retrieval", "evidence_required"],
    }


def retrieval_strategy() -> Dict[str, Any]:
    return {
        "name": "semantic_retrieval_v1",
        "steps": [
            "1) Semantic match question against graph nodes",
            "2) Expand to related SpecIR/Rule/Gate/Form nodes",
            "3) Build structured answer with evidence citations",
        ],
    }


def citation_design() -> Dict[str, Any]:
    return {
        "name": "evidence_citation_v1",
        "fields": ["type", "id", "excerpt", "confidence"],
        "policy": "Every answer must contain at least one evidence item",
    }


def answer_norm_question(*, question: str, graph: Dict[str, Any], top_k: int = 20) -> Dict[str, Any]:
    q = str(question or "").strip()
    if not q:
        return {
            "qa_schema": qa_schema(),
            "retrieval_strategy": retrieval_strategy(),
            "citation_design": citation_design(),
            "answer": "Question is empty.",
            "evidence": [],
            "results": {"clause": [], "specir": [], "rule": [], "gate": [], "affected_forms": [], "proof_templates": []},
            "meta": {"generated_at": _now()},
        }

    nodes = [n for n in _as_list(graph.get("nodes")) if isinstance(n, dict)]
    edges = [e for e in _as_list(graph.get("edges")) if isinstance(e, dict)]

    scored: list[tuple[float, Dict[str, Any]]] = []
    tokens = _tokens(q)
    for node in nodes:
        text = _node_text(node)
        if not text:
            continue
        score = _score(tokens, _tokens(text))
        if score > 0:
            scored.append((score, node))
    scored.sort(key=lambda x: x[0], reverse=True)
    hits = scored[: max(1, min(int(top_k), 100))]

    clauses: list[Dict[str, Any]] = []
    specirs: list[Dict[str, Any]] = []
    rules: list[Dict[str, Any]] = []
    gates: list[Dict[str, Any]] = []
    forms: list[Dict[str, Any]] = []
    proofs: list[Dict[str, Any]] = []
    evidence: list[Dict[str, Any]] = []

    by_id = {str(n.get("id")): n for n in nodes}
    for score, node in hits:
        nid = str(node.get("id") or "")
        ntype = str(node.get("type") or "")
        props = _as_dict(node.get("properties"))
        evidence.append(
            {
                "type": ntype,
                "id": nid,
                "excerpt": _truncate(_node_text(node), 180),
                "confidence": round(score, 4),
            }
        )
        if ntype == "Clause":
            clauses.append({"id": nid, **props})
        elif ntype == "SpecIR":
            specirs.append({"id": nid, **props})
        elif ntype == "Rule":
            rules.append({"id": nid, **props})
        elif ntype == "Gate":
            gates.append({"id": nid, **props})
        elif ntype == "Form":
            forms.append({"id": nid, **props})

    # Expand neighbors to ensure requested result dimensions are present.
    seed_ids = {str(item.get("id")) for _, item in hits}
    for edge in edges:
        src = str(edge.get("from") or "")
        dst = str(edge.get("to") or "")
        if src not in seed_ids and dst not in seed_ids:
            continue
        for nid in (src, dst):
            node = by_id.get(nid)
            if not node:
                continue
            ntype = str(node.get("type") or "")
            props = _as_dict(node.get("properties"))
            if ntype == "SpecIR":
                specirs.append({"id": nid, **props})
                spec_id = str(props.get("spec_id") or nid.replace("specir:", "", 1))
                proofs.append({"template_id": f"proof-template:{spec_id}", "spec_id": spec_id})
            elif ntype == "Rule":
                rules.append({"id": nid, **props})
            elif ntype == "Gate":
                gates.append({"id": nid, **props})
            elif ntype == "Form":
                forms.append({"id": nid, **props})
            elif ntype == "Clause":
                clauses.append({"id": nid, **props})

    clauses = _dedupe_by_id(clauses)
    specirs = _dedupe_by_id(specirs)
    rules = _dedupe_by_id(rules)
    gates = _dedupe_by_id(gates)
    forms = _dedupe_by_id(forms)
    proofs = _dedupe_by_key(proofs, "template_id")
    evidence = _dedupe_evidence(evidence)[: max(1, min(int(top_k), 50))]

    affected_forms = [
        {"form_code": str(item.get("form_code") or item.get("id") or "").replace("form:", "", 1)}
        for item in forms
        if str(item.get("form_code") or item.get("id") or "").strip()
    ]

    answer = _compose_answer(q, clauses, specirs, rules, gates, affected_forms)
    return {
        "qa_schema": qa_schema(),
        "retrieval_strategy": retrieval_strategy(),
        "citation_design": citation_design(),
        "answer": answer,
        "evidence": evidence,
        "results": {
            "clause": clauses,
            "specir": specirs,
            "rule": rules,
            "gate": gates,
            "affected_forms": affected_forms,
            "proof_templates": proofs,
        },
        "meta": {"generated_at": _now(), "question": q},
    }


def _compose_answer(
    question: str,
    clauses: list[Dict[str, Any]],
    specirs: list[Dict[str, Any]],
    rules: list[Dict[str, Any]],
    gates: list[Dict[str, Any]],
    forms: list[Dict[str, Any]],
) -> str:
    if not any([clauses, specirs, rules, gates, forms]):
        return f"No direct match found for: {question}"
    return (
        f"Matched knowledge for: {question}. "
        f"clauses={len(clauses)}, specir={len(specirs)}, rules={len(rules)}, "
        f"gates={len(gates)}, affected_forms={len(forms)}."
    )


def _score(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    if inter <= 0:
        return 0.0
    return inter / max(1, len(a))


def _node_text(node: Dict[str, Any]) -> str:
    return f"{node.get('id', '')} {node.get('type', '')} {str(node.get('properties', ''))}"


def _tokens(text: str) -> set[str]:
    clean = []
    for ch in str(text or "").lower():
        if ch.isalnum() or ch in {"_", "-"}:
            clean.append(ch)
        else:
            clean.append(" ")
    return {t for t in "".join(clean).split() if t}


def _truncate(text: str, limit: int) -> str:
    t = str(text or "")
    if len(t) <= limit:
        return t
    return t[: limit - 3] + "..."


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dedupe_by_id(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        rid = str(row.get("id") or "")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        out.append(row)
    return out


def _dedupe_by_key(rows: list[Dict[str, Any]], key: str) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        rid = str(row.get(key) or "")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        out.append(row)
    return out


def _dedupe_evidence(rows: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        key = f"{row.get('type')}::{row.get('id')}"
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

