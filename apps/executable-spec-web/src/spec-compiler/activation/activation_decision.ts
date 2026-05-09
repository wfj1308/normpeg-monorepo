import type { RunningContainer } from "../impact/running_container_scanner.ts";
import { deriveSpuKey } from "./spu_key.ts";
import type { SpuActivationPolicy } from "./activation_policy.ts";
import { resolveActiveSpuForNewContainer } from "./activation_policy.ts";

export interface ActivationDecision {
  containerId?: string;
  spuKey: string;
  currentSpuId?: string | null;
  recommendedSpuId: string;
  shouldSwitch: boolean;
  reason: string;
}

interface RegistrySpu {
  spuId: string;
}

function findCurrentSpuForKey(container: RunningContainer, spuKey: string): string | null {
  const matched = container.normExecution.applicableSpecs.find((item) => deriveSpuKey(item.spuId) === spuKey);
  return matched?.spuId ?? null;
}

export function resolveApplicableSpuForExistingContainer(
  container: RunningContainer,
  spuKey: string,
  policies: SpuActivationPolicy[],
  registry: RegistrySpu[],
): ActivationDecision {
  const currentSpuId = findCurrentSpuForKey(container, spuKey);
  const recommendedSpuId = resolveActiveSpuForNewContainer(spuKey, policies, registry) ?? currentSpuId ?? "";
  const policy = [...policies]
    .filter((item) => item.spuKey === spuKey)
    .sort((left, right) => right.effectiveAt.localeCompare(left.effectiveAt))[0];
  const mode = policy?.activationMode ?? "new_containers_only";
  const currentSpec = container.normExecution.applicableSpecs.find((item) => deriveSpuKey(item.spuId) === spuKey);
  const specStatus = currentSpec?.status ?? "blocked";

  if (!currentSpuId) {
    return {
      containerId: container.containerId,
      spuKey,
      currentSpuId: null,
      recommendedSpuId,
      shouldSwitch: false,
      reason: "该容器尚未绑定该规范，可按当前激活版本绑定。",
    };
  }

  if (specStatus === "running") {
    return {
      containerId: container.containerId,
      spuKey,
      currentSpuId,
      recommendedSpuId: currentSpuId,
      shouldSwitch: false,
      reason: "该容器规范正在运行，必须继续旧版，不可自动切换。",
    };
  }

  if (specStatus === "pass") {
    return {
      containerId: container.containerId,
      spuKey,
      currentSpuId,
      recommendedSpuId: currentSpuId,
      shouldSwitch: false,
      reason: "该容器已按旧版完成，保留旧版记录，不自动替换。",
    };
  }

  if (mode === "future_tasks_only" && (specStatus === "ready" || specStatus === "blocked") && currentSpuId !== recommendedSpuId) {
    return {
      containerId: container.containerId,
      spuKey,
      currentSpuId,
      recommendedSpuId,
      shouldSwitch: true,
      reason: "该容器任务尚未开始，可作为升级候选（仅建议，不自动切换）。",
    };
  }

  if (mode === "manual") {
    return {
      containerId: container.containerId,
      spuKey,
      currentSpuId,
      recommendedSpuId,
      shouldSwitch: false,
      reason: "当前策略为 manual，保持人工切换。",
    };
  }

  return {
    containerId: container.containerId,
    spuKey,
    currentSpuId,
    recommendedSpuId,
    shouldSwitch: false,
    reason: "该容器已绑定旧版规范，且当前策略为仅对新建容器生效。",
  };
}
