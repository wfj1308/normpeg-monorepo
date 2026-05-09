import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import type { CompiledMarkdownSpecJSON } from "../../src/spec-compiler/schemas.ts";
import { buildSpecImpactAnalysis, findComparableSpec, type SpecImpactAnalysis } from "../../src/spec-compiler/impact/index.ts";

export interface SpecUpgradeGuardResult {
  hasBaseline: boolean;
  oldSpuId: string | null;
  impactAnalysis: SpecImpactAnalysis | null;
}

export function evaluateSpecUpgradeGuard(service: PlatformService, newSpec: CompiledMarkdownSpecJSON): SpecUpgradeGuardResult {
  const registry = service.getRegistry() as unknown[];
  const oldSpec = findComparableSpec(registry, newSpec);
  if (!oldSpec) {
    return {
      hasBaseline: false,
      oldSpuId: null,
      impactAnalysis: null,
    };
  }

  const oldSpuId = typeof (oldSpec as { spuId?: unknown }).spuId === "string" ? ((oldSpec as { spuId: string }).spuId as string) : null;
  return {
    hasBaseline: true,
    oldSpuId,
    impactAnalysis: buildSpecImpactAnalysis(oldSpec, newSpec),
  };
}
