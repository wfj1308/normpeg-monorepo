import assert from "node:assert/strict";
import test from "node:test";

import { COMPACTION_GATE_THRESHOLD, evaluateCompactionGate, executeCompactionPath, recommendPassInputs } from "./engine.ts";

test("executeCompactionPath computes three-step chain with trace", () => {
  const result = executeCompactionPath({
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });

  assert.equal(result.outputs.wetDensity, 1.98);
  assert.equal(result.outputs.dryDensity, 1.8857);
  assert.equal(result.outputs.compactionDegree, 96.7026);
  assert.equal(result.trace.length, 3);
});

test("evaluateCompactionGate returns rule detail with chinese message", () => {
  const gate = evaluateCompactionGate({
    wetDensity: 1.98,
    dryDensity: 1.8857,
    compactionDegree: 92.2,
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.results[0]?.field, "compactionDegree");
  assert.equal(gate.results[0]?.operator, ">=");
  assert.equal(gate.results[0]?.threshold, COMPACTION_GATE_THRESHOLD);
  assert.match(gate.results[0]?.message ?? "", /不满足/);
});

test("recommendPassInputs can infer minimum passing massHoleSand", () => {
  const recommendation = recommendPassInputs({
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
    massSandCone: 500,
  });

  assert.ok(recommendation);
  const executed = executeCompactionPath(recommendation!);
  const gate = evaluateCompactionGate(executed.outputs);
  assert.equal(gate.passed, true);
});
