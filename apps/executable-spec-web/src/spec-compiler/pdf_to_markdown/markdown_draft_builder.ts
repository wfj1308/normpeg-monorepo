import type { ExtractedSpecFields } from "./types.ts";

function buildDependsLines(dependsOn: string[]): string[] {
  if (dependsOn.length === 0) {
    return ["- none"];
  }
  return dependsOn.map((item) => `- ${item}`);
}

function buildInputLines(extracted: ExtractedSpecFields): string[] {
  if (extracted.inputs.length === 0) {
    return ["- inputValue | number | - | 待补充输入参数"];
  }
  return extracted.inputs.map((input) => `- ${input.name} | ${input.type} | ${input.unit || "-"} | ${input.label || input.name}`);
}

function buildOutputLines(extracted: ExtractedSpecFields): string[] {
  if (extracted.outputs.length === 0) {
    return ["- resultValue"];
  }
  return extracted.outputs.map((output) => `- ${output}`);
}

function buildCalculationLines(extracted: ExtractedSpecFields): string[] {
  if (extracted.calculations.length === 0) {
    return ["1. resultValue = inputValue"];
  }
  return extracted.calculations.map((formula, index) => `${index + 1}. ${formula}`);
}

function buildRuleLines(extracted: ExtractedSpecFields): string[] {
  if (extracted.rules.length === 0) {
    return ["- resultValue >= 0 | 规则待人工补充"];
  }
  return extracted.rules.map((rule) => `- ${rule.field} ${rule.operator} ${rule.value} | ${rule.message}`);
}

function buildSignatureLines(extracted: ExtractedSpecFields): string[] {
  if (extracted.signatures.length === 0) {
    return ["- lab", "- supervision"];
  }
  return extracted.signatures.map((role) => `- ${role}`);
}

export function buildDraftMarkdown(extracted: ExtractedSpecFields): string {
  const lines: string[] = [];
  lines.push(`# ${extracted.title || "规范草稿（需人工校对）"}`);
  lines.push("");
  lines.push(`规范来源：${extracted.norm || "UNKNOWN_STANDARD"}`);
  lines.push(`条款号：${extracted.clause || "4.2.1"}`);
  lines.push(`版本：${extracted.version || "v1"}`);
  lines.push(`分类：${extracted.category || "subgrade"}`);
  lines.push(`检测项：${extracted.measuredItem || "generic"}`);
  lines.push("");
  lines.push("## 输入参数");
  lines.push(...buildInputLines(extracted));
  lines.push("");
  lines.push("## 输出参数");
  lines.push(...buildOutputLines(extracted));
  lines.push("");
  lines.push("## 计算步骤");
  lines.push(...buildCalculationLines(extracted));
  lines.push("");
  lines.push("## 判定规则");
  lines.push(...buildRuleLines(extracted));
  lines.push("");
  lines.push("## 签字要求");
  lines.push(...buildSignatureLines(extracted));
  lines.push("");
  lines.push("## 依赖");
  lines.push(...buildDependsLines(extracted.dependsOn));
  lines.push("");
  return lines.join("\n");
}
