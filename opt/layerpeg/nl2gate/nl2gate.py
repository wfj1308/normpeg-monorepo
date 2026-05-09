from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class NLIntent:
    intent: str
    form_type: Optional[str]
    entities: dict[str, Any]
    context: dict[str, Any]


class NL2Gate:
    def __init__(self, project_context: dict[str, Any], session_context: Optional[dict[str, dict[str, Any]]] = None):
        self.project = project_context
        self.session_context = session_context if session_context is not None else {}

        self.intent_patterns = {
            "validate": r"(合格|行吗|够不|可以吗|满足要求|判定)",
            "query_standard": r"(标准|规定|要求|规范|是多少)",
            "calculate": r"(计算|多少|结果|得多少)",
        }

        self.entity_patterns = {
            "stake": r"[Kk](\d{1,4})[\+加](\d{3})",
            "compaction": r"压实度[^\d]*(\d{2,3}(?:\.\d+)?)",
            "thickness": r"厚度[^\d]*(\d{2,3}(?:\.\d+)?)",
            "flatness": r"(?:平整度|IRI)[^\d]*(\d+(?:\.\d+)?)",
            "deflection": r"(?:弯沉|贝克曼)[^\d]*(\d+(?:\.\d+)?)",
            "road_class": r"(高速|一级|二级|三四级)",
            "layer": r"(96区|94区|92区|底基层|基层|面层)",
        }

        self.term_map = {
            "压实度": "compaction_degree",
            "密实度": "compaction_degree",
            "平整度": "flatness",
            "弯沉": "deflection",
            "厚度": "thickness",
            "桩号": "stake",
            "段落": "section",
        }

    def parse(self, text: str, user_id: str = "default") -> NLIntent:
        clean_text = text.strip()
        intent = self._detect_intent(clean_text)
        entities = self._extract_entities(clean_text)
        entities = self._fill_context(entities, user_id)
        form_type = self._map_to_form(entities)
        self._update_context(user_id, entities)
        return NLIntent(
            intent=intent,
            form_type=form_type,
            entities=entities,
            context=self.session_context.get(user_id, {}),
        )

    def _detect_intent(self, text: str) -> str:
        for intent, pattern in self.intent_patterns.items():
            if re.search(pattern, text):
                return intent
        return "validate"

    def _extract_entities(self, text: str) -> dict[str, Any]:
        entities: dict[str, Any] = {"raw_text": text}

        stake_match = re.search(self.entity_patterns["stake"], text, re.IGNORECASE)
        if stake_match:
            entities["stake"] = f"K{int(stake_match.group(1))}+{stake_match.group(2)}"

        for key in ("compaction", "thickness", "flatness", "deflection"):
            pattern = self.entity_patterns[key]
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                entities[key] = float(match.group(1))

        road_match = re.search(self.entity_patterns["road_class"], text)
        if road_match:
            entities["road_class"] = road_match.group(1)

        layer_match = re.search(self.entity_patterns["layer"], text)
        if layer_match:
            entities["layer"] = layer_match.group(1)
            # MINIMAL_COMPLETION: keep compatibility with existing Gate inputs that may expect layer_zone.
            entities["layer_zone"] = layer_match.group(1)

        return entities

    def _fill_context(self, entities: dict[str, Any], user_id: str) -> dict[str, Any]:
        context = self.session_context.get(user_id, {})

        if "stake" not in entities and "last_stake" in context:
            entities["stake"] = context["last_stake"]

        if "layer" not in entities:
            entities["layer"] = context.get("last_layer") or self.project.get("default_layer") or "96区"
        if "layer_zone" not in entities:
            entities["layer_zone"] = entities["layer"]

        return entities

    def _map_to_form(self, entities: dict[str, Any]) -> Optional[str]:
        raw = str(entities.get("raw_text", ""))
        if "压实度" in raw or "compaction" in entities:
            return "T0921-2019"
        if "平整度" in raw or "IRI" in raw.upper() or "flatness" in entities:
            return "T0931-2019"
        if "厚度" in raw or "thickness" in entities:
            return "T0912-2019"
        if "弯沉" in raw or "贝克曼" in raw or "deflection" in entities:
            return "T0951-2008"
        return None

    def _update_context(self, user_id: str, entities: dict[str, Any]) -> None:
        if user_id not in self.session_context:
            self.session_context[user_id] = {}

        if "stake" in entities:
            self.session_context[user_id]["last_stake"] = entities["stake"]
        if "layer" in entities:
            self.session_context[user_id]["last_layer"] = entities["layer"]
        self.session_context[user_id]["user_id"] = user_id

    def to_api_params(self, intent: NLIntent) -> dict[str, Any]:
        if intent.form_type is None:
            raise ValueError("无法识别检测类型，请明确说明：压实度、平整度、厚度或弯沉")

        project_id = (
            self.project.get("project_id")
            or self.project.get("id")
            or self.project.get("projectId")
            or "unknown_project"
        )

        params: dict[str, Any] = {
            "form_type": intent.form_type,
            "project_id": project_id,
            "intent": intent.intent,
            "context": intent.context,
        }

        if "stake" in intent.entities:
            params["section"] = intent.entities["stake"]

        inputs: dict[str, Any] = {}
        if intent.form_type == "T0921-2019":
            if "compaction" not in intent.entities:
                raise ValueError("缺少压实度数值，请补充如：压实度94.5")
            inputs["compaction_degree"] = intent.entities["compaction"]
            inputs["layer"] = intent.entities.get("layer", "96区")
            inputs["layer_zone"] = intent.entities.get("layer_zone", inputs["layer"])

        elif intent.form_type == "T0931-2019":
            if "flatness" not in intent.entities:
                raise ValueError("缺少平整度/IRI数值，请补充如：IRI 1.8")
            inputs["iri"] = intent.entities["flatness"]
            inputs["layer"] = intent.entities.get("layer", "面层")

        elif intent.form_type == "T0912-2019":
            if "thickness" not in intent.entities:
                raise ValueError("缺少厚度数值，请补充如：厚度58")
            inputs["thickness"] = intent.entities["thickness"]
            inputs["layer"] = intent.entities.get("layer", "面层")

        elif intent.form_type == "T0951-2008":
            if "deflection" not in intent.entities:
                raise ValueError("缺少弯沉数值，请补充如：弯沉180")
            inputs["deflection"] = intent.entities["deflection"]

        if "road_class" in intent.entities:
            inputs["road_class"] = intent.entities["road_class"]

        params["inputs"] = inputs
        if "user_id" in intent.context:
            params["user_id"] = intent.context["user_id"]
        return params
