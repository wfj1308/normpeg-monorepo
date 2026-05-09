from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import yaml

from .models import ClauseSemantics, NormSemantics, SpecIRDraft


class SpecIRGenerator:
    """Stage 3: generate SpecIR YAML drafts from extracted semantics."""

    def __init__(self, template_path: Path):
        self.template_path = template_path
        self.max_review_points = 30
        self.max_review_points_per_reason = 6
        if template_path.exists():
            self.templates = yaml.safe_load(template_path.read_text(encoding="utf-8")) or {}
        else:
            self.templates = {}

    def generate(self, semantics: NormSemantics) -> SpecIRDraft:
        specs: List[Dict[str, Any]] = []
        review_points: List[Dict[str, Any]] = []
        if not semantics.clauses:
            placeholder = self._build_placeholder_spec(semantics.standard_code)
            specs.append(placeholder)
            review_points.append(
                {
                    "spec_id": placeholder["spec_id"],
                    "clause_id": "N/A",
                    "priority": "high",
                    "reason": "no_clause_extracted",
                    "confidence": 0.0,
                }
            )

        for clause in semantics.clauses:
            spec = self._build_spec(semantics.standard_code, clause)
            self._validate_spec(spec)
            specs.append(spec)
            review_points.extend(self._build_review_points(clause, spec["spec_id"]))

        yaml_docs = [
            yaml.safe_dump(item, allow_unicode=True, sort_keys=False).strip()
            for item in specs
        ]
        yaml_text = "\n---\n".join(yaml_docs)
        review_points = self._compress_review_points(review_points)

        return SpecIRDraft(
            yaml_text=yaml_text,
            confidence=semantics.avg_confidence,
            review_points=review_points,
            specs=specs,
        )

    def _build_placeholder_spec(self, standard_code: str) -> Dict[str, Any]:
        ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        spec = {
            "spec_id": self._generate_spec_id(standard_code, "manual.review", "measured_value"),
            "type": "manual_review",
            "version": ts,
            "namespace": self._infer_namespace(standard_code),
            "semantics": {
                "name": "Manual Review Required",
                "clause": "N/A",
                "definition": "No reliable clause was extracted from PDF. Human review is required.",
                "standard_reference": standard_code,
                "test_method": "",
                "frequency": "",
            },
            "logic": {
                "inputs": [{"name": "measured_value", "type": "number", "unit": "", "required": True}],
                "path": [{"op": "passthrough", "id": "step_1", "input": "measured_value", "output": "measured_value"}],
                "gate": [
                    {
                        "condition": "manual_review_required",
                        "action": "WARNING",
                        "message": "Automatic extraction failed; review source PDF manually.",
                        "severity": "warning",
                    }
                ],
                "state": self.templates.get("state_machine", {}).get("measured_item", {}),
            },
            "proof": self.templates.get("proof_template", {}),
            "metadata": {
                "author": "NormRef Translation Bot MVP",
                "last_updated": ts,
                "confidence": 0.0,
                "patchable": True,
                "human_review_required": True,
            },
        }
        self._validate_spec(spec)
        return spec

    def _build_spec(self, standard_code: str, clause: ClauseSemantics) -> Dict[str, Any]:
        ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        base = deepcopy(self.templates.get("base", {}))
        state_template = deepcopy(self.templates.get("state_machine", {}).get("measured_item", {}))
        proof_template = deepcopy(self.templates.get("proof_template", {}))

        measured = clause.measured_item or {}
        formulas = clause.formulas or []
        gate_rules = clause.gate_rules or []
        field_key = str(measured.get("field_key") or "measured_value")
        spec_id = self._generate_spec_id(standard_code, clause.clause_id, field_key)

        spec: Dict[str, Any] = {
            "spec_id": spec_id,
            "type": self._infer_component_type(measured),
            "version": ts,
            "namespace": self._infer_namespace(standard_code),
            "semantics": {
                "name": measured.get("name", "Measured Item"),
                "clause": clause.clause_id,
                "definition": measured.get("definition", clause.clause_title),
                "standard_reference": standard_code,
                "test_method": measured.get("test_method", ""),
                "frequency": measured.get("frequency", ""),
            },
            "logic": {
                "inputs": self._generate_inputs(measured),
                "path": self._generate_path(formulas),
                "gate": self._generate_gate(gate_rules),
                "state": state_template or {
                    "initial": "CHECK_PENDING",
                    "transitions": [
                        {"from": "CHECK_PENDING", "on": "PASS", "to": "QUALIFIED"},
                        {"from": "CHECK_PENDING", "on": "BLOCK", "to": "REJECTED"},
                    ],
                    "terminal": ["QUALIFIED", "REJECTED"],
                },
            },
            "proof": proof_template or {
                "anchors": [{"name": "raw_input", "required": True}, {"name": "gate_result", "required": True}],
                "hash": {"algorithm": "sha256"},
            },
            "metadata": {
                "author": "NormRef Translation Bot MVP",
                "last_updated": ts,
                "confidence": clause.confidence,
                "patchable": True,
                "human_review_required": clause.confidence < 0.9,
                "source_clause_title": clause.clause_title,
            },
        }

        if isinstance(base, dict) and base:
            merged = deepcopy(base)
            merged.update(spec)
            return merged
        return spec

    def _generate_spec_id(self, standard_code: str, clause_id: str, field_key: str) -> str:
        std = re.sub(r"[^A-Za-z0-9]+", "_", standard_code).strip("_")
        clause = re.sub(r"[^A-Za-z0-9.]+", "_", clause_id).strip("_")
        field = re.sub(r"[^A-Za-z0-9_]+", "_", field_key).strip("_")
        return f"{std}.{clause}.{field}" if clause else f"{std}.{field}"

    def _infer_component_type(self, measured: Dict[str, Any]) -> str:
        field_key = str(measured.get("field_key", "")).lower()
        if "compaction" in field_key:
            return "compaction"
        if "thickness" in field_key:
            return "thickness"
        if "deflection" in field_key:
            return "deflection"
        if "roughness" in field_key or "iri" in field_key:
            return "roughness"
        return "measured_item"

    def _infer_namespace(self, standard_code: str) -> str:
        upper = standard_code.upper()
        if upper.startswith("JTG"):
            return "cn.mot.highway"
        if upper.startswith("GB"):
            return "cn.gb"
        return "normpeg.default"

    def _generate_inputs(self, measured: Dict[str, Any]) -> List[Dict[str, Any]]:
        params = measured.get("parameters", [])
        if not isinstance(params, list):
            params = []
        inputs: List[Dict[str, Any]] = []
        for item in params:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip() or "measured_value"
            unit = str(item.get("unit", "")).strip()
            inputs.append(
                {
                    "name": name,
                    "type": self._map_type(unit),
                    "unit": unit,
                    "required": bool(item.get("required", True)),
                }
            )
        if not inputs:
            fallback_key = str(measured.get("field_key", "measured_value"))
            inputs.append(
                {
                    "name": fallback_key,
                    "type": self._map_type(str(measured.get("unit", ""))),
                    "unit": str(measured.get("unit", "")),
                    "required": True,
                }
            )
        return inputs

    def _generate_path(self, formulas: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        steps: List[Dict[str, Any]] = []
        for idx, formula in enumerate(formulas, start=1):
            if not isinstance(formula, dict):
                continue
            formula_code = str(formula.get("formula_code", "")).strip()
            output = str(formula.get("output_variable", "")).strip() or f"calc_{idx}"
            if not formula_code:
                continue
            steps.append(
                {
                    "op": "calc",
                    "id": f"step_{idx}",
                    "formula": formula_code,
                    "output": output,
                    "unit": str(formula.get("unit", "")).strip(),
                }
            )
        if len(steps) > 1:
            steps.append(
                {
                    "op": "aggregate",
                    "method": "t_distribution_95",
                    "input": steps[-1]["output"],
                    "output": "representative_value",
                }
            )
        if not steps:
            steps.append({"op": "passthrough", "id": "step_1", "input": "measured_value", "output": "measured_value"})
        return steps

    def _generate_gate(self, rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        gate: List[Dict[str, Any]] = []
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            gate.append(
                {
                    "condition": str(rule.get("condition", "")).strip() or "manual_review_required",
                    "action": str(rule.get("action", "WARNING")).strip().upper(),
                    "message": str(rule.get("message", "Rule evaluation")).strip(),
                    "severity": str(rule.get("severity", "warning")).strip().lower(),
                }
            )
        if not gate:
            gate.append(
                {
                    "condition": "manual_review_required",
                    "action": "WARNING",
                    "message": "No gate rule extracted",
                    "severity": "warning",
                }
            )
        return gate

    def _build_review_points(self, clause: ClauseSemantics, spec_id: str) -> List[Dict[str, Any]]:
        points: List[Dict[str, Any]] = []
        measured_item = clause.measured_item or {}
        is_measurement_clause = bool(measured_item.get("is_measurement_clause", True))
        if not is_measurement_clause:
            return points
        if clause.confidence < 0.9:
            points.append(
                {
                    "spec_id": spec_id,
                    "clause_id": clause.clause_id,
                    "priority": "high" if clause.confidence < 0.75 and is_measurement_clause else "medium",
                    "reason": "low_confidence_extraction",
                    "confidence": clause.confidence,
                }
            )
        if is_measurement_clause and not measured_item.get("standard_value"):
            points.append(
                {
                    "spec_id": spec_id,
                    "clause_id": clause.clause_id,
                    "priority": "high",
                    "reason": "missing_standard_value",
                    "confidence": clause.confidence,
                }
            )
        if not clause.gate_rules:
            points.append(
                {
                    "spec_id": spec_id,
                    "clause_id": clause.clause_id,
                    "priority": "high",
                    "reason": "missing_gate_rules",
                    "confidence": clause.confidence,
                }
            )
        return points

    def _compress_review_points(self, points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not points:
            return []

        deduped: List[Dict[str, Any]] = []
        seen: set[tuple[str, str, str]] = set()
        for item in points:
            key = (
                str(item.get("clause_id", "")),
                str(item.get("priority", "")),
                str(item.get("reason", "")),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        grouped: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
        group_order: List[tuple[str, str]] = []
        for item in deduped:
            group_key = (str(item.get("priority", "medium")), str(item.get("reason", "review_required")))
            if group_key not in grouped:
                grouped[group_key] = []
                group_order.append(group_key)
            grouped[group_key].append(item)

        compressed: List[Dict[str, Any]] = []
        for group_key in group_order:
            entries = grouped[group_key]
            keep = entries[: self.max_review_points_per_reason]
            compressed.extend(keep)
            omitted = len(entries) - len(keep)
            if omitted > 0:
                compressed.append(
                    {
                        "spec_id": keep[0].get("spec_id", "summary"),
                        "clause_id": f"+{omitted} clauses omitted",
                        "priority": group_key[0],
                        "reason": group_key[1],
                        "confidence": keep[0].get("confidence", 0.0),
                    }
                )

        if len(compressed) > self.max_review_points:
            omitted_total = len(compressed) - self.max_review_points
            compressed = compressed[: self.max_review_points]
            compressed.append(
                {
                    "spec_id": "summary",
                    "clause_id": f"+{omitted_total} items omitted",
                    "priority": "medium",
                    "reason": "truncated_review_points",
                    "confidence": 0.0,
                }
            )
        return compressed

    def _map_type(self, unit: str) -> str:
        if unit in {"", "text", "string"}:
            return "number"
        return "number"

    def _validate_spec(self, spec: Dict[str, Any]) -> None:
        required_top = ("spec_id", "type", "version", "namespace", "semantics", "logic", "proof", "metadata")
        for key in required_top:
            if key not in spec:
                raise ValueError(f"spec is missing required key: {key}")
        logic = spec.get("logic", {})
        if not isinstance(logic, dict):
            raise ValueError("logic must be an object")
        for key in ("inputs", "path", "gate", "state"):
            if key not in logic:
                raise ValueError(f"logic is missing required key: {key}")
