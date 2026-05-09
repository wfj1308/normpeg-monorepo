from __future__ import annotations

from typing import Any, Dict

import pytest

from backend.app.layer3.nl2gate import (
    NL2GateAdapterRuntime,
    OpenAIAdapter,
    build_execution_request_from_parsed_query,
    parse_nl_to_dto,
)


def test_rule_based_mode_keeps_dto_extraction_stable() -> None:
    runtime = NL2GateAdapterRuntime(mode="rule_based")
    parsed, meta = runtime.parse_query(raw_text="K15+200 compaction 94% pass?", project_id="P1")

    request_payload = build_execution_request_from_parsed_query(parsed, project_id="P1")
    assert meta["adapter_used"] == "rule_based"
    assert meta["fallback_used"] is False
    assert parsed["intent"] == "check_compaction"
    assert parsed["form_type"] == "T0921-2019"
    assert parsed["rule_id"] == "subgrade.compaction"
    assert parsed["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert request_payload["intent"] == "check_compaction"
    assert request_payload["form_type"] == "T0921-2019"
    assert request_payload["rule_id"] == "subgrade.compaction"
    assert request_payload["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert request_payload["params"]["project_id"] == "P1"
    assert request_payload["params"]["stake"] == "K15+200"
    assert float(request_payload["params"]["compaction_degree"]) == 94.0


def test_rule_based_mode_supports_deflection_query() -> None:
    runtime = NL2GateAdapterRuntime(mode="rule_based")
    parsed, meta = runtime.parse_query(raw_text="K20+100 deflection 170 pass?", project_id="P1")

    request_payload = build_execution_request_from_parsed_query(parsed, project_id="P1")
    assert meta["adapter_used"] == "rule_based"
    assert meta["fallback_used"] is False
    assert parsed["spec_id"] == "JTG_F80_1_2017.4.2.2.deflection"
    assert request_payload["spec_id"] == "JTG_F80_1_2017.4.2.2.deflection"
    assert request_payload["params"]["project_id"] == "P1"
    assert request_payload["params"]["stake"] == "K20+100"
    assert float(request_payload["params"]["deflection"]) == 170.0


def test_rule_based_mode_supports_thickness_query() -> None:
    runtime = NL2GateAdapterRuntime(mode="rule_based")
    parsed, meta = runtime.parse_query(
        raw_text="K20+120 thickness 206 design thickness 200 pass?",
        project_id="P1",
    )

    request_payload = build_execution_request_from_parsed_query(parsed, project_id="P1")
    assert meta["adapter_used"] == "rule_based"
    assert meta["fallback_used"] is False
    assert parsed["spec_id"] == "JTG_F80_1_2017.4.2.3.thickness"
    assert request_payload["spec_id"] == "JTG_F80_1_2017.4.2.3.thickness"
    assert request_payload["params"]["project_id"] == "P1"
    assert request_payload["params"]["stake"] == "K20+120"
    assert request_payload["params"]["layer_zone"] == "surface"
    assert float(request_payload["params"]["thickness"]) == 206.0
    assert float(request_payload["params"]["design_thickness"]) == 200.0


def test_parse_nl_to_dto_returns_clarification_when_required_param_is_missing() -> None:
    parsed = parse_nl_to_dto(message="K15+200 compaction pass?", project_id="P1")

    assert parsed["intent"] == "check_compaction"
    assert parsed["form_type"] == "T0921-2019"
    assert parsed["rule_id"] == "subgrade.compaction"
    assert parsed["needs_clarification"] is True
    assert "missing_params" in parsed["clarification_reasons"]
    assert any("请提供压实度数值" in item for item in parsed["clarification_questions"])


def test_parse_nl_to_dto_supports_multi_rule_subgrade_acceptance_intent() -> None:
    parsed = parse_nl_to_dto(
        message="检查 K19+070 这个点是否满足路基验收要求，压实度96%，厚度206，弯沉200",
        project_id="P1",
    )

    assert parsed["intent"] == "check_subgrade_acceptance"
    assert parsed["form_type"] == "SUBGRADE-ACCEPTANCE"
    assert parsed["rule_id"] == "subgrade.compaction"
    assert parsed["rule_ids"] == [
        "subgrade.compaction",
        "subgrade.thickness",
        "subgrade.deflection",
    ]
    assert parsed["needs_clarification"] is False
    assert parsed["params"]["stake"] == "K19+070"
    assert float(parsed["params"]["compaction_degree"]) == 96.0
    assert float(parsed["params"]["thickness"]) == 206.0
    assert float(parsed["params"]["deflection"]) == 200.0


def test_parse_nl_to_dto_multi_rule_still_requires_missing_params_clarification() -> None:
    parsed = parse_nl_to_dto(
        message="这个点能验收吗？",
        project_id="P1",
    )

    assert parsed["intent"] == "check_subgrade_acceptance"
    assert parsed["needs_clarification"] is True
    assert "stake" in parsed["missing_fields"]
    assert "missing_params" in parsed["clarification_reasons"]
    assert any("请提供检测点" in item for item in parsed["clarification_questions"])
    assert any("请提供压实度数值" in item for item in parsed["clarification_questions"])
    assert any("请提供厚度数值" in item for item in parsed["clarification_questions"])
    assert any("请提供弯沉数值" in item for item in parsed["clarification_questions"])


def test_execution_request_uses_fixed_mapping_even_if_ai_supplies_rule_id() -> None:
    request_payload = build_execution_request_from_parsed_query(
        {
            "intent": "check_compaction",
            "form_type": "T0921-2019",
            "rule_id": "ai.made_up_rule",
            "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
            "params": {
                "project_id": "P1",
                "stake": "K15+200",
                "compaction_degree": 95.0,
            },
        },
        project_id="P1",
    )

    assert request_payload["intent"] == "check_compaction"
    assert request_payload["form_type"] == "T0921-2019"
    assert request_payload["rule_id"] == "subgrade.compaction"
    assert request_payload["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"


def test_execution_request_returns_clarification_on_multi_rule_conflict() -> None:
    request_payload = build_execution_request_from_parsed_query(
        {
            "intent": "check_compaction",
            "form_type": "T0921-2019",
            "spec_id": "JTG_F80_1_2017.4.2.1.compaction",
            "raw_text": "K15+200 compaction 95 and thickness 210 pass?",
            "params": {
                "project_id": "P1",
                "stake": "K15+200",
                "compaction_degree": 95.0,
                "thickness": 210.0,
            },
        },
        project_id="P1",
    )

    assert request_payload["needs_clarification"] is True
    assert "multi_rule_conflict" in request_payload["clarification_reasons"]
    assert request_payload["engine_action"] == "skip"
    assert any("多个规则候选" in item for item in request_payload["clarification_questions"])


def test_parse_nl_to_dto_returns_clarification_when_intent_is_unclear() -> None:
    parsed = parse_nl_to_dto(message="这个检测项可以吗？", project_id="P1")

    assert parsed["needs_clarification"] is True
    assert "intent_unclear" in parsed["clarification_reasons"]
    assert any("请说明检测项目" in item for item in parsed["clarification_questions"])


def test_openai_mode_switches_to_openai_adapter_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_parse(self: OpenAIAdapter, raw_text: str, project_id: str | None = None) -> Dict[str, Any]:
        return {
            "intent": "validate",
            "target_v": f"v://{project_id or 'P1'}/K15+200",
            "component_hint": "JTG_F80_1_2017.4.2.1.compaction",
            "entities": {
                "project_id": project_id or "P1",
                "stake": "K15+200",
                "layer_depth": "0-0.8m",
                "compaction_degree": 96.5,
                "representative_value": 96.0,
            },
        }

    def fake_render(
        self: OpenAIAdapter,
        *,
        answer_mode: str,
        main_result: Dict[str, Any],
        branch_results: Dict[str, Dict[str, Any]],
        merge_event: Dict[str, Any] | None = None,
    ) -> str:
        return f"openai:{answer_mode}:{main_result.get('final_status', 'UNKNOWN')}"

    monkeypatch.setattr(OpenAIAdapter, "parse_query", fake_parse)
    monkeypatch.setattr(OpenAIAdapter, "render_answer", fake_render)

    runtime = NL2GateAdapterRuntime(mode="openai")
    parsed, parse_meta = runtime.parse_query(raw_text="浠绘剰闂", project_id="P-OPENAI-001")
    answer, render_meta = runtime.render_answer(
        answer_mode="single",
        main_result={"final_status": "PASS", "branch_id": "main"},
        branch_results={},
        merge_event=None,
    )

    assert parsed["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert parse_meta["adapter_used"] == "openai"
    assert parse_meta["fallback_used"] is False
    assert render_meta["adapter_used"] == "openai"
    assert render_meta["fallback_used"] is False
    assert answer == "openai:single:PASS"


def test_openai_mode_falls_back_to_rule_based_when_openai_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    runtime = NL2GateAdapterRuntime(mode="openai")
    parsed, parse_meta = runtime.parse_query(raw_text="K15+200 compaction 95% pass?", project_id="P1")
    answer, render_meta = runtime.render_answer(
        answer_mode="single",
        main_result={"final_status": "PASS", "branch_id": "main", "path_outputs": {"standard_value": 95}},
        branch_results={},
        merge_event=None,
    )

    assert parsed["spec_id"] == "JTG_F80_1_2017.4.2.1.compaction"
    assert parse_meta["adapter_used"] == "rule_based"
    assert parse_meta["fallback_used"] is True
    assert "OPENAI_API_KEY" in str(parse_meta.get("fallback_reason", ""))
    assert render_meta["adapter_used"] == "rule_based"
    assert render_meta["fallback_used"] is True
    assert "OPENAI_API_KEY" in str(render_meta.get("fallback_reason", ""))
    assert isinstance(answer, str) and answer.strip()



