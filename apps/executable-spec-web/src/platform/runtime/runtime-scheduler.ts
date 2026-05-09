import {
  computeNextExecutableTasks,
  scheduleProject,
  type CSDNextExecutableTaskResult,
  type CSDSchedulerInput,
  type CSDTaskStatus,
  type ProjectScheduleDecision,
  type ProjectSchedulerInput,
} from "../scheduler/csd-scheduler.ts";
import {
  buildRuntimeExecutionGraph,
  computeRuntimeDagSchedule,
  type RuntimeBlockedNodeReason,
  type RuntimeExecutionGraph,
  type RuntimeSchedulePlan,
  type RuntimeNextExecutableNode,
} from "./runtime-graph.ts";
import { normalizeState, toSchedulerTaskStatus } from "../state_machine/transitions.ts";
import type { ContainerSpecBinding, ExecutionNode, SpaceContainer } from "../types.ts";

function isNodeFinalStatus(status: ExecutionNode["status"]): boolean {
  const normalized = normalizeState(status, "NODE");
  return normalized === "PASSED" || normalized === "FAILED" || normalized === "ARCHIVED";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item.trim().length > 0)));
}

export function resolveRuntimeTaskStatus(
  binding: ContainerSpecBinding,
  latestNode: ExecutionNode | null,
): CSDTaskStatus {
  const bindingState = normalizeState(binding.status, "NODE");
  const latestNodeState = latestNode ? normalizeState(latestNode.status, "NODE") : null;

  if (latestNodeState === "PASSED") {
    return "pass";
  }
  if (latestNodeState === "FAILED") {
    return "failed";
  }
  if (latestNodeState === "BLOCKED") {
    return "blocked";
  }

  // Non-final node means execution is still in-flight in runtime semantics.
  if (latestNode && !isNodeFinalStatus(latestNode.status)) {
    return "running";
  }

  return toSchedulerTaskStatus(bindingState);
}

function resolveRuntimeDependencySpuIds(container: SpaceContainer, spuId: string): string[] {
  const targetIndex = container.specBindings.findIndex((binding) => binding.spuId === spuId);
  if (targetIndex <= 0) {
    return [];
  }
  return container.specBindings.slice(0, targetIndex).map((binding) => binding.spuId);
}

export interface RuntimeContainerTaskModel {
  spuId: string;
  status: CSDTaskStatus;
  priority: number;
  latestNodeId: string | null;
  // Backward compatible alias of hardDependsOn.
  dependsOn: string[];
  hardDependsOn: string[];
  softDependsOn: string[];
}

export function buildRuntimeContainerTaskModels(
  container: SpaceContainer,
  nodes: ExecutionNode[],
): RuntimeContainerTaskModel[] {
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node] as const));
  return container.specBindings.map((binding) => {
    const latestNode = binding.latestNodeId ? nodeById.get(binding.latestNodeId) ?? null : null;
    const index = container.specBindings.findIndex((item) => item.spuId === binding.spuId);
    const hardDependsOn = resolveRuntimeDependencySpuIds(container, binding.spuId);
    return {
      spuId: binding.spuId,
      status: resolveRuntimeTaskStatus(binding, latestNode),
      priority: container.specBindings.length - Math.max(0, index),
      latestNodeId: latestNode?.nodeId ?? null,
      dependsOn: hardDependsOn,
      hardDependsOn,
      softDependsOn: [],
    };
  });
}

export function buildRuntimeContainerSchedulerInput(
  container: SpaceContainer,
  nodes: ExecutionNode[],
): CSDSchedulerInput {
  const taskModels = buildRuntimeContainerTaskModels(container, nodes);
  const orderedBindings = [...container.specBindings];

  return {
    container: {
      id: container.containerId,
      geo: {
        geoSlotRef: container.geoSlotRef,
      },
    },
    tasks: taskModels.map((task) => ({
      spuId: task.spuId,
      status: task.status,
    })),
    normRef: {
      order: orderedBindings.map((binding) => binding.spuId),
    },
  };
}

export interface RuntimeContainerSchedulerResult extends CSDNextExecutableTaskResult {
  containerId: string;
  input: CSDSchedulerInput;
  tasks: RuntimeContainerTaskModel[];
  graph: RuntimeExecutionGraph;
  nextExecutableNodes: RuntimeNextExecutableNode[];
  blockedNodes: RuntimeBlockedNodeReason[];
  schedulePlan: RuntimeSchedulePlan;
}

export function computeRuntimeContainerNextExecution(
  container: SpaceContainer,
  nodes: ExecutionNode[],
): RuntimeContainerSchedulerResult {
  const tasks = buildRuntimeContainerTaskModels(container, nodes);
  const input = buildRuntimeContainerSchedulerInput(container, nodes);
  const legacyResult = computeNextExecutableTasks(input);
  const graph = buildRuntimeExecutionGraph(
    tasks.map((task) => ({
      nodeId: task.spuId,
      spuId: task.spuId,
      executionStatus: task.status === "fail" ? "failed" : task.status,
      priority: task.priority,
      hardDependsOnNodeIds: task.hardDependsOn,
      softDependsOnNodeIds: task.softDependsOn,
    })),
  );
  const graphComputation = computeRuntimeDagSchedule(graph);

  let decision = legacyResult.decision;
  if (graphComputation.nextExecutableNodes.length > 0) {
    const retryCandidate = graphComputation.nextExecutableNodes.find((item) => item.executionStatus === "failed") ?? null;
    const executableSpuIds = graphComputation.nextExecutableNodes.map((item) => item.spuId);
    const selectedSpuId = retryCandidate?.spuId ?? executableSpuIds[0] ?? null;
    decision = {
      ...decision,
      action: retryCandidate ? "RETRY_FAILED" : "EXECUTE",
      nextTask: selectedSpuId,
      blockedBy: null,
      parallelTasks: executableSpuIds,
      summary: retryCandidate ? "failed node(s) can be retried" : "executable node(s) found",
      reason: retryCandidate ? "explicit runtime graph: retry failed node(s)" : "explicit runtime graph: executable node(s) found",
    };
  } else if (graphComputation.blockedNodes.length > 0 && decision.action !== "ARCHIVE_READY") {
    decision = {
      ...decision,
      blockedBy: unique(graphComputation.blockedNodes.flatMap((item) => item.blockedByNodeIds)),
      reason: "explicit runtime graph: no executable nodes because dependencies are not passed",
    };
  }

  const nextTasks = graphComputation.nextExecutableNodes.map((item) => ({
    spuId: item.spuId,
    reason: item.reason,
  }));

  return {
    containerId: container.containerId,
    input,
    tasks,
    graph,
    nextExecutableNodes: graphComputation.nextExecutableNodes,
    blockedNodes: graphComputation.blockedNodes,
    schedulePlan: graphComputation.schedulePlan,
    nextTasks,
    decision,
  };
}

export function computeRuntimeProjectExecute(input: ProjectSchedulerInput): ProjectScheduleDecision {
  return scheduleProject(input);
}

export interface RuntimeProjectExecuteSuggestion {
  generatedAt: string;
  input: ProjectSchedulerInput;
  decision: ProjectScheduleDecision;
}

export function buildRuntimeProjectExecuteSuggestion(
  input: ProjectSchedulerInput,
  generatedAt = new Date().toISOString(),
): RuntimeProjectExecuteSuggestion {
  return {
    generatedAt,
    input,
    decision: computeRuntimeProjectExecute(input),
  };
}
