import assert from "node:assert/strict";
import test from "node:test";

import { buildSpecImpactAnalysis } from "./spec_impact_analysis.ts";

function buildBaseSpec(version = "v1") {
  return {
    spuId: `highway.subgrade.compaction.4.2.1.soil@${version}`,
    meta: {
      name: "路基压实度（土质）",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version,
      category: "subgrade",
      measuredItem: "compaction",
    },
    data: {
      inputs: [
        { name: "massHoleSand", type: "number", unit: "g", label: "灌入砂质量" },
        { name: "volumeSand", type: "number", unit: "cm3", label: "标定体积" },
      ],
      outputs: ["compactionDegree"],
    },
    path: [{ step: "1", formula: "compactionDegree = dryDensity / maxDryDensity * 100" }],
    rules: [{ field: "compactionDegree", operator: ">=", value: 93, message: "压实度必须 ≥ 93%" }],
    proof: {
      requiredSignatures: ["lab", "supervision"],
    },
    dependsOn: [],
  };
}

test("场景1：阈值变化 -> high / gate / requiresReview", () => {
  const oldSpec = buildBaseSpec("v1");
  const newSpec = buildBaseSpec("v2");
  newSpec.rules[0].value = 95;
  newSpec.rules[0].message = "压实度必须 ≥ 95%";

  const analysis = buildSpecImpactAnalysis(oldSpec, newSpec);

  assert.equal(analysis.hasImpact, true);
  assert.equal(analysis.impactLevel, "high");
  assert.ok(analysis.affectedAreas.includes("gate"));
  assert.equal(analysis.requiresReview, true);
});

test("场景2：签字要求变化 -> medium / proof", () => {
  const oldSpec = buildBaseSpec("v1");
  const newSpec = buildBaseSpec("v2");
  newSpec.proof.requiredSignatures = ["lab", "supervision", "owner"];

  const analysis = buildSpecImpactAnalysis(oldSpec, newSpec);

  assert.equal(analysis.impactLevel, "medium");
  assert.ok(analysis.affectedAreas.includes("proof"));
  assert.equal(analysis.requiresReview, false);
});

test("场景3：仅版本变化 -> low", () => {
  const oldSpec = buildBaseSpec("v1");
  const newSpec = buildBaseSpec("v2");

  const analysis = buildSpecImpactAnalysis(oldSpec, newSpec);

  assert.equal(analysis.impactLevel, "low");
  assert.equal(analysis.hasImpact, true);
});
