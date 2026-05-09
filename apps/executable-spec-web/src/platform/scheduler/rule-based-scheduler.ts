import type { SchedulerInput, SchedulerRecommendation, SchedulerTaskInput } from "../types.ts";

function taskTagFromSpuId(spuId: string): string {
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

function dependencySatisfied(task: SchedulerTaskInput, completedSet: Set<string>): boolean {
  return task.constraints.must_after.every((item) => completedSet.has(item));
}

function resourceAvailable(task: SchedulerTaskInput, input: SchedulerInput): boolean {
  const tag = taskTagFromSpuId(task.spuId);
  const hasLab = input.resources.lab.some((item) => item.available);
  if (tag === "compaction") {
    const hasCompactor = input.resources.equipment.some((item) => item.available && item.type === "compactor");
    return hasLab && hasCompactor;
  }
  return hasLab;
}

function hasSpaceConflict(task: SchedulerTaskInput, input: SchedulerInput): boolean {
  const tag = taskTagFromSpuId(task.spuId);
  if (tag === "generic") {
    return false;
  }
  return input.space_constraints.neighbor_containers.some((item) => item.active_task === tag);
}

export function scheduleNextTask(input: SchedulerInput): SchedulerRecommendation {
  const pendingTasks = input.tasks
    .filter((item) => item.status === "pending")
    .sort((a, b) => b.priority - a.priority);

  if (pendingTasks.length === 0) {
    return {
      next_task: null,
      reason: ["no schedulable task"],
    };
  }

  const completedSet = new Set(
    input.tasks
      .filter((item) => item.status === "completed")
      .map((item) => item.spuId),
  );

  for (const task of pendingTasks) {
    if (!dependencySatisfied(task, completedSet)) {
      continue;
    }
    if (!resourceAvailable(task, input)) {
      continue;
    }
    if (hasSpaceConflict(task, input)) {
      continue;
    }
    return {
      next_task: task.spuId,
      reason: ["dependency satisfied", "resource available", "no space conflict", "highest priority"],
    };
  }

  return {
    next_task: null,
    reason: ["no schedulable task"],
  };
}
