from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List


class ProofChainStoreError(ValueError):
    """Raised when proof chain persistence fails."""


class ProofChainStore:
    """Append-only local proof chain store for tamper-evident linkage."""

    def __init__(self, chain_file: Path | None = None) -> None:
        self.chain_file = chain_file or Path(__file__).resolve().parents[2] / "data" / "proof_chain.jsonl"
        self.chain_file.parent.mkdir(parents=True, exist_ok=True)

    def append(self, execution_id: str, proof_hash: str, proof_metadata: Dict[str, Any] | None = None) -> Dict[str, Any]:
        if not execution_id or not proof_hash:
            raise ProofChainStoreError("execution_id and proof_hash are required")

        previous = self._read_last()
        previous_chain_hash = str(previous.get("chain_hash", "")) if previous else ""
        ledger_index = int(previous.get("ledger_index", 0)) + 1 if previous else 1

        source = f"{previous_chain_hash}|{execution_id}|{proof_hash}"
        chain_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()

        entry = {
            "ledger_index": ledger_index,
            "execution_id": execution_id,
            "proof_hash": proof_hash,
            "previous_chain_hash": previous_chain_hash,
            "chain_hash": chain_hash,
        }
        if isinstance(proof_metadata, dict):
            spec_anchor = proof_metadata.get("spec_anchor")
            if isinstance(spec_anchor, dict):
                entry["spec_anchor"] = spec_anchor
        self._append_line(entry)

        all_entries = self._read_all()
        leaf_index = max(0, len(all_entries) - 1)
        merkle = _build_merkle_proof([str(item.get("proof_hash", "")) for item in all_entries], leaf_index)
        entry["merkle_root"] = merkle["merkle_root"]
        entry["proof_path"] = merkle["proof_path"]
        entry["merkle_leaf_index"] = leaf_index
        entry["merkle_tree_size"] = len(all_entries)
        return entry

    def _read_last(self) -> Dict[str, Any] | None:
        if not self.chain_file.exists():
            return None
        last_line = ""
        with self.chain_file.open("r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    last_line = line
        if not last_line:
            return None
        try:
            payload = json.loads(last_line)
        except json.JSONDecodeError as exc:
            raise ProofChainStoreError("invalid proof chain line format") from exc
        if not isinstance(payload, dict):
            raise ProofChainStoreError("invalid proof chain entry")
        return payload

    def _read_all(self) -> List[Dict[str, Any]]:
        if not self.chain_file.exists():
            return []
        entries: List[Dict[str, Any]] = []
        with self.chain_file.open("r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ProofChainStoreError("invalid proof chain line format") from exc
                if not isinstance(payload, dict):
                    raise ProofChainStoreError("invalid proof chain entry")
                entries.append(payload)
        return entries

    def _append_line(self, payload: Dict[str, Any]) -> None:
        with self.chain_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            f.write("\n")


def _build_merkle_proof(leaves: List[str], leaf_index: int) -> Dict[str, Any]:
    normalized = [item for item in leaves if item]
    if not normalized:
        return {"merkle_root": "", "proof_path": []}
    if leaf_index < 0 or leaf_index >= len(normalized):
        raise ProofChainStoreError("invalid merkle leaf index")

    path: List[Dict[str, str]] = []
    cursor = leaf_index
    level = list(normalized)

    while len(level) > 1:
        if len(level) % 2 == 1:
            level = level + [level[-1]]
        is_right = cursor % 2 == 1
        sibling_index = cursor - 1 if is_right else cursor + 1
        path.append(
            {
                "sibling_hash": level[sibling_index],
                "direction": "left" if is_right else "right",
            }
        )
        next_level: List[str] = []
        for index in range(0, len(level), 2):
            next_level.append(hashlib.sha256(f"{level[index]}:{level[index + 1]}".encode("utf-8")).hexdigest())
        level = next_level
        cursor = cursor // 2

    return {
        "merkle_root": level[0],
        "proof_path": path,
    }
