from __future__ import annotations

import ast
import re
from typing import Any, Dict, List, Mapping


class ExpressionEngineError(ValueError):
    """Raised when DSL expression parsing or execution fails."""


_ALLOWED_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Attribute,
    ast.Subscript,
    ast.List,
    ast.Tuple,
    ast.Call,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.And,
    ast.Or,
    ast.Not,
    ast.USub,
    ast.UAdd,
    ast.Gt,
    ast.GtE,
    ast.Lt,
    ast.LtE,
    ast.Eq,
)

_ALLOWED_FUNCTIONS = {"exists", "if_", "coalesce"}


def normalize_expression(expression: str) -> str:
    """Normalize DSL tokens to parser-friendly expression."""
    # DSL compatibility: map if(...) to a valid identifier token.
    return re.sub(r"\bif\s*\(", "if_(", expression)


def evaluate_expression(
    expression: str,
    context: Mapping[str, Any],
    *,
    strict_names: bool = False,
) -> Dict[str, Any]:
    """
    Evaluate generic DSL expression (for path formulas and conditions).
    """
    normalized = _parse_and_validate(expression)
    tree = ast.parse(normalized, mode="eval")

    evaluator = _ExpressionEvaluator(context=context, strict_names=strict_names)
    value = evaluator.eval(tree.body)
    return {
        "value": value,
        "trace": evaluator.trace,
        "normalized_expression": normalized,
    }


def evaluate_condition(
    expression: str,
    context: Mapping[str, Any],
    *,
    strict_names: bool = True,
) -> Dict[str, Any]:
    """
    Evaluate condition expression and return deterministic comparison view.

    Returns:
    {
      "result": bool,
      "computed_left": Any,
      "computed_right": Any,
      "trace": list[dict],
      "normalized_expression": str
    }
    """
    normalized = _parse_and_validate(expression)
    tree = ast.parse(normalized, mode="eval")

    evaluator = _ExpressionEvaluator(context=context, strict_names=strict_names)
    value = evaluator.eval(tree.body)
    computed_left, computed_right = _extract_computed_sides(tree.body, context, strict_names)

    return {
        "result": bool(value),
        "computed_left": computed_left,
        "computed_right": computed_right,
        "trace": evaluator.trace,
        "normalized_expression": normalized,
    }


def evaluate_boolean_expression(
    expression: str,
    context: Mapping[str, Any],
    *,
    strict_names: bool = True,
) -> Dict[str, Any]:
    # Backward-compatible alias.
    return evaluate_condition(expression=expression, context=context, strict_names=strict_names)


def _parse_and_validate(expression: str) -> str:
    if not isinstance(expression, str) or not expression.strip():
        raise ExpressionEngineError("expression must be a non-empty string")

    normalized = normalize_expression(expression.strip())
    try:
        tree = ast.parse(normalized, mode="eval")
    except SyntaxError as exc:
        raise ExpressionEngineError(f"invalid expression syntax: {expression}") from exc

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODES):
            raise ExpressionEngineError(f"unsupported expression node: {type(node).__name__}")

        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _ALLOWED_FUNCTIONS:
                raise ExpressionEngineError("unsupported function in expression")

        if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
            raise ExpressionEngineError("unsafe attribute access is not allowed")

        if isinstance(node, ast.Compare):
            for op in node.ops:
                if not isinstance(op, (ast.Gt, ast.GtE, ast.Lt, ast.LtE, ast.Eq)):
                    raise ExpressionEngineError(f"unsupported comparison operator: {type(op).__name__}")

    return normalized


def _extract_computed_sides(
    root: ast.AST,
    context: Mapping[str, Any],
    strict_names: bool,
) -> tuple[Any, Any]:
    if isinstance(root, ast.Compare) and len(root.ops) == 1 and len(root.comparators) == 1:
        left_value = _eval_node_once(root.left, context, strict_names)
        right_value = _eval_node_once(root.comparators[0], context, strict_names)
        return left_value, right_value

    if isinstance(root, ast.BoolOp) and len(root.values) == 2:
        left_value = _eval_node_once(root.values[0], context, strict_names)
        right_value = _eval_node_once(root.values[1], context, strict_names)
        return left_value, right_value

    return None, None


def _eval_node_once(node: ast.AST, context: Mapping[str, Any], strict_names: bool) -> Any:
    evaluator = _ExpressionEvaluator(context=context, strict_names=strict_names)
    return evaluator.eval(node)


class _ExpressionEvaluator:
    def __init__(self, context: Mapping[str, Any], strict_names: bool) -> None:
        self.context = dict(context)
        self.strict_names = strict_names
        self.trace: List[Dict[str, Any]] = []

    def eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant):
            value = node.value
            self._push("constant", node, value)
            return value

        if isinstance(node, ast.Name):
            value = self._resolve_name(node.id)
            self._push("name", node, value, {"identifier": node.id})
            return value

        if isinstance(node, ast.Attribute):
            base = self.eval(node.value)
            value = self._resolve_attribute(base, node.attr)
            self._push("attribute", node, value, {"attribute": node.attr})
            return value

        if isinstance(node, ast.Subscript):
            target = self.eval(node.value)
            key = self.eval(node.slice)
            value = self._resolve_subscript(target, key)
            self._push("subscript", node, value, {"key": key})
            return value

        if isinstance(node, ast.List):
            value = [self.eval(item) for item in node.elts]
            self._push("list", node, value)
            return value

        if isinstance(node, ast.Tuple):
            value = tuple(self.eval(item) for item in node.elts)
            self._push("tuple", node, value)
            return value

        if isinstance(node, ast.BinOp):
            left = self.eval(node.left)
            right = self.eval(node.right)
            value = self._eval_binop(node.op, left, right)
            self._push(
                "binop",
                node,
                value,
                {"operator": type(node.op).__name__, "left": left, "right": right},
            )
            return value

        if isinstance(node, ast.UnaryOp):
            operand = self.eval(node.operand)
            value = self._eval_unary(node.op, operand)
            self._push(
                "unary",
                node,
                value,
                {"operator": type(node.op).__name__, "operand": operand},
            )
            return value

        if isinstance(node, ast.Compare):
            value = self._eval_compare(node)
            self._push("compare", node, value)
            return value

        if isinstance(node, ast.BoolOp):
            value = self._eval_boolop(node)
            self._push("boolop", node, value, {"operator": type(node.op).__name__})
            return value

        if isinstance(node, ast.Call):
            value = self._eval_call(node)
            self._push("call", node, value, {"function": ast.unparse(node.func)})
            return value

        raise ExpressionEngineError(f"unsupported node: {type(node).__name__}")

    def _resolve_name(self, identifier: str) -> Any:
        if identifier in self.context:
            return self.context[identifier]
        if self.strict_names:
            raise ExpressionEngineError(f"name not found in context: {identifier}")
        return None

    @staticmethod
    def _resolve_attribute(base: Any, attr: str) -> Any:
        if isinstance(base, Mapping):
            if attr in base:
                return base[attr]
            raise ExpressionEngineError(f"attribute not found: {attr}")
        if hasattr(base, attr):
            return getattr(base, attr)
        raise ExpressionEngineError(f"attribute not found: {attr}")

    @staticmethod
    def _resolve_subscript(target: Any, key: Any) -> Any:
        if target is None:
            raise ExpressionEngineError("subscript target is None")
        if isinstance(target, Mapping):
            if key in target:
                return target[key]
            raise ExpressionEngineError(f"subscript key not found: {key}")
        if isinstance(target, (list, tuple)):
            if isinstance(key, bool) or not isinstance(key, int):
                raise ExpressionEngineError(f"subscript index must be integer, got: {key}")
            if key < 0 or key >= len(target):
                raise ExpressionEngineError(f"subscript index out of range: {key}")
            return target[key]
        raise ExpressionEngineError(f"subscript is not supported for target type: {type(target).__name__}")

    @staticmethod
    def _eval_binop(op: ast.operator, left: Any, right: Any) -> Any:
        if isinstance(op, ast.Add):
            return _to_number(left) + _to_number(right)
        if isinstance(op, ast.Sub):
            return _to_number(left) - _to_number(right)
        if isinstance(op, ast.Mult):
            return _to_number(left) * _to_number(right)
        if isinstance(op, ast.Div):
            return _to_number(left) / _to_number(right)
        raise ExpressionEngineError(f"unsupported arithmetic operator: {type(op).__name__}")

    @staticmethod
    def _eval_unary(op: ast.unaryop, operand: Any) -> Any:
        if isinstance(op, ast.USub):
            return -_to_number(operand)
        if isinstance(op, ast.UAdd):
            return +_to_number(operand)
        if isinstance(op, ast.Not):
            return not bool(operand)
        raise ExpressionEngineError(f"unsupported unary operator: {type(op).__name__}")

    def _eval_compare(self, node: ast.Compare) -> bool:
        left_value = self.eval(node.left)
        current = left_value
        for op, comparator in zip(node.ops, node.comparators):
            right = self.eval(comparator)
            if isinstance(op, ast.Gt):
                ok = _to_number(current) > _to_number(right)
            elif isinstance(op, ast.GtE):
                ok = _to_number(current) >= _to_number(right)
            elif isinstance(op, ast.Lt):
                ok = _to_number(current) < _to_number(right)
            elif isinstance(op, ast.LtE):
                ok = _to_number(current) <= _to_number(right)
            elif isinstance(op, ast.Eq):
                ok = current == right
            else:
                raise ExpressionEngineError(f"unsupported comparison operator: {type(op).__name__}")
            if not ok:
                return False
            current = right
        return True

    def _eval_boolop(self, node: ast.BoolOp) -> bool:
        if isinstance(node.op, ast.And):
            for value_node in node.values:
                if not bool(self.eval(value_node)):
                    return False
            return True
        if isinstance(node.op, ast.Or):
            for value_node in node.values:
                if bool(self.eval(value_node)):
                    return True
            return False
        raise ExpressionEngineError(f"unsupported bool operator: {type(node.op).__name__}")

    def _eval_call(self, node: ast.Call) -> Any:
        if not isinstance(node.func, ast.Name):
            raise ExpressionEngineError("unsupported function reference")
        fn_name = node.func.id

        if fn_name == "exists":
            if len(node.args) != 1:
                raise ExpressionEngineError("exists() expects exactly 1 argument")
            try:
                arg_value = self.eval(node.args[0])
            except ExpressionEngineError as exc:
                text = str(exc)
                if text.startswith("name not found in context:") or text.startswith("attribute not found:"):
                    return False
                raise
            return arg_value is not None

        if fn_name == "if_":
            if len(node.args) != 3:
                raise ExpressionEngineError("if() expects exactly 3 arguments")
            condition = bool(self.eval(node.args[0]))
            true_value = self.eval(node.args[1])
            false_value = self.eval(node.args[2])
            return true_value if condition else false_value

        if fn_name == "coalesce":
            if len(node.args) == 0:
                raise ExpressionEngineError("coalesce() expects at least 1 argument")
            for arg in node.args:
                try:
                    value = self.eval(arg)
                except ExpressionEngineError as exc:
                    text = str(exc)
                    if (
                        text.startswith("name not found in context:")
                        or text.startswith("attribute not found:")
                        or text.startswith("subscript target is None")
                        or text.startswith("subscript key not found:")
                    ):
                        continue
                    raise
                if value is not None:
                    return value
            return None

        raise ExpressionEngineError(f"unsupported function: {fn_name}")

    def _push(
        self,
        node_type: str,
        node: ast.AST,
        value: Any,
        meta: Dict[str, Any] | None = None,
    ) -> None:
        item: Dict[str, Any] = {
            "node_type": node_type,
            "expression": ast.unparse(node),
            "value": value,
        }
        if meta:
            item["meta"] = meta
        self.trace.append(item)


def _to_number(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ExpressionEngineError(f"value is not numeric: {value}")
    return float(value)
