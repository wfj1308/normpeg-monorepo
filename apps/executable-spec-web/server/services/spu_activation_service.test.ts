import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { buildActivationPolicyOnRegister } from "./spu_activation_service.ts";

function buildSpec(version: string, threshold: number) {
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
      inputs: [{ name: "massHoleSand", type: "number", unit: "g", label: "灌入砂质量" }],
      outputs: [{ name: "compactionDegree", label: "压实度", unit: "%" }],
    },
    path: [{ step: "1", formula: "compactionDegree = massHoleSand" }],
    rules: [{ field: "compactionDegree", operator: ">=", value: threshold, message: "压实度阈值" }],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: [],
    },
    dependsOn: [],
  };
}

test("buildActivationPolicyOnRegister: 默认 new_containers_only 并推荐新建容器用新版", () => {
  const service = new PlatformService();
  const oldSpec = buildSpec("v1", 93);
  const newSpec = buildSpec("v2", 95);
  service.importSpuDefinition(JSON.stringify(oldSpec), "compiled");

  const result = buildActivationPolicyOnRegister(service, newSpec, oldSpec.spuId);

  assert.equal(result.activationMode, "new_containers_only");
  assert.equal(result.defaultActiveSpuId, newSpec.spuId);
  assert.equal(result.policy.previousSpuId, oldSpec.spuId);
});
