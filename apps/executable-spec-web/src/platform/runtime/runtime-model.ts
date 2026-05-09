import type { SchedulerDecision } from "../scheduler/csd-scheduler.ts";
import type { ExecutionNode, SpaceContainer } from "../types.ts";

export interface RuntimeNodeModel {
  nodeId: string;
  containerId: string | null;
  spuId: string;
  attemptIndex: number;
  status: ExecutionNode["status"];
  isFinal: boolean;
  finalResult: "pass" | "fail" | "pending";
  gatePassed: boolean;
  requiredSignatures: string[];
  signedBy: string[];
  dependencySpuIds: string[];
  dependencyNodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuntimeSpecBindingModel {
  spuId: string;
  status: "DRAFT" | "RUNNING" | "PASS" | "FAIL";
  latestNodeId: string | null;
  attempts: number;
  dependsOn: string[];
}

export interface RuntimeContainerModel {
  containerId: string;
  lifecycleState: SpaceContainer["lifecycleState"];
  overallStatus: SpaceContainer["overallStatus"];
  runtime: {
    currentSpuId: string | null;
    currentNodeId: string | null;
    phase: "idle" | "running" | "signing" | "completed";
  };
  dependencyGraph: Record<string, string[]>;
  specBindings: RuntimeSpecBindingModel[];
  latestNodeStatusBySpu: Record<string, ExecutionNode["status"] | null>;
  nodeSummary: {
    totalAttempts: number;
    activeAttempts: number;
    finalPassAttempts: number;
    finalFailAttempts: number;
  };
  nextExecution: {
    action: SchedulerDecision["action"];
    nextTask: string | null;
    blockedBy: string[] | null;
    reason: string;
  };
}

function resolveDependencySpuIds(container: SpaceContainer, spuId: string): string[] {
  const targetIndex = container.specBindings.findIndex((binding) => binding.spuId === spuId);
  if (targetIndex <= 0) {
    return [];
  }
  return container.specBindings.slice(0, targetIndex).map((binding) => binding.spuId);
}

function resolveDependencyNodeIds(container: SpaceContainer, dependencySpuIds: string[]): string[] {
  return dependencySpuIds
    .map((dependencySpuId) => {
      const binding = container.specBindings.find((item) => item.spuId === dependencySpuId);
      return binding?.latestNodeId?.trim() ?? "";
    })
    .filter(Boolean);
}

export function toRuntimeNodeModel(
  node: ExecutionNode,
  dependencies: {
    dependencySpuIds?: string[];
    dependencyNodeIds?: string[];
  } = {},
): RuntimeNodeModel {
  const isFinal = node.status === "FINAL_PASS" || node.status === "FINAL_FAIL";
  const finalResult = node.status === "FINAL_PASS"
    ? "pass"
    : node.status === "FINAL_FAIL"
    ? "fail"
    : "pending";
  return {
    nodeId: node.nodeId,
    containerId: node.containerRef ?? null,
    spuId: node.spuId,
    attemptIndex: node.attemptIndex,
    status: node.status,
    isFinal,
    finalResult,
    gatePassed: node.gate.passed,
    requiredSignatures: [...node.requiredSignatures],
    signedBy: [...node.signedBy],
    dependencySpuIds: [...(dependencies.dependencySpuIds ?? [])],
    dependencyNodeIds: [...(dependencies.dependencyNodeIds ?? [])],
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export function buildRuntimeNodeModels(container: SpaceContainer, nodes: ExecutionNode[]): RuntimeNodeModel[] {
  return nodes.map((node) => {
    const dependencySpuIds = resolveDependencySpuIds(container, node.spuId);
    const dependencyNodeIds = resolveDependencyNodeIds(container, dependencySpuIds);
    return toRuntimeNodeModel(node, { dependencySpuIds, dependencyNodeIds });
  });
}

export function buildRuntimeContainerModel(
  container: SpaceContainer,
  nodes: ExecutionNode[],
  schedulerDecision: SchedulerDecision,
): RuntimeContainerModel {
  const nodesById = new Map(nodes.map((item) => [item.nodeId, item] as const));
  const latestNodeStatusBySpu: Record<string, ExecutionNode["status"] | null> = {};
  const dependencyGraph: Record<string, string[]> = {};
  const specBindings = container.specBindings.map((binding, index) => {
    const dependsOn = container.specBindings.slice(0, index).map((item) => item.spuId);
    dependencyGraph[binding.spuId] = dependsOn;
    const latestNode = binding.latestNodeId ? nodesById.get(binding.latestNodeId) ?? null : null;
    latestNodeStatusBySpu[binding.spuId] = latestNode?.status ?? null;
    return {
      spuId: binding.spuId,
      status: binding.status,
      latestNodeId: binding.latestNodeId ?? null,
      attempts: binding.historyNodeIds.length,
      dependsOn,
    };
  });
  const nodeSummary = nodes.reduce(
    (acc, node) => {
      acc.totalAttempts += 1;
      if (node.status === "FINAL_PASS") {
        acc.finalPassAttempts += 1;
      } else if (node.status === "FINAL_FAIL") {
        acc.finalFailAttempts += 1;
      } else {
        acc.activeAttempts += 1;
      }
      return acc;
    },
    {
      totalAttempts: 0,
      activeAttempts: 0,
      finalPassAttempts: 0,
      finalFailAttempts: 0,
    },
  );

  return {
    containerId: container.containerId,
    lifecycleState: container.lifecycleState,
    overallStatus: container.overallStatus,
    runtime: {
      currentSpuId: container.runtime.currentSpuId,
      currentNodeId: container.runtime.currentNodeId,
      phase: container.runtime.phase,
    },
    dependencyGraph,
    specBindings,
    latestNodeStatusBySpu,
    nodeSummary,
    nextExecution: {
      action: schedulerDecision.action,
      nextTask: schedulerDecision.nextTask,
      blockedBy: schedulerDecision.blockedBy,
      reason: schedulerDecision.reason,
    },
  };
}
