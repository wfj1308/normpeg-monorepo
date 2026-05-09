import { AsyncLocalStorage } from "node:async_hooks";

import { deriveSpuKey } from "../../src/spec-compiler/activation/spu_key.ts";
import { findLatestSpuVersion } from "../../src/spec-compiler/activation/version_resolver.ts";
import { getSpuCrossDomainProfile } from "../../src/platform/domain/domain-adapter.ts";
import type { SPUDefinition, SpuClassification } from "../../src/platform/types.ts";

export type CatalogItemType = "spu" | "spec" | "template" | "specbundle";
export type CatalogItemVisibility = "internal" | "public";
export type CatalogItemStatus = "draft" | "published" | "deprecated";
export type CatalogScope = "internal" | "public" | "all";
export type MarketplaceAccessScope = "public" | "enterprise_private";

export interface MarketplaceCompatibility {
  runtimeVersionRange: string | null;
  compatibleAssetVersions: string[];
  notes: string | null;
  updatedAt: string | null;
}

export interface MarketplaceRatingSummary {
  averageScore: number;
  totalRatings: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
  lastRatedAt: string | null;
}

export interface MarketplaceUsageSummary {
  downloadCount: number;
  referenceCount: number;
  lastDownloadedAt: string | null;
  lastReferencedAt: string | null;
}

export interface MarketplaceItemMetadata {
  listingStatus: CatalogItemStatus;
  accessScope: MarketplaceAccessScope;
  publishedAt: string | null;
  publishedBy: string | null;
  rating: MarketplaceRatingSummary;
  usage: MarketplaceUsageSummary;
  compatibility: MarketplaceCompatibility;
}

export interface CatalogItem {
  itemId: string;
  type: CatalogItemType;
  title: string;
  normSource: string;
  version: string;
  owner: string;
  visibility: CatalogItemVisibility;
  tags: string[];
  dependencies: string[];
  status: CatalogItemStatus;
  refSpuId: string | null;
  sourceType: string | null;
  marketplace: MarketplaceItemMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogBrowseOptions {
  scope?: CatalogScope;
  types?: CatalogItemType[];
  statuses?: CatalogItemStatus[];
  owner?: string;
  tags?: string[];
  includeDeprecated?: boolean;
  limit?: number;
}

export interface CatalogSearchOptions extends CatalogBrowseOptions {
  query: string;
}

export interface CatalogImportInput {
  itemId?: string;
  type: CatalogItemType;
  title: string;
  normSource: string;
  version: string;
  owner?: string;
  visibility?: CatalogItemVisibility;
  tags?: string[];
  dependencies?: string[];
  status?: CatalogItemStatus;
  refSpuId?: string | null;
  sourceType?: string | null;
}

export interface CatalogPublishOptions {
  owner?: string;
  visibility?: CatalogItemVisibility;
  tags?: string[];
  runtimeVersionRange?: string;
  compatibleAssetVersions?: string[];
  compatibilityNotes?: string;
}

export interface MarketplaceRateInput {
  reviewerId?: string;
  score: number;
  comment?: string;
}

export interface MarketplaceReferenceInput {
  referenceId?: string;
  referenceType?: string;
  note?: string;
}

export interface MarketplaceCompatibilityInput {
  runtimeVersionRange?: string;
  compatibleAssetVersions?: string[];
  notes?: string;
}

export interface ComponentCatalogSummary {
  catalogId: string;
  catalogName: string;
  norm: string;
  industryTag: string;
  componentCount: number;
  spuKeyCount: number;
  latestVersionCount: number;
  categories: string[];
}

export interface ComponentCatalogComponent {
  itemId: string;
  spuId: string;
  spuKey: string;
  version: string;
  clause: string;
  name: string;
  category: string;
  classification: SpuClassification;
  sourceType: string;
  inputCount: number;
  outputCount: number;
  gateRuleCount: number;
  isLatest: boolean;
  owner: string;
  visibility: CatalogItemVisibility;
  status: CatalogItemStatus;
  tags: string[];
  dependencies: string[];
  marketplace: MarketplaceItemMetadata;
}

export interface ComponentCatalogDetail extends ComponentCatalogSummary {
  versions: string[];
  description: string;
}

export interface ComponentMarketplaceListing {
  listingId: string;
  catalogId: string;
  catalogName: string;
  norm: string;
  industryTag: string;
  componentCount: number;
  latestVersionCount: number;
  averageRating: number;
  totalRatings: number;
  downloadCount: number;
  referenceCount: number;
  description: string;
}

interface MarketplaceRatingRecord {
  reviewerId: string;
  score: number;
  comment: string | null;
  ratedAt: string;
}

interface CatalogNamespaceState {
  itemStore: Map<string, CatalogItem>;
  ratingStore: Map<string, Map<string, MarketplaceRatingRecord>>;
}

const DEFAULT_OWNER = "platform.system";
const DEFAULT_NAMESPACE = "default";
const catalogNamespaceStorage = new AsyncLocalStorage<string>();
const catalogStateByNamespace = new Map<string, CatalogNamespaceState>();

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeCatalogId(norm: string): string {
  const normalized = norm.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized ? `catalog_${normalized}` : "catalog_unknown";
}

function normalizeItemId(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9._:@/-]+/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      deduped.add(normalized);
    }
  }
  return Array.from(deduped.values());
}

function normalizeNamespace(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return normalized || DEFAULT_NAMESPACE;
}

function currentNamespace(): string {
  return normalizeNamespace(catalogNamespaceStorage.getStore() ?? DEFAULT_NAMESPACE);
}

function getNamespaceState(namespace = currentNamespace()): CatalogNamespaceState {
  const normalizedNamespace = normalizeNamespace(namespace);
  const existing = catalogStateByNamespace.get(normalizedNamespace);
  if (existing) {
    return existing;
  }
  const created: CatalogNamespaceState = {
    itemStore: new Map<string, CatalogItem>(),
    ratingStore: new Map<string, Map<string, MarketplaceRatingRecord>>(),
  };
  catalogStateByNamespace.set(normalizedNamespace, created);
  return created;
}

function cloneMarketplaceMetadata(value: MarketplaceItemMetadata): MarketplaceItemMetadata {
  return {
    listingStatus: value.listingStatus,
    accessScope: value.accessScope,
    publishedAt: value.publishedAt,
    publishedBy: value.publishedBy,
    rating: {
      averageScore: value.rating.averageScore,
      totalRatings: value.rating.totalRatings,
      distribution: { ...value.rating.distribution },
      lastRatedAt: value.rating.lastRatedAt,
    },
    usage: {
      downloadCount: value.usage.downloadCount,
      referenceCount: value.usage.referenceCount,
      lastDownloadedAt: value.usage.lastDownloadedAt,
      lastReferencedAt: value.usage.lastReferencedAt,
    },
    compatibility: {
      runtimeVersionRange: value.compatibility.runtimeVersionRange,
      compatibleAssetVersions: [...value.compatibility.compatibleAssetVersions],
      notes: value.compatibility.notes,
      updatedAt: value.compatibility.updatedAt,
    },
  };
}

function cloneCatalogItem(value: CatalogItem): CatalogItem {
  return {
    ...value,
    tags: [...value.tags],
    dependencies: [...value.dependencies],
    marketplace: cloneMarketplaceMetadata(value.marketplace),
  };
}

function defaultVisibilityForSourceType(sourceType: SPUDefinition["sourceType"]): CatalogItemVisibility {
  return sourceType === "builtin" ? "public" : "internal";
}

function defaultStatusForSourceType(sourceType: SPUDefinition["sourceType"]): CatalogItemStatus {
  return sourceType === "imported" ? "draft" : "published";
}

function defaultOwnerForSourceType(sourceType: SPUDefinition["sourceType"]): string {
  if (sourceType === "builtin") {
    return "platform.builtin";
  }
  if (sourceType === "compiled") {
    return "platform.compiler";
  }
  return DEFAULT_OWNER;
}

function catalogItemIdFromRaw(type: CatalogItemType, title: string, version: string): string {
  const slugBase = normalizeItemId(`${type}:${title}@${version}`);
  return slugBase || `${type}:unknown@v1`;
}

export function catalogItemIdFromSpuId(spuId: string): string {
  return `spu:${spuId}`;
}

function buildDerivedSpuTags(spu: SPUDefinition): string[] {
  const profile = getSpuCrossDomainProfile(spu);
  return normalizeStringList([
    spu.meta.norm,
    spu.meta.category,
    spu.meta.clause,
    spu.meta.measuredItem,
    ...profile.tags,
    profile.classification,
    profile.domain,
    profile.industryTag,
    deriveSpuKey(spu.spuId),
  ]);
}

function buildDefaultMarketplaceMetadata(
  visibility: CatalogItemVisibility,
  status: CatalogItemStatus,
  timestamp: string,
): MarketplaceItemMetadata {
  return {
    listingStatus: status,
    accessScope: visibility === "public" ? "public" : "enterprise_private",
    publishedAt: status === "published" ? timestamp : null,
    publishedBy: null,
    rating: {
      averageScore: 0,
      totalRatings: 0,
      distribution: {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
      },
      lastRatedAt: null,
    },
    usage: {
      downloadCount: 0,
      referenceCount: 0,
      lastDownloadedAt: null,
      lastReferencedAt: null,
    },
    compatibility: {
      runtimeVersionRange: null,
      compatibleAssetVersions: [],
      notes: null,
      updatedAt: null,
    },
  };
}

function normalizeMarketplaceMetadata(
  existing: MarketplaceItemMetadata | undefined,
  fallbackVisibility: CatalogItemVisibility,
  fallbackStatus: CatalogItemStatus,
): MarketplaceItemMetadata {
  const timestamp = nowIso();
  const base = existing ? cloneMarketplaceMetadata(existing) : buildDefaultMarketplaceMetadata(fallbackVisibility, fallbackStatus, timestamp);
  base.listingStatus = fallbackStatus;
  base.accessScope = fallbackVisibility === "public" ? "public" : "enterprise_private";
  if (fallbackStatus !== "published") {
    base.publishedAt = null;
  } else if (!base.publishedAt) {
    base.publishedAt = timestamp;
  }
  return base;
}

function createCatalogItemFromSpu(spu: SPUDefinition): CatalogItem {
  const timestamp = nowIso();
  const visibility = defaultVisibilityForSourceType(spu.sourceType);
  const status = defaultStatusForSourceType(spu.sourceType);
  return {
    itemId: catalogItemIdFromSpuId(spu.spuId),
    type: "spu",
    title: normalizeText(spu.meta.name, spu.spuId),
    normSource: normalizeText(spu.meta.norm, "UNKNOWN"),
    version: normalizeText(spu.meta.version, "unknown"),
    owner: defaultOwnerForSourceType(spu.sourceType),
    visibility,
    tags: buildDerivedSpuTags(spu),
    dependencies: [],
    status,
    refSpuId: spu.spuId,
    sourceType: spu.sourceType ?? null,
    marketplace: buildDefaultMarketplaceMetadata(visibility, status, timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function hasItemCoreChanged(existing: CatalogItem, next: CatalogItem): boolean {
  return JSON.stringify({
    itemId: existing.itemId,
    type: existing.type,
    title: existing.title,
    normSource: existing.normSource,
    version: existing.version,
    owner: existing.owner,
    visibility: existing.visibility,
    tags: existing.tags,
    dependencies: existing.dependencies,
    status: existing.status,
    refSpuId: existing.refSpuId,
    sourceType: existing.sourceType,
    marketplace: {
      listingStatus: existing.marketplace.listingStatus,
      accessScope: existing.marketplace.accessScope,
      publishedAt: existing.marketplace.publishedAt,
      publishedBy: existing.marketplace.publishedBy,
      compatibility: existing.marketplace.compatibility,
    },
  }) !== JSON.stringify({
    itemId: next.itemId,
    type: next.type,
    title: next.title,
    normSource: next.normSource,
    version: next.version,
    owner: next.owner,
    visibility: next.visibility,
    tags: next.tags,
    dependencies: next.dependencies,
    status: next.status,
    refSpuId: next.refSpuId,
    sourceType: next.sourceType,
    marketplace: {
      listingStatus: next.marketplace.listingStatus,
      accessScope: next.marketplace.accessScope,
      publishedAt: next.marketplace.publishedAt,
      publishedBy: next.marketplace.publishedBy,
      compatibility: next.marketplace.compatibility,
    },
  });
}

function ensureCatalogItemsFromRegistry(registry: SPUDefinition[]): void {
  const state = getNamespaceState();
  const itemStore = state.itemStore;
  const registryItemIds = new Set<string>();
  for (const spu of registry) {
    const itemId = catalogItemIdFromSpuId(spu.spuId);
    registryItemIds.add(itemId);
    const derived = createCatalogItemFromSpu(spu);
    const existing = itemStore.get(itemId);
    if (!existing) {
      itemStore.set(itemId, derived);
      continue;
    }
    const merged: CatalogItem = {
      ...derived,
      owner: existing.owner,
      visibility: existing.visibility,
      tags: normalizeStringList([...existing.tags, ...derived.tags]),
      dependencies: existing.dependencies,
      status: existing.status,
      marketplace: normalizeMarketplaceMetadata(existing.marketplace, existing.visibility, existing.status),
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
    if (hasItemCoreChanged(existing, merged)) {
      merged.updatedAt = nowIso();
    }
    itemStore.set(itemId, merged);
  }

  for (const [itemId, item] of itemStore.entries()) {
    if (item.type === "spu" && !registryItemIds.has(itemId)) {
      itemStore.delete(itemId);
      state.ratingStore.delete(itemId);
    }
  }
}

function normalizeScope(value: string | undefined): CatalogScope {
  if (value === "internal" || value === "public" || value === "all") {
    return value;
  }
  return "all";
}

function normalizeVisibility(value: string | undefined, fallback: CatalogItemVisibility): CatalogItemVisibility {
  if (value === "internal" || value === "public") {
    return value;
  }
  return fallback;
}

function normalizeStatus(value: string | undefined, fallback: CatalogItemStatus): CatalogItemStatus {
  if (value === "draft" || value === "published" || value === "deprecated") {
    return value;
  }
  return fallback;
}

function normalizeScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(5, Math.max(1, Math.round(value)));
}

function filterByOptions(items: CatalogItem[], options: CatalogBrowseOptions = {}): CatalogItem[] {
  const scope = normalizeScope(options.scope);
  const typeSet = options.types ? new Set(options.types) : null;
  const statusSet = options.statuses ? new Set(options.statuses) : null;
  const owner = normalizeText(options.owner);
  const requiredTags = normalizeStringList(options.tags);
  const includeDeprecated = options.includeDeprecated ?? false;

  return items.filter((item) => {
    if (scope === "internal" && item.visibility !== "internal") {
      return false;
    }
    if (scope === "public" && item.visibility !== "public") {
      return false;
    }
    if (typeSet && !typeSet.has(item.type)) {
      return false;
    }
    if (statusSet && !statusSet.has(item.status)) {
      return false;
    }
    if (!statusSet) {
      if (scope === "public" && item.status !== "published") {
        return false;
      }
      if (!includeDeprecated && item.status === "deprecated") {
        return false;
      }
    }
    if (owner && item.owner !== owner) {
      return false;
    }
    if (requiredTags.length > 0 && !requiredTags.every((tag) => item.tags.includes(tag))) {
      return false;
    }
    return true;
  });
}

function scoreForQuery(item: CatalogItem, query: string): number {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }
  let score = 0;
  const title = item.title.toLowerCase();
  const itemId = item.itemId.toLowerCase();
  const normSource = item.normSource.toLowerCase();
  const owner = item.owner.toLowerCase();
  if (title.includes(normalizedQuery)) {
    score += title === normalizedQuery ? 100 : 30;
  }
  if (itemId.includes(normalizedQuery)) {
    score += itemId === normalizedQuery ? 80 : 24;
  }
  if (normSource.includes(normalizedQuery)) {
    score += 14;
  }
  if (owner.includes(normalizedQuery)) {
    score += 8;
  }
  if (item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))) {
    score += 10;
  }
  if (item.dependencies.some((dependency) => dependency.toLowerCase().includes(normalizedQuery))) {
    score += 6;
  }
  if (item.marketplace.compatibility.notes?.toLowerCase().includes(normalizedQuery)) {
    score += 5;
  }
  return score;
}

function sortCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt.localeCompare(left.updatedAt, "en");
    }
    return left.itemId.localeCompare(right.itemId, "en");
  });
}

function getCatalogItemOrThrow(itemId: string): CatalogItem {
  const normalizedItemId = normalizeText(itemId);
  const item = getNamespaceState().itemStore.get(normalizedItemId);
  if (!item) {
    throw new Error(`catalog item not found: ${normalizedItemId}`);
  }
  return item;
}

function mapCatalogItemsToSpu(
  registry: SPUDefinition[],
  items: CatalogItem[],
): Array<{ item: CatalogItem; spu: SPUDefinition }> {
  const registryBySpuId = new Map(registry.map((spu) => [spu.spuId, spu]));
  return items
    .filter((item) => item.type === "spu" && item.refSpuId)
    .map((item) => {
      const spu = registryBySpuId.get(item.refSpuId ?? "");
      return spu ? { item, spu } : null;
    })
    .filter((entry): entry is { item: CatalogItem; spu: SPUDefinition } => Boolean(entry));
}

function summarizeCatalog(
  norm: string,
  records: Array<{ item: CatalogItem; spu: SPUDefinition }>,
): ComponentCatalogSummary {
  const spuKeys = new Set<string>(records.map((record) => deriveSpuKey(record.spu.spuId)));
  const latestItems = Array.from(spuKeys)
    .map((spuKey) => findLatestSpuVersion(records.map((record) => record.spu), spuKey))
    .filter((item): item is SPUDefinition => Boolean(item));
  const categories = Array.from(
    new Set(records.map((record) => {
      const explicit = normalizeText(record.spu.meta.category);
      if (explicit) {
        return explicit;
      }
      return getSpuCrossDomainProfile(record.spu).domain;
    })),
  ).sort((a, b) => a.localeCompare(b, "en"));
  const industryTag =
    records.length > 0
      ? getSpuCrossDomainProfile(records[0]!.spu).industryTag
      : `std.${normalizeText(norm, "generic").toLowerCase().split(/[^a-z0-9]+/)[0] || "generic"}`;

  return {
    catalogId: normalizeCatalogId(norm),
    catalogName: `${norm || "UNKNOWN"} Component Catalog`,
    norm,
    industryTag,
    componentCount: records.length,
    spuKeyCount: spuKeys.size,
    latestVersionCount: latestItems.length,
    categories,
  };
}

function getCatalogMapFromAssets(
  registry: SPUDefinition[],
  options: CatalogBrowseOptions,
): Map<string, Array<{ item: CatalogItem; spu: SPUDefinition }>> {
  const map = new Map<string, Array<{ item: CatalogItem; spu: SPUDefinition }>>();
  const catalogItems = browseCatalogItems(registry, {
    ...options,
    types: ["spu"],
  });
  const records = mapCatalogItemsToSpu(registry, catalogItems);
  for (const record of records) {
    const norm = record.spu.meta.norm?.trim() || "UNKNOWN";
    const list = map.get(norm) ?? [];
    list.push(record);
    map.set(norm, list);
  }
  return map;
}

function syncRatingSummary(itemId: string): void {
  const state = getNamespaceState();
  const item = state.itemStore.get(itemId);
  if (!item) {
    return;
  }
  const records = Array.from((state.ratingStore.get(itemId) ?? new Map()).values());
  if (records.length === 0) {
    item.marketplace.rating = {
      averageScore: 0,
      totalRatings: 0,
      distribution: {
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
      },
      lastRatedAt: null,
    };
    return;
  }
  const distribution = {
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
  };
  let sum = 0;
  let lastRatedAt = records[0]!.ratedAt;
  for (const record of records) {
    sum += record.score;
    distribution[String(record.score) as "1" | "2" | "3" | "4" | "5"] += 1;
    if (record.ratedAt.localeCompare(lastRatedAt, "en") > 0) {
      lastRatedAt = record.ratedAt;
    }
  }
  item.marketplace.rating = {
    averageScore: Number((sum / records.length).toFixed(2)),
    totalRatings: records.length,
    distribution,
    lastRatedAt,
  };
}

function persistCatalogItem(next: CatalogItem): CatalogItem {
  const state = getNamespaceState();
  state.itemStore.set(next.itemId, next);
  return cloneCatalogItem(next);
}

export function enterCatalogNamespace(namespace: string): void {
  catalogNamespaceStorage.enterWith(normalizeNamespace(namespace));
}

export function runWithCatalogNamespace<T>(namespace: string, callback: () => T): T {
  return catalogNamespaceStorage.run(normalizeNamespace(namespace), callback);
}

export function browseCatalogItems(registry: SPUDefinition[], options: CatalogBrowseOptions = {}): CatalogItem[] {
  ensureCatalogItemsFromRegistry(registry);
  const filtered = filterByOptions(Array.from(getNamespaceState().itemStore.values()), options);
  const sorted = sortCatalogItems(filtered).map((item) => cloneCatalogItem(item));
  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    return sorted.slice(0, options.limit);
  }
  return sorted;
}

export function searchCatalogItems(registry: SPUDefinition[], options: CatalogSearchOptions): CatalogItem[] {
  const query = normalizeText(options.query).toLowerCase();
  if (!query) {
    return browseCatalogItems(registry, options);
  }
  const items = browseCatalogItems(registry, options);
  const scored = items
    .map((item) => ({ item, score: scoreForQuery(item, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.item.title.localeCompare(right.item.title, "en");
    })
    .map((entry) => entry.item);
  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    return scored.slice(0, options.limit);
  }
  return scored;
}

export function listMarketplaceItems(registry: SPUDefinition[], options: CatalogBrowseOptions = {}): CatalogItem[] {
  const statuses = options.statuses && options.statuses.length > 0 ? options.statuses : ["published"];
  return browseCatalogItems(registry, {
    ...options,
    statuses,
  });
}

export function importCatalogItem(registry: SPUDefinition[], input: CatalogImportInput): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const normalizedType: CatalogItemType = input.type;
  const title = normalizeText(input.title, "Untitled Asset");
  const version = normalizeText(input.version, "v1");
  const itemId = normalizeText(input.itemId) || catalogItemIdFromRaw(normalizedType, title, version);
  const existing = getNamespaceState().itemStore.get(itemId);
  const timestamp = nowIso();
  const fallbackVisibility: CatalogItemVisibility = "internal";
  const fallbackStatus: CatalogItemStatus = "draft";
  const visibility = normalizeVisibility(input.visibility, existing?.visibility ?? fallbackVisibility);
  const status = normalizeStatus(input.status, existing?.status ?? fallbackStatus);
  const tags = normalizeStringList(input.tags ?? existing?.tags ?? []);
  const dependencies = normalizeStringList(input.dependencies ?? existing?.dependencies ?? []);
  const next: CatalogItem = {
    itemId,
    type: normalizedType,
    title,
    normSource: normalizeText(input.normSource, existing?.normSource ?? "UNKNOWN"),
    version,
    owner: normalizeText(input.owner, existing?.owner ?? DEFAULT_OWNER),
    visibility,
    tags,
    dependencies,
    status,
    refSpuId: normalizeText(input.refSpuId, existing?.refSpuId ?? "") || null,
    sourceType: normalizeText(input.sourceType, existing?.sourceType ?? "") || null,
    marketplace: normalizeMarketplaceMetadata(existing?.marketplace, visibility, status),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  return persistCatalogItem(next);
}

export function publishCatalogItem(
  registry: SPUDefinition[],
  itemId: string,
  options: CatalogPublishOptions = {},
): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const timestamp = nowIso();
  const tags = options.tags ? normalizeStringList([...existing.tags, ...options.tags]) : existing.tags;
  const visibility = normalizeVisibility(options.visibility, "public");
  const compatibilityVersions = options.compatibleAssetVersions
    ? normalizeStringList(options.compatibleAssetVersions)
    : existing.marketplace.compatibility.compatibleAssetVersions;
  const compatibilityNotes = normalizeText(
    options.compatibilityNotes,
    existing.marketplace.compatibility.notes ?? "",
  ) || null;
  const runtimeVersionRange = normalizeText(
    options.runtimeVersionRange,
    existing.marketplace.compatibility.runtimeVersionRange ?? "",
  ) || null;

  const next: CatalogItem = {
    ...existing,
    owner: normalizeText(options.owner, existing.owner),
    visibility,
    tags,
    status: "published",
    marketplace: {
      ...existing.marketplace,
      listingStatus: "published",
      accessScope: visibility === "public" ? "public" : "enterprise_private",
      publishedAt: existing.marketplace.publishedAt ?? timestamp,
      publishedBy: normalizeText(options.owner, existing.owner),
      compatibility: {
        runtimeVersionRange,
        compatibleAssetVersions: compatibilityVersions,
        notes: compatibilityNotes,
        updatedAt: options.runtimeVersionRange || options.compatibleAssetVersions || options.compatibilityNotes
          ? timestamp
          : existing.marketplace.compatibility.updatedAt,
      },
    },
    updatedAt: timestamp,
  };
  return persistCatalogItem(next);
}

export function deprecateCatalogItem(registry: SPUDefinition[], itemId: string): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const next: CatalogItem = {
    ...existing,
    status: "deprecated",
    marketplace: {
      ...existing.marketplace,
      listingStatus: "deprecated",
    },
    updatedAt: nowIso(),
  };
  return persistCatalogItem(next);
}

export function rateCatalogItem(
  registry: SPUDefinition[],
  itemId: string,
  input: MarketplaceRateInput,
): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const reviewerId = normalizeText(input.reviewerId, "anonymous");
  const score = normalizeScore(input.score);
  if (score < 1 || score > 5) {
    throw new Error("score must be in range 1~5");
  }
  const state = getNamespaceState();
  const records = state.ratingStore.get(existing.itemId) ?? new Map<string, MarketplaceRatingRecord>();
  records.set(reviewerId, {
    reviewerId,
    score,
    comment: normalizeText(input.comment) || null,
    ratedAt: nowIso(),
  });
  state.ratingStore.set(existing.itemId, records);
  syncRatingSummary(existing.itemId);
  const latest = getCatalogItemOrThrow(existing.itemId);
  latest.updatedAt = nowIso();
  return persistCatalogItem(latest);
}

export function registerMarketplaceDownload(registry: SPUDefinition[], itemId: string): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const next: CatalogItem = {
    ...existing,
    marketplace: {
      ...existing.marketplace,
      usage: {
        ...existing.marketplace.usage,
        downloadCount: existing.marketplace.usage.downloadCount + 1,
        lastDownloadedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  };
  return persistCatalogItem(next);
}

export function registerMarketplaceReference(
  registry: SPUDefinition[],
  itemId: string,
  input: MarketplaceReferenceInput = {},
): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const referenceId = normalizeText(input.referenceId);
  const dependencies = referenceId ? normalizeStringList([...existing.dependencies, referenceId]) : existing.dependencies;
  const next: CatalogItem = {
    ...existing,
    dependencies,
    marketplace: {
      ...existing.marketplace,
      usage: {
        ...existing.marketplace.usage,
        referenceCount: existing.marketplace.usage.referenceCount + 1,
        lastReferencedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  };
  return persistCatalogItem(next);
}

export function updateCatalogItemCompatibility(
  registry: SPUDefinition[],
  itemId: string,
  input: MarketplaceCompatibilityInput,
): CatalogItem {
  ensureCatalogItemsFromRegistry(registry);
  const existing = getCatalogItemOrThrow(itemId);
  const runtimeVersionRange = normalizeText(
    input.runtimeVersionRange,
    existing.marketplace.compatibility.runtimeVersionRange ?? "",
  ) || null;
  const compatibleAssetVersions = input.compatibleAssetVersions
    ? normalizeStringList(input.compatibleAssetVersions)
    : existing.marketplace.compatibility.compatibleAssetVersions;
  const notes = normalizeText(input.notes, existing.marketplace.compatibility.notes ?? "") || null;
  const next: CatalogItem = {
    ...existing,
    marketplace: {
      ...existing.marketplace,
      compatibility: {
        runtimeVersionRange,
        compatibleAssetVersions,
        notes,
        updatedAt: nowIso(),
      },
    },
    updatedAt: nowIso(),
  };
  return persistCatalogItem(next);
}

export function listComponentCatalogs(registry: SPUDefinition[]): ComponentCatalogSummary[] {
  const map = getCatalogMapFromAssets(registry, {
    scope: "all",
    statuses: ["draft", "published"],
  });
  return Array.from(map.entries())
    .map(([norm, records]) => summarizeCatalog(norm, records))
    .sort((a, b) => a.catalogName.localeCompare(b.catalogName, "en"));
}

export function getComponentCatalogDetail(registry: SPUDefinition[], catalogId: string): ComponentCatalogDetail | null {
  const matched = listComponentCatalogs(registry).find((item) => item.catalogId === catalogId);
  if (!matched) {
    return null;
  }
  const records = getCatalogMapFromAssets(registry, {
    scope: "all",
    statuses: ["draft", "published"],
  }).get(matched.norm) ?? [];
  const versions = Array.from(new Set(records.map((record) => record.spu.meta.version))).sort((a, b) => a.localeCompare(b, "en"));
  return {
    ...matched,
    versions,
    description: `${matched.catalogName} aggregates executable SPU/template/specbundle assets for marketplace distribution.`,
  };
}

export function listCatalogComponents(registry: SPUDefinition[], catalogId: string): ComponentCatalogComponent[] {
  const detail = getComponentCatalogDetail(registry, catalogId);
  if (!detail) {
    return [];
  }
  const records = getCatalogMapFromAssets(registry, {
    scope: "all",
    statuses: ["draft", "published"],
  }).get(detail.norm) ?? [];
  const components = records.map((record) => record.spu);
  const spuKeys = Array.from(new Set(components.map((item) => deriveSpuKey(item.spuId))));
  const latestSpuIdSet = new Set(
    spuKeys
      .map((spuKey) => findLatestSpuVersion(components, spuKey)?.spuId ?? "")
      .filter(Boolean),
  );

  return records
    .map(({ item, spu }) => {
      const profile = getSpuCrossDomainProfile(spu);
      return {
        itemId: item.itemId,
        spuId: spu.spuId,
        spuKey: deriveSpuKey(spu.spuId),
        version: spu.meta.version,
        clause: spu.meta.clause,
        name: spu.meta.name,
        category: normalizeText(spu.meta.category) || profile.domain,
        classification: profile.classification,
        sourceType: spu.sourceType ?? "unknown",
        inputCount: spu.data.inputs.length,
        outputCount: spu.data.outputs.length,
        gateRuleCount: spu.rules.length,
        isLatest: latestSpuIdSet.has(spu.spuId),
        owner: item.owner,
        visibility: item.visibility,
        status: item.status,
        tags: [...item.tags],
        dependencies: [...item.dependencies],
        marketplace: cloneMarketplaceMetadata(item.marketplace),
      };
    })
    .sort((a, b) => {
      const byClause = a.clause.localeCompare(b.clause, "en");
      if (byClause !== 0) {
        return byClause;
      }
      return a.spuId.localeCompare(b.spuId, "en");
    });
}

export function listComponentMarketplaceListings(
  registry: SPUDefinition[],
): ComponentMarketplaceListing[] {
  const map = getCatalogMapFromAssets(registry, {
    scope: "public",
    statuses: ["published"],
  });
  return Array.from(map.entries())
    .map(([norm, records]) => {
      const summary = summarizeCatalog(norm, records);
      const ratingTotal = records.reduce((sum, record) => sum + record.item.marketplace.rating.totalRatings, 0);
      const ratingWeighted = records.reduce(
        (sum, record) => sum + (record.item.marketplace.rating.averageScore * record.item.marketplace.rating.totalRatings),
        0,
      );
      const downloadCount = records.reduce((sum, record) => sum + record.item.marketplace.usage.downloadCount, 0);
      const referenceCount = records.reduce((sum, record) => sum + record.item.marketplace.usage.referenceCount, 0);
      return {
        listingId: `listing_${summary.catalogId}`,
        catalogId: summary.catalogId,
        catalogName: summary.catalogName,
        norm: summary.norm,
        industryTag: summary.industryTag,
        componentCount: summary.componentCount,
        latestVersionCount: summary.latestVersionCount,
        averageRating: ratingTotal > 0 ? Number((ratingWeighted / ratingTotal).toFixed(2)) : 0,
        totalRatings: ratingTotal,
        downloadCount,
        referenceCount,
        description: "Public executable marketplace listing with ratings and usage stats.",
      };
    })
    .sort((a, b) => a.catalogName.localeCompare(b.catalogName, "en"));
}

export function resetCatalogAssetStoreForTest(): void {
  catalogStateByNamespace.clear();
}
