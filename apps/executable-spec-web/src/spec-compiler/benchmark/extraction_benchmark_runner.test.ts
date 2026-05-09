import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  compareBenchmarkResults,
  loadExtractionBenchmarkCases,
  runExtractionBenchmark,
} from "./index.ts";

const ROOT = process.cwd();
const CASES_DIR = path.resolve(ROOT, "apps/executable-spec-web/examples/benchmark");

test("runExtractionBenchmark: should run baseline and improved on 3 cases", () => {
  const cases = loadExtractionBenchmarkCases(CASES_DIR);
  const baseline = runExtractionBenchmark(cases, "baseline");
  const improved = runExtractionBenchmark(cases, "improved");

  assert.equal(cases.length >= 3, true);
  assert.equal(baseline.total, cases.length);
  assert.equal(improved.total, cases.length);
});

test("compareBenchmarkResults: improved should not be worse than baseline on overall score", () => {
  const cases = loadExtractionBenchmarkCases(CASES_DIR);
  const baseline = runExtractionBenchmark(cases, "baseline");
  const improved = runExtractionBenchmark(cases, "improved");
  const comparison = compareBenchmarkResults(baseline, improved);

  assert.equal(comparison.overallDelta >= 0, true);
  assert.equal(comparison.improvedCases.length >= 1, true);
});
