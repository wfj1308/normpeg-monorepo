from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
API_APP_DIR = REPO_ROOT / "apps" / "nl2gate-api"
if str(API_APP_DIR) not in sys.path:
    sys.path.insert(0, str(API_APP_DIR))

import main  # noqa: E402


def migrate(input_path: Path, output_path: Path) -> int:
    try:
        src = json.loads(input_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[ERROR] 输入文件不是合法 JSON: {input_path} ({exc})")
        return 2
    if not isinstance(src, dict):
        print("[ERROR] 输入 rulepack 根节点必须是对象")
        return 2

    detected = main._detect_rulepack_schema_version(src)
    if detected not in {"v1", "legacy"}:
        print(f"[ERROR] 仅支持从 v1/legacy 迁移到 v2，当前版本: {detected}")
        return 2

    ok_v1, errs_v1, canonical_v1 = main._validate_rulepack_v1_schema(src)
    if not ok_v1:
        print("[ERROR] 输入 rulepack 不满足 v1 基线，无法迁移:")
        for e in errs_v1[:20]:
            print(f"  - {e}")
        return 2

    migrated = main._migrate_rulepack_v1_to_v2_in_memory(canonical_v1)
    ok_v2, errs_v2, _ = main._validate_rulepack_v2_schema(migrated)
    if not ok_v2:
        print("[ERROR] 迁移后 v2 校验失败:")
        for e in errs_v2[:20]:
            print(f"  - {e}")
        return 2

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(migrated, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] migrated: {input_path} -> {output_path}")
    return 0


def main_cli() -> int:
    parser = argparse.ArgumentParser(description="Migrate rulepack from v1 to v2")
    parser.add_argument("--input", required=True, help="input rulepack json path")
    parser.add_argument("--output", required=True, help="output rulepack json path")
    args = parser.parse_args()
    return migrate(Path(args.input).expanduser().resolve(), Path(args.output).expanduser().resolve())


if __name__ == "__main__":
    raise SystemExit(main_cli())
