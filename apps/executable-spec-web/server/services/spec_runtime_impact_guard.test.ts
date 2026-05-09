import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { evaluateSpecRuntimeImpactGuard } from "./spec_runtime_impact_guard.ts";

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

test("evaluateSpecRuntimeImpactGuard: 扫描使用旧版 SPU 的运行中容器", () => {
  const service = new PlatformService();
  const oldSpec = buildSpec("v1", 93);
  const newSpec = buildSpec("v2", 95);
  service.importSpuDefinition(JSON.stringify(oldSpec), "compiled");

  const slot = service.importSlot({
    station: "K19+070",
    chainage: 19070,
    x: 0,
    y: 0,
    elevation: 0,
    sourceFile: "test",
  });
  const container = service.createContainer({
    containerId: "K19+070",
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [oldSpec.spuId],
  });
  service.createNode({ containerId: container.containerId, spuId: oldSpec.spuId });

  const result = evaluateSpecRuntimeImpactGuard(service, newSpec, oldSpec.spuId);

  assert.equal(result.hasRuntimeImpact, true);
  assert.equal(result.runningImpactScan?.summary.totalAffected, 1);
  assert.equal(result.runningImpactScan?.summary.running, 1);
  assert.equal(result.runningImpactScan?.affectedContainers[0]?.impactLevel, "high");
});
