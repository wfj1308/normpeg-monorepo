import type { DraftSectionName } from "./markdown_section_parser.ts";

export type DraftDiffRiskLevel = "high" | "medium" | "low";
type DraftSectionChangeType = "added" | "removed" | "modified";

const HIGH_RISK_SECTIONS = new Set<DraftSectionName>(["规范来源", "条款号", "计算步骤", "判定规则", "依赖"]);
const MEDIUM_RISK_SECTIONS = new Set<DraftSectionName>(["输入参数", "输出参数", "签字要求"]);

export function classifySectionRisk(sectionName: DraftSectionName): DraftDiffRiskLevel {
  if (HIGH_RISK_SECTIONS.has(sectionName)) {
    return "high";
  }
  if (MEDIUM_RISK_SECTIONS.has(sectionName)) {
    return "medium";
  }
  return "low";
}

export function buildSectionRiskMessage(
  sectionName: DraftSectionName,
  changeType: DraftSectionChangeType,
  riskLevel: DraftDiffRiskLevel,
): string {
  const action = changeType === "added" ? "新增" : changeType === "removed" ? "删除" : "修改";

  if (sectionName === "判定规则") {
    return `判定规则被${action}，可能影响 Gate 执行结果`;
  }
  if (sectionName === "计算步骤") {
    return `计算步骤被${action}，可能影响 ExecPeg 计算结果`;
  }
  if (sectionName === "条款号" || sectionName === "规范来源") {
    return `${sectionName}被${action}，请核对规范依据是否正确`;
  }
  if (sectionName === "依赖") {
    return "依赖关系发生变化，请确认执行前置条件";
  }

  if (riskLevel === "high") {
    return `${sectionName}发生${action}，请重点复核`;
  }
  if (riskLevel === "medium") {
    return `${sectionName}发生${action}，建议复核`;
  }
  return `${sectionName}发生${action}，影响较低`;
}
