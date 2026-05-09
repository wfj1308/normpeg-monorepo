import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeExecutionGraph,
  computeRuntimeDagSchedule,
  computeRuntimeNextExecutableNodes,
} from "./runtime-graph.ts";

test("runtime dag: hard dependency allows parallel next nodes", () => {
  const graph = buildRuntimeExecutionGraph([
    {
      nodeId: "compaction",
      spuId: "compaction",
      executionStatus: "pass",
      priority: 100,
      hardDependsOnNodeIds: [],
    },
    {
      nodeId: "thickness",
      spuId: "thickness",
      executionStatus: "ready",
      priority: 90,
      hardDependsOnNodeIds: ["compaction"],
    },
    {
      nodeId: "moisture",
      spuId: "moisture",
      executionStatus: "ready",
      priority: 80,
      hardDependsOnNodeIds: ["compaction"],
    },
  ]);

  const result = computeRuntimeNextExecutableNodes(graph);
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges.every((edge) => edge.dependencyType === "hard"), true);
  assert.deepEqual(
    result.nextExecutableNodes.map((item) => item.spuId),
    ["thickness", "moisture"],
  );
});

test("runtime dag: soft dependency adds warning but should not block", () => {
  const graph = buildRuntimeExecutionGraph([
    {
      nodeId: "inspection_a",
      spuId: "inspection_a",
      executionStatus: "failed",
    },
    {
      nodeId: "inspection_b",
      spuId: "inspection_b",
      executionStatus: "ready",
      softDependsOnNodeIds: ["inspection_a"],
    },
  ]);
  const result = computeRuntimeDagSchedule(graph);

  assert.equal(result.blockedNodes.length, 0);
  assert.equal(result.nextExecutableNodes.length, 2);
  const b = result.nextExecutableNodes.find((item) => item.nodeId === "inspection_b");
  assert.ok(b);
  assert.equal((b?.softDependencyWarnings.length ?? 0) > 0, true);
});

test("runtime dag: hard blocking should propagate downstream", () => {
  const graph = buildRuntimeExecutionGraph([
    {
      nodeId: "compaction",
      spuId: "compaction",
      executionStatus: "failed",
      hardDependsOnNodeIds: [],
    },
    {
      nodeId: "thickness",
      spuId: "thickness",
      executionStatus: "ready",
      hardDependsOnNodeIds: ["compaction"],
    },
    {
      nodeId: "deflection",
      spuId: "deflection",
      executionStatus: "ready",
      hardDependsOnNodeIds: ["thickness"],
    },
  ]);

  const result = computeRuntimeDagSchedule(graph);
  assert.equal(result.nextExecutableNodes.some((item) => item.nodeId === "compaction"), true);
  assert.equal(result.blockedNodes.some((item) => item.nodeId === "thickness"), true);
  assert.equal(result.blockedNodes.some((item) => item.nodeId === "deflection"), true);
  const deflection = result.blockedNodes.find((item) => item.nodeId === "deflection");
  assert.deepEqual(deflection?.blockedByNodeIds, ["thickness"]);
});

test("runtime dag: partial re-run should invalidate downstream branch", () => {
  const graph = buildRuntimeExecutionGraph([
    {
      nodeId: "a",
      spuId: "a",
      executionStatus: "pass",
      hardDependsOnNodeIds: [],
    },
    {
      nodeId: "b",
      spuId: "b",
      executionStatus: "pass",
      hardDependsOnNodeIds: ["a"],
    },
    {
      nodeId: "c",
      spuId: "c",
      executionStatus: "pass",
      hardDependsOnNodeIds: ["b"],
    },
  ]);

  const result = computeRuntimeDagSchedule(graph, {
    partialRerunNodeIds: ["a"],
  });
  const next = result.nextExecutableNodes.map((item) => item.nodeId);
  assert.deepEqual(next, ["a"]);
  assert.equal(result.nextExecutableNodes[0]?.action, "partial_rerun");
  assert.deepEqual(result.schedulePlan.partialRerun.requestedNodeIds, ["a"]);
  assert.deepEqual(
    result.schedulePlan.partialRerun.affectedNodeIds.sort((x, y) => x.localeCompare(y, "en")),
    ["a", "b", "c"],
  );
  assert.equal(result.blockedNodes.some((item) => item.nodeId === "b"), true);
});

test("runtime dag: schedule plan should output staged parallel execution", () => {
  const graph = buildRuntimeExecutionGraph([
    {
      nodeId: "a",
      spuId: "a",
      executionStatus: "ready",
      priority: 100,
      hardDependsOnNodeIds: [],
    },
    {
      nodeId: "b",
      spuId: "b",
      executionStatus: "ready",
      priority: 90,
      hardDependsOnNodeIds: ["a"],
    },
    {
      nodeId: "c",
      spuId: "c",
      executionStatus: "ready",
      priority: 80,
      hardDependsOnNodeIds: ["a"],
    },
  ]);

  const result = computeRuntimeDagSchedule(graph);
  assert.equal(result.schedulePlan.stages.length >= 2, true);
  assert.deepEqual(result.schedulePlan.stages[0]?.nodeIds, ["a"]);
  assert.deepEqual(
    (result.schedulePlan.stages[1]?.nodeIds ?? []).sort((x, y) => x.localeCompare(y, "en")),
    ["b", "c"],
  );
  assert.equal(result.schedulePlan.parallelizableNodeGroups.length >= 2, true);
});
