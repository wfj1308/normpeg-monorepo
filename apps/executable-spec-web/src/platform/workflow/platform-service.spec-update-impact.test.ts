import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../types.ts";
import { PlatformService } from "./platform-service.ts";

const SPU_KEY = "demo.spec.patch.compaction";
const SPU_V1 = `${SPU_KEY}@v1`;
const SPU_V2 = `${SPU_KEY}@v2`;

function buildSpu(spuId: string, version: string, threshold: number): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Spec Patch Demo",
      norm: "DEMO-NORM",
      clause: "1.0.0",
      version,
      measuredItem: "compaction",
    },
    data: {
      inputs: [{ name: "value", type: "number", label: "Value" }],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-1",
        field: "result",
        operator: ">=",
        threshold,
        message: "should pass",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

function createContainer(service: PlatformService, station: string, projectId: string) {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 1,
    y: 2,
    elevation: 3,
    sourceFile: "spec-update-impact.csv",
  });
  return service.createContainer({
    projectId,
    geoSlotRef: slot.slotId,
    autoBindSpuKeys: [SPU_KEY],
  });
}

test("spec update impact: apply patch marks old results invalid and generates retest list", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.bindProjectSpuVersion({
    projectId: "project-alpha",
    spuKey: SPU_KEY,
    selector: { version: "v1" },
  });

  const container = createContainer(service, "K10+001", "project-alpha");
  const node = service.createNode({
    containerId: container.containerId,
    spuId: SPU_V1,
  });
  const submitted = service.submitNode(node.nodeId, { value: 91 });
  const finalized = service.finalizeNode(submitted.nodeId);
  assert.equal(finalized.status, "FINAL_PASS");

  const patch = service.applySpecPatch({
    oldSpuId: SPU_V1,
    newDefinition: buildSpu(SPU_V2, "v2", 88),
    note: "raise compatibility and rerun",
  });

  assert.equal(patch.oldSpuId, SPU_V1);
  assert.equal(patch.newSpuId, SPU_V2);
  assert.equal(patch.diffSummary.toSpuId, SPU_V2);
  assert.equal(patch.affectedExecutions.some((item) => item.nodeId === node.nodeId && item.invalidated), true);
  assert.equal(patch.pendingRetests.some((item) => item.containerId === container.containerId), true);
  assert.equal(service.getProjectSpuBinding("project-alpha", SPU_KEY)?.activeSpuId, SPU_V2);

  const updatedOldNode = service.getNode(node.nodeId);
  assert.ok(updatedOldNode?.proof);
  const invalidation = (updatedOldNode?.proof?.extensions as Record<string, unknown> | undefined)?.specPatchInvalidation as
    | Record<string, unknown>
    | undefined;
  assert.equal(String(invalidation?.patchId ?? ""), patch.patchId);

  const updatedContainer = service.getContainer(container.containerId);
  const oldBinding = updatedContainer?.specBindings.find((item) => item.spuId === SPU_V1) ?? null;
  assert.ok(oldBinding);
  assert.equal(oldBinding?.status, "DRAFT");
});

test("spec update impact: rerun patch can execute new version in one click", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildSpu(SPU_V1, "v1", 90));
  service.bindProjectSpuVersion({
    projectId: "project-beta",
    spuKey: SPU_KEY,
    selector: { version: "v1" },
  });

  const container = createContainer(service, "K10+002", "project-beta");
  const node = service.createNode({
    containerId: container.containerId,
    spuId: SPU_V1,
  });
  const submitted = service.submitNode(node.nodeId, { value: 91 });
  service.finalizeNode(submitted.nodeId);

  const patch = service.applySpecPatch({
    oldSpuId: SPU_V1,
    newDefinition: buildSpu(SPU_V2, "v2", 88),
    note: "rerun for new threshold",
  });

  const rerun = service.rerunSpecUpdatePatch({
    patchId: patch.patchId,
  });

  assert.equal(rerun.summary.totalCandidates >= 1, true);
  assert.equal(rerun.summary.rerunTriggered >= 1, true);

  const updatedContainer = service.getContainer(container.containerId);
  const activeBinding = updatedContainer?.specBindings.find((item) => item.spuKey === SPU_KEY) ?? null;
  assert.ok(activeBinding);
  assert.equal(activeBinding?.spuId, SPU_V2);
  assert.ok(activeBinding?.latestNodeId);

  const latestNode = service.getNode(String(activeBinding?.latestNodeId));
  assert.equal(latestNode?.spuId, SPU_V2);
  assert.equal(latestNode?.proof?.matchedSpecVersion, "v2");
  assert.ok(latestNode?.proof?.proofId);

  const refreshedPatch = service.getSpecUpdatePatch(patch.patchId);
  assert.ok(refreshedPatch?.lastRerunAt);
});
