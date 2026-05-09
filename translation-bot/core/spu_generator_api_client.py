from __future__ import annotations

import os
from urllib.parse import urljoin
from typing import Any, Dict

import requests


class SPUGeneratorAPIClient:
    def __init__(self, base_url: str | None = None, timeout_seconds: int = 120):
        self.base_url = (base_url or os.getenv("SPU_GENERATOR_API_BASE_URL") or "http://127.0.0.1:8020").rstrip("/")
        self.timeout_seconds = timeout_seconds

    def generate_spu(self, *, standard_code: str, extracted_data: Dict[str, Any]) -> Dict[str, Any]:
        target = f"{self.base_url}/v1/spu/generate"
        response = requests.post(
            target,
            json={"standardCode": standard_code, "extractedData": extracted_data},
            timeout=self.timeout_seconds,
        )
        body = self._decode_json(response)
        if response.status_code >= 400:
            error_code = body.get("error") or body.get("detail") or f"HTTP_{response.status_code}"
            raise RuntimeError(f"spu generate request failed: {error_code}")
        if str(body.get("status", "")).lower() == "failed":
            raise RuntimeError(str(body.get("error") or "SPU_GENERATE_FAILED"))
        return body

    def validate_spu(self, *, spu: Dict[str, Any], target_schema: str = "SPU-v1") -> Dict[str, Any]:
        target = f"{self.base_url}/v1/spu/validate"
        response = requests.post(
            target,
            json={"spu": spu, "targetSchema": target_schema},
            timeout=self.timeout_seconds,
        )
        body = self._decode_json(response)
        if response.status_code >= 400:
            raise RuntimeError(f"spu validate request failed: HTTP_{response.status_code}")
        return body

    def download_specbundle(self, download_url: str) -> bytes:
        if not download_url:
            raise RuntimeError("empty download url")
        if download_url.startswith("http://") or download_url.startswith("https://"):
            target = download_url
        else:
            target = urljoin(f"{self.base_url}/", download_url.lstrip("/"))
        response = requests.get(target, timeout=self.timeout_seconds)
        if response.status_code >= 400:
            raise RuntimeError(f"spu download request failed: HTTP_{response.status_code}")
        return response.content

    @staticmethod
    def _decode_json(response: requests.Response) -> Dict[str, Any]:
        try:
            parsed = response.json()
            return parsed if isinstance(parsed, dict) else {"data": parsed}
        except Exception:
            return {"detail": response.text}

