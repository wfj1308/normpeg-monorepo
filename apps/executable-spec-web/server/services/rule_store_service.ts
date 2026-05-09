import { createHash } from "node:crypto";

import type { SPUDefinition } from "../../src/platform/types.ts";
import {
  compareSemanticVersion,
  normalizeCompatibilityPolicy,
  parseSemanticVersion,
} from "../../src/platform/versioning/spu-versioning.ts";

export type RuleStoreStatus = "draft" | "reviewed" | "published" | "deprecated";

export interface NormDoc {
  normdoc_id: string;
  standard_code: string;
  standard_name: string;
  name: string;
  version: string;
  status: RuleStoreStatus;
  specbundle_path?: string;
  bundle_hash: string;
  specir_path?: string;
  spec_md_path?: string;
  spec_json_path?: string;
  created_by?: string;
  published_by?: string;
  rule_count: number;
  component_count: number;
  created_at: string;
  published_at: string | null;
  signed_by: string | null;
  updated_at: string;
}

export interface RulePackage {
  package_id: string;
  normdoc_id: string;
  name: string;
  version: string;
  items_count: number;
  status: RuleStoreStatus;
  updated_at: string;
}

export interface RuleItem {
  rule_id: string;
  package_id: string;
  clause_id: string;
  clause_no: string;
  clause_ids: string[];
  normdoc_id: string;
  rule_version: string;
  clause: string;
  item_name: string;
  input_fields: string[];
  condition: string;
  severity: string;
  source_text: string;
  enabled: boolean;
}

export interface RuleVersion {
  rule_id: string;
  version: string;
  hash: string;
  created_at: string;
  created_by: string;
}

interface UpsertRuleVersionPayload {
  rule_id: string;
  version: string;
  hash: string;
  created_at?: string;
  created_by: string;
}

export interface RuleVersionSnapshot {
  spuKey: string;
  spuId: string;
  version: string;
  semanticVersion: {
    major: number;
    minor: number;
    patch: number;
  };
  compatibilityPolicy: string;
  isLatest: boolean;
  isProjectBound: boolean;
}

export interface RuleStoreBundle {
  key: string;
  normdoc: NormDoc;
  rulePackage: RulePackage;
  ruleItems: RuleItem[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeStatus(value: unknown, fallback: RuleStoreStatus = "draft"): RuleStoreStatus {
  if (value === "draft" || value === "reviewed" || value === "published" || value === "deprecated") {
    return value;
  }
  return fallback;
}

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeSeverity(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) {
    return "blocking";
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeClauseId(value: unknown): string {
  const text = normalizeText(value);
  if (!text) {
    return "";
  }
  const clauseNumber = text.match(/^第?\s*(\d+(?:\.\d+){1,4})\s*条?$/u);
  if (clauseNumber?.[1]) {
    return clauseNumber[1];
  }
  return text;
}

function splitClauseTokens(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => splitClauseTokens(item));
  }
  if (isRecord(value)) {
    return splitClauseTokens(
      value.clause_id
      ?? value.clauseId
      ?? value.clause_no
      ?? value.clauseNo
      ?? value.clause
      ?? value.id,
    );
  }
  const text = normalizeText(value);
  if (!text) {
    return [];
  }
  return text
    .split(/[,;|，、]/u)
    .map((item) => normalizeClauseId(item))
    .filter(Boolean);
}

function dedupeClauseIds(values: string[]): string[] {
  return Array.from(new Set(values.map((item) => normalizeClauseId(item)).filter(Boolean)));
}

function isPlaceholderClauseText(value: string): boolean {
  const text = normalizeText(value);
  if (!text) {
    return true;
  }
  if (/^Clause\s+\S+\s+from\s+\S+/iu.test(text)) {
    return true;
  }
  if (/对应条款/iu.test(text)) {
    return true;
  }
  return false;
}

function inferClauseIdFromRuleId(ruleId: string): string {
  const normalized = normalizeText(ruleId);
  if (!normalized) {
    return "";
  }
  const segments = normalized.split(".");
  const runs: string[][] = [];
  let currentRun: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim();
    if (/^\d+$/u.test(trimmed)) {
      currentRun.push(trimmed);
      continue;
    }
    if (currentRun.length >= 2) {
      runs.push(currentRun);
    }
    currentRun = [];
  }
  if (currentRun.length >= 2) {
    runs.push(currentRun);
  }
  for (const run of runs) {
    if (run.length < 2 || run.length > 5) {
      continue;
    }
    const first = Number(run[0] ?? "0");
    if (!Number.isFinite(first) || first <= 0 || first >= 100) {
      continue;
    }
    return run.join(".");
  }
  return "";
}

function readPrimaryClauseId(definition: SPUDefinition, ruleId: string): string {
  const direct = normalizeClauseId(definition.meta.clause);
  if (direct) {
    return direct;
  }
  const fromMetaExtensions = isRecord(definition.meta.extensions)
    ? splitClauseTokens(definition.meta.extensions.clause_id ?? definition.meta.extensions.clauseId)[0]
    : undefined;
  if (fromMetaExtensions) {
    return fromMetaExtensions;
  }
  return inferClauseIdFromRuleId(ruleId);
}

function readClauseRefsFromExtensions(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return dedupeClauseIds([
    ...splitClauseTokens(value.clause_ids),
    ...splitClauseTokens(value.clauseIds),
    ...splitClauseTokens(value.clause_refs),
    ...splitClauseTokens(value.clauseRefs),
    ...splitClauseTokens(value.clause_id),
    ...splitClauseTokens(value.clauseId),
  ]);
}

function readReferencedClauseIds(definition: SPUDefinition, ruleId: string): string[] {
  const primary = readPrimaryClauseId(definition, ruleId);
  return dedupeClauseIds([
    ...(primary ? [primary] : []),
    ...readClauseRefsFromExtensions(definition.meta.extensions),
    ...readClauseRefsFromExtensions(definition.proof.extensions),
  ]);
}

function readRuleItemClauseIds(ruleItem: RuleItem): string[] {
  return dedupeClauseIds([
    ...splitClauseTokens(ruleItem.clause_ids),
    ...splitClauseTokens(ruleItem.clause_id),
    ...splitClauseTokens(ruleItem.clause_no),
    ...splitClauseTokens(ruleItem.clause),
  ]);
}

function deriveRuleKey(ruleId: string): string {
  const normalized = String(ruleId ?? "").trim();
  const index = normalized.lastIndexOf("@");
  if (index <= 0) {
    return normalized;
  }
  return normalized.slice(0, index);
}

function buildNormDocKey(standardCode: string, version: string): string {
  return `${standardCode}@@${version}`;
}

function buildBundleHash(ruleItems: RuleItem[]): string {
  const hash = createHash("sha256");
  const normalized = [...ruleItems]
    .map((item) => `${item.rule_id}|${item.rule_version}|${item.clause_id}|${item.condition}|${item.enabled ? "1" : "0"}`)
    .sort((a, b) => a.localeCompare(b, "en"));
  hash.update(normalized.join("\n"));
  return hash.digest("hex");
}

function normalizeRuleThreshold(rule: SPUDefinition["rules"][number]): string {
  const value = rule.value ?? rule.threshold;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const thresholdRef = value as { inputRef?: unknown; outputRef?: unknown; value?: unknown };
  if (typeof thresholdRef.inputRef === "string" && thresholdRef.inputRef.trim()) {
    return `input:${thresholdRef.inputRef.trim()}`;
  }
  if (typeof thresholdRef.outputRef === "string" && thresholdRef.outputRef.trim()) {
    return `output:${thresholdRef.outputRef.trim()}`;
  }
  if (
    typeof thresholdRef.value === "number"
    || typeof thresholdRef.value === "string"
    || typeof thresholdRef.value === "boolean"
  ) {
    return String(thresholdRef.value);
  }
  return "";
}

function buildCondition(definition: SPUDefinition): string {
  return definition.rules
    .map((rule) => {
      const threshold = normalizeRuleThreshold(rule);
      return `${rule.field} ${rule.operator} ${threshold}`.trim();
    })
    .filter(Boolean)
    .join(" && ");
}

function buildSourceText(definition: SPUDefinition): string {
  const clause = normalizeText(definition.meta.clause);
  const message = definition.rules
    .map((item) => normalizeText(item.message))
    .filter(Boolean)
    .join("；");
  if (clause && message) {
    return `${clause} ${message}`.trim();
  }
  return clause || message || definition.meta.name;
}

function buildDefinitionHash(definition: SPUDefinition): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(definition));
  return hash.digest("hex");
}

function safeSemanticVersion(value: string): { major: number; minor: number; patch: number } {
  try {
    return parseSemanticVersion(value);
  } catch {
    const matched = String(value ?? "").trim().match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!matched) {
      return { major: 0, minor: 0, patch: 0 };
    }
    return {
      major: Number(matched[1] ?? "0") || 0,
      minor: Number(matched[2] ?? "0") || 0,
      patch: Number(matched[3] ?? "0") || 0,
    };
  }
}

export class RuleStoreService {
  private readonly normDocs = new Map<string, NormDoc>();
  private readonly packages = new Map<string, RulePackage>();
  private readonly packageItems = new Map<string, Map<string, RuleItem>>();
  private readonly versionsByRuleId = new Map<string, RuleVersion[]>();
  private readonly normdocKeyToId = new Map<string, string>();

  listNormDocs(options?: { statuses?: RuleStoreStatus[] }): NormDoc[] {
    const statuses = options?.statuses && options.statuses.length > 0
      ? new Set(options.statuses)
      : null;
    return Array.from(this.normDocs.values())
      .filter((item) => (statuses ? statuses.has(item.status) : true))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((item) => deepClone(item));
  }

  listBundles(options?: { statuses?: RuleStoreStatus[] }): RuleStoreBundle[] {
    const statuses = options?.statuses && options.statuses.length > 0
      ? new Set(options.statuses)
      : null;
    const bundles: RuleStoreBundle[] = [];
    for (const rulePackage of this.packages.values()) {
      const normdoc = this.normDocs.get(rulePackage.normdoc_id);
      if (!normdoc) {
        continue;
      }
      if (statuses && !statuses.has(normdoc.status)) {
        continue;
      }
      const items = Array.from((this.packageItems.get(rulePackage.package_id) ?? new Map()).values())
        .sort((a, b) => a.rule_id.localeCompare(b.rule_id, "en"));
      bundles.push({
        key: buildNormDocKey(normdoc.standard_code, normdoc.version),
        normdoc: deepClone(normdoc),
        rulePackage: deepClone(rulePackage),
        ruleItems: items.map((item) => deepClone(item)),
      });
    }
    bundles.sort(
      (a, b) =>
        a.normdoc.standard_code.localeCompare(b.normdoc.standard_code, "zh-CN")
        || a.normdoc.version.localeCompare(b.normdoc.version, "zh-CN"),
    );
    return bundles;
  }

  resolveBundle(ruleId: string, options?: { statuses?: RuleStoreStatus[] }): RuleStoreBundle | null {
    const normalized = normalizeText(ruleId);
    if (!normalized) {
      return null;
    }
    const bundles = this.listBundles(options);
    const byNormdocKey = bundles.find((bundle) => bundle.key === normalized);
    if (byNormdocKey) {
      return byNormdocKey;
    }
    const byNormdocId = bundles.find((bundle) => bundle.normdoc.normdoc_id === normalized);
    if (byNormdocId) {
      return byNormdocId;
    }
    const byPackageId = bundles.find((bundle) => bundle.rulePackage.package_id === normalized);
    if (byPackageId) {
      return byPackageId;
    }
    const byRuleId = bundles.find((bundle) => bundle.ruleItems.some((item) => item.rule_id === normalized));
    if (byRuleId) {
      return byRuleId;
    }
    const byRuleKey = bundles.find((bundle) =>
      bundle.ruleItems.some((item) => deriveRuleKey(item.rule_id) === normalized));
    return byRuleKey ?? null;
  }

  getNormDoc(normdocId: string): NormDoc | null {
    const item = this.normDocs.get(normalizeText(normdocId));
    return item ? deepClone(item) : null;
  }

  getNormDocAggregate(normdocId: string): RuleStoreBundle | null {
    const normalized = normalizeText(normdocId);
    if (!normalized) {
      return null;
    }
    const normdoc = this.normDocs.get(normalized);
    if (!normdoc) {
      return null;
    }
    const targetPackage = Array.from(this.packages.values())
      .filter((item) => item.normdoc_id === normalized)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (!targetPackage) {
      return null;
    }
    return {
      key: buildNormDocKey(normdoc.standard_code, normdoc.version),
      normdoc: deepClone(normdoc),
      rulePackage: deepClone(targetPackage),
      ruleItems: Array.from((this.packageItems.get(targetPackage.package_id) ?? new Map()).values()).map((item) => deepClone(item)),
    };
  }

  listRuleVersions(ruleId: string): RuleVersion[] {
    const normalized = normalizeText(ruleId);
    if (!normalized) {
      return [];
    }
    return (this.versionsByRuleId.get(normalized) ?? []).map((item) => deepClone(item));
  }

  listRuleVersionSnapshotsBySpuKey(spuKey: string): RuleVersionSnapshot[] {
    const normalized = normalizeText(spuKey);
    if (!normalized) {
      return [];
    }
    const snapshots: RuleVersionSnapshot[] = [];
    for (const [ruleId, versions] of this.versionsByRuleId.entries()) {
      if (deriveRuleKey(ruleId) !== normalized) {
        continue;
      }
      for (const version of versions) {
        const semanticVersion = safeSemanticVersion(version.version);
        snapshots.push({
          spuKey: normalized,
          spuId: ruleId,
          version: version.version,
          semanticVersion,
          compatibilityPolicy: normalizeCompatibilityPolicy(undefined),
          isLatest: false,
          isProjectBound: false,
        });
      }
    }
    if (snapshots.length === 0) {
      return [];
    }
    const maxVersion = [...snapshots].sort((left, right) => compareSemanticVersion(right.semanticVersion, left.semanticVersion))[0]?.semanticVersion;
    return snapshots
      .map((item) => ({
        ...item,
        isLatest: Boolean(maxVersion && compareSemanticVersion(item.semanticVersion, maxVersion) === 0),
      }))
      .sort(
        (a, b) =>
          compareSemanticVersion(b.semanticVersion, a.semanticVersion)
          || a.spuId.localeCompare(b.spuId, "en"),
      );
  }

  updateNormDocStatus(
    normdocId: string,
    payload: {
      status: RuleStoreStatus;
      signed_by?: string;
    },
  ): RuleStoreBundle {
    const normalized = normalizeText(normdocId);
    const target = this.normDocs.get(normalized);
    if (!target) {
      throw new Error(`normdoc not found: ${normdocId}`);
    }
    const status = normalizeStatus(payload.status, target.status);
    if (status === "published") {
      this.validateNormdocClauseBindings(normalized);
    }
    const at = nowIso();
    target.status = status;
    target.updated_at = at;
    if (status === "published" && !target.published_at) {
      target.published_at = at;
    }
    const signedBy = normalizeText(payload.signed_by);
    if (signedBy) {
      target.signed_by = signedBy;
      if (status === "published") {
        target.published_by = signedBy;
      }
    }
    for (const item of this.packages.values()) {
      if (item.normdoc_id === normalized) {
        item.status = status;
        item.updated_at = at;
      }
    }
    return this.getNormDocAggregate(normalized) ?? (() => { throw new Error(`normdoc not found: ${normdocId}`); })();
  }

  private collectNormdocPrimaryClauseIds(normdocId: string, incomingDefinitions: SPUDefinition[]): Set<string> {
    const collected = new Set<string>();
    for (const definition of incomingDefinitions) {
      const ruleId = normalizeText(definition.spuId);
      const clauseId = readPrimaryClauseId(definition, ruleId);
      if (clauseId) {
        collected.add(clauseId);
      }
    }
    for (const [packageId, rulePackage] of this.packages.entries()) {
      if (rulePackage.normdoc_id !== normdocId) {
        continue;
      }
      const items = this.packageItems.get(packageId);
      if (!items) {
        continue;
      }
      for (const item of items.values()) {
        const primary = normalizeClauseId(item.clause_id || item.clause_no || item.clause);
        if (primary) {
          collected.add(primary);
        }
      }
    }
    return collected;
  }

  private validateNormdocClauseBindings(normdocId: string): void {
    const knownClauseIds = this.collectNormdocPrimaryClauseIds(normdocId, []);
    for (const [packageId, rulePackage] of this.packages.entries()) {
      if (rulePackage.normdoc_id !== normdocId) {
        continue;
      }
      const items = this.packageItems.get(packageId);
      if (!items) {
        continue;
      }
      for (const item of items.values()) {
        const clauseIds = readRuleItemClauseIds(item);
        if (clauseIds.length === 0) {
          throw new Error(`rule ${item.rule_id} must bind at least one clause_id`);
        }
        if (isPlaceholderClauseText(item.source_text)) {
          throw new Error(`rule ${item.rule_id} has placeholder source_text; real clause original text is required`);
        }
        const missing = clauseIds.filter((clauseId) => !knownClauseIds.has(clauseId));
        if (missing.length > 0) {
          throw new Error(
            `rule ${item.rule_id} references missing clause_id(s): ${missing.join(", ")} in normdoc ${normdocId}`,
          );
        }
      }
    }
  }

  upsertNormDocFromSpus(payload: {
    normdoc_id?: string;
    standard_code?: string;
    name?: string;
    version?: string;
    status?: RuleStoreStatus;
    signed_by?: string;
    created_by?: string;
    published_by?: string;
    specbundle_path?: string;
    specir_path?: string;
    spec_md_path?: string;
    spec_json_path?: string;
    package_id?: string;
    package_name?: string;
    package_version?: string;
    package_status?: RuleStoreStatus;
    preserve_existing_status?: boolean;
    spuDefinitions: SPUDefinition[];
  }): RuleStoreBundle {
    const definitions = payload.spuDefinitions ?? [];
    if (definitions.length === 0) {
      throw new Error("spuDefinitions is required");
    }
    const first = definitions[0];
    if (!first) {
      throw new Error("spuDefinitions is required");
    }
    const standardCode = normalizeText(payload.standard_code, normalizeText(first.meta.norm, "未标注标准"));
    const version = normalizeText(payload.version, normalizeText(first.meta.version, "v1"));
    const key = buildNormDocKey(standardCode, version);
    const existingNormdocId = this.normdocKeyToId.get(key);
    const normdocId = normalizeText(payload.normdoc_id, existingNormdocId || key);
    const existingNormdoc = this.normDocs.get(normdocId) ?? null;
    const createdAt = existingNormdoc?.created_at ?? nowIso();
    const updatedAt = nowIso();
    const signedBy = normalizeText(payload.signed_by, existingNormdoc?.signed_by ?? "");
    const statusFromPayload = normalizeStatus(payload.status, existingNormdoc?.status ?? "draft");
    const status = payload.preserve_existing_status && existingNormdoc ? existingNormdoc.status : statusFromPayload;
    const publishedAt = status === "published"
      ? (existingNormdoc?.published_at ?? updatedAt)
      : (existingNormdoc?.published_at ?? null);
    const standardName = normalizeText(payload.name, existingNormdoc?.standard_name ?? `${standardCode} ${version}`);
    const displayName = normalizeText(payload.name, existingNormdoc?.name ?? standardName);

    const packageVersion = normalizeText(payload.package_version, version);
    const packageId = normalizeText(payload.package_id, `${normdocId}::pkg::${packageVersion}`);
    const packageStatus = normalizeStatus(payload.package_status, status);
    const oldItems = this.packageItems.get(packageId);
    const nextItems = new Map<string, RuleItem>();
    const knownPrimaryClauseIds = this.collectNormdocPrimaryClauseIds(normdocId, definitions);
    for (const definition of definitions) {
      const ruleId = normalizeText(definition.spuId);
      if (!ruleId) {
        continue;
      }
      const clauseIds = readReferencedClauseIds(definition, ruleId);
      if (clauseIds.length === 0) {
        throw new Error(`rule ${ruleId} must bind at least one clause_id`);
      }
      const primaryClauseId = readPrimaryClauseId(definition, ruleId) || clauseIds[0] || "";
      if (!primaryClauseId) {
        throw new Error(`rule ${ruleId} missing clause_id`);
      }
      if (status === "published") {
        const missingClauseIds = clauseIds.filter((clauseId) => !knownPrimaryClauseIds.has(clauseId));
        if (missingClauseIds.length > 0) {
          throw new Error(
            `rule ${ruleId} references missing clause_id(s): ${missingClauseIds.join(", ")} in normdoc ${normdocId}`,
          );
        }
      }
      const previousEnabled = oldItems?.get(ruleId)?.enabled;
      const inputFields = Array.from(
        new Set(
          definition.data.inputs
            .map((item) => normalizeText(item.name))
            .filter(Boolean),
        ),
      );
      const ruleVersion = normalizeText(definition.meta.version, version);
      nextItems.set(ruleId, {
        rule_id: ruleId,
        package_id: packageId,
        clause_id: primaryClauseId,
        clause_no: primaryClauseId,
        clause_ids: clauseIds,
        normdoc_id: normdocId,
        rule_version: ruleVersion,
        clause: primaryClauseId,
        item_name: normalizeText(definition.meta.name, ruleId),
        input_fields: inputFields,
        condition: buildCondition(definition),
        severity: normalizeSeverity(toSeverity(definition)),
        source_text: buildSourceText(definition),
        enabled: typeof previousEnabled === "boolean" ? previousEnabled : true,
      });
      const createdBy = normalizeText(payload.created_by, signedBy || "rule-store-sync");
      this.upsertRuleVersion({
        rule_id: ruleId,
        version: ruleVersion,
        hash: buildDefinitionHash(definition),
        created_by: createdBy || "rule-store-sync",
      });
    }
    this.packageItems.set(packageId, nextItems);
    const ruleItems = Array.from(nextItems.values());
    const ruleCount = ruleItems.length;
    const componentCount = new Set(ruleItems.map((item) => deriveRuleKey(item.rule_id)).filter(Boolean)).size;
    const bundleHash = buildBundleHash(ruleItems);
    const normdoc: NormDoc = {
      normdoc_id: normdocId,
      standard_code: standardCode,
      standard_name: standardName,
      name: displayName,
      version,
      status,
      specbundle_path: normalizeText(payload.specbundle_path, existingNormdoc?.specbundle_path ?? "") || undefined,
      bundle_hash: bundleHash,
      specir_path: normalizeText(payload.specir_path, existingNormdoc?.specir_path ?? "") || undefined,
      spec_md_path: normalizeText(payload.spec_md_path, existingNormdoc?.spec_md_path ?? "") || undefined,
      spec_json_path: normalizeText(payload.spec_json_path, existingNormdoc?.spec_json_path ?? "") || undefined,
      created_by: normalizeText(payload.created_by, existingNormdoc?.created_by ?? "") || undefined,
      published_by: normalizeText(payload.published_by, existingNormdoc?.published_by ?? "") || undefined,
      rule_count: ruleCount,
      component_count: componentCount,
      created_at: createdAt,
      published_at: publishedAt,
      signed_by: signedBy || null,
      updated_at: updatedAt,
    };
    this.normDocs.set(normdocId, normdoc);
    this.normdocKeyToId.set(key, normdocId);
    const rulePackage: RulePackage = {
      package_id: packageId,
      normdoc_id: normdocId,
      name: normalizeText(payload.package_name, normalizeText(payload.name, `${standardCode} ${version}`)),
      version: packageVersion,
      items_count: nextItems.size,
      status: packageStatus,
      updated_at: updatedAt,
    };
    this.packages.set(packageId, rulePackage);
    return {
      key,
      normdoc: deepClone(normdoc),
      rulePackage: deepClone(rulePackage),
      ruleItems: Array.from(nextItems.values()).map((item) => deepClone(item)),
    };
  }

  syncFromRegistry(
    definitions: SPUDefinition[],
    options?: {
      resolveStatus?: (items: SPUDefinition[]) => RuleStoreStatus;
      signed_by?: string;
    },
  ): void {
    const grouped = new Map<string, SPUDefinition[]>();
    for (const item of definitions) {
      const standardCode = normalizeText(item.meta.norm, "未标注标准");
      const version = normalizeText(item.meta.version);
      if (!version) {
        continue;
      }
      const key = buildNormDocKey(standardCode, version);
      const current = grouped.get(key) ?? [];
      current.push(item);
      grouped.set(key, current);
    }
    for (const [key, entries] of grouped.entries()) {
      const first = entries[0];
      if (!first) {
        continue;
      }
      const standardCode = normalizeText(first.meta.norm, "未标注标准");
      const version = normalizeText(first.meta.version, "v1");
      const existingNormdocId = this.normdocKeyToId.get(key);
      const existing = existingNormdocId ? this.normDocs.get(existingNormdocId) : null;
      const status = existing?.status ?? options?.resolveStatus?.(entries) ?? "draft";
      this.upsertNormDocFromSpus({
        normdoc_id: existing?.normdoc_id ?? key,
        standard_code: standardCode,
        name: `${standardCode} ${version}`,
        version,
        status,
        signed_by: existing?.signed_by ?? options?.signed_by,
        preserve_existing_status: true,
        spuDefinitions: entries,
      });
    }
  }

  private upsertRuleVersion(payload: UpsertRuleVersionPayload): void {
    const ruleId = normalizeText(payload.rule_id);
    if (!ruleId) {
      return;
    }
    const version = normalizeText(payload.version);
    if (!version) {
      return;
    }
    const hash = normalizeText(payload.hash);
    if (!hash) {
      return;
    }
    const list = this.versionsByRuleId.get(ruleId) ?? [];
    const existingIndex = list.findIndex((item) => item.version === version);
    const nextValue: RuleVersion = {
      rule_id: ruleId,
      version,
      hash,
      created_at: payload.created_at || nowIso(),
      created_by: normalizeText(payload.created_by, "rule-store-sync"),
    };
    if (existingIndex >= 0) {
      const current = list[existingIndex];
      if (current && current.hash === hash) {
        return;
      }
      list[existingIndex] = nextValue;
      this.versionsByRuleId.set(ruleId, list);
      return;
    }
    list.push(nextValue);
    list.sort((left, right) => {
      const semverDiff = compareSemanticVersion(safeSemanticVersion(right.version), safeSemanticVersion(left.version));
      if (semverDiff !== 0) {
        return semverDiff;
      }
      return right.created_at.localeCompare(left.created_at);
    });
    this.versionsByRuleId.set(ruleId, list);
  }
}

function toSeverity(definition: SPUDefinition): string {
  const extensions = definition.meta.extensions;
  if (extensions && typeof extensions === "object" && !Array.isArray(extensions)) {
    const value = (extensions as Record<string, unknown>).severity;
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "blocking";
}
