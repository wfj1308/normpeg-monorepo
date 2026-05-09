import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "./platform-service.ts";

const SPU_IDS = [
  "highway.subgrade.compaction.4.2.1@v1",
  "highway.subgrade.thickness.4.2.3@v1",
  "highway.subgrade.deflection.4.2.2@v1",
] as const;

function createContainer(service: PlatformService): string {
  const slot = service.importSlot({
    station: "K25+010",
    chainage: 25010,
    x: 101,
    y: 22,
    elevation: 8,
    alignment: "A1",
    sourceFile: "runtime-minimal-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [...SPU_IDS],
  });
  return container.containerId;
}

function signAllRequired(service: PlatformService, nodeId: string): void {
  const node = service.getNode(nodeId);
  if (!node) {
    throw new Error(`node not found: ${nodeId}`);
  }
  for (const role of node.requiredSignatures) {
    service.signNode(nodeId, role);
  }
}

function buildValidInputsWithOverride(service: PlatformService, spuId: string): Record<string, unknown> {
  const spu = service.getRegistry().find((item) => item.spuId === spuId);
  if (!spu) {
    throw new Error(`spu not found: ${spuId}`);
  }
  const inputs: Record<string, unknown> = {};
  for (const field of spu.data.inputs) {
    if (field.type === "number") {
      const min = typeof field.range?.min === "number" ? field.range.min : undefined;
      const max = typeof field.range?.max === "number" ? field.range.max : undefined;
      let value = typeof min === "number" ? min : 1;
      if (typeof max === "number" && value > max) {
        value = max;
      }
      inputs[field.name] = value;
      continue;
    }
    if (field.type === "boolean") {
      inputs[field.name] = true;
      continue;
    }
    inputs[field.name] = "ok";
  }
  inputs.__gateOverride = {
    approvedBy: "runtime-minimal-test",
    reason: "archive-ready path test",
  };
  return inputs;
}

test("runtime minimal: container should expose multi-SPU state and next suggestion", () => {
  const service = new PlatformService();
  const containerId = createContainer(service);

  const runtime = service.getRuntimeMinimal(containerId);

  assert.equal(runtime.containerId, containerId);
  assert.equal(runtime.spuStates.length, 3);
  assert.deepEqual(
    runtime.spuStates.map((item) => ({ spuId: item.spuId, dependsOn: item.dependsOn })),
    [
      { spuId: SPU_IDS[0], dependsOn: [] },
      { spuId: SPU_IDS[1], dependsOn: [SPU_IDS[0]] },
      { spuId: SPU_IDS[2], dependsOn: [SPU_IDS[0], SPU_IDS[1]] },
    ],
  );
  assert.equal(runtime.nextSuggestion.action, "EXECUTE");
  assert.equal(runtime.nextSuggestion.nextSpuId, SPU_IDS[0]);
});

test("runtime minimal: after previous SPU pass, next SPU becomes executable", () => {
  const service = new PlatformService();
  const containerId = createContainer(service);

  const compaction = service.createNode({ containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction.nodeId, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  service.signNode(compaction.nodeId, "lab");
  service.signNode(compaction.nodeId, "supervision");
  service.finalizeNode(compaction.nodeId);

  const runtime = service.getRuntimeMinimal(containerId);
  assert.equal(runtime.nextSuggestion.action, "EXECUTE");
  assert.equal(runtime.nextSuggestion.nextSpuId, SPU_IDS[1]);
  const first = runtime.spuStates.find((item) => item.spuId === SPU_IDS[0]);
  assert.equal(first?.status, "pass");
});

test("runtime minimal: failed SPU should be suggested for retry", () => {
  const service = new PlatformService();
  const containerId = createContainer(service);

  const compaction = service.createNode({ containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction.nodeId, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  service.signNode(compaction.nodeId, "lab");
  service.signNode(compaction.nodeId, "supervision");
  service.finalizeNode(compaction.nodeId);

  const thickness = service.createNode({ containerId, spuId: SPU_IDS[1] });
  service.submitNode(thickness.nodeId, {
    measuredThickness: 180,
    designThickness: 200,
  });
  service.finalizeNode(thickness.nodeId);

  const runtime = service.getRuntimeMinimal(containerId);
  assert.equal(runtime.nextSuggestion.action, "RETRY_FAILED");
  assert.equal(runtime.nextSuggestion.nextSpuId, SPU_IDS[1]);
  const second = runtime.spuStates.find((item) => item.spuId === SPU_IDS[1]);
  assert.equal(second?.status, "fail");
});

test("runtime minimal: all SPUs pass should return archive-ready suggestion", () => {
  const service = new PlatformService();
  const containerId = createContainer(service);

  const compaction = service.createNode({ containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction.nodeId, buildValidInputsWithOverride(service, SPU_IDS[0]));
  service.signNode(compaction.nodeId, "lab");
  service.signNode(compaction.nodeId, "supervision");
  service.finalizeNode(compaction.nodeId);

  const thickness = service.createNode({ containerId, spuId: SPU_IDS[1] });
  service.submitNode(thickness.nodeId, buildValidInputsWithOverride(service, SPU_IDS[1]));
  signAllRequired(service, thickness.nodeId);
  service.finalizeNode(thickness.nodeId);

  const deflection = service.createNode({ containerId, spuId: SPU_IDS[2] });
  service.submitNode(deflection.nodeId, buildValidInputsWithOverride(service, SPU_IDS[2]));
  signAllRequired(service, deflection.nodeId);
  service.finalizeNode(deflection.nodeId);

  const runtime = service.getRuntimeMinimal(containerId);
  assert.equal(runtime.nextSuggestion.action, "ARCHIVE_READY");
  assert.equal(runtime.nextSuggestion.nextSpuId, null);
  assert.equal(runtime.spuStates.every((item) => item.status === "pass"), true);
});
