from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict


def formula_ast_schema() -> Dict[str, Any]:
    return {
        "schema_id": "formula.ast.v1",
        "node_types": ["assignment", "binary_op", "identifier", "number"],
        "binary_ops": ["+", "-", "*", "/", "^"],
    }


def parse_formula(*, clause: str, formula_text: str) -> Dict[str, Any]:
    expr = str(formula_text or "").strip()
    assignment = _parse_assignment(expr)
    output = assignment["output"]
    rhs = assignment["rhs"]
    inputs = _extract_identifiers(rhs)
    ast = _build_ast(output, rhs)
    unit_mapping = _infer_units(clause=clause, formula_text=expr, output=output, inputs=inputs)
    return {
        "formula_parser": {
            "name": "formula_intelligence_v1",
            "capabilities": ["formula_detect", "variable_extract", "io_infer", "unit_infer"],
        },
        "ast_schema": formula_ast_schema(),
        "runtime_integration": {
            "runtime_formula_executor": _build_runtime_executor(output, rhs, inputs),
            "slot_dependency": {
                "output_slot": output,
                "input_slots": inputs,
                "edges": [{"from": name, "to": output, "relation": "depends_on"} for name in inputs],
            },
        },
        "formula_latex": _to_latex(expr),
        "formula_ast": ast,
        "inputs": [{"name": name, "slotKey": name, "unit": unit_mapping.get(name, "")} for name in inputs],
        "output": {"name": output, "slotKey": output, "unit": unit_mapping.get(output, "")},
        "unit_mapping": unit_mapping,
        "meta": {"generated_at": _now()},
    }


def _parse_assignment(expr: str) -> Dict[str, str]:
    if "=" in expr:
        left, right = [p.strip() for p in expr.split("=", 1)]
        return {"output": left or "result", "rhs": right or "0"}
    return {"output": "result", "rhs": expr or "0"}


def _extract_identifiers(rhs: str) -> list[str]:
    tokens = re.findall(r"[A-Za-z_][A-Za-z0-9_]*", rhs)
    deny = {"pow", "min", "max", "abs"}
    out: list[str] = []
    for t in tokens:
        if t in deny:
            continue
        if t not in out:
            out.append(t)
    return out


def _build_ast(output: str, rhs: str) -> Dict[str, Any]:
    # Lightweight AST for explainability/runtime generation.
    return {
        "type": "assignment",
        "left": {"type": "identifier", "name": output},
        "right": _parse_binary(rhs),
    }


def _parse_binary(expr: str) -> Dict[str, Any]:
    s = expr.strip()
    for op in ["+", "-"]:
        idx = _find_top_level_op(s, op)
        if idx > 0:
            return {
                "type": "binary_op",
                "op": op,
                "left": _parse_binary(s[:idx]),
                "right": _parse_binary(s[idx + 1 :]),
            }
    for op in ["*", "/"]:
        idx = _find_top_level_op(s, op)
        if idx > 0:
            return {
                "type": "binary_op",
                "op": op,
                "left": _parse_binary(s[:idx]),
                "right": _parse_binary(s[idx + 1 :]),
            }
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", s):
        return {"type": "number", "value": float(s)}
    return {"type": "identifier", "name": s}


def _find_top_level_op(expr: str, op: str) -> int:
    depth = 0
    for i in range(len(expr) - 1, -1, -1):
        ch = expr[i]
        if ch == ")":
            depth += 1
        elif ch == "(":
            depth -= 1
        elif depth == 0 and ch == op:
            return i
    return -1


def _to_latex(expr: str) -> str:
    return expr.replace("*", r" \cdot ").replace(">=", r"\geq ").replace("<=", r"\leq ")


def _infer_units(*, clause: str, formula_text: str, output: str, inputs: list[str]) -> Dict[str, str]:
    text = f"{clause} {formula_text}"
    mapping: Dict[str, str] = {}
    if "%" in text or "％" in text:
        if "compaction" in output.lower() or "degree" in output.lower():
            mapping[output] = "%"
        for name in inputs:
            if "moisture" in name.lower():
                mapping[name] = "%"
    if "mm" in text.lower():
        mapping.setdefault(output, "mm")
    return mapping


def _build_runtime_executor(output: str, rhs: str, inputs: list[str]) -> Dict[str, Any]:
    return {
        "executor_id": f"formula_exec:{output}",
        "language": "python_expr_v1",
        "input_slots": inputs,
        "output_slot": output,
        "expression": rhs,
        "generated_code": f"def run(inputs):\n    return {{'{output}': {rhs}}}",
    }


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

