from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.core import ComponentRegistry
from backend.app.main import app
from backend.app.specir import compile_all_specs_to_registry, compile_spec_to_component, load_spec


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_tmp_dir() -> Path:
    root = _repo_root() / "backend" / "tests" / "_tmp"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"specir-compiler-{uuid4().hex}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_compaction_spec_can_compile_to_executable_component() -> None:
    spec_path = _repo_root() / "norms" / "JTG_F80_1_2017" / "4.2.1.compaction.spec.yaml"
    doc = load_spec(spec_path)
    component = compile_spec_to_component(doc)

    temp_dir = _workspace_tmp_dir()
    try:
        registry = ComponentRegistry(base_dir=temp_dir)
        registry.validate_component_payload(component, source_label="compiled_compaction")

        assert component["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
        assert component["metadata"]["source"] == "specir_compiler"
        assert component["metadata"]["specir_spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_compiled_component_fields_are_complete() -> None:
    spec_path = _repo_root() / "norms" / "JTG_F80_1_2017" / "4.2.1.compaction.spec.yaml"
    doc = load_spec(spec_path)
    component = compile_spec_to_component(doc)

    assert isinstance(component["input_dto"], dict) and component["input_dto"]
    assert isinstance(component["output_dto"], dict) and component["output_dto"]
    assert isinstance(component["path"], dict) and component["path"].get("steps")
    assert isinstance(component["gate"], dict) and component["gate"].get("rules")
    assert isinstance(component["state"], dict) and component["state"].get("allowed_transitions")
    assert isinstance(component["proof"], dict) and component["proof"].get("proof_fields")
    assert isinstance(component["patches"], list)
    assert isinstance(component["overrides"], list)


def test_compile_all_specs_can_be_registered_and_recognized() -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        registry = ComponentRegistry(base_dir=temp_dir)
        compiled = compile_all_specs_to_registry(_repo_root() / "norms" / "index.json", registry=registry)

        assert set(compiled.keys()) == {
            "JTG_F80_1_2017.4.2.1.compaction",
            "JTG_F80_1_2017.4.2.2.deflection",
            "JTG_F80_1_2017.4.2.3.thickness",
            "JTG_3450_2019.T0921",
        }

        compaction = registry.get_component("JTG_F80_1_2017.4.2.1.compaction")
        assert compaction["metadata"]["source"] == "specir_compiler"
        assert compaction["component_id"] == "JTG_F80_1_2017.4.2.1.compaction"
        test_method = registry.get_component("JTG_3450_2019.T0921")
        assert test_method["metadata"]["source"] == "specir_compiler"
        assert test_method["component_id"] == "JTG_3450_2019.T0921"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_specir_compile_api_and_compiled_api(monkeypatch) -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        registry = ComponentRegistry(base_dir=temp_dir)
        monkeypatch.setattr(main_module, "component_registry", registry)
        monkeypatch.setattr(main_module.execution_engine, "registry", registry)

        client = TestClient(app)
        spec_id = "JTG_F80_1_2017.4.2.1.compaction"

        compile_resp = client.post(f"/api/v1/specir/compile/{spec_id}")
        assert compile_resp.status_code == 200
        compile_payload = compile_resp.json()
        assert compile_payload["spec_id"] == spec_id
        assert compile_payload["compiled_status"] == "compiled"
        assert compile_payload["registry_source"] == "runtime"

        compiled_resp = client.get(f"/api/v1/specir/compiled/{spec_id}")
        assert compiled_resp.status_code == 200
        compiled_payload = compiled_resp.json()
        assert compiled_payload["spec_id"] == spec_id
        assert compiled_payload["compiled_status"] == "compiled"
        assert compiled_payload["component"]["component_id"] == spec_id

        from_registry = registry.get_component(spec_id)
        assert from_registry["metadata"]["source"] == "specir_compiler"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_specir_compile_spu_api(monkeypatch) -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        registry = ComponentRegistry(base_dir=temp_dir)
        monkeypatch.setattr(main_module, "component_registry", registry)
        monkeypatch.setattr(main_module.execution_engine, "registry", registry)

        client = TestClient(app)
        spec_id = "JTG_F80_1_2017.4.2.1.compaction"
        resp = client.post(f"/api/v1/specir/compile-spu/{spec_id}")
        assert resp.status_code == 200
        payload = resp.json()

        assert payload["spec_id"] == spec_id
        assert payload["compiled_status"] == "compiled"
        assert payload["spu"]["spuId"] == spec_id
        assert payload["validation"]["valid"] is True
        assert isinstance(payload["reviewRequired"], bool)
        assert isinstance(payload["reviewFlags"], list)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_compile_hash_changes_when_spec_content_changes() -> None:
    source_path = _repo_root() / "norms" / "JTG_F80_1_2017" / "4.2.1.compaction.spec.yaml"
    original = source_path.read_text(encoding="utf-8")

    temp_dir = _workspace_tmp_dir()
    try:
        first_path = temp_dir / "compaction_a.spec.yaml"
        second_path = temp_dir / "compaction_b.spec.yaml"
        first_path.write_text(original, encoding="utf-8")
        second_path.write_text(
            original.replace(
                "Earthwork subgrade compaction executable specification",
                "Earthwork subgrade compaction executable specification updated",
                1,
            ),
            encoding="utf-8",
        )

        first_component = compile_spec_to_component(load_spec(first_path))
        second_component = compile_spec_to_component(load_spec(second_path))

        first_hash = first_component["metadata"]["compile_hash"]
        second_hash = second_component["metadata"]["compile_hash"]
        assert isinstance(first_hash, str) and len(first_hash) == 64
        assert isinstance(second_hash, str) and len(second_hash) == 64
        assert first_hash != second_hash
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
