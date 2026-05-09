from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping


class SpaceSlotModelError(ValueError):
    """Raised when Space Slot payload is invalid."""


@dataclass(frozen=True)
class SpaceSlotCoords:
    x: float
    y: float

    def to_dict(self) -> Dict[str, float]:
        return {"x": float(self.x), "y": float(self.y)}

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpaceSlotCoords":
        if not isinstance(payload, Mapping):
            raise SpaceSlotModelError("space slot geo.coords must be object")
        return cls(
            x=_as_float(payload.get("x"), "geo.coords.x"),
            y=_as_float(payload.get("y"), "geo.coords.y"),
        )


@dataclass(frozen=True)
class SpaceSlotGeo:
    station: str
    chainage: float
    coords: SpaceSlotCoords
    elevation: float
    alignment: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "station": self.station,
            "chainage": float(self.chainage),
            "coords": self.coords.to_dict(),
            "x": float(self.coords.x),
            "y": float(self.coords.y),
            "elevation": float(self.elevation),
            "alignment": self.alignment,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpaceSlotGeo":
        if not isinstance(payload, Mapping):
            raise SpaceSlotModelError("space slot geo must be object")
        coords_payload = payload.get("coords")
        if not isinstance(coords_payload, Mapping):
            coords_payload = {
                "x": payload.get("x"),
                "y": payload.get("y"),
            }
        return cls(
            station=_as_non_empty_text(payload.get("station"), "geo.station"),
            chainage=_as_float(payload.get("chainage"), "geo.chainage"),
            coords=SpaceSlotCoords.from_dict(coords_payload),
            elevation=_as_float(payload.get("elevation"), "geo.elevation"),
            alignment=_as_non_empty_text(payload.get("alignment"), "geo.alignment"),
        )


@dataclass(frozen=True)
class SpaceSlot:
    v_address: str
    geo: SpaceSlotGeo
    created_from: str
    slot_type: str = "geo_reference"
    is_static: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "slot_id": _extract_tail_id(self.v_address, prefix="slot-"),
            "v_address": self.v_address,
            "slot_type": self.slot_type,
            "geo": self.geo.to_dict(),
            "created_from": self.created_from,
            "is_static": self.is_static,
        }

    @classmethod
    def from_dict(cls, payload: Mapping[str, Any]) -> "SpaceSlot":
        if not isinstance(payload, Mapping):
            raise SpaceSlotModelError("space slot payload must be object")

        slot_type = str(payload.get("slot_type", "geo_reference")).strip() or "geo_reference"
        if slot_type != "geo_reference":
            raise SpaceSlotModelError("space slot slot_type must be geo_reference")

        is_static = payload.get("is_static", True)
        if is_static is not True:
            raise SpaceSlotModelError("space slot is_static must be true")

        return cls(
            v_address=_as_non_empty_text(payload.get("v_address"), "v_address"),
            slot_type=slot_type,
            geo=SpaceSlotGeo.from_dict(payload.get("geo", {})),
            created_from=_as_non_empty_text(payload.get("created_from"), "created_from"),
            is_static=True,
        )


def _as_non_empty_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise SpaceSlotModelError(f"{field_name} is required")
    return text


def _as_float(value: Any, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise SpaceSlotModelError(f"{field_name} must be number") from exc
    return parsed


def _extract_tail_id(v_address: str, *, prefix: str) -> str:
    tail = str(v_address or "").strip().rsplit("/", 1)[-1].strip()
    if not tail:
        return ""
    return f"{prefix}{tail}"
