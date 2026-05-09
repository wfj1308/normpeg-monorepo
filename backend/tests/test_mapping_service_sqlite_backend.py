from __future__ import annotations

from pathlib import Path

from backend.app.services.mapping_service import MappingService


def test_mapping_service_sqlite_backend_bootstrap_and_resolve(tmp_path: Path) -> None:
    sqlite_path = tmp_path / "mapping.sqlite3"
    service = MappingService(store_path=sqlite_path, persist_enabled=True, backend="sqlite")
    payload = service.resolve("v:/cn.highway/dajin/subgrade/DB-01/K15+200")
    assert payload["location"]["stake"] == "K15+200"
    assert payload["containers"]
    exported = service.export_store()
    assert exported["backend"] == "sqlite"
    assert isinstance(exported["sqliteRtreeEnabled"], bool)


def test_mapping_service_sqlite_backend_sync_persistence(tmp_path: Path) -> None:
    sqlite_path = tmp_path / "mapping.sqlite3"
    service = MappingService(store_path=sqlite_path, persist_enabled=True, backend="sqlite")
    service.sync_execution(
        {
            "project_id": "SQLMAP",
            "component_id": "highway.subgrade.compaction.4.2.1.soil@v1",
            "v_address": "v://SQLMAP/K10+001?version=v-init#feature-sql",
            "final_status": "PASS",
            "lifecycle_status": "QUALIFIED",
            "proof": {"proof_hash": "0xsqlite-proof-001"},
            "input": {"inspected_at": "2026-04-21T10:00:00Z"},
        }
    )

    restarted = MappingService(store_path=sqlite_path, persist_enabled=True, backend="sqlite")
    resolved = restarted.resolve(
        "v://SQLMAP/K10+001#feature-sql",
        context={"version": "0xsqlite-proof-001"},
    )
    assert resolved["containers"]
    assert resolved["containers"][0]["projectId"] == "SQLMAP"
    assert resolved["containers"][0]["branchId"] == "feature-sql"
    assert resolved["activeSpecs"][0]["lastProof"] == "0xsqlite-proof-001"
