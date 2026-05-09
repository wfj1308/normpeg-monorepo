from __future__ import annotations

import copy
import json
import shutil
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.core import ComponentRegistry
from backend.app.main import app
from backend.app.services import ComponentRegistryService


def _load_template_definition() -> Dict[str, Any]:
    source = Path(__file__).resolve().parents[1] / "app" / "components" / "instances" / "compaction.component.json"
    with source.open("r", encoding="utf-8-sig") as f:
        payload = json.load(f)
    if not isinstance(payload, dict):
        raise ValueError("template component must be object")
    return payload


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_tmp_dir() -> Path:
    root = _repo_root() / "backend" / "tests" / "_tmp"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"component-registry-{uuid4().hex}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def _build_definition(
    template: Dict[str, Any],
    *,
    status: str = "active",
    tags: list[str] | None = None,
) -> Dict[str, Any]:
    definition = copy.deepcopy(template)
    definition["status"] = status
    metadata = definition.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    metadata["tags"] = list(tags or [])
    definition["metadata"] = metadata
    return definition


def _build_registry_client(base_dir: Path, monkeypatch) -> TestClient:
    registry = ComponentRegistry(base_dir=base_dir)
    service = ComponentRegistryService(registry=registry)
    monkeypatch.setattr(main_module, "component_registry", registry)
    monkeypatch.setattr(main_module, "component_registry_service", service)
    monkeypatch.setattr(main_module.execution_engine, "registry", registry)
    return TestClient(app)


def test_component_registry_register_latest_and_versions_api(monkeypatch) -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        client = _build_registry_client(temp_dir, monkeypatch)
        template = _load_template_definition()
        component_id = "JTG_F80_1_2017.4.2.1.compaction_registry_demo"

        v1 = client.post(
            "/api/v1/component/register",
            json={
                "catalog_id": "JTG_F80_1_2017",
                "component_id": component_id,
                "component_name": "Compaction Registry Demo",
                "version": "v1.0.0",
                "definition": _build_definition(template, status="active", tags=["earthwork"]),
            },
        )
        assert v1.status_code == 200

        v2 = client.post(
            "/api/v1/component/register",
            json={
                "catalog_id": "JTG_F80_1_2017",
                "component_id": component_id,
                "component_name": "Compaction Registry Demo",
                "version": "v1.1.0",
                "definition": _build_definition(template, status="active", tags=["earthwork", "registry"]),
            },
        )
        assert v2.status_code == 200

        latest = client.get(f"/api/v1/components/{component_id}")
        assert latest.status_code == 200
        latest_payload = latest.json()
        assert latest_payload["component_id"] == component_id
        assert latest_payload["version"] == "v1.1.0"

        versions = client.get(f"/api/v1/components/{component_id}/versions")
        assert versions.status_code == 200
        items = versions.json()["items"]
        assert [item["version"] for item in items] == ["v1.1.0", "v1.0.0"]
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_component_registry_list_with_filters_api(monkeypatch) -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        client = _build_registry_client(temp_dir, monkeypatch)
        template = _load_template_definition()

        payloads = [
            {
                "catalog_id": "CAT-A",
                "component_id": "demo.component.a",
                "component_name": "Component A",
                "version": "v1.0.0",
                "definition": _build_definition(template, status="active", tags=["qa", "earthwork"]),
            },
            {
                "catalog_id": "CAT-B",
                "component_id": "demo.component.b",
                "component_name": "Component B",
                "version": "v1.0.0",
                "definition": _build_definition(template, status="draft", tags=["flatness"]),
            },
        ]
        for item in payloads:
            response = client.post("/api/v1/component/register", json=item)
            assert response.status_code == 200

        all_items = client.get("/api/v1/components")
        assert all_items.status_code == 200
        all_list = all_items.json()["items"]
        assert len(all_list) == 2
        assert all("component_id" in item and "component_name" in item for item in all_list)

        catalog_filtered = client.get("/api/v1/components", params={"catalog_id": "CAT-A"})
        assert catalog_filtered.status_code == 200
        catalog_items = catalog_filtered.json()["items"]
        assert len(catalog_items) == 1
        assert catalog_items[0]["component_id"] == "demo.component.a"

        status_filtered = client.get("/api/v1/components", params={"status": "active"})
        assert status_filtered.status_code == 200
        status_items = status_filtered.json()["items"]
        assert len(status_items) == 1
        assert status_items[0]["component_id"] == "demo.component.a"

        tag_filtered = client.get("/api/v1/components", params={"tag": "qa"})
        assert tag_filtered.status_code == 200
        tag_items = tag_filtered.json()["items"]
        assert len(tag_items) == 1
        assert tag_items[0]["component_id"] == "demo.component.a"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
