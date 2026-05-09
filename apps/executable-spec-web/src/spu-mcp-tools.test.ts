import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPULoader } from "./spu-loader.ts";
import {
  createSpuNodeTool,
  executeSpuNodeTool,
  getSpuNodeTool,
  registerSpuMcpTools,
  resetSpuMcpNodeStore,
  spuMcpToolDefinitions,
  validateSpuDirectTool,
} from "./mcp/spu-mcp-tools.ts";

const compactionId = "highway.subgrade.compaction.4.2.1.soil@v1";
const currentDir = dirname(fileURLToPath(import.meta.url));
const compactionYaml = readFileSync(resolve(currentDir, "./subgrade.compaction.spu.yaml"), "utf-8");

function ensureCompactionLoaded() {
  const loader = new SPULoader();
  loader.load(compactionYaml);
}

function passInputs() {
  return {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  };
}

test.beforeEach(() => {
  ensureCompactionLoaded();
  resetSpuMcpNodeStore();
});

test("create_spu_node creates a stored node", () => {
  const created = createSpuNodeTool({
    spuId: compactionId,
    context: {
      stake: "K0+120-K0+180",
      location: "Northbound",
    },
  });

  assert.equal(created.spuId, compactionId);
  assert.equal(created.status, "READY");
  assert.match(created.nodeId, /^spu-node-/);
});

test("execute_spu_node runs submitNode and returns outputs gate and proof", () => {
  const created = createSpuNodeTool({ spuId: compactionId });

  const executed = executeSpuNodeTool({
    nodeId: created.nodeId,
    formData: passInputs(),
  });

  assert.equal(executed.nodeId, created.nodeId);
  assert.equal(executed.spuId, compactionId);
  assert.equal(executed.status, "SIGNING");
  assert.equal(executed.resultStatus, "PASS");
  assert.equal(executed.outputs?.compactionDegree, 96.7026);
  assert.equal(executed.gate?.passed, true);
  assert.equal(executed.proof?.result.status, "PASS");
});

test("get_spu_node returns the latest stored state", () => {
  const created = createSpuNodeTool({ spuId: compactionId });
  executeSpuNodeTool({
    nodeId: created.nodeId,
    formData: passInputs(),
  });

  const current = getSpuNodeTool({ nodeId: created.nodeId });

  assert.equal(current.status, "SIGNING");
  assert.equal(current.resultStatus, "PASS");
  assert.deepEqual(current.inputs, passInputs());
  assert.equal(current.outputs?.compactionDegree, 96.7026);
  assert.ok(current.proof);
});

test("validate_spu_direct creates and executes in one call", () => {
  const result = validateSpuDirectTool({
    spuId: compactionId,
    formData: passInputs(),
  });

  assert.equal(result.spuId, compactionId);
  assert.equal(result.status, "SIGNING");
  assert.equal(result.resultStatus, "PASS");
  assert.equal(result.outputs?.compactionDegree, 96.7026);
  assert.equal(result.gate?.passed, true);
  assert.equal(result.proof?.result.status, "PASS");
});

test("tool definitions expose four MCP tools", () => {
  assert.equal(spuMcpToolDefinitions.length, 4);
  assert.deepEqual(
    spuMcpToolDefinitions.map((tool) => tool.name),
    ["create_spu_node", "execute_spu_node", "get_spu_node", "validate_spu_direct"],
  );
  assert.equal(spuMcpToolDefinitions[1]?.input_schema.type, "object");
});

test("registerSpuMcpTools exposes definition and handler pairs", () => {
  const registered: string[] = [];

  registerSpuMcpTools((definition, handler) => {
    registered.push(definition.name);
    assert.equal(typeof handler, "function");
  });

  assert.deepEqual(registered, ["create_spu_node", "execute_spu_node", "get_spu_node", "validate_spu_direct"]);
});

