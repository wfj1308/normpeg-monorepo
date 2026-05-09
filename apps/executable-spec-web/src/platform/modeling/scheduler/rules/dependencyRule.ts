import type { CSDTask } from "../../types/CSDSchedulerInput.ts";

export function checkDependency(task: CSDTask, tasks: CSDTask[]): { ok: boolean; reason: string } {
  const dependencies = task.constraints.mustAfter ?? [];
  if (dependencies.length === 0) {
    return { ok: true, reason: "no dependency" };
  }

  const taskMap = new Map(tasks.map((item) => [item.spuId, item]));
  for (const depId of dependencies) {
    const depTask = taskMap.get(depId);
    if (!depTask || depTask.status !== "pass") {
      return { ok: false, reason: `dependency not satisfied: ${depId}` };
    }
  }
  return { ok: true, reason: "dependency satisfied" };
}
