from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


PRECEDENCE_ORDER = {
    "enterprise": 5,
    "project": 4,
    "local": 3,
    "industry": 2,
    "national": 1,
    "unknown": 0,
}


def semantic_conflict_schema() -> Dict[str, Any]:
    return {
        "schema_id": "semantic_conflict_intelligence.v1",
        "input_fields": ["rules"],
        "rule_fields": [
            "rule_id",
            "slotKey",
            "operator",
            "threshold",
            "scope",
            "semantic_text",
            "standard_level",
            "version",
        ],
        "supported_conflicts": [
            "threshold_conflict",
            "operator_conflict",
            "scope_conflict",
            "semantic_contradiction",
            "stricter_override",
        ],
        "outputs": ["conflict_reasoning", "recommended_resolution", "precedence_suggestion"],
    }


def analyze_semantic_conflicts(*, rules: list[Dict[str, Any]]) -> Dict[str, Any]:
    normalized = [_normalize_rule(rule, idx) for idx, rule in enumerate(rules, start=1) if isinstance(rule, dict)]
    conflicts: list[Dict[str, Any]] = []

    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            left = normalized[i]
            right = normalized[j]
            if left["slotKey"] != right["slotKey"]:
                continue
            pair_conflicts = _compare_rule_pair(left, right)
            conflicts.extend(pair_conflicts)

    return {
        "conflict_engine": {
            "name": "semantic_conflict_intelligence_engine_v1",
            "supported_conflicts": semantic_conflict_schema()["supported_conflicts"],
        },
        "semantic_compare_algorithm": {
            "name": "slot_scope_operator_threshold_compare_v1",
            "steps": [
                "1) normalize rule semantics",
                "2) compare slotKey-scoped rule pairs",
                "3) detect threshold/operator/scope/semantic conflicts",
                "4) infer stricter override and precedence suggestion",
            ],
        },
        "precedence_rules": {
            "order": ["enterprise", "project", "local", "industry", "national", "unknown"],
            "expression": "enterprise > project > local > industry > national > unknown",
        },
        "conflicts": conflicts,
        "meta": {
            "generated_at": _now(),
            "rule_count": len(normalized),
            "conflict_count": len(conflicts),
        },
    }


def _normalize_rule(rule: Dict[str, Any], idx: int) -> Dict[str, Any]:
    return {
        "rule_id": str(rule.get("rule_id") or f"rule_{idx}").strip(),
        "slotKey": str(rule.get("slotKey") or rule.get("field") or "unknown_slot").strip(),
        "operator": str(rule.get("operator") or "").strip(),
        "threshold": rule.get("threshold"),
        "scope": str(rule.get("scope") or "global").strip() or "global",
        "semantic_text": str(rule.get("semantic_text") or rule.get("clause") or "").strip(),
        "standard_level": str(rule.get("standard_level") or rule.get("standard_type") or "unknown").strip().lower() or "unknown",
        "version": str(rule.get("version") or "v1").strip() or "v1",
    }


def _compare_rule_pair(left: Dict[str, Any], right: Dict[str, Any]) -> list[Dict[str, Any]]:
    out: list[Dict[str, Any]] = []

    threshold_conflict = left["threshold"] != right["threshold"]
    operator_conflict = left["operator"] != right["operator"]
    scope_conflict = left["scope"] != right["scope"]
    semantic_contradiction = _semantic_contradiction(left, right)
    stricter_override = _is_stricter_override(left, right)

    if threshold_conflict:
        out.append(_build_conflict("threshold_conflict", left, right))
    if operator_conflict:
        out.append(_build_conflict("operator_conflict", left, right))
    if scope_conflict:
        out.append(_build_conflict("scope_conflict", left, right))
    if semantic_contradiction:
        out.append(_build_conflict("semantic_contradiction", left, right))
    if stricter_override:
        out.append(_build_conflict("stricter_override", left, right))

    return out


def _semantic_contradiction(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    ltxt = left["semantic_text"].lower()
    rtxt = right["semantic_text"].lower()
    if not ltxt or not rtxt:
        return False
    contradiction_pairs = [
        ("must", "must not"),
        ("shall", "shall not"),
        ("allow", "forbid"),
        ("required", "prohibited"),
    ]
    for positive, negative in contradiction_pairs:
        if (positive in ltxt and negative in rtxt) or (negative in ltxt and positive in rtxt):
            return True
    return False


def _is_stricter_override(left: Dict[str, Any], right: Dict[str, Any]) -> bool:
    if left["operator"] != right["operator"]:
        return False
    if not isinstance(left["threshold"], (int, float)) or not isinstance(right["threshold"], (int, float)):
        return False
    if left["threshold"] == right["threshold"]:
        return False
    if left["operator"] in {">", ">="}:
        return True
    if left["operator"] in {"<", "<="}:
        return True
    return False


def _build_conflict(conflict_type: str, left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    precedence = _suggest_precedence(left, right)
    reason = _reason_text(conflict_type, left, right)
    resolution = _resolution_text(conflict_type, left, right, precedence)
    return {
        "conflict_id": f"{left['rule_id']}::{right['rule_id']}::{conflict_type}",
        "conflict_type": conflict_type,
        "slotKey": left["slotKey"],
        "left": left,
        "right": right,
        "conflict_reasoning": reason,
        "recommended_resolution": resolution,
        "precedence_suggestion": precedence,
    }


def _suggest_precedence(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    lpri = PRECEDENCE_ORDER.get(left["standard_level"], 0)
    rpri = PRECEDENCE_ORDER.get(right["standard_level"], 0)
    if lpri > rpri:
        winner = left
        loser = right
    elif rpri > lpri:
        winner = right
        loser = left
    else:
        # same level: prefer higher version lexical order
        if right["version"] > left["version"]:
            winner = right
            loser = left
        else:
            winner = left
            loser = right
    return {
        "winner_rule_id": winner["rule_id"],
        "winner_standard_level": winner["standard_level"],
        "loser_rule_id": loser["rule_id"],
        "policy": "precedence_rules_v1",
    }


def _reason_text(conflict_type: str, left: Dict[str, Any], right: Dict[str, Any]) -> str:
    if conflict_type == "threshold_conflict":
        return f"Threshold mismatch on slot {left['slotKey']}: {left['threshold']} vs {right['threshold']}."
    if conflict_type == "operator_conflict":
        return f"Operator mismatch on slot {left['slotKey']}: {left['operator']} vs {right['operator']}."
    if conflict_type == "scope_conflict":
        return f"Scope mismatch on slot {left['slotKey']}: {left['scope']} vs {right['scope']}."
    if conflict_type == "semantic_contradiction":
        return f"Semantic contradiction detected between {left['rule_id']} and {right['rule_id']}."
    return f"Stricter override candidate on slot {left['slotKey']} between {left['rule_id']} and {right['rule_id']}."


def _resolution_text(conflict_type: str, left: Dict[str, Any], right: Dict[str, Any], precedence: Dict[str, Any]) -> str:
    winner = precedence.get("winner_rule_id")
    if conflict_type == "stricter_override":
        return f"Adopt stricter threshold and mark {winner} as active rule with explicit override trace."
    return f"Apply precedence policy and keep {winner}; move the other rule to override/review queue."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

