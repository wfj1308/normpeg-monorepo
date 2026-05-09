import { workItemCatalog } from "../data/workitem-catalog.ts";
import { createNode, submitNode } from "../spu-runtime.ts";

import type { NodeStatus, SPUNode, WorkItemInstance, WorkItemProof, WorkItemSummary, WorkItemWorkflowStep } from "../spu-types.ts";

type DependencyCheckResult = {
  satisfied: boolean;
  blockedByFailure: boolean;
  blockingDependencies: string[];
};

const WORKFLOW_STATUS_PRIORITY: Record<"READY" | "LOCKED" | "UNLOCKED" | "SIGNING" | "PASS" | "FAIL", number> = {
  READY: 0,
  LOCKED: 1,
  UNLOCKED: 2,
  SIGNING: 3,
  PASS: 4,
  FAIL: 5,
};

function createEmptySummary(total: number): WorkItemSummary {
  return {
    total,
    passed: 0,
    failed: 0,
    blocked: 0,
    pending: total,
  };
}

function cloneNode(node: SPUNode): SPUNode {
  return {
    ...node,
    dependsOn: [...node.dependsOn],
    blockedByFailure: node.blockedByFailure,
    isAutoUnlocked: node.isAutoUnlocked,
    loadedForms: [...node.loadedForms],
    loadedPath: [...node.loadedPath],
    loadedRules: [...node.loadedRules],
    execution_result: node.execution_result ? { ...node.execution_result } : undefined,
    gate_result: node.gate_result
      ? {
          ...node.gate_result,
          results: node.gate_result.results.map((result) => ({ ...result })),
        }
      : undefined,
    proof: node.proof
      ? {
          ...node.proof,
          result: { ...node.proof.result },
          calculationTrace: node.proof.calculationTrace.map((trace) => ({
            ...trace,
            inputs: { ...trace.inputs },
          })),
          gateDecisions: node.proof.gateDecisions.map((decision) => ({ ...decision })),
          requiredSignatures: [...node.proof.requiredSignatures],
          pendingSignatures: [...node.proof.pendingSignatures],
          signedBy: node.proof.signedBy ? [...node.proof.signedBy] : undefined,
          inputs: node.proof.inputs ? { ...node.proof.inputs } : undefined,
          outputs: node.proof.outputs ? { ...node.proof.outputs } : undefined,
          trace: node.proof.trace ? node.proof.trace.map((trace) => ({ ...trace })) : undefined,
          gate: node.proof.gate
            ? {
                ...node.proof.gate,
                results: node.proof.gate.results.map((result) => ({ ...result })),
              }
            : undefined,
        }
      : undefined,
  };
}

function getWorkflowStep(workItem: WorkItemInstance, spuId: string): WorkItemWorkflowStep | undefined {
  return workItem.workflow.find((item) => item.spuId === spuId);
}

function getPriorityStatus(status: NodeStatus): keyof typeof WORKFLOW_STATUS_PRIORITY {
  if (status === "PASS" || status === "FINAL_PASS") {
    return "PASS";
  }
  if (status === "FAIL" || status === "FINAL_FAIL") {
    return "FAIL";
  }
  if (status === "SIGNING") {
    return "SIGNING";
  }
  if (status === "UNLOCKED") {
    return "UNLOCKED";
  }
  if (status === "LOCKED") {
    return "LOCKED";
  }
  return "READY";
}

function resolveStatusByPriority(currentStatus: NodeStatus, nextStatus: NodeStatus): NodeStatus {
  const currentPriority = WORKFLOW_STATUS_PRIORITY[getPriorityStatus(currentStatus)];
  const nextPriority = WORKFLOW_STATUS_PRIORITY[getPriorityStatus(nextStatus)];

  return currentPriority >= nextPriority ? currentStatus : nextStatus;
}

function getTerminalWorkflowStatus(node: SPUNode): NodeStatus | null {
  if (node.proof?.status === "FINAL_FAIL" || node.status === "FAIL" || node.status === "FINAL_FAIL") {
    return "FAIL";
  }
  if (node.proof?.status === "FINAL_PASS" || node.status === "PASS" || node.status === "FINAL_PASS") {
    return "PASS";
  }
  return null;
}

function getInteractiveWorkflowStatus(node: SPUNode): NodeStatus {
  if (node.status === "SIGNING") {
    return "SIGNING";
  }
  return "READY";
}

function logNodeStatusChange(previous: SPUNode | undefined, next: SPUNode): void {
  const previousStatus = previous?.status;
  const nextStatus = next.status;
  const previousBlocked = previous?.blockedByFailure ?? false;

  if (
    previousStatus !== nextStatus ||
    previousBlocked !== next.blockedByFailure ||
    (previous?.isAutoUnlocked ?? false) !== next.isAutoUnlocked
  ) {
    console.log("[workflow] node status change", {
      spuId: next.spuId,
      from: previousStatus,
      to: nextStatus,
      blockedByFailure: next.blockedByFailure,
      isAutoUnlocked: next.isAutoUnlocked,
      dependsOn: next.dependsOn,
    });
  }
}

function deriveWorkflowNodeState(
  sourceWorkItem: WorkItemInstance,
  dependencyState: WorkItemInstance,
  step: WorkItemWorkflowStep,
): Pick<SPUNode, "status" | "blockedByFailure" | "isAutoUnlocked" | "dependsOn"> {
  const node = sourceWorkItem.nodes[step.spuId];
  if (!node) {
    return {
      status: "LOCKED",
      blockedByFailure: false,
      isAutoUnlocked: false,
      dependsOn: [...step.dependsOn],
    };
  }

  const terminalStatus = getTerminalWorkflowStatus(node);
  if (terminalStatus) {
    return {
      status: terminalStatus,
      blockedByFailure: false,
      isAutoUnlocked: false,
      dependsOn: [...step.dependsOn],
    };
  }

  if (!sourceWorkItem.workflowEnabled) {
    return {
      status: getInteractiveWorkflowStatus(node),
      blockedByFailure: false,
      isAutoUnlocked: false,
      dependsOn: [...step.dependsOn],
    };
  }

  const dependencyCheck = checkDependenciesSatisfied(dependencyState, step.spuId);
  const derivedStatus: NodeStatus = dependencyCheck.satisfied ? "UNLOCKED" : "LOCKED";
  const status = resolveStatusByPriority(node.status, derivedStatus);

  return {
    status,
    blockedByFailure: dependencyCheck.blockedByFailure,
    isAutoUnlocked: dependencyCheck.satisfied && step.dependsOn.length > 0,
    dependsOn: [...step.dependsOn],
  };
}

function applyWorkflowState(workItem: WorkItemInstance): WorkItemInstance {
  const nextNodes: Record<string, SPUNode> = {};

  for (const step of workItem.workflow) {
    const node = workItem.nodes[step.spuId];
    if (!node) {
      continue;
    }

    const dependencyState: WorkItemInstance = {
      ...workItem,
      nodes: {
        ...workItem.nodes,
        ...nextNodes,
      },
    };
    const derivedState = deriveWorkflowNodeState(workItem, dependencyState, step);
    const nextNode: SPUNode = {
      ...cloneNode(node),
      ...derivedState,
    };

    logNodeStatusChange(workItem.nodes[step.spuId], nextNode);
    nextNodes[step.spuId] = nextNode;
  }

  const summarized = updateWorkItemSummary({
    ...workItem,
    nodes: nextNodes,
  });

  return {
    ...summarized,
    proof: buildWorkItemProof(summarized),
  };
}

export function createWorkItemInstance(workItemId: string): WorkItemInstance {
  const config = workItemCatalog[workItemId];
  if (!config) {
    throw new Error(`WorkItem not found: ${workItemId}`);
  }

  const nodes = Object.fromEntries(
    config.spuIds.map((spuId) => {
      try {
        return [spuId, createNode(spuId)];
      } catch {
        return [
          spuId,
          {
            spuId,
            dependsOn: [],
            blockedByFailure: false,
            isAutoUnlocked: false,
            loadedForms: [],
            loadedPath: [],
            loadedRules: [],
            status: "DRAFT" as const,
          },
        ];
      }
    }),
  );

  return applyWorkflowState({
    workItemId: config.workItemId,
    workItemName: config.workItemName,
    catalogName: config.catalogName,
    norm: config.norm,
    clauseGroup: config.clauseGroup,
    spuIds: [...config.spuIds],
    workflowEnabled: true,
    workflow: config.workflow.map((step) => ({
      spuId: step.spuId,
      dependsOn: [...step.dependsOn],
    })),
    nodes,
    aggregateStatus: "READY",
    summary: createEmptySummary(config.spuIds.length),
    proof: null,
  });
}

export function setWorkItemWorkflowEnabled(workItem: WorkItemInstance, workflowEnabled: boolean): WorkItemInstance {
  console.log("[workflow] toggle", {
    workItemId: workItem.workItemId,
    workflowEnabled,
  });

  return applyWorkflowState({
    ...workItem,
    workflowEnabled,
  });
}

export function checkDependenciesSatisfied(workItem: WorkItemInstance, spuId: string): DependencyCheckResult {
  const step = getWorkflowStep(workItem, spuId);
  if (!step || step.dependsOn.length === 0) {
    const result = {
      satisfied: true,
      blockedByFailure: false,
      blockingDependencies: [],
    };
    console.log("[workflow] dependency check", { spuId, ...result });
    return result;
  }

  const blockingDependencies = step.dependsOn.filter((dependencySpuId) => {
    const dependencyNode = workItem.nodes[dependencySpuId];
    return dependencyNode?.status === "FAIL" || dependencyNode?.blockedByFailure === true;
  });

  if (blockingDependencies.length > 0) {
    const result = {
      satisfied: false,
      blockedByFailure: true,
      blockingDependencies,
    };
    console.log("[workflow] dependency check", { spuId, ...result });
    return result;
  }

  const satisfied = step.dependsOn.every((dependencySpuId) => workItem.nodes[dependencySpuId]?.status === "PASS");
  const result = {
    satisfied,
    blockedByFailure: false,
    blockingDependencies: [],
  };
  console.log("[workflow] dependency check", { spuId, ...result });
  return result;
}

export function updateWorkItemSummary(workItem: WorkItemInstance): WorkItemInstance {
  const nodes = Object.values(workItem.nodes);
  const summary = createEmptySummary(nodes.length);

  for (const node of nodes) {
    if (node.status === "PASS") {
      summary.passed += 1;
      summary.pending -= 1;
      continue;
    }
    if (node.status === "FAIL") {
      summary.failed += 1;
      summary.pending -= 1;
      continue;
    }
    if (node.blockedByFailure) {
      summary.blocked += 1;
      summary.pending -= 1;
    }
  }

  let aggregateStatus: WorkItemInstance["aggregateStatus"] = "READY";
  const anyExecuted = nodes.some((node) => Boolean(node.proof));
  if (summary.failed > 0) {
    aggregateStatus = "FAIL";
  } else if (summary.total > 0 && summary.passed === summary.total) {
    aggregateStatus = "PASS";
  } else if (anyExecuted) {
    aggregateStatus = "IN_PROGRESS";
  }

  return {
    ...workItem,
    summary,
    aggregateStatus,
  };
}

export function executeWorkItemNode(
  workItem: WorkItemInstance,
  spuId: string,
  formData: Record<string, number>,
): WorkItemInstance {
  const node = workItem.nodes[spuId];
  if (!node) {
    throw new Error(`SPU not found in WorkItem: ${spuId}`);
  }
  if (workItem.workflowEnabled && node.blockedByFailure) {
    throw new Error(`SPU is blocked by upstream failure: ${spuId}`);
  }
  if (workItem.workflowEnabled && node.status === "LOCKED") {
    throw new Error(`SPU is locked by workflow dependencies: ${spuId}`);
  }

  const updatedNode = submitNode(node, formData);
  return applyWorkflowState({
    ...workItem,
    nodes: {
      ...workItem.nodes,
      [spuId]: cloneNode(updatedNode),
    },
  });
}

export function syncWorkItemNode(workItem: WorkItemInstance, node: SPUNode): WorkItemInstance {
  if (!workItem.nodes[node.spuId]) {
    throw new Error(`SPU not found in WorkItem: ${node.spuId}`);
  }

  return applyWorkflowState({
    ...workItem,
    nodes: {
      ...workItem.nodes,
      [node.spuId]: cloneNode(node),
    },
  });
}

export function autoAdvance(workItem: WorkItemInstance, currentSpuId?: string): string | null {
  if (!workItem.workflowEnabled || workItem.aggregateStatus === "FAIL") {
    const stayOn = currentSpuId ?? null;
    console.log("[workflow] autoAdvance", {
      currentSpuId,
      nextSpuId: stayOn,
      workflowEnabled: workItem.workflowEnabled,
      aggregateStatus: workItem.aggregateStatus,
    });
    return stayOn;
  }

  const nextStep = workItem.workflow.find(
    (step) => step.spuId !== currentSpuId && workItem.nodes[step.spuId]?.status === "UNLOCKED",
  );
  const nextSpuId = nextStep?.spuId ?? currentSpuId ?? null;

  console.log("[workflow] autoAdvance", {
    currentSpuId,
    nextSpuId,
    aggregateStatus: workItem.aggregateStatus,
  });

  return nextSpuId;
}

export function buildWorkItemProof(workItem: WorkItemInstance): WorkItemProof {
  return {
    workItemId: workItem.workItemId,
    workItemName: workItem.workItemName,
    norm: workItem.norm,
    summary: { ...workItem.summary },
    nodeResults: workItem.workflow.map((step) => {
      const node = workItem.nodes[step.spuId];
      return {
        spuId: step.spuId,
        status: node.status,
        outputs: node.execution_result ? { ...node.execution_result } : undefined,
        gate: node.gate_result
          ? {
              ...node.gate_result,
              results: node.gate_result.results.map((result) => ({ ...result })),
            }
          : undefined,
        proof: node.proof
          ? {
              ...node.proof,
              result: { ...node.proof.result },
              calculationTrace: node.proof.calculationTrace.map((trace) => ({
                ...trace,
                inputs: { ...trace.inputs },
              })),
              gateDecisions: node.proof.gateDecisions.map((decision) => ({ ...decision })),
              requiredSignatures: [...node.proof.requiredSignatures],
              pendingSignatures: [...node.proof.pendingSignatures],
              signedBy: node.proof.signedBy ? [...node.proof.signedBy] : undefined,
              inputs: node.proof.inputs ? { ...node.proof.inputs } : undefined,
              outputs: node.proof.outputs ? { ...node.proof.outputs } : undefined,
              trace: node.proof.trace ? node.proof.trace.map((trace) => ({ ...trace })) : undefined,
              gate: node.proof.gate
                ? {
                    ...node.proof.gate,
                    results: node.proof.gate.results.map((result) => ({ ...result })),
                  }
                : undefined,
            }
          : undefined,
      };
    }),
    aggregateStatus: workItem.aggregateStatus,
  };
}
