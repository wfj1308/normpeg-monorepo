import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { parseSemanticVersion, summarizeSpuVersionDiff } from "./spu-versioning.ts";

function buildSpu(spuId: string, version: string, threshold: number, withExtraInput = false): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Demo Spec",
      norm: "TEST-STD",
      clause: "1.1.1",
      version,
    },
    data: {
      inputs: [
        { name: "a", type: "number", label: "A" },
        ...(withExtraInput ? [{ name: "b", type: "number" as const, label: "B" }] : []),
      ],
      outputs: [{ name: "y", label: "Y" }],
    },
    path: [{ step: "s1", formula: "y = a" }],
    rules: [
      {
        ruleId: "RULE-1",
        field: "y",
        operator: ">=",
        threshold,
        message: "y should pass",
      },
      ...(withExtraInput
        ? [
            {
              ruleId: "RULE-2",
              field: "b",
              operator: ">",
              threshold: 0,
              message: "b should be positive",
            },
          ]
        : []),
    ],
    proof: {
      resultField: "y",
      requiredSignatures: [],
    },
  };
}

test("parseSemanticVersion: supports v1 / v1.2 / v1.2.3", () => {
  assert.deepEqual(parseSemanticVersion("v1"), { major: 1, minor: 0, patch: 0 });
  assert.deepEqual(parseSemanticVersion("v1.2"), { major: 1, minor: 2, patch: 0 });
  assert.deepEqual(parseSemanticVersion("v1.2.3"), { major: 1, minor: 2, patch: 3 });
});

test("summarizeSpuVersionDiff: includes added fields / rules / threshold changes", () => {
  const v1 = buildSpu("demo.compaction@v1", "v1", 93, false);
  const v2 = buildSpu("demo.compaction@v2", "v2", 95, true);

  const diff = summarizeSpuVersionDiff(v1, v2);

  assert.deepEqual(diff.addedFields.inputs, ["b"]);
  assert.equal(diff.ruleChanges.added.includes("RULE-2"), true);
  assert.equal(diff.thresholdChanges.some((item) => item.ruleId === "RULE-1" && item.before === 93 && item.after === 95), true);
});
