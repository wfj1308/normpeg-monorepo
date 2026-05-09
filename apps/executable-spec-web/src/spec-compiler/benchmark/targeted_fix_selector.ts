import type { ExtractionBenchmarkResult } from "./extraction_benchmark_runner.ts";

interface RankedCase {
  caseId: string;
  rankScore: number;
}

function issuePenalty(metrics: ExtractionBenchmarkResult["cases"][number]["metrics"]): number {
  let penalty = 0;
  if (!metrics.clauseMatched) {
    penalty += 3;
  }
  if (metrics.formulasExpected > 0 && metrics.formulasFullMatched === 0) {
    penalty += 3;
  }
  if (metrics.inputsExpected > 0) {
    const ratio = metrics.inputsMatched / metrics.inputsExpected;
    if (ratio <= 0.25) {
      penalty += 2;
    } else if (ratio <= 0.5) {
      penalty += 1;
    }
  }
  if (metrics.rulesExpected > 0 && metrics.rulesMatched === 0) {
    penalty += 2;
  }
  return penalty;
}

function buildRankedCases(result: ExtractionBenchmarkResult): RankedCase[] {
  return result.cases.map((item) => {
    const metrics = item.metrics;
    const scorePenalty = (1 - metrics.score.overall) * 100;
    const warningPenalty = metrics.warningsCount * 5;
    const penalty = issuePenalty(metrics) * 10;
    return {
      caseId: item.caseId,
      rankScore: scorePenalty + warningPenalty + penalty,
    };
  });
}

export function selectWorstBenchmarkCases(result: ExtractionBenchmarkResult): string[] {
  const ranked = buildRankedCases(result)
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, Math.min(3, result.cases.length));
  return ranked.map((item) => item.caseId);
}

