#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

TEXT_EXTS = {
    ".md",
    ".json",
    ".yaml",
    ".yml",
    ".txt",
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".toml",
    ".ini",
    ".cfg",
    ".html",
    ".css",
    ".sh",
    ".ps1",
}

SKIP_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
}


def _should_process(path: Path) -> bool:
    if path.suffix.lower() not in TEXT_EXTS:
        return False
    parts = set(path.parts)
    if parts & SKIP_DIRS:
        return False
    return True


def _sanitize(text: str) -> str:
    # Replace repeated unknown placeholders and replacement chars with explicit markers.
    out = re.sub(r"\?{3,}", "[UNRESOLVED]", text)
    out = out.replace("\ufffd", "[INVALID_CHAR]")
    return out


def main() -> int:
    changed = 0
    for p in ROOT.rglob("*"):
        if not p.is_file() or not _should_process(p):
            continue
        try:
            content = p.read_text(encoding="utf-8-sig")
        except Exception:
            continue
        fixed = _sanitize(content)
        if fixed != content:
            p.write_text(fixed, encoding="utf-8")
            changed += 1
    print(changed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
