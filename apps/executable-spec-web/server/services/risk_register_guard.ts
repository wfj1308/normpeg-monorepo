import { buildRiskReviewResult, type ExtractionWarning, type RiskReviewResult } from "../../src/spec-compiler/review/index.ts";

export interface RiskRegisterGuardPass {
  blocked: false;
  riskReview: RiskReviewResult;
}

export interface RiskRegisterGuardBlocked {
  blocked: true;
  error: "RISK_REVIEW_BLOCKED";
  riskReview: RiskReviewResult;
}

export type RiskRegisterGuardResult = RiskRegisterGuardPass | RiskRegisterGuardBlocked;

export function evaluateRiskRegisterGuard(warnings: ExtractionWarning[]): RiskRegisterGuardResult {
  const riskReview = buildRiskReviewResult(warnings);
  if (!riskReview.canRegister) {
    return {
      blocked: true,
      error: "RISK_REVIEW_BLOCKED",
      riskReview,
    };
  }
  return {
    blocked: false,
    riskReview,
  };
}
