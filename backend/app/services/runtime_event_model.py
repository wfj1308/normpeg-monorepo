from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


EVENT_TYPES = [
    "rule_executed",
    "gate_passed",
    "gate_failed",
    "proof_generated",
    "manual_override",
    "runtime_error",
    "missing_input",
    "sensor_update",
    "bim_update",
]


def event_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime_event_model.v1",
        "event_types": EVENT_TYPES,
        "required_fields": [
            "event_id",
            "project_id",
            "form_code",
            "peg_id",
            "slotKey",
            "rule_id",
            "gate_id",
            "result",
            "input_values",
            "output_values",
            "timestamp",
            "operator",
            "proof_ref",
        ],
    }


def write_event(*, store_dir: Path, event: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_event(event)
    _validate_event(normalized)
    store_dir.mkdir(parents=True, exist_ok=True)

    events_path = store_dir / "runtime_events.jsonl"
    with events_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(normalized, ensure_ascii=False) + "\n")

    graph_projection = _project_to_runtime_semantic_graph(normalized)
    graph_path = store_dir / "runtime_semantic_graph_events.jsonl"
    with graph_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(graph_projection, ensure_ascii=False) + "\n")

    return {
        "event": normalized,
        "graph_projection": graph_projection,
        "write_flow": {
            "steps": [
                "1) validate standard event payload",
                "2) append runtime_events.jsonl",
                "3) project nodes/edges for Runtime Semantic Graph",
                "4) append runtime_semantic_graph_events.jsonl",
            ],
            "event_store": str(events_path),
            "graph_store": str(graph_path),
        },
    }


def list_events(*, store_dir: Path, limit: int = 100) -> Dict[str, Any]:
    path = store_dir / "runtime_events.jsonl"
    rows: list[Dict[str, Any]] = []
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            txt = line.strip()
            if not txt:
                continue
            try:
                obj = json.loads(txt)
            except Exception:
                continue
            if isinstance(obj, dict):
                rows.append(obj)
    rows = rows[-max(1, min(int(limit), 1000)) :]
    return {"items": rows}


def _project_to_runtime_semantic_graph(event: Dict[str, Any]) -> Dict[str, Any]:
    project_id = str(event.get("project_id") or "").strip()
    form_code = str(event.get("form_code") or "").strip()
    slot_key = str(event.get("slotKey") or "").strip()
    rule_id = str(event.get("rule_id") or "").strip()
    gate_id = str(event.get("gate_id") or "").strip()
    proof_ref = str(event.get("proof_ref") or "").strip()
    operator = str(event.get("operator") or "").strip()
    peg_id = str(event.get("peg_id") or "").strip()

    runtime_node = f"runtime:{event['event_id']}"
    nodes = [
        {"id": f"project:{project_id}", "type": "Project"},
        {"id": f"form:{form_code}", "type": "Form"},
        {"id": f"peg:{peg_id}", "type": "PegFile"},
        {"id": f"slot:{slot_key}", "type": "Slot"},
        {"id": f"rule:{rule_id}", "type": "Rule"},
        {"id": f"gate:{gate_id}", "type": "Gate"},
        {"id": runtime_node, "type": "RuntimeExecution"},
        {"id": f"proof:{proof_ref}", "type": "Proof"},
        {"id": f"engineer:{operator}", "type": "Engineer"},
    ]
    edges = [
        {"from": runtime_node, "to": f"project:{project_id}", "type": "belongs_to"},
        {"from": runtime_node, "to": f"form:{form_code}", "type": "belongs_to"},
        {"from": runtime_node, "to": f"rule:{rule_id}", "type": "generated_from"},
        {"from": runtime_node, "to": f"gate:{gate_id}", "type": "generated_from"},
        {"from": f"rule:{rule_id}", "to": f"slot:{slot_key}", "type": "validates"},
        {"from": f"proof:{proof_ref}", "to": f"gate:{gate_id}", "type": "proves"},
        {"from": runtime_node, "to": f"engineer:{operator}", "type": "executed_by"},
        {"from": f"form:{form_code}", "to": f"peg:{peg_id}", "type": "uses"},
    ]
    if str(event.get("event_type")) == "gate_failed":
        edges.append({"from": f"gate:{gate_id}", "to": runtime_node, "type": "failed_at"})
    return {
        "event_id": event["event_id"],
        "timestamp": event["timestamp"],
        "nodes": nodes,
        "edges": edges,
    }


def _normalize_event(event: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(event)
    payload.setdefault("event_id", f"evt_{int(datetime.now(timezone.utc).timestamp() * 1000)}")
    payload.setdefault("timestamp", _now())
    payload.setdefault("input_values", {})
    payload.setdefault("output_values", {})
    payload.setdefault("proof_ref", "")
    return payload


def _validate_event(event: Dict[str, Any]) -> None:
    for field in event_schema()["required_fields"]:
        if field not in event:
            raise ValueError(f"missing required field: {field}")
    event_type = str(event.get("event_type") or "").strip()
    if event_type not in EVENT_TYPES:
        raise ValueError(f"invalid event_type: {event_type}")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

