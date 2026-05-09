import { classifyImpact, type ImpactClassifiedDiff, type ImpactLevel, type ImpactType } from "./impact_classifier.ts";
import { diffSpecJson, normalizeSpecForImpact } from "./spec_diff.ts";

export type AffectedArea = ImpactType | "running_containers";

export interface SpecImpactAnalysis {
  hasImpact: boolean;
  impactLevel: ImpactLevel;
  summary: string;
  diffs: ImpactClassifiedDiff[];
  affectedAreas: AffectedArea[];
  requiresReview: boolean;
}

function impactScore(level: ImpactLevel): number {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  return 1;
}

function resolveImpactLevel(diffs: ImpactClassifiedDiff[]): ImpactLevel {
  if (diffs.length === 0) {
    return "low";
  }
  return diffs.reduce<ImpactLevel>((acc, item) => (impactScore(item.impactLevel) > impactScore(acc) ? item.impactLevel : acc), "low");
}

function buildSummary(diffs: ImpactClassifiedDiff[], impactLevel: ImpactLevel): string {
  if (diffs.length === 0) {
    return "新旧规范无关键差异，对执行层无明显影响。";
  }
  if (impactLevel === "high") {
    if (diffs.some((item) => item.impactType === "gate")) {
      return "新版本修改了判定规则，将影响 Gate 判定结果。";
    }
    if (diffs.some((item) => item.impactType === "path")) {
      return "新版本修改了计算步骤，将影响 ExecPeg 执行结果。";
    }
    if (diffs.some((item) => item.impactType === "dependency")) {
      return "新版本修改了依赖关系，可能影响运行中容器执行顺序。";
    }
    return "新版本存在高风险执行变更，请人工复核。";
  }
  if (impactLevel === "medium") {
    if (diffs.some((item) => item.impactType === "proof")) {
      return "新版本修改了签字要求，可能影响 Proof 完整性。";
    }
    if (diffs.some((item) => item.impactType === "input")) {
      return "新版本修改了输入/输出定义，可能影响执行入参与结果结构。";
    }
    return "新版本存在中风险执行变更，建议人工复核。";
  }
  return "新版本仅涉及元信息或描述字段变化，对执行逻辑影响较低。";
}

function versionNumber(version: string): number {
  const matched = version.match(/\d+/g);
  if (!matched || matched.length === 0) {
    return -1;
  }
  return Number(matched.join(""));
}

export function findComparableSpec(candidates: unknown[], newSpec: unknown): unknown | null {
  const target = normalizeSpecForImpact(newSpec);
  const matches = candidates
    .map((item) => ({ raw: item, normalized: normalizeSpecForImpact(item) }))
    .filter((item) => {
      if (!item.normalized.spuId || item.normalized.spuId === target.spuId) {
        return false;
      }
      if (item.normalized.meta.norm !== target.meta.norm) {
        return false;
      }
      if (item.normalized.meta.clause !== target.meta.clause) {
        return false;
      }
      if (target.meta.category && item.normalized.meta.category && item.normalized.meta.category !== target.meta.category) {
        return false;
      }
      if (
        target.meta.measuredItem &&
        item.normalized.meta.measuredItem &&
        item.normalized.meta.measuredItem !== target.meta.measuredItem
      ) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const byVersion = versionNumber(right.normalized.meta.version) - versionNumber(left.normalized.meta.version);
      if (byVersion !== 0) {
        return byVersion;
      }
      return right.normalized.spuId.localeCompare(left.normalized.spuId);
    });

  return matches[0]?.raw ?? null;
}

export function buildSpecImpactAnalysis(oldSpec: unknown, newSpec: unknown): SpecImpactAnalysis {
  const diffs = diffSpecJson(oldSpec, newSpec).map((item) => classifyImpact(item));
  const impactLevel = resolveImpactLevel(diffs);
  const baseAreas = Array.from(new Set(diffs.map((item) => item.impactType))) as ImpactType[];
  const affectedAreas: AffectedArea[] = [...baseAreas];
  if (diffs.some((item) => item.impactLevel === "high") && !affectedAreas.includes("running_containers")) {
    affectedAreas.push("running_containers");
  }

  return {
    hasImpact: diffs.length > 0,
    impactLevel,
    summary: buildSummary(diffs, impactLevel),
    diffs,
    affectedAreas,
    requiresReview: impactLevel === "high",
  };
}
