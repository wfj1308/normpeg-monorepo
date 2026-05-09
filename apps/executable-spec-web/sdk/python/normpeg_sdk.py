"""
Minimal Python SDK for NormPeg public API v1.

Supported high-level actions:
- register spec (markdown or SPU definition)
- execute
- query proof
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://localhost:8790"


def _trim_trailing_slash(value: str) -> str:
    return value.rstrip("/")


@dataclass
class NormPegApiError(Exception):
    message: str
    code: Optional[str] = None
    status: Optional[int] = None
    request_id: Optional[str] = None
    details: Any = None

    def __str__(self) -> str:
        prefix = f"[{self.code}] " if self.code else ""
        return f"{prefix}{self.message}"


class NormPegClient:
    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        role: str = "admin",
        actor_id: str = "sdk-client",
        tenant_id: str = "default",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.base_url = _trim_trailing_slash(base_url.strip()) or DEFAULT_BASE_URL
        self.role = role
        self.actor_id = actor_id
        self.tenant_id = tenant_id
        self.timeout_seconds = timeout_seconds

    def _request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        payload = None
        headers = {
            "Content-Type": "application/json",
            "x-user-role": self.role,
            "x-actor-id": self.actor_id,
            "x-tenant-id": self.tenant_id,
        }
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
        req = Request(url=url, method=method, headers=headers, data=payload)

        try:
            with urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
                status = resp.status
        except HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            status = exc.code
        except URLError as exc:
            raise NormPegApiError(message=f"connection error: {exc}") from exc

        try:
            envelope = json.loads(raw) if raw.strip() else None
        except json.JSONDecodeError as exc:
            raise NormPegApiError(
                message=f"non-JSON response from server: {raw[:300]}",
                status=status,
            ) from exc

        if not isinstance(envelope, dict):
            raise NormPegApiError(message="empty or invalid response payload", status=status)

        request_id = (
            envelope.get("meta", {}).get("requestId")
            if isinstance(envelope.get("meta"), dict)
            else None
        )
        ok = envelope.get("ok")
        if status >= 400 or ok is False:
            error = envelope.get("error") if isinstance(envelope.get("error"), dict) else {}
            raise NormPegApiError(
                message=str(error.get("message") or f"HTTP {status}"),
                code=error.get("code"),
                status=status,
                request_id=request_id,
                details=error.get("details"),
            )

        return {
            "data": envelope.get("data"),
            "meta": envelope.get("meta"),
        }

    def register_spec_markdown(self, markdown: str, **options: Any) -> Dict[str, Any]:
        payload = {"markdown": markdown}
        payload.update(options)
        response = self._request("POST", "/api/public/v1/specs/register-markdown", payload)
        return response["data"]

    def publish_spu(self, definition: Dict[str, Any]) -> Dict[str, Any]:
        response = self._request("POST", "/api/public/v1/spus/publish", {"definition": definition})
        return response["data"]

    def register_spec(
        self,
        markdown: Optional[str] = None,
        definition: Optional[Dict[str, Any]] = None,
        **options: Any,
    ) -> Dict[str, Any]:
        if markdown and markdown.strip():
            return self.register_spec_markdown(markdown, **options)
        if definition:
            return self.publish_spu(definition)
        raise ValueError("register_spec requires markdown or definition")

    def execute(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        response = self._request("POST", "/api/public/v1/executions/evaluate", payload)
        return response["data"]

    def query_proof(self, container_id: str) -> Dict[str, Any]:
        normalized = container_id.strip()
        if not normalized:
            raise ValueError("container_id is required")
        safe_id = quote(normalized, safe="")
        response = self._request("GET", f"/api/public/v1/proofs/{safe_id}")
        return response["data"]

