from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Mapping

from .space_context_contract import (
    SPACE_CONTAINER_LIFECYCLE_STATES,
    SPACE_PENDING_ACTIONS,
    SPACE_PENDING_ACTION_IDLE,
    SPACE_SPEC_BINDING_STATES,
    SPACE_SPEC_STATUS_DRAFT,
    SPACE_STATE_DRAFT,
)


class SpaceContainerModelError(ValueError):
    """Raised when Space Container payload is invalid."""


@dataclass
class NormExecution:
    specs_bound: list[str] = field(default_factory=list)
    current_state: str = SPACE_STATE_DRAFT
    gate_open: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "specs_bound": list(self.specs_bound),
            "current_state": self.current_state,
            "gate_open": bool(self.gate_open),
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "NormExecution":
        if not isinstance(payload, Mapping):
            raise SpaceContainerModelError("norm_execution must be object")
        specs_raw = payload.get("specs_bound", [])
        if not isinstance(specs_raw, list):
            raise SpaceContainerModelError("norm_execution.specs_bound must be array")
        specs_bound: list[str] = []
        for item in specs_raw:
            value = str(item or "").strip()
            if value:
                specs_bound.append(value)
        if not specs_bound:
            raise SpaceContainerModelError("norm_execution.specs_bound must contain at least one spuId")

        current_state = str(payload.get("current_state", SPACE_STATE_DRAFT)).strip().upper() or SPACE_STATE_DRAFT
        if current_state not in SPACE_CONTAINER_LIFECYCLE_STATES:
            raise SpaceContainerModelError("norm_execution.current_state is invalid")
        gate_open = payload.get("gate_open", True)
        if not isinstance(gate_open, bool):
            raise SpaceContainerModelError("norm_execution.gate_open must be boolean")
        return cls(specs_bound=specs_bound, current_state=current_state, gate_open=gate_open)


@dataclass
class TripBinding:
    inspector: str = ""
    supervisor: str = ""

    def to_dict(self) -> Dict[str, str]:
        return {
            "inspector": self.inspector,
            "supervisor": self.supervisor,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "TripBinding":
        if not isinstance(payload, Mapping):
            raise SpaceContainerModelError("trip_binding must be object")
        return cls(
            inspector=str(payload.get("inspector", "")).strip(),
            supervisor=str(payload.get("supervisor", "")).strip(),
        )


@dataclass
class ContainerRuntime:
    active_form: str = ""
    last_input: str = ""
    pending_action: str = ""

    def to_dict(self) -> Dict[str, str]:
        return {
            "active_form": self.active_form,
            "last_input": self.last_input,
            "pending_action": self.pending_action,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "ContainerRuntime":
        if not isinstance(payload, Mapping):
            raise SpaceContainerModelError("runtime must be object")
        pending_action = str(payload.get("pending_action", SPACE_PENDING_ACTION_IDLE)).strip().upper()
        if pending_action not in SPACE_PENDING_ACTIONS:
            raise SpaceContainerModelError("runtime.pending_action is invalid")
        return cls(
            active_form=str(payload.get("active_form", "")).strip(),
            last_input=str(payload.get("last_input", "")).strip(),
            pending_action=pending_action,
        )


@dataclass
class SpecBinding:
    spuId: str
    status: str = SPACE_SPEC_STATUS_DRAFT
    latest_node: str | None = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "spuId": self.spuId,
            "status": self.status,
            "latest_node": self.latest_node,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpecBinding":
        if not isinstance(payload, Mapping):
            raise SpaceContainerModelError("spec binding must be object")

        spu_id = _as_non_empty_text(payload.get("spuId"), "spec_binding.spuId")
        status = str(payload.get("status", SPACE_SPEC_STATUS_DRAFT)).strip().upper() or SPACE_SPEC_STATUS_DRAFT
        if status not in SPACE_SPEC_BINDING_STATES:
            raise SpaceContainerModelError("spec_binding.status is invalid")

        latest_node_raw = payload.get("latest_node")
        latest_node = None
        if latest_node_raw is not None:
            latest_node_text = str(latest_node_raw).strip()
            if latest_node_text:
                latest_node = latest_node_text

        return cls(spuId=spu_id, status=status, latest_node=latest_node)


@dataclass
class SpaceContainer:
    v_address: str
    geo_slot_ref: str
    norm_execution: NormExecution
    trip_binding: TripBinding = field(default_factory=TripBinding)
    runtime: ContainerRuntime = field(default_factory=ContainerRuntime)
    container_type: str = "execution_instance"
    lifecycle: str = "active"
    lifecycle_state: str = SPACE_STATE_DRAFT
    locked: bool = False
    nodes: list[str] = field(default_factory=list)
    spec_bindings: list[SpecBinding] = field(default_factory=list)
    container_proof: Dict[str, Any] | None = None
    volume_ref: str | None = None
    is_dynamic: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "container_id": _extract_tail_id(self.v_address, prefix="container-"),
            "v_address": self.v_address,
            "container_type": self.container_type,
            "geo_slot_ref": self.geo_slot_ref,
            "slot_ref": self.geo_slot_ref,
            "norm_execution": self.norm_execution.to_dict(),
            "trip_binding": self.trip_binding.to_dict(),
            "runtime": self.runtime.to_dict(),
            "lifecycle": self.lifecycle,
            "lifecycle_state": self.lifecycle_state,
            "locked": bool(self.locked),
            "nodes": list(self.nodes),
            "spec_bindings": [item.to_dict() for item in self.spec_bindings],
            "container_proof": dict(self.container_proof) if isinstance(self.container_proof, dict) else None,
            "volume_ref": self.volume_ref,
            "is_dynamic": bool(self.is_dynamic),
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpaceContainer":
        if not isinstance(payload, Mapping):
            raise SpaceContainerModelError("space container payload must be object")

        container_type = str(payload.get("container_type", "execution_instance")).strip() or "execution_instance"
        if container_type != "execution_instance":
            raise SpaceContainerModelError("space container container_type must be execution_instance")

        is_dynamic = payload.get("is_dynamic", True)
        if not isinstance(is_dynamic, bool):
            raise SpaceContainerModelError("space container is_dynamic must be boolean")

        locked = payload.get("locked", False)
        if not isinstance(locked, bool):
            raise SpaceContainerModelError("space container locked must be boolean")

        raw_nodes = payload.get("nodes", [])
        if raw_nodes is None:
            raw_nodes = []
        if not isinstance(raw_nodes, list):
            raise SpaceContainerModelError("space container nodes must be array")
        nodes: list[str] = []
        for item in raw_nodes:
            text = str(item or "").strip()
            if text:
                nodes.append(text)

        lifecycle_state = str(payload.get("lifecycle_state", SPACE_STATE_DRAFT)).strip().upper() or SPACE_STATE_DRAFT
        if lifecycle_state not in SPACE_CONTAINER_LIFECYCLE_STATES:
            raise SpaceContainerModelError("space container lifecycle_state is invalid")

        container_proof = payload.get("container_proof")
        if container_proof is not None and not isinstance(container_proof, dict):
            raise SpaceContainerModelError("space container container_proof must be object")

        volume_ref_raw = payload.get("volume_ref")
        volume_ref = None
        if volume_ref_raw is not None:
            volume_ref_text = str(volume_ref_raw).strip()
            if volume_ref_text:
                volume_ref = volume_ref_text

        norm_execution = NormExecution.from_dict(payload.get("norm_execution", {}))

        raw_spec_bindings = payload.get("spec_bindings", [])
        if raw_spec_bindings is None:
            raw_spec_bindings = []
        if not isinstance(raw_spec_bindings, list):
            raise SpaceContainerModelError("space container spec_bindings must be array")

        spec_bindings: list[SpecBinding] = []
        spec_binding_ids: set[str] = set()
        for item in raw_spec_bindings:
            binding = SpecBinding.from_dict(item)
            if binding.spuId in spec_binding_ids:
                continue
            spec_binding_ids.add(binding.spuId)
            spec_bindings.append(binding)

        # Backward compatibility: old payloads only had norm_execution.specs_bound.
        for spu_id in norm_execution.specs_bound:
            if spu_id in spec_binding_ids:
                continue
            spec_bindings.append(SpecBinding(spuId=spu_id, status=SPACE_SPEC_STATUS_DRAFT, latest_node=None))
            spec_binding_ids.add(spu_id)

        for binding in spec_bindings:
            if binding.spuId not in norm_execution.specs_bound:
                norm_execution.specs_bound.append(binding.spuId)

        slot_ref_value = payload.get("geo_slot_ref", payload.get("slot_ref"))

        return cls(
            v_address=_as_non_empty_text(payload.get("v_address"), "v_address"),
            container_type=container_type,
            geo_slot_ref=_as_non_empty_text(slot_ref_value, "geo_slot_ref"),
            norm_execution=norm_execution,
            trip_binding=TripBinding.from_dict(payload.get("trip_binding", {})),
            runtime=ContainerRuntime.from_dict(payload.get("runtime", {})),
            lifecycle=_as_non_empty_text(payload.get("lifecycle", "active"), "lifecycle"),
            lifecycle_state=lifecycle_state,
            locked=locked,
            nodes=nodes,
            spec_bindings=spec_bindings,
            container_proof=dict(container_proof) if isinstance(container_proof, dict) else None,
            volume_ref=volume_ref,
            is_dynamic=is_dynamic,
        )


def _as_non_empty_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise SpaceContainerModelError(f"{field_name} is required")
    return text


def _extract_tail_id(v_address: str, *, prefix: str) -> str:
    tail = str(v_address or "").strip().rsplit("/", 1)[-1].strip()
    if not tail:
        return ""
    return f"{prefix}{tail}"
