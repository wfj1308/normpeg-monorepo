import { buildPreRegisterReview, type PreRegisterInput, type PreRegisterReviewResult } from "../../src/spec-compiler/review/index.ts";

export interface PreRegisterGuardPass {
  blocked: false;
  preRegisterReview: PreRegisterReviewResult;
}

export interface PreRegisterGuardBlocked {
  blocked: true;
  error: "PRE_REGISTER_BLOCKED";
  preRegisterReview: PreRegisterReviewResult;
  reasons: string[];
}

export type PreRegisterGuardResult = PreRegisterGuardPass | PreRegisterGuardBlocked;

export function evaluatePreRegisterGuard(input: PreRegisterInput): PreRegisterGuardResult {
  const preRegisterReview = buildPreRegisterReview(input);
  if (!preRegisterReview.finalDecision.canRegister) {
    return {
      blocked: true,
      error: "PRE_REGISTER_BLOCKED",
      preRegisterReview,
      reasons: preRegisterReview.finalDecision.blockingReasons,
    };
  }
  return {
    blocked: false,
    preRegisterReview,
  };
}
