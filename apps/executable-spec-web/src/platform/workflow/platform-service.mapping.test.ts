import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { PlatformService } from "./platform-service.ts";

function buildMappingDemoSpu(spuId: string): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Mapping Demo SPU",
      norm: "MAPPING-NORM",
      clause: "M-1",
      version: "v1",
      category: "mapping",
      measuredItem: "demo",
    },
    data: {
      inputs: [
        { name: "value", type: "number", label: "Value" },
        { name: "threshold", type: "number", label: "Threshold" },
      ],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-MAP-1",
        field: "result",
        operator: ">=",
        threshold: {
          inputRef: "threshold",
        },
        message: "result should pass threshold",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

test("mapping kernel: should resolve by stake/container/node and keep summary updated after execution", () => {
  const service = new PlatformService();
  const spuId = "demo.mapping.kernel@v1";
  service.publishSpuVersion(buildMappingDemoSpu(spuId));

  const slot = service.importSlot({
    station: "K30+010",
    chainage: 30010,
    x: 300.1,
    y: 88.2,
    elevation: 20.3,
    alignment: "A2",
    sourceFile: "mapping-kernel.csv",
  });
  const container = service.createContainer({
    projectId: "project-mapping",
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [spuId],
  });

  const stakeDraft = service.queryMappingByStake("K30+010");
  assert.ok(stakeDraft);
  assert.equal(stakeDraft?.containerRefs[0]?.containerId, container.containerId);
  assert.ok(stakeDraft?.containerRefs[0]?.vuri?.startsWith("v://project-mapping/container/"));
  assert.equal(stakeDraft?.activeSpecs[0]?.spuId, spuId);
  assert.equal(stakeDraft?.nodeRefs.length, 0);

  const node = service.createNode({
    containerId: container.containerId,
    spuId,
  });
  service.submitNode(node.nodeId, {
    value: 96,
    threshold: 90,
  });
  service.finalizeNode(node.nodeId);

  const byStake = service.queryMappingByStake("K30+010");
  assert.ok(byStake);
  assert.equal(byStake?.projectId, "project-mapping");
  assert.equal(byStake?.stake, "K30+010");
  assert.equal(byStake?.currentStateSummary.latestNodeId, node.nodeId);
  assert.equal(byStake?.currentStateSummary.latestNodeStatus, "FINAL_PASS");
  assert.ok(byStake?.nodeRefs[0]?.vuri?.startsWith("v://project-mapping/node/"));
  assert.ok(byStake?.activeProofs[0]?.vuri?.startsWith("v://project-mapping/proof/"));
  assert.equal(byStake?.activeProofs.some((item) => item.proofKind === "node_final" && item.status === "PASS"), true);

  const byContainer = service.queryMappingByContainerId(container.containerId);
  assert.ok(byContainer);
  assert.equal(byContainer?.containerRefs[0]?.containerId, container.containerId);

  const byNode = service.queryMappingByNodeId(node.nodeId);
  assert.ok(byNode);
  assert.equal(byNode?.containerRefs[0]?.containerId, container.containerId);

  const listed = service.listMappingEntries({ stake: "K30+010" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.currentStateSummary.latestNodeId, node.nodeId);
  assert.equal(listed[0]?.activeProofs[0]?.proofKind, "node_final");
});

test("mapping kernel: unknown stake/container/node should return null", () => {
  const service = new PlatformService();
  assert.equal(service.queryMappingByStake("K99+999"), null);
  assert.equal(service.queryMappingMinimalByStake("K99+999"), null);
  assert.equal(service.queryMappingByContainerId("container-missing"), null);
  assert.equal(service.queryMappingByNodeId("node-missing"), null);
});

test("mapping minimal: by stake should aggregate all container execution states", () => {
  const service = new PlatformService();
  const spuId = "demo.mapping.minimal@v1";
  service.publishSpuVersion(buildMappingDemoSpu(spuId));

  const slot = service.importSlot({
    station: "K30+020",
    chainage: 30020,
    x: 301.1,
    y: 89.2,
    elevation: 20.9,
    alignment: "A2",
    sourceFile: "mapping-minimal.csv",
  });

  const c1 = service.createContainer({
    containerId: "container-min-1",
    projectId: "project-minimal",
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [spuId],
  });
  const c2 = service.createContainer({
    containerId: "container-min-2",
    projectId: "project-minimal",
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [spuId],
  });

  const n1 = service.createNode({ containerId: c1.containerId, spuId });
  service.submitNode(n1.nodeId, { value: 96, threshold: 90 });
  service.finalizeNode(n1.nodeId);

  const n2 = service.createNode({ containerId: c2.containerId, spuId });
  service.submitNode(n2.nodeId, { value: 85, threshold: 90 });
  service.finalizeNode(n2.nodeId);

  const minimal = service.queryMappingMinimalByStake("K30+020");
  assert.ok(minimal);
  assert.equal(minimal?.stake, "K30+020");
  assert.equal(minimal?.summary.containerCount, 2);
  assert.equal(minimal?.containers.length, 2);
  assert.equal(minimal?.summary.totalSpuCount, 2);
  assert.equal(minimal?.summary.passSpuCount, 1);
  assert.equal(minimal?.summary.failSpuCount, 1);
  assert.equal(minimal?.summary.totalProofCount >= 2, true);
  assert.equal(minimal?.containers.every((item) => item.container.containerId.startsWith("container-min-")), true);
  assert.equal(
    minimal?.containers.some((item) => item.proofSummary.latestProofStatus === "PASS"),
    true,
  );
  assert.equal(
    minimal?.containers.some((item) => item.proofSummary.latestProofStatus === "FAIL"),
    true,
  );
});
