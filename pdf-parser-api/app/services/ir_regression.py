from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


def _norm_slug(value: str) -> str:
    s = str(value or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def _load_baseline() -> Dict[str, Any]:
    path = Path(__file__).resolve().parents[1] / "config" / "ir_regression_baseline.json"
    if not path.exists():
        return {"version": "v1", "samples": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"version": "v1", "samples": []}


def compute_ir_metrics(document_ir: Dict[str, Any]) -> Dict[str, int]:
    pages = document_ir.get("pages", []) if isinstance(document_ir, dict) else []
    page_count = len(pages) if isinstance(pages, list) else 0
    blocks = [
        b
        for p in (pages if isinstance(pages, list) else [])
        if isinstance(p, dict)
        for b in (p.get("text_blocks", []) if isinstance(p.get("text_blocks"), list) else [])
        if isinstance(b, dict)
    ]
    heading_count = len([b for b in blocks if str(b.get("type", "")).strip() in {"heading", "chapter", "section"}])
    clause_count = len([b for b in blocks if str(b.get("type", "")).strip() == "clause"])
    table_count = len([b for b in blocks if str(b.get("type", "")).strip() == "table"])
    return {
        "page_count": page_count,
        "block_count": len(blocks),
        "heading_count": heading_count,
        "clause_count": clause_count,
        "table_count": table_count,
    }


def _find_sample(baseline: Dict[str, Any], norm_id_slug: str) -> Optional[Dict[str, Any]]:
    samples = baseline.get("samples", [])
    if not isinstance(samples, list):
        return None
    for row in samples:
        if not isinstance(row, dict):
            continue
        sid = _norm_slug(str(row.get("norm_id", "")))
        if sid == norm_id_slug:
            return row
    return None


def build_ir_snapshot_diff(document_ir: Dict[str, Any], *, threshold: float = 0.05) -> Dict[str, Any]:
    metrics = compute_ir_metrics(document_ir)
    document = document_ir.get("document", {}) if isinstance(document_ir, dict) else {}
    norm_id_slug = _norm_slug(str(document.get("norm_id", "")))
    baseline = _load_baseline()
    sample = _find_sample(baseline, norm_id_slug)

    out: Dict[str, Any] = {
        "norm_id": str(document.get("norm_id", "")),
        "version": str(document.get("version", "")),
        "metrics": metrics,
        "baseline_found": bool(sample),
        "baseline_ready": False,
        "threshold": threshold,
        "diff": {},
        "warnings": [],
    }
    if not sample:
        out["warnings"].append("BASELINE_NOT_FOUND")
        return out

    out["baseline_ready"] = bool(sample.get("baseline_ready", False))
    baseline_metrics = sample.get("metrics", {}) if isinstance(sample.get("metrics"), dict) else {}
    out["baseline_metrics"] = baseline_metrics
    if not out["baseline_ready"]:
        out["warnings"].append("BASELINE_NOT_READY")
        return out

    warnings: List[str] = []
    diff: Dict[str, Any] = {}
    for key in ("page_count", "block_count", "heading_count", "clause_count", "table_count"):
        base = float(baseline_metrics.get(key, 0) or 0)
        cur = float(metrics.get(key, 0) or 0)
        if base <= 0:
            ratio = 0.0
            delta_pct = 0.0
        else:
            ratio = (cur - base) / base
            delta_pct = abs(ratio)
        diff[key] = {
            "baseline": base,
            "current": cur,
            "ratio": ratio,
            "delta_pct": delta_pct,
            "warning": delta_pct > threshold,
        }
        if delta_pct > threshold:
            warnings.append(f"{key.upper()}_DELTA_GT_5PCT")

    if diff.get("heading_count", {}).get("ratio", 0) < -threshold:
        warnings.append("HEADING_DROP")
    if diff.get("clause_count", {}).get("ratio", 0) < -threshold:
        warnings.append("CLAUSE_LOSS")
    if diff.get("table_count", {}).get("ratio", 0) < -threshold:
        warnings.append("TABLE_MISS")

    out["diff"] = diff
    out["warnings"] = sorted(set(warnings))
    return out

