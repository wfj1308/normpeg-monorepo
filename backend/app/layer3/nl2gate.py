from __future__ import annotations

import json
import os
import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Mapping
from urllib import error as url_error
from urllib import request as url_request

from ..core.v_address import VAddressError, build_v_address, parse_v_address
from .packaging import package_answer_after_merge, package_answer_from_branch_results, package_answer_from_execution_result


class NL2GateError(ValueError):
    """Raised when NL text cannot be mapped to a DTO request."""


class NL2GateAdapterError(NL2GateError):
    """Raised when an adapter fails and caller should fallback."""


INTENT_RULE_MAPPING: Dict[str, Dict[str, str | None]] = {
    "check_compaction": {
        "rule_id": "subgrade.compaction",
        "form_type": "T0921-2019",
        "default_spec_id": "JTG_F80_1_2017.4.2.1.compaction",
        "default_component_id": "JTG_F80_1_2017.4.2.1.compaction",
    },
    "check_flatness": {
        "rule_id": "subgrade.flatness",
        "form_type": "T0931-2019",
        "default_spec_id": None,
        "default_component_id": "JTG_F80_1_2017.4.2.1.flatness",
    },
    "check_deflection": {
        "rule_id": "subgrade.deflection",
        "form_type": "T0951-2008",
        "default_spec_id": "JTG_F80_1_2017.4.2.2.deflection",
        "default_component_id": "JTG_F80_1_2017.4.2.2.deflection",
    },
    "check_thickness": {
        "rule_id": "subgrade.thickness",
        "form_type": "T0912-2019",
        "default_spec_id": "JTG_F80_1_2017.4.2.3.thickness",
        "default_component_id": "JTG_F80_1_2017.4.2.3.thickness",
    },
}

INTENT_MULTI_RULE_MAPPING: Dict[str, Dict[str, Any]] = {
    "check_subgrade_acceptance": {
        "rule_ids": [
            "subgrade.compaction",
            "subgrade.thickness",
            "subgrade.deflection",
        ],
        "form_type": "SUBGRADE-ACCEPTANCE",
    },
}

INTENT_ALIASES: Dict[str, str] = {
    "check_compaction": "check_compaction",
    "compaction": "check_compaction",
    "validate_compaction": "check_compaction",
    "check_flatness": "check_flatness",
    "flatness": "check_flatness",
    "validate_flatness": "check_flatness",
    "check_deflection": "check_deflection",
    "deflection": "check_deflection",
    "validate_deflection": "check_deflection",
    "check_thickness": "check_thickness",
    "thickness": "check_thickness",
    "validate_thickness": "check_thickness",
    "check_subgrade_acceptance": "check_subgrade_acceptance",
    "subgrade_acceptance": "check_subgrade_acceptance",
    "subgrade_acceptance_requirements": "check_subgrade_acceptance",
}

COMPONENT_TO_INTENT: Dict[str, str] = {
    "JTG_F80_1_2017.4.2.1.compaction": "check_compaction",
    "JTG_F80_1_2017.4.2.1.compaction_segment_assessment": "check_compaction",
    "JTG_F80_1_2017.4.2.1.flatness": "check_flatness",
    "JTG_F80_1_2017.4.2.2.deflection": "check_deflection",
    "JTG_F80_1_2017.4.2.3.thickness": "check_thickness",
}

FORM_TYPE_TO_INTENT: Dict[str, str] = {
    "T0921-2019": "check_compaction",
    "T0931-2019": "check_flatness",
    "T0951-2008": "check_deflection",
    "T0912-2019": "check_thickness",
}

MEASURED_ITEM_TO_INTENT: Dict[str, str] = {
    "compaction": "check_compaction",
    "flatness": "check_flatness",
    "deflection": "check_deflection",
    "thickness": "check_thickness",
}

INTENT_REQUIRED_NUMERIC_FIELDS: Dict[str, tuple[str, ...]] = {
    "check_compaction": ("compaction_degree",),
    "check_flatness": ("flatness_measured",),
    "check_deflection": ("deflection",),
    "check_thickness": ("thickness",),
    "check_subgrade_acceptance": ("compaction_degree", "thickness", "deflection"),
}

INTENT_REQUIRED_TEXT_FIELDS: Dict[str, tuple[str, ...]] = {
    "check_subgrade_acceptance": ("stake",),
}

INTENT_DISPLAY_LABELS: Dict[str, str] = {
    "check_compaction": "压实度",
    "check_flatness": "平整度",
    "check_deflection": "弯沉",
    "check_thickness": "厚度",
    "check_subgrade_acceptance": "路基验收",
}

FIELD_CLARIFICATION_QUESTIONS: Dict[str, str] = {
    "compaction_degree": "请提供压实度数值",
    "flatness_measured": "请提供平整度数值",
    "deflection": "请提供弯沉数值",
    "thickness": "请提供厚度数值",
    "stake": "请提供检测点（例如 K19+070）",
}

RULE_EXECUTION_MAPPING: Dict[str, Dict[str, str]] = {
    "subgrade.compaction": {
        "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
        "component_id": "JTG_F80_1_2017.4.2.1.compaction",
        "norm_version": "JTG_F80_1_2017",
        "form_type": "T0921-2019",
    },
    "subgrade.flatness": {
        "spec_id": "JTG_F80_1_2017.4.2.1.flatness",
        "component_id": "JTG_F80_1_2017.4.2.1.flatness",
        "norm_version": "JTG_F80_1_2017",
        "form_type": "T0931-2019",
    },
    "subgrade.deflection": {
        "spec_id": "JTG_F80_1_2017.4.2.2.deflection",
        "component_id": "JTG_F80_1_2017.4.2.2.deflection",
        "norm_version": "JTG_F80_1_2017",
        "form_type": "T0951-2008",
    },
    "subgrade.thickness": {
        "spec_id": "JTG_F80_1_2017.4.2.3.thickness",
        "component_id": "JTG_F80_1_2017.4.2.3.thickness",
        "norm_version": "JTG_F80_1_2017",
        "form_type": "T0912-2019",
    },
}

RULE_ID_TO_INTENT: Dict[str, str] = {
    str(route["rule_id"]): intent
    for intent, route in INTENT_RULE_MAPPING.items()
    if str(route.get("rule_id") or "").strip()
}


class LLMAdapter(ABC):
    """Adapter contract for query parsing and answer rendering."""

    @abstractmethod
    def parse_query(self, raw_text: str, project_id: str | None = None) -> Dict[str, Any]:
        """
        Returns unified parse structure:
        {
          "intent": "check_compaction" | "check_deflection" | "check_thickness" | "check_flatness",
          "form_type": "Txxxx-yyyy",
          "rule_id": "domain.rule_id",
          "spec_id": "...",
          "v_address": "v://...",
          "params": {...}
        }
        """

    @abstractmethod
    def render_answer(
        self,
        *,
        answer_mode: str,
        main_result: Dict[str, Any],
        branch_results: Dict[str, Dict[str, Any]],
        merge_event: Dict[str, Any] | None = None,
    ) -> str:
        """Render text answer from deterministic execution results only."""


class RuleBasedAdapter(LLMAdapter):
    """Current rule parser + template renderer."""

    def parse_query(self, raw_text: str, project_id: str | None = None) -> Dict[str, Any]:
        text = str(raw_text).strip()
        if not text:
            raise NL2GateError("message is empty")

        spec_id = _detect_spec_id(text)
        legacy_component_id = _detect_component(text)

        normalized_project_id = (project_id or "P1").strip() or "P1"
        params: Dict[str, Any] = {}
        v_address = _extract_v_address(text)

        if v_address is not None:
            try:
                parsed_v = parse_v_address(v_address)
            except VAddressError as exc:
                raise NL2GateError(f"invalid v_address in message: {exc}") from exc
            params["project_id"] = parsed_v["projectId"]
            params["stake"] = parsed_v["stake"]
            params["branch_id"] = parsed_v.get("branch") or "main"
            if parsed_v.get("layer") is not None:
                params["layer"] = parsed_v["layer"]
            if parsed_v.get("timestamp") is not None:
                params["time"] = parsed_v["timestamp"]
        else:
            params["project_id"] = normalized_project_id

        effective_target = spec_id or legacy_component_id
        route = _resolve_intent_route(
            intent_hint=_detect_intent(text, target=effective_target),
            spec_id=spec_id,
            component_id=effective_target,
            form_type_hint=None,
            raw_text=text,
        )
        intent = str(route["intent"])
        form_type = str(route["form_type"])
        rule_id = str(route["rule_id"])
        route_rule_ids_raw = route.get("rule_ids")
        route_rule_ids = (
            [str(item).strip() for item in route_rule_ids_raw if str(item).strip()]
            if isinstance(route_rule_ids_raw, list)
            else []
        )

        if len(route_rule_ids) > 1:
            stake = _extract_stake(text) or str(params.get("stake") or "")
            if stake:
                params["stake"] = stake
            params["layer_depth"] = _extract_layer_depth(text) or str(params.get("layer_depth") or "0-0.8m")
            params["layer_zone"] = _extract_layer_zone(text) or str(params.get("layer_zone") or "surface")
            params["road_class"] = _extract_road_class(text) or str(params.get("road_class") or "default")

            compaction_value = _extract_compaction_value(text)
            if compaction_value is None:
                compaction_value = _extract_percent_value(text)
            if compaction_value is not None:
                params["compaction_degree"] = compaction_value
                params["representative_value"] = _extract_representative_value(text) or compaction_value

            thickness_value = _extract_thickness_value(text)
            if thickness_value is not None:
                params["thickness"] = thickness_value
                params.setdefault("design_thickness", _extract_design_thickness(text) or 200.0)

            deflection_value = _extract_deflection_value(text)
            if deflection_value is None:
                number_value = _extract_number_value(text)
                if number_value is not None and "deflection" in text.lower():
                    deflection_value = number_value
            if deflection_value is not None:
                params["deflection"] = deflection_value
        elif effective_target == "JTG_F80_1_2017.4.2.1.compaction":
            stake = _extract_stake(text) or str(params.get("stake") or "K15+200")
            params["stake"] = stake
            params["layer_depth"] = _extract_layer_depth(text) or "0-0.8m"
            compaction_value = _extract_compaction_value(text)
            if compaction_value is None:
                compaction_value = _extract_percent_value(text)
            if compaction_value is not None:
                params["compaction_degree"] = compaction_value
                params["representative_value"] = _extract_representative_value(text) or compaction_value
        elif effective_target == "JTG_F80_1_2017.4.2.1.flatness":
            stake = _extract_stake(text) or str(params.get("stake") or "K20+100")
            params["stake"] = stake
            params["surface_type"] = _extract_surface_type(text) or "asphalt"
            flatness_value = _extract_flatness_value(text)
            if flatness_value is None:
                flatness_value = _extract_number_value(text)
            if flatness_value is not None:
                params["flatness_measured"] = flatness_value
        elif effective_target == "JTG_F80_1_2017.4.2.2.deflection":
            stake = _extract_stake(text) or str(params.get("stake") or "K20+100")
            params["stake"] = stake
            params["road_class"] = _extract_road_class(text) or str(params.get("road_class") or "default")
            deflection_value = _extract_deflection_value(text)
            if deflection_value is None:
                deflection_value = _extract_number_value(text)
            if deflection_value is not None:
                params["deflection"] = deflection_value
        elif effective_target == "JTG_F80_1_2017.4.2.3.thickness":
            stake = _extract_stake(text) or str(params.get("stake") or "K20+100")
            params["stake"] = stake
            params["layer_zone"] = _extract_layer_zone(text) or str(params.get("layer_zone") or "surface")
            thickness_value = _extract_thickness_value(text)
            if thickness_value is None:
                thickness_value = _extract_number_value(text)
            if thickness_value is not None:
                params["thickness"] = thickness_value
            design_thickness = _extract_design_thickness(text)
            if design_thickness is not None:
                params["design_thickness"] = design_thickness

        # Cross-field extraction to support multi-turn supplements where one utterance may
        # contain fields for multiple rules.
        if not str(params.get("stake") or "").strip():
            extracted_stake = _extract_stake(text)
            if extracted_stake:
                params["stake"] = extracted_stake
        if params.get("compaction_degree") is None:
            extracted_compaction = _extract_compaction_value(text)
            if extracted_compaction is None:
                extracted_compaction = _extract_percent_value(text)
            if extracted_compaction is not None:
                params["compaction_degree"] = extracted_compaction
                params.setdefault("representative_value", _extract_representative_value(text) or extracted_compaction)
        if params.get("thickness") is None:
            extracted_thickness = _extract_thickness_value(text)
            if extracted_thickness is not None:
                params["thickness"] = extracted_thickness
        if params.get("deflection") is None:
            extracted_deflection = _extract_deflection_value(text)
            if extracted_deflection is not None:
                params["deflection"] = extracted_deflection

        if v_address is None and (spec_id is not None or len(route_rule_ids) > 1):
            resolved_stake = str(params.get("stake") or "").strip()
            if resolved_stake:
                v_address = _build_target_v(
                    project_id=str(params.get("project_id") or normalized_project_id),
                    stake=resolved_stake,
                    branch_id=str(params.get("branch_id") or "main"),
                    layer=params.get("layer"),
                    timestamp=params.get("time"),
                )

        parsed: Dict[str, Any] = {
            "intent": intent,
            "form_type": form_type,
            "rule_id": rule_id,
            "spec_id": spec_id,
            "v_address": v_address,
            "params": params,
            "raw_text": text,
        }
        if route_rule_ids:
            parsed["rule_ids"] = route_rule_ids
        if legacy_component_id and legacy_component_id != spec_id:
            parsed["legacy_component_id"] = legacy_component_id
        return parsed

    def render_answer(
        self,
        *,
        answer_mode: str,
        main_result: Dict[str, Any],
        branch_results: Dict[str, Dict[str, Any]],
        merge_event: Dict[str, Any] | None = None,
    ) -> str:
        mode = str(answer_mode).strip().lower()
        if mode == "dual":
            return package_answer_from_branch_results(main_result=main_result, branch_results=branch_results)
        if merge_event:
            return package_answer_after_merge(main_result=main_result, merge_event=merge_event)
        return package_answer_from_execution_result(main_result)


class OpenAIAdapter(LLMAdapter):
    """
    Minimal OpenAI adapter scaffold.
    - Reads key/model from environment
    - Fails fast when unavailable, caller handles fallback
    """

    def __init__(
        self,
        *,
        api_key_env: str = "OPENAI_API_KEY",
        model_env: str = "OPENAI_MODEL",
        base_url_env: str = "OPENAI_BASE_URL",
        timeout_seconds: float = 12.0,
    ) -> None:
        self.api_key_env = api_key_env
        self.model_env = model_env
        self.base_url_env = base_url_env
        self.timeout_seconds = timeout_seconds

    def parse_query(self, raw_text: str, project_id: str | None = None) -> Dict[str, Any]:
        payload = self._call_openai_json(
            system_prompt=(
                "You are NL2Spec parser. Return strict JSON only with keys: "
                "intent,form_type,params,v_address,spec_id. "
                "intent must be one of check_compaction/check_deflection/check_thickness/check_flatness/check_subgrade_acceptance. "
                "Do not invent rules. Do not calculate pass/fail."
            ),
            user_payload={
                "raw_text": raw_text,
                "project_id": project_id,
                "now_utc": _utc_now(),
            },
        )
        return _normalize_parsed_query(payload, raw_text=raw_text, project_id=project_id)

    def render_answer(
        self,
        *,
        answer_mode: str,
        main_result: Dict[str, Any],
        branch_results: Dict[str, Dict[str, Any]],
        merge_event: Dict[str, Any] | None = None,
    ) -> str:
        payload = self._call_openai_json(
            system_prompt=(
                "You are NL2Gate answer renderer. Use only provided deterministic execution results. "
                "Do not recalculate, do not infer unstated facts. "
                "Return JSON only: {\"answer\":\"...\"}."
            ),
            user_payload={
                "answer_mode": answer_mode,
                "main_result": main_result,
                "branch_results": branch_results,
                "merge_event": merge_event,
            },
        )
        answer = payload.get("answer")
        if not isinstance(answer, str) or not answer.strip():
            raise NL2GateAdapterError("openai render returned empty answer")
        return answer.strip()

    def _call_openai_json(self, *, system_prompt: str, user_payload: Mapping[str, Any]) -> Dict[str, Any]:
        api_key = str(os.getenv(self.api_key_env, "")).strip()
        if not api_key:
            raise NL2GateAdapterError(f"{self.api_key_env} is not configured")

        model = str(os.getenv(self.model_env, "gpt-4.1-mini")).strip() or "gpt-4.1-mini"
        base_url = str(os.getenv(self.base_url_env, "https://api.openai.com/v1")).strip() or "https://api.openai.com/v1"
        url = f"{base_url.rstrip('/')}/chat/completions"

        request_payload = {
            "model": model,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
            ],
        }
        req = url_request.Request(
            url=url,
            data=json.dumps(request_payload, ensure_ascii=False).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with url_request.urlopen(req, timeout=self.timeout_seconds) as resp:
                raw = resp.read()
        except (url_error.URLError, TimeoutError, OSError) as exc:
            raise NL2GateAdapterError(f"openai request failed: {exc}") from exc

        try:
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise NL2GateAdapterError("openai response is not valid JSON") from exc

        content = _extract_openai_content(body)
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise NL2GateAdapterError("openai content is not JSON object") from exc
        if not isinstance(parsed, dict):
            raise NL2GateAdapterError("openai content is not JSON object")
        return parsed


class NL2GateAdapterRuntime:
    """Adapter selector with automatic fallback."""

    def __init__(
        self,
        *,
        mode: str | None = None,
        rule_adapter: LLMAdapter | None = None,
        openai_adapter: LLMAdapter | None = None,
    ) -> None:
        self.mode = _normalize_mode(mode or os.getenv("NL2GATE_MODE", "rule_based"))
        self.rule_adapter = rule_adapter or RuleBasedAdapter()
        self.openai_adapter = openai_adapter or OpenAIAdapter()

    def parse_query(self, raw_text: str, project_id: str | None = None) -> tuple[Dict[str, Any], Dict[str, Any]]:
        if self.mode == "openai":
            try:
                parsed = self.openai_adapter.parse_query(raw_text=raw_text, project_id=project_id)
                normalized = _normalize_parsed_query(parsed, raw_text=raw_text, project_id=project_id)
                return normalized, {
                    "mode_requested": self.mode,
                    "adapter_used": "openai",
                    "fallback_used": False,
                }
            except Exception as exc:
                parsed = self.rule_adapter.parse_query(raw_text=raw_text, project_id=project_id)
                return parsed, {
                    "mode_requested": self.mode,
                    "adapter_used": "rule_based",
                    "fallback_used": True,
                    "fallback_reason": str(exc),
                }
        parsed = self.rule_adapter.parse_query(raw_text=raw_text, project_id=project_id)
        return parsed, {
            "mode_requested": self.mode,
            "adapter_used": "rule_based",
            "fallback_used": False,
        }

    def render_answer(
        self,
        *,
        answer_mode: str,
        main_result: Dict[str, Any],
        branch_results: Dict[str, Dict[str, Any]],
        merge_event: Dict[str, Any] | None = None,
    ) -> tuple[str, Dict[str, Any]]:
        if self.mode == "openai":
            try:
                answer = self.openai_adapter.render_answer(
                    answer_mode=answer_mode,
                    main_result=main_result,
                    branch_results=branch_results,
                    merge_event=merge_event,
                )
                return answer, {
                    "mode_requested": self.mode,
                    "adapter_used": "openai",
                    "fallback_used": False,
                }
            except Exception as exc:
                answer = self.rule_adapter.render_answer(
                    answer_mode=answer_mode,
                    main_result=main_result,
                    branch_results=branch_results,
                    merge_event=merge_event,
                )
                return answer, {
                    "mode_requested": self.mode,
                    "adapter_used": "rule_based",
                    "fallback_used": True,
                    "fallback_reason": str(exc),
                }
        answer = self.rule_adapter.render_answer(
            answer_mode=answer_mode,
            main_result=main_result,
            branch_results=branch_results,
            merge_event=merge_event,
        )
        return answer, {
            "mode_requested": self.mode,
            "adapter_used": "rule_based",
            "fallback_used": False,
        }


def parse_nl_to_dto(message: str, project_id: str | None = None) -> Dict[str, Any]:
    runtime = NL2GateAdapterRuntime()
    parsed_query, adapter_meta = runtime.parse_query(raw_text=message, project_id=project_id)
    if "raw_text" not in parsed_query:
        parsed_query = dict(parsed_query)
        parsed_query["raw_text"] = str(message)
    request_payload = build_execution_request_from_parsed_query(parsed_query, project_id=project_id)
    return {
        "intent": request_payload["intent"],
        "form_type": request_payload["form_type"],
        "rule_id": request_payload["rule_id"],
        "rule_ids": request_payload.get("rule_ids") or [request_payload["rule_id"]],
        "spec_id": request_payload["spec_id"],
        "inputs": request_payload.get("inputs", request_payload["params"]),
        "context": request_payload.get("context", {}),
        "v_address": request_payload["v_address"],
        "params": request_payload["params"],
        "needs_clarification": bool(request_payload.get("needs_clarification", False)),
        "missing_fields": request_payload.get("missing_fields") or [],
        "clarification_reasons": request_payload.get("clarification_reasons") or [],
        "clarification_questions": request_payload.get("clarification_questions") or [],
        "ui_hint": request_payload.get("ui_hint"),
        "parse_trace": {
            "raw_text": str(message),
            "parsed_query": parsed_query,
            "adapter": adapter_meta,
        },
        "parsed_query": parsed_query,
        "adapter": adapter_meta,
    }


def build_execution_request_from_parsed_query(parsed_query: Mapping[str, Any], project_id: str | None = None) -> Dict[str, Any]:
    raw_text = str(parsed_query.get("raw_text") or "").strip()
    raw_spec_id = parsed_query.get("spec_id")
    spec_id = None
    if str(raw_spec_id or "").strip():
        try:
            spec_id = _normalize_spec_id(raw_spec_id)
        except NL2GateError:
            spec_id = None
    legacy_component_id = str(parsed_query.get("legacy_component_id") or "").strip()
    if not legacy_component_id and isinstance(raw_spec_id, str):
        detected_legacy = _detect_component(raw_spec_id)
        if detected_legacy is not None:
            legacy_component_id = detected_legacy

    params = parsed_query.get("params", {})
    if not isinstance(params, dict):
        params = {}
    params = dict(params)

    route = _resolve_intent_route(
        intent_hint=str(parsed_query.get("intent") or "").strip(),
        spec_id=spec_id,
        component_id=legacy_component_id or spec_id,
        form_type_hint=str(parsed_query.get("form_type") or "").strip() or None,
        raw_text=str(parsed_query.get("raw_text") or ""),
    )
    intent = str(route["intent"])
    form_type = str(route["form_type"])
    rule_id = str(route["rule_id"])
    route_rule_ids_raw = route.get("rule_ids")
    route_rule_ids = (
        [str(item).strip() for item in route_rule_ids_raw if str(item).strip()]
        if isinstance(route_rule_ids_raw, list)
        else []
    )
    if not route_rule_ids and rule_id:
        route_rule_ids = [rule_id]

    if spec_id is None:
        default_spec_id = route.get("default_spec_id")
        if isinstance(default_spec_id, str) and default_spec_id.strip():
            spec_id = default_spec_id.strip()

    raw_target_v = parsed_query.get("v_address")
    target_v = str(raw_target_v).strip() if isinstance(raw_target_v, str) else ""
    target_v_parsed: Dict[str, Any] = {}
    if target_v:
        try:
            target_v_parsed = parse_v_address(target_v)
        except VAddressError:
            target_v_parsed = {}

    resolved_project_id = str(
        params.get("project_id")
        or target_v_parsed.get("projectId")
        or project_id
        or "P1"
    ).strip() or "P1"
    resolved_stake = str(params.get("stake") or target_v_parsed.get("stake") or "").strip()
    if spec_id and not resolved_stake:
        resolved_stake = "K15+200" if spec_id == "JTG_F80_1_2017.4.2.1.compaction" else "K20+100"
    if len(route_rule_ids) > 1 and not resolved_stake:
        resolved_stake = str(params.get("stake") or _extract_stake(raw_text) or "").strip()

    if len(route_rule_ids) > 1:
        payload = dict(params)
        if resolved_project_id:
            payload.setdefault("project_id", resolved_project_id)
        if resolved_stake:
            payload.setdefault("stake", resolved_stake)

        payload.setdefault("layer_depth", str(payload.get("layer_depth") or payload.get("layer") or "0-0.8m"))
        payload.setdefault("layer_zone", str(payload.get("layer_zone") or payload.get("layer") or "surface"))
        payload.setdefault("road_class", str(payload.get("road_class") or "default"))
        payload.setdefault("actor_did", "did:layer3:nl2gate")
        payload.setdefault("inspected_at", _utc_now())

        if payload.get("compaction_degree") is not None and payload.get("representative_value") is None:
            payload["representative_value"] = payload["compaction_degree"]
        if payload.get("thickness") is not None:
            payload.setdefault("design_thickness", payload.get("design_thickness") or 200.0)

        for numeric_field in ("compaction_degree", "representative_value", "thickness", "design_thickness", "deflection"):
            value = payload.get(numeric_field)
            if value is None:
                continue
            try:
                payload[numeric_field] = float(value)
            except (TypeError, ValueError):
                # Keep original value so clarification logic can flag non-numeric input.
                pass

        if target_v:
            payload["v_address"] = target_v
        elif str(payload.get("stake") or "").strip():
            payload["v_address"] = _build_target_v(
                project_id=str(payload.get("project_id") or resolved_project_id),
                stake=str(payload.get("stake")),
                branch_id=str(payload.get("branch_id") or "main"),
                layer=payload.get("layer"),
                timestamp=payload.get("time"),
            )

        default_norm_version = ""
        if route_rule_ids:
            default_norm_version = _resolve_norm_version_from_rule_id(route_rule_ids[0])
        normalized_context = {
            "project_id": str(payload.get("project_id") or resolved_project_id),
            "norm_version": str(payload.get("norm_version") or default_norm_version),
        }
        return _finalize_execution_request(
            request_payload={
                "intent": intent,
                "form_type": form_type,
                "rule_id": route_rule_ids[0],
                "rule_ids": route_rule_ids,
                "spec_id": None,
                "inputs": payload,
                "context": normalized_context,
                "v_address": payload.get("v_address"),
                "params": payload,
                "legacy_component_id": legacy_component_id or None,
            },
            raw_text=raw_text,
            form_type_hint="",
            explicit_spec_hint=str(raw_spec_id or ""),
            explicit_component_hint=legacy_component_id,
        )

    if spec_id is None:
        payload = dict(params)
        if resolved_project_id:
            payload.setdefault("project_id", resolved_project_id)
        if resolved_stake:
            payload.setdefault("stake", resolved_stake)
        payload.setdefault("actor_did", "did:layer3:nl2gate")
        payload.setdefault("inspected_at", _utc_now())
        if target_v:
            payload["v_address"] = target_v
        normalized_context = {
            "project_id": str(payload.get("project_id") or resolved_project_id),
            "norm_version": _infer_norm_version_from_spec_id(spec_id),
        }
        return _finalize_execution_request(
            request_payload={
            "intent": intent,
            "form_type": form_type,
            "rule_id": rule_id,
            "rule_ids": route_rule_ids,
            "spec_id": None,
            "inputs": payload,
            "context": normalized_context,
            "v_address": target_v or payload.get("v_address"),
            "params": payload,
            "legacy_component_id": legacy_component_id or None,
            },
            raw_text=raw_text,
            form_type_hint="",
            explicit_spec_hint=str(raw_spec_id or ""),
            explicit_component_hint=legacy_component_id,
        )

    if spec_id == "JTG_F80_1_2017.4.2.1.compaction":
        payload = {
            "stake": resolved_stake,
            "layer_depth": str(params.get("layer_depth") or params.get("layer") or "0-0.8m"),
            "project_id": resolved_project_id,
            "actor_did": "did:layer3:nl2gate",
            "inspected_at": _utc_now(),
        }
        if params.get("compaction_degree") is not None:
            payload["compaction_degree"] = float(params["compaction_degree"])
        if params.get("representative_value") is not None:
            payload["representative_value"] = float(params["representative_value"])
        elif params.get("compaction_degree") is not None:
            payload["representative_value"] = float(params["compaction_degree"])
    elif spec_id == "JTG_F80_1_2017.4.2.1.flatness":
        payload = {
            "stake": resolved_stake,
            "project_id": resolved_project_id,
            "surface_type": str(params.get("surface_type") or "asphalt"),
            "actor_did": "did:layer3:nl2gate",
            "inspected_at": _utc_now(),
        }
        if params.get("flatness_measured") is not None:
            payload["flatness_measured"] = float(params["flatness_measured"])
    elif spec_id == "JTG_F80_1_2017.4.2.2.deflection":
        payload = {
            "stake": resolved_stake,
            "project_id": resolved_project_id,
            "road_class": str(params.get("road_class") or "default"),
            "actor_did": "did:layer3:nl2gate",
            "inspected_at": _utc_now(),
        }
        if params.get("deflection") is not None:
            payload["deflection"] = float(params["deflection"])
    elif spec_id == "JTG_F80_1_2017.4.2.3.thickness":
        payload = {
            "stake": resolved_stake,
            "project_id": resolved_project_id,
            "layer_zone": str(params.get("layer_zone") or params.get("layer") or "surface"),
            "actor_did": "did:layer3:nl2gate",
            "inspected_at": _utc_now(),
        }
        if params.get("thickness") is not None:
            payload["thickness"] = float(params["thickness"])
        if params.get("design_thickness") is not None:
            payload["design_thickness"] = float(params["design_thickness"])
        else:
            payload["design_thickness"] = 200.0
    else:
        specir_entry = _get_specir_entry_by_id(spec_id)
        if specir_entry is None:
            raise NL2GateError(f"unsupported spec_id: {spec_id}")
        measured_item = str(specir_entry.get("measured_item", "")).strip().lower()
        if measured_item == "compaction":
            payload = {
                "stake": resolved_stake,
                "layer_depth": str(params.get("layer_depth") or params.get("layer") or "0-0.8m"),
                "project_id": resolved_project_id,
                "actor_did": "did:layer3:nl2gate",
                "inspected_at": _utc_now(),
            }
            if params.get("compaction_degree") is not None:
                payload["compaction_degree"] = float(params["compaction_degree"])
            if params.get("representative_value") is not None:
                payload["representative_value"] = float(params["representative_value"])
            elif params.get("compaction_degree") is not None:
                payload["representative_value"] = float(params["compaction_degree"])
        elif measured_item == "deflection":
            payload = {
                "stake": resolved_stake,
                "project_id": resolved_project_id,
                "road_class": str(params.get("road_class") or "default"),
                "actor_did": "did:layer3:nl2gate",
                "inspected_at": _utc_now(),
            }
            if params.get("deflection") is not None:
                payload["deflection"] = float(params["deflection"])
        elif measured_item == "thickness":
            payload = {
                "stake": resolved_stake,
                "project_id": resolved_project_id,
                "layer_zone": str(params.get("layer_zone") or params.get("layer") or "surface"),
                "design_thickness": float(params.get("design_thickness") or 200.0),
                "actor_did": "did:layer3:nl2gate",
                "inspected_at": _utc_now(),
            }
            if params.get("thickness") is not None:
                payload["thickness"] = float(params["thickness"])
        else:
            raise NL2GateError(f"unsupported specir measured_item: {measured_item}")

    if target_v:
        payload["v_address"] = target_v

    normalized_context = {
        "project_id": str(payload.get("project_id") or resolved_project_id),
        "norm_version": _infer_norm_version_from_spec_id(spec_id),
    }
    return _finalize_execution_request(
        request_payload={
            "intent": intent,
            "form_type": form_type,
            "rule_id": rule_id,
            "rule_ids": route_rule_ids,
            "spec_id": spec_id,
            "inputs": payload,
            "context": normalized_context,
            "v_address": target_v or payload.get("v_address"),
            "params": payload,
            "legacy_component_id": legacy_component_id or None,
        },
        raw_text=raw_text,
        form_type_hint="",
        explicit_spec_hint=str(raw_spec_id or ""),
        explicit_component_hint=legacy_component_id,
    )


def render_answer_from_results(
    *,
    answer_mode: str,
    main_result: Dict[str, Any],
    branch_results: Dict[str, Dict[str, Any]],
    merge_event: Dict[str, Any] | None = None,
) -> tuple[str, Dict[str, Any]]:
    runtime = NL2GateAdapterRuntime()
    return runtime.render_answer(
        answer_mode=answer_mode,
        main_result=main_result,
        branch_results=branch_results,
        merge_event=merge_event,
    )


def _normalize_spec_id(value: Any) -> str:
    hint = str(value or "").strip()
    if not hint:
        raise NL2GateError("spec_id is required")

    alias_map = {
        "compaction": "JTG_F80_1_2017.4.2.1.compaction",
        "flatness": "JTG_F80_1_2017.4.2.1.flatness",
        "deflection": "JTG_F80_1_2017.4.2.2.deflection",
        "thickness": "JTG_F80_1_2017.4.2.3.thickness",
        "\u538b\u5b9e\u5ea6": "JTG_F80_1_2017.4.2.1.compaction",
        "\u5e73\u6574\u5ea6": "JTG_F80_1_2017.4.2.1.flatness",
        "\u5f2f\u6c89": "JTG_F80_1_2017.4.2.2.deflection",
        "\u539a\u5ea6": "JTG_F80_1_2017.4.2.3.thickness",
    }

    if hint in _known_specir_ids():
        return hint

    lowered = hint.lower()
    mapped = alias_map.get(lowered) or alias_map.get(hint)
    if mapped and mapped in _known_specir_ids():
        return mapped

    detected = _detect_spec_id(hint)
    if detected is not None:
        return detected

    raise NL2GateError("unsupported spec_id")


def _infer_norm_version_from_spec_id(spec_id: str | None) -> str:
    value = str(spec_id or "").strip()
    if not value:
        return ""
    if "." in value:
        return value.split(".", 1)[0]
    return value


def _normalize_form_type(value: str) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return ""
    normalized = raw.replace("_", "-")
    if normalized == "T0921":
        return "T0921-2019"
    if normalized == "T0931":
        return "T0931-2019"
    if normalized == "T0951":
        return "T0951-2008"
    if normalized == "T0912":
        return "T0912-2019"
    return normalized


def _intent_from_target(target: str | None) -> str | None:
    candidate = str(target or "").strip()
    if not candidate:
        return None

    direct = COMPONENT_TO_INTENT.get(candidate)
    if direct:
        return direct

    spec_entry = _get_specir_entry_by_id(candidate)
    if spec_entry is None:
        return None
    measured_item = str(spec_entry.get("measured_item") or "").strip().lower()
    return MEASURED_ITEM_TO_INTENT.get(measured_item)


def _resolve_intent_route(
    *,
    intent_hint: str,
    spec_id: str | None,
    component_id: str | None,
    form_type_hint: str | None,
    raw_text: str,
) -> Dict[str, Any]:
    normalized_hint = str(intent_hint or "").strip().lower()
    resolved_intent = INTENT_ALIASES.get(normalized_hint, "")
    if not resolved_intent:
        resolved_intent = _intent_from_target(spec_id) or _intent_from_target(component_id) or ""
    if not resolved_intent and form_type_hint:
        resolved_intent = FORM_TYPE_TO_INTENT.get(_normalize_form_type(form_type_hint), "")
    if not resolved_intent:
        detected_target = _detect_component(raw_text)
        resolved_intent = _intent_from_target(detected_target) or ""
    if not resolved_intent:
        detected_intent = _detect_intent(raw_text, target=spec_id or component_id)
        resolved_intent = INTENT_ALIASES.get(str(detected_intent or "").strip().lower(), "")

    if not resolved_intent:
        raise NL2GateError("cannot map NL intent to predefined rule mapping")

    if resolved_intent in INTENT_MULTI_RULE_MAPPING:
        route = dict(INTENT_MULTI_RULE_MAPPING[resolved_intent])
        route_rule_ids_raw = route.get("rule_ids")
        route_rule_ids = (
            [str(item).strip() for item in route_rule_ids_raw if str(item).strip()]
            if isinstance(route_rule_ids_raw, list)
            else []
        )
        if not route_rule_ids:
            raise NL2GateError(f"intent mapping has empty rule_ids: {resolved_intent}")
        route["intent"] = resolved_intent
        route["form_type"] = str(route.get("form_type") or "")
        route["rule_id"] = route_rule_ids[0]
        route["rule_ids"] = route_rule_ids
    else:
        route = dict(INTENT_RULE_MAPPING[resolved_intent])
        route["intent"] = resolved_intent
        route["form_type"] = str(route.get("form_type") or "")
        route["rule_id"] = str(route.get("rule_id") or "")
        route["rule_ids"] = [route["rule_id"]]

    normalized_form_hint = _normalize_form_type(str(form_type_hint or ""))
    if normalized_form_hint and normalized_form_hint != route["form_type"]:
        raise NL2GateError(
            f"intent/form_type mismatch: intent={resolved_intent}, form_type={normalized_form_hint}"
        )

    return route


def resolve_rule_execution_target(rule_id: str, norm_version: str | None = None) -> Dict[str, str]:
    normalized_rule_id = str(rule_id or "").strip()
    if not normalized_rule_id:
        raise NL2GateError("rule_id is required")

    route = RULE_EXECUTION_MAPPING.get(normalized_rule_id)
    if route is None:
        raise NL2GateError(f"unsupported rule_id: {normalized_rule_id}")

    normalized_norm_version = str(norm_version or "").strip()
    mapped_norm_version = str(route.get("norm_version") or "").strip()
    if normalized_norm_version and mapped_norm_version and normalized_norm_version != mapped_norm_version:
        raise NL2GateError(
            f"rule_id/norm_version mismatch: rule_id={normalized_rule_id}, norm_version={normalized_norm_version}"
        )

    return {
        "rule_id": normalized_rule_id,
        "spec_id": str(route.get("spec_id") or "").strip(),
        "component_id": str(route.get("component_id") or route.get("spec_id") or "").strip(),
        "form_type": str(route.get("form_type") or "").strip(),
        "norm_version": normalized_norm_version or mapped_norm_version,
    }


def resolve_rule_execution_targets(rule_ids: list[str], norm_version: str | None = None) -> list[Dict[str, str]]:
    normalized_rule_ids = [str(item).strip() for item in rule_ids if str(item).strip()]
    if not normalized_rule_ids:
        raise NL2GateError("rule_ids is required")
    return [resolve_rule_execution_target(item, norm_version=norm_version) for item in normalized_rule_ids]


def _resolve_norm_version_from_rule_id(rule_id: str) -> str:
    route = RULE_EXECUTION_MAPPING.get(str(rule_id or "").strip()) or {}
    return str(route.get("norm_version") or "").strip()


def _is_multi_rule_intent(intent: str) -> bool:
    return str(intent or "").strip() in INTENT_MULTI_RULE_MAPPING


def _is_missing_numeric(value: Any) -> bool:
    if value is None:
        return True
    text = str(value).strip()
    if not text:
        return True
    try:
        float(text)
    except (TypeError, ValueError):
        return True
    return False


def _detect_intent_candidates(
    *,
    raw_text: str,
    spec_id: str | None,
    component_id: str | None,
    form_type: str | None,
) -> list[str]:
    candidates: list[str] = []

    def _append(intent_key: str | None) -> None:
        if not intent_key:
            return
        if intent_key not in candidates:
            candidates.append(intent_key)

    _append(_intent_from_target(spec_id))
    _append(_intent_from_target(component_id))
    if form_type:
        _append(FORM_TYPE_TO_INTENT.get(_normalize_form_type(form_type)))

    text = str(raw_text or "")
    lower = text.lower()

    if "压实度" in text or "compaction" in lower or "t0921" in lower:
        _append("check_compaction")
    if "平整度" in text or "flatness" in lower or "iri" in lower or "t0931" in lower:
        _append("check_flatness")
    if "弯沉" in text or "deflection" in lower or "贝克曼" in text or "t0951" in lower:
        _append("check_deflection")
    if "厚度" in text or "thickness" in lower or "t0912" in lower:
        _append("check_thickness")

    return candidates


def _build_clarification_plan(
    *,
    request_payload: Mapping[str, Any],
    raw_text: str,
    form_type_hint: str,
    explicit_spec_hint: str,
    explicit_component_hint: str,
) -> Dict[str, Any] | None:
    intent = str(request_payload.get("intent") or "").strip()
    rule_ids_raw = request_payload.get("rule_ids")
    rule_ids = (
        [str(item).strip() for item in rule_ids_raw if str(item).strip()]
        if isinstance(rule_ids_raw, list)
        else []
    )
    if not rule_ids:
        fallback_rule_id = str(request_payload.get("rule_id") or "").strip()
        if fallback_rule_id:
            rule_ids = [fallback_rule_id]
    is_multi_rule_request = _is_multi_rule_intent(intent) or len(rule_ids) > 1
    params = request_payload.get("params")
    if not isinstance(params, dict):
        params = {}

    reasons: list[str] = []
    questions: list[str] = []
    missing_fields: list[str] = []
    text_candidates = _detect_intent_candidates(
        raw_text=raw_text,
        spec_id=None,
        component_id=None,
        form_type=None,
    )

    if len(text_candidates) > 1 and not is_multi_rule_request:
        reasons.append("multi_rule_conflict")
        candidate_labels = "、".join(INTENT_DISPLAY_LABELS.get(item, item) for item in text_candidates)
        questions.append(f"检测到多个规则候选（{candidate_labels}），请明确本次要检查哪一项？")

    explicit_hint_exists = bool(
        str(explicit_spec_hint).strip()
        or str(explicit_component_hint).strip()
        or str(form_type_hint).strip()
    )

    if not text_candidates and not explicit_hint_exists and not is_multi_rule_request:
        reasons.append("intent_unclear")
        questions.append("请说明检测项目：压实度、平整度、弯沉或厚度。")

    if "intent_unclear" not in reasons:
        required_fields: tuple[str, ...]
        if is_multi_rule_request:
            multi_required_fields: list[str] = []
            for current_rule_id in rule_ids:
                mapped_intent = RULE_ID_TO_INTENT.get(current_rule_id)
                if not mapped_intent:
                    continue
                for field_name in INTENT_REQUIRED_NUMERIC_FIELDS.get(mapped_intent, ()):
                    if field_name not in multi_required_fields:
                        multi_required_fields.append(field_name)
            required_fields = tuple(multi_required_fields)
        else:
            required_fields = INTENT_REQUIRED_NUMERIC_FIELDS.get(intent, ())
        for field_name in required_fields:
            if _is_missing_numeric(params.get(field_name)):
                reasons.append("missing_params")
                missing_fields.append(field_name)
                questions.append(FIELD_CLARIFICATION_QUESTIONS.get(field_name, f"请提供 {field_name}"))

        required_text_fields: tuple[str, ...]
        if is_multi_rule_request:
            resolved_text_fields: list[str] = []
            if "stake" not in resolved_text_fields:
                resolved_text_fields.append("stake")
            for current_rule_id in rule_ids:
                mapped_intent = RULE_ID_TO_INTENT.get(current_rule_id)
                if not mapped_intent:
                    continue
                for field_name in INTENT_REQUIRED_TEXT_FIELDS.get(mapped_intent, ()):
                    if field_name not in resolved_text_fields:
                        resolved_text_fields.append(field_name)
            required_text_fields = tuple(resolved_text_fields)
        else:
            required_text_fields = INTENT_REQUIRED_TEXT_FIELDS.get(intent, ())
        for field_name in required_text_fields:
            if not str(params.get(field_name) or "").strip():
                reasons.append("missing_params")
                missing_fields.append(field_name)
                questions.append(FIELD_CLARIFICATION_QUESTIONS.get(field_name, f"请提供 {field_name}"))

    text = str(raw_text or "")
    lower = text.lower()
    has_explicit_layer = any(token in text for token in ("路基", "基层", "面层", "底基层")) or any(
        token in lower for token in ("subgrade", "base", "surface", "subbase")
    )
    layer_fields = ("layer_zone", "layer_depth", "layer", "surface_type")
    missing_layer_context = not any(str(params.get(name) or "").strip() for name in layer_fields)
    if ("层" in text or "layer" in lower) and missing_layer_context and not has_explicit_layer:
        reasons.append("missing_params")
        questions.append("是路基还是基层？")

    if not reasons:
        return None

    dedup_reasons: list[str] = []
    for reason in reasons:
        if reason not in dedup_reasons:
            dedup_reasons.append(reason)

    dedup_questions: list[str] = []
    for question in questions:
        normalized = str(question).strip()
        if normalized and normalized not in dedup_questions:
            dedup_questions.append(normalized)

    dedup_missing_fields: list[str] = []
    for field_name in missing_fields:
        normalized_field = str(field_name).strip()
        if normalized_field and normalized_field not in dedup_missing_fields:
            dedup_missing_fields.append(normalized_field)

    return {
        "needs_clarification": True,
        "clarification_reasons": dedup_reasons,
        "clarification_questions": dedup_questions,
        "missing_fields": dedup_missing_fields,
        "ui_hint": "需要补充信息",
        "engine_action": "skip",
    }


def _finalize_execution_request(
    *,
    request_payload: Dict[str, Any],
    raw_text: str,
    form_type_hint: str,
    explicit_spec_hint: str,
    explicit_component_hint: str,
) -> Dict[str, Any]:
    finalized = dict(request_payload)
    clarification = _build_clarification_plan(
        request_payload=finalized,
        raw_text=raw_text,
        form_type_hint=form_type_hint,
        explicit_spec_hint=explicit_spec_hint,
        explicit_component_hint=explicit_component_hint,
    )
    if clarification:
        finalized.update(clarification)
    else:
        finalized["needs_clarification"] = False
        finalized["missing_fields"] = []
    return finalized


def _normalize_parsed_query(payload: Mapping[str, Any], *, raw_text: str, project_id: str | None) -> Dict[str, Any]:
    params = payload.get("params", payload.get("entities", {}))
    if not isinstance(params, dict):
        params = {}
    params = dict(params)

    legacy_component_id = ""
    component_hint_raw = payload.get("component_hint")
    if isinstance(component_hint_raw, str) and component_hint_raw.strip():
        detected_legacy = _detect_component(component_hint_raw)
        if detected_legacy is not None:
            legacy_component_id = detected_legacy

    spec_id_raw = payload.get("spec_id", component_hint_raw)
    spec_id = None
    if isinstance(spec_id_raw, str) and spec_id_raw.strip():
        try:
            spec_id = _normalize_spec_id(spec_id_raw)
        except NL2GateError:
            spec_id = None
    if spec_id is None:
        detected = _detect_spec_id(raw_text)
        if detected is not None:
            spec_id = detected
    if not legacy_component_id:
        detected_from_text = _detect_component(raw_text)
        if detected_from_text is not None:
            legacy_component_id = detected_from_text

    route = _resolve_intent_route(
        intent_hint=str(payload.get("intent") or "").strip() or _detect_intent(raw_text, target=spec_id or legacy_component_id),
        spec_id=spec_id,
        component_id=legacy_component_id or spec_id,
        form_type_hint=str(payload.get("form_type") or "").strip() or None,
        raw_text=raw_text,
    )
    intent = str(route["intent"])
    form_type = str(route["form_type"])
    rule_id = str(route["rule_id"])
    route_rule_ids_raw = route.get("rule_ids")
    route_rule_ids = (
        [str(item).strip() for item in route_rule_ids_raw if str(item).strip()]
        if isinstance(route_rule_ids_raw, list)
        else ([rule_id] if rule_id else [])
    )
    if spec_id is None:
        default_spec_id = route.get("default_spec_id")
        if isinstance(default_spec_id, str) and default_spec_id.strip():
            spec_id = default_spec_id.strip()

    raw_v_address = payload.get("v_address", payload.get("target_v", ""))
    v_address = str(raw_v_address).strip() if isinstance(raw_v_address, str) else ""
    if v_address:
        try:
            parsed_v = parse_v_address(v_address)
            params.setdefault("project_id", parsed_v["projectId"])
            params.setdefault("stake", parsed_v["stake"])
            params.setdefault("branch_id", parsed_v.get("branch") or "main")
            if parsed_v.get("layer") is not None:
                params.setdefault("layer", parsed_v.get("layer"))
            if parsed_v.get("timestamp") is not None:
                params.setdefault("time", parsed_v.get("timestamp"))
        except VAddressError:
            v_address = ""

    if spec_id and not v_address:
        stake = str(params.get("stake") or _extract_stake(raw_text) or "").strip()
        if not stake:
            stake = "K15+200" if spec_id.endswith(".compaction") else "K20+100"
            params["stake"] = stake
        resolved_project_id = str(params.get("project_id") or project_id or "P1").strip() or "P1"
        params["project_id"] = resolved_project_id
        v_address = _build_target_v(
            project_id=resolved_project_id,
            stake=stake,
            branch_id=str(params.get("branch_id") or "main"),
            layer=params.get("layer"),
            timestamp=params.get("time"),
        )
    elif len(route_rule_ids) > 1 and not v_address:
        stake = str(params.get("stake") or _extract_stake(raw_text) or "").strip()
        if stake:
            resolved_project_id = str(params.get("project_id") or project_id or "P1").strip() or "P1"
            params["project_id"] = resolved_project_id
            params["stake"] = stake
            v_address = _build_target_v(
                project_id=resolved_project_id,
                stake=stake,
                branch_id=str(params.get("branch_id") or "main"),
                layer=params.get("layer"),
                timestamp=params.get("time"),
            )

    normalized: Dict[str, Any] = {
        "intent": intent,
        "form_type": form_type,
        "rule_id": rule_id,
        "rule_ids": route_rule_ids,
        "spec_id": spec_id,
        "v_address": v_address,
        "params": params,
        "raw_text": raw_text,
    }
    legacy_component_id = str(payload.get("legacy_component_id") or legacy_component_id).strip()
    if legacy_component_id:
        normalized["legacy_component_id"] = legacy_component_id
    return normalized


def _detect_spec_id(text: str) -> str | None:
    candidate = _detect_component(text)
    if candidate and candidate in _known_specir_ids():
        return candidate
    return None


def _detect_component(text: str) -> str | None:
    lower = text.lower()

    explicit_match = _EXPLICIT_COMPONENT_ID_PATTERN.search(text)
    if explicit_match:
        candidate = explicit_match.group(0).strip()
        if candidate in _known_component_ids():
            return candidate

    if "\u5e73\u6574\u5ea6" in text or "flatness" in lower:
        return "JTG_F80_1_2017.4.2.1.flatness"
    if "\u538b\u5b9e\u5ea6" in text or "compaction" in lower:
        return "JTG_F80_1_2017.4.2.1.compaction"
    if "\u5f2f\u6c89" in text or "deflection" in lower:
        return "JTG_F80_1_2017.4.2.2.deflection"
    if "\u539a\u5ea6" in text or "thickness" in lower:
        return "JTG_F80_1_2017.4.2.3.thickness"

    if _COMPACTION_PATTERN.search(text):
        return "JTG_F80_1_2017.4.2.1.compaction"
    if _FLATNESS_PATTERN.search(text):
        return "JTG_F80_1_2017.4.2.1.flatness"
    if _DEFLECTION_PATTERN.search(text):
        return "JTG_F80_1_2017.4.2.2.deflection"
    if _THICKNESS_PATTERN.search(text):
        return "JTG_F80_1_2017.4.2.3.thickness"
    if "%" in text:
        return "JTG_F80_1_2017.4.2.1.compaction"

    for entry in _load_specir_index_rows():
        spec_id = str(entry.get("spec_id", "")).strip()
        measured_item = str(entry.get("measured_item", "")).strip().lower()
        if not spec_id:
            continue
        if spec_id.lower() in lower:
            return spec_id
        if measured_item and measured_item in lower:
            return spec_id

    return None


def _detect_intent(text: str, *, target: str | None = None) -> str:
    if _is_subgrade_acceptance_request(text):
        return "check_subgrade_acceptance"

    inferred = _intent_from_target(target)
    if inferred:
        return inferred

    detected_target = _detect_component(text)
    inferred = _intent_from_target(detected_target)
    if inferred:
        return inferred

    lower = text.lower()
    if "\u5f2f\u6c89" in text or "deflection" in lower:
        return "check_deflection"
    if "\u539a\u5ea6" in text or "thickness" in lower:
        return "check_thickness"
    if "\u5e73\u6574\u5ea6" in text or "flatness" in lower:
        return "check_flatness"
    return "check_compaction"


def _is_subgrade_acceptance_request(text: str) -> bool:
    raw = str(text or "")
    lower = raw.lower()
    cn_markers = ("路基验收", "验收要求", "路基是否满足", "路基合格", "能验收", "是否验收", "验收吗")
    en_markers = ("subgrade acceptance", "acceptance requirement", "acceptance criteria", "pass acceptance")
    if any(marker in raw for marker in cn_markers):
        return True
    if any(marker in lower for marker in en_markers):
        return True
    return False


def _build_target_v(
    *,
    project_id: str,
    stake: str,
    branch_id: str | None,
    layer: Any,
    timestamp: Any,
) -> str:
    payload: Dict[str, Any] = {
        "project_id": project_id,
        "stake": stake,
    }
    if isinstance(layer, str) and layer.strip():
        payload["layer"] = layer.strip()
    if timestamp is not None and str(timestamp).strip():
        try:
            payload["timestamp"] = int(timestamp)
        except (TypeError, ValueError):
            pass
    branch = str(branch_id or "").strip()
    if branch and branch.lower() != "main":
        payload["branch_id"] = branch
    return build_v_address(payload)


def _extract_openai_content(body: Mapping[str, Any]) -> str:
    if not isinstance(body, Mapping):
        raise NL2GateAdapterError("openai response body is invalid")
    choices = body.get("choices")
    if not isinstance(choices, list) or not choices:
        raise NL2GateAdapterError("openai response choices missing")
    first = choices[0]
    if not isinstance(first, Mapping):
        raise NL2GateAdapterError("openai response choice is invalid")
    message = first.get("message")
    if not isinstance(message, Mapping):
        raise NL2GateAdapterError("openai response message is invalid")
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, Mapping):
                value = item.get("text")
                if isinstance(value, str):
                    chunks.append(value)
        merged = "".join(chunks).strip()
        if merged:
            return merged
    raise NL2GateAdapterError("openai response content is empty")


def _normalize_mode(mode: str) -> str:
    text = str(mode).strip().lower()
    if text == "openai":
        return "openai"
    return "rule_based"


@lru_cache(maxsize=1)
def _load_specir_index_rows() -> tuple[Dict[str, Any], ...]:
    index_path = Path(__file__).resolve().parents[3] / "norms" / "index.json"
    try:
        payload = json.loads(index_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError):
        return tuple()
    if not isinstance(payload, list):
        return tuple()

    rows: list[Dict[str, Any]] = []
    for row in payload:
        if isinstance(row, dict):
            rows.append(row)
    return tuple(rows)


@lru_cache(maxsize=1)
def _known_component_ids() -> frozenset[str]:
    known = {
        "JTG_F80_1_2017.4.2.1.compaction",
        "JTG_F80_1_2017.4.2.1.flatness",
        "JTG_F80_1_2017.4.2.1.compaction_segment_assessment",
        "JTG_F80_1_2017.4.2.2.deflection",
        "JTG_F80_1_2017.4.2.3.thickness",
    }
    for row in _load_specir_index_rows():
        spec_id = str(row.get("spec_id", "")).strip()
        if spec_id:
            known.add(spec_id)
    return frozenset(known)


@lru_cache(maxsize=1)
def _known_specir_ids() -> frozenset[str]:
    return frozenset(
        str(row.get("spec_id", "")).strip()
        for row in _load_specir_index_rows()
        if str(row.get("spec_id", "")).strip()
    )


def _get_specir_entry_by_id(spec_id: str) -> Dict[str, Any] | None:
    target = str(spec_id or "").strip()
    if not target:
        return None
    for row in _load_specir_index_rows():
        if str(row.get("spec_id", "")).strip() == target:
            return row
    return None


_STAKE_PATTERN = re.compile("[Kk]?(\\d{1,4})[+\\u52a0](\\d{3})")
_LAYER_DEPTH_PATTERN = re.compile(r"(0-0\.8m|0\.8-1\.5m|>1\.5m)")
_PERCENT_VALUE_PATTERN = re.compile(r"(\d{2,3}(?:\.\d+)?)\s*%")
_COMPACTION_PATTERN = re.compile("(?:\\u538b\\u5b9e\\u5ea6|compaction)[^\\d]*(\\d{2,3}(?:\\.\\d+)?)", re.IGNORECASE)
_FLATNESS_PATTERN = re.compile("(?:\\u5e73\\u6574\\u5ea6|flatness)[^\\d]*(\\d{1,3}(?:\\.\\d+)?)", re.IGNORECASE)
_DEFLECTION_PATTERN = re.compile("(?:\\u5f2f\\u6c89|deflection)[^\\d]*(\\d{1,4}(?:\\.\\d+)?)", re.IGNORECASE)
_THICKNESS_PATTERN = re.compile("(?:\\u539a\\u5ea6|thickness)[^\\d]*(\\d{1,4}(?:\\.\\d+)?)", re.IGNORECASE)
_DESIGN_THICKNESS_PATTERN = re.compile(
    "(?:\\u8bbe\\u8ba1\\u539a\\u5ea6|design[_\\s-]*thickness)[^\\d]*(\\d{1,4}(?:\\.\\d+)?)",
    re.IGNORECASE,
)
_SURFACE_PATTERN = re.compile(r"\b(subgrade|base|asphalt)\b", re.IGNORECASE)
_ROAD_CLASS_PATTERN = re.compile(r"\b(default|expressway|first_class|second_class|third_class|fourth_class)\b", re.IGNORECASE)
_LAYER_ZONE_PATTERN = re.compile("(?:\\b(surface|base|subbase|cushion)\\b|\\u9762\\u5c42|\\u57fa\\u5c42|\\u5e95\\u57fa\\u5c42|\\u57ab\\u5c42)", re.IGNORECASE)
_EXPLICIT_COMPONENT_ID_PATTERN = re.compile(r"JTG_[A-Za-z0-9_.]+\.[A-Za-z_][A-Za-z0-9_]*")
_V_ADDRESS_PATTERN = re.compile(r"v://[^\s,;\uFF0C\uFF1B]+", re.IGNORECASE)


def _extract_stake(text: str) -> str | None:
    match = _STAKE_PATTERN.search(text)
    if not match:
        return None
    return f"K{int(match.group(1))}+{match.group(2)}"


def _extract_layer_depth(text: str) -> str | None:
    match = _LAYER_DEPTH_PATTERN.search(text)
    if not match:
        return None
    return match.group(1)


def _extract_compaction_value(text: str) -> float | None:
    match = _COMPACTION_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_flatness_value(text: str) -> float | None:
    match = _FLATNESS_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_deflection_value(text: str) -> float | None:
    match = _DEFLECTION_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_thickness_value(text: str) -> float | None:
    match = _THICKNESS_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_design_thickness(text: str) -> float | None:
    match = _DESIGN_THICKNESS_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_percent_value(text: str) -> float | None:
    match = _PERCENT_VALUE_PATTERN.search(text)
    if not match:
        return None
    return float(match.group(1))


def _extract_number_value(text: str) -> float | None:
    match = re.search(r"(\d{1,4}(?:\.\d+)?)", text)
    if not match:
        return None
    return float(match.group(1))


def _extract_surface_type(text: str) -> str | None:
    match = _SURFACE_PATTERN.search(text)
    if not match:
        return None
    return match.group(1).lower()


def _extract_road_class(text: str) -> str | None:
    match = _ROAD_CLASS_PATTERN.search(text)
    if not match:
        return None
    return match.group(1).lower()


def _extract_layer_zone(text: str) -> str | None:
    match = _LAYER_ZONE_PATTERN.search(text)
    if not match:
        return None
    value = match.group(0)
    mapping = {
        "\u9762\u5c42": "surface",
        "\u57fa\u5c42": "base",
        "\u5e95\u57fa\u5c42": "subbase",
        "\u57ab\u5c42": "cushion",
    }
    return mapping.get(value, value.lower())


def _extract_representative_value(text: str) -> float | None:
    match = re.search("(?:\\u4ee3\\u8868\\u503c|representative)[^\\d]*(\\d{2,3}(?:\\.\\d+)?)", text, re.IGNORECASE)
    if not match:
        return None
    return float(match.group(1))


def _extract_v_address(text: str) -> str | None:
    match = _V_ADDRESS_PATTERN.search(text)
    if not match:
        return None
    return match.group(0).strip()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
