import { PlatformService } from "../workflow/platform-service.ts";
import { fileURLToPath } from "node:url";

const SPU_IDS = [
  "highway.subgrade.compaction.4.2.1@v1",
  "highway.subgrade.thickness.4.2.3@v1",
  "highway.subgrade.deflection.4.2.2@v1",
];

export function runSubgradeDemo(service = new PlatformService()) {
  const slot = service.importSlot({
    station: "K19+070",
    chainage: 19070,
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "demo_slots.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "lab-a",
    supervisor: "sup-a",
    autoBindSpuIds: SPU_IDS,
  });

  const compaction1 = service.createNode({ containerId: container.containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction1.nodeId, {
    massHoleSand: 1720,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 8,
    maxDryDensity: 1.95,
  });
  service.finalizeNode(compaction1.nodeId);

  const compaction2 = service.createNode({ containerId: container.containerId, spuId: SPU_IDS[0] });
  service.submitNode(compaction2.nodeId, {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  service.signNode(compaction2.nodeId, "lab");
  service.signNode(compaction2.nodeId, "supervision");
  service.finalizeNode(compaction2.nodeId);

  const thickness = service.createNode({ containerId: container.containerId, spuId: SPU_IDS[1] });
  service.submitNode(thickness.nodeId, {
    measuredThickness: 205,
    designThickness: 200,
  });
  service.signNode(thickness.nodeId, "lab");
  service.signNode(thickness.nodeId, "supervision");
  service.finalizeNode(thickness.nodeId);

  const deflection = service.createNode({ containerId: container.containerId, spuId: SPU_IDS[2] });
  service.submitNode(deflection.nodeId, {
    deflectionValue: 18,
    maxAllowedDeflection: 20,
  });
  service.signNode(deflection.nodeId, "lab");
  service.signNode(deflection.nodeId, "supervision");
  service.finalizeNode(deflection.nodeId);

  const verified = service.getContainer(container.containerId);
  const proof = service.archiveContainer(container.containerId);
  return {
    slot,
    container: verified,
    proof,
  };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = runSubgradeDemo();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}
