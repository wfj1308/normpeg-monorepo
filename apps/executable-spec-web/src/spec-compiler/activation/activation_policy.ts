import { deriveSpuKey } from "./spu_key.ts";
import { findLatestSpuVersion } from "./version_resolver.ts";

export type ActivationMode = "manual" | "new_containers_only" | "future_tasks_only";

export interface SpuActivationPolicy {
  policyId: string;
  spuKey: string;
  activeSpuId: string;
  previousSpuId?: string | null;
  activationMode: ActivationMode;
  effectiveAt: string;
  note?: string;
}

interface RegistrySpu {
  spuId: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildPolicyId(): string {
  return `policy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createActivationPolicy(
  oldSpuId: string | null | undefined,
  newSpuId: string,
  mode: ActivationMode = "new_containers_only",
): SpuActivationPolicy {
  const spuKey = deriveSpuKey(newSpuId);
  return {
    policyId: buildPolicyId(),
    spuKey,
    activeSpuId: mode === "manual" && oldSpuId ? oldSpuId : newSpuId,
    previousSpuId: oldSpuId ?? null,
    activationMode: mode,
    effectiveAt: nowIso(),
    note:
      mode === "manual"
        ? "新版已注册，保持人工切换。"
        : mode === "future_tasks_only"
          ? "新版用于未开始任务候选，运行中与已完成容器保持旧版。"
          : "新版仅对新建容器默认生效，已有容器保持旧版。",
  };
}

export function resolveActiveSpuForNewContainer(
  spuKey: string,
  policies: SpuActivationPolicy[],
  registry: RegistrySpu[],
): string | null {
  const latestPolicy = [...policies]
    .filter((item) => item.spuKey === spuKey)
    .sort((left, right) => right.effectiveAt.localeCompare(left.effectiveAt))[0];
  if (latestPolicy) {
    return latestPolicy.activeSpuId;
  }
  return findLatestSpuVersion(registry, spuKey)?.spuId ?? null;
}
