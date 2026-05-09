export type RuntimeGraphDependencyType = "hard" | "soft";

export type RuntimeGraphExecutionStatus =
  | "draft"
  | "ready"
  | "running"
  | "pass"
  | "failed"
  | "blocked";

export interface RuntimeDagExecutionState {
  status: RuntimeGraphExecutionStatus;
}

export interface RuntimeExecutionGraphNode {
  nodeId: string;
  spuId: string;
  priority: number;
  executionState: RuntimeDagExecutionState;
  // Backward compatible field used by existing consumers.
  executionStatus: RuntimeGraphExecutionStatus;
}

export interface RuntimeExecutionGraphEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  dependencyType: RuntimeGraphDependencyType;
}

export interface RuntimeExecutionGraph {
  nodes: RuntimeExecutionGraphNode[];
  edges: RuntimeExecutionGraphEdge[];
}

export interface RuntimeExecutionGraphTaskInput {
  nodeId: string;
  spuId: string;
  executionStatus: RuntimeGraphExecutionStatus;
  priority?: number;
  // Backward compatible hard dependency list.
  dependsOnNodeIds?: string[];
  hardDependsOnNodeIds?: string[];
  softDependsOnNodeIds?: string[];
}

export interface RuntimeBlockedNodeReason {
  nodeId: string;
  spuId: string;
  blockedByNodeIds: string[];
  reason: string;
}

export interface RuntimeNextExecutableNode {
  nodeId: string;
  spuId: string;
  executionStatus: "ready" | "failed";
  action: "execute" | "retry_failed" | "partial_rerun";
  priority: number;
  reason: string;
  softDependencyWarnings: string[];
}

export interface RuntimeSchedulePlanStage {
  stage: number;
  mode: "parallel";
  nodeIds: string[];
  items: RuntimeNextExecutableNode[];
}

export interface RuntimeSchedulePlan {
  stages: RuntimeSchedulePlanStage[];
  suggestedOrder: string[];
  blockedNodeIds: string[];
  parallelizableNodeGroups: string[][];
  cycleNodeIds: string[];
  hasCycle: boolean;
  partialRerun: {
    requestedNodeIds: string[];
    affectedNodeIds: string[];
    invalidatedNodeIds: string[];
  };
  summary: string;
}

export interface RuntimeNextExecutableComputation {
  nextExecutableNodes: RuntimeNextExecutableNode[];
  blockedNodes: RuntimeBlockedNodeReason[];
}

export interface RuntimeDagScheduleOptions {
  partialRerunNodeIds?: string[];
  maxParallelism?: number;
}

export interface RuntimeDagComputation extends RuntimeNextExecutableComputation {
  schedulePlan: RuntimeSchedulePlan;
}

function toRuntimeGraphExecutionStatus(status: string): RuntimeGraphExecutionStatus {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "ready") {
    return "ready";
  }
  if (normalized === "running") {
    return "running";
  }
  if (normalized === "pass") {
    return "pass";
  }
  if (normalized === "failed" || normalized === "fail") {
    return "failed";
  }
  if (normalized === "blocked") {
    return "blocked";
  }
  return "draft";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item.trim().length > 0)));
}

function sortByPriorityAndId<T extends { priority: number; nodeId: string }>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.nodeId.localeCompare(b.nodeId, "en");
    });
}

export function buildRuntimeExecutionGraph(tasks: RuntimeExecutionGraphTaskInput[]): RuntimeExecutionGraph {
  const nodeIds = new Set<string>();
  const nodes: RuntimeExecutionGraphNode[] = [];
  const edges: RuntimeExecutionGraphEdge[] = [];

  for (const task of tasks) {
    const nodeId = task.nodeId.trim();
    if (!nodeId || nodeIds.has(nodeId)) {
      continue;
    }
    nodeIds.add(nodeId);
    const executionStatus = toRuntimeGraphExecutionStatus(task.executionStatus);
    nodes.push({
      nodeId,
      spuId: task.spuId.trim() || nodeId,
      priority: Number.isFinite(task.priority) ? Number(task.priority) : 0,
      executionState: {
        status: executionStatus,
      },
      executionStatus,
    });
  }

  const nodeIdSet = new Set(nodes.map((node) => node.nodeId));
  for (const task of tasks) {
    const toNodeId = task.nodeId.trim();
    if (!toNodeId || !nodeIdSet.has(toNodeId)) {
      continue;
    }
    const hardDependencyNodeIds = unique([
      ...(task.dependsOnNodeIds ?? []),
      ...(task.hardDependsOnNodeIds ?? []),
    ].map((item) => item.trim()));
    const softDependencyNodeIds = unique((task.softDependsOnNodeIds ?? []).map((item) => item.trim()))
      .filter((item) => !hardDependencyNodeIds.includes(item));

    for (const fromNodeId of hardDependencyNodeIds) {
      if (!nodeIdSet.has(fromNodeId)) {
        continue;
      }
      edges.push({
        edgeId: `${fromNodeId}__hard__${toNodeId}`,
        fromNodeId,
        toNodeId,
        dependencyType: "hard",
      });
    }
    for (const fromNodeId of softDependencyNodeIds) {
      if (!nodeIdSet.has(fromNodeId)) {
        continue;
      }
      edges.push({
        edgeId: `${fromNodeId}__soft__${toNodeId}`,
        fromNodeId,
        toNodeId,
        dependencyType: "soft",
      });
    }
  }

  return {
    nodes,
    edges,
  };
}

function isExecutableStatus(status: RuntimeGraphExecutionStatus): status is "ready" | "failed" {
  return status === "ready" || status === "failed";
}

function dependencySatisfied(status: RuntimeGraphExecutionStatus): boolean {
  return status === "pass";
}

function resolveHardIncomingEdgesByNodeId(graph: RuntimeExecutionGraph): Map<string, RuntimeExecutionGraphEdge[]> {
  const map = new Map<string, RuntimeExecutionGraphEdge[]>();
  for (const node of graph.nodes) {
    map.set(node.nodeId, []);
  }
  for (const edge of graph.edges) {
    if (edge.dependencyType !== "hard") {
      continue;
    }
    const incoming = map.get(edge.toNodeId) ?? [];
    incoming.push(edge);
    map.set(edge.toNodeId, incoming);
  }
  return map;
}

function resolveSoftIncomingEdgesByNodeId(graph: RuntimeExecutionGraph): Map<string, RuntimeExecutionGraphEdge[]> {
  const map = new Map<string, RuntimeExecutionGraphEdge[]>();
  for (const node of graph.nodes) {
    map.set(node.nodeId, []);
  }
  for (const edge of graph.edges) {
    if (edge.dependencyType !== "soft") {
      continue;
    }
    const incoming = map.get(edge.toNodeId) ?? [];
    incoming.push(edge);
    map.set(edge.toNodeId, incoming);
  }
  return map;
}

function resolveHardOutgoingByNodeId(graph: RuntimeExecutionGraph): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of graph.nodes) {
    map.set(node.nodeId, []);
  }
  for (const edge of graph.edges) {
    if (edge.dependencyType !== "hard") {
      continue;
    }
    const outgoing = map.get(edge.fromNodeId) ?? [];
    outgoing.push(edge.toNodeId);
    map.set(edge.fromNodeId, outgoing);
  }
  return map;
}

function collectPartialRerunAffectedNodes(
  graph: RuntimeExecutionGraph,
  requestedNodeIds: string[],
): {
  requestedNodeIds: string[];
  affectedNodeIds: string[];
  invalidatedNodeIds: string[];
} {
  const nodeIdSet = new Set(graph.nodes.map((node) => node.nodeId));
  const requested = unique(requestedNodeIds.map((item) => item.trim()))
    .filter((item) => nodeIdSet.has(item));
  if (requested.length === 0) {
    return {
      requestedNodeIds: [],
      affectedNodeIds: [],
      invalidatedNodeIds: [],
    };
  }

  const hardOutgoingByNodeId = resolveHardOutgoingByNodeId(graph);
  const visited = new Set<string>(requested);
  const queue = [...requested];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoing = hardOutgoingByNodeId.get(current) ?? [];
    for (const next of outgoing) {
      if (visited.has(next)) {
        continue;
      }
      visited.add(next);
      queue.push(next);
    }
  }
  const affectedNodeIds = Array.from(visited.values());
  const invalidatedNodeIds = affectedNodeIds.filter((item) => !requested.includes(item));
  return {
    requestedNodeIds: requested,
    affectedNodeIds,
    invalidatedNodeIds,
  };
}

function buildEffectiveStatusByNodeId(
  graph: RuntimeExecutionGraph,
  partialRerun: {
    requestedNodeIds: string[];
    invalidatedNodeIds: string[];
  },
): Map<string, RuntimeGraphExecutionStatus> {
  const requested = new Set(partialRerun.requestedNodeIds);
  const invalidated = new Set(partialRerun.invalidatedNodeIds);
  const map = new Map<string, RuntimeGraphExecutionStatus>();
  for (const node of graph.nodes) {
    const original = node.executionState.status;
    if (requested.has(node.nodeId)) {
      map.set(node.nodeId, "failed");
      continue;
    }
    if (invalidated.has(node.nodeId)) {
      // Partial re-run invalidates local result and asks for local re-computation.
      map.set(node.nodeId, original === "running" ? "running" : "ready");
      continue;
    }
    map.set(node.nodeId, original);
  }
  return map;
}

function detectHardCycleNodeIds(graph: RuntimeExecutionGraph): string[] {
  const indegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of graph.nodes) {
    indegree.set(node.nodeId, 0);
    outgoing.set(node.nodeId, []);
  }
  for (const edge of graph.edges) {
    if (edge.dependencyType !== "hard") {
      continue;
    }
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
    const list = outgoing.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, list);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of indegree.entries()) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  let visitedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    visitedCount += 1;
    const nextList = outgoing.get(current) ?? [];
    for (const next of nextList) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (visitedCount === graph.nodes.length) {
    return [];
  }
  return graph.nodes
    .map((node) => node.nodeId)
    .filter((nodeId) => (indegree.get(nodeId) ?? 0) > 0);
}

function buildNextExecutableNode(
  node: RuntimeExecutionGraphNode,
  executionStatus: "ready" | "failed",
  reason: string,
  softDependencyWarnings: string[],
  partialRerunRequested: boolean,
  partialRerunInvalidated: boolean,
): RuntimeNextExecutableNode {
  const action = partialRerunRequested || partialRerunInvalidated
    ? "partial_rerun"
    : executionStatus === "failed"
      ? "retry_failed"
      : "execute";
  return {
    nodeId: node.nodeId,
    spuId: node.spuId,
    executionStatus,
    action,
    priority: node.priority,
    reason,
    softDependencyWarnings,
  };
}

function buildCurrentExecutableAndBlocked(
  graph: RuntimeExecutionGraph,
  effectiveStatusByNodeId: Map<string, RuntimeGraphExecutionStatus>,
  partialRerun: {
    requestedNodeIds: string[];
    invalidatedNodeIds: string[];
  },
): RuntimeNextExecutableComputation {
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node] as const));
  const hardIncomingByNodeId = resolveHardIncomingEdgesByNodeId(graph);
  const softIncomingByNodeId = resolveSoftIncomingEdgesByNodeId(graph);
  const requested = new Set(partialRerun.requestedNodeIds);
  const invalidated = new Set(partialRerun.invalidatedNodeIds);

  const nextExecutableNodes: RuntimeNextExecutableNode[] = [];
  const blockedNodes: RuntimeBlockedNodeReason[] = [];

  for (const node of graph.nodes) {
    const status = effectiveStatusByNodeId.get(node.nodeId) ?? node.executionState.status;
    const hardIncomingEdges = hardIncomingByNodeId.get(node.nodeId) ?? [];
    const blockedByNodeIds = hardIncomingEdges
      .map((edge) => {
        const dependencyStatus = effectiveStatusByNodeId.get(edge.fromNodeId);
        if (!dependencyStatus || !dependencySatisfied(dependencyStatus)) {
          return edge.fromNodeId;
        }
        return "";
      })
      .filter(Boolean);

    const softIncomingEdges = softIncomingByNodeId.get(node.nodeId) ?? [];
    const softDependencyWarnings = softIncomingEdges
      .map((edge) => {
        const dependencyNode = nodeById.get(edge.fromNodeId);
        const dependencyStatus = effectiveStatusByNodeId.get(edge.fromNodeId);
        if (!dependencyNode || !dependencyStatus || !dependencySatisfied(dependencyStatus)) {
          return edge.fromNodeId;
        }
        return "";
      })
      .filter(Boolean)
      .map((nodeId) => `soft dependency not passed: ${nodeId}`);

    if (blockedByNodeIds.length > 0) {
      blockedNodes.push({
        nodeId: node.nodeId,
        spuId: node.spuId,
        blockedByNodeIds,
        reason: `blocked by hard dependency status: ${blockedByNodeIds.join(", ")}`,
      });
      continue;
    }

    if (!isExecutableStatus(status)) {
      continue;
    }

    const partialRequested = requested.has(node.nodeId);
    const partialInvalidated = invalidated.has(node.nodeId);
    const reason = partialRequested
      ? "partial re-run requested for this node"
      : partialInvalidated
        ? "partial re-run invalidated this node; ready to recompute"
        : status === "failed"
          ? "retry failed node: hard dependencies are satisfied"
          : "ready to execute: hard dependencies are satisfied";
    nextExecutableNodes.push(
      buildNextExecutableNode(
        node,
        status,
        reason,
        softDependencyWarnings,
        partialRequested,
        partialInvalidated,
      ),
    );
  }

  return {
    nextExecutableNodes: sortByPriorityAndId(nextExecutableNodes),
    blockedNodes: sortByPriorityAndId(
      blockedNodes.map((item) => ({
        ...item,
        priority: nodeById.get(item.nodeId)?.priority ?? 0,
      })),
    ).map(({ priority: _priority, ...item }) => item),
  };
}

function buildSchedulePlan(
  graph: RuntimeExecutionGraph,
  effectiveStatusByNodeId: Map<string, RuntimeGraphExecutionStatus>,
  currentComputation: RuntimeNextExecutableComputation,
  partialRerun: {
    requestedNodeIds: string[];
    affectedNodeIds: string[];
    invalidatedNodeIds: string[];
  },
  options: RuntimeDagScheduleOptions,
): RuntimeSchedulePlan {
  const nodeById = new Map(graph.nodes.map((node) => [node.nodeId, node] as const));
  const hardIncomingByNodeId = resolveHardIncomingEdgesByNodeId(graph);
  const maxParallelism = Number.isFinite(options.maxParallelism) && Number(options.maxParallelism) > 0
    ? Number(options.maxParallelism)
    : Number.POSITIVE_INFINITY;

  const stages: RuntimeSchedulePlanStage[] = [];
  const suggestedOrder: string[] = [];
  const simulatedStatus = new Map(effectiveStatusByNodeId);
  const visitedInPlan = new Set<string>();

  for (let stageIndex = 0; stageIndex < graph.nodes.length; stageIndex += 1) {
    const candidates = graph.nodes
      .filter((node) => {
        if (visitedInPlan.has(node.nodeId)) {
          return false;
        }
        const status = simulatedStatus.get(node.nodeId) ?? node.executionState.status;
        if (!isExecutableStatus(status)) {
          return false;
        }
        const hardIncoming = hardIncomingByNodeId.get(node.nodeId) ?? [];
        return hardIncoming.every((edge) => dependencySatisfied(simulatedStatus.get(edge.fromNodeId) ?? "draft"));
      })
      .map((node) => {
        const status = simulatedStatus.get(node.nodeId) as "ready" | "failed";
        const fromCurrent = currentComputation.nextExecutableNodes.find((item) => item.nodeId === node.nodeId);
        const defaultReason = status === "failed"
          ? "retry failed node: hard dependencies are satisfied"
          : "ready to execute: hard dependencies are satisfied";
        return buildNextExecutableNode(
          node,
          status,
          fromCurrent?.reason ?? defaultReason,
          fromCurrent?.softDependencyWarnings ?? [],
          partialRerun.requestedNodeIds.includes(node.nodeId),
          partialRerun.invalidatedNodeIds.includes(node.nodeId),
        );
      });

    if (candidates.length === 0) {
      break;
    }
    const stageItems = sortByPriorityAndId(candidates).slice(0, maxParallelism);
    const stageNodeIds = stageItems.map((item) => item.nodeId);
    stages.push({
      stage: stageIndex + 1,
      mode: "parallel",
      nodeIds: stageNodeIds,
      items: stageItems,
    });
    for (const nodeId of stageNodeIds) {
      suggestedOrder.push(nodeId);
      visitedInPlan.add(nodeId);
      // Optimistically treat stage completion as PASS to estimate next unlocked stage.
      simulatedStatus.set(nodeId, "pass");
    }
  }

  const cycleNodeIds = detectHardCycleNodeIds(graph);
  const blockedNodeIds = currentComputation.blockedNodes.map((item) => item.nodeId);
  const summary =
    stages.length > 0
      ? `DAG schedule generated with ${stages.length} stage(s); ${stages[0]?.nodeIds.length ?? 0} node(s) executable now`
      : cycleNodeIds.length > 0
        ? `DAG contains hard-dependency cycle: ${cycleNodeIds.join(", ")}`
        : blockedNodeIds.length > 0
          ? "no executable nodes now; waiting for hard dependency satisfaction"
          : "no executable nodes";

  return {
    stages,
    suggestedOrder,
    blockedNodeIds,
    parallelizableNodeGroups: stages.map((stage) => [...stage.nodeIds]),
    cycleNodeIds,
    hasCycle: cycleNodeIds.length > 0,
    partialRerun,
    summary,
  };
}

export function computeRuntimeDagSchedule(
  graph: RuntimeExecutionGraph,
  options: RuntimeDagScheduleOptions = {},
): RuntimeDagComputation {
  const partialRerun = collectPartialRerunAffectedNodes(graph, options.partialRerunNodeIds ?? []);
  const effectiveStatusByNodeId = buildEffectiveStatusByNodeId(graph, partialRerun);
  const currentComputation = buildCurrentExecutableAndBlocked(graph, effectiveStatusByNodeId, partialRerun);
  const schedulePlan = buildSchedulePlan(
    graph,
    effectiveStatusByNodeId,
    currentComputation,
    partialRerun,
    options,
  );
  return {
    nextExecutableNodes: currentComputation.nextExecutableNodes,
    blockedNodes: currentComputation.blockedNodes,
    schedulePlan,
  };
}

// Backward compatible API now delegates to full DAG scheduler.
export function computeRuntimeNextExecutableNodes(graph: RuntimeExecutionGraph): RuntimeNextExecutableComputation {
  const result = computeRuntimeDagSchedule(graph);
  return {
    nextExecutableNodes: result.nextExecutableNodes,
    blockedNodes: result.blockedNodes,
  };
}
