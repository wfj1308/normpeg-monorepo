from __future__ import annotations

from typing import Any, Dict


def locate_component(normdoc_payload: Dict[str, Any]) -> Dict[str, Any]:
    header = normdoc_payload.get("header", {})
    body = normdoc_payload.get("body", {})
    return {
        "component_id": header.get("component_id", ""),
        "component_name": header.get("component_name", ""),
        "version": header.get("version", ""),
        "type": body.get("type", ""),
        "critical": body.get("critical", False),
    }

