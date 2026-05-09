import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { evaluateSpecUpgradeGuard } from "./spec_upgrade_guard.ts";

function buildSpec(version: string, ruleValue = 93) {
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
    rules: [{ field: "compactionDegree", operator: ">=", value: ruleValue, message: "压实度阈值" }],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab", "supervision"],
    },
    dependsOn: [],
  };
}

test("evaluateSpecUpgradeGuard: 检测旧版本并输出 high 影响", () => {
  const service = new PlatformService();
  const oldSpec = buildSpec("v1", 93);
  service.importSpuDefinition(JSON.stringify(oldSpec), "compiled");

  const nextSpec = buildSpec("v2", 95);
  const result = evaluateSpecUpgradeGuard(service, nextSpec);

  assert.equal(result.hasBaseline, true);
  assert.equal(result.oldSpuId, oldSpec.spuId);
  assert.equal(result.impactAnalysis?.impactLevel, "high");
});
