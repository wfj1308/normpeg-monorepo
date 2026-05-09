from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from urllib import error as url_error
from urllib import request as url_request
from uuid import uuid4

import jsonschema


class AnchorServiceError(ValueError):
    """Raised when anchor payload validation or persistence fails."""


class AnchorService:
    """Anchor service with pluggable backends (mock/webhook)."""

    def __init__(
        self,
        schema_path: Path | None = None,
        store_path: Path | None = None,
        mode: str | None = None,
        webhook_url: str | None = None,
        webhook_timeout_seconds: float = 10.0,
    ) -> None:
        base_dir = Path(__file__).resolve().parents[1]
        self.schema_path = schema_path or (base_dir / "schemas" / "anchor.schema.json")
        self.store_path = store_path or (base_dir.parent / "data" / "proof_anchors.jsonl")
        self.store_path.parent.mkdir(parents=True, exist_ok=True)
        self.anchor_schema = self._load_schema(self.schema_path)
        configured_mode = str(mode or os.getenv("LAYERPEG_ANCHOR_MODE", "mock")).strip().lower()
        if configured_mode not in {"mock", "webhook"}:
            raise AnchorServiceError(f"unsupported anchor mode: {configured_mode}")
        self.mode = configured_mode
        self.webhook_url = str(webhook_url or os.getenv("LAYERPEG_ANCHOR_WEBHOOK_URL", "")).strip()
        self.webhook_timeout_seconds = webhook_timeout_seconds

    def create_anchor(
        self,
        *,
        proof_hash: str,
        anchor_type: str,
        target_system: str,
        external_ref: str | None = None,
        status: str = "ANCHORED",
    ) -> Dict[str, Any]:
        proof_hash_value = str(proof_hash).strip()
        anchor_type_value = str(anchor_type).strip()
        target_system_value = str(target_system).strip()
        status_value = str(status).strip().upper()

        if not proof_hash_value:
            raise AnchorServiceError("proof_hash is required")
        if not anchor_type_value:
            raise AnchorServiceError("anchor_type is required")
        if not target_system_value:
            raise AnchorServiceError("target_system is required")

        payload = {
            "anchor_id": f"anchor_{uuid4().hex}",
            "proof_hash": proof_hash_value,
            "anchor_type": anchor_type_value,
            "target_system": target_system_value,
            "anchored_at": datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "status": status_value,
            "external_ref": external_ref,
        }
        self._validate_anchor(payload)
        if self.mode == "webhook":
            payload = self._create_anchor_via_webhook(payload)
        self._append_line(payload)
        return payload

    def list_anchors(self, proof_hash: str) -> List[Dict[str, Any]]:
        proof_hash_value = str(proof_hash).strip()
        if not proof_hash_value:
            raise AnchorServiceError("proof_hash is required")

        if not self.store_path.exists():
            return []

        results: list[Dict[str, Any]] = []
        with self.store_path.open("r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise AnchorServiceError("invalid anchor record format") from exc
                if not isinstance(item, dict):
                    raise AnchorServiceError("invalid anchor record")
                if str(item.get("proof_hash", "")) == proof_hash_value:
                    results.append(item)
        return results

    def _append_line(self, payload: Dict[str, Any]) -> None:
        with self.store_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
            f.write("\n")

    def _create_anchor_via_webhook(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self.webhook_url:
            raise AnchorServiceError("LAYERPEG_ANCHOR_WEBHOOK_URL is required when anchor mode=webhook")

        req = url_request.Request(
            url=self.webhook_url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with url_request.urlopen(req, timeout=self.webhook_timeout_seconds) as resp:
                raw = resp.read()
        except (url_error.URLError, TimeoutError, OSError) as exc:
            raise AnchorServiceError(f"anchor webhook request failed: {exc}") from exc

        if not raw:
            return payload

        try:
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return payload
        if not isinstance(body, dict):
            return payload

        updated = dict(payload)
        status_value = body.get("status")
        if isinstance(status_value, str) and status_value.strip():
            updated["status"] = status_value.strip().upper()
        external_ref = body.get("external_ref")
        if isinstance(external_ref, str):
            updated["external_ref"] = external_ref.strip() or None
        anchored_at = body.get("anchored_at")
        if isinstance(anchored_at, str) and anchored_at.strip():
            updated["anchored_at"] = anchored_at.strip()
        anchor_id = body.get("anchor_id")
        if isinstance(anchor_id, str) and anchor_id.strip():
            updated["anchor_id"] = anchor_id.strip()
        return updated

    def _validate_anchor(self, payload: Dict[str, Any]) -> None:
        try:
            jsonschema.validate(instance=payload, schema=self.anchor_schema)
        except jsonschema.ValidationError as exc:
            raise AnchorServiceError(f"anchor schema validation failed: {exc.message}") from exc

    @staticmethod
    def _load_schema(path: Path) -> Dict[str, Any]:
        with path.open("r", encoding="utf-8-sig") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise AnchorServiceError("anchor schema must be an object")
        return payload
