from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


SUPPORTED_SPU_ID = "highway.subgrade.compaction.4.2.1.soil@v1"
SUPPORTED_STANDARD = "JTG F80/1-2017"
KW_COMPACTION_ZH = "\u538b\u5b9e\u5ea6"
KW_SUBGRADE_ZH = "\u8def\u57fa"
KW_WET_DENSITY_ZH = "\u6e7f\u5bc6\u5ea6"
KW_DRY_DENSITY_ZH = "\u5e72\u5bc6\u5ea6"
KW_MAX_DRY_DENSITY_ZH = "\u6700\u5927\u5e72\u5bc6\u5ea6"
KW_MOISTURE_ZH = "\u542b\u6c34\u7387"


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _text_corpus(standard_code: str, extracted_data: Dict[str, Any]) -> str:
    parts: List[str] = [standard_code]
    metadata = extracted_data.get("metadata", {})
    if isinstance(metadata, dict):
        parts.extend(str(v) for v in metadata.values() if isinstance(v, (str, int, float)))

    for key in ("chapters", "clauses", "formulas", "tables"):
        items = extracted_data.get(key, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict):
                parts.extend(str(v) for v in item.values() if isinstance(v, (str, int, float)))
            elif isinstance(item, (str, int, float)):
                parts.append(str(item))
    return " ".join(parts).lower()


def score_compaction_detection(standard_code: str, extracted_data: Dict[str, Any]) -> Tuple[float, List[str]]:
    corpus = _text_corpus(standard_code, extracted_data)
    score = 0.0
    review_points: List[str] = []

    if (KW_COMPACTION_ZH in corpus) or ("compaction" in corpus):
        score += 0.25
    else:
        review_points.append("Compaction keyword not confidently detected")

    if re.search(r"93\s*%", corpus) or ("93" in corpus and KW_COMPACTION_ZH in corpus):
        score += 0.25
    else:
        review_points.append("Threshold 93% source requires manual confirmation")

    formula_hits = [
        KW_WET_DENSITY_ZH,
        KW_DRY_DENSITY_ZH,
        KW_MAX_DRY_DENSITY_ZH,
        KW_MOISTURE_ZH,
        "wetdensity",
        "drydensity",
        "maxdrydensity",
        "moisture",
    ]
    if any(token in corpus for token in formula_hits):
        score += 0.25
    else:
        review_points.append("Formula evidence requires manual confirmation")

    if standard_code.strip().upper().replace(" ", "") == SUPPORTED_STANDARD.replace(" ", ""):
        score += 0.25
    else:
        review_points.append("Standard code match requires manual confirmation")

    if score < 0.9 and not review_points:
        review_points.append("Clause 4.2.1 threshold requires manual confirmation")

    return round(min(score, 1.0), 4), review_points


def is_empty_extracted_data(extracted_data: Dict[str, Any]) -> bool:
    if not extracted_data:
        return True
    for key in ("chapters", "clauses", "tables", "formulas"):
        value = extracted_data.get(key)
        if isinstance(value, list) and len(value) > 0:
            return False
    raw_meta = extracted_data.get("metadata")
    if isinstance(raw_meta, dict) and raw_meta:
        return False
    return True


def is_supported_metric(standard_code: str, extracted_data: Dict[str, Any]) -> bool:
    corpus = _text_corpus(standard_code, extracted_data)
    has_compaction = (KW_COMPACTION_ZH in corpus) or ("compaction" in corpus)
    has_subgrade = (KW_SUBGRADE_ZH in corpus) or ("subgrade" in corpus)
    has_standard = ("jtg" in corpus) and ("f80" in corpus)
    return has_compaction and has_subgrade and has_standard


def build_spu_definition() -> Dict[str, Any]:
    return {
        "spuId": SUPPORTED_SPU_ID,
        "meta": {
            "name": "\u8def\u57fa\u538b\u5b9e\u5ea6\uff08\u571f\u8d28\uff09",
            "norm": SUPPORTED_STANDARD,
            "clause": "4.2.1",
            "version": "v1",
            "category": "subgrade",
            "measuredItem": "compaction",
        },
        "forms": [
            {
                "formCode": "SUBGRADE_COMPACTION_FORM",
                "role": "lab",
                "required": True,
            }
        ],
        "data": {
            "inputs": [
                {"name": "massHoleSand", "type": "number", "label": "\u704c\u5165\u7802\u8d28\u91cf(g)"},
                {"name": "volumeSand", "type": "number", "label": "\u6807\u5b9a\u4f53\u79ef(cm3)"},
                {"name": "moistureContent", "type": "number", "label": "\u542b\u6c34\u7387(%)"},
                {"name": "maxDryDensity", "type": "number", "label": "\u6700\u5927\u5e72\u5bc6\u5ea6(g/cm3)"},
            ],
            "outputs": [
                {"name": "wetDensity", "label": "\u6e7f\u5bc6\u5ea6"},
                {"name": "dryDensity", "label": "\u5e72\u5bc6\u5ea6"},
                {"name": "compactionDegree", "label": "\u538b\u5b9e\u5ea6"},
            ],
        },
        "path": [
            {"step": "calc_wet_density", "formula": "wetDensity = massHoleSand / volumeSand"},
            {"step": "calc_dry_density", "formula": "dryDensity = wetDensity / (1 + moistureContent / 100)"},
            {"step": "calc_compaction", "formula": "compactionDegree = (dryDensity / maxDryDensity) * 100"},
        ],
        "rules": [
            {
                "ruleId": "RULE-COMPACTION-001",
                "field": "compactionDegree",
                "operator": ">=",
                "value": 93,
                "message": "\u538b\u5b9e\u5ea6\u5fc5\u987b >= 93%",
            }
        ],
        "proof": {
            "resultField": "compactionDegree",
            "passMessage": "\u538b\u5b9e\u5ea6\u8fbe\u6807",
            "failMessage": "\u538b\u5b9e\u5ea6\u4e0d\u8fbe\u6807",
            "requiredSignatures": ["lab", "supervision"],
        },
    }


def build_spec_json(spu: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "specId": spu["spuId"],
        "format": "SPU-v1",
        "generatedBy": "NormBot-SPU-Generator-v1",
        "generatedAt": _now_iso(),
        "spuId": spu["spuId"],
        "meta": spu["meta"],
        "forms": spu.get("forms", []),
        "data": spu["data"],
        "path": spu["path"],
        "rules": spu["rules"],
        "proof": spu["proof"],
        "markdownRef": f"{spu['spuId']}.md",
    }

