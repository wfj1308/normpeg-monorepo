from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any, Dict, Iterable, Tuple
from urllib import error as url_error
from urllib import parse as url_parse
from urllib import request as url_request

from fastapi.testclient import TestClient

from .main import app


class PegBotCLIError(ValueError):
    """Raised when CLI invocation against API fails."""


_ITEM_LABELS: Dict[str, str] = {
    "compaction": "路基压实度",
    "flatness": "路基平整度",
    "deflection": "路基弯沉",
    "thickness": "路基厚度",
}

_ITEM_UNITS: Dict[str, str] = {
    "compaction": "%",
    "flatness": "mm",
    "deflection": "",
    "thickness": "mm",
}

_DEFAULT_PLATFORM_API_BASE = "http://127.0.0.1:8790"

_ITEM_FIELD_HINTS: Dict[str, tuple[str, ...]] = {
    "compaction": ("compactionDegree", "compaction_degree", "representative_value", "compaction"),
    "flatness": ("flatnessMeasured", "flatness_measured", "flatness"),
    "deflection": ("measuredDeflection", "deflectionValue", "deflection", "representative_deflection"),
    "thickness": ("measuredThickness", "thickness"),
}


def _platform_api_base(args: argparse.Namespace) -> str:
    raw = str(getattr(args, "api_base", "") or os.getenv("PEGBOT_PLATFORM_API_BASE") or _DEFAULT_PLATFORM_API_BASE).strip()
    return raw.rstrip("/")


def _normalize_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _to_semver_sort_key(value: Any) -> Tuple[int, int, int, str]:
    text = str(value or "").strip()
    matched = re.search(r"(\d+)(?:\.(\d+))?(?:\.(\d+))?", text)
    if not matched:
        return (0, 0, 0, text)
    return (
        int(matched.group(1) or "0"),
        int(matched.group(2) or "0"),
        int(matched.group(3) or "0"),
        text,
    )


def _request_platform_json(
    *,
    method: str,
    base_url: str,
    path: str,
    query: Dict[str, Any] | None = None,
    body: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    query_string = ""
    if query:
        normalized_query = {key: value for key, value in query.items() if value is not None and str(value).strip()}
        if normalized_query:
            query_string = "?" + url_parse.urlencode(normalized_query)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = url_request.Request(
        url=f"{base_url}{path}{query_string}",
        method=method.upper(),
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-user-role": "admin",
            "x-actor-id": "pegbot.cli",
        },
    )
    try:
        with url_request.urlopen(req, timeout=20) as resp:
            raw_text = resp.read().decode("utf-8")
            data = json.loads(raw_text) if raw_text.strip() else {}
    except url_error.HTTPError as exc:
        error_text = exc.read().decode("utf-8", errors="replace")
        raise PegBotCLIError(f"{path} failed ({exc.code}): {error_text.strip() or exc.reason}") from exc
    except url_error.URLError as exc:
        raise PegBotCLIError(
            f"cannot connect to platform API ({base_url}); please start apps/executable-spec-web/server/platform-api.ts"
        ) from exc
    except json.JSONDecodeError as exc:
        raise PegBotCLIError(f"{path} returned invalid JSON") from exc
    if not isinstance(data, dict):
        raise PegBotCLIError(f"{path} returned non-object payload")
    return data


def _unwrap_public_envelope(payload: Dict[str, Any], path: str) -> Dict[str, Any]:
    ok = bool(payload.get("ok"))
    if not ok:
        error = payload.get("error")
        if isinstance(error, dict):
            code = str(error.get("code") or "PUBLIC_INTERNAL_ERROR").strip()
            message = str(error.get("message") or "unknown error").strip()
            raise PegBotCLIError(f"{path} failed: [{code}] {message}")
        raise PegBotCLIError(f"{path} failed: unknown error")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise PegBotCLIError(f"{path} returned invalid envelope payload")
    return data


def _rule_store_get_normdocs(base_url: str) -> list[Dict[str, Any]]:
    payload = _request_platform_json(method="GET", base_url=base_url, path="/api/rule-store/normdocs")
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _rule_store_get_packages(base_url: str, normdoc_id: str) -> list[Dict[str, Any]]:
    payload = _request_platform_json(
        method="GET",
        base_url=base_url,
        path="/api/rule-store/packages",
        query={"normdoc_id": normdoc_id},
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _rule_store_get_rules(base_url: str, package_id: str) -> list[Dict[str, Any]]:
    encoded_package_id = url_parse.quote(package_id, safe="")
    payload = _request_platform_json(
        method="GET",
        base_url=base_url,
        path=f"/api/rule-store/packages/{encoded_package_id}/rules",
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _resolve_normdoc(normdoc_query: str, normdocs: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    query = str(normdoc_query or "").strip()
    if not query:
        raise PegBotCLIError("--normdoc is required for Rule Store mode")
    normalized_query = _normalize_token(query)
    candidates = list(normdocs)
    if not candidates:
        raise PegBotCLIError("Rule Store has no published normdocs")

    def _score(item: Dict[str, Any]) -> int:
        normdoc_id = str(item.get("normdoc_id") or "").strip()
        standard_code = str(item.get("standard_code") or "").strip()
        name = str(item.get("name") or "").strip()
        keys = [normdoc_id, standard_code, name]
        token_keys = [_normalize_token(value) for value in keys]
        if query in keys:
            return 200
        if normalized_query and normalized_query in token_keys:
            return 160
        if any(query.lower() in value.lower() for value in keys if value):
            return 120
        if normalized_query and any(normalized_query in token for token in token_keys if token):
            return 80
        return 0

    ranked = sorted(candidates, key=lambda item: (_score(item), str(item.get("published_at") or ""), str(item.get("version") or "")), reverse=True)
    best = ranked[0] if ranked else None
    if not best or _score(best) <= 0:
        available = ", ".join(str(item.get("standard_code") or item.get("normdoc_id") or "").strip() for item in candidates[:8])
        raise PegBotCLIError(f"normdoc not found: {query}. available: {available}")
    return best


def _resolve_package(packages: Iterable[Dict[str, Any]], package_id: str | None = None) -> Dict[str, Any]:
    candidates = [item for item in packages if str(item.get("status") or "").strip().lower() == "published"]
    if not candidates:
        raise PegBotCLIError("no published rule package found for selected normdoc")
    if package_id:
        normalized = str(package_id).strip()
        matched = next((item for item in candidates if str(item.get("package_id") or "").strip() == normalized), None)
        if not matched:
            raise PegBotCLIError(f"package not found: {normalized}")
        return matched
    return sorted(
        candidates,
        key=lambda item: (
            _to_semver_sort_key(item.get("version")),
            str(item.get("package_id") or ""),
        ),
        reverse=True,
    )[0]


def _normalize_item_key(item: str) -> str:
    normalized = _normalize_token(item)
    if normalized in {"compaction", "yasidu", "yashidu"}:
        return "compaction"
    if normalized in {"flatness", "pingzhengdu"}:
        return "flatness"
    if normalized in {"deflection", "wachen", "chenjiang"}:
        return "deflection"
    if normalized in {"thickness", "houdu"}:
        return "thickness"
    return normalized


def _resolve_rule_item(item_query: str, rules: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    query = str(item_query or "").strip()
    if not query:
        raise PegBotCLIError("--item is required")
    normalized_query = _normalize_token(query)
    item_key = _normalize_item_key(query)
    candidates = [item for item in rules if item.get("enabled") is not False]
    if not candidates:
        raise PegBotCLIError("selected package has no enabled rules")

    aliases = set(_ITEM_FIELD_HINTS.get(item_key, ()))
    aliases.add(item_key)
    aliases_normalized = {_normalize_token(alias) for alias in aliases if alias}

    def _score(item: Dict[str, Any]) -> int:
        rule_id = str(item.get("rule_id") or "").strip()
        item_name = str(item.get("item_name") or "").strip()
        clause = str(item.get("clause") or "").strip()
        source_text = str(item.get("source_text") or "").strip()
        fields = [rule_id, item_name, clause, source_text]
        token_fields = [_normalize_token(value) for value in fields]
        score = 0
        if query in fields or normalized_query in token_fields:
            score += 220
        if any(query.lower() in value.lower() for value in fields if value):
            score += 80
        if normalized_query and any(normalized_query in token for token in token_fields if token):
            score += 60
        if aliases_normalized and any(alias and alias in token for alias in aliases_normalized for token in token_fields):
            score += 100
        return score

    ranked = sorted(candidates, key=lambda item: (_score(item), str(item.get("clause") or ""), str(item.get("rule_id") or "")), reverse=True)
    best = ranked[0] if ranked else None
    if not best or _score(best) <= 0:
        available = ", ".join(str(item.get("item_name") or item.get("rule_id") or "").strip() for item in candidates[:8])
        raise PegBotCLIError(f"rule item not found: {query}. available: {available}")
    return best


def _parse_extra_inputs(raw_inputs: Iterable[str]) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    for raw in raw_inputs:
        text = str(raw or "").strip()
        if not text:
            continue
        if "=" not in text:
            raise PegBotCLIError(f"invalid --input value: {text}. expected key=value")
        key, value = text.split("=", 1)
        input_key = key.strip()
        if not input_key:
            raise PegBotCLIError(f"invalid --input key in: {text}")
        parsed[input_key] = _as_float_or_none(value.strip()) if _as_float_or_none(value.strip()) is not None else value.strip()
    return parsed


def _choose_primary_value_field(
    *,
    item: str,
    input_fields: Iterable[str],
    explicit_field: str | None,
    existing_inputs: Dict[str, Any],
) -> str:
    fields = [str(field or "").strip() for field in input_fields if str(field or "").strip()]
    if explicit_field:
        normalized_explicit = _normalize_token(explicit_field)
        matched_explicit = next((field for field in fields if _normalize_token(field) == normalized_explicit), None)
        if matched_explicit:
            return matched_explicit
        if normalized_explicit:
            return explicit_field
    if len(fields) == 1:
        return fields[0]
    item_key = _normalize_item_key(item)
    aliases = _ITEM_FIELD_HINTS.get(item_key, ()) + ("value", "actual", "actual_value", "measured_value")
    normalized_aliases = [_normalize_token(alias) for alias in aliases if alias]
    for alias in normalized_aliases:
        for field in fields:
            if _normalize_token(field) == alias:
                return field
    for field in fields:
        if field not in existing_inputs:
            return field
    return fields[0] if fields else "value"


def _extract_proof_identity(execution: Dict[str, Any]) -> str:
    proof = execution.get("proof")
    if isinstance(proof, dict):
        for key in ("proofId", "proof_id", "hash", "proof_hash", "id"):
            value = str(proof.get(key) or "").strip()
            if value:
                return value
    proof_fragment = execution.get("proofFragment")
    if isinstance(proof_fragment, dict):
        for key in ("proofId", "proof_id", "hash", "id"):
            value = str(proof_fragment.get(key) or "").strip()
            if value:
                return value
    return "-"


def _ensure_container_for_check(
    *,
    base_url: str,
    project_id: str,
    point: str,
    container_id: str | None,
) -> str:
    if container_id and str(container_id).strip():
        return str(container_id).strip()
    point_text = str(point or "K0+000").strip() or "K0+000"
    slot_payload = _request_platform_json(
        method="POST",
        base_url=base_url,
        path="/api/slots/import",
        body={
            "station": point_text,
        },
    )
    slot = slot_payload.get("slot")
    if not isinstance(slot, dict):
        raise PegBotCLIError("failed to create slot for executor context")
    slot_id = str(slot.get("slotId") or "").strip()
    if not slot_id:
        raise PegBotCLIError("slot creation returned empty slotId")
    container_payload = _request_platform_json(
        method="POST",
        base_url=base_url,
        path="/api/containers",
        body={
            "projectId": str(project_id).strip(),
            "geoSlotRef": slot_id,
        },
    )
    container = container_payload.get("container")
    if not isinstance(container, dict):
        raise PegBotCLIError("failed to create container for executor context")
    created_container_id = str(container.get("containerId") or "").strip()
    if not created_container_id:
        raise PegBotCLIError("container creation returned empty containerId")
    return created_container_id


def _request_json(client: TestClient, *, method: str, path: str, **kwargs: Any) -> Dict[str, Any]:
    response = client.request(method=method, url=path, **kwargs)
    payload: Any
    try:
        payload = response.json()
    except ValueError:
        payload = {"detail": response.text}
    if response.status_code >= 400:
        detail = payload.get("detail") if isinstance(payload, dict) else payload
        raise PegBotCLIError(f"{path} failed ({response.status_code}): {detail}")
    if not isinstance(payload, dict):
        raise PegBotCLIError(f"{path} returned non-object payload")
    return payload


def _query_layer3(client: TestClient, *, message: str, project_id: str, session_id: str | None = None) -> Dict[str, Any]:
    request_payload: Dict[str, Any] = {"message": message, "project_id": project_id}
    if session_id:
        request_payload["session_id"] = session_id
    return _request_json(client, method="POST", path="/api/v1/layer3/query", json=request_payload)


def _resolve_latest_point(client: TestClient, *, project_id: str, point: str) -> Dict[str, Any]:
    v_address = f"v://{project_id}/{point}?version=latest"
    return _request_json(client, method="GET", path="/api/v1/utxo/resolve", params={"v": v_address})


def _extract_failed_rules(resolved_output: Dict[str, Any]) -> list[str]:
    payload = resolved_output.get("payload")
    if not isinstance(payload, dict):
        return []
    full_proof = payload.get("full_proof")
    if not isinstance(full_proof, dict):
        return []
    canonical = full_proof.get("canonical_payload")
    if not isinstance(canonical, dict):
        return []
    gate = canonical.get("gate")
    if not isinstance(gate, dict):
        return []

    raw_failed = gate.get("failed_rule_ids")
    if isinstance(raw_failed, list):
        return [str(item).strip() for item in raw_failed if str(item).strip()]

    failed: list[str] = []
    raw_results = gate.get("rule_results")
    if not isinstance(raw_results, list):
        return failed
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        passed = item.get("passed")
        if passed is True:
            continue
        rule_id = str(item.get("rule_id") or "").strip()
        if rule_id:
            failed.append(rule_id)
    return failed


def _dump_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _as_float_or_none(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _format_number(value: Any) -> str:
    numeric = _as_float_or_none(value)
    if numeric is None:
        return "-"
    if numeric.is_integer():
        return str(int(numeric))
    return f"{numeric:g}"


def _format_value_with_unit(value: Any, unit: str) -> str:
    text = _format_number(value)
    if text == "-" or not unit:
        return text
    return f"{text}{unit}"


def _normalize_point(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return "-"
    matched = re.search(r"[Kk]\d{1,4}\+\d{3}", text)
    if matched:
        return matched.group(0).upper()
    return text


def _infer_item_key(payload: Dict[str, Any]) -> str:
    execution_request = payload.get("execution_request")
    if isinstance(execution_request, dict):
        rule_id = str(execution_request.get("rule_id") or "").strip().lower()
        if "compaction" in rule_id:
            return "compaction"
        if "flatness" in rule_id:
            return "flatness"
        if "deflection" in rule_id:
            return "deflection"
        if "thickness" in rule_id:
            return "thickness"

    execution_result = payload.get("execution_result")
    if isinstance(execution_result, dict):
        component_id = str(execution_result.get("component_id") or "").strip().lower()
        if "compaction" in component_id:
            return "compaction"
        if "flatness" in component_id:
            return "flatness"
        if "deflection" in component_id:
            return "deflection"
        if "thickness" in component_id:
            return "thickness"
    return "compaction"


def _format_basis(spec_id: str) -> str:
    text = str(spec_id or "").strip()
    if not text:
        return "-"
    parts = text.split(".")
    norm_head = parts[0] if parts else text
    norm_tokens = norm_head.split("_")
    if len(norm_tokens) >= 3 and norm_tokens[0].upper() == "JTG":
        year = norm_tokens[-1]
        code = "/".join(norm_tokens[1:-1]) or norm_head
        norm_label = f"JTG {code}-{year}"
    else:
        norm_label = norm_head.replace("_", " ")

    clause_parts: list[str] = []
    for token in parts[1:]:
        if token.isdigit():
            clause_parts.append(token)
            continue
        break
    if clause_parts:
        return f"{norm_label} 条款 {'.'.join(clause_parts)}"
    return norm_label


def _build_business_from_layer3(payload: Dict[str, Any]) -> Dict[str, Any]:
    execution_result = payload.get("execution_result")
    if not isinstance(execution_result, dict):
        return {
            "conclusion": "待补充",
            "item": "-",
            "point": "-",
            "required": "-",
            "actual": "-",
            "basis": "-",
            "proof": "未生成",
            "status_code": "NEED_MORE_INFO",
            "judgement_result": "-",
            "judgement_reason": "-",
            "used_rule": "-",
            "normative_basis": "-",
            "clause_content": "-",
        }

    item_key = _infer_item_key(payload)
    unit = _ITEM_UNITS.get(item_key, "")
    item = _ITEM_LABELS.get(item_key, item_key)
    final_status = str(payload.get("overall") or execution_result.get("final_status") or "UNKNOWN").strip().upper()
    is_pass = final_status in {"PASS", "QUALIFIED", "SUCCESS"}
    conclusion = "通过" if is_pass else "不通过"

    normalized_input = execution_result.get("normalized_input")
    normalized_input = normalized_input if isinstance(normalized_input, dict) else {}
    point = _normalize_point(normalized_input.get("stake"))

    gate = execution_result.get("gate")
    gate = gate if isinstance(gate, dict) else {}
    rule_results = gate.get("rule_results")
    rule_results = rule_results if isinstance(rule_results, list) else []
    chosen_rule = next((item for item in rule_results if isinstance(item, dict)), {})
    expected_value = chosen_rule.get("expected_value")
    actual_value = chosen_rule.get("actual_value")
    required = "-"
    if _as_float_or_none(expected_value) is not None:
        required = f"≥ {_format_value_with_unit(expected_value, unit)}"
    actual = _format_value_with_unit(actual_value, unit)

    execution_request = payload.get("execution_request")
    execution_request = execution_request if isinstance(execution_request, dict) else {}
    spec_id = str(execution_result.get("spec_id") or execution_request.get("spec_id") or "").strip()
    basis = _format_basis(spec_id)

    judgement_card_raw = payload.get("judgement_card")
    judgement_card = judgement_card_raw if isinstance(judgement_card_raw, dict) else {}
    rule_payload = judgement_card.get("rule")
    rule = rule_payload if isinstance(rule_payload, dict) else {}
    basis_payload = judgement_card.get("normative_basis")
    clause_basis = basis_payload if isinstance(basis_payload, dict) else {}
    clause_standard = str(clause_basis.get("standard_code") or "").strip()
    clause_no = str(clause_basis.get("clause_no") or "").strip()
    clause_title = str(clause_basis.get("clause_title") or "").strip()
    clause_content = str(clause_basis.get("clause_content") or "").strip()
    normative_basis = "-"
    if clause_standard or clause_no:
        normative_basis = f"{clause_standard or '-'} 第{clause_no or '-'}条".strip()
        if clause_title and clause_title != "-":
            normative_basis = f"{normative_basis} {clause_title}".strip()

    used_rule = "-"
    if rule:
        rule_id = str(rule.get("rule_id") or "").strip()
        rule_version = str(rule.get("rule_version") or "").strip()
        if rule_id or rule_version:
            used_rule = f"{rule_id or '-'} @ {rule_version or '-'}"
    if used_rule == "-":
        request_rule_id = str(execution_request.get("rule_id") or "").strip()
        payload_rule_version = str(payload.get("rule_version") or "").strip()
        if request_rule_id or payload_rule_version:
            used_rule = f"{request_rule_id or '-'} @ {payload_rule_version or '-'}"

    judgement_result = str(judgement_card.get("result_text") or conclusion).strip() or conclusion
    judgement_reason = str(judgement_card.get("reason") or "").strip() or str(chosen_rule.get("message") or "-").strip() or "-"

    proof = payload.get("proof")
    has_proof = isinstance(proof, dict) and bool(str(proof.get("proof_hash") or proof.get("execution_id") or "").strip())
    return {
        "conclusion": conclusion,
        "item": item,
        "point": point,
        "required": required,
        "actual": actual,
        "basis": basis,
        "proof": "已生成" if has_proof else "未生成",
        "status_code": final_status,
        "judgement_result": judgement_result,
        "judgement_reason": judgement_reason,
        "used_rule": used_rule,
        "normative_basis": normative_basis,
        "clause_content": clause_content or "Clause Store 未检索到条款原文",
    }


def _print_layer3_business(payload: Dict[str, Any]) -> int:
    if payload.get("status") == "NEED_MORE_INFO" or bool(payload.get("needs_clarification")):
        question = str(payload.get("question") or payload.get("ui_hint") or "需要补充信息").strip()
        print("结论：待补充")
        print(f"问题：{question or '-'}")
        return 2

    view = _build_business_from_layer3(payload)
    print(f"判定结果：{view['judgement_result']}")
    print(f"判定原因：{view['judgement_reason']}")
    print(f"使用规则：{view['used_rule']}")
    print(f"规范依据：{view['normative_basis']}")
    print(f"条款原文（可展开）：{view['clause_content']}")
    print(f"检测点：{view['point']}")
    print(f"结论：{view['conclusion']}")
    print(f"检测项：{view['item']}")
    print(f"规范要求：{view['required']}")
    print(f"实际值：{view['actual']}")
    print(f"执行依据：{view['basis']}")
    print(f"Proof：{view['proof']}")
    return 0


def _run_ask(args: argparse.Namespace) -> int:
    with TestClient(app) as client:
        payload = _query_layer3(
            client,
            message=str(args.message),
            project_id=str(args.project_id),
            session_id=str(args.session_id).strip() if args.session_id else None,
        )
    if args.json:
        _dump_json(payload)
        return 0
    return _print_layer3_business(payload)


def _run_check(args: argparse.Namespace) -> int:
    normdoc_query = str(getattr(args, "normdoc", "") or "").strip()
    if not normdoc_query:
        raise PegBotCLIError("--normdoc is required for Rule Store + Executor mode")
    return _run_check_via_rule_store(args)


def _run_check_via_rule_store(args: argparse.Namespace) -> int:
    api_base = _platform_api_base(args)
    normdoc_query = str(args.normdoc).strip()
    item_query = str(args.item or "").strip()
    project_id = str(args.project_id).strip()
    point = str(getattr(args, "point", "") or "K0+000").strip() or "K0+000"
    if not item_query:
        raise PegBotCLIError("--item is required")

    normdocs = _rule_store_get_normdocs(api_base)
    normdoc = _resolve_normdoc(normdoc_query, normdocs)
    normdoc_id = str(normdoc.get("normdoc_id") or "").strip()
    if not normdoc_id:
        raise PegBotCLIError(f"resolved normdoc has empty normdoc_id: {normdoc_query}")

    packages = _rule_store_get_packages(api_base, normdoc_id)
    package = _resolve_package(packages, package_id=getattr(args, "package_id", None))
    package_id = str(package.get("package_id") or "").strip()
    if not package_id:
        raise PegBotCLIError("resolved package has empty package_id")

    rules = _rule_store_get_rules(api_base, package_id)
    rule = _resolve_rule_item(item_query, rules)

    input_fields_raw = rule.get("input_fields")
    input_fields = [str(field).strip() for field in input_fields_raw] if isinstance(input_fields_raw, list) else []
    extra_inputs = _parse_extra_inputs(getattr(args, "input", []) or [])
    primary_field = _choose_primary_value_field(
        item=item_query,
        input_fields=input_fields,
        explicit_field=getattr(args, "value_field", None),
        existing_inputs=extra_inputs,
    )
    inputs = {**extra_inputs, primary_field: float(args.value)}

    rule_version = str(rule.get("version") or package.get("version") or normdoc.get("version") or "").strip()
    if not rule_version:
        raise PegBotCLIError("rule version is missing from Rule Store payload")
    container_id = _ensure_container_for_check(
        base_url=api_base,
        project_id=project_id,
        point=point,
        container_id=getattr(args, "container_id", None),
    )

    execution_payload = _request_platform_json(
        method="POST",
        base_url=api_base,
        path="/api/executor/run",
        body={
            "rule_id": str(rule.get("rule_id") or "").strip(),
            "rule_version": rule_version,
            "inputs": inputs,
            "context": {
                "project_id": project_id,
                "point": point,
                "user_id": "did:pegbot:cli",
                "container_id": container_id,
                "normdoc_id": normdoc_id,
                "package_id": package_id,
                "standard_code": str(normdoc.get("standard_code") or "").strip(),
            },
        },
    )
    execution = execution_payload

    output = {
        "mode": "rule_store_executor",
        "api_base": api_base,
        "normdoc": normdoc,
        "package": package,
        "rule": {
            "rule_id": str(rule.get("rule_id") or "").strip(),
            "rule_version": rule_version,
            "item_name": str(rule.get("item_name") or "").strip(),
            "clause": str(rule.get("clause") or "").strip(),
            "input_fields": input_fields,
            "source": "Rule Store",
        },
        "request": {
            "inputs": inputs,
            "project_id": project_id,
            "point": point,
            "user_id": "did:pegbot:cli",
            "container_id": container_id,
        },
        "execution": execution,
    }

    if args.json:
        _dump_json(output)
        return 0

    status = str(execution.get("result_code") or execution.get("status") or "").strip().upper()
    result_payload = execution.get("result")
    if not status and isinstance(result_payload, dict):
        status = str(result_payload.get("gateStatus") or result_payload.get("outcome") or "").strip().upper()
    status = status or "-"
    conclusion = "合格" if status == "PASS" else "不合格"
    evidence_payload = execution.get("evidence")
    evidence = evidence_payload if isinstance(evidence_payload, dict) else {}
    standard_code = str(
        evidence.get("standard_code")
        or normdoc.get("standard_code")
        or "-"
    ).strip() or "-"
    clause_no = str(evidence.get("clause_no") or rule.get("clause") or "-").strip() or "-"
    clause_title = str(evidence.get("clause_title") or rule.get("item_name") or "").strip()
    clause_content = str(evidence.get("clause_content") or rule.get("source_text") or "").strip()
    normative_basis = f"{standard_code} 第{clause_no}条".strip()
    if clause_title and clause_title != "-":
        normative_basis = f"{normative_basis} {clause_title}".strip()
    reason = "-"
    if isinstance(result_payload, dict):
        reason = str(result_payload.get("message") or result_payload.get("gateDecision") or "").strip() or "-"
    execution_id = str(execution.get("executionId") or execution.get("execution_id") or "").strip() or "-"
    print(f"判定结果：{conclusion}（{status}）")
    print(f"判定原因：{reason}")
    print(f"使用规则：{str(rule.get('rule_id') or '-').strip()} @ {rule_version}")
    print(f"规范依据：{normative_basis}")
    print(f"条款原文（可展开）：{clause_content or 'Clause Store 未检索到条款原文'}")
    print(f"结果：{status}")
    print(f"规范：{str(normdoc.get('standard_code') or '-').strip()} {str(normdoc.get('version') or '-').strip()}")
    print(f"检测项：{str(rule.get('item_name') or item_query).strip()}")
    print(f"条款：{str(rule.get('clause') or '-').strip() or '-'}")
    print(f"执行ID：{execution_id}")
    print(f"Proof：{_extract_proof_identity(execution)}")
    return 0


def _run_status(args: argparse.Namespace) -> int:
    with TestClient(app) as client:
        payload = _resolve_latest_point(client, project_id=str(args.project_id), point=str(args.point))
    if args.json:
        _dump_json(payload)
        return 0

    resolved_output = payload.get("resolved_output")
    if not isinstance(resolved_output, dict):
        print("结论：无记录")
        print(f"检测点：{args.point}")
        return 4

    status = str(payload.get("resolved_status") or "UNKNOWN").strip()
    execution_id = str(payload.get("resolved_execution_id") or "-").strip() or "-"
    branch = str(payload.get("resolved_branch") or payload.get("branch") or "-").strip() or "-"
    is_pass = status.upper() in {"PASS", "QUALIFIED", "SUCCESS"}
    conclusion = "通过" if is_pass else "不通过"
    print(f"结论：{conclusion}")
    print(f"检测点：{args.point}")
    print(f"状态码：{status}")
    print(f"执行ID：{execution_id}")
    print(f"分支：{branch}")
    return 0


def _run_report(args: argparse.Namespace) -> int:
    with TestClient(app) as client:
        payload = _resolve_latest_point(client, project_id=str(args.project_id), point=str(args.point))
    if args.json:
        _dump_json(payload)
        return 0

    resolved_output = payload.get("resolved_output")
    if not isinstance(resolved_output, dict):
        print("结论：无记录")
        print(f"检测点：{args.point}")
        return 4

    raw_payload = resolved_output.get("payload")
    output_payload = raw_payload if isinstance(raw_payload, dict) else {}
    status = str(payload.get("resolved_status") or output_payload.get("result") or "UNKNOWN").strip()
    execution_id = str(payload.get("resolved_execution_id") or output_payload.get("execution_id") or "-").strip() or "-"
    component_id = str(output_payload.get("component_id") or "-").strip() or "-"
    proof_hash = str(payload.get("proof_hash") or output_payload.get("proof_hash") or "-").strip() or "-"
    created_at = str(resolved_output.get("created_at") or "-").strip() or "-"
    failed_rules = _extract_failed_rules(resolved_output)

    is_pass = status.upper() in {"PASS", "QUALIFIED", "SUCCESS"}
    conclusion = "通过" if is_pass else "不通过"
    print(f"结论：{conclusion}")
    print(f"检测点：{args.point}")
    print(f"状态码：{status}")
    print(f"检测项：{component_id}")
    print(f"执行时间：{created_at}")
    print(f"执行ID：{execution_id}")
    print(f"Proof：{'已生成' if proof_hash != '-' else '未生成'}")
    print(f"ProofHash：{proof_hash}")
    print(f"失败规则：{','.join(failed_rules) if failed_rules else '-'}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pegbot", description="PegBot minimal CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    ask = subparsers.add_parser("ask", help="Natural language ask via PegBot/NL2Gate/Executor")
    ask.add_argument("message")
    ask.add_argument("--project-id", default="P1")
    ask.add_argument("--session-id", default=None)
    ask.add_argument("--json", action="store_true")
    ask.set_defaults(handler=_run_ask)

    check = subparsers.add_parser("check", help="Rule Store + Executor check")
    check.add_argument("--project-id", default="P1")
    check.add_argument("--api-base", default=os.getenv("PEGBOT_PLATFORM_API_BASE", _DEFAULT_PLATFORM_API_BASE))
    check.add_argument("--normdoc", default=None, help="Rule Store normdoc_id / standard_code / name")
    check.add_argument("--package-id", default=None, help="optional package_id under selected normdoc")
    check.add_argument("--container-id", default=None, help="optional existing containerId; auto-created when omitted")
    check.add_argument("--point", default="K0+000")
    check.add_argument("--item", required=True)
    check.add_argument("--value", required=True, type=float)
    check.add_argument("--value-field", default=None, help="explicit input field bound to --value")
    check.add_argument("--input", action="append", default=[], help="extra input key=value (repeatable)")
    check.add_argument("--json", action="store_true")
    check.set_defaults(handler=_run_check)

    report = subparsers.add_parser("report", help="Latest point report from execution UTXO")
    report.add_argument("--project-id", default="P1")
    report.add_argument("--point", required=True)
    report.add_argument("--json", action="store_true")
    report.set_defaults(handler=_run_report)

    status = subparsers.add_parser("status", help="Latest point status from execution UTXO")
    status.add_argument("--project-id", default="P1")
    status.add_argument("--point", required=True)
    status.add_argument("--json", action="store_true")
    status.set_defaults(handler=_run_status)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    try:
        return int(handler(args))
    except PegBotCLIError as exc:
        print(f"ERROR {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
