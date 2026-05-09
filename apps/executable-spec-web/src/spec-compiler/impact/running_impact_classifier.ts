import type { ImpactLevel } from "./impact_classifier.ts";
import type { SpecImpactAnalysis } from "./spec_impact_analysis.ts";
import type { RunningContainer, RunningContainerApplicableSpec, RunningSpecStatus } from "./running_container_scanner.ts";

export type RunningContainerState = "running" | "completed" | "draft";

export interface ClassifiedContainerImpact {
  containerState: RunningContainerState;
  specStatus: RunningSpecStatus;
  impactLevel: ImpactLevel;
  requiresReview: boolean;
  message: string;
}

function resolveContainerState(container: RunningContainer, spec: RunningContainerApplicableSpec): RunningContainerState {
  if (container.lifecycleState === "active" || spec.status === "running") {
    return "running";
  }
  if (container.lifecycleState === "validated" || container.lifecycleState === "archived" || spec.status === "pass") {
    return "completed";
  }
  return "draft";
}

function deriveBaseImpactLevel(container: RunningContainer, spec: RunningContainerApplicableSpec): ImpactLevel {
  if (container.lifecycleState === "active" || spec.status === "running") {
    return "high";
  }
  if (container.lifecycleState === "validated" || spec.status === "pass") {
    return "medium";
  }
  return "low";
}

function escalateBySpecImpact(
  baseLevel: ImpactLevel,
  containerState: RunningContainerState,
  specImpactAnalysis: SpecImpactAnalysis,
): ImpactLevel {
  if (specImpactAnalysis.impactLevel !== "high") {
    return baseLevel;
  }
  if (containerState === "running") {
    return "high";
  }
  if (containerState === "completed") {
    return baseLevel === "low" ? "medium" : baseLevel;
  }
  return baseLevel;
}

function buildMessage(containerState: RunningContainerState, impactLevel: ImpactLevel): string {
  if (containerState === "running") {
    return "该容器正在执行旧版规范，需人工评估是否中止或切换。";
  }
  if (containerState === "completed") {
    if (impactLevel === "high") {
      return "该容器已按旧版完成，但新版本为高影响变更，建议优先人工复核。";
    }
    return "该容器已按旧版完成，建议做差异复核。";
  }
  return "该容器尚未执行，后续可切换新版规范。";
}

export function classifyContainerImpact(
  container: RunningContainer,
  oldSpuId: string,
  specImpactAnalysis: SpecImpactAnalysis,
): ClassifiedContainerImpact {
  const spec = container.normExecution.applicableSpecs.find((item) => item.spuId === oldSpuId);
  if (!spec) {
    return {
      containerState: "draft",
      specStatus: "blocked",
      impactLevel: "low",
      requiresReview: false,
      message: "容器未绑定旧版规范，无需复核。",
    };
  }

  const containerState = resolveContainerState(container, spec);
  const baseImpactLevel = deriveBaseImpactLevel(container, spec);
  const impactLevel = escalateBySpecImpact(baseImpactLevel, containerState, specImpactAnalysis);
  return {
    containerState,
    specStatus: spec.status,
    impactLevel,
    requiresReview: impactLevel !== "low",
    message: buildMessage(containerState, impactLevel),
  };
}
