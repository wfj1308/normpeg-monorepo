import type { BenchmarkComparison } from "./extraction_benchmark_compare.ts";
import type { ExtractionBenchmarkResult } from "./extraction_benchmark_runner.ts";

function format(value: number): string {
  return value.toFixed(4);
}

function averageBy(
  benchmark: ExtractionBenchmarkResult,
  selector: (item: ExtractionBenchmarkResult["cases"][number]) => number,
): number {
  if (benchmark.cases.length === 0) {
    return 0;
  }
  const sum = benchmark.cases.reduce((acc, item) => acc + selector(item), 0);
  return sum / benchmark.cases.length;
}

function bestImprovement(before: ExtractionBenchmarkResult, after: ExtractionBenchmarkResult): string | null {
  const beforeMap = new Map(before.cases.map((item) => [item.caseId, item.metrics.score.overall]));
  let best: { caseId: string; delta: number } | null = null;
  for (const item of after.cases) {
    const prev = beforeMap.get(item.caseId);
    if (typeof prev !== "number") {
      continue;
    }
    const delta = item.metrics.score.overall - prev;
    if (!best || delta > best.delta) {
      best = { caseId: item.caseId, delta };
    }
  }
  return best ? `${best.caseId} (+${format(best.delta)})` : null;
}

export function buildExtractionBenchmarkReport(
  before: ExtractionBenchmarkResult,
  after: ExtractionBenchmarkResult,
  comparison: BenchmarkComparison,
): string {
  const lines: string[] = [];
  lines.push("Extraction Benchmark Report");
  lines.push("");
  lines.push("Overall:");
  lines.push(`- before: ${format(before.averageScore)}`);
  lines.push(`- after: ${format(after.averageScore)}`);
  lines.push(`- delta: ${comparison.overallDelta >= 0 ? "+" : ""}${format(comparison.overallDelta)}`);
  lines.push("");
  lines.push("Clause:");
  lines.push(`- before: ${format(averageBy(before, (item) => item.metrics.score.clause))}`);
  lines.push(`- after: ${format(averageBy(after, (item) => item.metrics.score.clause))}`);
  lines.push(`- delta: ${comparison.clauseDelta >= 0 ? "+" : ""}${format(comparison.clauseDelta)}`);
  lines.push("Formula:");
  lines.push(`- before: ${format(averageBy(before, (item) => item.metrics.score.formula))}`);
  lines.push(`- after: ${format(averageBy(after, (item) => item.metrics.score.formula))}`);
  lines.push(`- delta: ${comparison.formulaDelta >= 0 ? "+" : ""}${format(comparison.formulaDelta)}`);
  lines.push("Input:");
  lines.push(`- before: ${format(averageBy(before, (item) => item.metrics.score.tableInputs))}`);
  lines.push(`- after: ${format(averageBy(after, (item) => item.metrics.score.tableInputs))}`);
  lines.push(`- delta: ${comparison.inputDelta >= 0 ? "+" : ""}${format(comparison.inputDelta)}`);
  lines.push("Rule:");
  lines.push(`- before: ${format(averageBy(before, (item) => item.metrics.score.rules))}`);
  lines.push(`- after: ${format(averageBy(after, (item) => item.metrics.score.rules))}`);
  lines.push(`- delta: ${comparison.ruleDelta >= 0 ? "+" : ""}${format(comparison.ruleDelta)}`);
  lines.push("");
  lines.push("Improved Cases:");
  if (comparison.improvedCases.length === 0) {
    lines.push("- none");
  } else {
    for (const caseId of comparison.improvedCases) {
      lines.push(`- ${caseId}`);
    }
  }
  lines.push("");
  lines.push("Regressed Cases:");
  if (comparison.regressedCases.length === 0) {
    lines.push("- none");
  } else {
    for (const caseId of comparison.regressedCases) {
      lines.push(`- ${caseId}`);
    }
  }
  lines.push("");
  const best = bestImprovement(before, after);
  lines.push(`Most Improved Case: ${best ?? "none"}`);
  return lines.join("\n");
}
