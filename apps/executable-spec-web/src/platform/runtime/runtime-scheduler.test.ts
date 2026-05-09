import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeContainerTaskModels,
  buildRuntimeProjectExecuteSuggestion,
  computeRuntimeContainerNextExecution,
  computeRuntimeProjectExecute,
  resolveRuntimeTaskStatus,
} from "./runtime-scheduler.ts";
import type { ContainerSpecBinding, ExecutionNode, SpaceContainer } from "../types.ts";

function createContainer(specBindings: ContainerSpecBinding[]): SpaceContainer {
  return {
    containerId: "K19+070",
    vAddress: "v://space/container/K19+070",
    geoSlotRef: "v://space/slot/K19+070",
    lifecycleState: "RUNNING",
    locked: false,
    runtime: {
      currentSpuId: null,
      currentNodeId: null,
      phase: "idle",
    },
    tripBinding: {},
    specBindings,
    overallStatus: "PENDING",
  };
}

function createNode(params: {
  nodeId: string;
  spuId: string;
  status: ExecutionNode["status"];
}): ExecutionNode {
  return {
    nodeId: params.nodeId,
    spuId: params.spuId,
    containerRef: "K19+070",
    attemptIndex: 1,
    status: params.status,
    inputs: {},
    outputs: {},
    trace: [],
    gate: {
      passed: params.status === "FINAL_PASS",
      results: [],
    },
    requiredSignatures: [],
    signedBy: [],
    createdAt: "2026-04-23T00:00:00.000Z",
    updatedAt: "2026-04-23T00:00:00.000Z",
  };
}

test("resolveRuntimeTaskStatus: non-final node is treated as running", () => {
  const binding: ContainerSpecBinding = {
    spuId: "compaction",
    status: "RUNNING",
    latestNodeId: "node-1",
    historyNodeIds: ["node-1"],
  };
  const node = createNode({ nodeId: "node-1", spuId: "compaction", status: "SIGNING" });

  assert.equal(resolveRuntimeTaskStatus(binding, node), "running");
});

test("computeRuntimeContainerNextExecution: next task follows dependency order", () => {
  const container = createContainer([
    { spuId: "compaction", status: "PASS", latestNodeId: "node-pass", historyNodeIds: ["node-pass"] },
    { spuId: "thickness", status: "DRAFT", historyNodeIds: [] },
    { spuId: "deflection", status: "DRAFT", historyNodeIds: [] },
  ]);
  const nodes = [createNode({ nodeId: "node-pass", spuId: "compaction", status: "FINAL_PASS" })];

  const result = computeRuntimeContainerNextExecution(container, nodes);

  assert.equal(result.decision.action, "EXECUTE");
  assert.equal(result.decision.nextTask, "thickness");
  assert.equal(result.nextTasks[0]?.spuId, "thickness");
  assert.equal(result.graph.nodes.length, 3);
  assert.equal(result.graph.edges.length > 0, true);
  assert.equal(result.graph.edges.every((edge) => edge.dependencyType === "hard"), true);
  assert.equal(result.nextExecutableNodes[0]?.spuId, "thickness");
  assert.equal(result.schedulePlan.stages.length >= 1, true);
  assert.equal(result.schedulePlan.summary.length > 0, true);
  assert.deepEqual(
    result.tasks.map((item) => ({ spuId: item.spuId, dependsOn: item.dependsOn })),
    [
      { spuId: "compaction", dependsOn: [] },
      { spuId: "thickness", dependsOn: ["compaction"] },
      { spuId: "deflection", dependsOn: ["compaction", "thickness"] },
    ],
  );
});

test("computeRuntimeContainerNextExecution: failed task requires retry", () => {
  const container = createContainer([
    { spuId: "compaction", status: "PASS", latestNodeId: "node-pass", historyNodeIds: ["node-pass"] },
    { spuId: "thickness", status: "FAIL", latestNodeId: "node-fail", historyNodeIds: ["node-fail"] },
    { spuId: "deflection", status: "DRAFT", historyNodeIds: [] },
  ]);
  const nodes = [
    createNode({ nodeId: "node-pass", spuId: "compaction", status: "FINAL_PASS" }),
    createNode({ nodeId: "node-fail", spuId: "thickness", status: "FINAL_FAIL" }),
  ];

  const result = computeRuntimeContainerNextExecution(container, nodes);

  assert.equal(result.decision.action, "RETRY_FAILED");
  assert.equal(result.decision.nextTask, "thickness");
  assert.equal(result.nextExecutableNodes.some((item) => item.spuId === "thickness" && item.executionStatus === "failed"), true);
  assert.equal(result.schedulePlan.stages[0]?.nodeIds.includes("thickness"), true);
});

test("computeRuntimeProjectExecute: returns project-level decision", () => {
  const decision = computeRuntimeProjectExecute({
    containers: [
      {
        containerId: "K19+060",
        tasks: [
          { spuId: "compaction", status: "pass" },
          { spuId: "thickness", status: "pass" },
        ],
        status: "pass",
      },
      {
        containerId: "K19+070",
        tasks: [
          { spuId: "compaction", status: "ready" },
          { spuId: "thickness", status: "blocked" },
        ],
        status: "ready",
      },
    ],
  });

  assert.equal(decision.action, "PROJECT_EXECUTE");
  assert.equal(decision.nextContainer, "K19+070");
  assert.equal(decision.nextTask, "compaction");
});

test("buildRuntimeContainerTaskModels: dependency chain includes all predecessors", () => {
  const container = createContainer([
    { spuId: "a", status: "PASS", latestNodeId: "node-a", historyNodeIds: ["node-a"] },
    { spuId: "b", status: "DRAFT", historyNodeIds: [] },
    { spuId: "c", status: "DRAFT", historyNodeIds: [] },
    { spuId: "d", status: "DRAFT", historyNodeIds: [] },
  ]);
  const nodes = [createNode({ nodeId: "node-a", spuId: "a", status: "FINAL_PASS" })];
  const tasks = buildRuntimeContainerTaskModels(container, nodes);

  assert.deepEqual(
    tasks.map((item) => ({ spuId: item.spuId, dependsOn: item.dependsOn })),
    [
      { spuId: "a", dependsOn: [] },
      { spuId: "b", dependsOn: ["a"] },
      { spuId: "c", dependsOn: ["a", "b"] },
      { spuId: "d", dependsOn: ["a", "b", "c"] },
    ],
  );
});

test("buildRuntimeProjectExecuteSuggestion: output keeps generatedAt/input/decision", () => {
  const input = {
    containers: [
      {
        containerId: "K19+070",
        tasks: [
          { spuId: "compaction", status: "ready" as const },
          { spuId: "thickness", status: "blocked" as const },
        ],
        status: "ready" as const,
      },
    ],
  };
  const generatedAt = "2026-04-23T10:00:00.000Z";
  const suggestion = buildRuntimeProjectExecuteSuggestion(input, generatedAt);

  assert.equal(suggestion.generatedAt, generatedAt);
  assert.deepEqual(suggestion.input, input);
  assert.equal(suggestion.decision.action, "PROJECT_EXECUTE");
  assert.equal(suggestion.decision.nextContainer, "K19+070");
  assert.equal(suggestion.decision.nextTask, "compaction");
});
