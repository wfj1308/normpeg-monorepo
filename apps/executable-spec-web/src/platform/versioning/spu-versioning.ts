import type { RuleDefinition, SPUDefinition, SemanticVersion, SpecCompatibilityPolicy } from "../types.ts";

export interface ParsedSpuVersion {
  raw: string;
  semver: SemanticVersion;
}

export interface RuleChangeSummary {
  added: string[];
  removed: string[];
  changed: Array<{
    ruleId: string;
    before: {
      field: string;
      operator: string;
      threshold: unknown;
    };
    after: {
      field: string;
      operator: string;
      threshold: unknown;
    };
  }>;
}

export interface ThresholdChangeSummary {
  ruleId: string;
  before: unknown;
  after: unknown;
}

export interface SpuVersionDiffSummary {
  spuKey: string;
  fromSpuId: string;
  toSpuId: string;
  fromVersion: string;
  toVersion: string;
  addedFields: {
    inputs: string[];
    outputs: string[];
  };
  ruleChanges: RuleChangeSummary;
  thresholdChanges: ThresholdChangeSummary[];
}

function normalizeVersion(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("version is required");
  }
  return trimmed.toLowerCase().startsWith("v") ? trimmed : `v${trimmed}`;
}

export function parseSemanticVersion(rawVersion: string): SemanticVersion {
  const normalized = normalizeVersion(rawVersion);
  const matched = normalized.match(/^v(\d+)(?:\.(\d+))?(?:\.(\d+))?$/i);
  if (!matched) {
    throw new Error(`Invalid semantic version: ${rawVersion}`);
  }
  const major = Number(matched[1] ?? "0");
  const minor = Number(matched[2] ?? "0");
  const patch = Number(matched[3] ?? "0");
  if (!Number.isInteger(major) || major < 0 || !Number.isInteger(minor) || minor < 0 || !Number.isInteger(patch) || patch < 0) {
    throw new Error(`Invalid semantic version: ${rawVersion}`);
  }
  return { major, minor, patch };
}

export function formatSemanticVersion(version: SemanticVersion): string {
  return `v${version.major}.${version.minor}.${version.patch}`;
}

export function compareSemanticVersion(left: SemanticVersion, right: SemanticVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}

export function deriveSpuKey(spuId: string): string {
  const normalized = String(spuId ?? "").trim();
  const index = normalized.lastIndexOf("@");
  if (index <= 0) {
    return normalized;
  }
  return normalized.slice(0, index);
}

export function ensureSpuSemanticVersion(spu: SPUDefinition): SemanticVersion {
  if (spu.meta.semanticVersion) {
    return {
      major: spu.meta.semanticVersion.major,
      minor: spu.meta.semanticVersion.minor,
      patch: spu.meta.semanticVersion.patch,
    };
  }
  return parseSemanticVersion(spu.meta.version);
}

function normalizeRuleThreshold(rule: RuleDefinition): unknown {
  return rule.threshold ?? rule.value ?? null;
}

function ruleIdentity(rule: RuleDefinition, index: number): string {
  return (rule.ruleId && rule.ruleId.trim()) || `rule_${index}_${rule.field}_${rule.operator}`;
}

function ruleMap(rules: RuleDefinition[]): Map<string, RuleDefinition> {
  const map = new Map<string, RuleDefinition>();
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    map.set(ruleIdentity(rule, index), rule);
  }
  return map;
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en"));
}

export function summarizeSpuVersionDiff(previous: SPUDefinition, next: SPUDefinition): SpuVersionDiffSummary {
  const previousInputSet = new Set(previous.data.inputs.map((item) => item.name));
  const previousOutputSet = new Set(previous.data.outputs.map((item) => item.name));
  const addedInputs = next.data.inputs.map((item) => item.name).filter((item) => !previousInputSet.has(item));
  const addedOutputs = next.data.outputs.map((item) => item.name).filter((item) => !previousOutputSet.has(item));

  const leftRuleMap = ruleMap(previous.rules);
  const rightRuleMap = ruleMap(next.rules);
  const leftRuleIds = Array.from(leftRuleMap.keys());
  const rightRuleIds = Array.from(rightRuleMap.keys());
  const addedRules = rightRuleIds.filter((ruleId) => !leftRuleMap.has(ruleId));
  const removedRules = leftRuleIds.filter((ruleId) => !rightRuleMap.has(ruleId));

  const changedRules: RuleChangeSummary["changed"] = [];
  const thresholdChanges: ThresholdChangeSummary[] = [];
  for (const ruleId of rightRuleIds) {
    const before = leftRuleMap.get(ruleId);
    const after = rightRuleMap.get(ruleId);
    if (!before || !after) {
      continue;
    }
    const beforeThreshold = normalizeRuleThreshold(before);
    const afterThreshold = normalizeRuleThreshold(after);
    if (
      before.field !== after.field ||
      before.operator !== after.operator ||
      JSON.stringify(beforeThreshold) !== JSON.stringify(afterThreshold)
    ) {
      changedRules.push({
        ruleId,
        before: {
          field: before.field,
          operator: before.operator,
          threshold: beforeThreshold,
        },
        after: {
          field: after.field,
          operator: after.operator,
          threshold: afterThreshold,
        },
      });
    }
    if (JSON.stringify(beforeThreshold) !== JSON.stringify(afterThreshold)) {
      thresholdChanges.push({
        ruleId,
        before: beforeThreshold,
        after: afterThreshold,
      });
    }
  }

  return {
    spuKey: deriveSpuKey(next.spuId),
    fromSpuId: previous.spuId,
    toSpuId: next.spuId,
    fromVersion: previous.meta.version,
    toVersion: next.meta.version,
    addedFields: {
      inputs: uniqueSorted(addedInputs),
      outputs: uniqueSorted(addedOutputs),
    },
    ruleChanges: {
      added: uniqueSorted(addedRules),
      removed: uniqueSorted(removedRules),
      changed: changedRules.sort((a, b) => a.ruleId.localeCompare(b.ruleId, "en")),
    },
    thresholdChanges: thresholdChanges.sort((a, b) => a.ruleId.localeCompare(b.ruleId, "en")),
  };
}

export function normalizeCompatibilityPolicy(policy: SpecCompatibilityPolicy | undefined): SpecCompatibilityPolicy {
  return policy ?? "minor_backward_compatible";
}
