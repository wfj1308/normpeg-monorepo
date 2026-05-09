from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_rule_heatmap_metrics(
    *,
    event_dir: Path,
    output_dir: Path,
    standard: str | None = None,
    form_code: str | None = None,
    project: str | None = None,
) -> Dict[str, Any]:
    events = _load_events(event_dir)
    filtered = [
        item
        for item in events
        if _match(item.get("standard"), standard)
        and _match(item.get("form_code"), form_code)
        and _match(item.get("project_id"), project)
    ]

    by_rule: Dict[str, Dict[str, int]] = {}
    by_gate: Dict[str, Dict[str, int]] = {}
    for ev in filtered:
        rules = [str(r) for r in _as_list(ev.get("rule_hit")) if str(r).strip()]
        gate_id = str(ev.get("gate_id") or "default")
        for rid in rules:
            bucket = by_rule.setdefault(
                rid,
                {
                    "runtime_frequency": 0,
                    "fail_frequency": 0,
                    "manual_override_frequency": 0,
                    "unresolved_frequency": 0,
                },
            )
            bucket["runtime_frequency"] += 1
            if bool(ev.get("gate_fail")):
                bucket["fail_frequency"] += 1
            if bool(ev.get("manual_override")):
                bucket["manual_override_frequency"] += 1
            if bool(ev.get("runtime_error")) or bool(ev.get("invalid_input")):
                bucket["unresolved_frequency"] += 1

        gate_bucket = by_gate.setdefault(gate_id, {"runtime_frequency": 0, "fail_frequency": 0})
        gate_bucket["runtime_frequency"] += 1
        if bool(ev.get("gate_fail")):
            gate_bucket["fail_frequency"] += 1

    heatmap_rows = []
    for rid, metric in by_rule.items():
        risk_score = (
            metric["fail_frequency"] * 3
            + metric["manual_override_frequency"] * 2
            + metric["unresolved_frequency"] * 4
            + metric["runtime_frequency"]
        )
        heatmap_rows.append({"rule_id": rid, **metric, "risk_score": risk_score})
    heatmap_rows.sort(key=lambda x: x["risk_score"], reverse=True)

    top_risky_rules = heatmap_rows[:10]
    most_overridden = sorted(heatmap_rows, key=lambda x: x["manual_override_frequency"], reverse=True)[:10]
    most_failing_gates = [
        {"gate_id": gid, **vals}
        for gid, vals in sorted(by_gate.items(), key=lambda kv: kv[1]["fail_frequency"], reverse=True)[:10]
    ]

    payload = {
        "meta": {
            "generated_at": _now(),
            "filters": {
                "standard": standard or "",
                "form_code": form_code or "",
                "project": project or "",
            },
            "event_count": len(filtered),
        },
        "heatmap_metrics": {
            "dimensions": [
                "runtime_frequency",
                "fail_frequency",
                "manual_override_frequency",
                "unresolved_frequency",
            ],
            "rows": heatmap_rows,
        },
        "aggregation_pipeline": {
            "steps": [
                "read runtime_events.jsonl",
                "apply standard/form_code/project filters",
                "aggregate per rule and per gate",
                "compute risk score",
                "rank top risky/failing/overridden",
            ]
        },
        "top_risky_rules": top_risky_rules,
        "most_failing_gates": most_failing_gates,
        "most_overridden_rules": most_overridden,
        "page_plan": {
            "page_name": "Rule Heatmap Dashboard",
            "blocks": [
                "过滤器（standard/form_code/project）",
                "Heatmap metrics 表",
                "Top risky rules",
                "Most failing gates",
                "Most overridden rules",
            ],
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "rule_heatmap_metrics.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


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


def _match(value: Any, expected: str | None) -> bool:
    exp = str(expected or "").strip()
    if not exp:
        return True
    return str(value or "").strip() == exp


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
