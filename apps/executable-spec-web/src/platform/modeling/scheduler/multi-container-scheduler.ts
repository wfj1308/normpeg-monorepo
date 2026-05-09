import {
  buildCSDSchedulerInput,
  type NormRef,
  type ResourcePool,
  type SpaceContainer,
} from "../csd-models.ts";
import type { CSDSchedulerInput, CSDTask } from "../types/CSDSchedulerInput.ts";
import { scheduleNextTask } from "./scheduler.ts";
import { checkDependency } from "./rules/dependencyRule.ts";
import { checkResource } from "./rules/resourceRule.ts";
import { checkTime } from "./rules/timeRule.ts";

type TaskType = "compaction" | "deflection" | "thickness" | "generic";

export interface GlobalSchedulerResources {
  lab: Array<{ id: string; available: boolean }>;
  equipment: Array<{ id: string; type: string; available: boolean }>;
}

export interface GlobalTimeContext {
  currentTime: string;
  weather: "clear" | "rain";
  season?: string;
  workHours?: string[];
}

export interface NextTaskCandidate {
  containerId: string;
  station: string;
  stationValue: number;
  schedulerInput: CSDSchedulerInput;
  nextTask: string | null;
  task: CSDTask | null;
  taskType: TaskType;
  priority: number;
  reason: string[];
}

interface CandidateOutcome {
  candidate: NextTaskCandidate;
  reason: string[];
}

interface AllocatedTask {
  candidate: NextTaskCandidate;
  resource: string | null;
  reason: string[];
}

export interface ScheduleEntry {
  containerId: string;
  spuId: string | null;
  status: "scheduled" | "waiting" | "blocked";
  startTime: string | null;
  resource: string | null;
  reason: string[];
}

export interface MultiContainerScheduleResult {
  schedule: ScheduleEntry[];
}

function uniqueReasons(input: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of input) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function inferTaskType(spuId: string | null | undefined): TaskType {
  const lowered = String(spuId || "").toLowerCase();
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

function parseStation(station: string): number {
  const text = String(station || "").trim().toUpperCase();
  const match = /^K(\d+)\+(\d+)$/.exec(text);
  if (match) {
    return Number(match[1]) * 1000 + Number(match[2]);
  }
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : Number.MAX_SAFE_INTEGER;
}

function areAdjacentStation(a: number, b: number): boolean {
  const delta = Math.abs(a - b);
  return delta > 0 && delta <= 10;
}

function toResourcePool(resources: GlobalSchedulerResources): ResourcePool {
  return {
    personnel: resources.lab.map((item) => ({
      id: item.id,
      type: "lab",
      available: item.available,
    })),
    equipment: resources.equipment.map((item) => ({
      id: item.id,
      type: item.type,
      available: item.available,
    })),
  };
}

function buildNeighborContext(
  source: SpaceContainer,
  allContainers: SpaceContainer[],
): CSDSchedulerInput["spaceConstraints"]["neighborContainers"] {
  const sourceStation = parseStation(source.geoReference.station);
  return allContainers
    .filter((item) => item.vAddress !== source.vAddress)
    .filter((item) => areAdjacentStation(sourceStation, parseStation(item.geoReference.station)))
    .map((item) => ({
      containerId: item.vAddress,
      activeTask: inferTaskType(item.runtime.activeSpec),
    }));
}

function compareCandidate(a: NextTaskCandidate, b: NextTaskCandidate): number {
  const priority = b.priority - a.priority;
  if (priority !== 0) {
    return priority;
  }

  const aCritical = a.taskType === "compaction" ? 1 : 0;
  const bCritical = b.taskType === "compaction" ? 1 : 0;
  if (aCritical !== bCritical) {
    return bCritical - aCritical;
  }

  if (a.schedulerInput.optimizationTargets.duration === "min") {
    const aDuration = a.task?.durationEstimate ?? Number.MAX_SAFE_INTEGER;
    const bDuration = b.task?.durationEstimate ?? Number.MAX_SAFE_INTEGER;
    const duration = aDuration - bDuration;
    if (duration !== 0) {
      return duration;
    }
  }

  if (a.schedulerInput.optimizationTargets.cost === "min") {
    const aNeed = requiredResource(a.taskType) ? 1 : 0;
    const bNeed = requiredResource(b.taskType) ? 1 : 0;
    if (aNeed !== bNeed) {
      return aNeed - bNeed;
    }
  }

  if (a.schedulerInput.optimizationTargets.risk === "min") {
    const aNeighborRisk = a.schedulerInput.spaceConstraints.neighborContainers
      .filter((item) => String(item.activeTask ?? "").toLowerCase() === a.taskType)
      .length;
    const bNeighborRisk = b.schedulerInput.spaceConstraints.neighborContainers
      .filter((item) => String(item.activeTask ?? "").toLowerCase() === b.taskType)
      .length;
    if (aNeighborRisk !== bNeighborRisk) {
      return aNeighborRisk - bNeighborRisk;
    }
  }

  return a.stationValue - b.stationValue;
}

function requiredResource(taskType: TaskType): "compactor" | "lab" | null {
  if (taskType === "compaction") {
    return "compactor";
  }
  if (taskType === "deflection") {
    return "lab";
  }
  return null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function matchesResourceCode(id: string, type: string, code: string): boolean {
  const normalizedCode = normalizeText(code);
  if (!normalizedCode) {
    return true;
  }
  const normalizedId = normalizeText(id);
  const normalizedType = normalizeText(type);
  return (
    normalizedId === normalizedCode ||
    normalizedType === normalizedCode ||
    normalizedId.includes(normalizedCode) ||
    normalizedCode.includes(normalizedId) ||
    normalizedType.includes(normalizedCode) ||
    normalizedCode.includes(normalizedType)
  );
}

function minDefined(values: Array<number | undefined>): number | undefined {
  const normalized = values.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  if (normalized.length === 0) {
    return undefined;
  }
  return Math.min(...normalized);
}

export function getNextTasks(
  containers: SpaceContainer[],
  normRef: NormRef,
  resources: GlobalSchedulerResources,
  timeContext: GlobalTimeContext,
): NextTaskCandidate[] {
  const sharedPool = toResourcePool(resources);

  return containers.map((container) => {
    const schedulerInput = buildCSDSchedulerInput(
      container,
      normRef,
      sharedPool,
      {
        weather: timeContext.weather,
        season: timeContext.season,
        currentTime: timeContext.currentTime,
        workHours: timeContext.workHours,
      },
      {
        neighborContainers: buildNeighborContext(container, containers),
      },
    );

    const recommendation = scheduleNextTask(schedulerInput);
    const task = recommendation.nextTask
      ? schedulerInput.tasks.find((item) => item.spuId === recommendation.nextTask) ?? null
      : null;
    const taskType = inferTaskType(task?.spuId);

    return {
      containerId: schedulerInput.location.station,
      station: schedulerInput.location.station,
      stationValue: parseStation(schedulerInput.location.station),
      schedulerInput,
      nextTask: recommendation.nextTask,
      task,
      taskType,
      priority: task?.priority ?? 0,
      reason: recommendation.reason,
    };
  });
}

export function filterExecutableTasks(tasks: NextTaskCandidate[]): {
  executable: NextTaskCandidate[];
  blocked: CandidateOutcome[];
} {
  const executable: NextTaskCandidate[] = [];
  const blocked: CandidateOutcome[] = [];

  for (const candidate of tasks) {
    if (!candidate.task) {
      blocked.push({
        candidate,
        reason: candidate.reason.length > 0 ? candidate.reason : ["no schedulable task"],
      });
      continue;
    }

    const dependency = checkDependency(candidate.task, candidate.schedulerInput.tasks);
    if (!dependency.ok) {
      blocked.push({
        candidate,
        reason: uniqueReasons([dependency.reason, ...candidate.reason]),
      });
      continue;
    }

    const resource = checkResource(
      candidate.task,
      candidate.schedulerInput.resources,
      candidate.schedulerInput.normConstraints,
    );
    if (!resource.ok) {
      blocked.push({
        candidate,
        reason: uniqueReasons([resource.reason, ...candidate.reason]),
      });
      continue;
    }

    const time = checkTime(
      candidate.task,
      candidate.schedulerInput.timeConstraints,
      candidate.schedulerInput.normConstraints,
    );
    if (!time.ok) {
      blocked.push({
        candidate,
        reason: uniqueReasons([time.reason, ...candidate.reason]),
      });
      continue;
    }

    executable.push({
      ...candidate,
      reason: uniqueReasons([dependency.reason, resource.reason, time.reason, ...candidate.reason]),
    });
  }

  return { executable, blocked };
}

export function resolveSpaceConflicts(tasks: NextTaskCandidate[]): {
  executable: NextTaskCandidate[];
  delayed: CandidateOutcome[];
} {
  const sorted = [...tasks].sort(compareCandidate);
  const executable: NextTaskCandidate[] = [];
  const delayed: CandidateOutcome[] = [];

  for (const candidate of sorted) {
    const heavyTask = candidate.taskType === "compaction";
    if (!heavyTask) {
      executable.push(candidate);
      continue;
    }

    const conflictWith = executable.find(
      (item) =>
        item.taskType === "compaction" &&
        areAdjacentStation(item.stationValue, candidate.stationValue),
    );

    if (conflictWith) {
      delayed.push({
        candidate,
        reason: uniqueReasons([
          ...candidate.reason,
          `space conflict: adjacent container ${conflictWith.containerId} already scheduled for compaction`,
        ]),
      });
      continue;
    }

    executable.push(candidate);
  }

  return { executable, delayed };
}

export function allocateResources(
  tasks: NextTaskCandidate[],
  resources: GlobalSchedulerResources,
  normRef?: NormRef,
): {
  scheduled: AllocatedTask[];
  delayed: CandidateOutcome[];
} {
  const sorted = [...tasks].sort(compareCandidate);
  const scheduled: AllocatedTask[] = [];
  const delayed: CandidateOutcome[] = [];

  const resourceConstraints = normRef?.constraints.resourceConstraints ?? [];
  const personnelConstraints = resourceConstraints.filter((item) => item.resourceType === "personnel");
  const equipmentConstraints = resourceConstraints.filter((item) => item.resourceType === "equipment");
  const labCodes = personnelConstraints.map((item) => item.resourceCode).filter((item): item is string => Boolean(item));
  const compactorCodes = equipmentConstraints.map((item) => item.resourceCode).filter((item): item is string => Boolean(item));
  const maxLabUsage = minDefined(personnelConstraints.map((item) => item.maxUsage));
  const maxCompactorUsage = minDefined(equipmentConstraints.map((item) => item.maxUsage));

  let availableLabs = resources.lab
    .filter((item) => item.available)
    .filter((item) => labCodes.length === 0 || labCodes.some((code) => matchesResourceCode(item.id, "lab", code)))
    .map((item) => item.id);
  let availableCompactors = resources.equipment
    .filter((item) => item.available && String(item.type).toLowerCase() === "compactor")
    .filter((item) => compactorCodes.length === 0 || compactorCodes.some((code) => matchesResourceCode(item.id, item.type, code)))
    .map((item) => item.id);

  if (typeof maxLabUsage === "number" && maxLabUsage >= 0) {
    availableLabs = availableLabs.slice(0, maxLabUsage);
  }
  if (typeof maxCompactorUsage === "number" && maxCompactorUsage >= 0) {
    availableCompactors = availableCompactors.slice(0, maxCompactorUsage);
  }

  for (const candidate of sorted) {
    const needed = requiredResource(candidate.taskType);

    if (needed === "lab") {
      const labId = availableLabs.shift();
      if (!labId) {
        delayed.push({
          candidate,
          reason: uniqueReasons([...candidate.reason, "resource unavailable: lab already allocated"]),
        });
        continue;
      }
      scheduled.push({
        candidate,
        resource: labId,
        reason: uniqueReasons([...candidate.reason, "resource allocated: lab"]),
      });
      continue;
    }

    if (needed === "compactor") {
      const compactorId = availableCompactors.shift();
      if (!compactorId) {
        delayed.push({
          candidate,
          reason: uniqueReasons([
            ...candidate.reason,
            "resource unavailable: compactor already allocated",
          ]),
        });
        continue;
      }
      scheduled.push({
        candidate,
        resource: compactorId,
        reason: uniqueReasons([...candidate.reason, "resource allocated: compactor"]),
      });
      continue;
    }

    scheduled.push({
      candidate,
      resource: null,
      reason: uniqueReasons([...candidate.reason, "no dedicated resource required"]),
    });
  }

  return { scheduled, delayed };
}

export function buildSchedule(params: {
  allCandidates: NextTaskCandidate[];
  scheduled: AllocatedTask[];
  waiting: CandidateOutcome[];
  blocked: CandidateOutcome[];
  timeContext: GlobalTimeContext;
}): MultiContainerScheduleResult {
  const decisionMap = new Map<string, ScheduleEntry>();

  for (const item of params.blocked) {
    decisionMap.set(item.candidate.containerId, {
      containerId: item.candidate.containerId,
      spuId: item.candidate.nextTask,
      status: "blocked",
      startTime: null,
      resource: null,
      reason: uniqueReasons(item.reason),
    });
  }

  for (const item of params.waiting) {
    if (decisionMap.get(item.candidate.containerId)?.status === "scheduled") {
      continue;
    }
    decisionMap.set(item.candidate.containerId, {
      containerId: item.candidate.containerId,
      spuId: item.candidate.nextTask,
      status: "waiting",
      startTime: null,
      resource: null,
      reason: uniqueReasons(item.reason),
    });
  }

  for (const item of params.scheduled) {
    decisionMap.set(item.candidate.containerId, {
      containerId: item.candidate.containerId,
      spuId: item.candidate.nextTask,
      status: "scheduled",
      startTime: params.timeContext.currentTime,
      resource: item.resource,
      reason: uniqueReasons(item.reason),
    });
  }

  for (const candidate of params.allCandidates) {
    if (decisionMap.has(candidate.containerId)) {
      continue;
    }
    decisionMap.set(candidate.containerId, {
      containerId: candidate.containerId,
      spuId: candidate.nextTask,
      status: candidate.nextTask ? "waiting" : "blocked",
      startTime: null,
      resource: null,
      reason: uniqueReasons(candidate.reason.length > 0 ? candidate.reason : ["no schedulable task"]),
    });
  }

  const stationByContainer = new Map(
    params.allCandidates.map((item) => [item.containerId, item.stationValue]),
  );
  const schedule = [...decisionMap.values()].sort(
    (a, b) =>
      (stationByContainer.get(a.containerId) ?? Number.MAX_SAFE_INTEGER) -
      (stationByContainer.get(b.containerId) ?? Number.MAX_SAFE_INTEGER),
  );

  return { schedule };
}

export function scheduleContainers(
  containers: SpaceContainer[],
  normRef: NormRef,
  resources: GlobalSchedulerResources,
  timeContext: GlobalTimeContext,
): MultiContainerScheduleResult {
  const nextTasks = getNextTasks(containers, normRef, resources, timeContext);
  const filtered = filterExecutableTasks(nextTasks);
  const spaceResolved = resolveSpaceConflicts(filtered.executable);
  const normalizedAllocation = allocateResources(spaceResolved.executable, resources, normRef);

  return buildSchedule({
    allCandidates: nextTasks,
    scheduled: normalizedAllocation.scheduled,
    waiting: [...spaceResolved.delayed, ...normalizedAllocation.delayed],
    blocked: filtered.blocked,
    timeContext,
  });
}
