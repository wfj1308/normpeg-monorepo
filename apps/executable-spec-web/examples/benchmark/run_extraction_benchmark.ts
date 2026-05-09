import fs from "node:fs";
import path from "node:path";

import {
  buildExtractionBenchmarkReport,
  compareBenchmarkResults,
  loadExtractionBenchmarkCases,
  runExtractionBenchmark,
} from "../../src/spec-compiler/benchmark/index.ts";

export function runExtractionBenchmarkCli(): void {
  const root = process.cwd();
  const casesDir = path.resolve(root, "apps/executable-spec-web/examples/benchmark");
  const cases = loadExtractionBenchmarkCases(casesDir);

  const before = runExtractionBenchmark(cases, "baseline");
  const after = runExtractionBenchmark(cases, "improved");
  const comparison = compareBenchmarkResults(before, after);
  const report = buildExtractionBenchmarkReport(before, after, comparison);

  const output = {
    generatedAt: new Date().toISOString(),
    before,
    after,
    comparison,
    report,
  };

  const outputPath = path.resolve(root, "apps/executable-spec-web/examples/benchmark/extraction_benchmark_report.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(report);
  console.log("");
  console.log(`Report JSON: ${outputPath}`);
}

runExtractionBenchmarkCli();
