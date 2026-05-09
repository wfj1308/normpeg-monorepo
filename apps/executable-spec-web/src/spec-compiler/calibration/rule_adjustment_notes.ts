import type { RuleConfig } from "./rule_config.ts";

export interface RuleAdjustmentNote {
  area: "risk" | "diff" | "clause" | "gate";
  before: string;
  after: string;
  reason: string;
}

function listValue(values: string[]): string {
  return values.join(", ");
}

export function buildRuleAdjustmentNotes(before: RuleConfig, after: RuleConfig, reasonPrefix = ""): RuleAdjustmentNote[] {
  const notes: RuleAdjustmentNote[] = [];
  const reasonLead = reasonPrefix ? `${reasonPrefix}：` : "";

  if (listValue(before.risk.highRiskWarnings) !== listValue(after.risk.highRiskWarnings)) {
    notes.push({
      area: "risk",
      before: `highRiskWarnings = [${listValue(before.risk.highRiskWarnings)}]`,
      after: `highRiskWarnings = [${listValue(after.risk.highRiskWarnings)}]`,
      reason: `${reasonLead}按校准结果更新 high 风险 warning 映射`,
    });
  }
  if (listValue(before.risk.mediumRiskWarnings) !== listValue(after.risk.mediumRiskWarnings)) {
    notes.push({
      area: "risk",
      before: `mediumRiskWarnings = [${listValue(before.risk.mediumRiskWarnings)}]`,
      after: `mediumRiskWarnings = [${listValue(after.risk.mediumRiskWarnings)}]`,
      reason: `${reasonLead}按校准结果更新 medium 风险 warning 映射`,
    });
  }

  if (listValue(before.diff.highRiskSections) !== listValue(after.diff.highRiskSections)) {
    notes.push({
      area: "diff",
      before: `highRiskSections = [${listValue(before.diff.highRiskSections)}]`,
      after: `highRiskSections = [${listValue(after.diff.highRiskSections)}]`,
      reason: `${reasonLead}按真实样本调整高风险 diff 章节`,
    });
  }
  if (listValue(before.diff.mediumRiskSections) !== listValue(after.diff.mediumRiskSections)) {
    notes.push({
      area: "diff",
      before: `mediumRiskSections = [${listValue(before.diff.mediumRiskSections)}]`,
      after: `mediumRiskSections = [${listValue(after.diff.mediumRiskSections)}]`,
      reason: `${reasonLead}按真实样本调整中风险 diff 章节`,
    });
  }

  if (listValue(before.clause.requiredHighRiskSections) !== listValue(after.clause.requiredHighRiskSections)) {
    notes.push({
      area: "clause",
      before: `requiredHighRiskSections = [${listValue(before.clause.requiredHighRiskSections)}]`,
      after: `requiredHighRiskSections = [${listValue(after.clause.requiredHighRiskSections)}]`,
      reason: `${reasonLead}按校准结果收紧或放松 required 高风险条款`,
    });
  }
  if (listValue(before.clause.optionalMediumRiskSections) !== listValue(after.clause.optionalMediumRiskSections)) {
    notes.push({
      area: "clause",
      before: `optionalMediumRiskSections = [${listValue(before.clause.optionalMediumRiskSections)}]`,
      after: `optionalMediumRiskSections = [${listValue(after.clause.optionalMediumRiskSections)}]`,
      reason: `${reasonLead}按校准结果调整 optional 中风险条款`,
    });
  }

  if (before.gate.warnOnHighRiskDiff !== after.gate.warnOnHighRiskDiff) {
    notes.push({
      area: "gate",
      before: `warnOnHighRiskDiff = ${String(before.gate.warnOnHighRiskDiff)}`,
      after: `warnOnHighRiskDiff = ${String(after.gate.warnOnHighRiskDiff)}`,
      reason: `${reasonLead}按样本误报情况微调高风险 diff 对最终状态的影响`,
    });
  }
  if (before.gate.blockOnHighWarning !== after.gate.blockOnHighWarning) {
    notes.push({
      area: "gate",
      before: `blockOnHighWarning = ${String(before.gate.blockOnHighWarning)}`,
      after: `blockOnHighWarning = ${String(after.gate.blockOnHighWarning)}`,
      reason: `${reasonLead}按校准结果微调 high warning 是否阻断`,
    });
  }
  if (before.gate.blockOnUnconfirmedHighClause !== after.gate.blockOnUnconfirmedHighClause) {
    notes.push({
      area: "gate",
      before: `blockOnUnconfirmedHighClause = ${String(before.gate.blockOnUnconfirmedHighClause)}`,
      after: `blockOnUnconfirmedHighClause = ${String(after.gate.blockOnUnconfirmedHighClause)}`,
      reason: `${reasonLead}按校准结果微调 high clause 未确认是否阻断`,
    });
  }
  if (before.gate.warnOnMediumClausePending !== after.gate.warnOnMediumClausePending) {
    notes.push({
      area: "gate",
      before: `warnOnMediumClausePending = ${String(before.gate.warnOnMediumClausePending)}`,
      after: `warnOnMediumClausePending = ${String(after.gate.warnOnMediumClausePending)}`,
      reason: `${reasonLead}按校准结果微调中风险 clause 未确认是否 warning`,
    });
  }

  return notes;
}
