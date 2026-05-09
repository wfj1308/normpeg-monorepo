from __future__ import annotations

from typing import Any, Dict


def package_answer_from_execution_result(execution_result: Dict[str, Any]) -> str:
    """
    Single-branch answer template.
    Must only read execution_result and never infer pass/fail outside result fields.
    """
    branch_id = _as_text(execution_result.get("branch_id"), "main")
    final_status = _as_text(execution_result.get("final_status"), "UNKNOWN").upper()
    standard_value = _extract_standard_value(execution_result)
    if standard_value is None:
        return f"分支 {branch_id} 执行结论：{_status_to_zh(final_status)}（{final_status}）。"
    return f"分支 {branch_id} 标准值 {_fmt(standard_value)}，结论：{_status_to_zh(final_status)}（{final_status}）。"


def package_answer_from_branch_results(main_result: Dict[str, Any], branch_results: Dict[str, Dict[str, Any]]) -> str:
    """
    Dual-branch answer template.
    Must only read execution_result fields and never re-judge pass/fail.
    """
    main_status = _as_text(main_result.get("final_status"), "UNKNOWN").upper()
    main_standard = _extract_standard_value(main_result)

    segments: list[str] = []
    if main_standard is None:
        segments.append(f"当前主线结论：{_status_to_zh(main_status)}（{main_status}）。")
    else:
        segments.append(f"当前主线标准（{_fmt(main_standard)}）：{_status_to_zh(main_status)}（{main_status}）。")

    status_diff_found = False
    for branch_id in sorted(branch_results.keys()):
        result = branch_results[branch_id]
        status = _as_text(result.get("final_status"), "UNKNOWN").upper()
        standard_value = _extract_standard_value(result)
        if status != main_status:
            status_diff_found = True

        if standard_value is None:
            segments.append(f"活跃分支 {branch_id}：{_status_to_zh(status)}（{status}）。")
        else:
            segments.append(f"活跃分支 {branch_id}（标准{_fmt(standard_value)}）：{_status_to_zh(status)}（{status}）。")

    if status_diff_found:
        segments.append("建议确认分支变更状态。")

    return " ".join(segments)


def package_answer_after_merge(main_result: Dict[str, Any], merge_event: Dict[str, Any]) -> str:
    """
    Main-line answer template when merged decisions exist and no active fork remains.
    """
    final_status = _as_text(main_result.get("final_status"), "UNKNOWN").upper()
    status_zh = _status_to_zh(final_status)
    standard_value = _extract_standard_value(main_result)

    merge_info = merge_event.get("merge_info", {})
    if not isinstance(merge_info, dict):
        merge_info = {}
    decision = _as_text(merge_info.get("decision"), "UNKNOWN").upper()

    if decision == "ACCEPTED":
        if standard_value is not None and final_status != "PASS":
            return (
                "该数据在原标准下合格，但因设计变更已合入主线"
                f"（标准提升至{_fmt(standard_value)}），当前判定为{status_zh}。"
            )
        if standard_value is not None:
            return f"设计变更已合入主线（当前标准{_fmt(standard_value)}），当前判定为{status_zh}。"
        return f"设计变更已合入主线，当前判定为{status_zh}。"

    return package_answer_from_execution_result(main_result)


def _extract_standard_value(execution_result: Dict[str, Any]) -> Any:
    path_outputs = execution_result.get("path_outputs")
    if not isinstance(path_outputs, dict):
        return None
    for key in ("standard_value", "standard_limit", "threshold", "upper_limit"):
        if key in path_outputs:
            return path_outputs.get(key)
    return None


def _status_to_zh(status: str) -> str:
    mapping = {
        "PASS": "合格",
        "FAIL": "不合格",
        "BLOCKED": "不合格",
        "CRITICAL": "不合格",
        "OVERRIDDEN": "特批通过",
        "WARNING": "预警",
        "UNKNOWN": "未知",
    }
    return mapping.get(status, status)


def _fmt(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.1f}%"
    if isinstance(value, int):
        return f"{value}%"
    return str(value)


def _as_text(value: Any, default: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return default
