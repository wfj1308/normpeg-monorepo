from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import requests
import streamlit as st


PASS = "PASS"
PARTIAL = "PARTIAL"
FAIL = "FAIL"

ROOT = Path(__file__).resolve().parents[1]
NORM_PATH = ROOT / "gate" / "norms" / "JTG_3450_2019.T0921.json"
PROJECT_PATH = ROOT / "projects" / "GXX_2024_XXX.json"
GATE_ENGINE_PATH = ROOT / "gate" / "engine.py"


def _status(ok: bool) -> str:
    return PASS if ok else FAIL


def _read_json(path: Path) -> tuple[bool, dict[str, Any] | None, str]:
    if not path.exists():
        return False, None, f"文件不存在: {path}"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return True, payload, ""
    except Exception as exc:  # noqa: BLE001
        return False, None, f"JSON解析失败: {exc}"


def _probe_get(url: str, timeout: int = 5) -> dict[str, Any]:
    try:
        resp = requests.get(url, timeout=timeout)
        body: Any
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            body = resp.text
        return {"ok": resp.ok, "status_code": resp.status_code, "body": body, "error": ""}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status_code": None, "body": None, "error": str(exc)}


def _probe_post(url: str, payload: dict[str, Any], timeout: int = 8) -> dict[str, Any]:
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
        body: Any
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            body = resp.text
        return {"ok": resp.ok, "status_code": resp.status_code, "body": body, "error": "", "request": payload}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "status_code": None, "body": None, "error": str(exc), "request": payload}


def _compute_values(inputs: dict[str, Any]) -> dict[str, Any]:
    try:
        sand_density = float(inputs["sand_density"])
        mass_hole_sand = float(inputs["mass_hole_sand"])
        volume_ring = float(inputs["volume_ring"])
        moisture_content = float(inputs["moisture_content"])
        max_dry_density = float(inputs["max_dry_density"])

        wet_density = (mass_hole_sand / sand_density) / volume_ring
        dry_density = wet_density / (1 + moisture_content / 100.0)
        compaction_degree = dry_density / max_dry_density * 100.0

        return {
            "wet_density": round(wet_density, 6),
            "dry_density": round(dry_density, 6),
            "compaction_degree": round(compaction_degree, 6),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": f"计算失败: {exc}"}


def _is_gate_unavailable_result(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    return payload.get("status") == "ERROR" and payload.get("error_type") == "gate_unavailable"


def _chat_has_gate_fallback(chat_resp: dict[str, Any] | None) -> bool:
    if not isinstance(chat_resp, dict):
        return False
    if not chat_resp.get("ok"):
        return False
    body = chat_resp.get("body")
    if not isinstance(body, dict):
        return False
    return _is_gate_unavailable_result(body.get("gate_result"))


def _check_normdoc() -> tuple[str, str]:
    ok, payload, err = _read_json(NORM_PATH)
    if not ok or payload is None:
        return FAIL, err

    required_top = {"Header", "Body", "Gate", "Trailer", "IncrementalUpdates"}
    top_missing = sorted(required_top - set(payload.keys()))
    if top_missing:
        return PARTIAL, f"缺少顶层: {top_missing}"

    fields: list[str] = []
    body = payload.get("Body", {})
    for table in body.get("Tables", []):
        for field in table.get("Fields", []):
            if isinstance(field, dict):
                field_id = field.get("FieldID")
                if isinstance(field_id, str):
                    fields.append(field_id)

    required_fields = [
        "sand_density",
        "wet_density",
        "moisture_content",
        "dry_density",
        "max_dry_density",
        "compaction_degree",
        "representative_value",
        "site_photos",
    ]
    missing = [k for k in required_fields if k not in fields]
    if missing:
        return PARTIAL, f"缺少字段: {missing}"

    return PASS, "NormDoc层级与关键字段完整"


def _check_project_profile() -> tuple[str, str]:
    ok, payload, err = _read_json(PROJECT_PATH)
    if not ok or payload is None:
        return FAIL, err

    required = [
        "project_code",
        "section",
        "design_params",
        "personnel",
    ]
    missing = [k for k in required if k not in payload]
    if missing:
        return PARTIAL, f"缺少字段: {missing}"

    design_params = payload.get("design_params", {})
    deep_required = ["road_class", "design_speed", "subgrade"]
    deep_missing = [k for k in deep_required if k not in design_params]
    if deep_missing:
        return PARTIAL, f"design_params缺少: {deep_missing}"

    subgrade = design_params.get("subgrade", {})
    zone = subgrade.get("96_zone", {})
    if "project_override" not in zone:
        return PARTIAL, "subgrade.96_zone.project_override 缺失"

    return PASS, "ProjectProfile关键层级完整"


def _check_gate_code() -> tuple[str, str]:
    if not GATE_ENGINE_PATH.exists():
        return FAIL, f"文件不存在: {GATE_ENGINE_PATH}"
    text = GATE_ENGINE_PATH.read_text(encoding="utf-8")
    required_tokens = [
        "class GateEngine",
        "def validate_field",
        "def validate_cross_field",
        "def validate_paragraph",
        "def apply_incremental_update",
        "def normalize_term",
        "Pass / Warning / Block",
        "def resolve_compaction_threshold",
    ]
    missing = [token for token in required_tokens if token not in text]
    if missing:
        return PARTIAL, f"缺少标记: {missing}"
    return PASS, "Gate核心结构与方法名完整"


def _build_gate_payload(
    project_id: str,
    stake: str,
    position: str,
    sand_density: float,
    mass_hole_sand: float,
    volume_ring: float,
    moisture_content: float,
    max_dry_density: float,
    photo_hash: str,
    photo_timestamp: str,
    photo_gps: str,
) -> dict[str, Any]:
    return {
        "form_type": "T0921-2019",
        "project_id": project_id,
        "section": stake,
        "inputs": {
            "stake": stake,
            "position": position,
            "sand_density": sand_density,
            "mass_hole_sand": mass_hole_sand,
            "volume_ring": volume_ring,
            "moisture_content": moisture_content,
            "max_dry_density": max_dry_density,
        },
        "photos": [{"hash": photo_hash, "meta": {"timestamp": photo_timestamp, "gps": photo_gps}}],
    }


def _build_gate_payload_from_state() -> dict[str, Any]:
    return _build_gate_payload(
        project_id=st.session_state["project_id"],
        stake=st.session_state["stake"],
        position=st.session_state["position"],
        sand_density=float(st.session_state["sand_density"]),
        mass_hole_sand=float(st.session_state["mass_hole_sand"]),
        volume_ring=float(st.session_state["volume_ring"]),
        moisture_content=float(st.session_state["moisture_content"]),
        max_dry_density=float(st.session_state["max_dry_density"]),
        photo_hash=st.session_state["photo_hash"],
        photo_timestamp=st.session_state["photo_timestamp"],
        photo_gps=st.session_state["photo_gps"],
    )


def _build_chat_payload_from_state() -> dict[str, Any]:
    return {
        "message": st.session_state["nl_message"],
        "user_id": st.session_state["nl_user_id"],
        "project_id": st.session_state["project_id"],
    }


def _run_gate_validation(gate_base: str) -> dict[str, Any]:
    payload = _build_gate_payload_from_state()
    resp = _probe_post(f"{gate_base}/v1/gate/validate", payload)
    st.session_state["last_gate_resp"] = resp
    return resp


def _run_chat_validation(nl2gate_base: str) -> dict[str, Any]:
    payload = _build_chat_payload_from_state()
    resp = _probe_post(f"{nl2gate_base}/chat", payload)
    st.session_state["last_chat_resp"] = resp
    return resp


def _init_form_state() -> None:
    defaults = {
        "project_id": "GXX_2024_XXX",
        "stake": "K15+200",
        "position": "左幅行车道",
        "sand_density": 1.456,
        "mass_hole_sand": 2850.5,
        "volume_ring": 2000.0,
        "moisture_content": 8.5,
        "max_dry_density": 2.35,
        "photo_hash": "sha256:abc123...",
        "photo_timestamp": "2026-04-16T10:00:00Z",
        "photo_gps": "30.000,120.000",
        "nl_message": "K15+200压实度94可以吗",
        "nl_user_id": "inspector_001",
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value
    if "last_gate_resp" not in st.session_state:
        st.session_state["last_gate_resp"] = None
    if "last_chat_resp" not in st.session_state:
        st.session_state["last_chat_resp"] = None
    if "auto_checked" not in st.session_state:
        st.session_state["auto_checked"] = False


def _load_sample(pass_case: bool) -> None:
    if pass_case:
        st.session_state["project_id"] = "GXX_2024_XXX"
        st.session_state["stake"] = "K15+300"
        st.session_state["position"] = "左幅行车道"
        st.session_state["sand_density"] = 1.456
        st.session_state["mass_hole_sand"] = 7300.0
        st.session_state["volume_ring"] = 2000.0
        st.session_state["moisture_content"] = 8.5
        st.session_state["max_dry_density"] = 2.35
        st.session_state["nl_message"] = "K15+300压实度96可以吗"
    else:
        st.session_state["project_id"] = "GXX_2024_XXX"
        st.session_state["stake"] = "K15+200"
        st.session_state["position"] = "左幅行车道"
        st.session_state["sand_density"] = 1.456
        st.session_state["mass_hole_sand"] = 2850.5
        st.session_state["volume_ring"] = 2000.0
        st.session_state["moisture_content"] = 8.5
        st.session_state["max_dry_density"] = 2.35
        st.session_state["nl_message"] = "K15+200压实度94可以吗"


def main() -> None:
    st.set_page_config(page_title="第一层验收页面", layout="wide")
    _init_form_state()

    st.title("第一层验收页面")
    st.caption("目标：真实调用本地 Gate API 与 NL2Gate API，验证第一层是否完成")

    gate_base = st.sidebar.text_input("Gate API Base", "http://localhost:8080")
    nl2gate_base = st.sidebar.text_input("NL2Gate API Base", "http://localhost:8081")
    st.sidebar.markdown("---")
    if st.sidebar.button("重新检测服务状态"):
        st.cache_data.clear()
        st.session_state["auto_checked"] = False

    # MINIMAL_COMPLETION: run one real round on first page load so acceptance panel is not "manual-click only".
    if not st.session_state["auto_checked"]:
        _run_gate_validation(gate_base)
        _run_chat_validation(nl2gate_base)
        st.session_state["auto_checked"] = True

    st.header("一、服务状态验证")
    gate_health = _probe_get(f"{gate_base}/health")
    chat_probe = _run_chat_validation(nl2gate_base)
    chat_fallback = _chat_has_gate_fallback(chat_probe)
    project_ok, _, _ = _read_json(PROJECT_PATH)
    norm_ok, _, _ = _read_json(NORM_PATH)

    service_rows = [
        {
            "检查项": "Gate API 是否可达",
            "状态": _status(bool(gate_health["ok"])),
            "证据": f"GET /health -> HTTP {gate_health['status_code']}",
        },
        {
            "检查项": "/chat 是否可达",
            "状态": _status(bool(chat_probe["ok"])),
            "证据": f"POST /chat -> HTTP {chat_probe['status_code']}",
        },
        {
            "检查项": "Gate（经 /chat）执行状态",
            "状态": FAIL if chat_fallback else PASS,
            "证据": (
                "fallback gate_unavailable"
                if chat_fallback
                else "未检测到 fallback"
            ),
        },
        {
            "检查项": "项目配置是否已加载/可加载",
            "状态": _status(project_ok and bool(chat_probe["ok"]) and not chat_fallback),
            "证据": f"{PROJECT_PATH.name} exists={project_ok}, /chat={chat_probe['status_code']}",
        },
        {
            "检查项": "T0921 规则文件是否存在",
            "状态": _status(norm_ok),
            "证据": str(NORM_PATH),
        },
    ]
    st.dataframe(service_rows, use_container_width=True, hide_index=True)

    col_s1, col_s2 = st.columns(2)
    with col_s1:
        st.subheader("Gate 健康检查原始返回")
        st.json(gate_health)
    with col_s2:
        st.subheader("/chat 可达性原始返回")
        st.json(chat_probe)

    st.header("二、T0921 表单验证")
    c1, c2 = st.columns(2)
    with c1:
        if st.button("合格样例"):
            _load_sample(pass_case=True)
            _run_gate_validation(gate_base)
            _run_chat_validation(nl2gate_base)
    with c2:
        if st.button("不合格样例"):
            _load_sample(pass_case=False)
            _run_gate_validation(gate_base)
            _run_chat_validation(nl2gate_base)

    with st.form("t0921_form"):
        project_id = st.text_input("project_id", key="project_id")
        stake = st.text_input("stake", key="stake")
        position = st.text_input("position", key="position")
        sand_density = st.number_input("sand_density", min_value=0.0, key="sand_density")
        mass_hole_sand = st.number_input("mass_hole_sand", min_value=0.0, key="mass_hole_sand")
        volume_ring = st.number_input("volume_ring", min_value=0.0, key="volume_ring")
        moisture_content = st.number_input("moisture_content", min_value=0.0, key="moisture_content")
        max_dry_density = st.number_input("max_dry_density", min_value=0.0, key="max_dry_density")
        photo_hash = st.text_input("photos.hash (占位)", key="photo_hash")
        photo_timestamp = st.text_input("photos.meta.timestamp", key="photo_timestamp")
        photo_gps = st.text_input("photos.meta.gps", key="photo_gps")
        submit_gate = st.form_submit_button("验证")

    gate_api_payload: dict[str, Any] | None = None

    if submit_gate:
        gate_api_payload = _build_gate_payload(
            project_id,
            stake,
            position,
            sand_density,
            mass_hole_sand,
            volume_ring,
            moisture_content,
            max_dry_density,
            photo_hash,
            photo_timestamp,
            photo_gps,
        )
        gate_resp = _probe_post(f"{gate_base}/v1/gate/validate", gate_api_payload)
        st.session_state["last_gate_resp"] = gate_resp

    gate_result_for_panel: dict[str, Any] | None = st.session_state.get("last_gate_resp")
    if gate_result_for_panel is not None:
        st.subheader("Gate 调用结果（最新）")
        if gate_result_for_panel["ok"] and isinstance(gate_result_for_panel["body"], dict):
            body = gate_result_for_panel["body"]
            status = str(body.get("status", ""))
            if status == "PASS":
                st.success(f"status={status}")
            elif status == "WARNING":
                st.warning(f"status={status}")
            else:
                st.error(f"status={status}")

            st.markdown("**computed values**")
            source_payload = gate_result_for_panel.get("request") or gate_api_payload or _build_gate_payload_from_state()
            computed = _compute_values(source_payload["inputs"])
            st.json(computed)

            st.markdown("**hit rules**")
            hit_rules = body.get("results", [])
            st.dataframe(hit_rules, use_container_width=True, hide_index=True)

            messages = [r.get("message") for r in hit_rules if isinstance(r, dict) and r.get("message")]
            st.markdown("**message**")
            st.write(messages if messages else "无")

            suggested_actions = [r.get("suggested_action") for r in hit_rules if isinstance(r, dict)]
            st.markdown("**suggested action**")
            st.write(suggested_actions if suggested_actions else "无")

            st.markdown("**form_pdf 是否生成**")
            form_pdf = body.get("form_pdf")
            st.write(bool(form_pdf))
            st.markdown("**proof_hash 是否返回**")
            st.write(bool(body.get("proof_hash")))
            st.markdown("**原始响应**")
            st.json(body)
        else:
            st.error("Gate 调用失败")
            st.markdown("**错误可见性**")
            st.json(
                {
                    "request": gate_result_for_panel.get("request"),
                    "http_status": gate_result_for_panel.get("status_code"),
                    "error": gate_result_for_panel.get("error"),
                    "response_body": gate_result_for_panel.get("body"),
                }
            )

    st.header("三、NL2Gate 验证")
    nl_message = st.text_input("自然语言输入", key="nl_message")
    nl_user_id = st.text_input("user_id", key="nl_user_id")
    send_nl = st.button("发送")

    if send_nl:
        chat_payload = {
            "message": nl_message,
            "user_id": nl_user_id,
            "project_id": st.session_state["project_id"],
        }
        chat_resp = _probe_post(f"{nl2gate_base}/chat", chat_payload)
        st.session_state["last_chat_resp"] = chat_resp

    chat_result_for_panel: dict[str, Any] | None = st.session_state.get("last_chat_resp") or chat_probe
    if chat_result_for_panel is not None:
        st.subheader("NL2Gate 调用结果（最新）")
        if chat_result_for_panel["ok"] and isinstance(chat_result_for_panel["body"], dict):
            body = chat_result_for_panel["body"]
            gate_result = body.get("gate_result")
            if _is_gate_unavailable_result(gate_result):
                st.error("Gate失败状态：ERROR / gate_unavailable")
                st.json(
                    {
                        "intent": body.get("intent"),
                        "form_type": body.get("form_type"),
                        "api_params": body.get("api_params"),
                        "gate_result": gate_result,
                        "natural_reply": body.get("natural_reply"),
                    }
                )
            else:
                st.json(
                    {
                        "intent": body.get("intent"),
                        "form_type": body.get("form_type"),
                        "api_params": body.get("api_params"),
                        "gate_result": gate_result,
                        "natural_reply": body.get("natural_reply"),
                    }
                )
        else:
            st.error("NL2Gate 调用失败")
            st.markdown("**错误可见性**")
            st.json(
                {
                    "request": chat_result_for_panel.get("request"),
                    "http_status": chat_result_for_panel.get("status_code"),
                    "error": chat_result_for_panel.get("error"),
                    "response_body": chat_result_for_panel.get("body"),
                }
            )

    st.header("四、验收结果面板（第一层）")
    normdoc_status, normdoc_detail = _check_normdoc()
    gate_code_status, gate_code_detail = _check_gate_code()
    project_status, project_detail = _check_project_profile()

    api_status = FAIL
    api_detail = "尚未触发 Gate 验证"
    if gate_result_for_panel and gate_result_for_panel.get("ok") and isinstance(gate_result_for_panel.get("body"), dict):
        b = gate_result_for_panel["body"]
        required = ["status", "results", "form_pdf", "proof_hash"]
        missing = [k for k in required if k not in b]
        if not missing:
            api_status = PASS
            api_detail = "Gate响应字段完整"
        else:
            api_status = PARTIAL
            api_detail = f"缺少字段: {missing}"

    nl2gate_status = FAIL
    nl2gate_detail = "尚未触发 /chat"
    if chat_result_for_panel and chat_result_for_panel.get("ok") and isinstance(chat_result_for_panel.get("body"), dict):
        b = chat_result_for_panel["body"]
        if _is_gate_unavailable_result(b.get("gate_result")):
            nl2gate_status = FAIL
            nl2gate_detail = "检测到 fallback: gate_unavailable"
        else:
            required = ["intent", "form_type", "api_params", "gate_result", "natural_reply"]
            missing = [k for k in required if k not in b]
            if not missing:
                nl2gate_status = PASS
                nl2gate_detail = "NL2Gate响应字段完整"
            else:
                nl2gate_status = PARTIAL
                nl2gate_detail = f"缺少字段: {missing}"

    if not gate_health["ok"] or chat_fallback:
        runtime_status = FAIL
        runtime_detail = f"gate={gate_health['status_code']}, chat={chat_probe['status_code']}, fallback={chat_fallback}"
    elif gate_health["ok"] and chat_probe["ok"]:
        runtime_status = PASS
        runtime_detail = f"gate={gate_health['status_code']}, chat={chat_probe['status_code']}"
    else:
        runtime_status = PARTIAL
        runtime_detail = f"gate={gate_health['status_code']}, chat={chat_probe['status_code']}"

    gate_status = gate_code_status
    gate_detail = gate_code_detail
    if gate_result_for_panel and not gate_result_for_panel.get("ok"):
        gate_status = PARTIAL
        gate_detail = f"{gate_detail}; Gate调用失败={gate_result_for_panel.get('status_code')}"

    acceptance_rows = [
        {"验收项": "NormDoc", "状态": normdoc_status, "说明": normdoc_detail},
        {"验收项": "Gate", "状态": gate_status, "说明": gate_detail},
        {"验收项": "API", "状态": api_status, "说明": api_detail},
        {"验收项": "NL2Gate", "状态": nl2gate_status, "说明": nl2gate_detail},
        {"验收项": "ProjectProfile", "状态": project_status, "说明": project_detail},
        {"验收项": "Runtime", "状态": runtime_status, "说明": runtime_detail},
    ]
    st.dataframe(acceptance_rows, use_container_width=True, hide_index=True)

    st.caption("说明：本页面为“第一层验收”用途，真实调用本地接口，不是产品展示页。")


if __name__ == "__main__":
    main()
