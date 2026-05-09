import type { RiskItem } from "./warning_risk_mapper.ts";

export interface RiskSummary {
  high: number;
  medium: number;
  low: number;
  blocking: number;
  confirmRequired: number;
}

export function summarizeRiskItems(items: RiskItem[]): RiskSummary {
  return items.reduce<RiskSummary>(
    (acc, item) => {
      if (item.riskLevel === "high") {
        acc.high += 1;
      } else if (item.riskLevel === "medium") {
        acc.medium += 1;
      } else {
        acc.low += 1;
      }

      if (item.blocksRegister) {
        acc.blocking += 1;
      }
      if (item.requiresConfirmation) {
        acc.confirmRequired += 1;
      }
      return acc;
    },
    { high: 0, medium: 0, low: 0, blocking: 0, confirmRequired: 0 },
  );
}
