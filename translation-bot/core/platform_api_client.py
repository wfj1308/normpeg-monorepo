from __future__ import annotations

import copy
import json
import os
from datetime import datetime, timezone
from urllib.parse import urlencode
from uuid import uuid4

import requests


DEFAULT_SLOT_PAYLOAD = {
    "station": "K19+070",
    "chainage": 19070,
    "x": 128.25,
    "y": 62.5,
    "elevation": 135.4,
    "alignment": "A1",
    "sourceFile": "normref-auto-import.csv",
}


class PlatformAPIClient:
    def __init__(self, base_url: str | None = None, timeout_seconds: int = 60):
        self.base_url = (base_url or os.getenv("PLATFORM_API_BASE_URL") or "http://127.0.0.1:8790").rstrip("/")
        self.execution_ui_base_url = (os.getenv("EXECUTION_UI_BASE_URL") or "http://127.0.0.1:5173").rstrip("/")
        self.timeout_seconds = timeout_seconds

    def register_generated_spu(self, *, spu: dict, verified: bool) -> dict:
        if not isinstance(spu, dict) or not spu:
            raise RuntimeError("empty spu")

        payload = copy.deepcopy(spu)
        extensions = payload.get("extensions")
        if not isinstance(extensions, dict):
            extensions = {}
        extensions.update(
            {
                "source": "generated",
                "verified": bool(verified),
                "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            }
        )
        payload["extensions"] = extensions
        payload["source"] = "generated"
        payload["verified"] = bool(verified)

        body = self._request(
            "POST",
            "/api/registry/import",
            json_payload={
                "definitionText": json.dumps(payload, ensure_ascii=False),
                "sourceType": "compiled",
            },
        )
        item = body.get("item") if isinstance(body, dict) else None
        spu_id = str((item or {}).get("spuId") or payload.get("spuId") or "")
        return {
            "registered": bool(item),
            "spuId": spu_id,
            "source": "generated",
            "verified": bool(verified),
            "item": item or {},
        }

    def create_execution_entry(self, *, spu_id: str, container_id: str | None = None) -> dict:
        if not spu_id.strip():
            raise RuntimeError("spuId missing")

        slot_resp = self._request("POST", "/api/slots/import", json_payload=DEFAULT_SLOT_PAYLOAD)
        slot = slot_resp.get("slot", {}) if isinstance(slot_resp, dict) else {}
        slot_id = str(slot.get("slotId") or "")
        if not slot_id:
            raise RuntimeError("slot import failed")

        create_payload = {
            "geoSlotRef": slot_id,
            "inspector": "did:peg:ins_001",
            "supervisor": "did:peg:sup_001",
            "autoBindSpuIds": [spu_id],
        }
        if container_id and container_id.strip():
            create_payload["containerId"] = container_id.strip()
        else:
            create_payload["containerId"] = f"container-K19+070-{uuid4().hex[:10]}"

        container_resp = self._request("POST", "/api/containers", json_payload=create_payload)
        container = container_resp.get("container", {}) if isinstance(container_resp, dict) else {}
        final_container_id = str(container.get("containerId") or "")
        if not final_container_id:
            raise RuntimeError("container create failed")

        execution_url = self._build_execution_url(container_id=final_container_id, spu_id=spu_id)
        return {
            "containerId": final_container_id,
            "spuId": spu_id,
            "executionUrl": execution_url,
            "slot": slot,
            "container": container,
        }

    def _build_execution_url(self, *, container_id: str, spu_id: str) -> str:
        query = urlencode({"containerId": container_id, "spuId": spu_id, "source": "normref-bot"})
        return f"{self.execution_ui_base_url}/?{query}"

    def _request(self, method: str, path: str, json_payload: dict | None = None) -> dict:
        target = f"{self.base_url}{path}"
        response = requests.request(
            method=method.upper(),
            url=target,
            json=json_payload if json_payload is not None else None,
            timeout=self.timeout_seconds,
        )
        body = self._decode_json(response)
        if response.status_code >= 400:
            error_message = body.get("error") or body.get("detail") or f"HTTP_{response.status_code}"
            raise RuntimeError(f"platform api request failed: {error_message}")
        if isinstance(body, dict) and body.get("error"):
            raise RuntimeError(f"platform api request failed: {body.get('error')}")
        return body

    @staticmethod
    def _decode_json(response: requests.Response) -> dict:
        try:
            parsed = response.json()
            return parsed if isinstance(parsed, dict) else {"data": parsed}
        except Exception:
            return {"detail": response.text}
