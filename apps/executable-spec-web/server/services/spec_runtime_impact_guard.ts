import { toStandardSpaceContainer } from "../../src/platform/spatial/space-container-standard.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import type { SchedulerTaskStatus } from "../../src/platform/types.ts";
import type { CompiledMarkdownSpecJSON } from "../../src/spec-compiler/schemas.ts";
import {
  buildRunningImpactScan,
  type RunningContainer,
  type RunningImpactScanResult,
  type RunningLifecycleState,
  type RunningSpecStatus,
} from "../../src/spec-compiler/impact/index.ts";

export interface SpecRuntimeImpactGuardResult {
  hasRuntimeImpact: boolean;
  runningImpactScan: RunningImpactScanResult | null;
}

function normalizeLifecycleState(state: string): RunningLifecycleState {
  if (state === "RUNNING") {
    return "active";
  }
  if (state === "VERIFIED") {
    return "validated";
  }
  if (state === "ARCHIVED") {
    return "archived";
  }
  return "draft";
}

function normalizeSpecStatus(status: SchedulerTaskStatus): RunningSpecStatus {
  if (status === "running") {
    return "running";
  }
  if (status === "completed") {
    return "pass";
  }
  if (status === "failed") {
    return "fail";
  }
  if (status === "pending") {
    return "ready";
  }
  return "blocked";
}

function toRunningContainers(service: PlatformService): RunningContainer[] {
  return service.listContainers().map((item) => {
    const standardModel = item.container.standardModel ?? toStandardSpaceContainer(item.container, { nodes: item.nodes, slot: item.slot });
    return {
      containerId: item.container.containerId,
      lifecycleState: normalizeLifecycleState(item.container.lifecycleState),
      normExecution: {
        applicableSpecs: standardModel.normExecution.applicableSpecs.map((spec) => ({
          spuId: spec.spuId,
          status: normalizeSpecStatus(spec.status),
          latestNode: spec.latestNode,
        })),
      },
    } satisfies RunningContainer;
  });
}

function findRegistrySpecBySpuId(service: PlatformService, spuId: string): unknown | null {
  return service.getRegistry().find((item) => item.spuId === spuId) ?? null;
}

export function evaluateSpecRuntimeImpactGuard(
  service: PlatformService,
  newSpec: CompiledMarkdownSpecJSON,
  oldSpuId: string | null,
): SpecRuntimeImpactGuardResult {
  if (!oldSpuId) {
    return {
      hasRuntimeImpact: false,
      runningImpactScan: null,
    };
  }
  const oldSpec = findRegistrySpecBySpuId(service, oldSpuId);
  if (!oldSpec) {
    return {
      hasRuntimeImpact: false,
      runningImpactScan: null,
    };
  }

  const containers = toRunningContainers(service);
  const runningImpactScan = buildRunningImpactScan(oldSpuId, newSpec, containers, oldSpec);
  return {
    hasRuntimeImpact: runningImpactScan.summary.totalAffected > 0,
    runningImpactScan,
  };
}
