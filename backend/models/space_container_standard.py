from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Mapping

from .space_container import SpaceContainer


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_spec_status(status: str) -> str:
    value = str(status or "").strip().upper()
    if value == "PASS":
        return "completed"
    if value == "FAIL":
        return "failed"
    if value == "RUNNING":
        return "running"
    return "pending"


@dataclass
class StandardGeoReference:
    station: str
    coord_system: str
    coords: Dict[str, float]
    gps: Dict[str, float]
    alignment: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "station": self.station,
            "coord_system": self.coord_system,
            "coords": dict(self.coords),
            "gps": dict(self.gps),
            "alignment": self.alignment,
        }


@dataclass
class StandardApplicableSpec:
    spuId: str
    status: str
    attempts: int
    latest_node: str | None
    depends_on: list[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "spuId": self.spuId,
            "status": self.status,
            "attempts": self.attempts,
            "latest_node": self.latest_node,
            "depends_on": list(self.depends_on),
        }


@dataclass
class StandardNormExecution:
    applicable_specs: list[StandardApplicableSpec] = field(default_factory=list)
    current_state: str = "draft"
    gate_status: str = "awaiting_lab"
    execution_order: list[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "applicable_specs": [item.to_dict() for item in self.applicable_specs],
            "current_state": self.current_state,
            "gate_status": self.gate_status,
            "execution_order": list(self.execution_order),
        }


@dataclass
class StandardRuntime:
    active_spec: str | None = None
    active_form: str = ""
    pending_actions: list[str] = field(default_factory=list)
    pending_signatures: list[str] = field(default_factory=list)
    last_action: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "active_spec": self.active_spec,
            "active_form": self.active_form,
            "pending_actions": list(self.pending_actions),
            "pending_signatures": list(self.pending_signatures),
            "last_action": self.last_action,
        }


@dataclass
class StandardLifecycle:
    state: str = "ACTIVE"
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class SpaceContainerStandard:
    v_address: str
    container_type: str
    geo_reference: StandardGeoReference
    norm_execution: StandardNormExecution
    runtime: StandardRuntime
    lifecycle: StandardLifecycle

    def to_dict(self) -> Dict[str, Any]:
        return {
            "v_address": self.v_address,
            "container_type": self.container_type,
            "geo_reference": self.geo_reference.to_dict(),
            "norm_execution": self.norm_execution.to_dict(),
            "runtime": self.runtime.to_dict(),
            "lifecycle": self.lifecycle.to_dict(),
        }


def build_standard_space_container(
    container: SpaceContainer,
    *,
    slot_payload: Mapping[str, Any] | None = None,
    node_history: list[Mapping[str, Any]] | None = None,
) -> SpaceContainerStandard:
    slot_geo: Mapping[str, Any] = {}
    if isinstance(slot_payload, Mapping):
        maybe_geo = slot_payload.get("geo")
        if isinstance(maybe_geo, Mapping):
            slot_geo = maybe_geo

    station = str(slot_geo.get("station", "")).strip() or "K19+070"
    x = float(slot_geo.get("x", 0.0) or 0.0)
    y = float(slot_geo.get("y", 0.0) or 0.0)
    z = float(slot_geo.get("elevation", 0.0) or 0.0)
    alignment = str(slot_geo.get("alignment", "")).strip()

    execution_order = list(container.norm_execution.specs_bound)
    applicable_specs: list[StandardApplicableSpec] = []
    for index, spu_id in enumerate(execution_order):
        binding = next((item for item in container.spec_bindings if item.spuId == spu_id), None)
        attempts = 0
        if binding is not None:
            attempts = sum(
                1
                for item in (node_history or [])
                if str(item.get("spu_id", "")).strip() == spu_id
            )
        depends_on = [execution_order[index - 1]] if index > 0 else []
        applicable_specs.append(
            StandardApplicableSpec(
                spuId=spu_id,
                status=_normalize_spec_status(binding.status if binding is not None else "DRAFT"),
                attempts=attempts,
                latest_node=binding.latest_node if binding is not None else None,
                depends_on=depends_on,
            )
        )

    active_binding = next((item for item in container.spec_bindings if item.status == "RUNNING"), None)
    if active_binding is None:
        active_binding = next((item for item in container.spec_bindings if item.status == "DRAFT"), None)

    gate_status = "awaiting_lab"
    if any(item.status == "FAIL" for item in container.spec_bindings):
        gate_status = "needs_retest"
    elif any(item.status == "RUNNING" for item in container.spec_bindings):
        gate_status = "in_execution"
    elif container.lifecycle_state == "ARCHIVED":
        gate_status = "archived"

    history_times: list[str] = []
    for item in (node_history or []):
        created_at = str(item.get("created_at", "")).strip()
        updated_at = str(item.get("completed_at") or item.get("created_at") or "").strip()
        if created_at:
            history_times.append(created_at)
        if updated_at:
            history_times.append(updated_at)
    history_times.sort()
    created_at = history_times[0] if history_times else _utc_now()
    updated_at = history_times[-1] if history_times else _utc_now()

    return SpaceContainerStandard(
        v_address=container.v_address,
        container_type="space",
        geo_reference=StandardGeoReference(
            station=station,
            coord_system="CGCS2000",
            coords={"X": x, "Y": y, "Z": z},
            gps={"lat": 0.0, "lng": 0.0},
            alignment=alignment,
        ),
        norm_execution=StandardNormExecution(
            applicable_specs=applicable_specs,
            current_state=str(container.lifecycle_state or "DRAFT").lower(),
            gate_status=gate_status,
            execution_order=execution_order,
        ),
        runtime=StandardRuntime(
            active_spec=active_binding.spuId if active_binding is not None else None,
            active_form=active_binding.spuId if active_binding is not None else "",
            pending_actions=["fill_form", "submit_test"] if container.lifecycle_state != "ARCHIVED" else [],
            pending_signatures=[],
            last_action=updated_at,
        ),
        lifecycle=StandardLifecycle(
            state="ARCHIVED" if container.lifecycle_state == "ARCHIVED" else "ACTIVE",
            created_at=created_at,
            updated_at=updated_at,
        ),
    )
