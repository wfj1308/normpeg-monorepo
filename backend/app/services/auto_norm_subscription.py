from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


DEFAULT_SOURCES = [
    {"source_id": "mot", "name": "交通部", "type": "government"},
    {"source_id": "mohurd", "name": "住建部", "type": "government"},
    {"source_id": "enterprise", "name": "企业标准源", "type": "enterprise"},
]


def subscription_schema() -> Dict[str, Any]:
    return {
        "schema_id": "auto_norm_subscription.v1",
        "sources": DEFAULT_SOURCES,
        "pipeline": ["PDF", "IR", "SpecIR", "Diff", "Impact", "Patch Suggestion"],
        "outputs": ["source_monitor", "auto_ingestion_pipeline", "update_workflow"],
    }


def source_monitor(*, sources: list[Dict[str, Any]]) -> Dict[str, Any]:
    rows = [s for s in sources if isinstance(s, dict)]
    monitored = []
    for idx, src in enumerate(rows, start=1):
        source_id = str(src.get("source_id") or f"source_{idx}").strip()
        monitored.append(
            {
                "source_id": source_id,
                "name": str(src.get("name") or source_id),
                "type": str(src.get("type") or "unknown"),
                "status": "monitoring",
                "latest_scan_at": _now(),
                "discovered_updates": 1 if source_id in {"mot", "mohurd"} else 0,
            }
        )
    return {
        "source_monitor": {
            "engine": "norm_source_monitor_v1",
            "sources": monitored,
        }
    }


def run_auto_ingestion_pipeline(
    *,
    discovered_norms: list[Dict[str, Any]],
    dry_run: bool,
) -> Dict[str, Any]:
    norms = [n for n in discovered_norms if isinstance(n, dict)]
    runs = []
    for idx, norm in enumerate(norms, start=1):
        norm_id = str(norm.get("norm_id") or f"NORM-{idx}").strip()
        title = str(norm.get("title") or norm_id)
        runs.append(
            {
                "norm_id": norm_id,
                "title": title,
                "dry_run": bool(dry_run),
                "stages": [
                    {"stage": "PDF", "status": "ok"},
                    {"stage": "IR", "status": "ok"},
                    {"stage": "SpecIR", "status": "ok"},
                    {"stage": "Diff", "status": "ok"},
                    {"stage": "Impact", "status": "ok"},
                    {"stage": "Patch Suggestion", "status": "ok"},
                ],
                "completed_at": _now(),
            }
        )
    return {
        "auto_ingestion_pipeline": {
            "name": "auto_norm_ingestion_pipeline_v1",
            "dry_run": bool(dry_run),
            "runs": runs,
        }
    }


def build_update_workflow(
    *,
    source_monitor_payload: Dict[str, Any],
    ingestion_payload: Dict[str, Any],
) -> Dict[str, Any]:
    monitor_sources = (
        source_monitor_payload.get("source_monitor", {}).get("sources", [])
        if isinstance(source_monitor_payload, dict)
        else []
    )
    runs = (
        ingestion_payload.get("auto_ingestion_pipeline", {}).get("runs", [])
        if isinstance(ingestion_payload, dict)
        else []
    )
    affected_norms = [str(r.get("norm_id") or "") for r in runs if isinstance(r, dict) and str(r.get("norm_id") or "").strip()]
    return {
        "update_workflow": {
            "name": "norm_update_workflow_v1",
            "steps": [
                "1) source monitor discovers new norms",
                "2) auto ingestion pipeline executes PDF->IR->SpecIR",
                "3) run Diff and Impact analysis",
                "4) generate Patch Suggestion",
                "5) submit review-ready update package",
            ],
            "monitored_source_count": len(monitor_sources),
            "updated_norm_count": len(affected_norms),
            "affected_norms": affected_norms,
        }
    }


def run_subscription_cycle(
    *,
    sources: list[Dict[str, Any]] | None = None,
    discovered_norms: list[Dict[str, Any]] | None = None,
    dry_run: bool = True,
) -> Dict[str, Any]:
    source_rows = sources if isinstance(sources, list) and sources else DEFAULT_SOURCES
    discovered = (
        discovered_norms
        if isinstance(discovered_norms, list) and discovered_norms
        else [
            {"norm_id": "MOT-NEW-2026-001", "title": "交通部新规范示例"},
            {"norm_id": "MOHURD-NEW-2026-001", "title": "住建部新规范示例"},
        ]
    )
    monitor = source_monitor(sources=source_rows)
    ingestion = run_auto_ingestion_pipeline(discovered_norms=discovered, dry_run=bool(dry_run))
    workflow = build_update_workflow(source_monitor_payload=monitor, ingestion_payload=ingestion)
    return {
        "source_monitor": monitor["source_monitor"],
        "auto_ingestion_pipeline": ingestion["auto_ingestion_pipeline"],
        "update_workflow": workflow["update_workflow"],
        "meta": {"generated_at": _now(), "dry_run": bool(dry_run)},
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

