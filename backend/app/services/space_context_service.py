from __future__ import annotations

import json
import os
import re
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping
from uuid import uuid4

from backend.models.space_container import (
    ContainerRuntime,
    NormExecution,
    SpaceContainer,
    SpaceContainerModelError,
    SpecBinding,
    TripBinding,
)
from backend.models.space_container_standard import build_standard_space_container
from backend.models.space_context_contract import (
    SPACE_CONTAINER_PROOF_REQUIRED_FIELDS,
    SPACE_NODE_RESULT_STATES,
    SPACE_PENDING_ACTION_EXECUTE_NODE,
    SPACE_PENDING_ACTION_IDLE,
    SPACE_PENDING_ACTION_LOCKED,
    SPACE_PENDING_ACTION_MANUAL_REVIEW,
    SPACE_PENDING_ACTION_READY_TO_ARCHIVE,
    SPACE_PENDING_ACTION_RETEST,
    SPACE_SPEC_STATUS_DRAFT,
    SPACE_SPEC_STATUS_PASS,
    SPACE_SPEC_STATUS_RUNNING,
    SPACE_STATE_ARCHIVED,
    SPACE_STATE_DRAFT,
    SPACE_STATE_REJECTED,
    SPACE_STATE_RUNNING,
    SPACE_STATE_VALIDATED,
)
from backend.app.state_machine import (
    STATE_SCOPE_CONTAINER,
    STATE_SCOPE_NODE,
    StateTransitionError,
    transition as state_transition,
)
from backend.models.space_slot import SpaceSlot, SpaceSlotGeo, SpaceSlotModelError


class SpaceContextServiceError(ValueError):
    """Raised when Space Slot / Space Container operations fail."""


class SpaceContextService:
    def __init__(self, *, store_path: Path | None = None, persist_enabled: bool | None = None) -> None:
        self._slots: Dict[str, SpaceSlot] = {}
        self._containers: Dict[str, SpaceContainer] = {}
        self._nodes: Dict[str, Dict[str, Any]] = {}
        self._store_path = store_path or (Path(__file__).resolve().parents[2] / "data" / "space_context_store.json")
        self._store_path.parent.mkdir(parents=True, exist_ok=True)
        if persist_enabled is None:
            self._persist_enabled = _default_persist_enabled()
        else:
            self._persist_enabled = bool(persist_enabled)
        self._load_store()

    def clear(self) -> None:
        self._slots = {}
        self._containers = {}
        self._nodes = {}
        if self._persist_enabled and self._store_path.exists():
            self._store_path.unlink()

    def create_slot(self, *, geo_payload: Mapping[str, Any], created_from: str = "api") -> Dict[str, Any]:
        if not isinstance(geo_payload, Mapping):
            raise SpaceContextServiceError("geo must be object")
        try:
            slot = SpaceSlot(
                v_address=_new_slot_v_address(
                    slot_fragment=_normalize_v_address_fragment(str(geo_payload.get("station", "")).strip()),
                    existing_slots=self._slots,
                ),
                geo=SpaceSlotGeo.from_dict(geo_payload),
                created_from=_as_non_empty_text(created_from, "created_from"),
                slot_type="geo_reference",
                is_static=True,
            )
        except (SpaceSlotModelError, ValueError) as exc:
            raise SpaceContextServiceError(str(exc)) from exc
        self._slots[slot.v_address] = slot
        self._persist_store()
        return slot.to_dict()

    def _validate_state_transition(self, *, scope: str, current_state: str, target_state: str) -> None:
        try:
            state_transition(scope=scope, current_state=current_state, target_state=target_state)
        except StateTransitionError as exc:
            raise SpaceContextServiceError(f"{exc.code}: {exc}") from exc

    def _set_node_status(self, node: Dict[str, Any], target_status: str) -> None:
        current_status = str(node.get("status", SPACE_STATE_DRAFT)).strip() or SPACE_STATE_DRAFT
        self._validate_state_transition(
            scope=STATE_SCOPE_NODE,
            current_state=current_status,
            target_state=target_status,
        )
        node["status"] = target_status

    def _set_container_state(self, container: SpaceContainer, target_state: str) -> None:
        current_state = str(container.lifecycle_state or SPACE_STATE_DRAFT).strip() or SPACE_STATE_DRAFT
        self._validate_state_transition(
            scope=STATE_SCOPE_CONTAINER,
            current_state=current_state,
            target_state=target_state,
        )
        container.lifecycle_state = target_state
        container.norm_execution.current_state = target_state

    def create_slots_from_design(
        self,
        *,
        source_file: str,
        records: list[Mapping[str, Any]],
    ) -> Dict[str, Any]:
        normalized_source_file = _as_non_empty_text(source_file, "source_file")
        if not isinstance(records, list) or not records:
            raise SpaceContextServiceError("records must be non-empty array")

        parsed_geos: list[SpaceSlotGeo] = []
        for index, item in enumerate(records, start=1):
            if not isinstance(item, Mapping):
                raise SpaceContextServiceError(f"records[{index}] must be object")
            try:
                parsed_geos.append(SpaceSlotGeo.from_dict(item))
            except (SpaceSlotModelError, ValueError) as exc:
                raise SpaceContextServiceError(f"records[{index}] is invalid: {exc}") from exc

        slots: list[SpaceSlot] = []
        for geo in parsed_geos:
            slot = SpaceSlot(
                v_address=_new_slot_v_address(
                    slot_fragment=_normalize_v_address_fragment(geo.station),
                    existing_slots=self._slots,
                ),
                geo=geo,
                created_from=normalized_source_file,
                slot_type="geo_reference",
                is_static=True,
            )
            self._slots[slot.v_address] = slot
            slots.append(slot)

        self._persist_store()
        items = [item.to_dict() for item in slots]
        return {
            "source_file": normalized_source_file,
            "count": len(items),
            "items": items,
        }

    def get_slot(self, slot_id: str) -> Dict[str, Any]:
        normalized_slot_id = _as_non_empty_text(slot_id, "slot_id")
        slot = self._slots.get(normalized_slot_id)
        if slot is None:
            raise SpaceContextServiceError(f"space slot not found: {normalized_slot_id}")
        return slot.to_dict()

    def create_container_from_slot(
        self,
        slot_id: str,
        spu_id: str | None = None,
        *,
        spu_ids: list[str] | None = None,
        inspector: str | None = None,
        supervisor: str | None = None,
        volume_ref: str | None = None,
    ) -> Dict[str, Any]:
        normalized_slot_id = _as_non_empty_text(slot_id, "slot_id")
        normalized_spu_ids = _normalize_spu_ids(spu_id=spu_id, spu_ids=spu_ids)
        slot = self._slots.get(normalized_slot_id)
        if slot is None:
            raise SpaceContextServiceError(f"space slot not found: {normalized_slot_id}")

        try:
            container = SpaceContainer(
                v_address=_new_container_v_address(
                    container_fragment=_normalize_v_address_fragment(slot.geo.station),
                    existing_containers=self._containers,
                ),
                container_type="execution_instance",
                geo_slot_ref=slot.v_address,
                norm_execution=NormExecution(
                    specs_bound=list(normalized_spu_ids),
                    current_state=SPACE_STATE_DRAFT,
                    gate_open=True,
                ),
                trip_binding=TripBinding(
                    inspector=str(inspector or "").strip(),
                    supervisor=str(supervisor or "").strip(),
                ),
                runtime=ContainerRuntime(
                    active_form="",
                    last_input="",
                    pending_action=SPACE_PENDING_ACTION_IDLE,
                ),
                lifecycle="active",
                lifecycle_state=SPACE_STATE_DRAFT,
                locked=False,
                nodes=[],
                spec_bindings=[SpecBinding(spuId=item, status=SPACE_SPEC_STATUS_DRAFT, latest_node=None) for item in normalized_spu_ids],
                container_proof=None,
                volume_ref=str(volume_ref or "").strip() or None,
                is_dynamic=True,
            )
        except (SpaceContainerModelError, ValueError) as exc:
            raise SpaceContextServiceError(str(exc)) from exc

        self._containers[container.v_address] = container
        self._persist_store()
        return self._to_container_payload(container, include_slot=True)

    def create_node_for_container(self, container_id: str, *, spu_id: str | None = None) -> Dict[str, Any]:
        container = self._get_container_model(container_id)
        self._ensure_spec_bindings(container)
        if container.locked or container.lifecycle_state == SPACE_STATE_ARCHIVED:
            raise SpaceContextServiceError("container is archived and locked")

        bound_specs = list(container.norm_execution.specs_bound)
        if not bound_specs:
            raise SpaceContextServiceError("container has no bound specs")
        target_spu_id = str(spu_id or bound_specs[0]).strip() or bound_specs[0]
        if target_spu_id not in bound_specs:
            raise SpaceContextServiceError("spu_id is not bound to this container")
        target_binding = self._get_spec_binding(container, target_spu_id)
        if target_binding is None:
            raise SpaceContextServiceError("spu_id is not bound to this container")

        attempt_index = self._count_attempts_for_spu(container, target_spu_id) + 1
        node_id = _new_container_node_id()
        created_at = _utc_now()
        node_record = {
            "node_id": node_id,
            "spu_id": target_spu_id,
            "container_ref": container.v_address,
            "volume_ref": container.volume_ref,
            "attempt_index": attempt_index,
            "created_at": created_at,
            "status": SPACE_STATE_DRAFT,
            "proof": None,
            "result_summary": None,
            "archived_at": None,
        }

        container.nodes.append(node_id)
        target_binding.latest_node = node_id
        target_binding.status = SPACE_SPEC_STATUS_RUNNING
        container.runtime.active_form = target_spu_id
        container.runtime.pending_action = SPACE_PENDING_ACTION_EXECUTE_NODE
        container.runtime.last_input = created_at
        self._evaluate_container(container)
        self._nodes[node_id] = node_record
        self._containers[container.v_address] = container
        self._persist_store()

        return {
            "node": deepcopy(node_record),
            "container": self._to_container_payload(container, include_slot=True),
        }

    def complete_node_for_container(
        self,
        container_id: str,
        node_id: str,
        *,
        status: str,
        proof: Mapping[str, Any] | None = None,
        force_rejected: bool = False,
    ) -> Dict[str, Any]:
        container = self._get_container_model(container_id)
        self._ensure_spec_bindings(container)
        if container.locked or container.lifecycle_state == SPACE_STATE_ARCHIVED:
            raise SpaceContextServiceError("container is archived and cannot accept new results")

        normalized_node_id = _as_non_empty_text(node_id, "node_id")
        if normalized_node_id not in container.nodes:
            raise SpaceContextServiceError(f"node does not belong to container: {normalized_node_id}")
        node = self._nodes.get(normalized_node_id)
        if node is None:
            raise SpaceContextServiceError(f"node not found: {normalized_node_id}")

        normalized_status = str(status or "").strip().upper()
        if normalized_status not in SPACE_NODE_RESULT_STATES:
            raise SpaceContextServiceError("status must be PASS or FAIL")

        self._set_node_status(node, normalized_status)
        node["proof"] = deepcopy(dict(proof)) if isinstance(proof, Mapping) else None
        node["result_summary"] = _build_node_result_summary(node["proof"])
        node["completed_at"] = _utc_now()
        self._nodes[normalized_node_id] = node

        spu_id = str(node.get("spu_id", "")).strip()
        if not spu_id:
            raise SpaceContextServiceError("node missing spu_id")
        spec_binding = self._get_spec_binding(container, spu_id)
        if spec_binding is None:
            raise SpaceContextServiceError(f"spu_id is not bound to this container: {spu_id}")
        spec_binding.status = normalized_status
        spec_binding.latest_node = normalized_node_id

        if force_rejected:
            self._set_container_state(container, SPACE_STATE_REJECTED)
            container.runtime.pending_action = SPACE_PENDING_ACTION_MANUAL_REVIEW
        else:
            self._evaluate_container(container)
            if container.lifecycle_state == SPACE_STATE_VALIDATED:
                container.runtime.pending_action = SPACE_PENDING_ACTION_READY_TO_ARCHIVE
            else:
                container.runtime.pending_action = SPACE_PENDING_ACTION_RETEST
        container.runtime.active_form = spu_id

        self._containers[container.v_address] = container
        self._persist_store()
        return {
            "node": deepcopy(node),
            "container": self._to_container_payload(container, include_slot=True),
        }

    def archive_container(self, container_id: str, *, signatures: list[Mapping[str, Any]] | None = None) -> Dict[str, Any]:
        container = self._get_container_model(container_id)
        self._ensure_spec_bindings(container)
        if container.locked or container.lifecycle_state == SPACE_STATE_ARCHIVED:
            raise SpaceContextServiceError("container already archived")

        node_history = self._list_container_nodes(container)
        if not container.spec_bindings:
            raise SpaceContextServiceError("archive requires at least one bound SPU")
        non_pass_specs = [item.spuId for item in container.spec_bindings if item.status != SPACE_SPEC_STATUS_PASS]
        if non_pass_specs:
            joined = ", ".join(non_pass_specs)
            raise SpaceContextServiceError(f"archive requires all bound SPUs to PASS: {joined}")

        spec_results: list[Dict[str, Any]] = []
        for binding in container.spec_bindings:
            latest_pass_node = self._resolve_latest_node_for_spu(container, binding.spuId, status=SPACE_SPEC_STATUS_PASS)
            if latest_pass_node is None:
                raise SpaceContextServiceError(f"missing PASS node for spu: {binding.spuId}")
            result_summary = latest_pass_node.get("result_summary")
            attempts = self._count_attempts_for_spu(container, binding.spuId)
            spec_results.append(
                {
                    "spuId": binding.spuId,
                    "status": SPACE_SPEC_STATUS_PASS,
                    "final_node": latest_pass_node.get("node_id"),
                    "attempts": attempts,
                    "value": deepcopy(result_summary) if isinstance(result_summary, Mapping) else None,
                }
            )

        archived_at = _utc_now()
        proof_payload = {
            "container_id": container.v_address,
            "geo_slot_ref": container.geo_slot_ref,
            "slot_ref": container.geo_slot_ref,
            "volume_ref": container.volume_ref,
            "spec_results": spec_results,
            "overall_status": SPACE_SPEC_STATUS_PASS,
            "signatures": _build_container_signatures(signatures, container=container),
            "timestamp": archived_at,
            "archived_at": archived_at,
            "audit_trail": _build_audit_trail(node_history),
        }
        _ensure_container_proof_payload(proof_payload)

        container.container_proof = deepcopy(proof_payload)
        self._set_container_state(container, SPACE_STATE_ARCHIVED)
        container.locked = True
        container.runtime.pending_action = SPACE_PENDING_ACTION_LOCKED
        container.runtime.last_input = _utc_now()
        self._containers[container.v_address] = container
        self._persist_store()
        return {
            "container": self._to_container_payload(container, include_slot=True),
            "proof": proof_payload,
        }

    def get_container(self, container_id: str, *, include_slot: bool = False) -> Dict[str, Any]:
        container = self._get_container_model(container_id)
        return self._to_container_payload(container, include_slot=include_slot)

    def _get_container_model(self, container_id: str) -> SpaceContainer:
        normalized_container_id = _as_non_empty_text(container_id, "container_id")
        container = self._containers.get(normalized_container_id)
        if container is None:
            raise SpaceContextServiceError(f"space container not found: {normalized_container_id}")
        return container

    def _to_container_payload(self, container: SpaceContainer, *, include_slot: bool) -> Dict[str, Any]:
        self._ensure_spec_bindings(container)
        payload = container.to_dict()
        node_history = self._list_container_nodes(container)
        payload["node_history"] = node_history
        payload["latest_node"] = node_history[-1] if node_history else None
        pass_nodes = [item for item in node_history if str(item.get("status", "")).upper() == SPACE_SPEC_STATUS_PASS]
        payload["latest_pass_node"] = pass_nodes[-1] if pass_nodes else None
        payload["node_history_by_spu"] = self._group_node_history_by_spu(node_history)
        payload["can_archive"] = (
            bool(container.spec_bindings)
            and all(item.status == SPACE_SPEC_STATUS_PASS for item in container.spec_bindings)
            and not container.locked
            and container.lifecycle_state != SPACE_STATE_ARCHIVED
        )
        slot_payload: Dict[str, Any] | None = None
        if include_slot:
            slot = self._slots.get(container.geo_slot_ref)
            slot_payload = slot.to_dict() if slot is not None else None
            payload["geo_slot"] = slot_payload
        payload["standard_model"] = build_standard_space_container(
            container,
            slot_payload=slot_payload,
            node_history=node_history,
        ).to_dict()
        return payload

    def _list_container_nodes(self, container: SpaceContainer) -> list[Dict[str, Any]]:
        items: list[Dict[str, Any]] = []
        for node_id in container.nodes:
            node = self._nodes.get(node_id)
            if not isinstance(node, dict):
                continue
            items.append(deepcopy(node))
        items.sort(
            key=lambda item: (
                str(item.get("created_at", "")),
                str(item.get("spu_id", "")),
                int(item.get("attempt_index", 0)),
            )
        )
        return items

    def _count_attempts_for_spu(self, container: SpaceContainer, spu_id: str) -> int:
        target_spu_id = _as_non_empty_text(spu_id, "spu_id")
        node_history = self._list_container_nodes(container)
        return sum(1 for item in node_history if str(item.get("spu_id", "")).strip() == target_spu_id)

    def _group_node_history_by_spu(self, node_history: list[Dict[str, Any]]) -> Dict[str, list[Dict[str, Any]]]:
        grouped: Dict[str, list[Dict[str, Any]]] = {}
        for item in node_history:
            spu_id = str(item.get("spu_id", "")).strip()
            if not spu_id:
                continue
            grouped.setdefault(spu_id, []).append(deepcopy(item))
        for spu_id in grouped:
            grouped[spu_id].sort(key=lambda node: int(node.get("attempt_index", 0)))
        return grouped

    def _get_spec_binding(self, container: SpaceContainer, spu_id: str) -> SpecBinding | None:
        target_spu_id = _as_non_empty_text(spu_id, "spu_id")
        for item in container.spec_bindings:
            if item.spuId == target_spu_id:
                return item
        return None

    def _ensure_spec_bindings(self, container: SpaceContainer) -> None:
        spec_ids = [item for item in container.norm_execution.specs_bound if str(item).strip()]
        existing_ids: set[str] = set()
        normalized_bindings: list[SpecBinding] = []
        for item in container.spec_bindings:
            spu_id = str(item.spuId).strip()
            if not spu_id or spu_id in existing_ids:
                continue
            normalized_bindings.append(item)
            existing_ids.add(spu_id)
            if spu_id not in spec_ids:
                spec_ids.append(spu_id)

        for spu_id in spec_ids:
            if spu_id in existing_ids:
                continue
            normalized_bindings.append(SpecBinding(spuId=spu_id, status=SPACE_SPEC_STATUS_DRAFT, latest_node=None))
            existing_ids.add(spu_id)

        container.norm_execution.specs_bound = spec_ids
        container.spec_bindings = normalized_bindings

    def _evaluate_container(self, container: SpaceContainer) -> None:
        self._ensure_spec_bindings(container)
        if container.locked or container.lifecycle_state == SPACE_STATE_ARCHIVED:
            self._set_container_state(container, SPACE_STATE_ARCHIVED)
            return
        if not container.spec_bindings:
            self._set_container_state(container, SPACE_STATE_DRAFT)
            return
        all_pass = all(item.status == SPACE_SPEC_STATUS_PASS for item in container.spec_bindings)
        if all_pass:
            self._set_container_state(container, SPACE_STATE_VALIDATED)
            return
        self._set_container_state(container, SPACE_STATE_RUNNING)

    def _resolve_latest_node_for_spu(
        self,
        container: SpaceContainer,
        spu_id: str,
        *,
        status: str | None = None,
    ) -> Dict[str, Any] | None:
        target_spu_id = _as_non_empty_text(spu_id, "spu_id")
        target_status = str(status or "").strip().upper() or None
        node_history = self._list_container_nodes(container)
        candidates = [item for item in node_history if str(item.get("spu_id", "")).strip() == target_spu_id]
        if target_status:
            candidates = [item for item in candidates if str(item.get("status", "")).upper() == target_status]
        if not candidates:
            return None
        candidates.sort(key=lambda item: int(item.get("attempt_index", 0)))
        return candidates[-1]

    def _load_store(self) -> None:
        if not self._persist_enabled:
            return
        if not self._store_path.exists():
            return
        try:
            with self._store_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            raise SpaceContextServiceError(f"failed to load space context store: {exc}") from exc
        if not isinstance(payload, dict):
            raise SpaceContextServiceError("invalid space context store payload")

        raw_slots = payload.get("slots", {})
        if isinstance(raw_slots, dict):
            for slot_id, item in raw_slots.items():
                if not isinstance(slot_id, str) or not isinstance(item, dict):
                    continue
                try:
                    self._slots[slot_id] = SpaceSlot.from_dict(item)
                except SpaceSlotModelError:
                    continue

        raw_containers = payload.get("containers", {})
        if isinstance(raw_containers, dict):
            for container_id, item in raw_containers.items():
                if not isinstance(container_id, str) or not isinstance(item, dict):
                    continue
                try:
                    self._containers[container_id] = SpaceContainer.from_dict(item)
                except SpaceContainerModelError:
                    continue

        raw_nodes = payload.get("nodes", {})
        if isinstance(raw_nodes, dict):
            for node_id, item in raw_nodes.items():
                if not isinstance(node_id, str) or not isinstance(item, dict):
                    continue
                self._nodes[node_id] = deepcopy(item)

    def _persist_store(self) -> None:
        if not self._persist_enabled:
            return
        payload = {
            "slots": {key: value.to_dict() for key, value in self._slots.items()},
            "containers": {key: value.to_dict() for key, value in self._containers.items()},
            "nodes": deepcopy(self._nodes),
        }
        try:
            with self._store_path.open("w", encoding="utf-8") as f:
                json.dump(deepcopy(payload), f, ensure_ascii=False, separators=(",", ":"))
        except OSError as exc:
            raise SpaceContextServiceError(f"failed to persist space context store: {exc}") from exc


def _new_slot_v_address(*, slot_fragment: str | None = None, existing_slots: Mapping[str, Any] | None = None) -> str:
    candidate = _new_unique_v_address(
        prefix="v://space/slot",
        preferred_fragment=slot_fragment,
        existing_keys=set((existing_slots or {}).keys()),
    )
    return candidate


def _new_container_v_address(
    *,
    container_fragment: str | None = None,
    existing_containers: Mapping[str, Any] | None = None,
) -> str:
    candidate = _new_unique_v_address(
        prefix="v://space/container",
        preferred_fragment=container_fragment,
        existing_keys=set((existing_containers or {}).keys()),
    )
    return candidate


def _as_non_empty_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise SpaceContextServiceError(f"{field_name} is required")
    return text


def _default_persist_enabled() -> bool:
    raw = str(os.getenv("LAYERPEG_SPACE_CONTEXT_PERSIST", "")).strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return "pytest" not in sys.modules


def _new_container_node_id() -> str:
    return f"space-node-{uuid4().hex}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_spu_ids(*, spu_id: str | None, spu_ids: list[str] | None) -> list[str]:
    normalized: list[str] = []
    if isinstance(spu_ids, list):
        for item in spu_ids:
            value = str(item or "").strip()
            if value and value not in normalized:
                normalized.append(value)
    if not normalized:
        fallback = str(spu_id or "").strip()
        if fallback:
            normalized.append(fallback)
    if not normalized:
        raise SpaceContextServiceError("at least one spuId is required")
    return normalized


def _ensure_container_proof_payload(payload: Mapping[str, Any]) -> None:
    missing = [field for field in SPACE_CONTAINER_PROOF_REQUIRED_FIELDS if field not in payload]
    if missing:
        raise SpaceContextServiceError(f"container proof missing required fields: {', '.join(missing)}")


def _build_audit_trail(node_history: list[Mapping[str, Any]]) -> list[Dict[str, Any]]:
    records: list[Dict[str, Any]] = []
    for item in node_history:
        records.append(
            {
                "event": "NODE_COMPLETED",
                "spuId": item.get("spu_id"),
                "node_id": item.get("node_id"),
                "attempt": item.get("attempt_index"),
                "status": item.get("status"),
                "timestamp": item.get("completed_at") or item.get("created_at"),
            }
        )
    records.append({"event": "CONTAINER_ARCHIVED", "timestamp": _utc_now()})
    return records


def _build_node_result_summary(proof: Mapping[str, Any] | None) -> Dict[str, Any] | None:
    if not isinstance(proof, Mapping):
        return None
    result = proof.get("result")
    if not isinstance(result, Mapping):
        return None
    return {
        "field": result.get("field"),
        "value": result.get("value"),
        "status": str(result.get("status", "")).upper() if result.get("status") is not None else None,
    }


def _normalize_v_address_fragment(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    normalized = re.sub(r"\s+", "", text)
    normalized = re.sub(r"[^0-9A-Za-z_\-+.]", "-", normalized)
    normalized = normalized.strip("-")
    return normalized


def _new_unique_v_address(*, prefix: str, preferred_fragment: str | None, existing_keys: set[str]) -> str:
    preferred = str(preferred_fragment or "").strip()
    if not preferred:
        return f"{prefix}/{uuid4().hex}"
    candidate = f"{prefix}/{preferred}"
    if candidate not in existing_keys:
        return candidate
    suffix = 2
    while True:
        next_candidate = f"{prefix}/{preferred}-{suffix}"
        if next_candidate not in existing_keys:
            return next_candidate
        suffix += 1


def _build_container_signatures(
    signatures: list[Mapping[str, Any]] | None,
    *,
    container: SpaceContainer,
) -> list[str]:
    values: list[str] = []
    if isinstance(signatures, list):
        for item in signatures:
            if isinstance(item, Mapping):
                did = str(item.get("did", "")).strip()
                if did:
                    values.append(did)
                    continue
                identity = str(item.get("role", "")).strip()
                if identity:
                    values.append(identity)
                    continue
            elif isinstance(item, str) and item.strip():
                values.append(item.strip())

    # Always include trip bindings when present so archived proof contains signer DID context.
    for did in [container.trip_binding.inspector, container.trip_binding.supervisor]:
        value = str(did or "").strip()
        if value:
            values.append(value)

    deduped: list[str] = []
    for value in values:
        if value not in deduped:
            deduped.append(value)
    return deduped
