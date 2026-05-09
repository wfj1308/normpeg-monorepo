import { deriveSpuKey } from "../../src/platform/versioning/spu-versioning.ts";
import { getSpuCrossDomainProfile } from "../../src/platform/domain/domain-adapter.ts";
import type { SPUDefinition, SpuClassification } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";

export interface SpuSelectorProjectContext {
  projectId?: string | null;
  preferredCategory?: string | null;
  preferredClause?: string | null;
  preferredDomain?: string | null;
  preferredClassification?: SpuClassification | null;
}

export interface SpuSelectorContainerMetadata {
  containerId?: string | null;
  projectId?: string | null;
  boundSpuIds?: string[];
  currentSpuId?: string | null;
  nodeType?: string | null;
}

export interface SpuSelectorNodeMetadata {
  nodeId?: string | null;
  spuId?: string | null;
  nodeType?: string | null;
}

export interface SpuSelectorHints {
  spuId?: string | null;
  spuKey?: string | null;
  category?: string | null;
  clause?: string | null;
  measuredItem?: string | null;
  domain?: string | null;
  classification?: SpuClassification | null;
}

export interface SpuSelectorInput {
  intent: string;
  projectContext?: SpuSelectorProjectContext;
  containerMetadata?: SpuSelectorContainerMetadata;
  nodeMetadata?: SpuSelectorNodeMetadata;
  hints?: SpuSelectorHints;
  inputs?: Record<string, unknown>;
  limit?: number;
}

export interface SpuSelectorCandidate {
  rank: number;
  spuId: string;
  spuKey: string;
  score: number;
  matchReasons: string[];
  requiredMissingInputs: string[];
}

export interface SpuSelectorResult {
  intent: string;
  selectedSpuId: string | null;
  rankedCandidates: SpuSelectorCandidate[];
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeClause(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function normalizeClassification(value: unknown): SpuClassification | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "measurement" || normalized === "validation" || normalized === "compliance") {
    return normalized;
  }
  return null;
}

function toBoundSpuSet(service: PlatformService, params: SpuSelectorInput): Set<string> {
  const fromPayload = Array.isArray(params.containerMetadata?.boundSpuIds)
    ? params.containerMetadata?.boundSpuIds ?? []
    : [];
  const merged = new Set<string>(fromPayload.filter((item) => String(item ?? "").trim()).map((item) => String(item).trim()));
  const containerId = String(params.containerMetadata?.containerId ?? "").trim();
  if (!containerId) {
    return merged;
  }
  const container = service.getContainer(containerId);
  if (!container) {
    return merged;
  }
  for (const binding of container.specBindings) {
    merged.add(binding.spuId);
  }
  return merged;
}

function versionWeight(spuId: string): number {
  const matched = spuId.match(/@v(\d+(?:\.\d+)*)$/i);
  if (!matched?.[1]) {
    return -1;
  }
  const parts = matched[1].split(".").map((part) => Number(part));
  let weight = 0;
  for (let index = 0; index < parts.length; index += 1) {
    const value = Number.isFinite(parts[index]) ? parts[index] : 0;
    weight += value * Math.pow(1000, parts.length - index - 1);
  }
  return weight;
}

function collectMissingInputs(spu: SPUDefinition, providedInputs: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const input of spu.data.inputs) {
    const value = providedInputs[input.name];
    if (typeof value === "undefined" || value === null) {
      missing.push(input.name);
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      missing.push(input.name);
    }
  }
  return missing;
}

function resolveProjectId(params: SpuSelectorInput): string | null {
  const fromProjectContext = String(params.projectContext?.projectId ?? "").trim();
  if (fromProjectContext) {
    return fromProjectContext;
  }
  const fromContainer = String(params.containerMetadata?.projectId ?? "").trim();
  if (fromContainer) {
    return fromContainer;
  }
  return null;
}

interface ScoreResult {
  score: number;
  reasons: string[];
}

function scoreCandidate(
  service: PlatformService,
  spu: SPUDefinition,
  params: SpuSelectorInput,
  boundSpuSet: Set<string>,
): ScoreResult {
  const reasons: string[] = [];
  let score = 0;
  const profile = getSpuCrossDomainProfile(spu);
  const spuKey = deriveSpuKey(spu.spuId);
  const projectId = resolveProjectId(params);
  const hintedSpuId = String(params.hints?.spuId ?? "").trim();
  const hintedSpuKey = String(params.hints?.spuKey ?? "").trim();
  const hintedCategory = normalizeText(params.hints?.category ?? params.projectContext?.preferredCategory);
  const hintedClause = normalizeClause(params.hints?.clause ?? params.projectContext?.preferredClause);
  const hintedMeasuredItem = normalizeText(params.hints?.measuredItem);
  const hintedDomain = normalizeText(params.hints?.domain ?? params.projectContext?.preferredDomain);
  const hintedClassification = normalizeClassification(
    params.hints?.classification ?? params.projectContext?.preferredClassification,
  );

  if (hintedSpuId && hintedSpuId === spu.spuId) {
    score += 2000;
    reasons.push("hint.spuId exact match");
  }
  if (hintedSpuKey && hintedSpuKey === spuKey) {
    score += 1400;
    reasons.push("hint.spuKey exact match");
  }

  if (projectId) {
    const binding = service.getProjectSpuBinding(projectId, spuKey);
    if (binding?.activeSpuId === spu.spuId) {
      score += 1200;
      reasons.push(`project-bound active (${projectId})`);
    }
  }

  const spuDomain = normalizeText(profile.domain);
  if (hintedDomain && hintedDomain === spuDomain) {
    score += 650;
    reasons.push(`exact domain (${profile.domain})`);
  }

  if (hintedClassification && hintedClassification === profile.classification) {
    score += 540;
    reasons.push(`exact classification (${profile.classification})`);
  }

  const spuCategory = normalizeText(spu.meta.category ?? profile.domain);
  if (hintedCategory && hintedCategory === spuCategory) {
    score += 500;
    reasons.push(`exact category (${spu.meta.category ?? profile.domain})`);
  }

  const spuClause = normalizeClause(spu.meta.clause);
  if (hintedClause && hintedClause === spuClause) {
    score += 300;
    reasons.push(`exact clause (${spu.meta.clause})`);
  }

  const spuMeasured = normalizeText(spu.meta.measuredItem);
  if (hintedMeasuredItem && hintedMeasuredItem === spuMeasured) {
    score += 220;
    reasons.push(`exact measuredItem (${spu.meta.measuredItem ?? "unknown"})`);
  }

  const nodeSpuId = String(params.nodeMetadata?.spuId ?? "").trim();
  if (nodeSpuId && nodeSpuId === spu.spuId) {
    score += 420;
    reasons.push("same as node metadata spuId");
  }

  const currentSpuId = String(params.containerMetadata?.currentSpuId ?? "").trim();
  if (currentSpuId && currentSpuId === spu.spuId) {
    score += 260;
    reasons.push("same as container currentSpuId");
  }

  if (boundSpuSet.has(spu.spuId)) {
    score += 180;
    reasons.push("already bound to container");
  }

  return { score, reasons };
}

export function selectSpuCandidates(
  service: PlatformService,
  params: SpuSelectorInput,
): SpuSelectorResult {
  const intent = String(params.intent ?? "").trim() || "gate.preview";
  const providedInputs = params.inputs && typeof params.inputs === "object" ? params.inputs : {};
  const boundSpuSet = toBoundSpuSet(service, params);
  const limit = Number.isFinite(params.limit) ? Math.max(1, Number(params.limit)) : 5;

  const ranked = service
    .getRegistry()
    .map((spu) => {
      const scored = scoreCandidate(service, spu, params, boundSpuSet);
      return {
        spu,
        score: scored.score,
        reasons: scored.reasons,
        missing: collectMissingInputs(spu, providedInputs),
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      const versionDelta = versionWeight(right.spu.spuId) - versionWeight(left.spu.spuId);
      if (versionDelta !== 0) {
        return versionDelta;
      }
      return left.spu.spuId.localeCompare(right.spu.spuId, "en");
    })
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      spuId: item.spu.spuId,
      spuKey: deriveSpuKey(item.spu.spuId),
      score: item.score,
      matchReasons: item.reasons.length > 0 ? item.reasons : ["fallback by registry order"],
      requiredMissingInputs: item.missing,
    }));

  return {
    intent,
    selectedSpuId: ranked[0]?.spuId ?? null,
    rankedCandidates: ranked,
  };
}
