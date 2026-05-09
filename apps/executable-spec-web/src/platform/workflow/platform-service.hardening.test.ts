import assert from "node:assert/strict";
import test from "node:test";

import { PlatformService } from "./platform-service.ts";

const COMPACTION_SPU = "highway.subgrade.compaction.4.2.1@v1";

function createContainer(service: PlatformService, station: string): string {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "hardening-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "lab-a",
    supervisor: "sup-a",
    autoBindSpuIds: [COMPACTION_SPU],
  });
  return container.containerId;
}

function runCompaction(service: PlatformService, containerId: string, inputs: Record<string, unknown>) {
  const node = service.createNode({
    containerId,
    spuId: COMPACTION_SPU,
  });
  const afterSubmit = service.submitNode(node.nodeId, inputs);
  service.signNode(node.nodeId, "lab");
  service.signNode(node.nodeId, "supervision");
  const afterFinalize = service.finalizeNode(node.nodeId);
  return {
    submitted: afterSubmit,
    finalized: afterFinalize,
  };
}

test("SPU hardening: equivalent units produce consistent execution result", () => {
  const service = new PlatformService();

  const containerNative = createContainer(service, "K77+001");
  const native = runCompaction(service, containerNative, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });

  const containerConverted = createContainer(service, "K77+002");
  const converted = runCompaction(service, containerConverted, {
    massHoleSand: { value: 1.98, unit: "kg" },
    massSandCone: { value: 0.5, unit: "kg" },
    volumeSand: { value: 1, unit: "l" },
    moistureContent: { value: 0.05, unit: "ratio" },
    maxDryDensity: { value: 1950, unit: "kg/m3" },
  });

  assert.equal(native.submitted.status, "SIGNING");
  assert.equal(converted.submitted.status, "SIGNING");
  assert.equal(native.finalized.status, "FINAL_PASS");
  assert.equal(converted.finalized.status, "FINAL_PASS");

  assert.equal(native.submitted.outputs.compactionDegree, converted.submitted.outputs.compactionDegree);
  assert.ok((converted.submitted.inputValidation?.conversions.length ?? 0) > 0);
});

test("SPU hardening: proof contains input/calculation/decision/timestamps/signatures", () => {
  const service = new PlatformService();
  const containerId = createContainer(service, "K77+003");
  const result = runCompaction(service, containerId, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });

  const proof = result.finalized.proof;
  assert.ok(proof);
  assert.ok(proof?.inputSnapshot);
  assert.ok(Array.isArray(proof?.trace));
  assert.ok(Array.isArray(proof?.matchedRules));
  assert.ok(proof?.timestamps.createdAt);
  assert.ok(proof?.timestamps.finalizedAt);
  assert.ok(Array.isArray(proof?.signatures));

  const details = (proof?.technicalDetails ?? {}) as Record<string, unknown>;
  assert.ok(details.inputSnapshot);
  assert.ok(details.calculationChain);
  assert.ok(details.decisionBasis);
});

test("SPU hardening: container state mutation is traceable by gate/manual trigger", () => {
  const service = new PlatformService();
  const containerId = createContainer(service, "K77+004");
  const node = service.createNode({
    containerId,
    spuId: COMPACTION_SPU,
  });
  service.submitNode(node.nodeId, {
    massHoleSand: 1500,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });

  const trail = service.getContainerAuditTrail(containerId);
  const stateEvents = trail.filter((item) => item.eventType === "CONTAINER_STATE_CHANGED");
  assert.ok(stateEvents.length > 0);

  const triggers = stateEvents
    .map((item) => (item.payload as Record<string, unknown>).trigger)
    .filter((item): item is string => typeof item === "string");
  assert.equal(triggers.length > 0, true);
  assert.equal(triggers.every((item) => item === "manual" || item === "gate"), true);
});
