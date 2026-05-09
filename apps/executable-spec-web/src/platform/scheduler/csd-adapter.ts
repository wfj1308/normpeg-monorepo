import type {
  ExecutionNode,
  SchedulerInput,
  SchedulerResource,
  SchedulerTaskInput,
  SchedulerTaskStatus,
  SpaceContainer,
  SpaceContainerStandardModel,
  SpaceSlot,
} from "../types.ts";
import { toStandardSpaceContainer } from "../spatial/space-container-standard.ts";

function stationToNumber(station: string): number | null {
  const text = String(station ?? "").trim().toUpperCase();
  const matched = text.match(/^K(\d+)\+(\d+)$/);
  if (!matched) {
    return null;
  }
  return Number(matched[1]) * 1000 + Number(matched[2]);
}

function inferTaskTag(spuId: string): string {
  const lowered = spuId.toLowerCase();
  if (lowered.includes("compaction")) {
    return "compaction";
  }
  if (lowered.includes("deflection")) {
    return "deflection";
  }
  if (lowered.includes("thickness")) {
    return "thickness";
  }
  return "generic";
}

function inferDurationHours(spuId: string): number {
  const tag = inferTaskTag(spuId);
  if (tag === "compaction") {
    return 2.5;
  }
  if (tag === "deflection") {
    return 1.5;
  }
  if (tag === "thickness") {
    return 1.2;
  }
  return 2.0;
}

function inferPriority(spuId: string, index: number): number {
  const tag = inferTaskTag(spuId);
  if (tag === "compaction") {
    return 10;
  }
  if (tag === "deflection") {
    return 8;
  }
  if (tag === "thickness") {
    return 7;
  }
  return Math.max(1, 6 - index);
}

function taskStatusWithDependencies(baseStatus: SchedulerTaskStatus, mustAfter: string[], completedSet: Set<string>): SchedulerTaskStatus {
  if (baseStatus !== "pending") {
    return baseStatus;
  }
  const dependencySatisfied = mustAfter.every((item) => completedSet.has(item));
  return dependencySatisfied ? "pending" : "blocked";
}

function defaultResources(): { lab: SchedulerResource[]; equipment: SchedulerResource[] } {
  return {
    lab: [{ id: "lab_01", available: true }],
    equipment: [{ id: "roller_01", type: "compactor", available: true }],
  };
}

export function collectStandardNeighborContainers(
  target: SpaceContainerStandardModel,
  allContainers: SpaceContainerStandardModel[],
): Array<{ containerId: string; active_task: string }> {
  const targetStation = stationToNumber(target.geoReference.station);
  return allContainers
    .filter((item) => item.vAddress !== target.vAddress)
    .filter((item) => {
      const current = stationToNumber(item.geoReference.station);
      if (targetStation === null || current === null) {
        return false;
      }
      return Math.abs(current - targetStation) <= 10;
    })
    .map((item) => ({
      containerId: item.geoReference.station,
      active_task: inferTaskTag(item.runtime.activeSpec ?? ""),
    }));
}

export function buildSchedulerInputFromStandardContainer(
  container: SpaceContainerStandardModel,
  options?: {
    resources?: { lab: SchedulerResource[]; equipment: SchedulerResource[] };
    workingHours?: string[];
    weather?: string;
    season?: string;
    neighbors?: Array<{ containerId: string; active_task: string }>;
  },
): SchedulerInput {
  const completedSet = new Set(
    container.normExecution.applicableSpecs
      .filter((item) => item.status === "completed")
      .map((item) => item.spuId),
  );

  const tasks: SchedulerTaskInput[] = container.normExecution.applicableSpecs.map((item, index) => {
    const mustAfter = [...item.dependsOn];
    const status = taskStatusWithDependencies(item.status, mustAfter, completedSet);
    return {
      spuId: item.spuId,
      status,
      duration_estimate: inferDurationHours(item.spuId),
      priority: inferPriority(item.spuId, index),
      constraints: {
        must_before: [],
        must_after: mustAfter,
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
      },
    },
    tasks,
    resources: options?.resources ?? defaultResources(),
    time_constraints: {
      working_hours: options?.workingHours ?? ["08:00-18:00"],
      weather: options?.weather ?? "clear",
      season: options?.season ?? "normal",
    },
    space_constraints: {
      neighbor_containers: options?.neighbors ?? [],
    },
  };
}

export function buildSchedulerInputFromContainer(
  container: SpaceContainer,
  context?: {
    slot?: SpaceSlot | null;
    nodes?: ExecutionNode[];
    allContainers?: Array<{ container: SpaceContainer; slot?: SpaceSlot | null; nodes?: ExecutionNode[] }>;
    resources?: { lab: SchedulerResource[]; equipment: SchedulerResource[] };
    workingHours?: string[];
    weather?: string;
    season?: string;
  },
): { standardContainer: SpaceContainerStandardModel; schedulerInput: SchedulerInput } {
  const standardContainer = toStandardSpaceContainer(container, {
    slot: context?.slot ?? null,
    nodes: context?.nodes ?? [],
  });

  const allStandard = (context?.allContainers ?? []).map((item) =>
    toStandardSpaceContainer(item.container, {
      slot: item.slot ?? null,
      nodes: item.nodes ?? [],
    }),
  );

  const neighbors = collectStandardNeighborContainers(standardContainer, allStandard);
  const schedulerInput = buildSchedulerInputFromStandardContainer(standardContainer, {
    neighbors,
    resources: context?.resources,
    workingHours: context?.workingHours,
    weather: context?.weather,
    season: context?.season,
  });

  return { standardContainer, schedulerInput };
}
