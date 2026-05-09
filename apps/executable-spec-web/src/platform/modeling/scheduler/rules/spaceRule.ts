import type { CSDTask, CSDSchedulerInput } from "../../types/CSDSchedulerInput.ts";

function inferTaskType(spuId: string): string {
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

export function checkSpace(
  task: CSDTask,
  spaceConstraints: CSDSchedulerInput["spaceConstraints"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  const taskType = inferTaskType(task.spuId);
  if (taskType === "generic") {
    return { ok: true, reason: "no space conflict" };
  }

  const spaceConflictRules = normConstraints?.spaceConflictRules ?? [];
  const matchedRules = spaceConflictRules.filter((rule) => {
    if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
      return true;
    }
    return rule.appliesTo.some((item) => {
      const target = String(item || "").trim().toLowerCase();
      const spuId = task.spuId.toLowerCase();
      return (
        target === spuId ||
        target === taskType ||
        spuId.includes(target) ||
        target.includes(taskType)
      );
    });
  });
  const shouldApplyRule = spaceConflictRules.length === 0 || matchedRules.length > 0;

  const conflict = spaceConstraints.neighborContainers.some(
    (item) => String(item.activeTask ?? "").trim().toLowerCase() === taskType,
  );
  if (conflict && shouldApplyRule) {
    const ruleTag = matchedRules[0]?.ruleId ? ` (${matchedRules[0].ruleId})` : "";
    return { ok: false, reason: `space conflict: neighbor running ${taskType}${ruleTag}` };
  }
  return { ok: true, reason: "no space conflict" };
}
