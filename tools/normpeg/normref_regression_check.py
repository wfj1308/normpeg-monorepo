#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import requests


def _post_upload(base: str, pdf: Path, std_code: str, level: str, title: str, version_tag: str) -> Dict[str, Any]:
    url = f"{base}/normref/ingest/upload"
    with pdf.open("rb") as f:
        files = {"file": (pdf.name, f, "application/pdf")}
        data = {
            "std_code": std_code,
            "level": level,
            "title": title,
            "publish": "false",
            "write_to_docs": "true",
            "version_tag": version_tag,
            "approve_threshold": "0.8",
            "ocr_max_pages": "0",
            "ai_preprocess": "false",
            "ai_model": "deepseek-chat",
        }
        resp = requests.post(url, files=files, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _poll_run(base: str, run_id: str, timeout_sec: int) -> Dict[str, Any]:
    url = f"{base}/normref/ingest/runs/{run_id}"
    started = time.time()
    while time.time() - started < timeout_sec:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        row = resp.json()
        status = str(row.get("status", "")).lower()
        if status in {"completed", "failed"}:
            return row
        time.sleep(1.5)
    raise TimeoutError(f"run timeout: {run_id}")


def _artifact_payload(base: str, job_id: str, name: str) -> Dict[str, Any]:
    url = f"{base}/normref/ingest/jobs/{job_id}/artifacts/{name}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    body = resp.json()
    if isinstance(body, dict) and isinstance(body.get("payload"), dict):
        return body["payload"]
    return body


def _artifact_exists(base: str, job_id: str, name: str) -> bool:
    url = f"{base}/normref/ingest/jobs/{job_id}/artifacts/{name}"
    resp = requests.get(url, timeout=30)
    return resp.status_code == 200


def _check_one(base: str, pdf: Path, std_code: str, level: str, title: str, version_tag: str, timeout_sec: int) -> Dict[str, Any]:
    up = _post_upload(base, pdf, std_code, level, title, version_tag)
    run_id = str(up.get("run_id", "")).strip()
    if not run_id:
        raise RuntimeError(f"missing run_id for {pdf}")
    run = _poll_run(base, run_id, timeout_sec=timeout_sec)
    status = str(run.get("status", "")).lower()
    out: Dict[str, Any] = {
        "file": str(pdf),
        "run_id": run_id,
        "run_status": status,
        "ok": False,
    }
    if status != "completed":
        out["error"] = str(run.get("error") or run.get("message") or "run failed")
        return out
    jobs = run.get("review_job_ids") or []
    if not jobs:
        out["error"] = "completed but no review_job_ids"
        return out
    job_id = str(jobs[0])
    required_artifacts = [
        "01_spec.json",
        "02_catalog.json",
        "03_clause_tree.json",
        "04_clause_classification.json",
        "05_components.json",
        "06_dto_schema.json",
        "07_rules.json",
        "08_gates.json",
        "10_proof_templates.json",
        "11_normdoc.json",
        "12_pipeline_audit.json",
    ]
    missing_artifacts = [name for name in required_artifacts if not _artifact_exists(base, job_id, name)]
    cat = _artifact_payload(base, job_id, "02_catalog.json")
    catalog_count = len(cat.get("catalog") or []) if isinstance(cat, dict) else 0
    normref_count = 0
    has_normref_index = _artifact_exists(base, job_id, "norm_ref_index.json")
    if has_normref_index:
        try:
            nri = _artifact_payload(base, job_id, "norm_ref_index.json")
            normref_count = len(nri.get("entries") or []) if isinstance(nri, dict) else 0
        except Exception:
            has_normref_index = False
    out.update(
        {
            "job_id": job_id,
            "catalog_count": catalog_count,
            "normref_count": normref_count,
            "has_normref_index": has_normref_index,
            "missing_artifacts": missing_artifacts,
            "ok": bool(catalog_count > 0 and len(missing_artifacts) == 0),
        }
    )
    if not out["ok"]:
        out["error"] = "catalog empty or required artifacts missing"
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch regression checker for normref upload pipeline.")
    parser.add_argument("--api-base", default="http://127.0.0.1:8081", help="API base URL")
    parser.add_argument("--pdf", action="append", required=True, help="PDF path (repeatable)")
    parser.add_argument("--std-code", default="UNKNOWN-STD", help="default std_code")
    parser.add_argument("--level", default="industry", help="default level")
    parser.add_argument("--title", default="工程规范", help="default title")
    parser.add_argument("--version-tag", default=time.strftime("%Y-%m"), help="version tag")
    parser.add_argument("--timeout-sec", type=int, default=600, help="per run timeout")
    args = parser.parse_args()

    base = args.api_base.rstrip("/")
    rows: List[Dict[str, Any]] = []
    for p in args.pdf:
        pdf = Path(os.path.expanduser(p)).resolve()
        if not pdf.exists():
            rows.append({"file": str(pdf), "ok": False, "error": "file not found"})
            continue
        try:
            rows.append(_check_one(base, pdf, args.std_code, args.level, args.title, args.version_tag, args.timeout_sec))
        except Exception as exc:
            rows.append({"file": str(pdf), "ok": False, "error": str(exc)})

    ok = sum(1 for r in rows if r.get("ok"))
    total = len(rows)
    print(json.dumps({"ok_count": ok, "total": total, "results": rows}, ensure_ascii=False, indent=2))
    return 0 if ok == total and total > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
