from __future__ import annotations

from typing import Any, Dict

from ..core import ComponentExecutionEngine
from .nl2gate import parse_nl_to_dto
from .packaging import package_answer_from_execution_result


class Layer3QueryService:
    """
    Layer3 service with strict boundary:
    1) NL2Gate parses DTO only.
    2) Decision comes from Layer2 execution result.
    3) Answer is packaged from execution_result only.
    """

    def __init__(self, execution_engine: ComponentExecutionEngine | None = None) -> None:
        self.execution_engine = execution_engine or ComponentExecutionEngine()

    def query(self, message: str, project_id: str | None = None) -> Dict[str, Any]:
        parsed = parse_nl_to_dto(message=message, project_id=project_id)
        if bool(parsed.get("needs_clarification")):
            return {
                "status": "needs_clarification",
                "answer": "需要补充信息",
                "needs_clarification": True,
                "clarification_reasons": parsed.get("clarification_reasons") or [],
                "clarification_questions": parsed.get("clarification_questions") or [],
                "ui_hint": parsed.get("ui_hint") or "需要补充信息",
                "engine_called": False,
                "parse_trace": parsed["parse_trace"],
                "execution_request": {
                    "intent": parsed.get("intent"),
                    "form_type": parsed.get("form_type"),
                    "rule_id": parsed.get("rule_id"),
                    "spec_id": parsed.get("spec_id"),
                    "v_address": parsed.get("v_address"),
                    "params": parsed["params"],
                    "route": "skipped_clarification",
                },
                "execution_result": None,
            }

        spec_id = str(parsed.get("spec_id") or "").strip()
        if not spec_id:
            raise ValueError("spec_id parse failed; Layer3 default path requires SpecIR")

        execution_result = self.execution_engine.execute(
            component_id=spec_id,
            input_payload=dict(parsed["params"]),
        )

        answer = package_answer_from_execution_result(execution_result)

        return {
            "answer": answer,
            "parse_trace": parsed["parse_trace"],
            "execution_request": {
                "intent": parsed.get("intent"),
                "form_type": parsed.get("form_type"),
                "rule_id": parsed.get("rule_id"),
                "spec_id": spec_id,
                "v_address": parsed.get("v_address"),
                "params": parsed["params"],
            },
            "execution_result": execution_result,
        }
