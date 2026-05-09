from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict


@dataclass(frozen=True)
class SpecIRDocument:
    """In-memory representation of a loaded SpecIR YAML document."""

    spec_id: str
    spec_type: str
    version: str
    namespace: str
    semantics: Dict[str, Any]
    logic: Dict[str, Any]
    inputs: Dict[str, Any]
    path: Dict[str, Any]
    gate: Dict[str, Any]
    state: Dict[str, Any]
    proof: Dict[str, Any]
    metadata: Dict[str, Any]
    source_file: str
    raw: Dict[str, Any] = field(default_factory=dict)
    warnings: tuple[str, ...] = field(default_factory=tuple)

    def core_fields_preview(self) -> Dict[str, Any]:
        semantics = self.semantics if isinstance(self.semantics, dict) else {}
        proof = self.proof if isinstance(self.proof, dict) else {}

        return {
            "type": self.spec_type,
            "version": self.version,
            "namespace": self.namespace,
            "spec_id": self.spec_id,
            "name": semantics.get("name"),
            "work_item": semantics.get("work_item"),
            "measured_item": semantics.get("measured_item"),
            "logic_sections": sorted(self.logic.keys()),
            "input_sections": sorted(self.inputs.keys()),
            "proof_sections": sorted(proof.keys()),
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True)
class SpecIRRegistryEntry:
    """Registry record for one spec entry from index.json."""

    spec_id: str
    source_file: str
    loaded_status: str
    document: SpecIRDocument | None = None
    error: str | None = None

    def to_debug_payload(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "spec_id": self.spec_id,
            "source_file": self.source_file,
            "loaded_status": self.loaded_status,
            "core_fields_preview": {},
        }
        if self.document is not None:
            payload["core_fields_preview"] = self.document.core_fields_preview()
        if self.error:
            payload["error"] = self.error
        return payload
