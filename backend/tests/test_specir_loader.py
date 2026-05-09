from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.specir.loader import SpecIRLoaderError, build_registry_from_index, load_all_specs, load_spec


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_tmp_dir() -> Path:
    root = _repo_root() / "backend" / "tests" / "_tmp"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"specir-{uuid4().hex}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_load_core_measured_item_and_test_method_specs() -> None:
    measured_dir = _repo_root() / "norms" / "JTG_F80_1_2017"
    method_dir = _repo_root() / "norms" / "JTG_3450_2019"
    files = [
        measured_dir / "4.2.1.compaction.spec.yaml",
        measured_dir / "4.2.2.deflection.spec.yaml",
        measured_dir / "4.2.3.thickness.spec.yaml",
        method_dir / "T0921.sand_cone.spec.yaml",
    ]

    loaded_ids: list[str] = []
    for path in files:
        doc = load_spec(path)
        loaded_ids.append(doc.spec_id)
        assert doc.spec_id
        assert doc.spec_type == "executable_spec"
        assert doc.version
        assert doc.namespace
        assert isinstance(doc.semantics, dict)
        assert isinstance(doc.logic, dict)
        assert isinstance(doc.inputs, dict)
        assert isinstance(doc.path, dict)
        assert isinstance(doc.gate, dict)
        assert isinstance(doc.state, dict)
        assert isinstance(doc.proof, dict)
        assert isinstance(doc.metadata, dict)
        assert doc.source_file.endswith(".spec.yaml")

    assert loaded_ids == [
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
        "JTG_3450_2019.T0921",
    ]


def test_load_all_specs_from_norms_dir() -> None:
    docs = load_all_specs(_repo_root() / "norms")
    assert "JTG_F80_1_2017.4.2.1.compaction" in docs
    assert "JTG_F80_1_2017.4.2.2.deflection" in docs
    assert "JTG_F80_1_2017.4.2.3.thickness" in docs
    assert "JTG_3450_2019.T0921" in docs


def test_build_registry_from_index_registers_expanded_specs() -> None:
    registry = build_registry_from_index(_repo_root() / "norms" / "index.json")

    assert len(registry) == 6
    assert sorted(registry.keys()) == [
        "JTG_3450_2019.T0921",
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
        "JTG_F80_1_2017.5.2.1.pavement_compaction",
        "JTG_F80_1_2017.8.1.1.pile_concrete_strength",
    ]

    for entry in registry.values():
        assert entry.loaded_status == "loaded"
        assert entry.document is not None


def test_specir_debug_api_list_and_get() -> None:
    client = TestClient(app)

    list_resp = client.get("/api/v1/specir/specs")
    assert list_resp.status_code == 200
    payload = list_resp.json()
    assert payload["count"] == 6
    assert len(payload["items"]) == 6

    get_resp = client.get("/api/v1/specir/specs/JTG_F80_1_2017.4.2.1.compaction")
    assert get_resp.status_code == 200
    item = get_resp.json()
    assert item["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert item["loaded_status"] == "loaded"
    assert "document" in item
    assert item["document"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert item["document"]["type"] == "executable_spec"
    assert "inputs" in item["document"]
    assert "path" in item["document"]
    assert "gate" in item["document"]
    assert "state" in item["document"]

    method_resp = client.get("/api/v1/specir/specs/JTG_3450_2019.T0921")
    assert method_resp.status_code == 200
    method_item = method_resp.json()
    assert method_item["spec_id"] == "JTG_3450_2019.T0921"
    assert method_item["document"]["semantics"]["test_method"] == "T0921"


def test_load_spec_rejects_missing_required_standard_field() -> None:
    temp_dir = _workspace_tmp_dir()
    spec_path = temp_dir / "invalid_missing_field.spec.yaml"
    spec_path.write_text(
        "\n".join(
            [
                "type: executable_spec",
                "version: v0.1.0",
                "namespace: demo.spec",
                "semantics: {}",
                "logic: {}",
                "inputs: {}",
                "path: {}",
                "gate: {}",
                "state: {}",
                "proof: {}",
                "metadata: {}",
            ]
        ),
        encoding="utf-8",
    )

    try:
        with pytest.raises(SpecIRLoaderError, match="spec schema validation failed"):
            load_spec(spec_path)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_load_spec_warns_on_extra_top_level_field_but_still_passes() -> None:
    temp_dir = _workspace_tmp_dir()
    spec_path = temp_dir / "warn_extra_field.spec.yaml"
    spec_path.write_text(
        "\n".join(
            [
                "spec_id: demo.spec",
                "type: executable_spec",
                "version: v0.1.0",
                "namespace: demo.spec",
                "semantics: {}",
                "logic: {}",
                "inputs:",
                "  input_dto:",
                "    actor_did:",
                "      type: string",
                "      required: true",
                "path:",
                "  steps:",
                "    - step_id: s1",
                "      action: formula",
                "      formula_ref: f1",
                "      output_field: o1",
                "  formulas:",
                "    f1: actor_did",
                "gate:",
                "  rules:",
                "    - rule_id: g1",
                "      condition: actor_did == actor_did",
                "      severity: blocking",
                "      on_fail: block",
                "state:",
                "  initial_state: DRAFT",
                "  states: [DRAFT, QUALIFIED]",
                "  allowed_transitions:",
                "    - from_state: DRAFT",
                "      to_state: QUALIFIED",
                "      trigger: ok",
                "  terminal_states: [QUALIFIED]",
                "proof: {}",
                "metadata: {}",
                "compatibility: {}",
            ]
        ),
        encoding="utf-8",
    )

    try:
        with pytest.warns(UserWarning, match="extra top-level SpecIR field 'compatibility'"):
            doc = load_spec(spec_path)

        assert doc.spec_id == "demo.spec"
        assert doc.warnings
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
