import type {
  ExecutionNode,
  SchedulerTaskStatus,
  SpaceContainer,
  SpaceContainerApplicableSpec,
  SpaceContainerGeoReference,
  SpaceContainerStandardModel,
  SpaceSlot,
} from "../types.ts";

type RuntimeSnapshot = {
  currentSpuId: string | null;
  currentNodeId: string | null;
  phase: "idle" | "running" | "signing" | "completed";
};

function nowIso(): string {
  return new Date().toISOString();
}

function runtimeSnapshot(container: SpaceContainer): RuntimeSnapshot {
  const runtime = (container as SpaceContainer & { runtime?: Partial<RuntimeSnapshot> }).runtime;
  return {
    currentSpuId: typeof runtime?.currentSpuId === "string" ? runtime.currentSpuId : null,
    currentNodeId: typeof runtime?.currentNodeId === "string" ? runtime.currentNodeId : null,
    phase: runtime?.phase ?? "idle",
  };
}

function normalizeTaskStatus(status: "DRAFT" | "RUNNING" | "PASS" | "FAIL"): SchedulerTaskStatus {
  if (status === "PASS") {
    return "completed";
  }
  if (status === "FAIL") {
    return "failed";
  }
  if (status === "RUNNING") {
    return "running";
  }
  return "pending";
}

function computeExecutionOrder(container: SpaceContainer): string[] {
  return container.specBindings.map((item) => item.spuId);
}

function computeDependencies(executionOrder: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  executionOrder.forEach((spuId, index) => {
    if (index === 0) {
      map.set(spuId, []);
      return;
    }
    map.set(spuId, [executionOrder[index - 1]]);
  });
  return map;
}

function geoReferenceFromSlot(slot: SpaceSlot | null): SpaceContainerGeoReference {
  if (!slot) {
    return {
      station: "K19+070",
      coordSystem: "CGCS2000",
      coords: { X: 0, Y: 0, Z: 0 },
      gps: { lat: 0, lng: 0 },
      alignment: "",
    };
  }
  return {
    station: slot.geo.station,
    coordSystem: "CGCS2000",
    coords: {
      X: Number(slot.geo.x),
      Y: Number(slot.geo.y),
      Z: Number(slot.geo.elevation),
    },
    gps: {
      lat: 0,
      lng: 0,
    },
    alignment: slot.geo.alignment ?? "",
  };
}

function resolveActiveNode(container: SpaceContainer, nodes: ExecutionNode[], runtime: RuntimeSnapshot): ExecutionNode | null {
  if (runtime.currentNodeId) {
    const currentNode = nodes.find((node) => node.nodeId === runtime.currentNodeId) ?? null;
    if (currentNode) {
      return currentNode;
    }
  }
  const activeBinding = runtime.currentSpuId
    ? container.specBindings.find((item) => item.spuId === runtime.currentSpuId) ?? null
    : container.specBindings.find((item) => item.status === "RUNNING")
      ?? container.specBindings.find((item) => item.status === "DRAFT")
      ?? null;
  if (!activeBinding?.latestNodeId) {
    return null;
  }
  return nodes.find((node) => node.nodeId === activeBinding.latestNodeId) ?? null;
}

function inferGateStatus(container: SpaceContainer): string {
  if (container.lifecycleState === "ARCHIVED") {
    return "archived";
  }
  if (container.specBindings.some((binding) => binding.status === "FAIL")) {
    return "needs_retest";
  }
  if (container.specBindings.some((binding) => binding.status === "RUNNING")) {
    return "in_execution";
  }
  return "awaiting_lab";
}

function inferPendingActions(container: SpaceContainer, activeNode: ExecutionNode | null): string[] {
  if (container.lifecycleState === "ARCHIVED") {
    return [];
  }
  if (!activeNode) {
    return ["create_node", "fill_form", "submit_test"];
  }
  if (activeNode.status === "SIGNING") {
    return ["sign", "finalize_node"];
  }
  if (activeNode.status === "DRAFT") {
    return ["fill_form", "submit_test"];
  }
  if (activeNode.status === "RUNNING") {
    return ["wait_execution"];
  }
  return ["create_node"];
}

function latestActionTime(nodes: ExecutionNode[]): string {
  const candidates = nodes
    .map((item) => item.updatedAt)
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .sort();
  return candidates[candidates.length - 1] ?? nowIso();
}

function createdTime(nodes: ExecutionNode[]): string {
  const candidates = nodes
    .map((item) => item.createdAt)
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .sort();
  return candidates[0] ?? nowIso();
}

export function toStandardSpaceContainer(
  container: SpaceContainer,
  options?: {
    slot?: SpaceSlot | null;
    nodes?: ExecutionNode[];
  },
): SpaceContainerStandardModel {
  const slot = options?.slot ?? null;
  const nodes = options?.nodes ?? [];
  const runtime = runtimeSnapshot(container);
  const executionOrder = computeExecutionOrder(container);
  const dependsOnMap = computeDependencies(executionOrder);

  const applicableSpecs: SpaceContainerApplicableSpec[] = container.specBindings.map((binding) => ({
    spuId: binding.spuId,
    status: normalizeTaskStatus(binding.status),
    attempts: binding.historyNodeIds.length,
    latestNode: binding.latestNodeId ?? null,
    dependsOn: dependsOnMap.get(binding.spuId) ?? [],
  }));

  const activeSpecBinding = runtime.currentSpuId
    ? container.specBindings.find((item) => item.spuId === runtime.currentSpuId) ?? null
    : container.specBindings.find((item) => item.status === "RUNNING")
      ?? container.specBindings.find((item) => item.status === "DRAFT")
      ?? null;
  const activeNode = resolveActiveNode(container, nodes, runtime);

  return {
    vAddress: container.vAddress,
    containerType: "space",
    geoReference: geoReferenceFromSlot(slot),
    normExecution: {
      applicableSpecs,
      currentState: container.lifecycleState.toLowerCase(),
      gateStatus: inferGateStatus(container),
      executionOrder,
    },
    runtime: {
      activeSpec: activeSpecBinding?.spuId ?? null,
      activeForm: activeSpecBinding?.spuId ? `FORM_${activeSpecBinding.spuId.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase()}` : "",
      pendingActions: inferPendingActions(container, activeNode),
      pendingSignatures: activeNode
        ? activeNode.requiredSignatures.filter((role) => !activeNode.signedBy.includes(role))
        : [],
      lastAction: latestActionTime(nodes),
    },
    lifecycle: {
      state: container.lifecycleState === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
      createdAt: createdTime(nodes),
      updatedAt: latestActionTime(nodes),
    },
  };
}
