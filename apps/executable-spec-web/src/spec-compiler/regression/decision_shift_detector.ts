import type { RegressionSuiteResult } from "./regression_suite.ts";

function statusRank(status: "blocked" | "warning" | "ready"): number {
  if (status === "blocked") {
    return 0;
  }
  if (status === "warning") {
    return 1;
  }
  return 2;
}

export function detectDecisionShift(before: RegressionSuiteResult, after: RegressionSuiteResult): string[] {
  const alerts: string[] = [];
  const beforeMap = new Map(before.results.map((item) => [item.caseId, item]));
  const afterMap = new Map(after.results.map((item) => [item.caseId, item]));

  for (const [caseId, beforeItem] of beforeMap.entries()) {
    const afterItem = afterMap.get(caseId);
    if (!afterItem) {
      continue;
    }
    if (beforeItem.actualStatus === afterItem.actualStatus) {
      continue;
    }

    alerts.push(
      `回归样本状态变化: ${caseId} ${beforeItem.actualStatus} -> ${afterItem.actualStatus}`,
    );

    const highImpact =
      (beforeItem.actualStatus === "blocked" && afterItem.actualStatus === "ready") ||
      (beforeItem.actualStatus === "ready" && afterItem.actualStatus === "blocked");

    if (highImpact) {
      alerts.push("规则改动影响了既有样本，请人工复核");
      continue;
    }

    const beforeScore = statusRank(beforeItem.actualStatus);
    const afterScore = statusRank(afterItem.actualStatus);
    if (Math.abs(beforeScore - afterScore) >= 1) {
      alerts.push("规则改动导致审阅强度发生变化，请关注是否符合预期");
    }
  }

  return alerts;
}
