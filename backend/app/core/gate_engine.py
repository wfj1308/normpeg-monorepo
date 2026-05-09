from __future__ import annotations

from typing import Any, Dict

from .expression_engine import (
    ExpressionEngineError,
    evaluate_condition,
)


class GateExecutionError(ValueError):
    """Raised when gate evaluation fails."""


class GateEngine:
    """Domain-agnostic gate runtime. Evaluates only rule DSL."""

    def evaluate(
        self,
        component: Dict[str, Any],
        normalized_input: Dict[str, Any],
        path_outputs: Dict[str, Any],
        runtime_context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        return evaluate_gate(
            component=component,
            normalized_input=normalized_input,
            path_outputs=path_outputs,
            runtime_context=runtime_context,
        )


def evaluate_gate(
    component: Dict[str, Any],
    normalized_input: Dict[str, Any],
    path_outputs: Dict[str, Any],
    runtime_context: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    if not isinstance(component, dict):
        raise GateExecutionError("component must be a dict")
    if not isinstance(normalized_input, dict):
        raise GateExecutionError("normalized_input must be a dict")
    if not isinstance(path_outputs, dict):
        raise GateExecutionError("path_outputs must be a dict")
    if runtime_context is not None and not isinstance(runtime_context, dict):
        raise GateExecutionError("runtime_context must be a dict")

    gate_block = component.get("gate")
    if not isinstance(gate_block, dict):
        raise GateExecutionError("component.gate must be a dict")

    rules = gate_block.get("rules", [])
    if not isinstance(rules, list):
        raise GateExecutionError("component.gate.rules must be a list")

    context = _build_context(normalized_input, path_outputs, runtime_context or {})

    rule_hits: list[Dict[str, Any]] = []
    gate_trace: list[Dict[str, Any]] = []
    failed_levels: list[str] = []

    for index, rule in enumerate(rules, start=1):
        if not isinstance(rule, dict):
            raise GateExecutionError(f"gate rule at index {index} must be a dict")

        rule_id = str(rule.get("rule_id") or f"rule_{index}")
        condition = _resolve_rule_condition(rule, rule_id)
        clause_ref = _resolve_clause_ref(rule, gate_block)

        try:
            evaluation = evaluate_condition(condition, context, strict_names=True)
        except ExpressionEngineError as exc:
            raise GateExecutionError(f"rule {rule_id} eval failed: {exc}") from exc

        passed = bool(evaluation["result"])
        actual = evaluation.get("computed_left")
        expected = evaluation.get("computed_right")
        rule_trace = {
            "condition": condition,
            "normalized_expression": evaluation["normalized_expression"],
            "expression_trace": evaluation["trace"],
        }

        hit = {
            "rule_id": rule_id,
            "passed": passed,
            "actual_value": actual,
            "expected_value": expected,
            "actual": actual,
            "expected": expected,
            "result": "PASS" if passed else "FAIL",
            "clause_ref": clause_ref,
            "trace": rule_trace,
            "message": _build_message(rule_id, condition, passed, actual, expected),
        }
        rule_hits.append(hit)

        gate_trace.append(
            {
                "rule_id": rule_id,
                "condition": condition,
                "passed": passed,
                "severity": rule.get("severity", "info"),
                "on_fail": rule.get("on_fail", "pass"),
                "actual_value": actual,
                "expected_value": expected,
                "clause_ref": clause_ref,
                "trace": rule_trace,
            }
        )

        if not passed:
            failed_levels.append(_resolve_fail_level(rule))

    return {
        "overall_status": _derive_overall_status(failed_levels),
        "rule_hits": rule_hits,
        "gate_trace": gate_trace,
    }


def _build_context(
    normalized_input: Dict[str, Any],
    path_outputs: Dict[str, Any],
    runtime_context: Dict[str, Any],
) -> Dict[str, Any]:
    context: Dict[str, Any] = {}
    context.update(normalized_input)
    context.update(path_outputs)
    context.update(runtime_context)
    context["input"] = normalized_input
    context["path_outputs"] = path_outputs
    context["runtime"] = runtime_context
    return context


def _resolve_rule_condition(rule: Dict[str, Any], rule_id: str) -> str:
    condition = rule.get("condition")
    if isinstance(condition, str) and condition.strip():
        return condition.strip()
    if isinstance(condition, dict):
        return _condition_dict_to_expression(condition, rule_id)
    raise GateExecutionError(f"rule {rule_id} missing condition")


def _condition_dict_to_expression(condition: Dict[str, Any], rule_id: str) -> str:
    operator = str(
        condition.get("operator")
        or condition.get("comparison")
        or condition.get("op")
        or ""
    ).strip().lower()

    if operator in {">=", "<=", ">", "<", "=="}:
        actual = _operand_to_expr(condition.get("actual"))
        expected = _operand_to_expr(condition.get("expected"))
        return f"{actual} {operator} {expected}"

    if operator == "tolerance":
        mode = str(condition.get("mode", "lower_bound")).strip().lower()
        actual = _operand_to_expr(condition.get("actual"))
        expected = _operand_to_expr(condition.get("expected"))
        tolerance = _operand_to_expr(condition.get("tolerance"))
        if mode == "lower_bound":
            return f"{actual} >= {expected} - {tolerance}"
        if mode == "upper_bound":
            return f"{actual} <= {expected} + {tolerance}"
        if mode == "absolute":
            return f"{actual} >= {expected} - {tolerance} and {actual} <= {expected} + {tolerance}"
        raise GateExecutionError(f"rule {rule_id} unsupported tolerance mode: {mode}")

    if operator == "between":
        actual = _operand_to_expr(condition.get("actual"))
        minimum = _operand_to_expr(condition.get("min", condition.get("lower")))
        maximum = _operand_to_expr(condition.get("max", condition.get("upper")))
        include_min = bool(condition.get("include_min", True))
        include_max = bool(condition.get("include_max", True))
        min_op = ">=" if include_min else ">"
        max_op = "<=" if include_max else "<"
        return f"{actual} {min_op} {minimum} and {actual} {max_op} {maximum}"

    raise GateExecutionError(f"rule {rule_id} unsupported condition operator: {operator}")


def _operand_to_expr(operand: Any) -> str:
    if isinstance(operand, bool):
        return "True" if operand else "False"
    if isinstance(operand, (int, float)):
        return str(operand)
    if isinstance(operand, str):
        text = operand.strip()
        if not text:
            raise GateExecutionError("empty operand text is not allowed")
        return text
    if isinstance(operand, dict):
        if "ref" in operand:
            return str(operand["ref"])
        if "value" in operand:
            return _operand_to_expr(operand["value"])
    raise GateExecutionError(f"unsupported operand: {operand}")


def _resolve_clause_ref(rule: Dict[str, Any], gate_block: Dict[str, Any]) -> str:
    clause_ref = rule.get("clause_ref")
    if isinstance(clause_ref, str) and clause_ref:
        return clause_ref

    clause_refs = rule.get("clause_refs")
    if isinstance(clause_refs, list) and clause_refs:
        first = clause_refs[0]
        if isinstance(first, str):
            return first

    gate_clause_ref = gate_block.get("clause_ref")
    if isinstance(gate_clause_ref, str) and gate_clause_ref:
        return gate_clause_ref

    gate_clause_refs = gate_block.get("clause_refs")
    if isinstance(gate_clause_refs, list) and gate_clause_refs:
        first = gate_clause_refs[0]
        if isinstance(first, str):
            return first

    return ""


def _build_message(rule_id: str, condition: str, passed: bool, actual: Any, expected: Any) -> str:
    status = "PASS" if passed else "FAIL"
    return (
        f"{rule_id}: condition={condition}, actual={actual}, "
        f"expected={expected}, result={status}"
    )


def _resolve_fail_level(rule: Dict[str, Any]) -> str:
    severity = str(rule.get("severity", "info")).strip().lower()
    on_fail = str(rule.get("on_fail", "pass")).strip().lower()

    if on_fail == "manual_override":
        return "BLOCKED"
    if on_fail == "critical" or severity == "critical":
        return "CRITICAL"
    if on_fail in {"block", "blocked"} or severity == "blocking":
        return "BLOCKED"
    if on_fail in {"warn", "warning"} or severity == "warning":
        return "WARNING"
    return "FAIL"


def _derive_overall_status(failed_levels: list[str]) -> str:
    if not failed_levels:
        return "PASS"
    if "CRITICAL" in failed_levels:
        return "CRITICAL"
    if "BLOCKED" in failed_levels:
        return "BLOCKED"
    if "WARNING" in failed_levels:
        return "WARNING"
    return "FAIL"
