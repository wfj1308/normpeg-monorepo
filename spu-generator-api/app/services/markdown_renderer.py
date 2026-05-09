from __future__ import annotations

from typing import Any, Dict


def render_markdown(spu: Dict[str, Any]) -> str:
    meta = spu.get("meta", {})
    inputs = spu.get("data", {}).get("inputs", [])
    path = spu.get("path", [])
    rules = spu.get("rules", [])

    lines: list[str] = []
    lines.append(f"# {meta.get('name', 'SPU')}")
    lines.append("")
    lines.append("## 规范来源")
    lines.append(f"- 标准：{meta.get('norm', '-')}")
    lines.append(f"- 条款：{meta.get('clause', '-')}")
    lines.append("")
    lines.append("## 适用范围")
    lines.append("- 公路工程路基（土质）压实度检测与评定。")
    lines.append("")
    lines.append("## 检测步骤")
    for step in path:
        lines.append(f"- {step.get('step', '-')}: `{step.get('formula', '-')}`")
    lines.append("")
    lines.append("## 合格标准")
    for rule in rules:
        lines.append(
            f"- {rule.get('field', '-')}{rule.get('operator', '-')}{rule.get('value', '-')}: {rule.get('message', '-')}"
        )
    lines.append("")
    lines.append("## 输入参数")
    for field in inputs:
        lines.append(f"- `{field.get('name', '-')}`: {field.get('label', '-')}")
    lines.append("")
    lines.append("## 系统对接说明")
    lines.append("- 本 SPU 产物可直接用于 SPU Runtime 导入与执行。")
    lines.append("- 推荐通过 specbundle（`spec.md` + `spec.json` + `README.txt`）进行系统间传递。")
    lines.append("")
    return "\n".join(lines)

