from __future__ import annotations

import re
from typing import Any, Dict

from fastapi import HTTPException

from app.models.execution import CompactionExecutionRequest


STAKE_PATTERN = re.compile(r"[Kk]?(\d{1,4})[+\u52a0](\d{3})")
COMPACTION_PATTERN = re.compile(r"(?:\u538b\u5b9e\u5ea6|compaction)[^\d]*(\d{2,3}(?:\.\d+)?)", re.IGNORECASE)
LAYER_DEPTH_PATTERN = re.compile(r"(0-0\.8m|0\.8-1\.5m|>1\.5m)")


def parse_natural_query(message: str) -> Dict[str, Any]:
    text = message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="message is empty")

    trace: Dict[str, Any] = {
        "raw_text": text,
        "intent": "validate",
        "entities": {},
        "mapping": {},
    }

    stake_match = STAKE_PATTERN.search(text)
    if stake_match:
        trace["entities"]["stake"] = f"K{int(stake_match.group(1))}+{stake_match.group(2)}"

    compaction_match = COMPACTION_PATTERN.search(text)
    if compaction_match:
        trace["entities"]["compaction_degree"] = float(compaction_match.group(1))
    else:
        percent_match = re.search(r"(\d{2,3}(?:\.\d+)?)\s*%", text)
        if percent_match:
            trace["entities"]["compaction_degree"] = float(percent_match.group(1))

    depth_match = LAYER_DEPTH_PATTERN.search(text)
    if depth_match:
        trace["entities"]["layer_depth"] = depth_match.group(1)

    if "\u538b\u5b9e\u5ea6" in text or "compaction" in text.lower():
        trace["mapping"]["component_id"] = "JTG_F80_1_2017.4.2.1.compaction"
        trace["mapping"]["test_method"] = "T0921"

    if "stake" not in trace["entities"]:
        trace["entities"]["stake"] = "K15+200"
        trace["mapping"]["filled_default_stake"] = True
    if "layer_depth" not in trace["entities"]:
        trace["entities"]["layer_depth"] = "0-0.8m"
        trace["mapping"]["filled_default_layer_depth"] = True
    if "compaction_degree" not in trace["entities"]:
        raise HTTPException(status_code=400, detail="Cannot parse compaction value, e.g. compaction 94%.")

    return trace


def trace_to_layer2_request(project_id: str, trace: Dict[str, Any]) -> CompactionExecutionRequest:
    entities = trace.get("entities", {})
    return CompactionExecutionRequest(
        project_id=project_id,
        component_id=str(trace.get("mapping", {}).get("component_id", "JTG_F80_1_2017.4.2.1.compaction")),
        stake=str(entities.get("stake", "K15+200")),
        layer_depth=str(entities.get("layer_depth", "0-0.8m")),
        test_method=str(trace.get("mapping", {}).get("test_method", "T0921")),
        compaction_degree=float(entities["compaction_degree"]),
        paragraph_values=[float(entities["compaction_degree"])],
    )
