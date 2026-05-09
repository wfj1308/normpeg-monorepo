from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def propagation_schema() -> Dict[str, Any]:
    return {
        "schema_id": "cross_form_ai_propagation.v1",
        "input_fields": ["specir", "slot_graph", "form_blueprint", "historical_usage", "dry_run"],
        "output_fields": ["affected_forms", "propagation_engine", "impact_reasoning", "preview_workflow"],
        "affected_form_fields": ["form_code", "confidence", "propagation_reasoning"],
    }


def propagate_cross_form_ai(
    *,
    specir: Dict[str, Any],
    slot_graph: Dict[str, Any],
    form_blueprint: Dict[str, Any],
    historical_usage: list[Dict[str, Any]],
    dry_run: bool,
) -> Dict[str, Any]:
    specir_text = _as_text(specir)
    specir_slots = _extract_slot_tokens(specir_text)
    graph_slots = _extract_graph_slots(slot_graph)
    blueprint_forms = _extract_blueprint_forms(form_blueprint)
    usage_rows = [x for x in historical_usage if isinstance(x, dict)]

    affected_forms: list[Dict[str, Any]] = []
    for row in blueprint_forms:
        form_code = row["form_code"]
        form_slots = row["slot_tokens"]

        slot_overlap = _jaccard(specir_slots | graph_slots, form_slots)
        usage_score = _historical_score(form_code, usage_rows)
        specir_hit = 1.0 if form_code.lower() in specir_text.lower() else 0.0
        confidence = round(min(1.0, slot_overlap * 0.6 + usage_score * 0.3 + specir_hit * 0.1), 4)
        if confidence < 0.2:
            continue

        reasoning = (
            f"slot overlap={slot_overlap:.4f}, historical usage={usage_score:.4f}, "
            f"specir form hint={specir_hit:.4f}"
        )
        affected_forms.append(
            {
                "form_code": form_code,
                "confidence": confidence,
                "propagation_reasoning": reasoning,
                "slot_overlap": round(slot_overlap, 4),
                "historical_usage_score": round(usage_score, 4),
            }
        )

    affected_forms.sort(key=lambda x: (float(x.get("confidence") or 0.0), str(x.get("form_code") or "")), reverse=True)

    return {
        "propagation_engine": {
            "name": "cross_form_ai_propagation_engine_v1",
            "signals": ["specir semantic signal", "slot graph overlap", "form blueprint mapping", "historical usage"],
        },
        "impact_reasoning": {
            "total_candidates": len(blueprint_forms),
            "selected_affected_forms": len(affected_forms),
            "confidence_formula": "confidence = slot_overlap*0.6 + historical_usage*0.3 + specir_hint*0.1",
        },
        "preview_workflow": {
            "dry_run": bool(dry_run),
            "steps": [
                "1) Parse SpecIR signals",
                "2) Match slot graph against form blueprint",
                "3) Re-rank with historical usage",
                "4) Produce affected_forms preview",
                "5) Apply propagation only when dry_run=false",
            ],
            "apply_executed": not bool(dry_run),
        },
        "affected_forms": affected_forms,
        "meta": {
            "generated_at": _now(),
            "dry_run": bool(dry_run),
        },
    }


def _extract_graph_slots(slot_graph: Dict[str, Any]) -> set[str]:
    out: set[str] = set()
    if not isinstance(slot_graph, dict):
        return out
    nodes = slot_graph.get("nodes")
    if isinstance(nodes, list):
        for node in nodes:
            if not isinstance(node, dict):
                continue
            for key in ("slotKey", "id", "field"):
                value = str(node.get(key) or "").strip().lower()
                if value:
                    out.add(value)
    return out


def _extract_blueprint_forms(form_blueprint: Dict[str, Any]) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    if not isinstance(form_blueprint, dict):
        return rows
    forms = form_blueprint.get("forms")
    if isinstance(forms, list):
        for idx, form in enumerate(forms, start=1):
            if not isinstance(form, dict):
                continue
            form_code = str(form.get("form_code") or form.get("formCode") or f"FORM_{idx}").strip()
            slot_tokens = set()
            for token in _to_tokens(form):
                slot_tokens.add(token)
            rows.append({"form_code": form_code, "slot_tokens": slot_tokens})
    elif isinstance(forms, dict):
        for key, value in forms.items():
            form_code = str(key).strip()
            slot_tokens = set(_to_tokens(value))
            rows.append({"form_code": form_code, "slot_tokens": slot_tokens})
    return rows


def _historical_score(form_code: str, rows: list[Dict[str, Any]]) -> float:
    hits = 0
    total = 0
    target = form_code.strip().lower()
    for row in rows:
        fc = str(row.get("form_code") or row.get("formCode") or "").strip().lower()
        if not fc:
            continue
        total += 1
        if fc == target:
            hits += 1
    if total <= 0:
        return 0.0
    return hits / total


def _extract_slot_tokens(text: str) -> set[str]:
    return {tok for tok in _to_tokens(text) if len(tok) >= 3}


def _to_tokens(value: Any) -> list[str]:
    text = _as_text(value).lower()
    chars = []
    for ch in text:
        if ch.isalnum() or ch in {"_", "-"}:
            chars.append(ch)
        else:
            chars.append(" ")
    return [tok for tok in "".join(chars).split() if tok]


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    if union <= 0:
        return 0.0
    return inter / union


def _as_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return str(value)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

