from __future__ import annotations

import math
from typing import Any, Dict, List

from app.models.execution import GateDecision
from app.services.common import safe_eval_expression


T_95_TABLE = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    15: 2.131,
    20: 2.086,
    30: 2.042,
}


def _t_95(df: int) -> float:
    if df <= 0:
        return 0.0
    if df in T_95_TABLE:
        return T_95_TABLE[df]
    if df < 40:
        return 2.021
    if df < 60:
        return 2.0
    return 1.96


def _representative_t95(values: List[float]) -> float:
    rows = [float(v) for v in values]
    if not rows:
        return 0.0
    if len(rows) == 1:
        return rows[0]
    mean = sum(rows) / len(rows)
    variance = sum((item - mean) ** 2 for item in rows) / (len(rows) - 1)
    std_dev = math.sqrt(variance)
    t = _t_95(len(rows) - 1)
    return mean - t * std_dev / math.sqrt(len(rows))


def evaluate_gate(
    normdoc_payload: Dict[str, Any],
    path_outputs: Dict[str, Any],
    paragraph_values: List[float],
    override_requested: bool,
    override_evidence: Dict[str, Any],
) -> GateDecision:
    gate = normdoc_payload.get("gate", {})
    clause_refs = gate.get("clause_refs", [])

    compaction_degree = float(path_outputs["compaction_degree"])
    standard_value = float(path_outputs["standard_value"])
    tolerance = float(normdoc_payload.get("body", {}).get("path", {}).get("lookup_tables", {}).get("tolerance", 2.0))

    values = paragraph_values[:] if paragraph_values else [compaction_degree]
    representative = _representative_t95(values)
    ctx = {
        "compaction_degree": compaction_degree,
        "standard_value": standard_value,
        "tolerance": tolerance,
        "representative": representative,
    }

    single_cfg = gate.get("single_point_check", {})
    rep_cfg = gate.get("representative_check", {})
    single_cond = str(single_cfg.get("condition", "compaction_degree >= standard_value - tolerance"))
    rep_cond = str(rep_cfg.get("condition", "representative >= standard_value"))
    single_ok = bool(safe_eval_expression(single_cond, ctx))
    rep_ok = bool(safe_eval_expression(rep_cond, ctx))

    status = "PASS"
    if not single_ok:
        status = str(single_cfg.get("fail_action", "BLOCK")).upper()
    elif not rep_ok:
        status = str(rep_cfg.get("fail_action", "CRITICAL")).upper()

    if status == "BLOCK":
        status = "BLOCKED"

    if status != "PASS" and override_requested and gate.get("override_allowed"):
        required = list(gate.get("override_requires", []))
        if all(k in override_evidence and override_evidence.get(k) for k in required):
            status = "OVERRIDDEN"

    return GateDecision(
        status=status,  # type: ignore[arg-type]
        single_point_passed=single_ok,
        representative_passed=rep_ok,
        single_point_condition=single_cond,
        representative_condition=rep_cond,
        single_point_message=f"Single point check => {single_ok}",
        representative_message=f"Representative check => {rep_ok}, value={representative:.3f}",
        standard_value=standard_value,
        tolerance=tolerance,
        representative_value=representative,
        clause_refs=clause_refs,
    )

