from __future__ import annotations

import ast
from typing import Any, Dict

from fastapi import HTTPException

from app.services.common import safe_eval_expression


def _lookup_zone(layer_depth: str, table: Dict[str, str]) -> str:
    key = str(layer_depth).strip()
    if key in table:
        return table[key]
    if key.lower() in table:
        return table[key.lower()]
    return "Z96"


def _required_names(expression: str) -> set[str]:
    tree = ast.parse(expression, mode="eval")
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}


def execute_path(normdoc_payload: Dict[str, Any], execution_input: Dict[str, Any]) -> Dict[str, Any]:
    body = normdoc_payload.get("body", {})
    path = body.get("path", {})
    steps = path.get("steps", [])
    lookup_tables = path.get("lookup_tables", {})

    context: Dict[str, Any] = dict(execution_input)
    outputs: Dict[str, Any] = {}

    if execution_input.get("compaction_degree") is not None:
        context["compaction_degree"] = float(execution_input["compaction_degree"])

    for step in steps:
        step_id = step.get("id", "")
        output_key = step.get("output")
        if step.get("formula"):
            required = _required_names(str(step["formula"]))
            missing = [name for name in required if name not in context]
            if missing:
                # Allow direct compaction input path: raw-data formulas can be skipped.
                if context.get("compaction_degree") is not None:
                    continue
                raise HTTPException(status_code=400, detail=f"Path step {step_id} missing inputs: {','.join(missing)}")
            try:
                value = safe_eval_expression(str(step["formula"]), context)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Path step {step_id} execution failed: {exc}") from exc
            if output_key:
                context[output_key] = value
                outputs[output_key] = value
            continue

        lookup_cfg = step.get("lookup")
        if not isinstance(lookup_cfg, dict):
            continue
        source_table_name = str(lookup_cfg.get("table", ""))
        source_table = lookup_tables.get(source_table_name, {})
        input_key = str(lookup_cfg.get("input", ""))
        if source_table_name == "layer_depth_to_zone":
            zone = _lookup_zone(str(context.get(input_key, "")), source_table)
            context[output_key or "zone_type"] = zone
            outputs[output_key or "zone_type"] = zone
        elif source_table_name == "standard_by_zone":
            zone_key = str(context.get(input_key, "Z96"))
            standard = float(source_table.get(zone_key, source_table.get("Z96", 95.0)))
            context[output_key or "standard_value"] = standard
            outputs[output_key or "standard_value"] = standard

    if "compaction_degree" not in context:
        raise HTTPException(status_code=400, detail="Path execution missing compaction_degree.")
    if "zone_type" not in context:
        context["zone_type"] = _lookup_zone(str(context.get("layer_depth", "0-0.8m")), lookup_tables.get("layer_depth_to_zone", {}))
        outputs["zone_type"] = context["zone_type"]
    if "standard_value" not in context:
        standards = lookup_tables.get("standard_by_zone", {})
        context["standard_value"] = float(standards.get(context["zone_type"], standards.get("Z96", 95.0)))
        outputs["standard_value"] = context["standard_value"]

    outputs["compaction_degree"] = float(context["compaction_degree"])
    outputs["path_context"] = context
    return outputs
