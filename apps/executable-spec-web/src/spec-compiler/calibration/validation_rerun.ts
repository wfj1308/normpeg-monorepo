import {
  buildClauseReviewItems,
  buildDraftDiffReview,
  buildPreRegisterDecision,
  buildRiskReviewResult,
  computeClauseReviewStatus,
  type ClauseReviewResult,
  type DraftDiffReviewResult,
  type ExtractionWarning,
  type PreRegisterDecision,
  type PreRegisterInput,
  type RiskReviewResult,
} from "../review/index.ts";
import {
  type RealPdfValidationCaseInput,
  type RealPdfValidationOptions,
  type RealPdfValidationResult,
  validateRealPdfSample,
} from "../validation/real_pdf_validation_runner.ts";
import {
  getActiveRuleConfig,
  type ClauseRuleConfig,
  type DiffRuleConfig,
  type PreRegisterGateConfig,
  type RiskRuleConfig,
  type RuleConfig,
} from "./rule_config.ts";

export interface ValidationComparisonResult {
  fileName: string;
  beforeStatus: "blocked" | "warning" | "ready";
  afterStatus: "blocked" | "warning" | "ready";
  changed: boolean;
  reason: string;
}

export interface ValidationRerunSample {
  file: RealPdfValidationCaseInput["file"];
  fileName?: string;
  options?: RealPdfValidationOptions;
  beforeResult?: RealPdfValidationResult;
}

export interface ValidationRerunResult {
  comparisons: ValidationComparisonResult[];
  beforeResults: RealPdfValidationResult[];
  afterResults: RealPdfValidationResult[];
}

function mergeRuleConfig(partial: {
  risk?: RiskRuleConfig;
  diff?: DiffRuleConfig;
  clause?: ClauseRuleConfig;
  gate?: PreRegisterGateConfig;
}): RuleConfig {
  const base = getActiveRuleConfig();
  return {
    risk: partial.risk ?? base.risk,
    diff: partial.diff ?? base.diff,
    clause: partial.clause ?? base.clause,
    gate: partial.gate ?? base.gate,
  };
}

export function applyRiskRuleConfig(config: RiskRuleConfig, warnings: ExtractionWarning[]): RiskReviewResult {
  return buildRiskReviewResult(warnings, mergeRuleConfig({ risk: config }));
}

export function applyDiffRuleConfig(
  config: DiffRuleConfig,
  originalDraftMarkdown: string,
  editedMarkdown: string,
): DraftDiffReviewResult {
  return buildDraftDiffReview(originalDraftMarkdown, editedMarkdown, mergeRuleConfig({ diff: config }));
}

export function applyClauseRuleConfig(config: ClauseRuleConfig, markdown: string): ClauseReviewResult {
  const items = buildClauseReviewItems(markdown, mergeRuleConfig({ clause: config }));
  return computeClauseReviewStatus(items);
}

export function applyPreRegisterGateConfig(config: PreRegisterGateConfig, input: PreRegisterInput): PreRegisterDecision {
  return buildPreRegisterDecision(input, mergeRuleConfig({ gate: config }));
}

function buildComparisonReason(
  before: ValidationComparisonResult["beforeStatus"],
  after: ValidationComparisonResult["afterStatus"],
): string {
  if (before === after) {
    return "规则微调后状态未变化，当前判定稳定";
  }
  if (before === "blocked" && after === "warning") {
    return "规则微调后由阻断降为警告，仍保留人工确认关口";
  }
  if (before === "blocked" && after === "ready") {
    return "规则微调后由阻断转为可直接注册，请复核是否过松";
  }
  if (before === "warning" && after === "ready") {
    return "规则微调后告警解除，可直接注册";
  }
  if (before === "ready" && after !== "ready") {
    return "规则微调后审阅收紧，增加注册前保护";
  }
  return "规则微调后状态发生变化";
}

export async function rerunValidationWithNewRules(
  samples: ValidationRerunSample[],
  config: RuleConfig,
): Promise<ValidationRerunResult> {
  const beforeResults: RealPdfValidationResult[] = [];
  const afterResults: RealPdfValidationResult[] = [];
  const comparisons: ValidationComparisonResult[] = [];

  for (const sample of samples) {
    const before =
      sample.beforeResult ??
      (await validateRealPdfSample(sample.file, {
        ...(sample.options ?? {}),
      }));
    beforeResults.push(before);

    const after = await validateRealPdfSample(sample.file, {
      ...(sample.options ?? {}),
      ruleConfig: config,
    });
    afterResults.push(after);

    const beforeStatus = before.preRegisterDecision.status;
    const afterStatus = after.preRegisterDecision.status;

    comparisons.push({
      fileName: sample.fileName ?? before.fileName,
      beforeStatus,
      afterStatus,
      changed: beforeStatus !== afterStatus,
      reason: buildComparisonReason(beforeStatus, afterStatus),
    });
  }

  return {
    comparisons,
    beforeResults,
    afterResults,
  };
}
