from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict

import requests


class PDFParseAPIClient:
    def __init__(self, base_url: str | None = None, timeout_seconds: int = 120):
        self.base_url = (base_url or os.getenv("PDF_PARSER_API_BASE_URL") or "http://127.0.0.1:8010").rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.poll_interval_seconds = float(os.getenv("PDF_PARSE_POLL_INTERVAL_SECONDS") or "1.0")
        self.max_wait_seconds = int(os.getenv("PDF_PARSE_MAX_WAIT_SECONDS") or "600")

    def parse_pdf(
        self,
        *,
        pdf_path: str,
        standard_code: str,
        options: Dict[str, Any] | None = None,
        on_status: Callable[[Dict[str, Any]], None] | None = None,
    ) -> Dict[str, Any]:
        parse_task = self.submit_parse(pdf_path=pdf_path, standard_code=standard_code, options=options)
        parse_id = str(parse_task.get("parseId") or "")
        if not parse_id:
            raise RuntimeError("pdf parse request failed: missing parseId")

        if on_status:
            on_status(
                {
                    "parseId": parse_id,
                    "status": "queued",
                    "progress": 0.0,
                    "error": None,
                }
            )

        start_at = time.monotonic()
        while True:
            status_payload = self.get_parse_status(parse_id=parse_id)
            status = str(status_payload.get("status") or "").lower()
            if on_status:
                on_status(status_payload)

            if status == "success":
                result = self.get_parse_result(parse_id=parse_id)
                if str(result.get("status") or "").lower() == "failed":
                    raise RuntimeError(str(result.get("error") or "PARSE_ERROR"))
                return result
            if status == "failed":
                raise RuntimeError(str(status_payload.get("error") or "PARSE_ERROR"))

            if time.monotonic() - start_at > self.max_wait_seconds:
                raise RuntimeError("pdf parse request failed: TIMEOUT")
            time.sleep(self.poll_interval_seconds)

    def submit_parse(self, *, pdf_path: str, standard_code: str, options: Dict[str, Any] | None = None) -> Dict[str, Any]:
        target = f"{self.base_url}/v1/pdf/parse"
        path = Path(pdf_path)
        payload_options = options or {"extractTables": True, "extractFormulas": True, "ocrLanguage": "chi_sim+eng"}

        with path.open("rb") as f:
            files = {"file": (path.name, f, "application/pdf")}
            data = {
                "standardCode": standard_code,
                "options": json.dumps(payload_options, ensure_ascii=False),
            }
            response = requests.post(target, files=files, data=data, timeout=self.timeout_seconds)

        body = self._decode_json(response)
        if response.status_code >= 400:
            error_code = body.get("error") or body.get("detail") or f"HTTP_{response.status_code}"
            raise RuntimeError(f"pdf parse request failed: {error_code}")
        return body

    def get_parse_status(self, *, parse_id: str) -> Dict[str, Any]:
        target = f"{self.base_url}/v1/pdf/status/{parse_id}"
        response = requests.get(target, timeout=self.timeout_seconds)
        body = self._decode_json(response)
        if response.status_code >= 400:
            raise RuntimeError(f"pdf parse status request failed: HTTP_{response.status_code}")
        return body

    def get_parse_result(self, *, parse_id: str) -> Dict[str, Any]:
        target = f"{self.base_url}/v1/pdf/result/{parse_id}"
        response = requests.get(target, timeout=self.timeout_seconds)
        body = self._decode_json(response)
        if response.status_code >= 400:
            raise RuntimeError(f"pdf parse result request failed: HTTP_{response.status_code}")
        return body

    def validate_extracted_data(self, *, extracted_data: Dict[str, Any], target_schema: str = "SPU-v1") -> Dict[str, Any]:
        target = f"{self.base_url}/v1/pdf/validate"
        response = requests.post(
            target,
            json={"extractedData": extracted_data, "targetSchema": target_schema},
            timeout=self.timeout_seconds,
        )
        body = self._decode_json(response)
        if response.status_code >= 400:
            raise RuntimeError(f"pdf validate request failed: HTTP_{response.status_code}")
        return body

    @staticmethod
    def _decode_json(response: requests.Response) -> Dict[str, Any]:
        try:
            parsed = response.json()
            return parsed if isinstance(parsed, dict) else {"data": parsed}
        except Exception:
            return {"detail": response.text}
