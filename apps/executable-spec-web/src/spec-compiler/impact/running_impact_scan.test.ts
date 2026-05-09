import assert from "node:assert/strict";
import test from "node:test";

import { buildRunningImpactScan } from "./running_impact_scan.ts";
import type { RunningContainer } from "./running_container_scanner.ts";

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
      outputs: ["compactionDegree"],
    },
    path: [{ step: "1", formula: "compactionDegree = dryDensity / maxDryDensity * 100" }],
    rules: [{ field: "compactionDegree", operator: ">=", value: threshold, message: "压实度阈值" }],
    proof: {
      requiredSignatures: ["lab", "supervision"],
    },
    dependsOn: [],
  };
}

function buildContainer(
  containerId: string,
  lifecycleState: RunningContainer["lifecycleState"],
  status: "blocked" | "ready" | "running" | "pass" | "fail",
): RunningContainer {
  return {
    containerId,
    lifecycleState,
    normExecution: {
      applicableSpecs: [
        {
          spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
          status,
          latestNode: null,
        },
      ],
    },
  };
}

test("场景1：运行中容器 -> high", () => {
  const oldSpec = buildSpec("v1", 93);
  const newSpec = buildSpec("v2", 95);
  const containers = [buildContainer("K19+070", "active", "running")];

  const scan = buildRunningImpactScan(oldSpec.spuId, newSpec, containers, oldSpec);
  const target = scan.affectedContainers[0];

  assert.equal(target.impactLevel, "high");
  assert.equal(target.containerState, "running");
  assert.match(target.message, /执行旧版规范/);
});

test("场景2：已完成容器 -> medium", () => {
  const oldSpec = buildSpec("v1", 93);
  const newSpec = buildSpec("v2", 95);
  const containers = [buildContainer("K19+060", "validated", "pass")];

  const scan = buildRunningImpactScan(oldSpec.spuId, newSpec, containers, oldSpec);
  const target = scan.affectedContainers[0];

  assert.equal(target.impactLevel, "medium");
  assert.equal(target.containerState, "completed");
  assert.match(target.message, /建议做差异复核/);
});

test("场景3：草稿容器 -> low", () => {
  const oldSpec = buildSpec("v1", 93);
  const newSpec = buildSpec("v2", 95);
  const containers = [buildContainer("K19+080", "draft", "ready")];

  const scan = buildRunningImpactScan(oldSpec.spuId, newSpec, containers, oldSpec);
  const target = scan.affectedContainers[0];

  assert.equal(target.impactLevel, "low");
  assert.equal(target.containerState, "draft");
  assert.match(target.message, /尚未执行/);
});
