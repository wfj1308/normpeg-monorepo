from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_observability_schema() -> Dict[str, Any]:
    return {
        "schema_id": "runtime.observability.v1",
        "event_fields": [
            "executor_id",
            "form_code",
            "rulepack_version",
            "project_id",
            "rule_hit",
            "gate_pass",
            "gate_fail",
            "runtime_error",
            "missing_slot",
            "invalid_input",
            "latency_ms",
        ],
        "metrics_fields": [
            "pass_rate",
            "fail_rate",
            "slot_missing_rate",
            "unresolved_rate",
            "executor_latency",
            "top_failing_rules",
        ],
    }


def write_runtime_event(event_dir: Path, event: Dict[str, Any]) -> Dict[str, Any]:
    record = dict(event)
    record["timestamp"] = _as_text(record.get("timestamp")) or _now()
    event_dir.mkdir(parents=True, exist_ok=True)
    path = event_dir / "runtime_events.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def build_runtime_metrics(
    *,
    event_dir: Path,
    metrics_dir: Path,
    form_code: str | None = None,
    rulepack_version: str | None = None,
    project_id: str | None = None,
) -> Dict[str, Any]:
    items = _load_events(event_dir)
    filtered = [
        item
        for item in items
        if _match(item, "form_code", form_code)
        and _match(item, "rulepack_version", rulepack_version)
        and _match(item, "project_id", project_id)
    ]
    total = len(filtered)
    pass_count = len([i for i in filtered if bool(i.get("gate_pass"))])
    fail_count = len([i for i in filtered if bool(i.get("gate_fail"))])
    missing_count = len([i for i in filtered if bool(i.get("missing_slot"))])
    unresolved_count = len([i for i in filtered if bool(i.get("runtime_error")) or bool(i.get("invalid_input"))])
    latencies = [float(i.get("latency_ms")) for i in filtered if _is_number(i.get("latency_ms"))]
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0.0

    fail_rule_counter: Dict[str, int] = {}
    for item in filtered:
        if not bool(item.get("gate_fail")):
            continue
        for rid in _as_list(item.get("rule_hit")):
            key = _as_text(rid)
            if not key:
                continue
            fail_rule_counter[key] = fail_rule_counter.get(key, 0) + 1
    top_failing = [
        {"rule_id": rid, "fail_count": cnt}
        for rid, cnt in sorted(fail_rule_counter.items(), key=lambda kv: kv[1], reverse=True)[:10]
    ]

    metrics = {
        "schema": build_observability_schema(),
        "filters": {
            "form_code": form_code or "",
            "rulepack_version": rulepack_version or "",
            "project_id": project_id or "",
        },
        "summary": {
            "total_events": total,
            "pass_rate": _rate(pass_count, total),
            "fail_rate": _rate(fail_count, total),
            "slot_missing_rate": _rate(missing_count, total),
            "unresolved_rate": _rate(unresolved_count, total),
            "executor_latency": {
                "avg_ms": round(avg_latency, 2),
                "p95_ms": _percentile(latencies, 95),
                "max_ms": round(max(latencies), 2) if latencies else 0.0,
            },
        },
        "top_failing_rules": top_failing,
        "event_model": {
            "name": "runtime_event_v1",
            "storage": "jsonl",
            "path": str((event_dir / "runtime_events.jsonl").resolve()),
        },
        "metrics_pipeline": {
            "steps": [
                "collect runtime events",
                "apply filters",
                "aggregate rates",
                "aggregate executor latency",
                "rank top failing rules",
            ]
        },
        "generated_at": _now(),
    }

    metrics_dir.mkdir(parents=True, exist_ok=True)
    (metrics_dir / "runtime_metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    return metrics


def _load_events(event_dir: Path) -> list[Dict[str, Any]]:
    path = event_dir / "runtime_events.jsonl"
    if not path.exists():
        return []
    rows: list[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        text = line.strip()
        if not text:
            continue
        try:
            payload = json.loads(text)
        except Exception:
            continue
        if isinstance(payload, dict):
            rows.append(payload)
    return rows


def _rate(n: int, d: int) -> float:
    if d <= 0:
        return 0.0
    return round(n / d, 4)


def _percentile(values: list[float], p: int) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = int(round((p / 100) * (len(ordered) - 1)))
    return round(float(ordered[idx]), 2)


def _match(item: Dict[str, Any], field: str, expected: str | None) -> bool:
    exp = _as_text(expected)
    if not exp:
        return True
    return _as_text(item.get(field)) == exp


def _is_number(value: Any) -> bool:
    try:
        float(value)
        return True
    except Exception:
        return False


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
