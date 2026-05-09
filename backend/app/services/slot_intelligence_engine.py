from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def recommend_slots(
    *,
    clause: str,
    semantic_type: str,
    nearby_slots: list[Dict[str, Any]],
    historical_mappings: list[Dict[str, Any]],
    blueprint_context: Dict[str, Any],
) -> Dict[str, Any]:
    candidates = _collect_candidates(nearby_slots, historical_mappings)
    scored = []
    for key in candidates:
        sim = _semantic_similarity(clause, semantic_type, key, blueprint_context)
        hist = _historical_support(key, historical_mappings)
        conf = round(min(0.99, sim * 0.65 + hist * 0.35), 2)
        scored.append(
            {
                "slotKey": key,
                "confidence": conf,
                "reasoning": f"语义相似度={sim:.2f}，历史支持={hist:.2f}",
                "semantic_similarity": round(sim, 2),
                "historical_support": round(hist, 2),
            }
        )
    scored.sort(key=lambda x: x["confidence"], reverse=True)
    return {
        "slot_recommendation_engine": {
            "name": "slot_intelligence_v1",
            "threshold_auto_bind": 0.92,
        },
        "similarity_strategy": {
            "formula": "confidence = semantic_similarity*0.65 + historical_support*0.35",
            "signals": ["clause keyword overlap", "semantic_type match", "blueprint context hint", "historical frequency"],
        },
        "recommended_slot_keys": scored[:10],
        "slot_graph_integration": {
            "enabled": True,
            "hint": "recommended slot keys can be linked to Slot nodes in Knowledge Graph",
        },
    }


def dispatch_slot_recommendation_result(
    *,
    queue_dir: Path,
    bind_dir: Path,
    form_code: str,
    recommendations: list[Dict[str, Any]],
) -> Dict[str, Any]:
    queue_dir.mkdir(parents=True, exist_ok=True)
    bind_dir.mkdir(parents=True, exist_ok=True)
    auto_bound = []
    queued = []
    for item in recommendations:
        confidence = float(item.get("confidence") or 0)
        record = {
            "record_id": f"slotrec_{int(datetime.now(timezone.utc).timestamp() * 1000)}",
            "form_code": form_code,
            "slotKey": item.get("slotKey"),
            "confidence": confidence,
            "reasoning": item.get("reasoning"),
            "created_at": _now(),
        }
        if confidence >= 0.92:
            _append_jsonl(bind_dir / "auto_bindings.jsonl", {**record, "status": "auto_bound"})
            auto_bound.append(record)
        else:
            _append_jsonl(queue_dir / "human_review_queue.jsonl", {**record, "status": "pending_human_review"})
            queued.append(record)
    return {"auto_bound": auto_bound, "human_review_queue": queued}


def list_slot_review_queue(queue_dir: Path) -> list[Dict[str, Any]]:
    return _read_jsonl(queue_dir / "human_review_queue.jsonl")


def _collect_candidates(nearby_slots: list[Dict[str, Any]], historical_mappings: list[Dict[str, Any]]) -> list[str]:
    keys = []
    for row in nearby_slots:
        if isinstance(row, dict):
            key = str(row.get("slotKey") or row.get("key") or "").strip()
            if key:
                keys.append(key)
    for row in historical_mappings:
        if isinstance(row, dict):
            key = str(row.get("slotKey") or "").strip()
            if key:
                keys.append(key)
    return sorted(set(keys))


def _semantic_similarity(clause: str, semantic_type: str, slot_key: str, blueprint_context: Dict[str, Any]) -> float:
    text = f"{clause} {semantic_type} {json.dumps(blueprint_context, ensure_ascii=False)}".lower()
    key = slot_key.lower()
    base = 0.55
    if key and key in text:
        base += 0.25
    for token in key.replace("_", " ").split():
        if token and token in text:
            base += 0.05
    return min(base, 0.98)


def _historical_support(slot_key: str, historical_mappings: list[Dict[str, Any]]) -> float:
    total = 0
    hit = 0
    for row in historical_mappings:
        if not isinstance(row, dict):
            continue
        total += 1
        if str(row.get("slotKey") or "").strip() == slot_key:
            hit += 1
    if total == 0:
        return 0.5
    return min(0.99, 0.5 + hit / total * 0.5)


def _append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, ensure_ascii=False) + "\n")


def _read_jsonl(path: Path) -> list[Dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        t = line.strip()
        if not t:
            continue
        try:
            obj = json.loads(t)
        except Exception:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return rows


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

