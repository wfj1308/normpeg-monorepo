import type { ValidationCalibrationReport } from "../validation/validation_calibration_report.ts";
import { buildRuleAdjustmentNotes, type RuleAdjustmentNote } from "./rule_adjustment_notes.ts";
import {
  cloneRuleConfig,
  DEFAULT_RULE_CONFIG,
  type RuleConfig,
} from "./rule_config.ts";

export interface RuleConfigBuildResult {
  config: RuleConfig;
  notes: RuleAdjustmentNote[];
}

function includesAny(values: readonly string[], patterns: readonly string[]): boolean {
  return patterns.some((pattern) => values.some((value) => value.includes(pattern)));
}

function removeValue<T extends string>(values: readonly T[], target: T): T[] {
  return values.filter((value) => value !== target);
}

function ensureValue<T extends string>(values: readonly T[], target: T): T[] {
  if (values.includes(target)) {
    return [...values];
  }
  return [...values, target];
}

function warningLevel(config: RuleConfig, code: string): "high" | "medium" | "low" | "unknown" {
  if (config.risk.highRiskWarnings.includes(code)) {
    return "high";
  }
  if (config.risk.mediumRiskWarnings.includes(code)) {
    return "medium";
  }
  if (config.risk.lowRiskWarnings.includes(code)) {
    return "low";
  }
  return "unknown";
}

export function buildRuleConfigFromCalibrationWithNotes(
  report: ValidationCalibrationReport,
  baseConfig: RuleConfig = DEFAULT_RULE_CONFIG,
): RuleConfigBuildResult {
  const before = cloneRuleConfig(baseConfig);
  const next = cloneRuleConfig(baseConfig);

  const suggestions = report.ruleAdjustmentSuggestions.join(" | ");
  const allReasons = [...report.commonBlockingReasons, ...report.commonWarningReasons];

  if (suggestions.includes("OCR_TEXT_NOISY") && suggestions.includes("medium")) {
    next.risk.highRiskWarnings = removeValue(next.risk.highRiskWarnings, "OCR_TEXT_NOISY");
    next.risk.mediumRiskWarnings = ensureValue(next.risk.mediumRiskWarnings, "OCR_TEXT_NOISY");
  }

  if (suggestions.includes("FORMULA_PARTIAL") && suggestions.includes("high")) {
    next.risk.mediumRiskWarnings = removeValue(next.risk.mediumRiskWarnings, "FORMULA_PARTIAL");
    next.risk.highRiskWarnings = ensureValue(next.risk.highRiskWarnings, "FORMULA_PARTIAL");
  }

  if (suggestions.includes("INPUTS_INFERRED") || suggestions.includes("RULES_INFERRED")) {
    next.risk.mediumRiskWarnings = ensureValue(next.risk.mediumRiskWarnings, "INPUTS_INFERRED");
    next.risk.mediumRiskWarnings = ensureValue(next.risk.mediumRiskWarnings, "RULES_INFERRED");
    next.risk.highRiskWarnings = removeValue(next.risk.highRiskWarnings, "INPUTS_INFERRED");
    next.risk.highRiskWarnings = removeValue(next.risk.highRiskWarnings, "RULES_INFERRED");
  }

  // If this reason is frequently raised in blocked samples, we loosen only this one clause
  // from high required to medium optional to reduce over-blocking caused by sparse dependency text.
  if (
    report.blocked > 0 &&
    report.blocked >= Math.ceil(report.total / 2) &&
    (includesAny(allReasons, ["依赖（高风险条款未确认）", "depends_on"]) ||
      suggestions.includes("Clause required"))
  ) {
    next.clause.requiredHighRiskSections = removeValue(next.clause.requiredHighRiskSections, "depends_on");
    next.clause.optionalMediumRiskSections = ensureValue(next.clause.optionalMediumRiskSections, "depends_on");
  }

  // When warning reasons are dominated by source edits, downgrade source diff to medium
  // to avoid flagging formatting/source-line normalization as high-risk by default.
  if (
    report.warning >= Math.ceil(report.total / 2) &&
    includesAny(report.commonWarningReasons, ["规范来源被修改"])
  ) {
    next.diff.highRiskSections = removeValue(next.diff.highRiskSections, "source");
    next.diff.mediumRiskSections = ensureValue(next.diff.mediumRiskSections, "source");
  }

  const notes = buildRuleAdjustmentNotes(before, next, "Real PDF 校准");

  if (suggestions.includes("OCR_TEXT_NOISY") && warningLevel(next, "OCR_TEXT_NOISY") === "medium") {
    notes.push({
      area: "risk",
      before: `OCR_TEXT_NOISY = ${warningLevel(before, "OCR_TEXT_NOISY")}`,
      after: `OCR_TEXT_NOISY = ${warningLevel(next, "OCR_TEXT_NOISY")}`,
      reason: "真实样本中 OCR_TEXT_NOISY 高频但非直接错误注册来源，保持/下调为 medium。",
    });
  }

  if (suggestions.includes("FORMULA_PARTIAL") && warningLevel(next, "FORMULA_PARTIAL") === "high") {
    notes.push({
      area: "risk",
      before: `FORMULA_PARTIAL = ${warningLevel(before, "FORMULA_PARTIAL")}`,
      after: `FORMULA_PARTIAL = ${warningLevel(next, "FORMULA_PARTIAL")}`,
      reason: "FORMULA_PARTIAL 会直接影响可编译性，保持 high + block。",
    });
  }

  if (before.clause.requiredHighRiskSections.includes("depends_on") && !next.clause.requiredHighRiskSections.includes("depends_on")) {
    notes.push({
      area: "clause",
      before: `depends_on in requiredHighRiskSections = ${String(before.clause.requiredHighRiskSections.includes("depends_on"))}`,
      after: `depends_on in requiredHighRiskSections = false`,
      reason: "在样本中依赖字段常缺失且并非核心计算误差来源，降级为 optional medium 以减少误阻断。",
    });
  }

  return {
    config: next,
    notes,
  };
}

export function buildRuleConfigFromCalibration(
  report: ValidationCalibrationReport,
  baseConfig: RuleConfig = DEFAULT_RULE_CONFIG,
): RuleConfig {
  return buildRuleConfigFromCalibrationWithNotes(report, baseConfig).config;
}
