import type { ExtractionBenchmarkResult } from "./extraction_benchmark_runner.ts";

export interface BenchmarkComparison {
  clauseDelta: number;
  formulaDelta: number;
  inputDelta: number;
  ruleDelta: number;
  overallDelta: number;
  improvedCases: string[];
  regressedCases: string[];
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((acc, value) => acc + value, 0) / values.length).toFixed(4));
}

function delta(after: number, before: number): number {
  return Number((after - before).toFixed(4));
}

export function compareBenchmarkResults(
  before: ExtractionBenchmarkResult,
  after: ExtractionBenchmarkResult,
): BenchmarkComparison {
  const beforeMap = new Map(before.cases.map((item) => [item.caseId, item.metrics]));
  const afterMap = new Map(after.cases.map((item) => [item.caseId, item.metrics]));
  const keys = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]));

  const clauseBeforeScores: number[] = [];
  const clauseAfterScores: number[] = [];
  const formulaBeforeScores: number[] = [];
  const formulaAfterScores: number[] = [];
  const inputBeforeScores: number[] = [];
  const inputAfterScores: number[] = [];
  const ruleBeforeScores: number[] = [];
  const ruleAfterScores: number[] = [];
  const improvedCases: string[] = [];
  const regressedCases: string[] = [];

  for (const caseId of keys) {
    const beforeMetrics = beforeMap.get(caseId);
    const afterMetrics = afterMap.get(caseId);
    if (!beforeMetrics || !afterMetrics) {
      continue;
    }
    clauseBeforeScores.push(beforeMetrics.score.clause);
    clauseAfterScores.push(afterMetrics.score.clause);
    formulaBeforeScores.push(beforeMetrics.score.formula);
    formulaAfterScores.push(afterMetrics.score.formula);
    inputBeforeScores.push(beforeMetrics.score.tableInputs);
    inputAfterScores.push(afterMetrics.score.tableInputs);
    ruleBeforeScores.push(beforeMetrics.score.rules);
    ruleAfterScores.push(afterMetrics.score.rules);

    if (afterMetrics.score.overall > beforeMetrics.score.overall) {
      improvedCases.push(caseId);
    }
    if (afterMetrics.score.overall < beforeMetrics.score.overall) {
      regressedCases.push(caseId);
    }
  }

  const clauseDelta = delta(average(clauseAfterScores), average(clauseBeforeScores));
  const formulaDelta = delta(average(formulaAfterScores), average(formulaBeforeScores));
  const inputDelta = delta(average(inputAfterScores), average(inputBeforeScores));
  const ruleDelta = delta(average(ruleAfterScores), average(ruleBeforeScores));
  const overallDelta = delta(after.averageScore, before.averageScore);

  return {
    clauseDelta,
    formulaDelta,
    inputDelta,
    ruleDelta,
    overallDelta,
    improvedCases,
    regressedCases,
  };
}
