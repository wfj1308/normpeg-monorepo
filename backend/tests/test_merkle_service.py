from __future__ import annotations

from backend.app.utils.merkle_service import build_merkle_tree, get_merkle_root, get_proof_path, hash_data, stable_stringify


def test_stable_stringify_matches_frontend_style() -> None:
    payload = {
        "b": [2, 3],
        "a": 1,
        "flag": True,
        "note": "x",
    }
    rendered = stable_stringify(payload)
    assert rendered == '{"a":1,"b":[2,3],"flag":true,"note":x}'


def test_build_merkle_tree_returns_root_and_path() -> None:
    data = ["A", "B", "C"]
    tree = build_merkle_tree(data)
    root = get_merkle_root(tree)
    path = get_proof_path(tree, 2)

    leaves = [hash_data(item) for item in data]
    level1 = [
        hash_data(f"{leaves[0]}:{leaves[1]}"),
        hash_data(f"{leaves[2]}:{leaves[2]}"),
    ]
    expected_root = hash_data(f"{level1[0]}:{level1[1]}")

    assert root == expected_root
    assert len(path) == 2
    assert path[0]["direction"] == "right"
    assert path[1]["direction"] == "left"
