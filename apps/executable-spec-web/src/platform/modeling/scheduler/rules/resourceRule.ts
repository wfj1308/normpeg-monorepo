import type { CSDTask, CSDSchedulerInput } from "../../types/CSDSchedulerInput.ts";

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

export function checkResource(
  task: CSDTask,
  resources: CSDSchedulerInput["resources"],
  normConstraints?: CSDSchedulerInput["normConstraints"],
): { ok: boolean; reason: string } {
  const taskType = inferTaskType(task.spuId);
  const resourceConstraints = normConstraints?.resourceConstraints ?? [];

  if (taskType === "compaction") {
    const compactorConstraints = resourceConstraints.filter((item) => item.resourceType === "equipment");
    const maxUsage = compactorConstraints
      .map((item) => item.maxUsage)
      .filter((item): item is number => typeof item === "number");
    if (maxUsage.some((item) => item <= 0)) {
      return { ok: false, reason: "resource constraint blocked: equipment maxUsage <= 0" };
    }

    const constrainedCodes = compactorConstraints
      .map((item) => String(item.resourceCode ?? "").trim().toLowerCase())
      .filter(Boolean);
    const hasCompactor = resources.equipment.some(
      (item) => item.available && item.type.toLowerCase() === "compactor",
    );
    if (!hasCompactor) {
      return { ok: false, reason: "resource unavailable: equipment.compactor" };
    }
    if (constrainedCodes.length > 0) {
      const matchedByConstraint = resources.equipment.some((item) => {
        if (!item.available) {
          return false;
        }
        const id = item.id.toLowerCase();
        const type = item.type.toLowerCase();
        return constrainedCodes.some(
          (code) =>
            id === code ||
            type === code ||
            id.includes(code) ||
            code.includes(id) ||
            type.includes(code) ||
            code.includes(type),
        );
      });
      if (!matchedByConstraint) {
        return { ok: false, reason: "resource constraint blocked: equipment resourceCode mismatch" };
      }
    }
    return { ok: true, reason: "resource available: equipment.compactor" };
  }

  if (taskType === "deflection") {
    const labConstraints = resourceConstraints.filter((item) => item.resourceType === "personnel");
    const maxUsage = labConstraints
      .map((item) => item.maxUsage)
      .filter((item): item is number => typeof item === "number");
    if (maxUsage.some((item) => item <= 0)) {
      return { ok: false, reason: "resource constraint blocked: personnel maxUsage <= 0" };
    }

    const constrainedCodes = labConstraints
      .map((item) => String(item.resourceCode ?? "").trim().toLowerCase())
      .filter(Boolean);
    const hasLab = resources.personnel.some(
      (item) => item.available && (item.type.toLowerCase() === "lab" || item.id.toLowerCase().includes("lab")),
    );
    if (!hasLab) {
      return { ok: false, reason: "resource unavailable: personnel.lab" };
    }
    if (constrainedCodes.length > 0) {
      const matchedByConstraint = resources.personnel.some((item) => {
        if (!item.available) {
          return false;
        }
        const id = item.id.toLowerCase();
        const type = item.type.toLowerCase();
        return constrainedCodes.some(
          (code) =>
            id === code ||
            type === code ||
            id.includes(code) ||
            code.includes(id) ||
            type.includes(code) ||
            code.includes(type),
        );
      });
      if (!matchedByConstraint) {
        return { ok: false, reason: "resource constraint blocked: personnel resourceCode mismatch" };
      }
    }
    return { ok: true, reason: "resource available: personnel.lab" };
  }

  return { ok: true, reason: "resource available" };
}
