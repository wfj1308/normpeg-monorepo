import { toStandardSpaceContainer } from "../../src/platform/spatial/space-container-standard.ts";
import type { SchedulerTaskStatus } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import {
  createActivationPolicy,
  deriveSpuKey,
  resolveActiveSpuForNewContainer,
  resolveApplicableSpuForExistingContainer,
  type ActivationDecision,
  type ActivationMode,
  type SpuActivationPolicy,
} from "../../src/spec-compiler/activation/index.ts";
import type { CompiledMarkdownSpecJSON } from "../../src/spec-compiler/schemas.ts";
import type { RunningContainer, RunningLifecycleState, RunningSpecStatus } from "../../src/spec-compiler/impact/index.ts";

export interface SpuActivationPolicyResult {
  policy: SpuActivationPolicy;
  defaultActiveSpuId: string;
  activationMode: ActivationMode;
  affectedScope: {
    newContainers: string;
    existingRunning: string;
    existingCompleted: string;
    existingNotStarted: string;
  };
  decisions: ActivationDecision[];
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

function defaultAffectedScope(mode: ActivationMode): SpuActivationPolicyResult["affectedScope"] {
  if (mode === "manual") {
    return {
      newContainers: "注册了新版，但不自动生效；新建 Container 保持当前激活版本。",
      existingRunning: "运行中 Container 保持旧版。",
      existingCompleted: "已完成 Container 保持旧版记录。",
      existingNotStarted: "未开始任务仅提示，不自动切换。",
    };
  }
  if (mode === "future_tasks_only") {
    return {
      newContainers: "新建 Container 默认使用新版。",
      existingRunning: "运行中 Container 保持旧版。",
      existingCompleted: "已完成 Container 保持旧版记录。",
      existingNotStarted: "未开始任务可标记为升级候选（不自动迁移）。",
    };
  }
  return {
    newContainers: "新版仅对新建 Container 默认生效。",
    existingRunning: "运行中 Container 保持旧版。",
    existingCompleted: "已完成 Container 保持旧版记录。",
    existingNotStarted: "未开始任务保持当前绑定，不自动切换。",
  };
}

export function buildActivationPolicyOnRegister(
  service: PlatformService,
  newSpec: CompiledMarkdownSpecJSON,
  oldSpuId: string | null,
  mode: ActivationMode = "new_containers_only",
): SpuActivationPolicyResult {
  const registry = service.getRegistry();
  const spuKey = deriveSpuKey(newSpec.spuId);
  const policy = createActivationPolicy(oldSpuId, newSpec.spuId, mode);
  const defaultActiveSpuId = resolveActiveSpuForNewContainer(spuKey, [policy], registry) ?? policy.activeSpuId;
  const runningContainers = toRunningContainers(service);
  const decisions = runningContainers
    .filter((container) => container.normExecution.applicableSpecs.some((spec) => deriveSpuKey(spec.spuId) === spuKey))
    .map((container) => resolveApplicableSpuForExistingContainer(container, spuKey, [policy], registry));

  return {
    policy,
    defaultActiveSpuId,
    activationMode: policy.activationMode,
    affectedScope: defaultAffectedScope(mode),
    decisions,
  };
}
