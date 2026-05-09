import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { compileMarkdownSpec, parseMarkdownSpec } from "./index.ts";
import { PlatformService } from "../platform/workflow/platform-service.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(currentDir, "examples");

function readExampleMarkdown(): string {
  return readFileSync(resolve(examplesDir, "subgrade-compaction.md"), "utf-8");
}

function readExampleJSON() {
  return JSON.parse(readFileSync(resolve(examplesDir, "subgrade-compaction.json"), "utf-8")) as unknown;
}

test("Spec Compiler v1: parse markdown blocks with fixed template", () => {
  const parsed = parseMarkdownSpec(readExampleMarkdown());

  assert.equal(parsed.title, "路基压实度（土质）");
  assert.equal(parsed.meta.norm, "JTG F80/1-2017");
  assert.equal(parsed.meta.clause, "4.2.1");
  assert.equal(parsed.meta.version, "v1");
  assert.equal(parsed.meta.category, "subgrade");
  assert.equal(parsed.meta.measuredItem, "compaction");
  assert.equal(parsed.inputs.length, 4);
  assert.deepEqual(parsed.outputs, ["wetDensity", "dryDensity", "compactionDegree"]);
  assert.equal(parsed.calculations.length, 3);
  assert.equal(parsed.rules[0]?.field, "compactionDegree");
  assert.equal(parsed.rules[0]?.operator, ">=");
  assert.equal(parsed.rules[0]?.value, 93);
  assert.deepEqual(parsed.signatures, ["lab", "supervision"]);
  assert.deepEqual(parsed.dependsOn, []);
});

test("Spec Compiler v1: compile markdown to executable JSON", () => {
  const compiled = compileMarkdownSpec(readExampleMarkdown());
  const expected = readExampleJSON();
  assert.deepEqual(compiled, expected);
});

test("Spec Compiler v1: compiled JSON can be imported and executed by platform service", () => {
  const service = new PlatformService();
  const compiled = compileMarkdownSpec(readExampleMarkdown());
  const imported = service.importSpuDefinition(JSON.stringify(compiled), "compiled");

  assert.equal(imported.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");

  const slot = service.importSlot({
    station: "K19+070",
    chainage: 19070,
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "spec-compiler-test.csv",
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

  const submitted = service.submitNode(node.nodeId, {
    massHoleSand: 1980,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  assert.equal(submitted.status, "SIGNING");

  service.signNode(node.nodeId, "lab");
  service.signNode(node.nodeId, "supervision");
  const finalized = service.finalizeNode(node.nodeId);
  assert.equal(finalized.status, "FINAL_PASS");
  assert.equal(finalized.proof?.resultField, "compactionDegree");

  const archivedProof = service.archiveContainer(container.containerId);
  assert.equal(archivedProof.specResults[0]?.spuId, imported.spuId);
  assert.equal(archivedProof.overallStatus, "PASS");
});
