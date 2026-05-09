import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { InputValidationError, validateAndNormalizeSpuInputs } from "./input-normalizer.ts";

function buildSpu(): SPUDefinition {
  return {
    spuId: "demo.input.normalizer@v1",
    meta: {
      name: "Input Normalizer Demo",
      norm: "DEMO-NORM",
      clause: "1.0",
      version: "v1",
    },
    data: {
      inputs: [
        {
          name: "thickness",
          type: "number",
          label: "Thickness",
          unit: "mm",
          range: {
            min: 0,
            max: 500,
          },
        },
        {
          name: "moisture",
          type: "number",
          label: "Moisture",
          unit: "%",
        },
        {
          name: "approved",
          type: "boolean",
          label: "Approved",
        },
      ],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "copy", formula: "result = thickness" }],
    rules: [
      {
        ruleId: "RULE-1",
        field: "result",
        operator: ">=",
        threshold: 0,
        message: "result should be >=0",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
  };
}

test("input normalizer: validates required fields and normalizes units", () => {
  const spu = buildSpu();
  const normalized = validateAndNormalizeSpuInputs(spu, {
    thickness: { value: 20, unit: "cm" },
    moisture: "8 %",
    approved: "yes",
    __gateOverride: {
      approvedBy: "qa-lead",
      reason: "manual review completed",
    },
  });

  assert.equal(normalized.normalizedInputs.thickness, 200);
  assert.equal(normalized.normalizedInputs.moisture, 8);
  assert.equal(normalized.normalizedInputs.approved, true);
  assert.equal(typeof normalized.normalizedInputs.__gateOverride, "object");
  assert.equal(normalized.conversions.some((item) => item.field === "thickness"), true);
});

test("input normalizer: throws on missing/type/range validation errors", () => {
  const spu = buildSpu();

  assert.throws(
    () =>
      validateAndNormalizeSpuInputs(spu, {
        thickness: -1,
        moisture: "120%",
      }),
    (error) => {
      assert.ok(error instanceof InputValidationError);
      const fields = error.issues.map((item) => item.field);
      assert.equal(fields.includes("approved"), true);
      assert.equal(fields.includes("thickness"), true);
      assert.equal(fields.includes("moisture"), true);
      return true;
    },
  );
});
