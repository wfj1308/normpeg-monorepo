from __future__ import annotations

import hashlib
import json
import math
from typing import Any, Dict, List, Mapping


class MerkleServiceError(ValueError):
    """Raised when merkle tree operations fail."""


def stable_stringify(value: Any) -> str:
    """
    Keep hashing semantics aligned with frontend proof-merkle.ts:
    - string => raw text
    - number/bool => JS-like string
    - array => [item1,item2]
    - object => {"k":v,...} with sorted keys
    """
    if value is None:
        return "null"
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        if value == 0:
            return "0"
        return format(value, ".15g")
    if isinstance(value, list):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if isinstance(value, tuple):
        return "[" + ",".join(stable_stringify(item) for item in value) + "]"
    if isinstance(value, Mapping):
        entries = sorted(((str(k), v) for k, v in value.items()), key=lambda item: item[0])
        rendered = ",".join(f"{json.dumps(key, ensure_ascii=False)}:{stable_stringify(val)}" for key, val in entries)
        return "{" + rendered + "}"
    return json.dumps(value, ensure_ascii=False)


def hash_data(data: Any) -> str:
    text = stable_stringify(data)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_merkle_tree(data_list: List[Any]) -> Dict[str, List[List[str]] | List[str]]:
    leaves = [hash_data(item) for item in data_list]
    if not leaves:
        return {"leaves": [], "levels": [[]]}

    levels: List[List[str]] = [list(leaves)]
    current = list(leaves)
    while len(current) > 1:
        next_level: List[str] = []
        for index in range(0, len(current), 2):
            left = current[index]
            right = current[index + 1] if index + 1 < len(current) else left
            next_level.append(hash_data(f"{left}:{right}"))
        levels.append(next_level)
        current = next_level
    return {"leaves": leaves, "levels": levels}


def get_merkle_root(tree: Mapping[str, Any]) -> str:
    levels = tree.get("levels", [])
    if not isinstance(levels, list) or not levels:
        return ""
    top = levels[-1]
    if not isinstance(top, list) or not top:
        return ""
    first = top[0]
    return str(first) if isinstance(first, str) else ""


def get_proof_path(tree: Mapping[str, Any], index: int) -> List[Dict[str, str]]:
    leaves = tree.get("leaves", [])
    levels = tree.get("levels", [])
    if not isinstance(leaves, list) or not isinstance(levels, list):
        raise MerkleServiceError("invalid merkle tree format")
    if index < 0 or index >= len(leaves):
        raise MerkleServiceError(f"leaf index out of range: {index}")
    if len(leaves) == 0:
        return []

    cursor = index
    path: List[Dict[str, str]] = []
    for level_index in range(0, max(0, len(levels) - 1)):
        level = levels[level_index]
        if not isinstance(level, list) or not level:
            break
        is_right = cursor % 2 == 1
        sibling_index = cursor - 1 if is_right else cursor + 1
        sibling_hash = level[sibling_index] if sibling_index < len(level) else level[cursor]
        path.append(
            {
                "sibling_hash": str(sibling_hash),
                "direction": "left" if is_right else "right",
            }
        )
        cursor = cursor // 2
    return path
