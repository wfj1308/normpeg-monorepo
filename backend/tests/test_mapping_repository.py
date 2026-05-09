from __future__ import annotations

from pathlib import Path

from backend.app.services.mapping_repository import JsonMappingRepository, SQLiteMappingRepository


def _sample_containers() -> list[dict]:
    return [
        {
            "containerId": "C-1",
            "projectId": "P1",
            "branchId": "main",
            "stationStart": 1000,
            "stationEnd": 1100,
            "versions": ["v1"],
            "specs": [],
            "pendingActions": [],
            "runtime": {"state": "active"},
            "history": [],
            "type": "subgrade",
            "vuri": "v://P1/K1+000#main",
        }
    ]


def _sample_volumes() -> list[dict]:
    return [
        {
            "volumeId": "V-1",
            "containerId": "C-1",
            "projectId": "P1",
            "branchId": "main",
            "stationStart": 1000,
            "stationEnd": 1100,
            "layer": "zone-96",
            "quantity": 1.0,
            "geometry": {},
        }
    ]


def test_json_mapping_repository_roundtrip(tmp_path: Path) -> None:
    repo = JsonMappingRepository(store_path=tmp_path / "mapping.json")
    containers = _sample_containers()
    volumes = _sample_volumes()
    repo.save(containers=containers, volumes=volumes)
    loaded_containers, loaded_volumes = repo.load()
    assert loaded_containers[0]["containerId"] == "C-1"
    assert loaded_volumes[0]["volumeId"] == "V-1"


def test_sqlite_mapping_repository_roundtrip_and_query(tmp_path: Path) -> None:
    repo = SQLiteMappingRepository(store_path=tmp_path / "mapping.sqlite3")
    containers = _sample_containers()
    volumes = _sample_volumes()
    repo.save(containers=containers, volumes=volumes)

    loaded_containers, loaded_volumes = repo.load()
    assert loaded_containers[0]["containerId"] == "C-1"
    assert loaded_volumes[0]["volumeId"] == "V-1"

    point_hit = repo.find_containers_point(chainage=1050, project_id="P1", branch="main")
    assert point_hit and point_hit[0]["containerId"] == "C-1"

    range_hit = repo.find_containers_range(start_chainage=900, end_chainage=1200, branch="main")
    assert range_hit and range_hit[0]["containerId"] == "C-1"

    volume_hit = repo.find_volumes_point(chainage=1050, project_id="P1", branch="main", layer="zone-96")
    assert volume_hit and volume_hit[0]["volumeId"] == "V-1"
