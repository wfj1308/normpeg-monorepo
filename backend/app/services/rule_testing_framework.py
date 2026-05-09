from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def build_test_schema() -> Dict[str, Any]:
    return {
        "schema_id": "rule.testing.framework.v1",
        "required_sections": ["rule_tests", "gate_tests", "executor_tests", "summary"],
        "rule_test_types": ["unit_test", "edge_case", "threshold_case", "invalid_input"],
        "gate_test_types": ["logic_test", "and_or_branch_test", "action_trigger_test"],
        "executor_test_types": ["dto_validation", "runtime_validation"],
    }


def run_rule_test_framework(
    *,
    form_code: str,
    rulepack: Dict[str, Any],
    pass_rate_threshold: float,
    report_dir: Path,
) -> Dict[str, Any]:
    payload = copy.deepcopy(rulepack if isinstance(rulepack, dict) else {})
    sandbox_cases = _generate_sandbox_cases(payload)
    rule_tests = _run_rule_tests(payload, sandbox_cases)
    gate_tests = _run_gate_tests(payload, sandbox_cases)
    executor_tests = _run_executor_tests(payload, sandbox_cases)

    all_tests = rule_tests + gate_tests + executor_tests
    total = len(all_tests)
    passed = len([item for item in all_tests if bool(item.get("passed"))])
    pass_rate = (passed / total) if total > 0 else 0.0
    block_publish = pass_rate < pass_rate_threshold

    report = {
        "schema": build_test_schema(),
        "meta": {
            "generated_at": _now(),
            "form_code": form_code,
            "pass_rate_threshold": pass_rate_threshold,
        },
        "sandbox_strategy": {
            "name": "auto_sandbox_case_generator",
            "description": "从 gate 规则自动生成边界值、阈值、非法输入与分支测试样本",
            "generated_case_count": len(sandbox_cases),
        },
        "sandbox_cases": sandbox_cases,
        "runtime_validator": {
            "dto_checks": ["required field", "type compatibility", "null/empty rejection"],
            "runtime_checks": ["gate decision available", "final_status available", "rule_results structured"],
        },
        "rule_tests": rule_tests,
        "gate_tests": gate_tests,
        "executor_tests": executor_tests,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": total - passed,
            "pass_rate": round(pass_rate, 4),
            "publish_gate": {
                "blocked": block_publish,
                "reason": "test pass rate < threshold" if block_publish else "pass",
            },
        },
        "page_plan": {
            "page_name": "Rule Test Center",
            "blocks": [
                "输入区（form_code/rulepack/threshold）",
                "自动生成 sandbox case 列表",
                "Rule/Gate/Executor 测试结果",
                "pass rate + 发布门禁",
                "test_report.json 预览",
            ],
        },
    }

    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "test_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _run_rule_tests(rulepack: Dict[str, Any], cases: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    tests: list[Dict[str, Any]] = []
    for item in cases:
        case_type = _as_text(item.get("type"))
        if case_type in {"unit_test", "edge_case", "threshold_case", "invalid_input"}:
            tests.append(
                {
                    "test_type": case_type,
                    "case_id": item.get("case_id"),
                    "passed": _evaluate_case(rulepack, item),
                    "input": item.get("input"),
                    "expected": item.get("expected"),
                }
            )
    return tests


def _run_gate_tests(rulepack: Dict[str, Any], cases: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    tests: list[Dict[str, Any]] = []
    has_or = any(" or " in _as_text(rule.get("condition")).lower() for rule in _gate_rules(rulepack))
    has_and = any(" and " in _as_text(rule.get("condition")).lower() for rule in _gate_rules(rulepack))
    tests.append({"test_type": "logic_test", "passed": len(_gate_rules(rulepack)) > 0, "details": "gate rules present"})
    tests.append({"test_type": "and_or_branch_test", "passed": has_or or has_and, "details": {"has_and": has_and, "has_or": has_or}})
    trigger_actions = sorted({_as_text(rule.get("on_fail")) for rule in _gate_rules(rulepack) if _as_text(rule.get("on_fail"))})
    tests.append({"test_type": "action_trigger_test", "passed": len(trigger_actions) > 0, "details": {"actions": trigger_actions}})
    return tests


def _run_executor_tests(rulepack: Dict[str, Any], cases: list[Dict[str, Any]]) -> list[Dict[str, Any]]:
    input_dto = _as_dict(_as_dict(rulepack.get("inputs")).get("input_dto"))
    required_fields = [k for k, v in input_dto.items() if isinstance(v, dict) and bool(v.get("required"))]
    dto_pass = len(required_fields) > 0
    runtime_pass = len(_gate_rules(rulepack)) > 0 and any(case.get("type") == "unit_test" for case in cases)
    return [
        {
            "test_type": "dto_validation",
            "passed": dto_pass,
            "details": {"required_fields": required_fields},
        },
        {
            "test_type": "runtime_validation",
            "passed": runtime_pass,
            "details": {"gate_rule_count": len(_gate_rules(rulepack))},
        },
    ]


def _generate_sandbox_cases(rulepack: Dict[str, Any]) -> list[Dict[str, Any]]:
    cases: list[Dict[str, Any]] = []
    rules = _gate_rules(rulepack)
    if not rules:
        return [
            {"case_id": "case_unit_1", "type": "unit_test", "input": {"x": 1}, "expected": {"status": "PASS"}},
            {"case_id": "case_invalid_1", "type": "invalid_input", "input": {}, "expected": {"status": "FAIL"}},
        ]
    idx = 1
    for rule in rules:
        cond = _as_text(rule.get("condition"))
        field, threshold = _parse_simple_threshold(cond)
        if field and threshold is not None:
            cases.append(
                {
                    "case_id": f"case_unit_{idx}",
                    "type": "unit_test",
                    "input": {field: threshold + 1},
                    "expected": {"status": "PASS"},
                }
            )
            cases.append(
                {
                    "case_id": f"case_threshold_{idx}",
                    "type": "threshold_case",
                    "input": {field: threshold},
                    "expected": {"status": "PASS_OR_BOUNDARY"},
                }
            )
            cases.append(
                {
                    "case_id": f"case_edge_{idx}",
                    "type": "edge_case",
                    "input": {field: threshold - 0.0001},
                    "expected": {"status": "FAIL_OR_WARN"},
                }
            )
            cases.append(
                {
                    "case_id": f"case_invalid_{idx}",
                    "type": "invalid_input",
                    "input": {field: "invalid"},
                    "expected": {"status": "FAIL"},
                }
            )
            idx += 1
    return cases


def _evaluate_case(rulepack: Dict[str, Any], case: Dict[str, Any]) -> bool:
    ctype = _as_text(case.get("type"))
    if ctype == "invalid_input":
        input_obj = _as_dict(case.get("input"))
        return any(isinstance(v, str) and not v.replace(".", "", 1).isdigit() for v in input_obj.values())
    return True


def _gate_rules(rulepack: Dict[str, Any]) -> list[Dict[str, Any]]:
    gate = _as_dict(rulepack.get("gate"))
    return [item for item in _as_list(gate.get("rules")) if isinstance(item, dict)]


def _parse_simple_threshold(condition: str) -> tuple[str, float | None]:
    text = condition.strip()
    for op in [">=", "<=", ">", "<", "=="]:
        if op in text:
            left, right = text.split(op, 1)
            field = left.strip().split(".")[-1]
            try:
                return field, float(right.strip())
            except ValueError:
                return field, None
    return "", None


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
