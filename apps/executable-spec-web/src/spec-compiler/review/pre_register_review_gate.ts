import { getActiveRuleConfig, type RuleConfig } from "../calibration/rule_config.ts";
import { computeClauseReviewStatus, type ClauseReviewItem, type ClauseReviewResult } from "./clause_review.ts";
import {
  buildDraftDiffReview,
  detectHighRiskDiff as detectHighRiskDiffFromReview,
  extractChangedSections as extractChangedSectionsFromReview,
  type DraftDiffReviewResult,
} from "./draft_diff_review.ts";
import { buildRiskReviewResult, type RiskReviewResult } from "./risk_review_engine.ts";
import { isHighRiskWarning, isMediumRiskWarning, type ExtractionWarning } from "./warning_risk_mapper.ts";

export interface PreRegisterInput {
  warnings: ExtractionWarning[];
  originalDraftMarkdown: string;
  editedMarkdown: string;
  clauseReviewItems: ClauseReviewItem[];
}

export interface PreRegisterDecision {
  status: "blocked" | "warning" | "ready";
  canRegister: boolean;
  blockingReasons: string[];
  warningReasons: string[];
  summary: {
    riskHigh: number;
    riskMedium: number;
    diffHigh: number;
    clausePending: number;
  };
}

export interface PreRegisterReviewResult {
  riskReview: RiskReviewResult;
  diffReview: DraftDiffReviewResult;
  clauseReview: ClauseReviewResult;
  finalDecision: PreRegisterDecision;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export { isHighRiskWarning, isMediumRiskWarning };

export function extractChangedSections(
  originalDraftMarkdown: string,
  editedMarkdown: string,
  config?: RuleConfig,
): string[] {
  return extractChangedSectionsFromReview(originalDraftMarkdown, editedMarkdown, config);
}

export function detectHighRiskDiff(
  originalDraftMarkdown: string,
  editedMarkdown: string,
  config?: RuleConfig,
): boolean {
  return detectHighRiskDiffFromReview(originalDraftMarkdown, editedMarkdown, config);
}

export function collectBlockingReasons(
  warnings: ExtractionWarning[],
  clauseReviewItems: ClauseReviewItem[],
  config: RuleConfig = getActiveRuleConfig(),
): string[] {
  const reasons: string[] = [];

  if (config.gate.blockOnHighWarning) {
    for (const warning of warnings) {
      if (isHighRiskWarning(warning.code, config)) {
        reasons.push(warning.message || warning.code);
      }
    }
  }

  if (config.gate.blockOnUnconfirmedHighClause) {
    for (const item of clauseReviewItems) {
      if (item.riskLevel === "high" && !item.confirmed) {
        reasons.push(`${item.title}（高风险条款未确认）`);
      }
    }
  }

  return dedupe(reasons);
}

export function collectWarningReasons(
  warnings: ExtractionWarning[],
  diffReview: DraftDiffReviewResult,
  clauseReviewItems: ClauseReviewItem[],
  config: RuleConfig = getActiveRuleConfig(),
): string[] {
  const reasons: string[] = [];

  for (const warning of warnings) {
    if (isMediumRiskWarning(warning.code, config)) {
      reasons.push(warning.message || warning.code);
      continue;
    }
    if (!config.gate.blockOnHighWarning && isHighRiskWarning(warning.code, config)) {
      reasons.push(warning.message || warning.code);
    }
  }

  if (config.gate.warnOnHighRiskDiff) {
    for (const change of diffReview.sectionChanges) {
      if (change.riskLevel === "high") {
        reasons.push(change.message);
      }
    }
  }

  for (const item of clauseReviewItems) {
    if (!item.confirmed && item.riskLevel === "medium" && config.gate.warnOnMediumClausePending) {
      reasons.push(`${item.title}（中风险条款未确认）`);
      continue;
    }
    if (!item.confirmed && item.riskLevel === "high" && !config.gate.blockOnUnconfirmedHighClause) {
      reasons.push(`${item.title}（高风险条款未确认）`);
    }
  }

  return dedupe(reasons);
}

export function buildPreRegisterDecision(input: PreRegisterInput, config: RuleConfig = getActiveRuleConfig()): PreRegisterDecision {
  const diffReview = buildDraftDiffReview(input.originalDraftMarkdown, input.editedMarkdown, config);
  const riskHigh = input.warnings.filter((warning) => isHighRiskWarning(warning.code, config)).length;
  const riskMedium = input.warnings.filter((warning) => isMediumRiskWarning(warning.code, config)).length;
  const diffHigh = diffReview.sectionChanges.filter((change) => change.riskLevel === "high").length;
  const highClausePending = input.clauseReviewItems.filter((item) => item.riskLevel === "high" && !item.confirmed).length;
  const mediumClausePending = input.clauseReviewItems.filter((item) => item.riskLevel === "medium" && !item.confirmed).length;
  const clausePending = input.clauseReviewItems.filter((item) => item.required && !item.confirmed).length;

  const shouldBlock =
    (config.gate.blockOnHighWarning && riskHigh > 0) ||
    (config.gate.blockOnUnconfirmedHighClause && highClausePending > 0);

  const shouldWarn =
    !shouldBlock &&
    (riskMedium > 0 ||
      (!config.gate.blockOnHighWarning && riskHigh > 0) ||
      (config.gate.warnOnHighRiskDiff && diffHigh > 0) ||
      (config.gate.warnOnMediumClausePending && mediumClausePending > 0) ||
      (!config.gate.blockOnUnconfirmedHighClause && highClausePending > 0));

  const blockingReasons = collectBlockingReasons(input.warnings, input.clauseReviewItems, config);
  const warningReasons = collectWarningReasons(input.warnings, diffReview, input.clauseReviewItems, config);

  if (shouldBlock) {
    return {
      status: "blocked",
      canRegister: false,
      blockingReasons,
      warningReasons,
      summary: {
        riskHigh,
        riskMedium,
        diffHigh,
        clausePending,
      },
    };
  }

  if (shouldWarn) {
    return {
      status: "warning",
      canRegister: true,
      blockingReasons: [],
      warningReasons,
      summary: {
        riskHigh,
        riskMedium,
        diffHigh,
        clausePending,
      },
    };
  }

  return {
    status: "ready",
    canRegister: true,
    blockingReasons: [],
    warningReasons: [],
    summary: {
      riskHigh,
      riskMedium,
      diffHigh,
      clausePending: 0,
    },
  };
}

export function buildPreRegisterReview(input: PreRegisterInput, config: RuleConfig = getActiveRuleConfig()): PreRegisterReviewResult {
  const riskReview = buildRiskReviewResult(input.warnings, config);
  const diffReview = buildDraftDiffReview(input.originalDraftMarkdown, input.editedMarkdown, config);
  const clauseReview = computeClauseReviewStatus(input.clauseReviewItems);
  const finalDecision = buildPreRegisterDecision(input, config);

  return {
    riskReview,
    diffReview,
    clauseReview,
    finalDecision,
  };
}
