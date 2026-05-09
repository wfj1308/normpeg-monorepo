from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

from nl2gate import NL2Gate, NLIntent


GATE_API_URL = "http://localhost:8080/v1/gate/validate"

app = FastAPI(title="LayerPeg NL2Gate")
# MINIMAL_COMPLETION: required for local browser validation page calling 8080/8081 directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    user_id: str = "default"
    project_id: str


class ChatResponse(BaseModel):
    intent: str
    form_type: str
    api_params: dict[str, Any]
    gate_result: Optional[dict[str, Any]] = None
    natural_reply: str


project_configs: dict[str, dict[str, Any]] = {}
session_context: dict[str, dict[str, Any]] = {}


def _project_file_candidates(project_id: str) -> list[Path]:
    # 文档语义：projects/{project_id}.json
    primary = Path("projects") / f"{project_id}.json"
    layerpeg_root = Path(__file__).resolve().parent.parent
    fallback = layerpeg_root / "projects" / f"{project_id}.json"
    return [primary, fallback]


def _load_project_config(project_id: str) -> dict[str, Any]:
    if project_id in project_configs:
        return project_configs[project_id]

    for candidate in _project_file_candidates(project_id):
        if candidate.exists():
            with candidate.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            if "project_id" not in payload:
                # MINIMAL_COMPLETION: normalize id field for downstream to_api_params usage.
                payload["project_id"] = payload.get("id") or project_id
            project_configs[project_id] = payload
            return payload

    raise HTTPException(status_code=404, detail=f"项目配置不存在：projects/{project_id}.json")


def generate_natural_reply(intent: NLIntent, gate_result: dict[str, Any]) -> str:
    # MINIMAL_COMPLETION: keep reply slot while enforcing that conclusion must come from successful Gate execution.
    if _is_gate_unavailable(gate_result):
        return "当前无法完成校验，请检查Gate服务。"

    status = str(gate_result.get("status", "")).upper()
    item = (intent.form_type or "unknown").replace("-2019", "").replace("-2008", "")
    section = intent.entities.get("stake", "该点")

    if status == "PASS":
        return f"{section}{item}合格。"
    if status in {"BLOCKED", "BLOCK", "FAIL"}:
        reason = "不符合标准"
        results = gate_result.get("results")
        if isinstance(results, list) and results:
            first = results[0]
            if isinstance(first, dict):
                reason = str(first.get("message") or reason)
        return f"{section}{item}不合格：{reason}。"
    if status == "WARNING":
        return f"{section}{item}存在告警，请复核原始数据。"

    return f"已收到{section}{item}数据，等待 Gate 返回判定。"


def _gate_unavailable_result(fallback_reason: str) -> dict[str, Any]:
    return {
        "status": "ERROR",
        "error_type": "gate_unavailable",
        "message": "Gate服务不可用，无法完成校验",
        "fallback_reason": fallback_reason,
    }


def _is_gate_unavailable(payload: Optional[dict[str, Any]]) -> bool:
    if not isinstance(payload, dict):
        return False
    return payload.get("status") == "ERROR" and payload.get("error_type") == "gate_unavailable"


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    project = _load_project_config(request.project_id)
    nl2gate = NL2Gate(project_context=project, session_context=session_context)

    intent = nl2gate.parse(request.message, request.user_id)
    try:
        api_params = nl2gate.to_api_params(intent)
    except ValueError:
        return ChatResponse(
            intent=intent.intent,
            form_type=intent.form_type or "unknown",
            api_params={},
            gate_result=None,
            natural_reply="没听懂，请明确检测类型：压实度、平整度、厚度还是弯沉？",
        )

    # 保留 project_id / user_id / context 传递
    api_params["project_id"] = request.project_id
    api_params["user_id"] = request.user_id
    api_params["context"] = intent.context

    try:
        gate_resp = requests.post(
            GATE_API_URL,
            json=api_params,
            timeout=5,
        )
        if not gate_resp.ok:
            fallback_reason = f"HTTP {gate_resp.status_code}: {gate_resp.text}"
            gate_result = _gate_unavailable_result(fallback_reason)
        else:
            raw = gate_resp.json()
            if isinstance(raw, dict):
                gate_result = raw
            else:
                gate_result = _gate_unavailable_result("Gate response is not a JSON object")
    except Exception as exc:  # noqa: BLE001
        gate_result = _gate_unavailable_result(str(exc))

    reply = generate_natural_reply(intent, gate_result)
    return ChatResponse(
        intent=intent.intent,
        form_type=intent.form_type or "unknown",
        api_params=api_params,
        gate_result=gate_result,
        natural_reply=reply,
    )
