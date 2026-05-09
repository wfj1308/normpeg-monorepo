import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { buildFormPegPreview, buildFormPegSchema } from "./formpeg-runtime.ts";

function buildSpu(): SPUDefinition {
  return {
    spuId: "demo.formpeg@v1",
    meta: {
      name: "FormPeg Demo",
      norm: "DEMO-NORM",
      clause: "2.1",
      version: "v1",
    },
    data: {
      inputs: [
        {
          name: "massHoleSand",
          type: "number",
          label: "湿砂质量",
          unit: "g",
          required: true,
        },
        {
          name: "volumeSand",
          type: "number",
          label: "砂体积",
          unit: "cm3",
          required: true,
        },
        {
          name: "moistureContent",
          type: "number",
          label: "含水率",
          unit: "%",
          required: true,
        },
        {
          name: "maxDryDensity",
          type: "number",
          label: "最大干密度",
          unit: "g/cm3",
          required: true,
        },
      ],
      outputs: [
        { name: "wetDensity", label: "湿密度" },
        { name: "dryDensity", label: "干密度" },
        { name: "compactionDegree", label: "压实度" },
      ],
    },
    path: [
      { step: "calc_wet", formula: "wetDensity = massHoleSand / volumeSand" },
      { step: "calc_dry", formula: "dryDensity = wetDensity / (1 + moistureContent / 100)" },
      { step: "calc_degree", formula: "compactionDegree = (dryDensity / maxDryDensity) * 100" },
    ],
    rules: [
      {
        ruleId: "degree-min",
        field: "compactionDegree",
        operator: ">=",
        threshold: 95,
        message: "压实度应不低于95%",
      },
    ],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab"],
    },
  };
}

test("formpeg schema includes unit and required markers", () => {
  const schema = buildFormPegSchema(buildSpu());
  assert.equal(schema.spuId, "demo.formpeg@v1");
  assert.equal(schema.fields.length, 4);
  assert.equal(schema.fields[0]?.unit, "g");
  assert.equal(schema.fields[0]?.required, true);
});

test("formpeg preview normalizes inputs and returns live gate pass", () => {
  const preview = buildFormPegPreview(buildSpu(), {
    massHoleSand: "1980",
    volumeSand: "1000 cm3",
    moistureContent: "5",
    maxDryDensity: "1.95",
  });

  assert.equal(preview.ready, true);
  assert.equal(preview.gate.passed, true);
  assert.equal(preview.missingFields.length, 0);
  assert.equal(Number(preview.outputs.compactionDegree) >= 95, true);
});

test("formpeg preview reports required missing fields without guessing", () => {
  const preview = buildFormPegPreview(buildSpu(), {
    massHoleSand: "1980",
    volumeSand: "",
    moistureContent: "5",
    maxDryDensity: "",
  });

  assert.equal(preview.ready, false);
  assert.equal(preview.missingFields.includes("volumeSand"), true);
  assert.equal(preview.missingFields.includes("maxDryDensity"), true);
});
