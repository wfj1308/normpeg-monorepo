from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, Literal

from app.models.compiler import NormDocCompileRequest, NormDocField, SpuRegistryItem


MetricType = Literal["compaction", "thickness", "deflection"]

INPUT_VALUE_PREFIX = "**INPUT**:"

COMPACTION_ALIASES = {"压实度", "路基压实度", "压实度（土质）", "compaction"}
THICKNESS_ALIASES = {"厚度", "路基厚度", "层厚", "thickness"}
DEFLECTION_ALIASES = {"弯沉", "路基弯沉", "贝克曼梁弯沉", "deflection"}

COMPACTION_KEY_ALIASES = {
    "massHoleSand": "massHoleSand",
    "massSandCone": "massSandCone",
    "volumeSand": "volumeSand",
    "moistureContent": "moistureContent",
    "maxDryDensity": "maxDryDensity",
}

THICKNESS_KEY_ALIASES = {
    "measuredThickness": "measuredThickness",
    "designThickness": "designThickness",
}

DEFLECTION_KEY_ALIASES = {
    "measuredDeflection": "measuredDeflection",
    "maxAllowedDeflection": "maxAllowedDeflection",
}

COMPACTION_LABEL_ALIASES = {
    "灌入砂质量": "massHoleSand",
    "灌入砂质量g": "massHoleSand",
    "锥体砂质量": "massSandCone",
    "锥体砂质量g": "massSandCone",
    "标定体积": "volumeSand",
    "标定体积cm3": "volumeSand",
    "含水率": "moistureContent",
    "含水率%": "moistureContent",
    "最大干密度": "maxDryDensity",
    "最大干密度gcm3": "maxDryDensity",
}

THICKNESS_LABEL_ALIASES = {
    "实测厚度": "measuredThickness",
    "实测厚度mm": "measuredThickness",
    "设计厚度": "designThickness",
    "设计厚度mm": "designThickness",
}

DEFLECTION_LABEL_ALIASES = {
    "实测弯沉": "measuredDeflection",
    "实测弯沉001mm": "measuredDeflection",
    "允许弯沉": "maxAllowedDeflection",
    "设计允许弯沉": "maxAllowedDeflection",
    "最大允许弯沉": "maxAllowedDeflection",
}


@dataclass(frozen=True)
class NormalizedField:
    name: str
    label: str
    type: str = "number"


def compile_normdoc_to_spu(payload: NormDocCompileRequest) -> Dict[str, Any]:
    metric_type = detect_metric_type(payload)
    if metric_type is None:
        return {"ok": False, "error": "UNSUPPORTED_METRIC"}

    normalized_fields = normalize_normdoc_fields(metric_type, payload.fields)
    if metric_type == "compaction":
        compiled = compile_compaction_spu(payload, normalized_fields)
    elif metric_type == "thickness":
        compiled = compile_thickness_spu(payload, normalized_fields)
    else:
        compiled = compile_deflection_spu(payload, normalized_fields)

    registry_item = SpuRegistryItem(
        spuId=compiled["spuId"],
        norm=payload.norm,
        clause=payload.clause,
        name=compiled["name"],
        version="v1",
        category=payload.category,
        workItem=payload.workItem,
        measuredItem=payload.measuredItem,
        sourceType="compiled_from_normdoc",
        metricType=metric_type,
        assetPath="",
    )

    return {
        "ok": True,
        "spuId": compiled["spuId"],
        "yaml": compiled["yaml"],
        "registryItem": registry_item.model_dump(),
    }


def detect_metric_type(payload: NormDocCompileRequest) -> MetricType | None:
    measured_item = payload.measuredItem.strip()
    if measured_item in COMPACTION_ALIASES:
        return "compaction"
    if measured_item in THICKNESS_ALIASES:
        return "thickness"
    if measured_item in DEFLECTION_ALIASES:
        return "deflection"
    return None


def normalize_normdoc_fields(metric_type: MetricType, fields: list[NormDocField]) -> list[NormalizedField]:
    normalized: list[NormalizedField] = []
    seen: set[str] = set()
    standard_keys = _allowed_standard_keys(metric_type)
    label_aliases = _label_aliases(metric_type)

    for field in fields:
        normalized_name = _normalize_field_name(field, standard_keys, label_aliases)
        if normalized_name in seen:
            continue
        normalized.append(
            NormalizedField(
                name=normalized_name,
                label=field.name,
                type=field.type,
            )
        )
        seen.add(normalized_name)

    return normalized


def compile_compaction_spu(payload: NormDocCompileRequest, fields: list[NormalizedField]) -> Dict[str, str]:
    spu_id = f"highway.subgrade.compaction.{payload.clause.strip()}.{_resolve_type_slug(payload.typeHint)}@v1"
    type_label = _resolve_type_label(payload.typeHint)
    name = f"路基压实度（{type_label}）" if type_label else "路基压实度"

    return {
        "spuId": spu_id,
        "name": name,
        "yaml": build_spu_yaml(
            spu_id=spu_id,
            name=name,
            norm=payload.norm,
            clause=payload.clause,
            form_code="SUBGRADE_COMPACTION_FORM",
            inputs=fields,
            outputs=["wetDensity", "dryDensity", "compactionDegree"],
            path=[
                ("calc_wet_density", "wetDensity = massHoleSand / volumeSand"),
                ("calc_dry_density", "dryDensity = wetDensity / (1 + moistureContent / 100)"),
                ("calc_compaction", "compactionDegree = (dryDensity / maxDryDensity) * 100"),
            ],
            rules=[
                {
                    "ruleId": "RULE-COMPACTION-001",
                    "field": "compactionDegree",
                    "operator": ">=",
                    "value": _format_number(payload.threshold),
                    "message": f"压实度必须 ≥ {_format_number(payload.threshold)}%",
                }
            ],
            proof={
                "resultField": "compactionDegree",
                "passMessage": "压实度达标",
                "failMessage": "压实度不达标",
            },
        ),
    }


def compile_thickness_spu(payload: NormDocCompileRequest, fields: list[NormalizedField]) -> Dict[str, str]:
    spu_id = f"highway.subgrade.thickness.{payload.clause.strip()}@v1"
    name = "路基厚度"

    return {
        "spuId": spu_id,
        "name": name,
        "yaml": build_spu_yaml(
            spu_id=spu_id,
            name=name,
            norm=payload.norm,
            clause=payload.clause,
            form_code="SUBGRADE_THICKNESS_FORM",
            inputs=fields,
            outputs=["thicknessDeviation", "thicknessValue"],
            path=[
                ("resolve_thickness_value", "thicknessValue = measuredThickness"),
                ("calc_thickness_deviation", "thicknessDeviation = measuredThickness - designThickness"),
            ],
            rules=[
                {
                    "ruleId": "RULE-THICKNESS-001",
                    "field": "thicknessValue",
                    "operator": ">=",
                    "value": _format_number(payload.threshold),
                    "message": f"厚度必须 ≥ {_format_number(payload.threshold)}",
                }
            ],
            proof={
                "resultField": "thicknessValue",
                "passMessage": "厚度达标",
                "failMessage": "厚度不达标",
            },
        ),
    }


def compile_deflection_spu(payload: NormDocCompileRequest, fields: list[NormalizedField]) -> Dict[str, str]:
    spu_id = f"highway.subgrade.deflection.{payload.clause.strip()}@v1"
    name = "路基弯沉"

    return {
        "spuId": spu_id,
        "name": name,
        "yaml": build_spu_yaml(
            spu_id=spu_id,
            name=name,
            norm=payload.norm,
            clause=payload.clause,
            form_code="SUBGRADE_DEFLECTION_FORM",
            inputs=fields,
            outputs=["deflectionValue"],
            path=[
                ("resolve_deflection_value", "deflectionValue = measuredDeflection"),
            ],
            rules=[
                {
                    "ruleId": "RULE-DEFLECTION-001",
                    "field": "deflectionValue",
                    "operator": "<=",
                    "value": f"{INPUT_VALUE_PREFIX}maxAllowedDeflection",
                    "message": "弯沉必须 ≤ 允许值",
                }
            ],
            proof={
                "resultField": "deflectionValue",
                "passMessage": "弯沉达标",
                "failMessage": "弯沉不达标",
            },
        ),
    }


def build_spu_yaml(
    *,
    spu_id: str,
    name: str,
    norm: str,
    clause: str,
    form_code: str,
    inputs: list[NormalizedField],
    outputs: list[str],
    path: list[tuple[str, str]],
    rules: list[Dict[str, str]],
    proof: Dict[str, str],
) -> str:
    yaml_lines = [
        f'spuId: "{spu_id}"',
        "",
        "meta:",
        f'  name: "{_escape_yaml_string(name)}"',
        f'  norm: "{_escape_yaml_string(norm)}"',
        f'  clause: "{_escape_yaml_string(clause)}"',
        '  version: "v1"',
        "",
        "forms:",
        f'  - formCode: "{form_code}"',
        '    role: "lab"',
        "    required: true",
        "",
        "data:",
        "  inputs:",
    ]

    for field in inputs:
        yaml_lines.extend(
            [
                f"    - name: {field.name}",
                "      type: number",
                f'      label: "{_escape_yaml_string(field.label)}"',
            ]
        )

    yaml_lines.append("  outputs:")
    for output in outputs:
        yaml_lines.append(f"    - name: {output}")

    yaml_lines.extend(["", "path:"])
    for step_name, formula in path:
        yaml_lines.extend(
            [
                f"  - step: {step_name}",
                f'    formula: "{_escape_yaml_string(formula)}"',
            ]
        )

    yaml_lines.extend(["", "rules:"])
    for rule in rules:
        yaml_lines.extend(
            [
                f'  - ruleId: "{rule["ruleId"]}"',
                f'    field: "{rule["field"]}"',
                f'    operator: "{rule["operator"]}"',
                f'    value: {_render_yaml_scalar(rule["value"])}',
                f'    message: "{_escape_yaml_string(rule["message"])}"',
            ]
        )

    yaml_lines.extend(
        [
            "",
            "proof:",
            f'  resultField: "{proof["resultField"]}"',
            f'  passMessage: "{_escape_yaml_string(proof["passMessage"])}"',
            f'  failMessage: "{_escape_yaml_string(proof["failMessage"])}"',
            "  requiredSignatures:",
            "    - lab",
            "    - supervision",
        ]
    )
    return "\n".join(yaml_lines)


def _normalize_field_name(
    field: NormDocField,
    standard_keys: Dict[str, str],
    label_aliases: Dict[str, str],
) -> str:
    normalized_key = standard_keys.get(field.key.strip())
    if normalized_key:
        return normalized_key

    simplified_name = _simplify_name(field.name)
    for alias, normalized in label_aliases.items():
        if alias in simplified_name:
            return normalized

    return field.key.strip()


def _allowed_standard_keys(metric_type: MetricType) -> Dict[str, str]:
    if metric_type == "compaction":
        return COMPACTION_KEY_ALIASES
    if metric_type == "thickness":
        return THICKNESS_KEY_ALIASES
    return DEFLECTION_KEY_ALIASES


def _label_aliases(metric_type: MetricType) -> Dict[str, str]:
    if metric_type == "compaction":
        return COMPACTION_LABEL_ALIASES
    if metric_type == "thickness":
        return THICKNESS_LABEL_ALIASES
    return DEFLECTION_LABEL_ALIASES


def _resolve_type_slug(type_hint: str) -> str:
    normalized = (type_hint or "").strip().lower()
    if normalized == "soil":
        return "soil"
    return "general"


def _resolve_type_label(type_hint: str) -> str:
    normalized = (type_hint or "").strip().lower()
    if normalized == "soil":
        return "土质"
    return ""


def _simplify_name(value: str) -> str:
    replacements = {
        "（": "(",
        "）": ")",
        "³": "3",
        "²": "2",
        "／": "/",
        "·": "",
    }
    normalized = value.strip()
    for source, target in replacements.items():
        normalized = normalized.replace(source, target)
    keep_chars: list[str] = []
    for char in normalized:
        if char.isalnum() or "\u4e00" <= char <= "\u9fff":
            keep_chars.append(char.lower())
    return "".join(keep_chars)


def _format_number(value: float | int) -> str:
    if isinstance(value, int):
        return str(value)
    if float(value).is_integer():
        return str(int(value))
    return format(float(value), "g")


def _render_yaml_scalar(value: str) -> str:
    if _looks_like_number(value):
        return value
    return f'"{_escape_yaml_string(value)}"'


def _looks_like_number(value: str) -> bool:
    try:
        float(value)
    except ValueError:
        return False
    return True


def _escape_yaml_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
