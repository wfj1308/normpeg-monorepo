#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KB = ROOT / "knowledge_base" / "engineering" / "pile_foundation"


def _load(name: str) -> dict:
    return json.loads((KB / name).read_text(encoding="utf-8-sig"))


def main() -> int:
    manifest = _load("manifest.json")
    norm_sources = _load("norm_sources.json")
    norm_refs = _load("norm_refs.json")
    clauses = _load("clauses.json")
    evidence = _load("evidence.json")
    inspection_items = _load("inspection_items.json")
    field_requirements = _load("field_requirements.json")
    thresholds = _load("acceptance_thresholds.json")
    coverage = _load("coverage_matrix.json")
    provenance = _load("provenance.json")
    gaps = _load("gaps.json")

    records_evidence = evidence.get("records", [])
    records_refs = norm_refs.get("records", [])
    records_items = inspection_items.get("records", [])
    records_fields = field_requirements.get("records", [])
    records_thresholds = thresholds.get("records", [])
    records_gaps = gaps.get("records", [])
    records_prov = provenance.get("records", [])
    records_cov = coverage.get("rows", [])

    if not isinstance(records_evidence, list) or not records_evidence:
        raise ValueError("evidence records must be non-empty")
    if not isinstance(records_items, list) or not records_items:
        raise ValueError("inspection_items records must be non-empty")
    if not isinstance(records_gaps, list) or not records_gaps:
        raise ValueError("gaps records must be non-empty")
    if not isinstance(records_cov, list) or not records_cov:
        raise ValueError("coverage rows must be non-empty")

    ref_ids = {str(x.get("norm_ref_id", "")).strip() for x in records_refs if isinstance(x, dict)}
    ev_ids = {str(x.get("evidence_id", "")).strip() for x in records_evidence if isinstance(x, dict)}
    prov_ids = {str(x.get("provenance_id", "")).strip() for x in records_prov if isinstance(x, dict)}
    item_ids = {str(x.get("item_id", "")).strip() for x in records_items if isinstance(x, dict)}
    field_ids = {str(x.get("field_id", "")).strip() for x in records_fields if isinstance(x, dict)}
    th_ids = {str(x.get("threshold_id", "")).strip() for x in records_thresholds if isinstance(x, dict)}
    gap_ids = {str(x.get("gap_id", "")).strip() for x in records_gaps if isinstance(x, dict)}

    missing_source_excerpt_count = 0
    fake_normref_count = 0
    unverified_threshold_count = 0
    unverified_promoted_count = 0
    missing_threshold_source_count = 0

    for ev in records_evidence:
        if not isinstance(ev, dict):
            continue
        if not str(ev.get("source_excerpt", "")).strip():
            missing_source_excerpt_count += 1
        nrid = str(ev.get("norm_ref_id", "")).strip()
        if nrid not in ref_ids:
            fake_normref_count += 1
        prid = str(ev.get("provenance_ref", "")).strip()
        if prid and prid not in prov_ids:
            raise ValueError(f"evidence provenance missing: {prid}")

    for th in records_thresholds:
        if not isinstance(th, dict):
            continue
        nr = str(th.get("norm_ref", "")).strip()
        ev = str(th.get("evidence_ref", "")).strip()
        sx = str(th.get("source_excerpt", "")).strip()
        if not nr or not ev:
            raise ValueError("threshold missing norm_ref or evidence_ref")
        if ev not in ev_ids:
            raise ValueError(f"threshold evidence_ref not found: {ev}")
        if not sx:
            missing_threshold_source_count += 1
        if str(th.get("verification_status", "")).strip() != "verified":
            unverified_threshold_count += 1

    for f in records_fields:
        if not isinstance(f, dict):
            continue
        if not f.get("provenance_refs"):
            raise ValueError(f"field missing provenance_refs: {f.get('field_id')}")
        if str(f.get("verification_status", "")).strip() == "verified" and not f.get("evidence_refs"):
            raise ValueError(f"verified field missing evidence_refs: {f.get('field_id')}")

    for item in records_items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("verification_status", "")).strip()
        refs = item.get("norm_refs", [])
        if status == "verified" and not refs:
            raise ValueError(f"verified inspection item missing norm_refs: {item.get('item_id')}")
        if status != "verified" and refs:
            # Allow this if item is intentionally unverified but linked; here we keep strict.
            unverified_promoted_count += 1

    for row in records_cov:
        if not isinstance(row, dict):
            continue
        iid = str(row.get("inspection_item_ref", "")).strip()
        if iid not in item_ids:
            raise ValueError(f"coverage references unknown inspection item: {iid}")
        for fid in row.get("field_refs", []):
            if str(fid) not in field_ids:
                raise ValueError(f"coverage references unknown field: {fid}")
        for eid in row.get("evidence_refs", []):
            if str(eid) not in ev_ids:
                raise ValueError(f"coverage references unknown evidence: {eid}")
        for tid in row.get("threshold_refs", []):
            if str(tid) not in th_ids:
                raise ValueError(f"coverage references unknown threshold: {tid}")
        for gid in row.get("gap_refs", []):
            if str(gid) not in gap_ids:
                raise ValueError(f"coverage references unknown gap: {gid}")

    if missing_source_excerpt_count:
        raise ValueError("some evidence records miss source_excerpt")
    if missing_threshold_source_count:
        raise ValueError("some thresholds miss source_excerpt")
    if fake_normref_count:
        raise ValueError("fake norm_ref_id detected")
    if unverified_promoted_count:
        raise ValueError("unverified inspection item contains norm_refs unexpectedly")

    _ = manifest, norm_sources, clauses  # parsed for completeness

    print(
        json.dumps(
            {
                "pile_foundation_evidence_score": 100,
                "fake_normref_count": fake_normref_count,
                "missing_source_excerpt_count": missing_source_excerpt_count,
                "unverified_threshold_count": unverified_threshold_count,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
