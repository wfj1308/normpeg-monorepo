import yaml from "js-yaml";

import { BUILTIN_SPUS } from "./builtin-spus.ts";
import type { SemanticVersion, SPUDefinition, SpecCompatibilityPolicy } from "../types.ts";
import { applyCrossDomainProfile } from "../domain/domain-adapter.ts";
import {
  compareSemanticVersion,
  deriveSpuKey,
  ensureSpuSemanticVersion,
  formatSemanticVersion,
  normalizeCompatibilityPolicy,
  parseSemanticVersion,
} from "../versioning/spu-versioning.ts";

export interface SpuVersionSelector {
  spuId?: string;
  version?: string;
  major?: number;
  minor?: number;
  patch?: number;
  latest?: boolean;
}

export interface SpuVersionRecord {
  spuKey: string;
  spuId: string;
  version: string;
  semanticVersion: SemanticVersion;
  compatibilityPolicy: SpecCompatibilityPolicy;
  isLatest: boolean;
}

export interface PublishSpuVersionOptions {
  compatibilityPolicy?: SpecCompatibilityPolicy;
  allowSameSpuIdOverwrite?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOutputs(outputs: unknown): SPUDefinition["data"]["outputs"] {
  if (!Array.isArray(outputs)) {
    return [];
  }
  return outputs.map((item) => {
    if (typeof item === "string") {
      return { name: item, label: item };
    }
    const value = item as { name?: string; label?: string; unit?: string };
    return {
      name: value.name ?? "",
      label: value.label ?? value.name ?? "",
      unit: value.unit,
    };
  });
}

function semverEquals(left: SemanticVersion, right: SemanticVersion): boolean {
  return left.major === right.major && left.minor === right.minor && left.patch === right.patch;
}

function versionSuffixFromSpuId(spuId: string): string | null {
  const index = spuId.lastIndexOf("@");
  if (index < 0 || index === spuId.length - 1) {
    return null;
  }
  return spuId.slice(index + 1);
}

export class NormRegistry {
  private readonly map = new Map<string, SPUDefinition>();

  constructor(initial?: SPUDefinition[]) {
    for (const spu of initial ?? BUILTIN_SPUS) {
      this.register(spu);
    }
  }

  register(definition: SPUDefinition): void {
    const normalized = this.normalizeDefinition(definition);
    if (!normalized.spuId.trim()) {
      throw new Error("spuId must not be empty");
    }
    this.map.set(normalized.spuId, structuredClone(normalized));
  }

  publish(definition: SPUDefinition, options: PublishSpuVersionOptions = {}): SPUDefinition {
    const normalized = this.normalizeDefinition({
      ...definition,
      meta: {
        ...definition.meta,
        compatibilityPolicy: options.compatibilityPolicy ?? definition.meta.compatibilityPolicy,
      },
    });
    if (this.map.has(normalized.spuId) && !options.allowSameSpuIdOverwrite) {
      throw new Error(`spu version already exists: ${normalized.spuId}`);
    }
    this.map.set(normalized.spuId, structuredClone(normalized));
    return structuredClone(normalized);
  }

  publishFromText(
    raw: string,
    sourceType: SPUDefinition["sourceType"] = "imported",
    options: PublishSpuVersionOptions = {},
  ): SPUDefinition {
    const parsed = this.parseDefinitionText(raw);
    const definition: SPUDefinition = {
      ...parsed,
      sourceType,
    };
    return this.publish(definition, options);
  }

  loadFromText(raw: string, sourceType: SPUDefinition["sourceType"] = "imported"): SPUDefinition {
    const parsed = this.parseDefinitionText(raw);
    const definition: SPUDefinition = {
      ...parsed,
      sourceType,
    };
    this.register(definition);
    return this.get(definition.spuId)!;
  }

  list(): SPUDefinition[] {
    return Array.from(this.map.values()).sort((a, b) => a.spuId.localeCompare(b.spuId));
  }

  get(spuId: string): SPUDefinition | null {
    return this.map.get(spuId) ? structuredClone(this.map.get(spuId)!) : null;
  }

  listBySpuKey(spuKey: string): SPUDefinition[] {
    return this.list()
      .filter((item) => deriveSpuKey(item.spuId) === spuKey)
      .sort((left, right) => compareSemanticVersion(ensureSpuSemanticVersion(left), ensureSpuSemanticVersion(right)));
  }

  getLatestBySpuKey(spuKey: string): SPUDefinition | null {
    const versions = this.listBySpuKey(spuKey);
    return versions.length > 0 ? structuredClone(versions[versions.length - 1]) : null;
  }

  resolveBySpuKey(spuKey: string, selector: SpuVersionSelector = {}): SPUDefinition | null {
    if (selector.spuId) {
      return this.get(selector.spuId);
    }
    const versions = this.listBySpuKey(spuKey);
    if (versions.length === 0) {
      return null;
    }
    if (selector.version) {
      const expected = parseSemanticVersion(selector.version);
      const exact = versions.find((item) => semverEquals(ensureSpuSemanticVersion(item), expected)) ?? null;
      return exact ? structuredClone(exact) : null;
    }
    if (
      typeof selector.major === "number" ||
      typeof selector.minor === "number" ||
      typeof selector.patch === "number"
    ) {
      const matched = versions.find((item) => {
        const semver = ensureSpuSemanticVersion(item);
        if (typeof selector.major === "number" && semver.major !== selector.major) return false;
        if (typeof selector.minor === "number" && semver.minor !== selector.minor) return false;
        if (typeof selector.patch === "number" && semver.patch !== selector.patch) return false;
        return true;
      }) ?? null;
      return matched ? structuredClone(matched) : null;
    }
    if (selector.latest === false) {
      return structuredClone(versions[0]);
    }
    return structuredClone(versions[versions.length - 1]);
  }

  listVersionRecords(spuKey?: string): SpuVersionRecord[] {
    const candidates = spuKey ? this.listBySpuKey(spuKey) : this.list();
    const latestByKey = new Map<string, string>();
    const grouped = new Map<string, SPUDefinition[]>();
    for (const item of candidates) {
      const key = deriveSpuKey(item.spuId);
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    for (const [key, list] of grouped.entries()) {
      const sorted = [...list].sort((left, right) => compareSemanticVersion(ensureSpuSemanticVersion(left), ensureSpuSemanticVersion(right)));
      latestByKey.set(key, sorted[sorted.length - 1]?.spuId ?? "");
    }

    return candidates.map((item) => {
      const key = deriveSpuKey(item.spuId);
      const semanticVersion = ensureSpuSemanticVersion(item);
      return {
        spuKey: key,
        spuId: item.spuId,
        version: formatSemanticVersion(semanticVersion),
        semanticVersion,
        compatibilityPolicy: normalizeCompatibilityPolicy(item.meta.compatibilityPolicy),
        isLatest: latestByKey.get(key) === item.spuId,
      };
    });
  }

  private parseDefinitionText(raw: string): SPUDefinition {
    const text = raw.trim();
    if (!text) {
      throw new Error("SPU definition text is empty");
    }
    let parsed: unknown;
    if (text.startsWith("{") || text.startsWith("[")) {
      parsed = JSON.parse(text);
    } else {
      parsed = yaml.load(text);
    }
    if (!isObject(parsed)) {
      throw new Error("SPU definition must be an object");
    }
    const candidate = parsed as Partial<SPUDefinition>;
    if (!candidate.spuId || !candidate.meta || !candidate.data || !candidate.path || !candidate.rules || !candidate.proof) {
      throw new Error("SPUDefinition missing required fields");
    }
    return this.normalizeDefinition(candidate as SPUDefinition);
  }

  private normalizeDefinition(input: SPUDefinition): SPUDefinition {
    const inputs = (input.data.inputs ?? []).map((field) => ({
      name: field.name,
      type: field.type ?? "number",
      label: field.label ?? field.name,
      unit: field.unit,
      required: field.required,
      range: field.range
        ? {
            min: field.range.min,
            max: field.range.max,
          }
        : undefined,
      acceptedUnits: Array.isArray(field.acceptedUnits) ? [...field.acceptedUnits] : undefined,
    }));
    const outputs = normalizeOutputs(input.data.outputs);
    const rules = (input.rules ?? []).map((rule, index) => ({
      ...rule,
      ruleId: rule.ruleId ?? `RULE-${String(index + 1).padStart(3, "0")}`,
    }));
    const semver = ensureSpuSemanticVersion(input);
    const versionInSpuId = versionSuffixFromSpuId(input.spuId);
    if (versionInSpuId) {
      const parsedFromSpuId = parseSemanticVersion(versionInSpuId);
      if (!semverEquals(semver, parsedFromSpuId)) {
        throw new Error(`spuId version mismatch with meta.version: ${input.spuId} vs ${input.meta.version}`);
      }
    }

    const normalizedDefinition: SPUDefinition = {
      ...input,
      meta: {
        ...input.meta,
        version: input.meta.version?.trim() || formatSemanticVersion(semver),
        semanticVersion: semver,
        compatibilityPolicy: normalizeCompatibilityPolicy(input.meta.compatibilityPolicy),
      },
      forms:
        input.forms && input.forms.length > 0
          ? input.forms
          : [
              {
                formCode: `${input.spuId.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}_FORM`,
                role: "operator",
                required: true,
                title: input.meta.name,
              },
            ],
      data: {
        inputs,
        outputs,
      },
      rules,
      proof: {
        ...input.proof,
        schemaVersion: input.proof.schemaVersion ?? "node-proof@v1",
      },
    };
    return applyCrossDomainProfile(normalizedDefinition);
  }
}
