from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from app.models.execution import InspectedRecord, RuleUpdateRequest


def _resolve_zone_from_layer_depth(layer_depth: str) -> str:
    key = str(layer_depth).strip()
    if key in {"0-0.8m", "0.8-1.5m"}:
        return "Z96"
    if key == ">1.5m":
        return "Z94"
    return "Z96"


def analyze_rule_update_impact(update: RuleUpdateRequest, records: List[InspectedRecord]) -> Dict[str, Any]:
    effect_day = datetime.fromisoformat(update.effective_date).date()
    affected: List[Dict[str, Any]] = []
    untouched: List[Dict[str, Any]] = []

    for row in records:
        record_day = datetime.fromisoformat(row.checked_at.replace("Z", "+00:00")).date()
        zone = _resolve_zone_from_layer_depth(row.layer_depth)
        in_window = update.old_value <= row.compaction_degree < update.new_value
        before_effective = record_day < effect_day
        is_affected = in_window and before_effective and zone == "Z96"
        item = {
            "record_id": row.record_id,
            "stake": row.stake,
            "checked_at": row.checked_at,
            "compaction_degree": row.compaction_degree,
            "zone": zone,
            "status_before": row.status,
            "mark": "OLD_STANDARD",
        }
        if is_affected:
            item["risk_level"] = "HIGH"
            item["retest_recommendation"] = "RETEST_RECOMMENDED"
            affected.append(item)
        else:
            item["risk_level"] = "LOW"
            item["retest_recommendation"] = "NO_RETEST_NEEDED"
            untouched.append(item)

    return {
        "update_target": update.target,
        "old_value": update.old_value,
        "new_value": update.new_value,
        "effective_date": update.effective_date,
        "affected_count": len(affected),
        "affected_records": affected,
        "unaffected_records": untouched,
        "summary": "Rule update -> impact detection -> mark old standard -> retest recommendation",
    }
