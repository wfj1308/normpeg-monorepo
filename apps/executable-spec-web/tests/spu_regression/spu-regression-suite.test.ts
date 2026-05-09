import assert from "node:assert/strict";
import test from "node:test";

import { executeSpuRegressionSuites, formatSpuRegressionFailures } from "./runner.ts";

const CORE_SPU_IDS = [
  "highway.subgrade.compaction.4.2.1@v1",
  "highway.subgrade.thickness.4.2.3@v1",
  "highway.subgrade.deflection.4.2.2@v1",
];

test("SPU regression suites: all registered SPUs are covered and all cases pass", () => {
  const report = executeSpuRegressionSuites();

  assert.equal(report.coverage.registeredSpuIds.length >= 3, true, "expected at least 3 registered SPUs");
  for (const coreSpuId of CORE_SPU_IDS) {
    assert.equal(
      report.coverage.suiteSpuIds.includes(coreSpuId),
      true,
      `missing core SPU suite: ${coreSpuId}`,
    );
  }

  assert.deepEqual(
    report.coverage.missingSuiteSpuIds,
    [],
    `missing suites: ${report.coverage.missingSuiteSpuIds.join(", ")}`,
  );
  assert.deepEqual(
    report.coverage.unknownSuiteSpuIds,
    [],
    `unknown suites: ${report.coverage.unknownSuiteSpuIds.join(", ")}`,
  );

  assert.equal(report.summary.byKind.pass.total > 0, true, "pass cases are required");
  assert.equal(report.summary.byKind.fail.total > 0, true, "fail cases are required");
  assert.equal(report.summary.byKind.boundary.total > 0, true, "boundary cases are required");

  assert.equal(report.summary.failed, 0, formatSpuRegressionFailures(report));
});
