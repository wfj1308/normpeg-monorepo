import type { BenchmarkFailureReason } from "./benchmark_failure_analyzer.ts";
import type { ExtractionBenchmarkMetrics } from "./extraction_scorer.ts";

export interface TargetedFixComparison {
  caseId: string;
  beforeScore: number;
  afterScore: number;
  delta: number;
  improvedAreas: string[];
  remainingProblems: string[];
}

function isResolved(afterMetrics: ExtractionBenchmarkMetrics, area: BenchmarkFailureReason["area"]): boolean {
  if (area === "clause") {
    return afterMetrics.clauseMatched;
  }
  if (area === "formula") {
    return afterMetrics.formulasExpected === 0 || afterMetrics.formulasFullMatched > 0;
  }
  if (area === "input") {
    if (afterMetrics.inputsExpected === 0) {
      return true;
    }
    return afterMetrics.inputsMatched / afterMetrics.inputsExpected > 0.6;
  }
  if (area === "rule") {
    return afterMetrics.rulesExpected === 0 || afterMetrics.rulesMatched > 0;
  }
  if (area === "table") {
    return afterMetrics.warningsCount <= 2;
  }
  return false;
}

function collectImprovedAreas(beforeMetrics: ExtractionBenchmarkMetrics, afterMetrics: ExtractionBenchmarkMetrics): string[] {
  const improved: string[] = [];
  if (afterMetrics.score.clause > beforeMetrics.score.clause) {
    improved.push("clause");
  }
  if (afterMetrics.score.formula > beforeMetrics.score.formula) {
    improved.push("formula");
  }
  if (afterMetrics.score.tableInputs > beforeMetrics.score.tableInputs) {
    improved.push("input");
  }
  if (afterMetrics.score.rules > beforeMetrics.score.rules) {
    improved.push("rule");
  }
  if (afterMetrics.warningsCount < beforeMetrics.warningsCount) {
    improved.push("table");
  }
  return Array.from(new Set(improved));
}

export function compareTargetedFixBeforeAfter(
  beforeMetrics: ExtractionBenchmarkMetrics,
  afterMetrics: ExtractionBenchmarkMetrics,
  failureReasons: BenchmarkFailureReason[],
): TargetedFixComparison {
  const caseId = failureReasons[0]?.caseId ?? "unknown_case";
  const beforeScore = beforeMetrics.score.overall;
  const afterScore = afterMetrics.score.overall;
  const delta = Number((afterScore - beforeScore).toFixed(4));
  const improvedAreas = collectImprovedAreas(beforeMetrics, afterMetrics);
  const remainingProblems = failureReasons
    .filter((reason) => !isResolved(afterMetrics, reason.area))
    .map((reason) => `${reason.area}: ${reason.message}`);

  return {
    caseId,
    beforeScore,
    afterScore,
    delta,
    improvedAreas,
    remainingProblems,
  };
}

