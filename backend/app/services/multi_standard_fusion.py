from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


PRIORITY_ORDER = {
    "enterprise": 4,
    "local": 3,
    "industry": 2,
    "national": 1,
}


def fuse_multi_standards(
    *,
    standards: list[Dict[str, Any]],
    output_dir: Path,
) -> Dict[str, Any]:
    normalized = [_normalize_standard(item) for item in standards if isinstance(item, dict)]
    sorted_items = sorted(normalized, key=lambda x: PRIORITY_ORDER.get(x["standard_type"], 0), reverse=True)

    merged_rules: Dict[str, Dict[str, Any]] = {}
    semantic_conflicts: list[Dict[str, Any]] = []
    threshold_conflicts: list[Dict[str, Any]] = []
    duplicated_rules: list[Dict[str, Any]] = []

    seen_signature: Dict[str, str] = {}
    for std in sorted_items:
        for rule in std["rules"]:
            rid = rule["rule_id"]
            sig = _rule_signature(rule)
            if sig in seen_signature:
                duplicated_rules.append(
                    {
                        "rule_id": rid,
                        "signature": sig,
                        "first_seen_in": seen_signature[sig],
                        "duplicated_in": std["standard_id"],
                        "explanation": f"规则签名重复，可能是重复录入：{sig}",
                    }
                )
            else:
                seen_signature[sig] = std["standard_id"]

            current = merged_rules.get(rid)
            if current is None:
                merged_rules[rid] = {**rule, "source_standard": std["standard_id"], "source_type": std["standard_type"]}
                continue

            # semantic conflict
            if str(current.get("field")) != str(rule.get("field")):
                semantic_conflicts.append(
                    {
                        "rule_id": rid,
                        "left": {"standard": current.get("source_standard"), "field": current.get("field")},
                        "right": {"standard": std["standard_id"], "field": rule.get("field")},
                        "resolved_by": _resolve_by_priority(current, rule, std),
                        "explanation": f"同 rule_id 字段语义不一致：{current.get('field')} vs {rule.get('field')}",
                    }
                )

            # threshold conflict
            if str(current.get("operator")) == str(rule.get("operator")) and current.get("threshold") != rule.get("threshold"):
                threshold_conflicts.append(
                    {
                        "rule_id": rid,
                        "left": {"standard": current.get("source_standard"), "threshold": current.get("threshold")},
                        "right": {"standard": std["standard_id"], "threshold": rule.get("threshold")},
                        "resolved_by": _resolve_by_priority(current, rule, std),
                        "explanation": f"阈值冲突：{current.get('threshold')} vs {rule.get('threshold')}",
                    }
                )

            # priority override
            current_priority = PRIORITY_ORDER.get(str(current.get("source_type")), 0)
            new_priority = PRIORITY_ORDER.get(std["standard_type"], 0)
            if new_priority >= current_priority:
                merged_rules[rid] = {**rule, "source_standard": std["standard_id"], "source_type": std["standard_type"]}

    manifest = {
        "meta": {
            "generated_at": _now(),
            "standard_count": len(sorted_items),
        },
        "priority_strategy": {
            "order": ["enterprise", "local", "industry", "national"],
            "expression": "enterprise > local > industry > national",
        },
        "fusion_engine": {
            "name": "multi_standard_fusion_v1",
            "steps": [
                "normalize standards",
                "sort by priority",
                "merge rules by rule_id",
                "detect semantic/threshold/duplicate conflicts",
                "resolve by priority strategy",
            ],
        },
        "conflict_resolver": {
            "semantic_conflict": semantic_conflicts,
            "threshold_conflict": threshold_conflicts,
            "duplicated_rule": duplicated_rules,
            "explanation_enabled": True,
        },
        "fused_rules": list(merged_rules.values()),
        "page_plan": {
            "page_name": "Conflict Resolution Center",
            "blocks": [
                "标准输入区（国标/行标/地标/企业标准）",
                "优先级策略展示",
                "冲突清单（semantic/threshold/duplicate）",
                "冲突解释",
                "融合后 manifest 预览",
            ],
        },
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "fusion_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def _normalize_standard(item: Dict[str, Any]) -> Dict[str, Any]:
    stype = str(item.get("standard_type") or "").strip().lower()
    if stype not in {"national", "industry", "local", "enterprise"}:
        raise ValueError("standard_type must be one of national/industry/local/enterprise")
    rules = item.get("rules") if isinstance(item.get("rules"), list) else []
    normalized_rules = []
    for i, rule in enumerate(rules):
        if not isinstance(rule, dict):
            continue
        normalized_rules.append(
            {
                "rule_id": str(rule.get("rule_id") or f"rule_{i+1}").strip(),
                "field": rule.get("field"),
                "operator": rule.get("operator"),
                "threshold": rule.get("threshold"),
                "unit": rule.get("unit"),
                "gate_logic": rule.get("gate_logic") or "AND",
            }
        )
    return {
        "standard_id": str(item.get("standard_id") or f"{stype}_std").strip(),
        "standard_type": stype,
        "rules": normalized_rules,
    }


def _resolve_by_priority(current: Dict[str, Any], incoming: Dict[str, Any], incoming_std: Dict[str, Any]) -> Dict[str, Any]:
    cp = PRIORITY_ORDER.get(str(current.get("source_type")), 0)
    np = PRIORITY_ORDER.get(str(incoming_std.get("standard_type")), 0)
    if np >= cp:
        return {"winner_standard": incoming_std["standard_id"], "winner_type": incoming_std["standard_type"]}
    return {"winner_standard": current.get("source_standard"), "winner_type": current.get("source_type")}


def _rule_signature(rule: Dict[str, Any]) -> str:
    core = {
        "field": rule.get("field"),
        "operator": rule.get("operator"),
        "threshold": rule.get("threshold"),
        "unit": rule.get("unit"),
        "gate_logic": rule.get("gate_logic"),
    }
    return json.dumps(core, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
