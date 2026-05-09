from __future__ import annotations

import json
import sqlite3
from abc import ABC, abstractmethod
from copy import deepcopy
from pathlib import Path
from typing import Any, Mapping


class MappingRepositoryError(ValueError):
    """Raised when mapping repository IO/query operations fail."""


class MappingRepository(ABC):
    backend_name: str

    @property
    def supports_query_acceleration(self) -> bool:
        return False

    @property
    def rtree_enabled(self) -> bool:
        return False

    @abstractmethod
    def load(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        raise NotImplementedError

    @abstractmethod
    def save(self, *, containers: list[dict[str, Any]], volumes: list[dict[str, Any]]) -> None:
        raise NotImplementedError

    def find_containers_point(
        self,
        *,
        chainage: int,
        project_id: str | None,
        branch: str | None,
    ) -> list[dict[str, Any]]:
        return []

    def find_containers_range(
        self,
        *,
        start_chainage: int,
        end_chainage: int,
        branch: str | None,
    ) -> list[dict[str, Any]]:
        return []

    def find_volumes_point(
        self,
        *,
        chainage: int,
        project_id: str | None,
        branch: str | None,
        layer: str | None,
    ) -> list[dict[str, Any]]:
        return []


class JsonMappingRepository(MappingRepository):
    backend_name = "json"

    def __init__(self, *, store_path: Path) -> None:
        self._store_path = store_path
        self._store_path.parent.mkdir(parents=True, exist_ok=True)

    def load(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        if not self._store_path.exists():
            return [], []
        try:
            payload = json.loads(self._store_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise MappingRepositoryError(f"failed to load json mapping store: {exc}") from exc

        containers = payload.get("containers")
        volumes = payload.get("volumes")
        if not isinstance(containers, list) or not isinstance(volumes, list):
            return [], []
        normalized_containers = [deepcopy(dict(item)) for item in containers if isinstance(item, Mapping)]
        normalized_volumes = [deepcopy(dict(item)) for item in volumes if isinstance(item, Mapping)]
        return normalized_containers, normalized_volumes

    def save(self, *, containers: list[dict[str, Any]], volumes: list[dict[str, Any]]) -> None:
        payload = {
            "containers": containers,
            "volumes": volumes,
        }
        try:
            self._store_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            raise MappingRepositoryError(f"failed to persist json mapping store: {exc}") from exc


class SQLiteMappingRepository(MappingRepository):
    backend_name = "sqlite"

    def __init__(self, *, store_path: Path) -> None:
        self._store_path = store_path
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        self._rtree_enabled = False
        self._init_schema()

    @property
    def supports_query_acceleration(self) -> bool:
        return True

    @property
    def rtree_enabled(self) -> bool:
        return self._rtree_enabled

    def load(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        try:
            with self._connect() as conn:
                container_rows = conn.execute(
                    "SELECT payload_json FROM mapping_containers ORDER BY station_start ASC, container_id ASC"
                ).fetchall()
                volume_rows = conn.execute(
                    "SELECT payload_json FROM mapping_volumes ORDER BY station_start ASC, volume_id ASC"
                ).fetchall()
        except sqlite3.Error as exc:
            raise MappingRepositoryError(f"failed to load sqlite mapping store: {exc}") from exc
        return _decode_payload_rows(container_rows), _decode_payload_rows(volume_rows)

    def save(self, *, containers: list[dict[str, Any]], volumes: list[dict[str, Any]]) -> None:
        try:
            with self._connect() as conn:
                conn.execute("BEGIN")
                conn.execute("DELETE FROM mapping_containers")
                conn.execute("DELETE FROM mapping_volumes")
                if self._rtree_enabled:
                    conn.execute("DELETE FROM mapping_containers_rtree")
                    conn.execute("DELETE FROM mapping_volumes_rtree")

                for item in containers:
                    container_id = _text(item.get("containerId"))
                    if not container_id:
                        continue
                    station_start = int(item.get("stationStart", -1))
                    station_end = int(item.get("stationEnd", -1))
                    if station_start < 0 or station_end < station_start:
                        continue
                    cursor = conn.execute(
                        """
                        INSERT INTO mapping_containers(
                            container_id, project_id, branch_id, station_start, station_end, payload_json
                        ) VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            container_id,
                            _text(item.get("projectId")) or None,
                            _text(item.get("branchId")) or None,
                            station_start,
                            station_end,
                            json.dumps(item, ensure_ascii=False),
                        ),
                    )
                    if self._rtree_enabled:
                        conn.execute(
                            "INSERT INTO mapping_containers_rtree(container_rowid, station_start, station_end) VALUES (?, ?, ?)",
                            (int(cursor.lastrowid), station_start, station_end),
                        )

                for item in volumes:
                    volume_id = _text(item.get("volumeId"))
                    if not volume_id:
                        continue
                    station_start = int(item.get("stationStart", -1))
                    station_end = int(item.get("stationEnd", -1))
                    if station_start < 0 or station_end < station_start:
                        continue
                    cursor = conn.execute(
                        """
                        INSERT INTO mapping_volumes(
                            volume_id, project_id, branch_id, station_start, station_end, layer, payload_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            volume_id,
                            _text(item.get("projectId")) or None,
                            _text(item.get("branchId")) or None,
                            station_start,
                            station_end,
                            _text(item.get("layer")) or None,
                            json.dumps(item, ensure_ascii=False),
                        ),
                    )
                    if self._rtree_enabled:
                        conn.execute(
                            "INSERT INTO mapping_volumes_rtree(volume_rowid, station_start, station_end) VALUES (?, ?, ?)",
                            (int(cursor.lastrowid), station_start, station_end),
                        )
                conn.commit()
        except sqlite3.Error as exc:
            raise MappingRepositoryError(f"failed to persist sqlite mapping store: {exc}") from exc

    def find_containers_point(
        self,
        *,
        chainage: int,
        project_id: str | None,
        branch: str | None,
    ) -> list[dict[str, Any]]:
        sql, params = self._container_overlap_query(
            overlap_start=chainage,
            overlap_end=chainage,
            project_id=project_id,
            branch=branch,
        )
        rows = self._fetch_rows(sql, params)
        return _decode_payload_rows(rows)

    def find_containers_range(
        self,
        *,
        start_chainage: int,
        end_chainage: int,
        branch: str | None,
    ) -> list[dict[str, Any]]:
        sql, params = self._container_overlap_query(
            overlap_start=start_chainage,
            overlap_end=end_chainage,
            project_id=None,
            branch=branch,
        )
        rows = self._fetch_rows(sql, params)
        return _decode_payload_rows(rows)

    def find_volumes_point(
        self,
        *,
        chainage: int,
        project_id: str | None,
        branch: str | None,
        layer: str | None,
    ) -> list[dict[str, Any]]:
        sql, params = self._volume_overlap_query(
            overlap_start=chainage,
            overlap_end=chainage,
            project_id=project_id,
            branch=branch,
            layer=layer,
        )
        rows = self._fetch_rows(sql, params)
        return _decode_payload_rows(rows)

    def _connect(self) -> sqlite3.Connection:
        try:
            conn = sqlite3.connect(str(self._store_path))
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            return conn
        except sqlite3.Error as exc:
            raise MappingRepositoryError(f"failed to open sqlite mapping store: {exc}") from exc

    def _init_schema(self) -> None:
        try:
            with self._connect() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS mapping_containers (
                        container_id TEXT PRIMARY KEY,
                        project_id TEXT,
                        branch_id TEXT,
                        station_start INTEGER NOT NULL,
                        station_end INTEGER NOT NULL,
                        payload_json TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS mapping_volumes (
                        volume_id TEXT PRIMARY KEY,
                        project_id TEXT,
                        branch_id TEXT,
                        station_start INTEGER NOT NULL,
                        station_end INTEGER NOT NULL,
                        layer TEXT,
                        payload_json TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_mapping_containers_project_branch ON mapping_containers(project_id, branch_id)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_mapping_containers_station ON mapping_containers(station_start, station_end)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_mapping_volumes_project_branch ON mapping_volumes(project_id, branch_id)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_mapping_volumes_station ON mapping_volumes(station_start, station_end)"
                )
                try:
                    conn.execute(
                        """
                        CREATE VIRTUAL TABLE IF NOT EXISTS mapping_containers_rtree
                        USING rtree(container_rowid, station_start, station_end)
                        """
                    )
                    conn.execute(
                        """
                        CREATE VIRTUAL TABLE IF NOT EXISTS mapping_volumes_rtree
                        USING rtree(volume_rowid, station_start, station_end)
                        """
                    )
                    self._rtree_enabled = True
                except sqlite3.OperationalError:
                    self._rtree_enabled = False
        except sqlite3.Error as exc:
            raise MappingRepositoryError(f"failed to initialize sqlite mapping schema: {exc}") from exc

    def _container_overlap_query(
        self,
        *,
        overlap_start: int,
        overlap_end: int,
        project_id: str | None,
        branch: str | None,
    ) -> tuple[str, list[Any]]:
        if self._rtree_enabled:
            alias = "c"
            sql = (
                "SELECT c.payload_json FROM mapping_containers c "
                "JOIN mapping_containers_rtree r ON c.rowid = r.container_rowid "
                "WHERE r.station_end >= ? AND r.station_start <= ?"
            )
        else:
            alias = "mapping_containers"
            sql = "SELECT payload_json FROM mapping_containers WHERE station_end >= ? AND station_start <= ?"
        params: list[Any] = [int(overlap_start), int(overlap_end)]
        if project_id:
            sql += f" AND ({alias}.project_id = ? OR COALESCE({alias}.project_id, '') = '')"
            params.append(project_id)
        if branch:
            sql += f" AND ({alias}.branch_id = ? OR COALESCE({alias}.branch_id, '') = '')"
            params.append(branch)
        return sql, params

    def _volume_overlap_query(
        self,
        *,
        overlap_start: int,
        overlap_end: int,
        project_id: str | None,
        branch: str | None,
        layer: str | None,
    ) -> tuple[str, list[Any]]:
        if self._rtree_enabled:
            alias = "v"
            sql = (
                "SELECT v.payload_json FROM mapping_volumes v "
                "JOIN mapping_volumes_rtree r ON v.rowid = r.volume_rowid "
                "WHERE r.station_end >= ? AND r.station_start <= ?"
            )
        else:
            alias = "mapping_volumes"
            sql = "SELECT payload_json FROM mapping_volumes WHERE station_end >= ? AND station_start <= ?"
        params: list[Any] = [int(overlap_start), int(overlap_end)]
        if project_id:
            sql += f" AND ({alias}.project_id = ? OR COALESCE({alias}.project_id, '') = '')"
            params.append(project_id)
        if branch:
            sql += f" AND ({alias}.branch_id = ? OR COALESCE({alias}.branch_id, '') = '')"
            params.append(branch)
        if layer:
            sql += f" AND {alias}.layer = ?"
            params.append(layer)
        return sql, params

    def _fetch_rows(self, sql: str, params: list[Any]) -> list[tuple[Any]]:
        try:
            with self._connect() as conn:
                return conn.execute(sql, tuple(params)).fetchall()
        except sqlite3.Error as exc:
            raise MappingRepositoryError(f"sqlite query failed: {exc}") from exc


def _decode_payload_rows(rows: list[tuple[Any]]) -> list[dict[str, Any]]:
    decoded: list[dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(str(row[0]))
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if isinstance(payload, Mapping):
            decoded.append(deepcopy(dict(payload)))
    return decoded


def _text(value: Any) -> str:
    return str(value or "").strip()
