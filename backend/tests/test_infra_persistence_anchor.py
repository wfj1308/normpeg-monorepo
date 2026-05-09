from __future__ import annotations

import json
import shutil
from pathlib import Path
from uuid import uuid4

from backend.app.core import ComponentRegistry
from backend.app.core import ComponentExecutionEngine
from backend.app.core.proof_chain_store import ProofChainStore
from backend.app.specir import compile_all_specs_to_registry
from backend.app.services.anchor_service import AnchorService
from backend.app.services.project_utxo_service import ProjectUTXOService


def _compaction_input(project_id: str) -> dict:
    return {
        "stake": "K15+200",
        "layer_depth": "0-0.8m",
        "project_id": project_id,
        "compaction_degree": 96.5,
        "representative_value": 96.5,
        "actor_did": "did:test:persist",
        "inspected_at": "2026-04-16T10:00:00Z",
        "override_requested": False,
    }


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _workspace_tmp_dir() -> Path:
    root = _repo_root() / "backend" / "tests" / "_tmp"
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"infra-{uuid4().hex}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def test_project_utxo_service_persistence_roundtrip() -> None:
    temp_dir = _workspace_tmp_dir()
    try:
        store_path = temp_dir / "project_utxo_store.json"
        proof_chain_path = temp_dir / "proof_chain.jsonl"
        decision_chain_path = temp_dir / "decision_chain.jsonl"
        registry = ComponentRegistry(base_dir=temp_dir)
        compile_all_specs_to_registry(_repo_root() / "norms" / "index.json", registry=registry)
        engine = ComponentExecutionEngine(registry=registry, proof_chain_store=ProofChainStore(chain_file=proof_chain_path))

        service = ProjectUTXOService(
            proof_chain_store=ProofChainStore(chain_file=decision_chain_path),
            store_path=store_path,
            persist_enabled=True,
        )
        result = service.execute_component_in_branch(
            component_id="JTG_F80_1_2017.4.2.1.compaction",
            input_payload=_compaction_input("P-PERSIST-001"),
            branch_id="main",
            execution_engine=engine,
        )
        execution_id = result["execution_id"]
        service.record_execution(result, branch_id="main")

        service_reloaded = ProjectUTXOService(
            proof_chain_store=ProofChainStore(chain_file=decision_chain_path),
            store_path=store_path,
            persist_enabled=True,
        )
        overview = service_reloaded.get_branch_overview("P-PERSIST-001")
        assert overview["project_id"] == "P-PERSIST-001"
        assert overview["current_branch"] == "main"
        assert "main" in overview["branches"]

        full_proof = service_reloaded.build_full_proof(execution_id)
        assert full_proof["execution_id"] == execution_id
        assert full_proof["project_id"] == "P-PERSIST-001"
        chain_entries = [json.loads(line) for line in proof_chain_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        assert chain_entries
        latest_entry = chain_entries[-1]
        assert latest_entry["execution_id"] == execution_id
        assert latest_entry["spec_anchor"]["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
        assert latest_entry["spec_anchor"]["version"] == result["spec_version"]
        assert latest_entry["spec_anchor"]["hash"] == result["compile_hash"]
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_anchor_service_webhook_mode(monkeypatch) -> None:
    class _FakeResponse:
        def __init__(self, body: bytes) -> None:
            self._body = body

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            return False

        def read(self) -> bytes:
            return self._body

    def _fake_urlopen(req, timeout=0):  # noqa: ANN001
        assert req.full_url == "https://anchor.example/hook"
        payload = {
            "status": "ANCHORED",
            "external_ref": "tx:0xabc123",
            "anchor_id": "anchor_external_001",
        }
        return _FakeResponse(json.dumps(payload).encode("utf-8"))

    monkeypatch.setattr("backend.app.services.anchor_service.url_request.urlopen", _fake_urlopen)

    temp_dir = _workspace_tmp_dir()
    try:
        service = AnchorService(
            store_path=temp_dir / "proof_anchors.jsonl",
            mode="webhook",
            webhook_url="https://anchor.example/hook",
        )
        created = service.create_anchor(
            proof_hash="proof_hash_001_abcdef",
            anchor_type="mock_anchor",
            target_system="external_anchor",
        )
        assert created["anchor_id"] == "anchor_external_001"
        assert created["status"] == "ANCHORED"
        assert created["external_ref"] == "tx:0xabc123"

        listed = service.list_anchors("proof_hash_001_abcdef")
        assert len(listed) == 1
        assert listed[0]["anchor_id"] == "anchor_external_001"
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
