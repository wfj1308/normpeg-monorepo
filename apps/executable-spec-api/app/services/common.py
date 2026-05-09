from __future__ import annotations

import ast
import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable


ALLOWED_AST_NODES = (
    ast.Expression,
    ast.BinOp,
    ast.UnaryOp,
    ast.BoolOp,
    ast.Compare,
    ast.Name,
    ast.Load,
    ast.Constant,
    ast.Add,
    ast.Sub,
    ast.Mult,
    ast.Div,
    ast.Pow,
    ast.Mod,
    ast.And,
    ast.Or,
    ast.USub,
    ast.UAdd,
    ast.Gt,
    ast.GtE,
    ast.Lt,
    ast.LtE,
    ast.Eq,
    ast.NotEq,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: Dict[str, Any] | list[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def deepcopy_dict(payload: Dict[str, Any]) -> Dict[str, Any]:
    return copy.deepcopy(payload)


def safe_eval_expression(expression: str, context: Dict[str, Any]) -> Any:
    tree = ast.parse(expression, mode="eval")
    for node in ast.walk(tree):
        if not isinstance(node, ALLOWED_AST_NODES):
            raise ValueError(f"Unsupported expression node: {type(node).__name__}")
    compiled = compile(tree, filename="<gate_or_path>", mode="eval")
    return eval(compiled, {"__builtins__": {}}, context)


def get_by_path(payload: Dict[str, Any], dotted_path: str) -> Any:
    cursor: Any = payload
    for segment in dotted_path.split("."):
        if not isinstance(cursor, dict) or segment not in cursor:
            raise KeyError(f"Path not found: {dotted_path}")
        cursor = cursor[segment]
    return cursor


def set_by_path(payload: Dict[str, Any], dotted_path: str, value: Any) -> None:
    parts = dotted_path.split(".")
    cursor: Dict[str, Any] = payload
    for segment in parts[:-1]:
        next_obj = cursor.get(segment)
        if not isinstance(next_obj, dict):
            next_obj = {}
            cursor[segment] = next_obj
        cursor = next_obj
    cursor[parts[-1]] = value


def stable_hash(payload: Dict[str, Any], include_paths: Iterable[str] | None = None) -> str:
    if include_paths:
        filtered: Dict[str, Any] = {}
        for p in include_paths:
            filtered[p] = get_by_path(payload, p)
        body = json.dumps(filtered, ensure_ascii=False, sort_keys=True).encode("utf-8")
    else:
        body = json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return hashlib.sha256(body).hexdigest()
