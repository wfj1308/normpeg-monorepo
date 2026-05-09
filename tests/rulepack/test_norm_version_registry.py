from __future__ import annotations

import sys
import uuid
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def test_norm_version_registry_supports_multi_versions() -> None:
    norm_id = f"JTG/T-3650-2020-{uuid.uuid4().hex[:8]}"
    r1 = main.upsert_norm_version(
        main.NormVersionUpsertRequest(
            norm_id=norm_id,
            norm_name="公路桥涵施工技术规范",
            version="2020",
            effective_date="2020-01-01",
            source_file_hash="sha256:aaa",
            status="approved",
            created_by="u1",
            approved_by="r1",
        )
    )
    assert r1["status"] == "ok"
    r2 = main.upsert_norm_version(
        main.NormVersionUpsertRequest(
            norm_id=norm_id,
            norm_name="公路桥涵施工技术规范",
            version="2026",
            effective_date="2026-01-01",
            source_file_hash="sha256:bbb",
            status="approved",
            created_by="u2",
            approved_by="r2",
        )
    )
    assert r2["status"] == "ok"
    lst = main.list_norm_versions(norm_id=norm_id)
    versions = lst["versions"]
    assert len(versions) >= 2
    assert any(str(x.get("version")) == "2020" for x in versions)
    assert any(str(x.get("version")) == "2026" for x in versions)
