export interface NormRef {
  normRefId: string;
  name: string;
  domain: string;
  category: string;
  version: string;
  specCatalog: NormSpecEntry[];
  optimizationTargets: {
    duration: "min";
    cost: "min";
    quality: "max";
    risk: "min";
  };
  constraints: {
    orderRules: OrderRule[];
    resourceConstraints: ResourceConstraint[];
    timeWindowConstraints: TimeWindowConstraint[];
    spaceConflictRules: SpaceConflictRule[];
  };
  metadata: {
    source: string;
    createdAt: string;
    updatedAt: string;
  };
}

export interface NormSpecEntry {
  spuId: string;
  workItem: string;
  measuredItem: string;
  required: boolean;
  priority: number;
}

export interface OrderRule {
  before: string;
  after: string;
  reason: string;
}

export interface ResourceConstraint {
  resourceType: "personnel" | "equipment" | "material";
  resourceCode?: string;
  maxUsage?: number;
  note?: string;
}

export interface TimeWindowConstraint {
  type: "weather" | "season" | "environmental" | "work_hour";
  expression: string;
  note?: string;
}

export interface SpaceConflictRule {
  ruleId: string;
  appliesTo: string[];
  condition: string;
  note?: string;
}

export interface SpaceContainer {
  vAddress: string;
  containerType: "space";
  geoReference: {
    station: string;
    chainage?: number;
    coordSystem: string;
    coords: {
      X: number;
      Y: number;
      Z?: number;
    };
    gps?: {
      lat: number;
      lng: number;
    };
    alignment?: string;
  };
  normExecution: {
    applicableSpecs: ApplicableSpec[];
    currentState: string;
    gateStatus: string;
    executionOrder: string[];
  };
  runtime: {
    activeSpec?: string | null;
    activeForm?: string | null;
    pendingActions: string[];
    pendingSignatures: string[];
    lastAction?: string | null;
  };
  lifecycle: {
    state: "DRAFT" | "ACTIVE" | "VALIDATED" | "ARCHIVED";
    createdAt: string;
    updatedAt: string;
  };
}

export interface ApplicableSpec {
  spuId: string;
  status: "pending" | "blocked" | "running" | "pass" | "fail";
  attempts: number;
  latestNode: string | null;
  dependsOn: string[];
}

export interface CSDSchedulerInput {
  containerId: string;
  location: {
    station: string;
    coords: {
      X: number;
      Y: number;
      Z?: number;
    };
  };
  tasks: CSDTask[];
  resources: {
    personnel: ResourceItem[];
    equipment: ResourceItem[];
    materials?: ResourceItem[];
  };
  timeConstraints: {
    weather?: string;
    season?: string;
    currentTime?: string;
    workHours?: string[];
  };
  spaceConstraints: {
    neighborContainers: NeighborContainer[];
  };
  optimizationTargets: {
    duration: "min";
    cost: "min";
    quality: "max";
    risk: "min";
  };
  normConstraints?: {
    resourceConstraints?: ResourceConstraint[];
    timeWindowConstraints?: TimeWindowConstraint[];
    spaceConflictRules?: SpaceConflictRule[];
  };
}

export interface CSDTask {
  spuId: string;
  status: "pending" | "blocked" | "running" | "pass" | "fail";
  priority: number;
  durationEstimate?: number;
  constraints: {
    mustBefore: string[];
    mustAfter: string[];
  };
}

export interface ResourceItem {
  id: string;
  type: string;
  available: boolean;
  quantity?: number;
}

export interface NeighborContainer {
  containerId: string;
  activeTask?: string | null;
}

export interface ResourcePool {
  personnel: ResourceItem[];
  equipment: ResourceItem[];
  materials?: ResourceItem[];
}

export interface TimeContext {
  weather?: string;
  season?: string;
  currentTime?: string;
  workHours?: string[];
}

export interface SpaceContext {
  neighborContainers: NeighborContainer[];
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of values) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function lookupPriority(normRef: NormRef, spuId: string): number {
  const item = normRef.specCatalog.find((entry) => entry.spuId === spuId);
  return item?.priority ?? 0;
}

function inferDurationEstimate(normRef: NormRef, spuId: string): number | undefined {
  const entry = normRef.specCatalog.find((item) => item.spuId === spuId);
  if (!entry) {
    return undefined;
  }
  const key = `${entry.workItem}-${entry.measuredItem}`.toLowerCase();
  if (key.includes("压实") || key.includes("compaction")) {
    return 2.5;
  }
  if (key.includes("弯沉") || key.includes("deflection")) {
    return 1.5;
  }
  if (key.includes("厚度") || key.includes("thickness")) {
    return 1.2;
  }
  return 2.0;
}

function sortByPriority(normRef: NormRef, spuIds: string[]): string[] {
  return [...spuIds].sort((a, b) => {
    const d = lookupPriority(normRef, b) - lookupPriority(normRef, a);
    if (d !== 0) {
      return d;
    }
    return a.localeCompare(b);
  });
}

export function deriveExecutionOrder(normRef: NormRef): string[] {
  const catalogOrder = unique(normRef.specCatalog.map((item) => item.spuId));
  const fromRules = unique(
    normRef.constraints.orderRules.flatMap((item) => [item.before, item.after]),
  );
  const allSpuIds = unique([...catalogOrder, ...fromRules]);
  if (allSpuIds.length === 0) {
    return [];
  }

  const graph = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const spuId of allSpuIds) {
    graph.set(spuId, new Set<string>());
    indegree.set(spuId, 0);
  }

  for (const rule of normRef.constraints.orderRules) {
    const before = String(rule.before || "").trim();
    const after = String(rule.after || "").trim();
    if (!before || !after || before === after) {
      continue;
    }
    if (!graph.has(before) || !graph.has(after)) {
      continue;
    }
    const next = graph.get(before)!;
    if (next.has(after)) {
      continue;
    }
    next.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }

  let ready = allSpuIds.filter((spuId) => (indegree.get(spuId) ?? 0) === 0);
  ready = sortByPriority(normRef, ready);

  const result: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    result.push(current);
    const neighbors = [...(graph.get(current) ?? new Set<string>())];
    for (const target of neighbors) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
      }
    }
    ready = sortByPriority(normRef, ready);
  }

  if (result.length === allSpuIds.length) {
    return result;
  }

  const unresolved = allSpuIds.filter((item) => !result.includes(item));
  return [...result, ...sortByPriority(normRef, unresolved)];
}

function mapLegacySpecStatus(value: unknown): ApplicableSpec["status"] {
  const status = String(value ?? "").trim().toUpperCase();
  if (status === "BLOCKED") {
    return "blocked";
  }
  if (status === "RUNNING" || status === "SIGNING") {
    return "running";
  }
  if (status === "PASS" || status === "FINAL_PASS" || status === "COMPLETED") {
    return "pass";
  }
  if (status === "FAIL" || status === "FINAL_FAIL") {
    return "fail";
  }
  return "pending";
}

function mapLegacyLifecycleState(value: unknown): SpaceContainer["lifecycle"]["state"] {
  const state = String(value ?? "").trim().toUpperCase();
  if (state === "ARCHIVED") {
    return "ARCHIVED";
  }
  if (state === "VERIFIED" || state === "VALIDATED") {
    return "VALIDATED";
  }
  if (state === "RUNNING" || state === "ACTIVE") {
    return "ACTIVE";
  }
  return "DRAFT";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function nowIso(): string {
  return new Date().toISOString();
}

export function migrateLegacyContainer(oldData: any): SpaceContainer {
  const old = asRecord(oldData);
  const oldGeoSlot = asRecord(old.geo_slot);
  const oldGeo = asRecord(old.geoReference);
  const oldCoords = asRecord(oldGeo.coords);
  const oldGeoSlotGeo = asRecord(oldGeoSlot.geo);
  const oldRuntime = asRecord(old.runtime);
  const oldLifecycle = asRecord(old.lifecycle);
  const oldNormExecution = asRecord(old.normExecution);
  const oldNormExecutionSnake = asRecord(old.norm_execution);

  const station =
    String(oldGeo.station ?? oldGeoSlotGeo.station ?? "").trim() || "K19+070";

  const legacySpecBindings = Array.isArray(old.specBindings)
    ? old.specBindings
    : Array.isArray(old.spec_bindings)
      ? old.spec_bindings
      : [];

  const specsFromNormExecution = Array.isArray(oldNormExecution.executionOrder)
    ? oldNormExecution.executionOrder
    : Array.isArray(oldNormExecutionSnake.specs_bound)
      ? oldNormExecutionSnake.specs_bound
      : [];

  const executionOrder = unique([
    ...legacySpecBindings.map((item: any) => String(item.spuId ?? item.spu_id ?? "").trim()),
    ...specsFromNormExecution.map((item: any) => String(item ?? "").trim()),
  ]);

  const applicableSpecs: ApplicableSpec[] = executionOrder.map((spuId) => {
    const binding = legacySpecBindings.find(
      (item: any) => String(item.spuId ?? item.spu_id ?? "").trim() === spuId,
    );
    const historyIds = Array.isArray(binding?.historyNodeIds)
      ? binding.historyNodeIds
      : Array.isArray(binding?.history_node_ids)
        ? binding.history_node_ids
        : [];
    const dependsOn = Array.isArray(binding?.dependsOn)
      ? binding.dependsOn
      : Array.isArray(binding?.depends_on)
        ? binding.depends_on
        : [];
    return {
      spuId,
      status: mapLegacySpecStatus(binding?.status),
      attempts: Number(binding?.attempts ?? historyIds.length ?? 0),
      latestNode: String(binding?.latestNodeId ?? binding?.latest_node ?? "").trim() || null,
      dependsOn: unique(dependsOn.map((item: unknown) => String(item ?? "").trim())),
    };
  });

  return {
    vAddress:
      String(old.vAddress ?? old.v_address ?? "").trim() ||
      `v:/cn.highway/default/subgrade/default/container/${station}`,
    containerType: "space",
    geoReference: {
      station,
      chainage: Number(oldGeo.chainage ?? oldGeoSlotGeo.chainage ?? 0) || undefined,
      coordSystem: String(oldGeo.coordSystem ?? oldGeo.coord_system ?? "CGCS2000"),
      coords: {
        X: Number(oldCoords.X ?? oldCoords.x ?? oldGeoSlotGeo.x ?? 0),
        Y: Number(oldCoords.Y ?? oldCoords.y ?? oldGeoSlotGeo.y ?? 0),
        Z: Number(oldCoords.Z ?? oldCoords.z ?? oldGeoSlotGeo.elevation ?? 0) || undefined,
      },
      gps:
        oldGeo.gps && typeof oldGeo.gps === "object"
          ? {
              lat: Number((oldGeo.gps as any).lat ?? 0),
              lng: Number((oldGeo.gps as any).lng ?? 0),
            }
          : undefined,
      alignment: String(oldGeo.alignment ?? oldGeoSlotGeo.alignment ?? "").trim() || undefined,
    },
    normExecution: {
      applicableSpecs,
      currentState:
        String(
          oldNormExecution.currentState ??
            oldNormExecution.current_state ??
            oldNormExecutionSnake.current_state ??
            old.lifecycleState ??
            old.lifecycle_state ??
            "",
        ).trim() || "draft",
      gateStatus:
        String(
          oldNormExecution.gateStatus ??
            oldNormExecution.gate_status ??
            oldRuntime.pending_action ??
            "awaiting_lab",
        ).trim() || "awaiting_lab",
      executionOrder,
    },
    runtime: {
      activeSpec:
        String(oldRuntime.activeSpec ?? oldRuntime.active_spec ?? "").trim() || null,
      activeForm:
        String(oldRuntime.activeForm ?? oldRuntime.active_form ?? "").trim() || null,
      pendingActions: Array.isArray(oldRuntime.pendingActions)
        ? oldRuntime.pendingActions.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
        : String(oldRuntime.pending_action ?? "").trim()
          ? [String(oldRuntime.pending_action).trim()]
          : [],
      pendingSignatures: Array.isArray(oldRuntime.pendingSignatures)
        ? oldRuntime.pendingSignatures.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
        : [],
      lastAction: String(oldRuntime.lastAction ?? oldRuntime.last_input ?? "").trim() || null,
    },
    lifecycle: {
      state: mapLegacyLifecycleState(oldLifecycle.state ?? old.lifecycleState ?? old.lifecycle_state),
      createdAt:
        String(oldLifecycle.createdAt ?? old.createdAt ?? "").trim() || nowIso(),
      updatedAt:
        String(oldLifecycle.updatedAt ?? old.updatedAt ?? "").trim() || nowIso(),
    },
  };
}

export function buildCSDSchedulerInput(
  container: SpaceContainer,
  normRef: NormRef,
  resources: ResourcePool,
  timeContext: TimeContext,
  spaceContext: SpaceContext,
): CSDSchedulerInput {
  const executionOrder = deriveExecutionOrder(normRef);
  const containerSpecMap = new Map(
    container.normExecution.applicableSpecs.map((item) => [item.spuId, item]),
  );
  const additionalSpecs = container.normExecution.applicableSpecs
    .map((item) => item.spuId)
    .filter((item) => !executionOrder.includes(item));
  const orderedSpecs = [...executionOrder, ...additionalSpecs];

  const tasks: CSDTask[] = orderedSpecs.map((spuId) => {
    const spec = containerSpecMap.get(spuId);
    const mustBefore = unique(
      normRef.constraints.orderRules
        .filter((item) => item.before === spuId)
        .map((item) => item.after),
    );
    const mustAfter = unique(
      normRef.constraints.orderRules
        .filter((item) => item.after === spuId)
        .map((item) => item.before),
    );
    return {
      spuId,
      status: spec?.status ?? "pending",
      priority: lookupPriority(normRef, spuId),
      durationEstimate: inferDurationEstimate(normRef, spuId),
      constraints: {
        mustBefore,
        mustAfter: unique([...mustAfter, ...(spec?.dependsOn ?? [])]),
      },
    };
  });

  return {
    containerId: container.vAddress,
    location: {
      station: container.geoReference.station,
      coords: {
        X: container.geoReference.coords.X,
        Y: container.geoReference.coords.Y,
        Z: container.geoReference.coords.Z,
      },
    },
    tasks,
    resources: {
      personnel: resources.personnel,
      equipment: resources.equipment,
      materials: resources.materials,
    },
    timeConstraints: {
      weather: timeContext.weather,
      season: timeContext.season,
      currentTime: timeContext.currentTime,
      workHours: timeContext.workHours,
    },
    spaceConstraints: {
      neighborContainers: spaceContext.neighborContainers,
    },
    optimizationTargets: {
      ...normRef.optimizationTargets,
    },
    normConstraints: {
      resourceConstraints: normRef.constraints.resourceConstraints,
      timeWindowConstraints: normRef.constraints.timeWindowConstraints,
      spaceConflictRules: normRef.constraints.spaceConflictRules,
    },
  };
}
