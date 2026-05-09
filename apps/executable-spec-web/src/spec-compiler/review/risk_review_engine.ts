import type { RuleConfig } from "../calibration/rule_config.ts";
import { buildRiskItemsFromWarnings, type ExtractionWarning, type RiskItem } from "./warning_risk_mapper.ts";
import { summarizeRiskItems, type RiskSummary } from "./risk_summary.ts";

export interface RiskReviewResult {
  items: RiskItem[];
  summary: RiskSummary;
  canRegister: boolean;
  reviewMessage: string;
}

function buildReviewMessage(summary: RiskSummary): string {
  if (summary.blocking > 0) {
    return "检测到高风险抽取问题，暂不允许注册";
  }
  if (summary.confirmRequired > 0) {
    return "存在中风险项，请人工确认后再继续";
  }
  return "仅低风险提示，可直接继续";
}

export function buildRiskReviewResult(warnings: ExtractionWarning[], config?: RuleConfig): RiskReviewResult {
  const items = buildRiskItemsFromWarnings(warnings, config);
  const summary = summarizeRiskItems(items);
  const canRegister = summary.blocking === 0;
  const reviewMessage = buildReviewMessage(summary);
  return {
    items,
    summary,
    canRegister,
    reviewMessage,
  };
}
