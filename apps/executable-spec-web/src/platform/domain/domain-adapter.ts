import type { SPUDefinition, SpuClassification } from "../types.ts";

export interface CrossDomainSpuProfile {
  adapterId: string;
  domain: string;
  classification: SpuClassification;
  industryTag: string;
  tags: string[];
}

export interface DomainAdapter {
  adapterId: string;
  priority?: number;
  supports(spu: SPUDefinition): boolean;
  classify(spu: SPUDefinition): SpuClassification;
  resolveDomain(spu: SPUDefinition): string;
  resolveIndustryTag(normSource: string, spu: SPUDefinition): string;
  resolveTags(spu: SPUDefinition): string[];
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueTags(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => normalizeTag(item)).filter(Boolean)));
}

function firstStandardToken(normSource: string): string {
  const normalized = normalizeText(normSource).toLowerCase();
  const matched = normalized.match(/[a-z]+/);
  return matched?.[0] ?? "generic";
}

function parseSpuDomain(spuId: string): string {
  const normalized = normalizeText(spuId);
  if (!normalized) {
    return "generic";
  }
  const firstSegment = normalized.split(".")[0] ?? "";
  return normalizeTag(firstSegment) || "generic";
}

function normalizeClassification(value: unknown): SpuClassification | null {
  const normalized = normalizeTag(String(value ?? ""));
  if (normalized === "measurement" || normalized === "validation" || normalized === "compliance") {
    return normalized;
  }
  return null;
}

export const GenericDomainAdapter: DomainAdapter = {
  adapterId: "generic.v1",
  // Keep generic adapter as the lowest-priority fallback.
  priority: -100,
  supports: () => true,
  classify: (spu): SpuClassification => {
    const explicit = normalizeClassification(spu.meta.classification);
    if (explicit) {
      return explicit;
    }
    const hasRules = Array.isArray(spu.rules) && spu.rules.length > 0;
    const signatureCount = Array.isArray(spu.proof?.requiredSignatures) ? spu.proof.requiredSignatures.length : 0;
    if (!hasRules) {
      return "measurement";
    }
    if (signatureCount > 0) {
      return "compliance";
    }
    return "validation";
  },
  resolveDomain: (spu): string => {
    const explicit = normalizeTag(normalizeText(spu.meta.domain));
    if (explicit) {
      return explicit;
    }
    return parseSpuDomain(spu.spuId);
  },
  resolveIndustryTag: (normSource): string => {
    const token = firstStandardToken(normSource);
    return `std.${token}`;
  },
  resolveTags: (spu): string[] => {
    const explicit = Array.isArray(spu.meta.domainTags) ? spu.meta.domainTags.map((item) => normalizeText(item)) : [];
    const legacy = [
      normalizeText(spu.meta.category),
      normalizeText(spu.meta.workItem),
      normalizeText(spu.meta.measuredItem),
    ];
    const inferred = [
      parseSpuDomain(spu.spuId),
      normalizeClassification(spu.meta.classification) ?? "",
    ];
    return uniqueTags([...explicit, ...legacy, ...inferred]);
  },
};

export class DomainAdapterRegistry {
  private readonly adapters: DomainAdapter[] = [];

  constructor(initialAdapters: DomainAdapter[] = [GenericDomainAdapter]) {
    for (const adapter of initialAdapters) {
      this.register(adapter);
    }
  }

  register(adapter: DomainAdapter): void {
    this.adapters.push(adapter);
    this.adapters.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }

  resolve(spu: SPUDefinition): DomainAdapter {
    return this.adapters.find((adapter) => adapter.supports(spu)) ?? GenericDomainAdapter;
  }

  getProfile(spu: SPUDefinition): CrossDomainSpuProfile {
    const adapter = this.resolve(spu);
    return {
      adapterId: adapter.adapterId,
      domain: adapter.resolveDomain(spu),
      classification: adapter.classify(spu),
      industryTag: adapter.resolveIndustryTag(spu.meta.norm, spu),
      tags: uniqueTags(adapter.resolveTags(spu)),
    };
  }

  applyProfile(spu: SPUDefinition): SPUDefinition {
    const profile = this.getProfile(spu);
    return {
      ...spu,
      meta: {
        ...spu.meta,
        domain: profile.domain,
        classification: profile.classification,
        domainTags: profile.tags,
      },
    };
  }
}

const defaultRegistry = new DomainAdapterRegistry();

export function registerDomainAdapter(adapter: DomainAdapter): void {
  defaultRegistry.register(adapter);
}

export function getDefaultDomainAdapterRegistry(): DomainAdapterRegistry {
  return defaultRegistry;
}

export function getSpuCrossDomainProfile(spu: SPUDefinition): CrossDomainSpuProfile {
  return defaultRegistry.getProfile(spu);
}

export function applyCrossDomainProfile(spu: SPUDefinition): SPUDefinition {
  return defaultRegistry.applyProfile(spu);
}

export function inferSpuClassification(spu: SPUDefinition): SpuClassification {
  return getSpuCrossDomainProfile(spu).classification;
}

export function inferIndustryTagFromNorm(normSource: string): string {
  return GenericDomainAdapter.resolveIndustryTag(normSource, {
    spuId: "generic.placeholder@v1",
    meta: {
      name: "placeholder",
      norm: normSource,
      clause: "0",
      version: "v1",
    },
    data: { inputs: [], outputs: [] },
    path: [],
    rules: [],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
  });
}
