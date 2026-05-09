import type { SpecDiffItem } from "./spec_diff.ts";

export type ImpactType = "meta" | "input" | "path" | "gate" | "proof" | "dependency";
export type ImpactLevel = "high" | "medium" | "low";

export interface ImpactClassifiedDiff extends SpecDiffItem {
  impactType: ImpactType;
  impactLevel: ImpactLevel;
}

export function classifyImpact(diff: SpecDiffItem): ImpactClassifiedDiff {
  if (diff.field.startsWith("rules")) {
    return { ...diff, impactType: "gate", impactLevel: "high" };
  }
  if (diff.field.startsWith("path")) {
    return { ...diff, impactType: "path", impactLevel: "high" };
  }
  if (diff.field.startsWith("dependsOn")) {
    return { ...diff, impactType: "dependency", impactLevel: "high" };
  }
  if (diff.field.startsWith("data.inputs") || diff.field.startsWith("data.outputs")) {
    return { ...diff, impactType: "input", impactLevel: "medium" };
  }
  if (diff.field.startsWith("proof.requiredSignatures")) {
    return { ...diff, impactType: "proof", impactLevel: "medium" };
  }
  if (diff.field.startsWith("meta.")) {
    return { ...diff, impactType: "meta", impactLevel: "low" };
  }
  return { ...diff, impactType: "meta", impactLevel: "low" };
}
