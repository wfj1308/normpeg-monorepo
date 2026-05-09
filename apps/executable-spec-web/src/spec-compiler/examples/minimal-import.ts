import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compileMarkdownSpec } from "../json_compiler.ts";
import { PlatformService } from "../../platform/workflow/platform-service.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const markdownPath = resolve(currentDir, "subgrade-compaction.md");
const markdown = readFileSync(markdownPath, "utf-8");

const compiled = compileMarkdownSpec(markdown);
const service = new PlatformService();
const imported = service.importSpuDefinition(JSON.stringify(compiled), "compiled");

const slot = service.importSlot({
  station: "K19+070",
  chainage: 19070,
  x: 128.25,
  y: 62.5,
  elevation: 135.4,
  alignment: "A1",
  sourceFile: "markdown-compiler-example.csv",
});

const container = service.createContainer({
  geoSlotRef: slot.slotId,
  inspector: "lab",
  supervisor: "supervision",
  autoBindSpuIds: [imported.spuId],
});

const node = service.createNode({
  containerId: container.containerId,
  spuId: imported.spuId,
});

service.submitNode(node.nodeId, {
  massHoleSand: 1980,
  volumeSand: 1000,
  moistureContent: 5,
  maxDryDensity: 1.95,
});
service.signNode(node.nodeId, "lab");
service.signNode(node.nodeId, "supervision");
const finalized = service.finalizeNode(node.nodeId);

// eslint-disable-next-line no-console
console.log(
  JSON.stringify(
    {
      spuId: imported.spuId,
      nodeId: node.nodeId,
      finalStatus: finalized.status,
      proofResultField: finalized.proof?.resultField ?? null,
    },
    null,
    2,
  ),
);
