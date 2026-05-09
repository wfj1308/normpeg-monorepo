from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest


def _ensure_repo_root_on_path() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    repo_root_str = str(repo_root)
    if repo_root_str not in sys.path:
        sys.path.insert(0, repo_root_str)


_ensure_repo_root_on_path()


@pytest.fixture(scope="session", autouse=True)
def _setup_test_env() -> None:
    os.environ.setdefault("LAYERPEG_PROOF_HMAC_KEY", "test-proof-secret")
    chain_file = Path(__file__).resolve().parents[1] / "data" / "proof_chain.jsonl"
    if chain_file.exists():
        chain_file.unlink()
    anchor_file = Path(__file__).resolve().parents[1] / "data" / "proof_anchors.jsonl"
    if anchor_file.exists():
        anchor_file.unlink()


@pytest.fixture(autouse=True)
def _reset_runtime_stores() -> None:
    from backend.app.main import component_registry
    from backend.app.main import project_store
    from backend.app.main import project_utxo_service
    from backend.app.main import space_context_service
    from backend.app.main import specir_index_path
    from backend.app.specir import compile_all_specs_to_registry
    from backend.app.specir import clear_compiled_components

    project_utxo_service.clear()
    project_store.clear()
    space_context_service.clear()
    component_registry.clear_runtime_components()
    clear_compiled_components()
    compile_all_specs_to_registry(index_json_path=specir_index_path, registry=component_registry)
