import type { ClauseReviewResult } from "./clause_review.ts";
import type { DraftDiffReviewResult } from "./draft_diff_review.ts";
import type { RiskReviewResult } from "./risk_review_engine.ts";

function dedupeReasons(reasons: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const reason of reasons) {
    const normalized = reason.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function collectBlockingReasons(riskReview: RiskReviewResult, clauseReview: ClauseReviewResult): string[] {
  const reasons: string[] = [];

  for (const item of riskReview.items) {
    if (item.blocksRegister) {
      reasons.push(item.title || item.message);
    }
  }

  for (const item of clauseReview.items) {
    if (item.required && item.riskLevel === "high" && !item.confirmed) {
      reasons.push(`${item.title}（高风险条款未确认）`);
    }
  }

  return dedupeReasons(reasons);
}

export function collectWarningReasons(
  riskReview: RiskReviewResult,
  diffReview: DraftDiffReviewResult,
  clauseReview: ClauseReviewResult,
): string[] {
  const reasons: string[] = [];

  for (const item of riskReview.items) {
    if (!item.blocksRegister && item.riskLevel === "medium") {
      reasons.push(item.title || item.message);
    }
  }

  for (const change of diffReview.sectionChanges) {
    if (change.riskLevel === "high") {
      reasons.push(`${change.section}存在高风险人工改动：${change.message}`);
    }
  }

  for (const item of clauseReview.items) {
    if (item.riskLevel === "medium" && !item.confirmed) {
      reasons.push(`${item.title}（中风险条款未确认）`);
    }
  }

  for (const item of clauseReview.items) {
    if (item.required && item.riskLevel !== "high" && !item.confirmed) {
      reasons.push(`${item.title}（必填条款未确认）`);
    }
  }

  return dedupeReasons(reasons);
}
