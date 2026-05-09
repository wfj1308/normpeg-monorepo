import type { RuleConfig } from "../calibration/rule_config.ts";
import { buildPreRegisterReview } from "../review/pre_register_review_gate.ts";
import type { RegressionCase } from "./regression_case.ts";

export interface RegressionResult {
  caseId: string;
  actualStatus: "blocked" | "warning" | "ready";
  expectedStatus: "blocked" | "warning" | "ready";
  passed: boolean;
  details: string[];
}

function checkContains(reasons: string[], required: string[]): string[] {
  const errors: string[] = [];
  for (const keyword of required) {
    const hit = reasons.some((reason) => reason.includes(keyword));
    if (!hit) {
      errors.push(`未命中期望关键词: ${keyword}`);
    }
  }
  return errors;
}

export function runRegressionCase(caseItem: RegressionCase, ruleConfig: RuleConfig): RegressionResult {
  const review = buildPreRegisterReview(
    {
      warnings: caseItem.warnings,
      originalDraftMarkdown: caseItem.originalDraftMarkdown,
      editedMarkdown: caseItem.editedMarkdown,
      clauseReviewItems: caseItem.clauseReviewItems,
    },
    ruleConfig,
  );

  const actualStatus = review.finalDecision.status;
  const expectedStatus = caseItem.expectedDecision.status;
  const details: string[] = [];

  if (actualStatus !== expectedStatus) {
    details.push(`状态不一致: expected=${expectedStatus}, actual=${actualStatus}`);
  }

  if (caseItem.expectedDecision.blockingReasonsContains?.length) {
    details.push(
      ...checkContains(
        review.finalDecision.blockingReasons,
        caseItem.expectedDecision.blockingReasonsContains,
      ),
    );
  }

  if (caseItem.expectedDecision.warningReasonsContains?.length) {
    details.push(
      ...checkContains(
        review.finalDecision.warningReasons,
        caseItem.expectedDecision.warningReasonsContains,
      ),
    );
  }

  return {
    caseId: caseItem.caseId,
    actualStatus,
    expectedStatus,
    passed: details.length === 0,
    details,
  };
}
