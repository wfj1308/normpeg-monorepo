from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

import requests


def _collect_job_ids(review_dir: Path, limit: int) -> List[str]:
    job_ids: List[str] = []
    for p in sorted(review_dir.glob("*.json")):
        try:
            payload = json.loads(p.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        job_id = str(payload.get("job_id", "") or "").strip()
        if not job_id:
            continue
        job_ids.append(job_id)
        if limit > 0 and len(job_ids) >= limit:
            break
    return job_ids


def _rebuild_specir(base_url: str, job_id: str, timeout: float) -> Dict[str, Any]:
    url = f"{base_url.rstrip('/')}/normref/ingest/jobs/{job_id}/specir/rebuild"
    resp = requests.post(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, dict):
        return {"job_id": job_id, "ok": False, "error": "invalid json payload"}
    return {
        "job_id": job_id,
        "ok": True,
        "count": int(data.get("count", 0) or 0),
        "generated_at": str(data.get("generated_at", "") or ""),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill SpecIR JSON for historical ingest jobs.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8081", help="nl2gate-api base url")
    parser.add_argument("--review-dir", default="uploads/normref/review", help="review package dir")
    parser.add_argument("--limit", type=int, default=0, help="max jobs to process, 0 means all")
    parser.add_argument("--timeout", type=float, default=60.0, help="request timeout seconds")
    args = parser.parse_args()

    review_dir = Path(args.review_dir).resolve()
    if not review_dir.exists():
        raise SystemExit(f"review dir not found: {review_dir}")

    job_ids = _collect_job_ids(review_dir, args.limit)
    if not job_ids:
        print(json.dumps({"ok": True, "processed": 0, "items": []}, ensure_ascii=False, indent=2))
        return

    items: List[Dict[str, Any]] = []
    ok_count = 0
    for job_id in job_ids:
        try:
            row = _rebuild_specir(args.base_url, job_id, args.timeout)
            if row.get("ok"):
                ok_count += 1
            items.append(row)
        except Exception as exc:
            items.append({"job_id": job_id, "ok": False, "error": str(exc)})

    print(
        json.dumps(
            {
                "ok": ok_count == len(job_ids),
                "processed": len(job_ids),
                "success": ok_count,
                "failed": len(job_ids) - ok_count,
                "items": items,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

