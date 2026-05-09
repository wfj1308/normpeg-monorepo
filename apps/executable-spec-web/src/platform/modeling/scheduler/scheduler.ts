import type { CSDTask, CSDSchedulerInput, SchedulerResult } from "../types/CSDSchedulerInput.ts";
import { checkDependency as checkDependencyRule } from "./rules/dependencyRule.ts";
import { checkResource as checkResourceRule } from "./rules/resourceRule.ts";
import { checkSpace as checkSpaceRule } from "./rules/spaceRule.ts";
import { checkTime as checkTimeRule } from "./rules/timeRule.ts";

export function filterPendingTasks(tasks: CSDTask[]): CSDTask[] {
  return tasks.filter((task) => task.status === "pending");
}

export function checkDependency(task: CSDTask, tasks: CSDTask[]): { ok: boolean; reason: string } {
  return checkDependencyRule(task, tasks);
}

export function checkResource(
  task: CSDTask,
  resources: CSDSchedulerInput["resources"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  return checkResourceRule(task, resources, normConstraints);
}

export function checkTime(
  task: CSDTask,
  timeConstraints: CSDSchedulerInput["timeConstraints"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  return checkTimeRule(task, timeConstraints, normConstraints);
}

export function checkSpace(
  task: CSDTask,
  spaceConstraints: CSDSchedulerInput["spaceConstraints"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  return checkSpaceRule(task, spaceConstraints, normConstraints);
}

function inferTaskType(spuId: string): "compaction" | "deflection" | "thickness" | "generic" {
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

function comparePendingTask(a: CSDTask, b: CSDTask, input: CSDSchedulerInput): number {
  const priority = b.priority - a.priority;
  if (priority !== 0) {
    return priority;
  }

  // Keep key-path preference explicit for explainable scheduling behavior.
  const aCritical = inferTaskType(a.spuId) === "compaction" ? 1 : 0;
  const bCritical = inferTaskType(b.spuId) === "compaction" ? 1 : 0;
  if (aCritical !== bCritical) {
    return bCritical - aCritical;
  }

  if (input.optimizationTargets.duration === "min") {
    const byDuration = (a.durationEstimate ?? Number.MAX_SAFE_INTEGER) - (b.durationEstimate ?? Number.MAX_SAFE_INTEGER);
    if (byDuration !== 0) {
      return byDuration;
    }
  }

  if (input.optimizationTargets.cost === "min") {
    const aNeedResource = inferTaskType(a.spuId) === "generic" ? 0 : 1;
    const bNeedResource = inferTaskType(b.spuId) === "generic" ? 0 : 1;
    if (aNeedResource !== bNeedResource) {
      return aNeedResource - bNeedResource;
    }
  }

  return a.spuId.localeCompare(b.spuId);
}

export function scheduleNextTask(input: CSDSchedulerInput): SchedulerResult {
  const pendingTasks = filterPendingTasks(input.tasks)
    .sort((a, b) => comparePendingTask(a, b, input));
  const blockedReasons: string[] = [];

  if (pendingTasks.length === 0) {
    return {
      nextTask: null,
      reason: ["no schedulable task"],
    };
  }

  for (const task of pendingTasks) {
    const dependency = checkDependency(task, input.tasks);
    if (!dependency.ok) {
      blockedReasons.push(`${task.spuId}: ${dependency.reason}`);
      continue;
    }

    const resource = checkResource(task, input.resources, input.normConstraints);
    if (!resource.ok) {
      blockedReasons.push(`${task.spuId}: ${resource.reason}`);
      continue;
    }

    const time = checkTime(task, input.timeConstraints, input.normConstraints);
    if (!time.ok) {
      blockedReasons.push(`${task.spuId}: ${time.reason}`);
      continue;
    }

    const space = checkSpace(task, input.spaceConstraints, input.normConstraints);
    if (!space.ok) {
      blockedReasons.push(`${task.spuId}: ${space.reason}`);
      continue;
    }

    return {
      nextTask: task.spuId,
      reason: [dependency.reason, resource.reason, time.reason, space.reason, "highest priority"],
    };
  }

  return {
    nextTask: null,
    reason: blockedReasons.length > 0 ? ["no schedulable task", ...blockedReasons] : ["no schedulable task"],
  };
}
