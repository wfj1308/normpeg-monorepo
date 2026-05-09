import { buildSpecImpactAnalysis, type SpecImpactAnalysis } from "./spec_impact_analysis.ts";
import {
  findContainersUsingSpu,
  type RunningContainer,
  type RunningLifecycleState,
  type RunningSpecStatus,
} from "./running_container_scanner.ts";
import { classifyContainerImpact } from "./running_impact_classifier.ts";
import type { ImpactLevel } from "./impact_classifier.ts";

export interface RunningImpactContainerItem {
  containerId: string;
  spuId: string;
  lifecycleState: RunningLifecycleState;
  containerState: "running" | "completed" | "draft";
  specStatus: RunningSpecStatus;
  impactLevel: ImpactLevel;
  requiresReview: boolean;
  latestNode?: string | null;
  message: string;
}

export interface RunningImpactScanResult {
  oldSpuId: string;
  newSpuId: string;
  specImpactAnalysis: SpecImpactAnalysis;
  summary: {
    totalAffected: number;
    running: number;
    completed: number;
    requiresReview: number;
  };
  affectedContainers: RunningImpactContainerItem[];
  requiresReviewContainers: string[];
}

export function buildRunningImpactScan(
  oldSpuId: string,
  newSpecJson: unknown,
  containers: RunningContainer[],
  oldSpecJson: unknown,
): RunningImpactScanResult {
  const specImpactAnalysis = buildSpecImpactAnalysis(oldSpecJson, newSpecJson);
  const matched = findContainersUsingSpu(containers, oldSpuId);

  const affectedContainers: RunningImpactContainerItem[] = matched.map(({ container, spec }) => {
    const classified = classifyContainerImpact(container, oldSpuId, specImpactAnalysis);
    return {
      containerId: container.containerId,
      spuId: spec.spuId,
      lifecycleState: container.lifecycleState,
      containerState: classified.containerState,
      specStatus: classified.specStatus,
      impactLevel: classified.impactLevel,
      requiresReview: classified.requiresReview,
      latestNode: spec.latestNode ?? null,
      message: classified.message,
    };
  });

  const requiresReviewContainers = affectedContainers.filter((item) => item.requiresReview).map((item) => item.containerId);
  const running = affectedContainers.filter((item) => item.containerState === "running").length;
  const completed = affectedContainers.filter((item) => item.containerState === "completed").length;

  const normalizedNewSpec = (newSpecJson ?? {}) as { spuId?: unknown };
  return {
    oldSpuId,
    newSpuId: typeof normalizedNewSpec.spuId === "string" ? normalizedNewSpec.spuId : "",
    specImpactAnalysis,
    summary: {
      totalAffected: affectedContainers.length,
      running,
      completed,
      requiresReview: requiresReviewContainers.length,
    },
    affectedContainers,
    requiresReviewContainers,
  };
}
