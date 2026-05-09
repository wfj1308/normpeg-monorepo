import assert from "node:assert/strict";
import test from "node:test";

import { RuleEngine } from "./rule-engine.ts";

const engine = new RuleEngine();

test("RuleEngine supports all configured operators", () => {
  const gate = engine.evaluate(
    [
      { ruleId: "r1", field: "a", operator: ">=", threshold: 10, message: "a>=10" },
      { ruleId: "r2", field: "b", operator: ">", threshold: 9, message: "b>9" },
      { ruleId: "r3", field: "c", operator: "<=", threshold: 3, message: "c<=3" },
      { ruleId: "r4", field: "d", operator: "<", threshold: 4, message: "d<4" },
      { ruleId: "r5", field: "e", operator: "==", threshold: 5, message: "e==5" },
      { ruleId: "r6", field: "f", operator: "!=", threshold: 6, message: "f!=6" },
    ],
    {},
    { a: 10, b: 10, c: 3, d: 3, e: 5, f: 7 },
  );
  assert.equal(gate.passed, true);
  assert.equal(gate.results.length, 6);
});

test("RuleEngine supports dynamic threshold inputRef", () => {
  const gate = engine.evaluate(
    [{ ruleId: "r", field: "compaction", operator: ">=", threshold: { inputRef: "target" }, message: "rule" }],
    { target: 93 },
    { compaction: 94.2 },
  );
  assert.equal(gate.passed, true);
  assert.equal(gate.results[0]?.threshold, 93);
});

test("RuleEngine supports legacy rule.value field reference", () => {
  const gate = engine.evaluate(
    [{ field: "thicknessResult", operator: ">=", value: "designThickness", message: "厚度必须 >= 设计值" }],
    { designThickness: 200 },
    { thicknessResult: 210 },
  );
  assert.equal(gate.passed, true);
  assert.equal(gate.results[0]?.threshold, 200);
});
