from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, date, timezone
from enum import Enum
import copy
import difflib
import hashlib
import json
import math
import re
from typing import Any, Optional


class CheckType(str, Enum):
    FormulaConsistency = "FormulaConsistency"
    PhysicalConstraint = "PhysicalConstraint"
    NormCompliance = "NormCompliance"


class ConflictResolution(str, Enum):
    Override = "Override"
    Merge = "Merge"
    Reject = "Reject"


@dataclass
class RangeConstraint:
    minimum: float
    maximum: float


@dataclass
class StateSnapshot:
    state_id: str
    recorded_at: datetime
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass
class Patch:
    patch_id: str
    target: str
    replace: Any
    reason: str = ""
    effective: Optional[datetime] = None
    authority: str = ""
    conflict_resolution: ConflictResolution = ConflictResolution.Reject
    signature_hash: str = ""

    def hash(self) -> str:
        payload = {
            "patch_id": self.patch_id,
            "target": self.target,
            "replace": self.replace,
            "reason": self.reason,
            "effective": self.effective.isoformat() if self.effective else None,
            "authority": self.authority,
            "conflict_resolution": self.conflict_resolution.value,
            "signature_hash": self.signature_hash,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")).hexdigest()


@dataclass
class GateContext:
    norm_version: str
    project_overrides: list[Patch] = field(default_factory=list)
    user_context: dict[str, Any] = field(default_factory=dict)
    state_history: list[StateSnapshot] = field(default_factory=list)
    authority_keys: list[str] = field(default_factory=list)
    current_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(frozen=True)
class FieldValue:
    kind: str
    value: Any

    @classmethod
    def String(cls, value: str) -> "FieldValue":
        return cls("String", value)

    @classmethod
    def Number(cls, value: float) -> "FieldValue":
        return cls("Number", float(value))

    @classmethod
    def Boolean(cls, value: bool) -> "FieldValue":
        return cls("Boolean", bool(value))

    @classmethod
    def Array(cls, value: list[Any]) -> "FieldValue":
        return cls("Array", list(value))

    @classmethod
    def Image(cls, value: dict[str, Any]) -> "FieldValue":
        return cls("Image", dict(value))

    @classmethod
    def Computed(cls, value: dict[str, Any]) -> "FieldValue":
        return cls("Computed", dict(value))


@dataclass
class ValidationResult:
    status: str  # Pass / Warning / Block
    message: str = ""
    code: str = ""
    remedy: Optional[str] = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def Pass(cls, **extra: Any) -> "ValidationResult":
        return cls(status="Pass", extra=extra)

    @classmethod
    def Warning(cls, message: str, code: str, remedy: Optional[str] = None, **extra: Any) -> "ValidationResult":
        return cls(status="Warning", message=message, code=code, remedy=remedy, extra=extra)

    @classmethod
    def Block(cls, message: str, code: str, remedy: Optional[str] = None, **extra: Any) -> "ValidationResult":
        return cls(status="Block", message=message, code=code, remedy=remedy, extra=extra)


@dataclass
class FieldDefinition:
    field_id: str
    data_type: str
    required: bool = False
    range: Optional[RangeConstraint] = None
    instrument_link: bool = False
    calibrate_ref: Optional[str] = None
    formula_expr: Optional[str] = None
    critical: bool = False
    gate_check: bool = False
    state_trigger: bool = False


@dataclass
class GateRule:
    rule_id: str
    check_type: CheckType
    target: str
    error_message: str
    severity: str
    action_on_fail: str
    tolerance: float = 0.0
    expression: Optional[str] = None
    operator: Optional[str] = None
    threshold: Optional[float] = None
    allow_override: bool = False
    override_requires: list[Any] = field(default_factory=list)


@dataclass
class InstrumentCert:
    instrument_id: str
    instrument_type: str
    calibration_date: date
    valid_until: date
    calibrated_value: float
    cert_hash: str
    issuer: str


@dataclass
class TableRecord:
    record_id: str
    values: dict[str, FieldValue]

    def get_critical_field_value(self) -> float:
        raw = self.values.get("compaction_degree")
        if not raw or raw.kind != "Number":
            raise ValueError("record missing Number compaction_degree")
        return float(raw.value)


@dataclass
class ParagraphResult:
    representative_value: float
    average: float
    standard_deviation: float
    qualified: bool
    pass_rate: float
    details: list[TableRecord] = field(default_factory=list)


class FormulaEngine:
    """Formula evaluator used by GateEngine."""

    _SAFE_GLOBALS = {
        "__builtins__": {},
        "abs": abs,
        "min": min,
        "max": max,
        "sum": sum,
        "len": len,
        "sqrt": math.sqrt,
    }

    def evaluate(self, expression: str, table_data: dict[str, FieldValue]) -> Any:
        scope: dict[str, Any] = {}
        for key, field_value in table_data.items():
            if isinstance(field_value, FieldValue):
                scope[key] = field_value.value
            else:
                scope[key] = field_value
        return eval(expression, self._SAFE_GLOBALS, scope)  # noqa: S307


class GateEngine:
    """
    GateEngine keeps the same layered responsibility used in the document:
    - field-level checks
    - cross-field checks
    - paragraph-level representative checks
    - incremental update pipeline
    - term normalization
    """

    def __init__(
        self,
        field_definitions: Optional[dict[str, FieldDefinition]] = None,
        rules: Optional[list[GateRule]] = None,
        term_map: Optional[dict[str, str]] = None,
        formula_engine: Optional[FormulaEngine] = None,
        instrument_registry: Optional[dict[str, InstrumentCert]] = None,
    ) -> None:
        self.field_definitions: dict[str, FieldDefinition] = field_definitions or self._default_field_definitions()
        self.rule_cache: dict[str, GateRule] = {}
        for rule in (rules or self._default_rules()):
            self.rule_cache[rule.rule_id] = rule
        self.term_map: dict[str, str] = term_map or self._default_term_map()
        self.formula_engine: FormulaEngine = formula_engine or FormulaEngine()
        self.instrument_registry: dict[str, InstrumentCert] = instrument_registry or self._default_instrument_registry()
        # MINIMAL_COMPLETION: contextual map is not explicit in the document, kept as extension point.
        self.contextual_term_map: dict[str, dict[str, str]] = {}

    def validate_field(self, field_id: str, value: FieldValue, context: GateContext) -> ValidationResult:
        field_def = self.get_field_definition(field_id)
        if field_def is None:
            # MINIMAL_COMPLETION: unknown field is tolerated to keep runtime non-breaking.
            return ValidationResult.Warning(
                message=f"unknown field {field_id}",
                code="FIELD_NOT_REGISTERED",
            )

        if not self.check_type_match(value, field_def.data_type):
            return ValidationResult.Block(
                message=f"field {field_id} type mismatch",
                code="TYPE_MISMATCH",
            )

        if value.kind == "Number" and field_def.range:
            numeric = float(value.value)
            if numeric < field_def.range.minimum or numeric > field_def.range.maximum:
                return ValidationResult.Block(
                    message=f"{field_id} out of range [{field_def.range.minimum:.3f}, {field_def.range.maximum:.3f}]",
                    code="OUT_OF_RANGE",
                    remedy="adjust_to_valid_range",
                )

        if field_def.instrument_link and field_def.calibrate_ref:
            if not self.verify_instrument_valid(field_def.calibrate_ref, context):
                return ValidationResult.Block(
                    message="instrument calibration invalid or expired",
                    code="INSTRUMENT_INVALID",
                    remedy="recalibrate_instrument",
                )

        if value.kind == "String":
            normalized = self.normalize_term(str(value.value), domain=field_id)
            if normalized != value.value:
                return ValidationResult.Warning(
                    message=f"term normalized: {value.value} -> {normalized}",
                    code="TERM_NORMALIZED",
                    remedy="confirm_standard_term",
                )

        return ValidationResult.Pass(field_id=field_id)

    def validate_cross_field(
        self,
        table_data: dict[str, FieldValue],
        context: GateContext,
    ) -> list[ValidationResult]:
        results: list[ValidationResult] = []
        rules = self.get_cross_field_rules(context.norm_version)

        for rule in rules:
            if rule.check_type == CheckType.FormulaConsistency:
                computed = self.compute_field(rule.target, table_data)
                input_value = self.as_number(table_data.get(rule.target))
                if computed is None or input_value is None:
                    continue
                tolerance = max(rule.tolerance, 1e-6)
                if abs(computed - input_value) > tolerance:
                    results.append(
                        ValidationResult.Block(
                            message=f"formula mismatch on {rule.target}: {computed:.6f} vs {input_value:.6f}",
                            code="FORMULA_MISMATCH",
                            remedy="use_computed_value",
                            rule_id=rule.rule_id,
                        )
                    )

            elif rule.check_type == CheckType.PhysicalConstraint:
                if not rule.expression:
                    continue
                ok = self.evaluate_boolean_expression(rule.expression, table_data)
                if not ok:
                    results.append(
                        ValidationResult.Warning(
                            message=rule.error_message,
                            code=rule.rule_id,
                            remedy="review_physical_inputs",
                        )
                    )

            elif rule.check_type == CheckType.NormCompliance:
                results.append(self.check_norm_compliance(rule, table_data, context))

        return results

    def validate_paragraph(
        self,
        records: list[TableRecord],
        context: GateContext,
    ) -> ParagraphResult:
        values = [record.get_critical_field_value() for record in records]
        if not values:
            # MINIMAL_COMPLETION: keep empty paragraph deterministic.
            return ParagraphResult(
                representative_value=0.0,
                average=0.0,
                standard_deviation=0.0,
                qualified=False,
                pass_rate=0.0,
                details=[],
            )

        average = sum(values) / float(len(values))
        std_dev = self.calculate_std(values, average)
        n = float(len(values))
        t_value = self.t_distribution_95(max(int(n) - 1, 1))
        representative_value = average - t_value * std_dev / math.sqrt(n)

        threshold = self.get_representative_threshold(context)
        is_qualified = representative_value >= threshold

        min_value = min(values)
        min_threshold = threshold * 0.95
        min_pass = min_value >= min_threshold

        pass_rate = self.calculate_pass_rate(values, threshold)
        return ParagraphResult(
            representative_value=representative_value,
            average=average,
            standard_deviation=std_dev,
            qualified=is_qualified and min_pass,
            pass_rate=pass_rate,
            details=records,
        )

    def apply_incremental_update(
        self,
        base_norm: dict[str, Any],
        patches: list[Patch],
        context: GateContext,
    ) -> dict[str, Any]:
        updated = copy.deepcopy(base_norm)
        lineage = updated.setdefault("lineage", [])
        if not isinstance(lineage, list):
            raise ValueError("lineage must be a list")

        for patch in patches:
            if not self.verify_patch_signature(patch, context.authority_keys):
                raise ValueError("invalid patch signature")

            if not self.is_patch_effective(patch, context.current_time):
                continue

            conflict = self.detect_conflict(updated, patch)
            if conflict is not None:
                if patch.conflict_resolution == ConflictResolution.Override:
                    self.apply_override(updated, patch)
                elif patch.conflict_resolution == ConflictResolution.Merge:
                    self.apply_merge(updated, patch, conflict)
                elif patch.conflict_resolution == ConflictResolution.Reject:
                    raise ValueError(f"patch conflict: {conflict}")
            else:
                self.apply_patch(updated, patch)

            lineage.append(patch.hash())

        self.rebuild_gate_index(updated)
        return updated

    def normalize_term(self, input_text: str, domain: str) -> str:
        exact = self.term_map.get(input_text)
        if exact:
            return exact

        if self.term_map:
            candidates = difflib.get_close_matches(input_text, list(self.term_map.keys()), n=1, cutoff=0.7)
            if len(candidates) == 1:
                return self.term_map[candidates[0]]

        domain_map = self.contextual_term_map.get(domain, {})
        mapped = domain_map.get(input_text)
        if mapped:
            return mapped

        return input_text

    def t_distribution_95(self, degrees_of_freedom: int) -> float:
        table = {
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
            11: 2.201,
            12: 2.179,
            13: 2.160,
            14: 2.145,
            15: 2.131,
            16: 2.120,
            17: 2.110,
            18: 2.101,
            19: 2.093,
            20: 2.086,
            21: 2.080,
            22: 2.074,
            23: 2.069,
            24: 2.064,
            25: 2.060,
            26: 2.056,
            27: 2.052,
            28: 2.048,
            29: 2.045,
            30: 2.042,
        }
        if degrees_of_freedom <= 0:
            return table[1]
        if degrees_of_freedom in table:
            return table[degrees_of_freedom]
        # MINIMAL_COMPLETION: normal approximation for dof > 30.
        return 1.960

    def get_field_definition(self, field_id: str) -> Optional[FieldDefinition]:
        return self.field_definitions.get(field_id)

    def check_type_match(self, value: FieldValue, data_type: str) -> bool:
        mapping = {
            "String": "String",
            "StakeRange": "String",
            "Number": "Number",
            "Computed": "Number",
            "Boolean": "Boolean",
            "ImageArray": "Array",
        }
        expected = mapping.get(data_type, data_type)
        return value.kind == expected

    def verify_instrument_valid(self, cert_id: str, context: GateContext) -> bool:
        cert = self.instrument_registry.get(cert_id)
        if cert is None:
            return False
        current_date = context.current_time.date()
        return cert.calibration_date <= current_date <= cert.valid_until

    def get_cross_field_rules(self, norm_version: str) -> list[GateRule]:
        # MINIMAL_COMPLETION: no version split table in document sample, use in-memory rule cache.
        del norm_version
        return list(self.rule_cache.values())

    def compute_field(self, target: str, table_data: dict[str, FieldValue]) -> Optional[float]:
        field_def = self.get_field_definition(target)
        if field_def is None or not field_def.formula_expr:
            return None
        try:
            computed = self.formula_engine.evaluate(field_def.formula_expr, table_data)
        except Exception:  # noqa: BLE001
            # MINIMAL_COMPLETION: allow partial input payloads (e.g. NL2Gate shorthand)
            # to skip formula-consistency rules that lack required variables.
            return None
        try:
            return float(computed)
        except (TypeError, ValueError):
            return None

    def evaluate_boolean_expression(self, expression: str, table_data: dict[str, FieldValue]) -> bool:
        try:
            result = self.formula_engine.evaluate(expression, table_data)
            return bool(result)
        except Exception:  # noqa: BLE001
            # MINIMAL_COMPLETION: skip physical-constraint expression when dependencies are missing.
            return True

    def check_norm_compliance(
        self,
        rule: GateRule,
        table_data: dict[str, FieldValue],
        context: GateContext,
    ) -> ValidationResult:
        if rule.target == "compaction_degree":
            value = self.as_number(table_data.get("compaction_degree"))
            if value is None:
                return ValidationResult.Block(
                    message="missing compaction_degree for compliance check",
                    code="MISSING_COMPACTION",
                    rule_id=rule.rule_id,
                )

            threshold = self.resolve_compaction_threshold(table_data, context)
            if value >= threshold:
                return ValidationResult.Pass(rule_id=rule.rule_id, threshold=threshold, actual=value)

            if rule.allow_override:
                return ValidationResult.Block(
                    message=rule.error_message,
                    code=rule.rule_id,
                    remedy="override_requires_approval",
                    threshold=threshold,
                    actual=value,
                    AllowOverride=True,
                    OverrideRequires=rule.override_requires,
                )

            return ValidationResult.Block(
                message=rule.error_message,
                code=rule.rule_id,
                threshold=threshold,
                actual=value,
            )

        # MINIMAL_COMPLETION: only compaction norm-compliance is materialized in this first version.
        return ValidationResult.Pass(rule_id=rule.rule_id)

    def resolve_compaction_threshold(
        self,
        table_data: dict[str, FieldValue],
        context: GateContext,
    ) -> float:
        road_class = self.as_string(table_data.get("road_class"), fallback="class_2")
        layer_position = self.as_string(table_data.get("layer_position"), fallback="subbase")

        if road_class in {"expressway", "class_1"} and layer_position == "subbase":
            threshold = 96.0
        else:
            threshold = 95.0

        for override in context.project_overrides:
            if override.target == "compaction_degree_threshold":
                candidate = self._number_from_override(override.replace)
                if candidate is not None:
                    threshold = candidate

        return threshold

    def calculate_std(self, values: list[float], average: float) -> float:
        if len(values) <= 1:
            return 0.0
        variance = sum((v - average) ** 2 for v in values) / float(len(values) - 1)
        return math.sqrt(variance)

    def get_representative_threshold(self, context: GateContext) -> float:
        threshold = 95.0
        for override in context.project_overrides:
            if override.target == "representative_compaction_threshold":
                candidate = self._number_from_override(override.replace)
                if candidate is not None:
                    threshold = candidate
        return threshold

    def calculate_pass_rate(self, values: list[float], threshold: float) -> float:
        if not values:
            return 0.0
        passed = sum(1 for value in values if value >= threshold)
        return passed / float(len(values))

    def verify_patch_signature(self, patch: Patch, authority_keys: list[str]) -> bool:
        # MINIMAL_COMPLETION: signature verification algorithm is not provided in the document.
        # Keep deterministic gate: require signature_hash and authority when authority list is provided.
        if not patch.signature_hash:
            return False
        if authority_keys and patch.authority not in authority_keys:
            return False
        return True

    def is_patch_effective(self, patch: Patch, current_time: datetime) -> bool:
        if patch.effective is None:
            return True
        return patch.effective <= current_time

    def detect_conflict(self, norm_doc: dict[str, Any], patch: Patch) -> Optional[dict[str, Any]]:
        current = self._read_path(norm_doc, patch.target)
        if current is None:
            return None
        if current == patch.replace:
            return None
        return {"target": patch.target, "current": current, "incoming": patch.replace}

    def apply_override(self, norm_doc: dict[str, Any], patch: Patch) -> None:
        self._write_path(norm_doc, patch.target, patch.replace)

    def apply_merge(self, norm_doc: dict[str, Any], patch: Patch, conflict: dict[str, Any]) -> None:
        del conflict
        current = self._read_path(norm_doc, patch.target)
        if isinstance(current, dict) and isinstance(patch.replace, dict):
            merged = dict(current)
            merged.update(patch.replace)
            self._write_path(norm_doc, patch.target, merged)
            return
        # MINIMAL_COMPLETION: fallback merge strategy when non-dict payload appears.
        self._write_path(norm_doc, patch.target, patch.replace)

    def apply_patch(self, norm_doc: dict[str, Any], patch: Patch) -> None:
        self._write_path(norm_doc, patch.target, patch.replace)

    def rebuild_gate_index(self, norm_doc: dict[str, Any]) -> None:
        norm_doc["gate_index_built_at"] = datetime.now(timezone.utc).isoformat()

    def as_number(self, field_value: Optional[FieldValue]) -> Optional[float]:
        if field_value is None:
            return None
        if field_value.kind != "Number":
            return None
        try:
            return float(field_value.value)
        except (TypeError, ValueError):
            return None

    def as_string(self, field_value: Optional[FieldValue], fallback: str) -> str:
        if field_value is None:
            return fallback
        if field_value.kind != "String":
            return fallback
        return str(field_value.value)

    def _read_path(self, payload: dict[str, Any], dotted_path: str) -> Any:
        node: Any = payload
        for segment in dotted_path.split("."):
            if not isinstance(node, dict) or segment not in node:
                return None
            node = node[segment]
        return node

    def _write_path(self, payload: dict[str, Any], dotted_path: str, value: Any) -> None:
        node: dict[str, Any] = payload
        parts = dotted_path.split(".")
        for segment in parts[:-1]:
            next_node = node.get(segment)
            if not isinstance(next_node, dict):
                next_node = {}
                node[segment] = next_node
            node = next_node
        node[parts[-1]] = value

    def _number_from_override(self, value: Any) -> Optional[float]:
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, dict):
            if "threshold" in value and isinstance(value["threshold"], (int, float)):
                return float(value["threshold"])
            if "value" in value and isinstance(value["value"], (int, float)):
                return float(value["value"])
        return None

    def _default_field_definitions(self) -> dict[str, FieldDefinition]:
        return {
            "sand_density": FieldDefinition(
                field_id="sand_density",
                data_type="Number",
                required=True,
                range=RangeConstraint(1.200, 1.600),
                instrument_link=True,
                calibrate_ref="SB_2024_001",
            ),
            "wet_density": FieldDefinition(
                field_id="wet_density",
                data_type="Computed",
                formula_expr="(mass_hole_sand / sand_density) / volume_ring",
            ),
            "moisture_content": FieldDefinition(
                field_id="moisture_content",
                data_type="Number",
                required=True,
                range=RangeConstraint(0.0, 30.0),
            ),
            "dry_density": FieldDefinition(
                field_id="dry_density",
                data_type="Computed",
                formula_expr="wet_density / (1 + moisture_content / 100)",
            ),
            "max_dry_density": FieldDefinition(
                field_id="max_dry_density",
                data_type="Number",
                required=True,
            ),
            "compaction_degree": FieldDefinition(
                field_id="compaction_degree",
                data_type="Computed",
                formula_expr="dry_density / max_dry_density * 100",
                critical=True,
                gate_check=True,
                state_trigger=True,
            ),
            "road_class": FieldDefinition(
                field_id="road_class",
                data_type="String",
            ),
            "layer_position": FieldDefinition(
                field_id="layer_position",
                data_type="String",
            ),
        }

    def _default_rules(self) -> list[GateRule]:
        return [
            GateRule(
                rule_id="rule_formula_wet_density",
                check_type=CheckType.FormulaConsistency,
                target="wet_density",
                error_message="wet_density formula mismatch",
                severity="Blocking",
                action_on_fail="BlockSubmit",
                tolerance=0.001,
            ),
            GateRule(
                rule_id="rule_formula_dry_density",
                check_type=CheckType.FormulaConsistency,
                target="dry_density",
                error_message="dry_density formula mismatch",
                severity="Blocking",
                action_on_fail="BlockSubmit",
                tolerance=0.001,
            ),
            GateRule(
                rule_id="rule_data_consistency",
                check_type=CheckType.PhysicalConstraint,
                target="dry_density",
                expression="dry_density <= wet_density * 1.05",
                error_message="dry_density should not significantly exceed wet_density",
                severity="Warning",
                action_on_fail="FlagReview",
            ),
            GateRule(
                rule_id="rule_compaction_standard",
                check_type=CheckType.NormCompliance,
                target="compaction_degree",
                error_message="compaction below required threshold",
                severity="Blocking",
                action_on_fail="BlockSubmit",
                allow_override=True,
                override_requires=[
                    {"Role": "ChiefEngineer", "SignatureType": "Digital"},
                    {"Evidence": "Photo", "Description": "retest_photo"},
                ],
            ),
        ]

    def _default_term_map(self) -> dict[str, str]:
        return {
            "shuiwen": "cement_stabilized_crushed_stone_base",
            "yasidu_daibiaozhi": "lower_confidence_bound",
            "jizhi": "minimum_single_point_value",
        }

    def _default_instrument_registry(self) -> dict[str, InstrumentCert]:
        return {
            "SB_2024_001": InstrumentCert(
                instrument_id="SB_2024_001",
                instrument_type="sand_bottle",
                calibration_date=date(2024, 3, 1),
                valid_until=date(2026, 9, 1),
                calibrated_value=1.456,
                cert_hash="ABCD1234",
                issuer="provincial_test_center",
            ),
        }


def _build_compaction_sample_table() -> dict[str, FieldValue]:
    return {
        "mass_hole_sand": FieldValue.Number(2850.5),
        "sand_density": FieldValue.Number(1.456),
        "volume_ring": FieldValue.Number(2000.0),
        "moisture_content": FieldValue.Number(8.5),
        "wet_density": FieldValue.Number((2850.5 / 1.456) / 2000.0),
        "dry_density": FieldValue.Number(((2850.5 / 1.456) / 2000.0) / (1 + 8.5 / 100.0)),
        "max_dry_density": FieldValue.Number(2.35),
        "compaction_degree": FieldValue.Number(
            ((((2850.5 / 1.456) / 2000.0) / (1 + 8.5 / 100.0)) / 2.35) * 100.0
        ),
        "road_class": FieldValue.String("expressway"),
        "layer_position": FieldValue.String("subbase"),
    }


if __name__ == "__main__":
    engine = GateEngine()
    context = GateContext(
        norm_version="JTG_3450_2019.T0921",
        authority_keys=["Ministry_of_Transport"],
    )

    table = _build_compaction_sample_table()
    sand_result = engine.validate_field("sand_density", table["sand_density"], context)
    print("validate_field(sand_density):", sand_result)

    cross_results = engine.validate_cross_field(table, context)
    print("validate_cross_field:", cross_results)

    record = TableRecord(record_id="REC_001", values=table)
    paragraph = engine.validate_paragraph([record], context)
    print("validate_paragraph:", paragraph)
