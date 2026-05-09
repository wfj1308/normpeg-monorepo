from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List
from urllib.error import URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


REQUIRED_FORMS = ["T0921-2019", "T0931-2019", "T0912-2019", "T0951-2008"]
REQUIRED_STANDARDS = ["JTG F80/1-2017", "JTG 3450-2019", "JTG/T F20-2015"]


def _http_json(method: str, url: str, payload: Dict[str, Any] | None = None, timeout: int = 10) -> Dict[str, Any]:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url=url, data=body, method=method.upper(), headers=headers)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def smoke_remote(base_url: str, project_id: str) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []

    ready = _http_json("GET", f"{base_url}/ops/ready?project_id={project_id}")
    checks.append({"name": "ops_ready_status", "ok": ready.get("status") in {"ready", "degraded"}, "detail": ready})
    checks.append(
        {
            "name": "ops_ready_subset",
            "ok": bool(ready.get("subset_ready", ready.get("day1_2_ready"))),
            "detail": ready.get("subset_reason", ready.get("day1_2_reason", "")),
        }
    )

    smoke = _http_json("GET", f"{base_url}/ops/smoke?project_id={project_id}")
    checks.append({"name": "ops_smoke", "ok": smoke.get("status") == "pass", "detail": smoke})

    deliverables = _http_json("GET", f"{base_url}/ops/deliverables?project_id={project_id}")
    checks.append(
        {
            "name": "ops_deliverables",
            "ok": deliverables.get("status") == "pass",
            "detail": deliverables,
        }
    )

    chat_payload = {
        "message": "K15+200 压实度 96.5 合格吗",
        "project_id": project_id,
        "user_id": "smoke_tester",
    }
    chat = _http_json("POST", f"{base_url}/chat", payload=chat_payload)
    checks.append(
        {
            "name": "chat_response_shape",
            "ok": all(k in chat for k in ("intent", "form_type", "api_params", "natural_reply")),
            "detail": chat,
        }
    )

    return _finalize("remote", project_id, checks)


def smoke_local(project_id: str) -> Dict[str, Any]:
    checks: List[Dict[str, Any]] = []
    project = main.load_project_config(project_id)

    day_ok, reason = main.validate_subset_baseline(project)
    checks.append({"name": "subset_baseline", "ok": day_ok, "detail": reason or "ok"})

    std_ok, std_reason, std_details = main.validate_digital_standards(project)
    checks.append(
        {
            "name": "digital_standards",
            "ok": std_ok,
            "detail": std_reason or "ok",
            "standards": std_details,
        }
    )

    detail_codes = {str(item.get("code", "")) for item in std_details if isinstance(item, dict) and item.get("exists")}
    checks.append(
        {
            "name": "digital_standards_count",
            "ok": all(code in detail_codes for code in REQUIRED_STANDARDS),
            "detail": sorted(detail_codes),
        }
    )

    for form_type in REQUIRED_FORMS:
        try:
            normdoc = main.load_normdoc_for_form(project, form_type)
            ok, msg = main.validate_normdoc_structure(normdoc)
            checks.append({"name": f"normdoc_{form_type}", "ok": ok, "detail": msg or "ok"})
            if ok:
                links = main.resolve_cross_spec_links(normdoc, {"form_type": form_type, "inputs": {}}, project)
                checks.append(
                    {
                        "name": f"cross_spec_{form_type}",
                        "ok": isinstance(links.get("items"), list),
                        "detail": {"items_count": len(links.get("items", []))},
                    }
                )
        except Exception as exc:
            checks.append({"name": f"normdoc_{form_type}", "ok": False, "detail": str(exc)})

    sample_req = main.ChatRequest(
        message="K15+200 压实度 96.5 合格吗",
        project_id=project_id,
        user_id="smoke_tester",
    )
    try:
        chat_resp = main.chat(sample_req)
        checks.append(
            {
                "name": "chat_local_call",
                "ok": bool(chat_resp.form_type) and isinstance(chat_resp.api_params, dict),
                "detail": {
                    "form_type": chat_resp.form_type,
                    "reply": chat_resp.natural_reply,
                },
            }
        )
    except Exception as exc:
        checks.append({"name": "chat_local_call", "ok": False, "detail": str(exc)})

    try:
        component_project = dict(project)
        component_project["project_id"] = "SMOKE_NO_HOT"
        comp_req = main.CompactionExecutionRequest(
            project_id="SMOKE_NO_HOT",
            stake="K18+600",
            layer_depth="0.8-1.5m",
            test_method="T0921",
            instrument_id="SB_2024_001",
            inspection_date="2024-06-01",
            raw_data=main.CompactionRawData(
                sand_density=1.456,
                mass_hole_sand=2809.0,
                volume_ring=2000.0,
                moisture_content=0.0,
                max_dry_density=1.0,
            ),
            paragraph_values=[96.4, 96.5, 96.6],
            actor_did="did:peg:ins_001",
        )
        comp_resp = main.execute_compaction_component(comp_req, component_project)
        checks.append(
            {
                "name": "component_compaction_execute",
                "ok": str(comp_resp.get("gate", {}).get("status", "")).upper() == "BLOCKED"
                and float(comp_resp.get("output", {}).get("compaction_degree", 0)) >= 96.4
                and bool(comp_resp.get("output", {}).get("proof_hash", "")),
                "detail": {
                    "gate_status": comp_resp.get("gate", {}).get("status"),
                    "state": comp_resp.get("state", {}).get("current"),
                    "compaction_degree": comp_resp.get("output", {}).get("compaction_degree"),
                    "representative_value": comp_resp.get("output", {}).get("representative_value"),
                },
            }
        )
    except Exception as exc:
        checks.append({"name": "component_compaction_execute", "ok": False, "detail": str(exc)})

    try:
        standard_a = main._lookup_project_standard(project, "96区", 95.0, section="K18+600")
        standard_b = main._lookup_project_standard(project, "Z96", 95.0, section="K18+600")
        checks.append(
            {
                "name": "layer_zone_normalization",
                "ok": abs(float(standard_a) - float(standard_b)) < 1e-6,
                "detail": {"96区": standard_a, "Z96": standard_b},
            }
        )
    except Exception as exc:
        checks.append({"name": "layer_zone_normalization", "ok": False, "detail": str(exc)})

    try:
        demo = main.run_layer2_compaction_demo(project_id=project_id)
        summary = ((demo.get("retrospect_report") or {}).get("summary") or {})
        checks.append(
            {
                "name": "layer2_demo_chain",
                "ok": str(demo.get("status", "")).lower() == "ok" and int(summary.get("legacy_only_count", 0)) >= 1,
                "detail": {
                    "status": demo.get("status"),
                    "legacy_only_count": summary.get("legacy_only_count", 0),
                    "retest_required_count": summary.get("retest_required_count", 0),
                },
            }
        )
    except Exception as exc:
        checks.append({"name": "layer2_demo_chain", "ok": False, "detail": str(exc)})

    return _finalize("local", project_id, checks)


def _finalize(mode: str, project_id: str, checks: List[Dict[str, Any]]) -> Dict[str, Any]:
    ok = all(bool(c.get("ok")) for c in checks)
    return {
        "mode": mode,
        "project_id": project_id,
        "status": "pass" if ok else "fail",
        "checks": checks,
    }


def main_cli() -> int:
    parser = argparse.ArgumentParser(description="Smoke test for NL2Gate API")
    parser.add_argument("--project-id", default="GXX_2024_XXX")
    parser.add_argument("--base-url", default="", help="Optional, e.g. http://127.0.0.1:8081")
    args = parser.parse_args()

    try:
        if args.base_url.strip():
            report = smoke_remote(args.base_url.rstrip("/"), args.project_id)
        else:
            report = smoke_local(args.project_id)
    except URLError as exc:
        print(json.dumps({"status": "fail", "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:
        print(json.dumps({"status": "fail", "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "pass" else 2


if __name__ == "__main__":
    raise SystemExit(main_cli())
