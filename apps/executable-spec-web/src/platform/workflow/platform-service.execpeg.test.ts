import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "./platform-service.ts";

const SPU_IDS = [
  "highway.subgrade.compaction.4.2.1@v1",
  "highway.subgrade.thickness.4.2.3@v1",
  "highway.subgrade.deflection.4.2.2@v1",
] as const;

function createDemoContainer(service: PlatformService): string {
  const slot = service.importSlot({
    station: "K19+070",
    chainage: 19070,
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "execpeg-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "lab-a",
    supervisor: "sup-a",
    autoBindSpuIds: [...SPU_IDS],
  });
  return container.containerId;
}

function createContainerAtStation(service: PlatformService, station: string): string {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "execpeg-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "lab-a",
    supervisor: "sup-a",
    autoBindSpuIds: [...SPU_IDS],
  });
  return container.containerId;
}

function assertSchedulerNext(service: PlatformService, containerId: string, expectedSpuId: string | null): void {
  const scheduler = service.getSchedulerNext(containerId);
  const nextSpuId = scheduler.nextTasks[0]?.spuId ?? null;
  assert.equal(nextSpuId, expectedSpuId);
}

test("ExecPeg v1: blocked SPU and single-active-SPU constraints are enforced", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);

  assert.throws(
    () => service.createNode({ containerId, spuId: SPU_IDS[1] }),
    /SPU is blocked by dependency/,
  );

  const compaction = service.createNode({ containerId, spuId: SPU_IDS[0] });
  assert.throws(
    () => service.createNode({ containerId, spuId: SPU_IDS[0] }),
    /Only one running SPU is allowed/,
  );

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
});

test("ExecPeg v1: full state-machine progression and auto-advance", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);
  assertSchedulerNext(service, containerId, SPU_IDS[0]);

  // Scenario A: compaction pass -> auto advance to thickness
  const compaction = service.createNode({ containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction.nodeId, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  assert.throws(() => service.finalizeNode(compaction.nodeId), /SPU is blocked by dependency/);
  service.signNode(compaction.nodeId, "lab");
  service.signNode(compaction.nodeId, "supervision");
  service.finalizeNode(compaction.nodeId);
  assertSchedulerNext(service, containerId, SPU_IDS[1]);

  let container = service.getContainer(containerId);
  assert.ok(container);
  assert.equal(container.runtime.currentSpuId, SPU_IDS[1]);
  assert.equal(container.runtime.currentNodeId, null);
  assert.equal(container.runtime.phase, "idle");

  // Scenario B: thickness fail -> deflection remains blocked
  const thicknessFail = service.createNode({ containerId, spuId: SPU_IDS[1] });
  service.submitNode(thicknessFail.nodeId, {
    measuredThickness: 180,
    designThickness: 200,
  });
  assert.throws(() => service.signNode(thicknessFail.nodeId, "lab"), /SPU is blocked by dependency/);
  service.finalizeNode(thicknessFail.nodeId);
  assertSchedulerNext(service, containerId, SPU_IDS[1]);

  container = service.getContainer(containerId);
  assert.ok(container);
  assert.equal(container.runtime.currentSpuId, SPU_IDS[1]);
  assert.equal(container.runtime.currentNodeId, null);
  assert.equal(container.runtime.phase, "idle");
  assert.throws(() => service.createNode({ containerId, spuId: SPU_IDS[2] }), /SPU is blocked by dependency/);

  // Scenario C: restart failed thickness and pass -> auto advance to deflection
  const thicknessRetry = service.createNode({ containerId, spuId: SPU_IDS[1] });
  service.submitNode(thicknessRetry.nodeId, {
    measuredThickness: 205,
    designThickness: 200,
  });
  service.signNode(thicknessRetry.nodeId, "lab");
  service.signNode(thicknessRetry.nodeId, "supervision");
  service.finalizeNode(thicknessRetry.nodeId);
  assertSchedulerNext(service, containerId, SPU_IDS[2]);

  container = service.getContainer(containerId);
  assert.ok(container);
  assert.equal(container.runtime.currentSpuId, SPU_IDS[2]);
  assert.equal(container.runtime.phase, "idle");

  // Scenario D: deflection pass -> completed with no current SPU
  const deflection = service.createNode({ containerId, spuId: SPU_IDS[2] });
  service.submitNode(deflection.nodeId, {
    deflectionValue: 18,
    maxAllowedDeflection: 20,
  });
  service.signNode(deflection.nodeId, "lab");
  service.signNode(deflection.nodeId, "supervision");
  service.finalizeNode(deflection.nodeId);
  assertSchedulerNext(service, containerId, null);

  container = service.getContainer(containerId);
  assert.ok(container);
  assert.equal(container.runtime.currentSpuId, null);
  assert.equal(container.runtime.currentNodeId, null);
  assert.equal(container.runtime.phase, "completed");
  assert.equal(container.lifecycleState, "VERIFIED");
  assert.equal(container.overallStatus, "PASS");
});

test("Project scheduler: chooses earliest station container and first executable SPU", () => {
  const service = new PlatformService();
  createContainerAtStation(service, "K19+080");
  createContainerAtStation(service, "K19+060");
  createContainerAtStation(service, "K19+070");

  const project = service.getProjectScheduler();
  assert.equal(project.action, "PROJECT_EXECUTE");
  assert.equal(project.nextContainer, "K19+060");
  assert.equal(project.nextTask, SPU_IDS[0]);
  assert.ok(project.containerDetails.length >= 3);
});

test("Project scheduler: single real container is expanded to multi-container candidates", () => {
  const service = new PlatformService();
  const containerId = createContainerAtStation(service, "K19+070");
  const currentNode = service.createNode({ containerId, spuId: SPU_IDS[0] });
  assert.ok(currentNode.nodeId);

  const project = service.getProjectScheduler();
  assert.ok(project.input.containers.length >= 3);
  assert.equal(project.nextContainer, "K19+070");
  assert.equal(project.action, "PROJECT_WAIT");
  assert.ok(project.containerDetails.some((item) => item.containerId === "K19+060"));
  assert.ok(project.containerDetails.some((item) => item.containerId === "K19+080"));
  assert.ok(project.containerDetails.some((item) => item.containerId === "K19+070" && item.selected));
});
