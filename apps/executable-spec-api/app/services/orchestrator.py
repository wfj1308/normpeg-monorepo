from __future__ import annotations

from typing import Any, Dict, List

from app.layer1.facade import resolve_layer1_component
from app.models.compiler import NormDocCompileRequest
from app.layer2.impact_engine import analyze_rule_update_impact
from app.layer2.notification_service import publish_notifications
from app.models.execution import InspectedRecord, RuleUpdateRequest
from app.models.normdoc import Layer1ResolveRequest
from app.services.normdoc_spu_compiler import compile_normdoc_to_spu
from app.services.spu_asset_writer import save_compiled_spu_asset
from app.services.spu_registry import register_compiled_spu


def preview_resolved_component(
    project_id: str,
    component_id: str,
    version: str | None = None,
    patch_ids: List[str] | None = None,
) -> Dict[str, Any]:
    return resolve_layer1_component(
        Layer1ResolveRequest(
            project_id=project_id,
            component_id=component_id,
            version=version,
            patch_ids=patch_ids or [],
            use_project_overrides=True,
        )
    ).model_dump()


def process_rule_update_with_retrospect(update: RuleUpdateRequest, records: List[InspectedRecord]) -> Dict[str, Any]:
    impact = analyze_rule_update_impact(update, records)
    notifications = publish_notifications(update.project_id, impact)
    return {
        "update": update.model_dump(),
        "impact": impact,
        "notifications": notifications,
        "next_action": "Acknowledge in field app and schedule retest for high-risk records",
    }


def compile_and_register_spu(normdoc: NormDocCompileRequest) -> Dict[str, Any]:
    compiled = compile_normdoc_to_spu(normdoc)
    if not compiled.get("ok"):
        return {"ok": False, "error": compiled.get("error", "COMPILE_FAILED")}

    spu_id = str(compiled["spuId"])
    yaml_text = str(compiled["yaml"])
    asset = save_compiled_spu_asset(spu_id, yaml_text)
    registry_item = dict(compiled["registryItem"])
    registry_item["assetPath"] = asset["assetPath"]
    registered = register_compiled_spu(registry_item)

    return {
        "ok": True,
        "spuId": spu_id,
        "filePath": asset["filePath"],
        "registered": True,
        "registryItem": registered,
    }
