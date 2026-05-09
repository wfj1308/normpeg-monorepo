import type {
  ContainerProof,
  ExternalInputMappingRule,
  ExternalInputSource,
  ExternalInputSourceType,
  ExecutionNode,
  MappingEntry,
  MappingMinimalStakeView,
  ProofFragment,
  ProjectContext,
  ProjectContextSummary,
  ProjectSpuVersionBinding,
  SpuClassification,
  SPUDefinition,
  SpaceContainer,
  SpaceSlot,
} from "./types.ts";
import type { LayerPegDocument } from "../layerpeg/document.ts";
import type {
  CSDNextExecutableTask,
  CSDSchedulerInput,
  ProjectScheduleDecision,
  ProjectSchedulerInput,
  CSDTaskStatus,
  SchedulerDecision,
} from "./scheduler/csd-scheduler.ts";
import type { RuntimeContainerModel, RuntimeNodeModel } from "./runtime/runtime-model.ts";

const PLATFORM_API_BASE_STORAGE_KEY = "normref.platformApiBase";
const PLATFORM_ACTOR_ROLE_STORAGE_KEY = "normref.platformActorRole";
const PLATFORM_ACTOR_ID_STORAGE_KEY = "normref.platformActorId";
const PLATFORM_TENANT_ID_STORAGE_KEY = "normref.platformTenantId";
const API_BASE = (import.meta.env.VITE_PLATFORM_API_BASE as string | undefined)?.trim() || "http://localhost:8790";
const DEFAULT_ACTOR_ROLE = ((import.meta.env.VITE_PLATFORM_ACTOR_ROLE as string | undefined)?.trim() || "admin").toLowerCase();
const DEFAULT_ACTOR_ID = (import.meta.env.VITE_PLATFORM_ACTOR_ID as string | undefined)?.trim() || "anonymous";
const DEFAULT_TENANT_ID = (import.meta.env.VITE_PLATFORM_TENANT_ID as string | undefined)?.trim() || "default";

export type PlatformActorRole = "admin" | "builder" | "expert" | "inspector" | "supervisor";

function normalizeApiBase(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return API_BASE;
  }
  return trimmed.replace(/\/+$/, "");
}

function hasWindowStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredPlatformApiBase(): string | null {
  if (!hasWindowStorage()) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(PLATFORM_API_BASE_STORAGE_KEY);
    return stored ? stored.trim() : null;
  } catch {
    return null;
  }
}

let runtimePlatformApiBase = normalizeApiBase(readStoredPlatformApiBase() ?? API_BASE);

function normalizeActorRole(value: string | null | undefined): PlatformActorRole {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "admin" ||
    normalized === "builder" ||
    normalized === "expert" ||
    normalized === "inspector" ||
    normalized === "supervisor"
  ) {
    return normalized;
  }
  return "admin";
}

function readStoredActorRole(): PlatformActorRole | null {
  if (!hasWindowStorage()) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(PLATFORM_ACTOR_ROLE_STORAGE_KEY);
    return stored ? normalizeActorRole(stored) : null;
  } catch {
    return null;
  }
}

function readStoredActorId(): string | null {
  if (!hasWindowStorage()) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(PLATFORM_ACTOR_ID_STORAGE_KEY);
    return stored ? stored.trim() : null;
  } catch {
    return null;
  }
}

function normalizeTenantId(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return DEFAULT_TENANT_ID;
  }
  return normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function readStoredTenantId(): string | null {
  if (!hasWindowStorage()) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(PLATFORM_TENANT_ID_STORAGE_KEY);
    return stored ? normalizeTenantId(stored) : null;
  } catch {
    return null;
  }
}

let runtimeActorRole: PlatformActorRole = readStoredActorRole() ?? normalizeActorRole(DEFAULT_ACTOR_ROLE);
let runtimeActorId = readStoredActorId() ?? DEFAULT_ACTOR_ID;
let runtimeTenantId = readStoredTenantId() ?? normalizeTenantId(DEFAULT_TENANT_ID);

export function getPlatformApiBase(): string {
  return runtimePlatformApiBase;
}

export function setPlatformApiBase(value: string): string {
  runtimePlatformApiBase = normalizeApiBase(value);
  if (hasWindowStorage()) {
    try {
      window.localStorage.setItem(PLATFORM_API_BASE_STORAGE_KEY, runtimePlatformApiBase);
    } catch {
      // Ignore browser storage failures and keep in-memory value.
    }
  }
  return runtimePlatformApiBase;
}

export function getPlatformActorRole(): PlatformActorRole {
  return runtimeActorRole;
}

export function setPlatformActorRole(value: PlatformActorRole): PlatformActorRole {
  runtimeActorRole = normalizeActorRole(value);
  if (hasWindowStorage()) {
    try {
      window.localStorage.setItem(PLATFORM_ACTOR_ROLE_STORAGE_KEY, runtimeActorRole);
    } catch {
      // Ignore browser storage failures and keep in-memory value.
    }
  }
  return runtimeActorRole;
}

export function getPlatformActorId(): string {
  return runtimeActorId;
}

export function setPlatformActorId(value: string): string {
  runtimeActorId = value.trim() || DEFAULT_ACTOR_ID;
  if (hasWindowStorage()) {
    try {
      window.localStorage.setItem(PLATFORM_ACTOR_ID_STORAGE_KEY, runtimeActorId);
    } catch {
      // Ignore browser storage failures and keep in-memory value.
    }
  }
  return runtimeActorId;
}

export function getPlatformTenantId(): string {
  return runtimeTenantId;
}

export function setPlatformTenantId(value: string): string {
  runtimeTenantId = normalizeTenantId(value);
  if (hasWindowStorage()) {
    try {
      window.localStorage.setItem(PLATFORM_TENANT_ID_STORAGE_KEY, runtimeTenantId);
    } catch {
      // Ignore browser storage failures and keep in-memory value.
    }
  }
  return runtimeTenantId;
}

async function readResponsePayload(resp: Response): Promise<{
  rawText: string;
  jsonBody: Record<string, unknown> | null;
}> {
  const rawText = await resp.text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { rawText, jsonBody: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { rawText, jsonBody: parsed as Record<string, unknown> };
    }
    return { rawText, jsonBody: null };
  } catch {
    return { rawText, jsonBody: null };
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = getPlatformApiBase();
  let resp: Response;
  try {
    resp = await fetch(`${apiBase}${path}`, {
      headers: {
        "Content-Type": "application/json",
        "x-user-role": runtimeActorRole,
        "x-actor-id": runtimeActorId,
        "x-tenant-id": runtimeTenantId,
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new Error(`无法连接平台 API（${apiBase}），请先启动 apps/executable-spec-web/server/platform-api.ts`);
  }
  const { rawText, jsonBody } = await readResponsePayload(resp);
  if (!resp.ok) {
    const detail = typeof jsonBody?.error === "string" ? jsonBody.error : rawText.trim();
    throw new Error(detail || `${resp.status} ${resp.statusText}`);
  }
  if (!jsonBody) {
    throw new Error(`平台 API 返回了非 JSON 响应（${path}）`);
  }
  return jsonBody as T;
}

export function getDashboard() {
  return request<{
    tenantId?: string;
    totalContainers: number;
    archivedCount: number;
    pendingCount: number;
    verifiedCount: number;
    registryCount: number;
    observability?: {
      totalExecutions: number;
      completedExecutions: number;
      executionSuccessRate: number;
      avgLatencyMs: number;
      gatePassRate: number;
      proofGenerationRate: number;
    };
    observabilityAlerts?: Array<{
      code: "SUCCESS_RATE_DROP" | "LATENCY_SPIKE" | "GATE_PASS_RATE_DROP" | "PROOF_RATE_DROP";
      severity: "warning" | "critical";
      message: string;
      latestValue: number;
      baselineValue: number;
    }>;
  }>("/api/dashboard");
}

export interface TenantRecord {
  tenantId: string;
  projects: string[];
  users: Array<{
    userId: string;
    role?: string;
  }>;
  resourceScope: {
    spu: "tenant";
    spec: "tenant";
    proof: "tenant";
    container: "tenant";
    sharedCatalog: "read-only";
  };
  createdAt: string;
  updatedAt: string;
}

export interface SharedCatalogItem {
  sourceTenantId: "shared";
  readOnly: true;
  spuId: string;
  title: string;
  norm: string;
  clause: string;
  version: string;
  category: string;
}

export function listTenants() {
  return request<{
    currentTenantId: string;
    items: TenantRecord[];
  }>("/api/tenants");
}

export function saveTenant(payload: {
  tenantId: string;
  projects?: string[];
  users?: Array<{ userId: string; role?: string }>;
}) {
  return request<{ item: TenantRecord }>("/api/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listSharedCatalogItems(params?: {
  query?: string;
  category?: string;
  norm?: string;
}) {
  const query = new URLSearchParams();
  if (params?.query?.trim()) {
    query.set("query", params.query.trim());
  }
  if (params?.category?.trim()) {
    query.set("category", params.category.trim());
  }
  if (params?.norm?.trim()) {
    query.set("norm", params.norm.trim());
  }
  const suffix = query.toString();
  return request<{ items: SharedCatalogItem[] }>(`/api/tenants/shared-catalog${suffix ? `?${suffix}` : ""}`);
}

export interface ObservabilityDashboardResponse {
  window: {
    from: string;
    to: string;
    windowMinutes: number;
    bucketMinutes: number;
    totalBuckets: number;
  };
  summary: {
    totalExecutions: number;
    completedExecutions: number;
    executionSuccessRate: number;
    avgLatencyMs: number;
    gatePassRate: number;
    proofGenerationRate: number;
  };
  trend: Array<{
    bucketStart: string;
    bucketEnd: string;
    totalExecutions: number;
    completedExecutions: number;
    executionSuccessRate: number;
    avgLatencyMs: number;
    gatePassRate: number;
    proofGenerationRate: number;
  }>;
  alerts: Array<{
    code: "SUCCESS_RATE_DROP" | "LATENCY_SPIKE" | "GATE_PASS_RATE_DROP" | "PROOF_RATE_DROP";
    severity: "warning" | "critical";
    message: string;
    latestValue: number;
    baselineValue: number;
  }>;
  updatedAt: string;
}

export function getDashboardMetrics(params?: {
  windowMinutes?: number;
  bucketMinutes?: number;
}) {
  const query = new URLSearchParams();
  if (typeof params?.windowMinutes === "number" && Number.isFinite(params.windowMinutes)) {
    query.set("windowMinutes", String(params.windowMinutes));
  }
  if (typeof params?.bucketMinutes === "number" && Number.isFinite(params.bucketMinutes)) {
    query.set("bucketMinutes", String(params.bucketMinutes));
  }
  const suffix = query.toString();
  return request<ObservabilityDashboardResponse>(`/api/dashboard/metrics${suffix ? `?${suffix}` : ""}`);
}

export interface NormRegistryQueryOptions {
  classification?: SpuClassification;
}

export interface SpuCrossDomainProfileResponse {
  adapterId: string;
  domain: string;
  classification: SpuClassification;
  industryTag: string;
  tags: string[];
}

export function getNormRegistry(options?: NormRegistryQueryOptions) {
  const params = new URLSearchParams();
  if (options?.classification) {
    params.set("classification", options.classification);
  }
  const query = params.toString();
  return request<{ items: SPUDefinition[] }>(`/api/registry/spus${query ? `?${query}` : ""}`);
}

export function getSpuCrossDomainProfile(spuId: string) {
  return request<{ profile: SpuCrossDomainProfileResponse }>(
    `/api/registry/spus/${encodeURIComponent(spuId)}/profile`,
  );
}

export interface LayerPegQueryOptions {
  ownerDid?: string;
  projectRef?: string;
  rootRef?: string;
  usi?: string;
}

export interface LayerPegStandardOutput {
  format: "LayerPegDocument";
  schemaId: "layerpeg-document.schema.json";
  document: LayerPegDocument;
}

function buildLayerPegQuery(options?: LayerPegQueryOptions): string {
  if (!options) {
    return "";
  }
  const params = new URLSearchParams();
  if (options.ownerDid?.trim()) params.set("ownerDid", options.ownerDid.trim());
  if (options.projectRef?.trim()) params.set("projectRef", options.projectRef.trim());
  if (options.rootRef?.trim()) params.set("rootRef", options.rootRef.trim());
  if (options.usi?.trim()) params.set("usi", options.usi.trim());
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getLayerPegSpecDocument(spuId: string, options?: LayerPegQueryOptions) {
  const query = buildLayerPegQuery(options);
  return request<{ document: LayerPegDocument; standardOutput?: LayerPegStandardOutput }>(
    `/api/layerpeg/spec/${encodeURIComponent(spuId)}${query}`,
  );
}

export function getLayerPegNodeDocument(nodeId: string, options?: LayerPegQueryOptions) {
  const query = buildLayerPegQuery(options);
  return request<{ document: LayerPegDocument; standardOutput?: LayerPegStandardOutput }>(
    `/api/layerpeg/node/${encodeURIComponent(nodeId)}${query}`,
  );
}

export function getLayerPegContainerProofDocument(containerId: string, options?: LayerPegQueryOptions) {
  const query = buildLayerPegQuery(options);
  return request<{ document: LayerPegDocument; standardOutput?: LayerPegStandardOutput }>(
    `/api/layerpeg/container/${encodeURIComponent(containerId)}/proof${query}`,
  );
}

export interface LayerPegDocumentMeta {
  usi: string;
  docType: string;
  sourceRef: string;
  updatedAt: string;
  version?: string;
  decision?: string;
  stateCurrent?: string;
  payloadType?: string;
}

export function getLayerPegDocuments(filter?: { docType?: string; sourceRefPrefix?: string }) {
  const params = new URLSearchParams();
  if (filter?.docType?.trim()) {
    params.set("docType", filter.docType.trim());
  }
  if (filter?.sourceRefPrefix?.trim()) {
    params.set("sourceRefPrefix", filter.sourceRefPrefix.trim());
  }
  const query = params.toString();
  return request<{ items: LayerPegDocumentMeta[] }>(`/api/layerpeg/documents${query ? `?${query}` : ""}`);
}

export function getLayerPegStoredDocument(usi: string) {
  return request<{ document: LayerPegDocument; meta: LayerPegDocumentMeta; standardOutput?: LayerPegStandardOutput }>(
    `/api/layerpeg/documents/${encodeURIComponent(usi)}`,
  );
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

export type CatalogItemType = "spu" | "spec" | "template" | "specbundle";
export type CatalogItemVisibility = "internal" | "public";
export type CatalogItemStatus = "draft" | "published" | "deprecated";
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

export interface CatalogAssetItem {
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

export interface CatalogAssetBrowseOptions {
  scope?: "internal" | "public" | "all";
  types?: CatalogItemType[];
  statuses?: CatalogItemStatus[];
  owner?: string;
  tags?: string[];
  includeDeprecated?: boolean;
  limit?: number;
}

export interface ComponentCatalogDetail extends ComponentCatalogSummary {
  versions: string[];
  description: string;
}

export interface ComponentCatalogComponent {
  itemId: string;
  spuId: string;
  spuKey: string;
  version: string;
  clause: string;
  name: string;
  category: string;
  classification: "measurement" | "validation" | "compliance";
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

function buildCatalogAssetQuery(options?: CatalogAssetBrowseOptions): string {
  const params = new URLSearchParams();
  if (options?.scope) {
    params.set("scope", options.scope);
  }
  if (options?.types?.length) {
    params.set("types", options.types.join(","));
  }
  if (options?.statuses?.length) {
    params.set("statuses", options.statuses.join(","));
  }
  if (options?.owner?.trim()) {
    params.set("owner", options.owner.trim());
  }
  if (options?.tags?.length) {
    params.set("tags", options.tags.join(","));
  }
  if (typeof options?.includeDeprecated === "boolean") {
    params.set("includeDeprecated", options.includeDeprecated ? "true" : "false");
  }
  if (typeof options?.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

export function browseCatalogAssets(options?: CatalogAssetBrowseOptions) {
  return request<{ items: CatalogAssetItem[] }>(`/api/catalog-assets${buildCatalogAssetQuery(options)}`);
}

export function searchCatalogAssets(query: string, options?: CatalogAssetBrowseOptions) {
  const params = new URLSearchParams();
  params.set("q", query);
  const querySuffix = buildCatalogAssetQuery(options);
  if (querySuffix) {
    for (const [key, value] of new URLSearchParams(querySuffix.slice(1)).entries()) {
      params.set(key, value);
    }
  }
  return request<{ items: CatalogAssetItem[] }>(`/api/catalog-assets/search?${params.toString()}`);
}

export function importCatalogAsset(payload: {
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
  sourceType?: "builtin" | "imported" | "compiled";
  definitionText?: string;
}) {
  return request<{ item: CatalogAssetItem; importedSpu: SPUDefinition | null }>("/api/catalog-assets/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publishCatalogAsset(itemId: string, payload?: {
  visibility?: CatalogItemVisibility;
  tags?: string[];
  runtimeVersionRange?: string;
  compatibleAssetVersions?: string[];
  compatibilityNotes?: string;
}) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/publish`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function deprecateCatalogAsset(itemId: string) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/deprecate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function rateCatalogAsset(itemId: string, payload: { score: number; reviewerId?: string; comment?: string }) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/rate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function registerCatalogAssetDownload(itemId: string) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/download`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function registerCatalogAssetReference(itemId: string, payload?: {
  referenceId?: string;
  referenceType?: string;
  note?: string;
}) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/reference`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export function updateCatalogAssetCompatibility(itemId: string, payload: {
  runtimeVersionRange?: string;
  compatibleAssetVersions?: string[];
  notes?: string;
}) {
  return request<{ item: CatalogAssetItem }>(`/api/catalog-assets/${encodeURIComponent(itemId)}/compatibility`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getComponentCatalogs() {
  return request<{ items: ComponentCatalogSummary[] }>("/api/component-catalogs");
}

export function getComponentCatalogDetail(catalogId: string) {
  return request<{ catalog: ComponentCatalogDetail }>(`/api/component-catalogs/${encodeURIComponent(catalogId)}`);
}

export function getComponentCatalogComponents(catalogId: string) {
  return request<{ items: ComponentCatalogComponent[] }>(
    `/api/component-catalogs/${encodeURIComponent(catalogId)}/components`,
  );
}

export function getComponentMarketplaceListings() {
  return request<{ items: ComponentMarketplaceListing[] }>("/api/component-market/listings");
}

export function browseMarketplaceItems(options?: CatalogAssetBrowseOptions) {
  return request<{ items: CatalogAssetItem[] }>(`/api/marketplace/items${buildCatalogAssetQuery(options)}`);
}

export interface SpuSelectorRequest {
  intent: string;
  projectContext?: {
    projectId?: string | null;
    preferredCategory?: string | null;
    preferredClause?: string | null;
    preferredDomain?: string | null;
    preferredClassification?: SpuClassification | null;
  };
  containerMetadata?: {
    containerId?: string | null;
    projectId?: string | null;
    boundSpuIds?: string[];
    currentSpuId?: string | null;
    nodeType?: string | null;
  };
  nodeMetadata?: {
    nodeId?: string | null;
    spuId?: string | null;
    nodeType?: string | null;
  };
  hints?: {
    spuId?: string | null;
    spuKey?: string | null;
    category?: string | null;
    clause?: string | null;
    measuredItem?: string | null;
    domain?: string | null;
    classification?: SpuClassification | null;
  };
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

export interface SpuSelectorResponse {
  intent: string;
  selectedSpuId: string | null;
  rankedCandidates: SpuSelectorCandidate[];
}

export function selectSpuCandidates(payload: SpuSelectorRequest) {
  return request<SpuSelectorResponse>("/api/spu-selector/select", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface Nl2GateQueryResponse {
  success: boolean;
  query: string;
  parsed?: {
    metric: "compaction" | "thickness" | "deflection";
    stake: string;
  };
  command?: {
    action: "validate_spu_direct";
    intent?: "gate.preview" | "gate.evaluate";
    endpoint?: "/api/gate/preview" | "/api/gate/evaluate" | "/api/executor/run";
    spuId: string;
    stake: string;
    formData: Record<string, number>;
    context?: Record<string, unknown>;
  };
  execution?: {
    status: "PASS" | "FAIL";
    executionId?: string;
    outputs: Record<string, unknown>;
    gate: {
      passed: boolean;
      results: Array<{
        ruleId: string;
        field: string;
        operator: string;
        threshold: number | string | boolean;
        actual: number | string | boolean;
        passed: boolean;
        message: string;
      }>;
    };
    proofHash?: string | null;
    intent?: "gate.preview" | "gate.evaluate";
    endpoint?: "/api/gate/preview" | "/api/gate/evaluate" | "/api/executor/run";
  };
  structured: {
    intent: "gate.preview" | "gate.evaluate" | null;
    target: {
      metric: "compaction" | "thickness" | "deflection" | null;
      stake: string | null;
      spuId: string | null;
      containerId: string | null;
      nodeId: string | null;
    };
    inputs: Record<string, number>;
    context: Record<string, unknown>;
    spuCandidates: SpuSelectorCandidate[];
    missing: Array<{
      field: string;
      reason: string;
      required: true;
      expected?: string;
    }>;
    missingResponse: {
      missingFields: Array<{
        field: string;
        reason: string;
        required: true;
        expected?: string;
      }>;
      suggestedQuestions: string[];
      partialContext: {
        intent: "gate.preview" | "gate.evaluate" | null;
        target: {
          metric: "compaction" | "thickness" | "deflection" | null;
          stake: string | null;
          spuId: string | null;
          containerId: string | null;
          nodeId: string | null;
        };
        collectedInputs: Record<string, number>;
        context: Record<string, unknown>;
      };
    } | null;
    conversation: {
      conversationId: string;
      pendingIntent: "gate.preview" | "gate.evaluate" | null;
      pendingSpu: string | null;
      collectedInputs: Record<string, number>;
    } | null;
    command: Nl2GateQueryResponse["command"] | null;
    execution: Nl2GateQueryResponse["execution"] | null;
  };
  answer: string;
  errorCode?: string;
  error?: string;
}

export function queryNl2Gate(
  query: string,
  options?: {
    mode?: "preview" | "evaluate";
    context?: Record<string, unknown>;
    conversationId?: string;
    execute?: boolean;
  },
) {
  return request<Nl2GateQueryResponse>("/api/nl2gate/query", {
    method: "POST",
    body: JSON.stringify({
      query,
      mode: options?.mode,
      context: options?.context,
      conversationId: options?.conversationId,
      execute: options?.execute,
    }),
  });
}

export function importRegistryDefinition(definitionText: string, sourceType: "builtin" | "imported" | "compiled" = "imported") {
  return request<{
    item: SPUDefinition;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>("/api/registry/import", {
    method: "POST",
    body: JSON.stringify({ definitionText, sourceType }),
  });
}

export interface SpecLintIssue {
  code: string;
  section: string;
  message: string;
  line?: number;
}

export interface SpecLintPayload {
  valid: boolean;
  errors: SpecLintIssue[];
  warnings: SpecLintIssue[];
}

export interface ExtractionWarning {
  code: string;
  message: string;
  section?: string;
}

export interface RiskItem {
  id: string;
  source: "warning" | "diff" | "manual";
  code: string;
  title: string;
  message: string;
  riskLevel: "high" | "medium" | "low";
  category: "clause" | "formula" | "input" | "rule" | "ocr" | "table" | "manual_review";
  requiresConfirmation: boolean;
  blocksRegister: boolean;
  section?: string;
}

export interface RiskReviewResult {
  items: RiskItem[];
  summary: {
    high: number;
    medium: number;
    low: number;
    blocking: number;
    confirmRequired: number;
  };
  canRegister: boolean;
  reviewMessage: string;
}

export interface ClauseReviewItem {
  id: string;
  title: string;
  message: string;
  riskLevel: "high" | "medium" | "low";
  required: boolean;
  confirmed: boolean;
}

export interface ClauseReviewResult {
  items: ClauseReviewItem[];
  summary: {
    requiredTotal: number;
    requiredConfirmed: number;
    highRequiredUnconfirmed: number;
    mediumUnconfirmed: number;
    lowUnconfirmed: number;
  };
  allRequiredConfirmed: boolean;
}

export interface DraftDiffReviewResult {
  hasChanges: boolean;
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
  sectionChanges: Array<{
    section: string;
    changeType: "added" | "removed" | "modified";
    riskLevel: "high" | "medium" | "low";
    message: string;
  }>;
  lineDiffs: Array<{
    type: "added" | "removed" | "modified";
    oldLine?: string;
    newLine?: string;
  }>;
}

export interface PreRegisterReviewResult {
  riskReview: RiskReviewResult;
  diffReview: DraftDiffReviewResult;
  clauseReview: ClauseReviewResult;
  finalDecision: {
    canRegister: boolean;
    status: "blocked" | "warning" | "ready";
    blockingReasons: string[];
    warningReasons: string[];
    summary: {
      riskHigh: number;
      riskMedium: number;
      diffHigh: number;
      clausePending: number;
    };
  };
}

export type SpecImpactType = "meta" | "input" | "path" | "gate" | "proof" | "dependency";
export type SpecImpactLevel = "high" | "medium" | "low";

export interface SpecImpactDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: "added" | "removed" | "modified";
  impactType: SpecImpactType;
  impactLevel: SpecImpactLevel;
}

export interface SpecImpactAnalysis {
  hasImpact: boolean;
  impactLevel: SpecImpactLevel;
  summary: string;
  diffs: SpecImpactDiff[];
  affectedAreas: Array<SpecImpactType | "running_containers">;
  requiresReview: boolean;
}

export interface RunningImpactContainer {
  containerId: string;
  spuId: string;
  lifecycleState: "draft" | "active" | "validated" | "archived";
  containerState: "running" | "completed" | "draft";
  specStatus: "blocked" | "ready" | "running" | "pass" | "fail";
  impactLevel: SpecImpactLevel;
  requiresReview: boolean;
  latestNode?: string | null;
  message: string;
}

export interface RunningImpactScan {
  oldSpuId: string;
  newSpuId: string;
  specImpactAnalysis: SpecImpactAnalysis;
  summary: {
    totalAffected: number;
    running: number;
    completed: number;
    requiresReview: number;
  };
  affectedContainers: RunningImpactContainer[];
  requiresReviewContainers: string[];
}

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

export interface ActivationDecision {
  containerId?: string;
  spuKey: string;
  currentSpuId?: string | null;
  recommendedSpuId: string;
  shouldSwitch: boolean;
  reason: string;
}

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

export interface TemplateVariable {
  key: string;
  label: string;
  type: "string" | "number" | "select";
  required: boolean;
  defaultValue?: string | number;
  options?: string[];
}

export interface TemplateReusableField {
  key: string;
  target: "meta" | "input" | "rule" | "proof" | "dependency";
  description?: string;
}

export interface TemplateRulePlaceholder {
  key: string;
  field: string;
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  description?: string;
  placeholderType?: "threshold" | "message" | "clause";
}

export interface SpecMarkdownTemplate {
  templateId: string;
  baseType: string;
  name: string;
  category: string;
  description?: string;
  reusableFields: TemplateReusableField[];
  rulePlaceholders: TemplateRulePlaceholder[];
  defaultProofRequirements: string[];
  variables: TemplateVariable[];
  markdownTemplate: string;
}

export interface TemplateDerivationOverrides {
  clause?: string;
  threshold?: number;
  description?: string;
}

export interface TemplateSpuRelation {
  templateId: string;
  baseType: string;
  inheritedFromSpuId: string | null;
  derivedSpuId: string | null;
  overrides: TemplateDerivationOverrides;
  createdAt: string;
  reusableFieldKeys: string[];
  rulePlaceholderKeys: string[];
  defaultProofRequirements: string[];
}

export interface SpecCompileResultPayload {
  success: boolean;
  stage: "completed" | "lint" | "compile" | "bundle";
  source: "template" | "pdf" | "markdown";
  compiledAt: string;
  spuId?: string;
  error?: string;
}

export interface SpecbundlePayload {
  fileName: string;
  byteLength: number;
  base64: string;
}

export interface CompileArtifactPayload {
  success: boolean;
  source: "template" | "pdf" | "markdown";
  lintResult: SpecLintPayload;
  compileResult: SpecCompileResultPayload;
  spu: Record<string, unknown> | null;
  // Backward-compatible alias.
  spuSchema: Record<string, unknown> | null;
  specbundle: SpecbundlePayload | null;
}

export interface UnifiedSpecBuildPayload {
  lintResult: SpecLintPayload | null;
  compileResult: SpecCompileResultPayload | null;
  spu: Record<string, unknown> | null;
  specbundle: SpecbundlePayload | null;
  layerPegDocument?: LayerPegDocument | null;
  standardOutput?: LayerPegStandardOutput | null;
}

export type RegisterMarkdownSpecResponse =
  ({
      success: true;
      stage: "registered";
      spuId: string;
      lint: SpecLintPayload;
      json: SPUDefinition;
      compileArtifact: CompileArtifactPayload;
      registered: {
        success: true;
        spuId: string;
        registeredAt: string;
      };
      riskReview?: RiskReviewResult;
      preRegisterReview?: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }
  | {
      success: false;
      stage: "lint";
      lint: SpecLintPayload;
      compileArtifact: CompileArtifactPayload;
      riskReview?: RiskReviewResult;
      preRegisterReview?: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }
  | {
      success: false;
      stage: "compile";
      lint: SpecLintPayload;
      error: string;
      compileArtifact: CompileArtifactPayload;
      riskReview?: RiskReviewResult;
      preRegisterReview?: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }
  | {
      success: false;
      stage: "register";
      error: "SPU_ALREADY_EXISTS" | string;
      spuId: string;
      lint: SpecLintPayload;
      json: SPUDefinition;
      compileArtifact: CompileArtifactPayload;
      riskReview?: RiskReviewResult;
      preRegisterReview?: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }
  | {
      success: false;
      stage: "risk_review";
      error: "RISK_REVIEW_BLOCKED";
      riskReview: RiskReviewResult;
      preRegisterReview?: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }
  | {
      success: false;
      stage: "pre_register_review";
      error: "PRE_REGISTER_BLOCKED";
      reasons?: string[];
      riskReview: RiskReviewResult;
      preRegisterReview: PreRegisterReviewResult;
      specImpactAnalysis?: SpecImpactAnalysis | null;
      specImpactBaseSpuId?: string | null;
      runningImpactScan?: RunningImpactScan | null;
      spuActivationPolicy?: SpuActivationPolicyResult | null;
    }) & UnifiedSpecBuildPayload;

export function registerMarkdownSpec(
  markdown: string,
  riskWarnings?: ExtractionWarning[],
  reviewInput?: {
    source?: "template" | "pdf" | "markdown";
    originalDraftMarkdown?: string;
    editedMarkdown?: string;
    clauseReviewItems?: ClauseReviewItem[];
  },
) {
  return request<RegisterMarkdownSpecResponse>("/api/spec/register-markdown", {
    method: "POST",
    body: JSON.stringify({
      markdown,
      riskWarnings,
      source: reviewInput?.source,
      originalDraftMarkdown: reviewInput?.originalDraftMarkdown,
      editedMarkdown: reviewInput?.editedMarkdown,
      clauseReviewItems: reviewInput?.clauseReviewItems,
    }),
  });
}

export function compileMarkdownSpec(
  markdown: string,
  source: "template" | "pdf" | "markdown" = "markdown",
) {
  return request<CompileArtifactPayload>("/api/spec/compile-markdown", {
    method: "POST",
    body: JSON.stringify({
      markdown,
      source,
    }),
  });
}

export interface RegisterTemplateSpecResponse {
  template: SpecMarkdownTemplate;
  markdown: string;
  values: Record<string, string | number>;
  relation: TemplateSpuRelation;
  registerResult: RegisterMarkdownSpecResponse;
  compileArtifact: CompileArtifactPayload | null;
  lintResult: SpecLintPayload | null;
  compileResult: SpecCompileResultPayload | null;
  spu: Record<string, unknown> | null;
  specbundle: SpecbundlePayload | null;
  layerPegDocument?: LayerPegDocument | null;
  standardOutput?: LayerPegStandardOutput | null;
}

export function getSpecTemplates() {
  return request<{ items: SpecMarkdownTemplate[] }>("/api/spec/templates");
}

export function createAndRegisterSpecFromTemplate(
  templateId: string,
  values: Record<string, string | number>,
  options?: {
    inheritFromSpuId?: string;
    overrides?: TemplateDerivationOverrides;
  },
) {
  return request<RegisterTemplateSpecResponse>("/api/spec/register-template", {
    method: "POST",
    body: JSON.stringify({
      templateId,
      values,
      inheritFromSpuId: options?.inheritFromSpuId,
      overrides: options?.overrides,
    }),
  });
}

export type CandidateApprovalAssetType = "spu" | "template" | "specbundle";

export type CandidateApprovalStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "published"
  | "deprecated";

export interface CandidateApprovalEvent {
  eventId: string;
  action: "create_draft" | "submit" | "start_review" | "approve" | "reject" | "publish" | "deprecate";
  actorId: string;
  note?: string;
  fromStatus: CandidateApprovalStatus | null;
  toStatus: CandidateApprovalStatus;
  at: string;
}

export interface CandidateRuleApproval {
  candidateId: string;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  assetType: CandidateApprovalAssetType;
  assetRef?: string;
  status: CandidateApprovalStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  decidedAt?: string;
  publishedAt?: string;
  deprecatedAt?: string;
  publishedRef?: string;
  events: CandidateApprovalEvent[];
}

export function createApprovalCandidate(payload: {
  title: string;
  summary?: string;
  content?: Record<string, unknown>;
  assetType?: CandidateApprovalAssetType;
  assetRef?: string;
}) {
  return request<{ item: CandidateRuleApproval }>("/api/approval/candidates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listApprovalCandidates(filters?: {
  assetType?: CandidateApprovalAssetType;
  status?: CandidateApprovalStatus;
}) {
  const query = new URLSearchParams();
  if (filters?.assetType) {
    query.set("assetType", filters.assetType);
  }
  if (filters?.status) {
    query.set("status", filters.status);
  }
  const suffix = query.toString();
  return request<{ items: CandidateRuleApproval[] }>(`/api/approval/candidates${suffix ? `?${suffix}` : ""}`);
}

export function getApprovalCandidate(candidateId: string) {
  return request<{ item: CandidateRuleApproval }>(`/api/approval/candidates/${encodeURIComponent(candidateId)}`);
}

export function submitApprovalCandidate(candidateId: string, note?: string) {
  return request<{ item: CandidateRuleApproval }>(`/api/approval/candidates/${encodeURIComponent(candidateId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function moveApprovalCandidateToReview(candidateId: string, note?: string) {
  return request<{ item: CandidateRuleApproval }>(`/api/approval/candidates/${encodeURIComponent(candidateId)}/review`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function decideApprovalCandidate(candidateId: string, payload: { decision: "approve" | "reject"; note?: string }) {
  return request<{ item: CandidateRuleApproval }>(`/api/approval/candidates/${encodeURIComponent(candidateId)}/decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publishApprovalCandidate(
  candidateId: string,
  payload?: {
    publishedRef?: string;
    note?: string;
    definition?: SPUDefinition;
  },
) {
  return request<{ item: CandidateRuleApproval; publishedItem: SPUDefinition | null }>(
    `/api/approval/candidates/${encodeURIComponent(candidateId)}/publish`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
  );
}

export function deprecateApprovalCandidate(candidateId: string, note?: string) {
  return request<{ item: CandidateRuleApproval }>(`/api/approval/candidates/${encodeURIComponent(candidateId)}/deprecate`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export interface PDFDraftExtracted {
  title: string;
  norm: string;
  clause: string;
  clauseConfidence: "high" | "medium" | "low";
  clauseCandidates: Array<{ clause: string; index: number }>;
  version: string;
  category: string;
  measuredItem: string;
  inputs: Array<{ name: string; type: "number" | "string" | "boolean"; unit: string; label: string }>;
  outputs: string[];
  calculations: string[];
  formulaCandidates: Array<{
    originalText: string;
    leftVar: string | null;
    expression: string | null;
    completeness: "full" | "partial";
    index: number;
  }>;
  tableBlocks: Array<{
    type: "parameter_table" | "rule_table" | "responsibility_table" | "unknown_table" | "generic_table";
    headers: string[];
    rows: string[][];
    startIndex: number;
  }>;
  rules: Array<{ field: string; operator: string; value: string | number; message: string }>;
  signatures: string[];
  dependsOn: string[];
}

export interface PDFDraftWarning {
  code:
    | "CLAUSE_AMBIGUOUS"
    | "FORMULA_PARTIAL"
    | "TABLE_PARSE_PARTIAL"
    | "INPUTS_INFERRED"
    | "RULES_INFERRED"
    | "MANUAL_REVIEW_REQUIRED"
    | "OCR_USED"
    | "OCR_TEXT_NOISY"
    | "OCR_CLAUSE_LOW_CONFIDENCE"
    | "OCR_FORMULA_LOW_CONFIDENCE"
    | "OCR_TABLE_LOW_CONFIDENCE";
  message: string;
}

export interface PDFToDraftResponse {
  success: true;
  rawText: string;
  draftMarkdown: string;
  extracted: PDFDraftExtracted;
  warnings: ExtractionWarning[];
  ocrUsed: boolean;
  metrics: {
    clauseConfidence: "high" | "medium" | "low";
    formulasFull: number;
    formulasPartial: number;
    inputCount: number;
    ruleCount: number;
    warningsCount: number;
  };
}

export function pdfToDraftMarkdown(payload: {
  pdfBase64: string;
  fileName?: string;
  options?: {
    standardCode?: string;
    defaultCategory?: string;
    defaultVersion?: string;
  };
}) {
  return request<PDFToDraftResponse>("/api/spec/pdf-to-draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importSlot(payload: {
  station: string;
  chainage: number;
  x: number;
  y: number;
  elevation: number;
  alignment?: string;
  sourceFile: string;
}) {
  return request<{ slot: SpaceSlot }>("/api/slots/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ExternalInputImportResponse {
  source: ExternalInputSource;
  sampleRecord: Record<string, unknown> | null;
}

export interface ExternalInputMapResponse {
  source: ExternalInputSource;
  recordIndex: number;
  record: Record<string, unknown>;
  mappedInputs: Record<string, unknown>;
  missingInputs: string[];
}

export function listExternalInputSources() {
  return request<{ items: ExternalInputSource[] }>("/api/external-inputs");
}

export function getExternalInputSource(sourceId: string) {
  return request<{ item: ExternalInputSource }>(`/api/external-inputs/${encodeURIComponent(sourceId)}`);
}

export function importExternalInputCsv(payload: {
  sourceId?: string;
  sourceType?: ExternalInputSourceType;
  sourceRef?: string;
  csvText: string;
  mappingRules: ExternalInputMappingRule[];
}) {
  return request<ExternalInputImportResponse>("/api/external-inputs/import/csv", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function importExternalInputJson(payload: {
  sourceId?: string;
  sourceType?: ExternalInputSourceType;
  sourceRef?: string;
  records?: Array<Record<string, unknown>>;
  data?: unknown;
  payload?: unknown;
  mappingRules: ExternalInputMappingRule[];
}) {
  return request<ExternalInputImportResponse>("/api/external-inputs/import/json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function mapExternalInputToSpu(payload: {
  sourceId: string;
  spuId: string;
  recordIndex?: number;
  inputs?: Record<string, unknown>;
  strict?: boolean;
}) {
  return request<ExternalInputMapResponse>("/api/external-inputs/map-to-spu", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function queryMappingByStake(stake: string) {
  return request<{ item: MappingEntry }>(`/api/mapping/by-stake?stake=${encodeURIComponent(stake)}`);
}

export function queryMappingMinimalByStake(stake: string) {
  return request<{ item: MappingMinimalStakeView }>(`/api/mapping/minimal/by-stake?stake=${encodeURIComponent(stake)}`);
}

export function queryMappingByContainerId(containerId: string) {
  return request<{ item: MappingEntry }>(`/api/mapping/container/${encodeURIComponent(containerId)}`);
}

export function queryMappingByNodeId(nodeId: string) {
  return request<{ item: MappingEntry }>(`/api/mapping/node/${encodeURIComponent(nodeId)}`);
}

export function createContainer(payload: {
  containerId?: string;
  projectId?: string;
  geoSlotRef: string;
  inspector?: string;
  supervisor?: string;
  autoBindSpuIds?: string[];
  autoBindSpuKeys?: string[];
}) {
  return request<{ container: SpaceContainer }>("/api/containers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listContainers() {
  return request<{ items: Array<{ container: SpaceContainer; nodes: ExecutionNode[]; slot: SpaceSlot | null }> }>("/api/containers");
}

export interface SchedulerNextResponse {
  containerId: string;
  input: CSDSchedulerInput;
  nextTasks: CSDNextExecutableTask[];
  decision: SchedulerDecision;
}

export function getSchedulerNext(containerId: string) {
  return request<SchedulerNextResponse>(`/api/scheduler/next?containerId=${encodeURIComponent(containerId)}`);
}

export interface RuntimeMinimalResponse {
  containerId: string;
  lifecycleState: SpaceContainer["lifecycleState"];
  overallStatus: SpaceContainer["overallStatus"];
  runtimePhase: SpaceContainer["runtime"]["phase"];
  spuStates: Array<{
    spuId: string;
    status: "blocked" | "ready" | "running" | "gate_pass" | "gate_fail" | "signing" | "pass" | "fail";
    dependsOn: string[];
    latestNodeId: string | null;
    latestNodeStatus: ExecutionNode["status"] | null;
  }>;
  nextSuggestion: {
    action: "EXECUTE" | "RETRY_FAILED" | "WAIT" | "ARCHIVE_READY";
    nextSpuId: string | null;
    reason: string;
    blockedBy: string[];
  };
}

export function getRuntimeMinimal(containerId: string) {
  return request<RuntimeMinimalResponse>(`/api/runtime/minimal/next?containerId=${encodeURIComponent(containerId)}`);
}

export interface ProjectSchedulerResponse extends ProjectScheduleDecision {
  input: ProjectSchedulerInput;
}

export function getProjectScheduler() {
  return request<ProjectSchedulerResponse>("/api/scheduler/project");
}

export interface RuntimeContainerModelResponse {
  container: RuntimeContainerModel;
  nodes: RuntimeNodeModel[];
  scheduler: {
    containerId: string;
    input: CSDSchedulerInput;
    tasks: Array<{
      spuId: string;
      status: CSDTaskStatus;
      priority: number;
      latestNodeId: string | null;
      dependsOn: string[];
      hardDependsOn: string[];
      softDependsOn: string[];
    }>;
    graph: {
      nodes: Array<{
        nodeId: string;
        spuId: string;
        priority: number;
        executionState: {
          status: "draft" | "ready" | "running" | "pass" | "failed" | "blocked";
        };
        executionStatus: "draft" | "ready" | "running" | "pass" | "failed" | "blocked";
      }>;
      edges: Array<{
        edgeId: string;
        fromNodeId: string;
        toNodeId: string;
        dependencyType: "hard" | "soft";
      }>;
    };
    nextExecutableNodes: Array<{
      nodeId: string;
      spuId: string;
      executionStatus: "ready" | "failed";
      action: "execute" | "retry_failed" | "partial_rerun";
      priority: number;
      reason: string;
      softDependencyWarnings: string[];
    }>;
    blockedNodes: Array<{
      nodeId: string;
      spuId: string;
      blockedByNodeIds: string[];
      reason: string;
    }>;
    schedulePlan: {
      stages: Array<{
        stage: number;
        mode: "parallel";
        nodeIds: string[];
        items: Array<{
          nodeId: string;
          spuId: string;
          executionStatus: "ready" | "failed";
          action: "execute" | "retry_failed" | "partial_rerun";
          priority: number;
          reason: string;
          softDependencyWarnings: string[];
        }>;
      }>;
      suggestedOrder: string[];
      blockedNodeIds: string[];
      parallelizableNodeGroups: string[][];
      cycleNodeIds: string[];
      hasCycle: boolean;
      partialRerun: {
        requestedNodeIds: string[];
        affectedNodeIds: string[];
        invalidatedNodeIds: string[];
      };
      summary: string;
    };
    nextTasks: CSDNextExecutableTask[];
    decision: SchedulerDecision;
  };
}

export function getRuntimeContainerModel(containerId: string) {
  return request<RuntimeContainerModelResponse>(`/api/runtime/containers/${encodeURIComponent(containerId)}/model`);
}

export interface RuntimeProjectExecuteResponse {
  generatedAt: string;
  input: ProjectSchedulerInput;
  decision: ProjectScheduleDecision;
}

export function projectExecute(input?: ProjectSchedulerInput) {
  return request<RuntimeProjectExecuteResponse>("/api/runtime/project-execute", {
    method: "POST",
    body: JSON.stringify(input ? { input } : {}),
  });
}

export function getContainer(containerId: string) {
  return request<{ container: SpaceContainer; nodes: ExecutionNode[] }>(`/api/containers/${encodeURIComponent(containerId)}`);
}

export function bindSpu(containerId: string, payload: { spuId?: string; spuKey?: string; projectId?: string }) {
  return request<{ container: SpaceContainer }>(`/api/containers/${encodeURIComponent(containerId)}/bind-spu`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function unbindSpu(containerId: string, payload: { spuId: string }) {
  return request<{ container: SpaceContainer }>(`/api/containers/${encodeURIComponent(containerId)}/unbind-spu`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createNode(payload: { containerId: string; spuId?: string; spuKey?: string; projectId?: string }) {
  return request<{
    node: ExecutionNode;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>("/api/nodes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface SpuVersionRecordResponse {
  spuKey: string;
  spuId: string;
  version: string;
  semanticVersion: {
    major: number;
    minor: number;
    patch: number;
  };
  compatibilityPolicy: "major_breaking" | "minor_backward_compatible" | "patch_hotfix";
  isLatest: boolean;
}

export interface NormDocListItem {
  key: string;
  normdocId?: string;
  packageId?: string;
  standardCode: string;
  standardName?: string;
  name?: string;
  version: string;
  bundleHash?: string;
  ruleCount?: number;
  componentCount?: number;
  sampleSpuKey: string;
  publishedAt: string;
  updatedAt: string;
  projectCustomized: boolean;
  availableItemCount: number;
  spuIds: string[];
  sampleSpuId: string;
  id?: string;
  published?: boolean;
  projectBoundCount?: number;
  status?: "draft" | "reviewed" | "published" | "deprecated";
  signedBy?: string | null;
}

export function listNormDocList() {
  return request<{ items: NormDocListItem[]; missingVersionCount: number }>("/api/rules");
}

interface RuleStoreEnvelope<T> {
  version?: string;
  status?: string;
  source?: string;
  data?: T;
}

interface RuleStoreNormDocRawItem {
  normdoc_id?: string;
  standard_code?: string;
  standard_name?: string;
  name?: string;
  version?: string;
  status?: "draft" | "reviewed" | "published" | "deprecated";
  bundle_hash?: string;
  rule_count?: number;
  component_count?: number;
  created_at?: string;
  published_at?: string | null;
  signed_by?: string | null;
  source?: string;
}

export interface RuleStoreNormDocDetail {
  normdoc: Record<string, unknown> | null;
  previews: {
    specMd: string;
    specJson: Record<string, unknown> | null;
    specirYaml: string;
  };
  rules: RuleStorePackageRuleItem[];
  components: Array<{ componentId: string; boundClauseIds: string[] }>;
  sourceClauses: string[];
}

export interface RuleStorePackageSummary {
  packageId: string;
  normdocId: string;
  name: string;
  version: string;
  itemsCount: number;
  status: "draft" | "reviewed" | "published" | "deprecated";
  source: string;
}

interface RuleStorePackageRawItem {
  package_id?: string;
  normdoc_id?: string;
  name?: string;
  version?: string;
  items_count?: number;
  status?: "draft" | "reviewed" | "published" | "deprecated";
  source?: string;
}

export interface RuleStorePackageRuleItem {
  ruleId: string;
  packageId: string;
  clauseId: string;
  clauseNo: string;
  clauseIds: string[];
  normdocId: string;
  ruleVersion: string;
  clause: string;
  itemName: string;
  required: boolean;
  inputFields: string[];
  condition: string;
  severity: string;
  sourceText: string;
  enabled: boolean;
  version: string;
  status: string;
  source: string;
}

interface RuleStorePackageRuleRawItem {
  rule_id?: string;
  package_id?: string;
  clause_id?: string;
  clause_no?: string;
  clause_ids?: string[];
  normdoc_id?: string;
  rule_version?: string;
  clause?: string;
  item_name?: string;
  required?: boolean;
  input_fields?: string[];
  condition?: string;
  severity?: string;
  source_text?: string;
  enabled?: boolean;
  version?: string;
  status?: string;
  source?: string;
}

interface ClauseSearchRawItem {
  clause_id?: string;
  clause_no?: string;
  title?: string;
  content?: string;
  explanation?: string | null;
  risk_note?: string | null;
  related_terms?: string[];
  generated_by_ai?: boolean;
  marked_reviewed?: boolean;
  explanation_notice?: string;
  standard_code?: string;
  normdoc_id?: string;
  version?: string;
  keywords?: string[];
  page?: number;
  score?: number;
}

export interface ClauseSearchItem {
  clauseId: string;
  clauseNo: string;
  title: string;
  content: string;
  explanation: string;
  riskNote: string;
  relatedTerms: string[];
  generatedByAi: boolean;
  markedReviewed: boolean;
  explanationNotice: string;
  standardCode: string;
  normdocId: string;
  version: string;
  keywords: string[];
  page: number | null;
  score: number;
}

export interface ClauseNeighborsResponse {
  current: ClauseSearchItem | null;
  previous: ClauseSearchItem | null;
  next: ClauseSearchItem | null;
}

function normalizeClauseSearchItem(raw: ClauseSearchRawItem | null | undefined): ClauseSearchItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const clauseId = String(raw.clause_id ?? raw.clause_no ?? "").trim();
  const clauseNo = String(raw.clause_no ?? raw.clause_id ?? "").trim();
  const relatedTerms = Array.isArray(raw.related_terms)
    ? raw.related_terms.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
  return {
    clauseId,
    clauseNo,
    title: String(raw.title ?? "").trim(),
    content: String(raw.content ?? "").trim(),
    explanation: String(raw.explanation ?? "").trim(),
    riskNote: String(raw.risk_note ?? "").trim(),
    relatedTerms,
    generatedByAi: Boolean(raw.generated_by_ai),
    markedReviewed: Boolean(raw.marked_reviewed),
    explanationNotice: String(raw.explanation_notice ?? "").trim(),
    standardCode: String(raw.standard_code ?? "").trim(),
    normdocId: String(raw.normdoc_id ?? "").trim(),
    version: String(raw.version ?? "").trim(),
    keywords,
    page: typeof raw.page === "number" && Number.isFinite(raw.page) ? raw.page : null,
    score: typeof raw.score === "number" && Number.isFinite(raw.score) ? raw.score : 0,
  };
}

export async function listRuleStoreNormdocs(): Promise<{
  items: NormDocListItem[];
  source: string;
  version: string;
  status: string;
}> {
  const payload = await request<RuleStoreEnvelope<{ items?: RuleStoreNormDocRawItem[] }>>("/api/rule-store/normdocs");
  const envelope = payload ?? {};
  const source = String(envelope.source ?? "Rule Store");
  const version = String(envelope.version ?? "public.v1");
  const status = String(envelope.status ?? "ok");
  const items = Array.isArray(envelope.data?.items) ? envelope.data.items : [];
  return {
    source,
    version,
    status,
    items: items.map((item, index) => {
      const normdocId = String(item.normdoc_id ?? "").trim();
      const standardCode = String(item.standard_code ?? "").trim() || "未标注标准";
      const versionText = String(item.version ?? "").trim() || "v1";
      const key = normdocId || `${standardCode}@@${versionText}#${index}`;
      return {
        key,
        id: key,
        normdocId: normdocId || key,
        standardCode,
        standardName: String(item.standard_name ?? "").trim() || String(item.name ?? "").trim() || standardCode,
        name: String(item.name ?? "").trim() || standardCode,
        version: versionText,
        bundleHash: String(item.bundle_hash ?? "").trim(),
        ruleCount: typeof item.rule_count === "number" && Number.isFinite(item.rule_count) ? item.rule_count : 0,
        componentCount: typeof item.component_count === "number" && Number.isFinite(item.component_count) ? item.component_count : 0,
        sampleSpuKey: "",
        publishedAt: String(item.published_at ?? "").trim() || "-",
        updatedAt: String(item.created_at ?? "").trim() || "-",
        projectCustomized: false,
        availableItemCount: 0,
        spuIds: [],
        sampleSpuId: "",
        published: item.status === "published",
        status: item.status ?? "published",
        signedBy: item.signed_by ?? null,
      };
    }),
  };
}

export function publishRuleStoreNormdoc(payload: {
  normdoc_id: string;
  signed_by?: string;
}) {
  return request<RuleStoreEnvelope<{ item?: unknown }>>(
    `/api/rule-store/normdocs/${encodeURIComponent(payload.normdoc_id.trim())}/publish`,
    {
      method: "POST",
      body: JSON.stringify({
        signed_by: payload.signed_by,
      }),
    },
  );
}

export function deprecateRuleStoreNormdoc(payload: {
  normdoc_id: string;
  signed_by?: string;
}) {
  return request<RuleStoreEnvelope<{ item?: unknown }>>(
    `/api/rule-store/normdocs/${encodeURIComponent(payload.normdoc_id.trim())}/deprecate`,
    {
      method: "POST",
      body: JSON.stringify({
        signed_by: payload.signed_by,
      }),
    },
  );
}

export function rollbackRuleStoreNormdoc(payload: {
  standard_code: string;
  target_normdoc_id: string;
  signed_by?: string;
}) {
  return request<RuleStoreEnvelope<{ item?: unknown; deprecated?: unknown[] }>>("/api/rule-store/rollback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getRuleStoreNormdocDetail(normdocId: string): Promise<RuleStoreNormDocDetail> {
  const payload = await request<
    RuleStoreEnvelope<{
      item?: {
        normdoc?: Record<string, unknown>;
        previews?: {
          spec_md?: string;
          spec_json?: Record<string, unknown>;
          specir_yaml?: string;
        };
        rules?: RuleStorePackageRuleRawItem[];
        components?: Array<{ component_id?: string; bound_clause_ids?: string[] }>;
        source_clauses?: string[];
      };
    }>
  >(`/api/rule-store/normdocs/${encodeURIComponent(normdocId.trim())}`);
  const raw = payload?.data?.item;
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  return {
    normdoc: raw?.normdoc ?? null,
    previews: {
      specMd: String(raw?.previews?.spec_md ?? "").trim(),
      specJson: raw?.previews?.spec_json ?? null,
      specirYaml: String(raw?.previews?.specir_yaml ?? "").trim(),
    },
    rules: rules.map((item) => {
      const clause = String(item.clause ?? "").trim();
      const clauseId = String(item.clause_id ?? "").trim() || clause;
      const clauseNo = String(item.clause_no ?? "").trim() || clause || clauseId;
      const clauseIds = Array.isArray(item.clause_ids)
        ? item.clause_ids.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [];
      const versionText = String(item.version ?? "").trim();
      return {
        ruleId: String(item.rule_id ?? "").trim(),
        packageId: String(item.package_id ?? "").trim(),
        clauseId,
        clauseNo,
        clauseIds: clauseIds.length > 0 ? clauseIds : [clauseId].filter(Boolean),
        normdocId: String(item.normdoc_id ?? "").trim(),
        ruleVersion: String(item.rule_version ?? "").trim() || versionText,
        clause,
        itemName: String(item.item_name ?? "").trim(),
        required: item.required !== false,
        inputFields: Array.isArray(item.input_fields) ? item.input_fields.map((field) => String(field ?? "").trim()).filter(Boolean) : [],
        condition: String(item.condition ?? "").trim(),
        severity: String(item.severity ?? "").trim(),
        sourceText: String(item.source_text ?? "").trim(),
        enabled: item.enabled !== false,
        version: versionText,
        status: String(item.status ?? "").trim() || "published",
        source: String(item.source ?? "Rule Store"),
      };
    }),
    components: Array.isArray(raw?.components)
      ? raw.components.map((component) => ({
        componentId: String(component.component_id ?? "").trim(),
        boundClauseIds: Array.isArray(component.bound_clause_ids)
          ? component.bound_clause_ids.map((id) => String(id ?? "").trim()).filter(Boolean)
          : [],
      }))
      : [],
    sourceClauses: Array.isArray(raw?.source_clauses)
      ? raw.source_clauses.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
  };
}

export async function listRuleStorePackages(params?: {
  normdocId?: string;
}): Promise<{
  items: RuleStorePackageSummary[];
  source: string;
  version: string;
  status: string;
}> {
  const query = new URLSearchParams();
  if (params?.normdocId?.trim()) {
    query.set("normdoc_id", params.normdocId.trim());
  }
  const payload = await request<RuleStoreEnvelope<{ items?: RuleStorePackageRawItem[] }>>(
    `/api/rule-store/packages${query.toString() ? `?${query.toString()}` : ""}`,
  );
  const envelope = payload ?? {};
  const source = String(envelope.source ?? "Rule Store");
  const version = String(envelope.version ?? "public.v1");
  const status = String(envelope.status ?? "ok");
  const items = Array.isArray(envelope.data?.items) ? envelope.data.items : [];
  return {
    source,
    version,
    status,
    items: items.map((item) => ({
      packageId: String(item.package_id ?? "").trim(),
      normdocId: String(item.normdoc_id ?? "").trim(),
      name: String(item.name ?? "").trim(),
      version: String(item.version ?? "").trim(),
      itemsCount: typeof item.items_count === "number" && Number.isFinite(item.items_count) ? item.items_count : 0,
      status: item.status ?? "published",
      source: String(item.source ?? source),
    })),
  };
}

export async function listRuleStorePackageRules(packageId: string): Promise<{
  package: RuleStorePackageSummary | null;
  items: RuleStorePackageRuleItem[];
  source: string;
  version: string;
  status: string;
}> {
  const payload = await request<
    RuleStoreEnvelope<{
      package?: RuleStorePackageRawItem;
      items?: RuleStorePackageRuleRawItem[];
    }>
  >(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`);
  const envelope = payload ?? {};
  const source = String(envelope.source ?? "Rule Store");
  const version = String(envelope.version ?? "public.v1");
  const status = String(envelope.status ?? "ok");
  const packageRaw = envelope.data?.package;
  const packageSummary: RuleStorePackageSummary | null = packageRaw
    ? {
      packageId: String(packageRaw.package_id ?? "").trim(),
      normdocId: String(packageRaw.normdoc_id ?? "").trim(),
      name: String(packageRaw.name ?? "").trim(),
      version: String(packageRaw.version ?? "").trim(),
      itemsCount: typeof packageRaw.items_count === "number" && Number.isFinite(packageRaw.items_count) ? packageRaw.items_count : 0,
      status: packageRaw.status ?? "published",
      source: String(packageRaw.source ?? source),
    }
    : null;
  const items = Array.isArray(envelope.data?.items) ? envelope.data.items : [];
  return {
    package: packageSummary,
    source,
    version,
    status,
    items: items.map((item) => {
      const clause = String(item.clause ?? "").trim();
      const clauseId = String(item.clause_id ?? "").trim() || clause;
      const clauseNo = String(item.clause_no ?? "").trim() || clause || clauseId;
      const clauseIds = Array.isArray(item.clause_ids)
        ? item.clause_ids.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : [];
      const versionText = String(item.version ?? "").trim();
      return {
        ruleId: String(item.rule_id ?? "").trim(),
        packageId: String(item.package_id ?? "").trim(),
        clauseId,
        clauseNo,
        clauseIds: clauseIds.length > 0 ? clauseIds : [clauseId].filter(Boolean),
        normdocId: String(item.normdoc_id ?? "").trim(),
        ruleVersion: String(item.rule_version ?? "").trim() || versionText,
        clause,
        itemName: String(item.item_name ?? "").trim(),
        required: item.required !== false,
        inputFields: Array.isArray(item.input_fields) ? item.input_fields.map((field) => String(field ?? "").trim()).filter(Boolean) : [],
        condition: String(item.condition ?? "").trim(),
        severity: String(item.severity ?? "").trim(),
        sourceText: String(item.source_text ?? "").trim(),
        enabled: item.enabled !== false,
        version: versionText,
        status: String(item.status ?? "").trim() || "published",
        source: String(item.source ?? source),
      };
    }),
  };
}

export async function searchClauses(params: {
  q: string;
  standardCode?: string;
  version?: string;
  limit?: number;
}): Promise<{
  query: string;
  results: ClauseSearchItem[];
}> {
  const query = new URLSearchParams();
  query.set("q", params.q.trim());
  if (params.standardCode?.trim()) {
    query.set("standard_code", params.standardCode.trim());
  }
  if (params.version?.trim()) {
    query.set("version", params.version.trim());
  }
  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(params.limit)));
    query.set("limit", String(boundedLimit));
  }
  const payload = await request<{ query?: string; results?: ClauseSearchRawItem[] }>(
    `/api/clauses/search?${query.toString()}`,
  );
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];
  const results = rawResults
    .map((item) => normalizeClauseSearchItem(item))
    .filter((item): item is ClauseSearchItem => item !== null);
  return {
    query: String(payload?.query ?? params.q).trim(),
    results,
  };
}

export async function getClauseNeighbors(
  clauseId: string,
  params?: {
    normdocId?: string;
    version?: string;
  },
): Promise<ClauseNeighborsResponse> {
  const targetClauseId = clauseId.trim();
  const query = new URLSearchParams();
  if (params?.normdocId?.trim()) {
    query.set("normdoc_id", params.normdocId.trim());
  }
  if (params?.version?.trim()) {
    query.set("version", params.version.trim());
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const payload = await request<{
    current?: ClauseSearchRawItem | null;
    previous?: ClauseSearchRawItem | null;
    next?: ClauseSearchRawItem | null;
  }>(`/api/clauses/${encodeURIComponent(targetClauseId)}/neighbors${suffix}`);
  return {
    current: normalizeClauseSearchItem(payload?.current),
    previous: normalizeClauseSearchItem(payload?.previous),
    next: normalizeClauseSearchItem(payload?.next),
  };
}

export interface RuleStoreVersionSnapshot {
  spuKey: string;
  spuId: string;
  version: string;
  semanticVersion: {
    major: number;
    minor: number;
    patch: number;
  };
  compatibilityPolicy: "major_breaking" | "minor_backward_compatible" | "patch_hotfix";
  isLatest: boolean;
  isProjectBound: boolean;
}

export interface RuleStoreVersionBundle {
  spuKey: string;
  versions: RuleStoreVersionSnapshot[];
  projectBinding?: ProjectSpuVersionBinding | null;
  bindingHistory?: ProjectSpuVersionBinding[];
}

export function listRules(params?: { projectId?: string }) {
  const query = new URLSearchParams();
  if (params?.projectId?.trim()) {
    query.set("projectId", params.projectId.trim());
  }
  return request<{ items: NormDocListItem[]; missingVersionCount: number; source?: string }>(
    `/api/rules${query.toString() ? `?${query.toString()}` : ""}`,
  );
}

export function getRuleById(ruleId: string, params?: { projectId?: string; includeHistory?: boolean }) {
  const query = new URLSearchParams();
  if (params?.projectId?.trim()) {
    query.set("projectId", params.projectId.trim());
  }
  if (typeof params?.includeHistory === "boolean") {
    query.set("includeHistory", params.includeHistory ? "true" : "false");
  }
  return request<{
    item: NormDocListItem & { spuKeys: string[] };
    versions: RuleStoreVersionSnapshot[];
    projectBindings: ProjectSpuVersionBinding[];
    bindingHistory?: ProjectSpuVersionBinding[];
    projectId?: string | null;
  }>(`/api/rules/${encodeURIComponent(ruleId)}${query.toString() ? `?${query.toString()}` : ""}`);
}

export function listRuleVersions(params?: {
  spuKey?: string;
  id?: string;
  projectId?: string;
  includeHistory?: boolean;
}) {
  const query = new URLSearchParams();
  if (params?.spuKey?.trim()) {
    query.set("spuKey", params.spuKey.trim());
  }
  if (params?.id?.trim()) {
    query.set("id", params.id.trim());
  }
  if (params?.projectId?.trim()) {
    query.set("projectId", params.projectId.trim());
  }
  if (typeof params?.includeHistory === "boolean") {
    query.set("includeHistory", params.includeHistory ? "true" : "false");
  }
  return request<{ items: RuleStoreVersionBundle[]; projectId?: string | null }>(
    `/api/rules/version${query.toString() ? `?${query.toString()}` : ""}`,
  );
}

export function listSpuVersionRecords(spuKey?: string) {
  const query = spuKey?.trim() ? `?spuKey=${encodeURIComponent(spuKey.trim())}` : "";
  return request<{ items: SpuVersionRecordResponse[] }>(`/api/registry/spu-versions${query}`);
}

export function publishSpuVersion(definition: SPUDefinition) {
  return request<{ item: SPUDefinition }>("/api/registry/spu-versions/publish", {
    method: "POST",
    body: JSON.stringify({ definition }),
  });
}

export function bindProjectSpuVersion(payload: {
  projectId: string;
  spuKey: string;
  selector?: { spuId?: string; version?: string; major?: number; minor?: number; patch?: number; latest?: boolean };
  note?: string;
}) {
  return request<{ binding: ProjectSpuVersionBinding }>("/api/versioning/projects/bind", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rollbackProjectSpuVersion(payload: {
  projectId: string;
  spuKey: string;
  targetVersion: string;
  note?: string;
}) {
  return request<{ binding: ProjectSpuVersionBinding }>("/api/versioning/projects/rollback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listProjectSpuBindings(projectId: string) {
  return request<{ items: ProjectSpuVersionBinding[] }>(`/api/versioning/projects/${encodeURIComponent(projectId)}/bindings`);
}

export function getProjectEffectiveVersion(projectId: string, spuKey: string) {
  return request<{ item: { source: "project_binding" | "latest"; spuId: string; version: string } | null }>(
    `/api/versioning/projects/${encodeURIComponent(projectId)}/effective?spuKey=${encodeURIComponent(spuKey)}`,
  );
}

export function upsertProjectContext(payload: {
  projectId: string;
  overrides?: {
    global?: Record<string, unknown>;
    bySpuKey?: Record<string, Record<string, unknown>>;
    bySpuId?: Record<string, Record<string, unknown>>;
  };
}) {
  return request<{ item: ProjectContext }>("/api/projects/context", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listProjectContexts() {
  return request<{ items: ProjectContextSummary[] }>("/api/projects");
}

export function getProjectContext(projectId: string) {
  return request<{ item: ProjectContext }>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export function getSpuVersionDiff(payload: { fromSpuId: string; toSpuId: string }) {
  return request<{
    diff: {
      spuKey: string;
      fromSpuId: string;
      toSpuId: string;
      fromVersion: string;
      toVersion: string;
      addedFields: {
        inputs: string[];
        outputs: string[];
      };
      ruleChanges: {
        added: string[];
        removed: string[];
        changed: Array<{
          ruleId: string;
          before: { field: string; operator: string; threshold: unknown };
          after: { field: string; operator: string; threshold: unknown };
        }>;
      };
      thresholdChanges: Array<{
        ruleId: string;
        before: unknown;
        after: unknown;
      }>;
    };
  }>("/api/versioning/spu-diff", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type SpecPatchExecutionRecordType = "node" | "container_proof";

export interface SpecPatchAffectedExecution {
  recordId: string;
  recordType: SpecPatchExecutionRecordType;
  proofId: string | null;
  nodeId: string | null;
  containerId: string | null;
  spuId: string;
  status: string;
  matchedSpecVersion: string | null;
  finalizedAt: string | null;
  invalidated: boolean;
}

export interface SpecPatchPendingRetest {
  containerId: string;
  projectId: string | null;
  oldSpuId: string;
  newSpuId: string;
  bindingStatus: "DRAFT" | "RUNNING" | "PASS" | "FAIL";
  latestNodeId: string | null;
  latestProofId: string | null;
  canAutoRerun: boolean;
  reason: string;
}

export interface SpecPatchSummary {
  affectedSpuCount: number;
  affectedProjectCount: number;
  affectedExecutionCount: number;
  invalidatedExecutionCount: number;
  pendingRetestCount: number;
  autoRerunReadyCount: number;
}

export interface SpecUpdatePatchRecord {
  patchId: string;
  spuKey: string;
  oldSpuId: string;
  oldVersion: string;
  newSpuId: string;
  newVersion: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  lastRerunAt: string | null;
  invalidatePreviousResults: boolean;
  diffSummary: {
    spuKey: string;
    fromSpuId: string;
    toSpuId: string;
    fromVersion: string;
    toVersion: string;
    addedFields: {
      inputs: string[];
      outputs: string[];
    };
    ruleChanges: {
      added: string[];
      removed: string[];
      changed: Array<{
        ruleId: string;
        before: { field: string; operator: string; threshold: unknown };
        after: { field: string; operator: string; threshold: unknown };
      }>;
    };
    thresholdChanges: Array<{
      ruleId: string;
      before: unknown;
      after: unknown;
    }>;
  };
  specImpactAnalysis: SpecImpactAnalysis;
  affectedSpuIds: string[];
  affectedProjectIds: string[];
  affectedExecutions: SpecPatchAffectedExecution[];
  pendingRetests: SpecPatchPendingRetest[];
  summary: SpecPatchSummary;
}

export interface SpecPatchRerunItemResult {
  containerId: string;
  projectId: string | null;
  oldSpuId: string;
  newSpuId: string;
  status: "rerun_triggered" | "skipped" | "failed";
  reason: string;
  nodeId: string | null;
  finalNodeStatus: ExecutionNode["status"] | null;
}

export interface SpecPatchRerunResult {
  patchId: string;
  startedAt: string;
  completedAt: string;
  items: SpecPatchRerunItemResult[];
  summary: {
    totalCandidates: number;
    rerunTriggered: number;
    skipped: number;
    failed: number;
  };
}

export function applySpecPatch(payload: {
  oldSpuId: string;
  newDefinition: SPUDefinition;
  note?: string;
  invalidatePreviousResults?: boolean;
}) {
  return request<{ patch: SpecUpdatePatchRecord }>("/api/versioning/spec-patches/apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listSpecUpdatePatches() {
  return request<{ items: SpecUpdatePatchRecord[] }>("/api/versioning/spec-patches");
}

export function getSpecUpdatePatch(patchId: string) {
  return request<{ item: SpecUpdatePatchRecord }>(`/api/versioning/spec-patches/${encodeURIComponent(patchId)}`);
}

export function rerunSpecUpdatePatch(payload: {
  patchId: string;
  autoSignRequired?: boolean;
  maxItems?: number;
}) {
  return request<{ result: SpecPatchRerunResult }>(
    `/api/versioning/spec-patches/${encodeURIComponent(payload.patchId)}/rerun`,
    {
      method: "POST",
      body: JSON.stringify({
        autoSignRequired: payload.autoSignRequired,
        maxItems: payload.maxItems,
      }),
    },
  );
}

export interface GateEvaluateRequestPayload {
  rule_id: string;
  rule_version: string;
  containerId?: string;
  nodeId?: string;
  inputs: Record<string, unknown>;
  context: Record<string, unknown>;
  externalInput?: {
    sourceId?: string;
    recordIndex?: number;
    strict?: boolean;
  };
}

export interface ExecutorRunRequestPayload {
  rule_id: string;
  rule_version: string;
  inputs: Record<string, unknown>;
  context: {
    project_id: string;
    point: string;
    user_id: string;
    [key: string]: unknown;
  };
}

export interface ExecutorAggregateRunRequestPayload {
  query?: string;
  context?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
}

export interface ExecutorAggregateItemResult {
  item_key: "compaction" | "thickness" | "deflection";
  item_name: string;
  required: boolean;
  status: "PASS" | "FAIL" | "INCOMPLETE";
  rule_id: string | null;
  rule_version: string | null;
  result: "PASS" | "FAIL" | null;
  reason: string | null;
  missing_inputs: string[];
}

export interface ExecutorAggregateProofRef {
  item_key: "compaction" | "thickness" | "deflection";
  proof_id: string | null;
  execution_id: string | null;
  rule_id: string | null;
  rule_version: string | null;
  result: "PASS" | "FAIL" | null;
}

export interface ExecutorAggregateRunResponse {
  overall: "PASS" | "FAIL" | "INCOMPLETE";
  item_results: ExecutorAggregateItemResult[];
  proof_refs: ExecutorAggregateProofRef[];
}

export interface GateEvaluateResponse {
  status: "PASS" | "FAIL";
  result_code?: "PASS" | "FAIL";
  rule_id?: string;
  rule_version?: string;
  evidence?: {
    standard_code: string;
    clause_no: string;
    clause_title: string;
    clause_id: string;
    clause_content?: string;
  };
  gateDecision?: "PASS" | "BLOCK" | "OVERRIDE";
  result: {
    executionId: string;
    passed: boolean;
    outcome: "PASS" | "FAIL" | "BLOCK";
    gateStatus: "PASS" | "FAIL" | "BLOCK";
    gateDecision?: "PASS" | "BLOCK" | "OVERRIDE";
    outputs: Record<string, unknown>;
  };
  explanation: string;
  matchedRules: Array<{
    ruleId: string;
    condition?: string;
    passed: boolean;
    severity?: string;
    message?: string;
    actual?: unknown;
    expected?: unknown;
  }>;
  statePatch: {
    nodeId: string;
    nodeStatus: ExecutionNode["status"];
    containerId: string | null;
    containerLifecycleState: SpaceContainer["lifecycleState"] | null;
    containerOverallStatus: SpaceContainer["overallStatus"] | null;
  };
  proofFragment: ProofFragment;
  node: ExecutionNode;
  externalInputMapping?: {
    sourceId: string;
    recordIndex: number;
    missingInputs: string[];
    validationStatus: "valid" | "warning" | "invalid";
    record: Record<string, unknown>;
  } | null;
  layerPegDocument?: LayerPegDocument | null;
  standardOutput?: LayerPegStandardOutput | null;

  // Compatibility fields for legacy callers.
  executionId: string;
  spuId: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  trace: ExecutionNode["trace"];
  gateResults: ExecutionNode["gate"]["results"];
  proof: ExecutionNode["proof"] | null;
  calculation: ExecutionNode["trace"];
}

export function evaluateGate(payload: GateEvaluateRequestPayload) {
  return request<GateEvaluateResponse>("/api/gate/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runExecutor(payload: ExecutorRunRequestPayload) {
  return request<GateEvaluateResponse>("/api/executor/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runExecutorByNormdoc(payload: {
  normdoc_id: string;
  component_id: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
}) {
  return request<GateEvaluateResponse>("/api/executor/run-by-normdoc", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runExecutorAggregate(payload: ExecutorAggregateRunRequestPayload) {
  return request<ExecutorAggregateRunResponse>("/api/executor/aggregate-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface GateBatchEvaluateItemPayload extends GateEvaluateRequestPayload {
  itemId?: string;
}

export interface GateBatchExecutionOptions {
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface GateBatchExecutionPerformanceMetrics {
  workerPool: {
    poolSize: number;
    peakQueueSize: number;
    submittedTasks: number;
    completedTasks: number;
  };
  timeoutMs: number | null;
  maxRetries: number;
  retryCount: number;
  timeoutCount: number;
  latency: {
    avgMs: number;
    p95Ms: number;
    maxMs: number;
  };
  throughput: {
    itemsPerSecond: number;
  };
  failureRate: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface GateBatchEvaluateResponse {
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    proofReferences: Array<{
      itemId: string;
      index: number;
      executionId: string;
      nodeId: string;
      spuId: string;
      containerId: string | null;
      proofFragmentKind: ProofFragment["kind"];
      proofFragmentStatus: ProofFragment["status"];
      proofId: string | null;
      proofHash: string | null;
    }>;
  };
  items: Array<{
    itemId: string;
    index: number;
    status: "PASS" | "FAIL" | "BLOCKED" | "ERROR";
    response?: GateEvaluateResponse;
    error?: {
      code: "GATE_REQUEST_INVALID" | "GATE_DEPENDENCY_UNMET" | "GATE_EXECUTION_FAILED";
      statusCode: number;
      message: string;
    };
  }>;
  externalInputMappings?: Array<{
    itemId: string;
    sourceId: string;
    recordIndex: number;
    missingInputs: string[];
    validationStatus: "valid" | "warning" | "invalid";
  }>;
  performance?: GateBatchExecutionPerformanceMetrics;
}

export function evaluateGateBatch(payload: {
  items: GateBatchEvaluateItemPayload[];
  executionOptions?: GateBatchExecutionOptions;
}) {
  return request<GateBatchEvaluateResponse>("/api/gate/batch-evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitNode(nodeId: string, inputs: Record<string, unknown>) {
  return request<{
    node: ExecutionNode;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/nodes/${encodeURIComponent(nodeId)}/submit`, {
    method: "POST",
    body: JSON.stringify({ inputs }),
  });
}

export function signNode(nodeId: string, role: string) {
  return request<{
    node: ExecutionNode;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/nodes/${encodeURIComponent(nodeId)}/sign`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

export interface AnchorStepRequest {
  enabled?: boolean;
  providerName?: string;
}

export interface AnchorProviderStatusResponse {
  providerName: string;
  state: "ready" | "degraded" | "offline";
  submittedCount: number;
  verifiedCount: number;
  message?: string;
}

export interface AnchorVerifyResponse {
  providerName: string;
  anchorRef: string;
  hash: string | null;
  anchoredAt: string | null;
  status: "ANCHORED" | "NOT_FOUND";
}

export interface ProofChainLineageEntryResponse {
  proofId: string;
  proofHash: string;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  timestamp: string;
}

export interface ProofDependencyCheckResponse {
  dependency: {
    proofId: string;
    proofHash: string;
    source: "node" | "container";
    nodeId: string | null;
    containerId: string | null;
    timestamp: string;
  };
  exists: boolean;
  hashMatched: boolean | null;
}

export interface ProofVerifyResponse {
  proofId: string;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  chainId: string | null;
  verified: boolean;
  hashMatched: boolean;
  chainVerified: boolean;
  anchorVerified: boolean | null;
  storedHash: string | null;
  computedHash: string;
  previousProofId: string | null;
  previousProofHash: string | null;
  dependencies: ProofDependencyCheckResponse[];
  lineage: ProofChainLineageEntryResponse[];
  issues: string[];
  anchorCheck: AnchorVerifyResponse | null;
}

export function finalizeNode(nodeId: string, options?: { anchor?: AnchorStepRequest }) {
  return request<{
    node: ExecutionNode;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/nodes/${encodeURIComponent(nodeId)}/finalize`, {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
}

export function archiveContainer(containerId: string, options?: { anchor?: AnchorStepRequest }) {
  return request<{
    proof: ContainerProof;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/containers/${encodeURIComponent(containerId)}/archive`, {
    method: "POST",
    body: JSON.stringify(options ?? {}),
  });
}

export function listAnchorProviders() {
  return request<{ items: AnchorProviderStatusResponse[] }>("/api/anchors/providers");
}

export function verifyAnchor(payload: { anchorRef: string; providerName?: string }) {
  return request<{ result: AnchorVerifyResponse }>("/api/anchors/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyProof(payload: {
  nodeId?: string;
  containerId?: string;
  proofId?: string;
  verifyAnchor?: boolean;
  providerName?: string;
}) {
  return request<{ result: ProofVerifyResponse }>("/api/proof/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ProofReplayResponse {
  matched: boolean;
  original_result: string;
  replay_result: string;
}

export function replayProof(payload: { proof_id: string }) {
  return request<ProofReplayResponse>("/api/proof/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface NormVersionCompareRequestPayload {
  old_spec_id?: string;
  new_spec_id?: string;
  old_spec?: Record<string, unknown>;
  new_spec?: Record<string, unknown>;
}

export interface NormVersionCompareResponse {
  schema: Record<string, unknown>;
  meta: {
    generated_at: string;
    old_spec_id: string;
    new_spec_id: string;
  };
  catalog_diff: Record<string, unknown>;
  specir_diff: Record<string, unknown>;
  rule_diff: Record<string, unknown>;
  gate_diff: Record<string, unknown>;
  slot_diff: Record<string, unknown>;
  impact_preview: Record<string, unknown>;
  compare_algorithm: Record<string, unknown>;
  impact_analysis_pipeline: Record<string, unknown>;
}

export function compareNormVersions(payload: NormVersionCompareRequestPayload) {
  return request<NormVersionCompareResponse>("/api/v1/norm/version/compare", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface RuleImpactAnalysisRequestPayload {
  specir_id: string;
  rule_id: string;
  gate_id: string;
  slotKey: string;
}

export interface RuleImpactAnalysisResponse {
  schema: Record<string, unknown>;
  meta: Record<string, unknown>;
  dependency_graph: Record<string, unknown>;
  propagation_algorithm: Record<string, unknown>;
  upstream_trace: Record<string, unknown>;
  downstream_impacts: Record<string, unknown>;
  impact_summary: Record<string, unknown>;
  page_plan: Record<string, unknown>;
}

export function analyzeRuleImpact(payload: RuleImpactAnalysisRequestPayload) {
  return request<RuleImpactAnalysisResponse>("/api/v1/rule/impact-analysis", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface GoldenBaselineSchemaResponse {
  schema: Record<string, unknown>;
}

export interface GoldenBaselineUpsertPayload {
  form_code: string;
  baseline_rulepack: Record<string, unknown>;
  baseline_runtime_result: Record<string, unknown>;
  baseline_publish_result: Record<string, unknown>;
  sample_input?: Record<string, unknown>;
}

export interface GoldenRegressionCheckPayload {
  form_code: string;
  candidate_rulepack: Record<string, unknown>;
  candidate_publish_result?: Record<string, unknown>;
}

export interface GoldenRegressionReport {
  schema?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  checks?: Array<Record<string, unknown>>;
  gate?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getGoldenBaselineSchema() {
  return request<GoldenBaselineSchemaResponse>("/api/v1/golden/baseline/schema");
}

export function upsertGoldenBaseline(payload: GoldenBaselineUpsertPayload) {
  return request<{ item: Record<string, unknown> }>("/api/v1/golden/baseline/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runGoldenRegressionCheck(payload: GoldenRegressionCheckPayload) {
  return request<GoldenRegressionReport>("/api/v1/golden/regression/check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface RuleTestRunPayload {
  form_code: string;
  rulepack: Record<string, unknown>;
  pass_rate_threshold: number;
}

export interface RuleTestReport {
  schema?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  sandbox_strategy?: Record<string, unknown>;
  runtime_validator?: Record<string, unknown>;
  rule_tests?: Array<Record<string, unknown>>;
  gate_tests?: Array<Record<string, unknown>>;
  executor_tests?: Array<Record<string, unknown>>;
  summary?: Record<string, unknown>;
  page_plan?: Record<string, unknown>;
  [key: string]: unknown;
}

export function runRuleTestFramework(payload: RuleTestRunPayload) {
  return request<RuleTestReport>("/api/v1/rule-test/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface RuntimeObservabilitySchemaResponse {
  schema: Record<string, unknown>;
}

export interface RuntimeMetricsResponse {
  schema?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  top_failing_rules?: Array<Record<string, unknown>>;
  event_model?: Record<string, unknown>;
  metrics_pipeline?: Record<string, unknown>;
  generated_at?: string;
  [key: string]: unknown;
}

export function getRuntimeObservabilitySchema() {
  return request<RuntimeObservabilitySchemaResponse>("/api/v1/runtime/observability/schema");
}

export function getRuntimeMetrics(params?: {
  form_code?: string;
  rulepack_version?: string;
  project_id?: string;
}) {
  const query = new URLSearchParams();
  if (params?.form_code?.trim()) query.set("form_code", params.form_code.trim());
  if (params?.rulepack_version?.trim()) query.set("rulepack_version", params.rulepack_version.trim());
  if (params?.project_id?.trim()) query.set("project_id", params.project_id.trim());
  const suffix = query.toString();
  return request<RuntimeMetricsResponse>(`/api/v1/runtime/metrics${suffix ? `?${suffix}` : ""}`);
}

export interface RuleHeatmapResponse {
  meta?: Record<string, unknown>;
  heatmap_metrics?: Record<string, unknown>;
  aggregation_pipeline?: Record<string, unknown>;
  top_risky_rules?: Array<Record<string, unknown>>;
  most_failing_gates?: Array<Record<string, unknown>>;
  most_overridden_rules?: Array<Record<string, unknown>>;
  page_plan?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getRuleHeatmap(params?: {
  standard?: string;
  form_code?: string;
  project?: string;
}) {
  const query = new URLSearchParams();
  if (params?.standard?.trim()) query.set("standard", params.standard.trim());
  if (params?.form_code?.trim()) query.set("form_code", params.form_code.trim());
  if (params?.project?.trim()) query.set("project", params.project.trim());
  const suffix = query.toString();
  return request<RuleHeatmapResponse>(`/api/v1/runtime/rule-heatmap${suffix ? `?${suffix}` : ""}`);
}

export interface AIRepairSuggestPayload {
  form_code: string;
  source_clause: string;
  specir: Record<string, unknown>;
  unresolved_reason: string;
  nearby_resolved_rules: Array<Record<string, unknown>>;
  slot_registry: Array<Record<string, unknown>>;
}

export interface AIRepairSuggestResponse {
  ai_repair_schema?: Record<string, unknown>;
  suggestion_payload?: Record<string, unknown>;
  review_queue_item?: Record<string, unknown>;
  patch_workflow?: Record<string, unknown>;
}

export interface AIRepairReviewActionPayload {
  patch_id: string;
  action: "accept_patch" | "reject_suggestion" | "manual_edit";
  manual_edit?: Record<string, unknown>;
}

export function getAIRepairSchema() {
  return request<{ schema: Record<string, unknown> }>("/api/v1/ai-repair/schema");
}

export function suggestAIRepair(payload: AIRepairSuggestPayload) {
  return request<AIRepairSuggestResponse>("/api/v1/ai-repair/suggest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAIRepairReviewQueue() {
  return request<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-repair/review-queue");
}

export function runAIRepairReviewAction(payload: AIRepairReviewActionPayload) {
  return request<{ item: Record<string, unknown> }>("/api/v1/ai-repair/review-action", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface MultiStandardFusionResponse {
  meta?: Record<string, unknown>;
  priority_strategy?: Record<string, unknown>;
  fusion_engine?: Record<string, unknown>;
  conflict_resolver?: Record<string, unknown>;
  fused_rules?: Array<Record<string, unknown>>;
  page_plan?: Record<string, unknown>;
  [key: string]: unknown;
}

export function runMultiStandardFusion(payload: {
  standards: Array<Record<string, unknown>>;
}) {
  return request<MultiStandardFusionResponse>("/api/v1/fusion/multi-standard", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface KnowledgeGraphResponse {
  schema?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  edge_model?: Record<string, unknown>;
  page_plan?: Record<string, unknown>;
  [key: string]: unknown;
}

export function buildKnowledgeGraph(payload?: { specs?: Array<Record<string, unknown>> }) {
  return request<KnowledgeGraphResponse>("/api/v1/knowledge-graph/build", {
    method: "POST",
    body: JSON.stringify(payload ?? { specs: [] }),
  });
}

export function getKnowledgeGraphSchema() {
  return request<{ graph_schema: Record<string, unknown> }>("/api/v1/knowledge-graph/schema");
}

export function queryKnowledgeGraph(payload: { node_type?: string; keyword?: string }) {
  return request<Record<string, unknown>>("/api/v1/knowledge-graph/query", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function traverseKnowledgeGraph(payload: { start_node_id: string; max_depth?: number }) {
  return request<Record<string, unknown>>("/api/v1/knowledge-graph/traverse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function semanticSearchKnowledgeGraph(payload: { query: string; limit?: number }) {
  return request<Record<string, unknown>>("/api/v1/knowledge-graph/semantic-search", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSlotUsageKnowledgeGraph(slotKey: string) {
  const query = new URLSearchParams();
  query.set("slotKey", slotKey);
  return request<Record<string, unknown>>(`/api/v1/knowledge-graph/slot-usage?${query.toString()}`);
}

export function getKnowledgeGraphRuntimeTrace(slotKey: string, maxDepth = 6) {
  const query = new URLSearchParams();
  query.set("slotKey", slotKey);
  query.set("max_depth", String(maxDepth));
  return request<Record<string, unknown>>(`/api/v1/knowledge-graph/runtime-trace?${query.toString()}`);
}

export function runKnowledgeGraphAIRetrieval(payload: { query: string; limit?: number }) {
  return request<Record<string, unknown>>("/api/v1/knowledge-graph/ai-retrieval", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface NormQAResponse {
  qa_schema?: Record<string, unknown>;
  retrieval_strategy?: Record<string, unknown>;
  citation_design?: Record<string, unknown>;
  answer?: string;
  evidence?: Array<Record<string, unknown>>;
  results?: {
    clause?: Array<Record<string, unknown>>;
    specir?: Array<Record<string, unknown>>;
    rule?: Array<Record<string, unknown>>;
    gate?: Array<Record<string, unknown>>;
    affected_forms?: Array<Record<string, unknown>>;
    proof_templates?: Array<Record<string, unknown>>;
  };
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getNormQASchema() {
  return request<{
    qa_schema: Record<string, unknown>;
    retrieval_strategy: Record<string, unknown>;
    citation_design: Record<string, unknown>;
  }>("/api/v1/norm-qa/schema");
}

export function askNormQA(payload: { question: string; top_k?: number }) {
  return request<NormQAResponse>("/api/v1/norm-qa/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ComplianceEvaluateResponse {
  compliance_engine?: Record<string, unknown>;
  scoring_strategy?: Record<string, unknown>;
  reasoning_design?: Record<string, unknown>;
  project_trace?: Record<string, unknown>;
  result?: {
    compliance_state?: string;
    compliance_score?: number;
    failed_gates?: Array<Record<string, unknown>>;
    risk_level?: string;
    affected_forms?: string[];
    suggested_actions?: string[];
    reasoning_chain?: string[];
  };
  manual_review_queue?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getComplianceSchema() {
  return request<{
    compliance_schema: Record<string, unknown>;
    scoring_strategy: Record<string, unknown>;
    reasoning_design: Record<string, unknown>;
  }>("/api/v1/compliance/schema");
}

export function evaluateCompliance(payload: {
  project_peg: Record<string, unknown>;
  runtime_events?: Array<Record<string, unknown>>;
  runtime_records: Array<Record<string, unknown>>;
  rulepack: Record<string, unknown>;
  specir?: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  project_context?: Record<string, unknown>;
}) {
  return request<ComplianceEvaluateResponse>("/api/v1/compliance/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface NormSubscriptionResponse {
  source_monitor?: Record<string, unknown>;
  auto_ingestion_pipeline?: Record<string, unknown>;
  update_workflow?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getNormSubscriptionSchema() {
  return request<{ subscription_schema: Record<string, unknown> }>("/api/v1/norm-subscription/schema");
}

export function runNormSubscription(payload: {
  sources?: Array<Record<string, unknown>>;
  discovered_norms?: Array<Record<string, unknown>>;
  dry_run?: boolean;
}) {
  return request<NormSubscriptionResponse>("/api/v1/norm-subscription/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface GateRuntimeEvaluatePayload {
  gate_id: string;
  gate_type: "threshold" | "range" | "existence" | "formula" | "dependency" | "sequence";
  slot_refs: string[];
  operator?: string;
  threshold?: number;
  min?: number;
  max?: number;
  formula_ref?: string;
  condition?: string;
  on_pass?: string;
  on_fail?: string;
  severity?: "info" | "warning" | "reject" | "critical";
  runtime_mode?: "automatic" | "semi_automatic" | "manual_confirmed";
  confidence?: number;
  current_input?: Record<string, unknown>;
  specir: string;
  rule: string;
  normRef: string;
  source_clause?: string;
}

export function getGateRuntimeSchema() {
  return request<{
    gate_schema: Record<string, unknown>;
    runtime_execution_flow: string[];
  }>("/api/v1/gate-runtime/schema");
}

export function evaluateGateRuntime(payload: GateRuntimeEvaluatePayload) {
  return request<{ event: Record<string, unknown> }>("/api/v1/gate-runtime/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listGateRuntimeEvents(limit = 100) {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/gate-runtime/events?${query.toString()}`);
}

export interface RuntimeEventWritePayload {
  event_type: string;
  event_id?: string;
  project_id: string;
  form_code: string;
  peg_id: string;
  slotKey: string;
  rule_id: string;
  gate_id: string;
  result: string;
  input_values: Record<string, unknown>;
  output_values: Record<string, unknown>;
  timestamp?: string;
  operator: string;
  proof_ref?: string;
}

export function getRuntimeEventSchema() {
  return request<{ event_schema: Record<string, unknown> }>("/api/v1/runtime-events/schema");
}

export function writeRuntimeEvent(payload: RuntimeEventWritePayload) {
  return request<Record<string, unknown>>("/api/v1/runtime-events/write", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRuntimeEvents(limit = 100) {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/runtime-events/list?${query.toString()}`);
}

export interface ProofChainAppendPayload {
  proof_id?: string;
  project_id: string;
  form_code: string;
  slotKey: string;
  rule_id: string;
  gate_id: string;
  input_snapshot: Record<string, unknown>;
  calculation_trace: Array<Record<string, unknown>>;
  decision_result: string;
  evidence_files: Array<Record<string, unknown>>;
  operator: string;
  timestamp?: string;
  hash?: string;
  previous_hash?: string;
  specir_id?: string;
  normRef?: string;
  source_text?: string;
}

export interface UnifiedProofAppendPayload {
  proof_id?: string;
  project_id: string;
  form_code: string;
  slotKey: string;
  body_snapshot: Record<string, unknown>;
  gate_snapshot: Record<string, unknown>;
  calculation_trace: Array<Record<string, unknown>>;
  result: string;
  fail_reason?: string;
  evidence_refs: Array<Record<string, unknown>>;
  operator: string;
  timestamp?: string;
  signature?: string;
  hash?: string;
  override_of?: string;
  specir: string;
  rule?: string;
  normRef: string;
}

export function getProofChainSchema() {
  return request<{
    proof_schema: Record<string, unknown>;
    hash_chain_design: Record<string, unknown>;
  }>("/api/v1/proof-chain/schema");
}

export function appendProofChain(payload: ProofChainAppendPayload) {
  return request<Record<string, unknown>>("/api/v1/proof-chain/append", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listProofChain(project_id?: string, limit = 100) {
  const query = new URLSearchParams();
  query.set("limit", String(limit));
  if (project_id && project_id.trim()) {
    query.set("project_id", project_id.trim());
  }
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/proof-chain/list?${query.toString()}`);
}

export function exportProofChainAudit(project_id: string) {
  const query = new URLSearchParams();
  query.set("project_id", project_id);
  return request<Record<string, unknown>>(`/api/v1/proof-chain/audit-export?${query.toString()}`);
}

export function getUnifiedProofSchema() {
  return request<{
    proof_schema: Record<string, unknown>;
    hash_chain: Record<string, unknown>;
  }>("/api/v1/proof-unified/schema");
}

export function appendUnifiedProof(payload: UnifiedProofAppendPayload) {
  return request<{ item: Record<string, unknown> }>("/api/v1/proof-unified/append", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listUnifiedProof(project_id?: string, limit = 200) {
  const query = new URLSearchParams();
  if (project_id && project_id.trim()) {
    query.set("project_id", project_id.trim());
  }
  query.set("limit", String(limit));
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/proof-unified/list?${query.toString()}`);
}

export interface BIMObjectMappingPayload {
  bim_object_id: string;
  object_type: string;
  location: Record<string, unknown>;
  project_id: string;
  related_form_code: string;
  related_slotKeys: string[];
  related_specir_ids: string[];
  geometry_ref: string;
  metadata: Record<string, unknown>;
}

export function getBimMappingSchema() {
  return request<{ bim_mapping_schema: Record<string, unknown> }>("/api/v1/bim-mapping/schema");
}

export function upsertBimObjectMapping(payload: BIMObjectMappingPayload) {
  return request<Record<string, unknown>>("/api/v1/bim-mapping/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listBimObjectMappings(project_id = "") {
  const query = new URLSearchParams();
  if (project_id.trim()) {
    query.set("project_id", project_id.trim());
  }
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/bim-mapping/list${suffix}`);
}

export function analyzeBimMappingImpact(payload: {
  project_id: string;
  slotKey?: string;
  gate_failed?: Record<string, unknown>;
  bim_update?: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/bim-mapping/impact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSensorBindingSchema() {
  return request<{ sensor_binding_schema: Record<string, unknown> }>("/api/v1/sensor-binding/schema");
}

export function ingestSensorBinding(payload: {
  sensor: Record<string, unknown>;
  reading: Record<string, unknown>;
  target_unit: string;
  normal_range?: Record<string, unknown>;
  gate_id?: string;
  rule_id?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/sensor-binding/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeTrustSchema() {
  return request<{
    trust_score_rules: Record<string, unknown>;
    trust_report_schema: Record<string, unknown>;
  }>("/api/v1/runtime-trust/schema");
}

export function evaluateRuntimeTrust(payload: {
  project_id: string;
  source: Record<string, unknown>;
  device: Record<string, unknown>;
  manual_input: Record<string, unknown>;
  proof: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  recent_values: number[];
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-trust/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeTrustDashboard(limit = 100) {
  return request<Record<string, unknown>>(`/api/v1/runtime-trust/dashboard?limit=${encodeURIComponent(String(limit))}`);
}

export function finalizeComplianceWithTrust(payload: { report_id: string; requested_by?: string }) {
  return request<Record<string, unknown>>("/api/v1/runtime-trust/finalize-compliance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLiveRiskSchema() {
  return request<{
    risk_model_schema: Record<string, unknown>;
    risk_explanation_fields: Record<string, unknown>;
  }>("/api/v1/live-risk/schema");
}

export function predictLiveRisk(payload: {
  project_id: string;
  historical_gate_results: Array<Record<string, unknown>>;
  construction_phase: string;
  sensor_data: Array<Record<string, unknown>>;
  proof_missing: Array<Record<string, unknown>>;
  manual_overrides: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/live-risk/predict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEngineeringCopilotSchema() {
  return request<{
    copilot_query_flow: Record<string, unknown>;
    rag_data_sources: Record<string, unknown>;
    answer_structure: Record<string, unknown>;
  }>("/api/v1/engineering-copilot/schema");
}

export function askEngineeringCopilot(payload: {
  question: string;
  project_context: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  specir_records: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/engineering-copilot/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAutoRemediationSchema() {
  return request<{
    remediation_schema: Record<string, unknown>;
    remediation_closed_loop: Record<string, unknown>;
  }>("/api/v1/auto-remediation/schema");
}

export function suggestAutoRemediation(payload: {
  failed_gate: Record<string, unknown>;
  input_values: Record<string, unknown>;
  threshold: Record<string, unknown>;
  specir: Record<string, unknown>;
  historical_fixes: Array<Record<string, unknown>>;
  project_context: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/auto-remediation/suggest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProjectComplianceDashboardSchema() {
  return request<{
    dashboard_structure: Record<string, unknown>;
    metric_definitions: Record<string, unknown>;
    status_color_rules: Record<string, unknown>;
  }>("/api/v1/project-compliance-dashboard/schema");
}

export function buildProjectComplianceDashboard(payload: {
  forms: Array<Record<string, unknown>>;
  gate_results: Array<Record<string, unknown>>;
  proof_status: Array<Record<string, unknown>>;
  risk_items: Array<Record<string, unknown>>;
  trust_items: Array<Record<string, unknown>>;
  review_queue: Array<Record<string, unknown>>;
  runtime_events: Array<Record<string, unknown>>;
  filters: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/project-compliance-dashboard/build", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMobileBodyRuntimeSchema() {
  return request<{
    mobile_page_structure: Record<string, unknown>;
    offline_sync_strategy: Record<string, unknown>;
    data_conflict_resolution: Record<string, unknown>;
  }>("/api/v1/mobile-body-runtime/schema");
}

export function evaluateMobileBodyRuntime(payload: {
  form_code: string;
  slotKey: string;
  input_value: number;
  operator: string;
  threshold: number;
  clause_text: string;
  norm_ref?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/mobile-body-runtime/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface BodyItemPayload {
  body_id?: string;
  slotKey: string;
  specir: string;
  form_code: string;
  label?: string;
  value?: unknown;
  value_type?: "design" | "measured" | "calculated" | "derived";
  unit?: string;
  source_type?: "PDF" | "OCR" | "Manual" | "Sensor" | "BIM" | "Formula";
  source_ref?: string;
  confidence?: number;
  runtime_status?: "pending" | "valid" | "invalid" | "missing" | "overridden";
  updated_at?: string;
}

export function getBodySchema() {
  return request<{ body_schema: Record<string, unknown> }>("/api/v1/body/schema");
}

export function getBodyLifecycle() {
  return request<{ body_lifecycle: Record<string, unknown> }>("/api/v1/body/lifecycle");
}

export function upsertBody(payload: BodyItemPayload) {
  return request<Record<string, unknown>>("/api/v1/body/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function upsertBodyBatch(payload: { items: BodyItemPayload[] }) {
  return request<Record<string, unknown>>("/api/v1/body/upsert/batch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listBodies(params?: {
  limit?: number;
  slotKey?: string;
  form_code?: string;
  specir?: string;
  source_type?: string;
  runtime_status?: string;
}) {
  const query = new URLSearchParams();
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
    query.set("limit", String(params.limit));
  }
  if (params?.slotKey?.trim()) query.set("slotKey", params.slotKey.trim());
  if (params?.form_code?.trim()) query.set("form_code", params.form_code.trim());
  if (params?.specir?.trim()) query.set("specir", params.specir.trim());
  if (params?.source_type?.trim()) query.set("source_type", params.source_type.trim());
  if (params?.runtime_status?.trim()) query.set("runtime_status", params.runtime_status.trim());
  return request<{ items: Array<Record<string, unknown>>; count: number }>(`/api/v1/body/list?${query.toString()}`);
}

export function getBodyById(bodyId: string) {
  return request<{ item: Record<string, unknown> }>(`/api/v1/body/${encodeURIComponent(bodyId)}`);
}

export function getBimRuntimeLinkageSchema() {
  return request<{
    page_layout: Record<string, unknown>;
    binding_rules: Record<string, unknown>;
    highlight_states: Record<string, unknown>;
  }>("/api/v1/bim-runtime-linkage/schema");
}

export function buildBimRuntimeLinkage(payload: {
  bim_objects: Array<Record<string, unknown>>;
  specir_records: Array<Record<string, unknown>>;
  rule_gate_records: Array<Record<string, unknown>>;
  runtime_results: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  risk_items: Array<Record<string, unknown>>;
  selected_bim_object_id?: string;
  risk_level_filter?: string;
  design_change?: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/bim-runtime-linkage/build", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface SemanticCoreParseResponse {
  schema?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  semantic_specir?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  evidence_span?: Record<string, unknown>;
  confidence?: number;
  [key: string]: unknown;
}

export function getSemanticCoreSchema() {
  return request<{ schema: Record<string, unknown> }>("/api/v1/semantic-core/schema");
}

export function parseSemanticCore(payload: {
  clause_text: string;
  table_cell: string;
  formula: string;
  note: string;
}) {
  return request<SemanticCoreParseResponse>("/api/v1/semantic-core/parse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface SlotIntelligenceRecommendPayload {
  form_code: string;
  clause: string;
  semantic_type: string;
  nearby_slots: Array<Record<string, unknown>>;
  historical_mappings: Array<Record<string, unknown>>;
  blueprint_context: Record<string, unknown>;
}

export interface SlotIntelligenceRecommendResponse {
  slot_recommendation_engine?: Record<string, unknown>;
  similarity_strategy?: Record<string, unknown>;
  recommended_slot_keys?: Array<Record<string, unknown>>;
  slot_graph_integration?: Record<string, unknown>;
  auto_bound?: Array<Record<string, unknown>>;
  human_review_queue?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function recommendSlots(payload: SlotIntelligenceRecommendPayload) {
  return request<SlotIntelligenceRecommendResponse>("/api/v1/slot-intelligence/recommend", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSlotRecommendationReviewQueue() {
  return request<{ items: Array<Record<string, unknown>> }>("/api/v1/slot-intelligence/review-queue");
}

export interface ConstraintReasonerResponse {
  condition_schema?: Record<string, unknown>;
  reasoning_engine?: Record<string, unknown>;
  explainability_design?: Record<string, unknown>;
  constraint?: Record<string, unknown>;
  constraint_reasoning?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getConstraintReasonerSchema() {
  return request<{ condition_schema: Record<string, unknown> }>("/api/v1/constraint-reasoner/schema");
}

export function reasonConstraint(payload: { clause: string }) {
  return request<ConstraintReasonerResponse>("/api/v1/constraint-reasoner/reason", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface FormulaIntelligenceResponse {
  formula_parser?: Record<string, unknown>;
  ast_schema?: Record<string, unknown>;
  runtime_integration?: Record<string, unknown>;
  formula_latex?: string;
  formula_ast?: Record<string, unknown>;
  inputs?: Array<Record<string, unknown>>;
  output?: Record<string, unknown>;
  unit_mapping?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getFormulaIntelligenceSchema() {
  return request<Record<string, unknown>>("/api/v1/formula-intelligence/schema");
}

export function parseFormulaIntelligence(payload: { clause?: string; formula: string }) {
  return request<FormulaIntelligenceResponse>("/api/v1/formula-intelligence/parse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface LayoutSemanticResponse {
  layout_schema?: Record<string, unknown>;
  ocr_fusion_strategy?: Record<string, unknown>;
  semantic_layout_engine?: Record<string, unknown>;
  layout_semantic_ir?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getLayoutSemanticSchema() {
  return request<{ layout_schema: Record<string, unknown> }>("/api/v1/layout-semantic/schema");
}

export function analyzeLayoutSemantic(payload: {
  document_type: "pdf" | "word" | "scanned_image" | "screenshot";
  content_text: string;
}) {
  return request<LayoutSemanticResponse>("/api/v1/layout-semantic/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UnifiedInputParsePayload {
  input_type: "PDF" | "Word" | "扫描图片" | "Excel" | "手机拍照" | "自然语言施工描述";
  content_text: string;
  ocr_blocks?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

export function getUnifiedInputParserSchema() {
  return request<{
    parser_pipeline: Record<string, unknown>;
    semantic_normalization_strategy: Record<string, unknown>;
  }>("/api/v1/unified-input-parser/schema");
}

export function parseUnifiedInput(payload: UnifiedInputParsePayload) {
  return request<Record<string, unknown>>("/api/v1/unified-input-parser/parse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeEngineSchema() {
  return request<{
    runtime_engine_schema: Record<string, unknown>;
    dependency_graph: Record<string, unknown>;
    execution_lifecycle: string[];
  }>("/api/v1/runtime-engine/schema");
}

export function dispatchRuntimeEngine(payload: {
  body_update: Record<string, unknown>;
  async_execution?: boolean;
  trigger_reason?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-engine/dispatch", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function drainRuntimeEngineQueue(limit = 20) {
  return request<Record<string, unknown>>(`/api/v1/runtime-engine/worker/drain?limit=${encodeURIComponent(String(limit))}`, {
    method: "POST",
  });
}

export function listRuntimeEngineExecutions(limit = 200) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/runtime-engine/executions?limit=${encodeURIComponent(String(limit))}`);
}

export function replayRuntimeEngine(executionId: string) {
  return request<Record<string, unknown>>(`/api/v1/runtime-engine/replay?execution_id=${encodeURIComponent(executionId)}`, {
    method: "POST",
  });
}

export function rollbackRuntimeEngine(payload: { execution_id: string; reason?: string }) {
  return request<Record<string, unknown>>("/api/v1/runtime-engine/rollback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function auditRuntimeEngine(limit = 200) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/runtime-engine/audit?limit=${encodeURIComponent(String(limit))}`);
}

export function getRuntimeDependencyGraphSchema() {
  return request<{
    graph_schema: Record<string, unknown>;
    graph: Record<string, unknown>;
    cycle_detection: Record<string, unknown>;
    recompute_strategy: Record<string, unknown>;
  }>("/api/v1/runtime-dependency-graph/schema");
}

export function recomputeRuntimeDependencyGraph(payload: {
  body_id?: string;
  slotKey?: string;
  form_code?: string;
  project_id?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-dependency-graph/recompute", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLiveConclusionSchema() {
  return request<{
    conclusion_schema: Record<string, unknown>;
    aggregation_strategy: Record<string, unknown>;
    refresh_lifecycle?: string[];
  }>("/api/v1/live-conclusion/schema");
}

export function buildLiveConclusion(payload: { project_id: string; form_code?: string; bridge_id?: string }) {
  return request<Record<string, unknown>>("/api/v1/live-conclusion/build", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getConsistencyCheckSchema() {
  return request<{
    consistency_rules: Record<string, unknown>;
    validation_engine: Record<string, unknown>;
    detection_engine?: Record<string, unknown>;
    remediation_workflow?: Record<string, unknown>;
  }>("/api/v1/consistency-check/schema");
}

export function runConsistencyCheck(payload: { project_id: string; form_code?: string }) {
  return request<Record<string, unknown>>("/api/v1/consistency-check/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSemanticConsistencySchema() {
  return request<{
    consistency_rules: Record<string, unknown>;
    detection_engine: Record<string, unknown>;
    remediation_workflow: Record<string, unknown>;
  }>("/api/v1/semantic-consistency/schema");
}

export function runSemanticConsistency(payload: { project_id: string; form_code?: string }) {
  return request<Record<string, unknown>>("/api/v1/semantic-consistency/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listSemanticConsistencyEvents(params?: { project_id?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.project_id?.trim()) query.set("project_id", params.project_id.trim());
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/semantic-consistency/events${suffix ? `?${suffix}` : ""}`);
}

export function getLiveRuntimeSchema() {
  return request<{
    runtime_event_architecture: Record<string, unknown>;
    streaming_pipeline: string[];
    live_runtime_lifecycle: string[];
  }>("/api/v1/live-runtime/schema");
}

export function ingestLiveRuntimeEvent(payload: {
  project_id: string;
  form_code?: string;
  source: "sensor_streaming" | "mobile_update" | "bim_update" | "manual_override";
  slotKey?: string;
  body_patch?: Record<string, unknown>;
  gate_context?: Record<string, unknown>;
  proof_context?: Record<string, unknown>;
  bim_context?: Record<string, unknown>;
  mobile_context?: Record<string, unknown>;
  override?: Record<string, unknown>;
  operator?: string;
  timestamp?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/live-runtime/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function drainLiveRuntimeWorker(limit = 20) {
  return request<Record<string, unknown>>(`/api/v1/live-runtime/worker/drain?limit=${encodeURIComponent(String(limit))}`, {
    method: "POST",
  });
}

export function getLiveRuntimeSnapshot(projectId?: string) {
  const query = new URLSearchParams();
  if (projectId && projectId.trim()) query.set("project_id", projectId.trim());
  const suffix = query.toString();
  return request<Record<string, unknown>>(`/api/v1/live-runtime/snapshot${suffix ? `?${suffix}` : ""}`);
}

export function replayLiveRuntimeEvent(payload: { event_id: string }) {
  return request<Record<string, unknown>>("/api/v1/live-runtime/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rollbackLiveRuntimeEvent(payload: { event_id: string; reason?: string }) {
  return request<Record<string, unknown>>("/api/v1/live-runtime/rollback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function auditLiveRuntime(limit = 200) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/live-runtime/audit?limit=${encodeURIComponent(String(limit))}`);
}

export function traceabilityLiveRuntime(limit = 200) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/live-runtime/traceability?limit=${encodeURIComponent(String(limit))}`);
}

export function getEngineeringReasoningSchema() {
  return request<{
    reasoning_schema: Record<string, unknown>;
    causal_chain_structure: Record<string, unknown>;
    panel_plan: Record<string, unknown>;
  }>("/api/v1/engineering-reasoning/schema");
}

export function runEngineeringReasoning(payload: {
  body_snapshot: Record<string, unknown>;
  gate_result: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  specir: Record<string, unknown>;
  historical_runtime_traces: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/engineering-reasoning/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEngineeringCausalGraphSchema() {
  return request<{
    causal_graph_schema: Record<string, unknown>;
    root_cause_algorithm: Record<string, unknown>;
    page_plan: Record<string, unknown>;
    example?: Record<string, unknown>;
  }>("/api/v1/engineering-causal-graph/schema");
}

export function buildEngineeringCausalGraph(payload: {
  body?: Array<Record<string, unknown>>;
  runtime_events?: Array<Record<string, unknown>>;
  sensors?: Array<Record<string, unknown>>;
  equipments?: Array<Record<string, unknown>>;
  processes?: Array<Record<string, unknown>>;
  weather?: Array<Record<string, unknown>>;
  gates?: Array<Record<string, unknown>>;
  proofs?: Array<Record<string, unknown>>;
  conclusions?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/engineering-causal-graph/build", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function traverseEngineeringCausalGraph(payload: {
  start_node_id: string;
  direction?: "upstream" | "downstream";
  max_depth?: number;
  relation_filter?: Array<"causes" | "contributes_to" | "blocks" | "amplifies" | "correlates">;
}) {
  return request<Record<string, unknown>>("/api/v1/engineering-causal-graph/traverse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function analyzeEngineeringRootCause(payload: { target_node_id: string; max_depth?: number }) {
  return request<Record<string, unknown>>("/api/v1/engineering-causal-graph/root-cause", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function predictEngineeringDownstreamImpact(payload: { source_node_id: string; max_depth?: number }) {
  return request<Record<string, unknown>>("/api/v1/engineering-causal-graph/predict-impact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeAnomalySchema() {
  return request<{
    anomaly_schema: Record<string, unknown>;
    detection_pipeline: string[];
    page_plan: Record<string, unknown>;
  }>("/api/v1/runtime-anomaly/schema");
}

export function detectRuntimeAnomaly(payload: {
  project_id: string;
  form_code?: string;
  sensor_data?: Array<Record<string, unknown>>;
  body_snapshot?: Record<string, unknown>;
  runtime_events?: Array<Record<string, unknown>>;
  proofs?: Array<Record<string, unknown>>;
  gate_results?: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-anomaly/detect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRuntimeRiskQueue(params?: { project_id?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.project_id?.trim()) query.set("project_id", params.project_id.trim());
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/runtime-anomaly/risk-queue${suffix ? `?${suffix}` : ""}`);
}

export function gateAutoComplianceByAnomaly(payload: { anomaly_id?: string }) {
  return request<Record<string, unknown>>("/api/v1/runtime-anomaly/auto-compliance-gate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getPredictiveRuntimeSchema() {
  return request<{
    prediction_schema: Record<string, unknown>;
    forecasting_pipeline: string[];
    page_plan: Record<string, unknown>;
  }>("/api/v1/predictive-runtime/schema");
}

export function runPredictiveRuntime(payload: {
  historical_runtime_traces: Array<Record<string, unknown>>;
  current_body_values: Record<string, unknown>;
  sensor_trends: Array<Record<string, unknown>>;
  weather: Record<string, unknown>;
  process_schedule: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/predictive-runtime/predict", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeMemorySchema() {
  return request<{
    memory_schema: Record<string, unknown>;
    retrieval_strategy: Record<string, unknown>;
    page_plan: Record<string, unknown>;
  }>("/api/v1/runtime-memory/schema");
}

export function upsertRuntimeMemory(payload: {
  memory_type: "historical_failure" | "successful_remediation" | "override_pattern" | "recurring_issue" | "accepted_ai_patch";
  project_id: string;
  form_code?: string;
  slotKey?: string;
  gate_id?: string;
  issue_signature: string;
  tags?: string[];
  payload?: Record<string, unknown>;
  success_score?: number;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-memory/upsert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listRuntimeMemory(params?: {
  project_id?: string;
  memory_type?: "historical_failure" | "successful_remediation" | "override_pattern" | "recurring_issue" | "accepted_ai_patch";
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.project_id?.trim()) query.set("project_id", params.project_id.trim());
  if (params?.memory_type?.trim()) query.set("memory_type", params.memory_type.trim());
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/runtime-memory/list${suffix ? `?${suffix}` : ""}`);
}

export function retrieveRuntimeMemory(payload: {
  issue_signature?: string;
  slotKey?: string;
  gate_id?: string;
  tags?: string[];
  project_id?: string;
  limit?: number;
  prefer_success?: boolean;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-memory/retrieve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeMemoryReasoningContext(payload: {
  issue_signature?: string;
  slotKey?: string;
  gate_id?: string;
  tags?: string[];
  project_id?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-memory/reasoning-context", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function suggestRuntimeMemoryReuse(payload: {
  issue_signature?: string;
  slotKey?: string;
  gate_id?: string;
  tags?: string[];
  project_id?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-memory/ai-reuse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAutonomousRemediationSchema() {
  return request<{
    remediation_schema: Record<string, unknown>;
    planning_workflow: string[];
    page_plan: Record<string, unknown>;
  }>("/api/v1/autonomous-remediation/schema");
}

export function runAutonomousRemediationPlanner(payload: {
  failed_gate: Record<string, unknown>;
  runtime_reasoning: Record<string, unknown>;
  historical_remediation?: Array<Record<string, unknown>>;
  project_context: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/autonomous-remediation/plan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getProjectSemanticBrainSchema() {
  return request<{
    semantic_brain_schema: Record<string, unknown>;
    aggregation_engine: Record<string, unknown>;
    reasoning_model: Record<string, unknown>;
    page_plan: Record<string, unknown>;
  }>("/api/v1/project-semantic-brain/schema");
}

export function buildProjectSemanticBrain(payload: {
  project_id: string;
  specir: Array<Record<string, unknown>>;
  runtime: Array<Record<string, unknown>>;
  bim: Array<Record<string, unknown>>;
  iot: Array<Record<string, unknown>>;
  proof: Array<Record<string, unknown>>;
  compliance: Array<Record<string, unknown>>;
  risk: Array<Record<string, unknown>>;
  historical_memory: Array<Record<string, unknown>>;
  dependencies?: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/project-semantic-brain/build", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getEngineeringCopilot2Schema() {
  return request<{
    copilot_interaction_schema: Record<string, unknown>;
    retrieval_pipeline: Record<string, unknown>;
    reasoning_ui: Record<string, unknown>;
  }>("/api/v1/engineering-copilot-2/schema");
}

export function askEngineeringCopilot2(payload: {
  question: string;
  project_context: Record<string, unknown>;
  runtime_events: Array<Record<string, unknown>>;
  gate_records: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  specir_records: Array<Record<string, unknown>>;
  historical_memory?: Array<Record<string, unknown>>;
  risk_records?: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/engineering-copilot-2/ask", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getComplianceIntelligenceSchema() {
  return request<{
    compliance_intelligence_schema: Record<string, unknown>;
    clustering_engine: Record<string, unknown>;
    page_plan: Record<string, unknown>;
  }>("/api/v1/compliance-intelligence/schema");
}

export function analyzeComplianceIntelligence(payload: {
  runtime_graph: Array<Record<string, unknown>>;
  proof_chain: Array<Record<string, unknown>>;
  risk_events: Array<Record<string, unknown>>;
  override_history: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/compliance-intelligence/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeKnowledgeCompressionSchema() {
  return request<{
    compression_strategy: Record<string, unknown>;
    clustering_schema: Record<string, unknown>;
    graph_optimization_rules: string[];
    page_plan: Record<string, unknown>;
  }>("/api/v1/runtime-knowledge-compression/schema");
}

export function runRuntimeKnowledgeCompression(payload: {
  runtime_graph: Array<Record<string, unknown>>;
  proofs: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  anomalies: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-knowledge-compression/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getCrossProjectLearningSchema() {
  return request<{
    transfer_learning_schema: Record<string, unknown>;
    anonymization_strategy: Record<string, unknown>;
    knowledge_sharing_rules: string[];
    page_plan: Record<string, unknown>;
  }>("/api/v1/cross-project-learning/schema");
}

export function runCrossProjectLearningTransfer(payload: {
  source_project_id: string;
  target_project_id: string;
  successful_remediation: Array<Record<string, unknown>>;
  runtime_anomaly_patterns: Array<Record<string, unknown>>;
  semantic_mappings: Array<Record<string, unknown>>;
  gate_tuning_knowledge: Array<Record<string, unknown>>;
}) {
  return request<Record<string, unknown>>("/api/v1/cross-project-learning/transfer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeSemanticGraphSchema() {
  return request<{
    graph_schema: Record<string, unknown>;
    dependency_engine: Record<string, unknown>;
    runtime_traversal_logic: Record<string, unknown>;
    graph: Record<string, unknown>;
    cycle_detection: Record<string, unknown>;
  }>("/api/v1/runtime-semantic-graph/schema");
}

export function traverseRuntimeSemanticGraph(payload: {
  start_node_id: string;
  max_depth?: number;
  edge_types?: string[];
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-semantic-graph/traverse", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replayRuntimeSemanticGraph(executionId: string) {
  return request<Record<string, unknown>>(`/api/v1/runtime-semantic-graph/replay?execution_id=${encodeURIComponent(executionId)}`, {
    method: "POST",
  });
}

export function getRuntimeReplayEngineSchema() {
  return request<{
    replay_engine: Record<string, unknown>;
    replay_proof_schema: Record<string, unknown>;
    version_isolation_strategy: Record<string, unknown>;
  }>("/api/v1/runtime-replay/schema");
}

export function runRuntimeReplayEngine(payload: {
  body_snapshot: Record<string, unknown>;
  old_rulepack: unknown;
  new_rulepack: unknown;
  replay_mode?: "what_if_simulation" | "upgrade_validation" | "rollback_validation";
  context?: {
    project_id?: string;
    form_code?: string;
    operator_id?: string;
  };
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-replay/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeBodySchema() {
  return request<{
    body_runtime_schema: Record<string, unknown>;
    update_lifecycle: string[];
    recompute_pipeline: string[];
  }>("/api/v1/runtime-body/schema");
}

export function updateRuntimeBody(payload: {
  body: Record<string, unknown>;
  source?: "manual input" | "sensor" | "formula" | "BIM" | "imported form" | "AI extraction";
  operator?: string;
  override?: boolean;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime-body/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function rollbackRuntimeBody(payload: { body_id: string; reason?: string }) {
  return request<Record<string, unknown>>("/api/v1/runtime-body/rollback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replayRuntimeBody(payload: { event_id: string }) {
  return request<Record<string, unknown>>("/api/v1/runtime-body/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeBodyTimeline(params?: { body_id?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.body_id?.trim()) query.set("body_id", params.body_id.trim());
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return request<Record<string, unknown>>(`/api/v1/runtime-body/timeline${suffix ? `?${suffix}` : ""}`);
}

export function getGateRuntimeEngineSchema() {
  return request<{
    gate_runtime_schema: Record<string, unknown>;
    execution_engine: Record<string, unknown>;
    runtime_reasoning_structure: Record<string, unknown>;
  }>("/api/v1/gate-runtime-engine/schema");
}

export function evaluateGateRuntimeEngine(payload: {
  gate: Record<string, unknown>;
  body_snapshot: Record<string, unknown>;
  project_id?: string;
  form_code?: string;
  operator?: string;
}) {
  return request<Record<string, unknown>>("/api/v1/gate-runtime-engine/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listGateRuntimeEngineTrace(limit = 200) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/gate-runtime-engine/trace?limit=${encodeURIComponent(String(limit))}`);
}

export function getImmutableProofChainSchema() {
  return request<{
    proof_chain_schema: Record<string, unknown>;
    hash_chain_strategy: Record<string, unknown>;
    replay_integrity_rules: string[];
  }>("/api/v1/immutable-proof-chain/schema");
}

export function appendImmutableProof(payload: {
  project_id: string;
  form_code: string;
  slotKey: string;
  body_snapshot: Record<string, unknown>;
  gate_snapshot: Record<string, unknown>;
  execution_trace: Array<Record<string, unknown>>;
  formula_trace: Array<Record<string, unknown>>;
  runtime_events: Array<Record<string, unknown>>;
  operator: string;
  signature?: string;
  override_of?: string;
  replay_of?: string;
  specir: string;
  normRef: string;
}) {
  return request<{ item: Record<string, unknown> }>("/api/v1/immutable-proof-chain/append", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listImmutableProofChain(params?: { project_id?: string; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.project_id?.trim()) query.set("project_id", params.project_id.trim());
  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/immutable-proof-chain/list${suffix ? `?${suffix}` : ""}`);
}

export function getImmutableProofLineage(proofId: string) {
  return request<{ lineage: Array<Record<string, unknown>> }>(`/api/v1/immutable-proof-chain/lineage?proof_id=${encodeURIComponent(proofId)}`);
}

export function getImmutableProofOverrideHistory(proofId: string) {
  return request<{ items: Array<Record<string, unknown>> }>(`/api/v1/immutable-proof-chain/override-history?proof_id=${encodeURIComponent(proofId)}`);
}

export function replayImmutableProof(proofId: string, operator = "replay_operator") {
  return request<Record<string, unknown>>(`/api/v1/immutable-proof-chain/replay?proof_id=${encodeURIComponent(proofId)}&operator=${encodeURIComponent(operator)}`, {
    method: "POST",
  });
}

export interface SemanticConflictResponse {
  conflict_engine?: Record<string, unknown>;
  semantic_compare_algorithm?: Record<string, unknown>;
  precedence_rules?: Record<string, unknown>;
  conflicts?: Array<Record<string, unknown>>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getSemanticConflictSchema() {
  return request<{ conflict_schema: Record<string, unknown> }>("/api/v1/semantic-conflict/schema");
}

export function analyzeSemanticConflict(payload: { rules: Array<Record<string, unknown>> }) {
  return request<SemanticConflictResponse>("/api/v1/semantic-conflict/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface CrossFormPropagationResponse {
  propagation_engine?: Record<string, unknown>;
  impact_reasoning?: Record<string, unknown>;
  preview_workflow?: Record<string, unknown>;
  affected_forms?: Array<{
    form_code?: string;
    confidence?: number;
    propagation_reasoning?: string;
    [key: string]: unknown;
  }>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}

export function getCrossFormPropagationSchema() {
  return request<{ propagation_schema: Record<string, unknown> }>("/api/v1/cross-form-propagation/schema");
}

export function previewCrossFormPropagation(payload: {
  specir: Record<string, unknown>;
  slot_graph: Record<string, unknown>;
  form_blueprint: Record<string, unknown>;
  historical_usage: Array<Record<string, unknown>>;
  dry_run?: boolean;
}) {
  return request<CrossFormPropagationResponse>("/api/v1/cross-form-propagation/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface HITL2QueueItem {
  patch_id: string;
  form_code: string;
  source: string;
  candidate: Record<string, unknown>;
  confidence: number;
  impact_score: number;
  governance_decision: "auto_approve_candidate" | "review_required" | "blocked";
  status: string;
  created_at: string;
  updated_at?: string;
  reviewer?: string;
  edit_payload?: Record<string, unknown>;
}

export function getHITL2Governance() {
  return request<{ confidence_governance: Record<string, unknown> }>("/api/v1/hitl2/governance");
}

export function enqueueHITL2Candidate(payload: {
  form_code: string;
  source?: string;
  candidate: Record<string, unknown>;
  confidence: number;
  impact_score: number;
}) {
  return request<{ item: HITL2QueueItem }>("/api/v1/hitl2/queue/enqueue", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getHITL2Queue(includeAutoApproved = true) {
  const query = new URLSearchParams();
  query.set("include_auto_approved", includeAutoApproved ? "true" : "false");
  return request<{ items: HITL2QueueItem[]; sort_by: string[] }>(`/api/v1/hitl2/queue?${query.toString()}`);
}

export function runHITL2Action(payload: {
  patch_id: string;
  action: "accept" | "edit" | "reject";
  edit_payload?: Record<string, unknown>;
  reviewer?: string;
}) {
  return request<{ item: HITL2QueueItem; ai_learning_loop?: Record<string, unknown> }>("/api/v1/hitl2/queue/action", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getHITL2LearningLoop() {
  return request<{ ai_learning_loop: Record<string, unknown> }>("/api/v1/hitl2/learning-loop");
}

export interface RuntimeFeedbackCandidate {
  project_id: string;
  feedback_type: "suspected_bad_rule" | "suspected_bad_mapping" | "missing_runtime_input" | "unclear_specir" | "need_human_review";
  subject: Record<string, unknown>;
  trigger: string;
  metrics: Record<string, unknown>;
  severity: "high" | "medium" | "low" | string;
  evidence: Array<Record<string, unknown>>;
}

export interface RuntimeFeedbackQueueItem extends RuntimeFeedbackCandidate {
  feedback_id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  reviewer?: string;
  action?: string;
  resolution?: Record<string, unknown>;
}

export function getRuntimeFeedbackSchema() {
  return request<{ feedback_schema: Record<string, unknown> }>("/api/v1/runtime-feedback/schema");
}

export function detectRuntimeFeedback(payload: {
  project_id: string;
  gate_results: Array<Record<string, unknown>>;
  slot_missing_events: Array<Record<string, unknown>>;
  overrides: Array<Record<string, unknown>>;
  proof_records: Array<Record<string, unknown>>;
  appeals: Array<Record<string, unknown>>;
  thresholds?: Record<string, number>;
  auto_enqueue?: boolean;
}) {
  return request<{
    feedback_schema: Record<string, unknown>;
    detected_candidates: RuntimeFeedbackCandidate[];
    queued_items: RuntimeFeedbackQueueItem[];
    review_queue: Record<string, unknown>;
  }>("/api/v1/runtime-feedback/detect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSpecirReviewQueue(status?: string) {
  const query = new URLSearchParams();
  if (status?.trim()) {
    query.set("status", status.trim());
  }
  const suffix = query.toString();
  return request<{
    queue: string;
    items: RuntimeFeedbackQueueItem[];
    count: number;
    governance_constraints: Record<string, unknown>;
  }>(`/api/v1/specir/review-queue${suffix ? `?${suffix}` : ""}`);
}

export function runSpecirReviewQueueAction(payload: {
  feedback_id: string;
  action: "accept" | "reject" | "resolve_with_fix";
  reviewer: string;
  resolution?: Record<string, unknown>;
}) {
  return request<{ item: RuntimeFeedbackQueueItem }>("/api/v1/specir/review-queue/action", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getRuntimeFeedbackPageHints() {
  return request<{ page_hints: Array<Record<string, unknown>>; pending_count: number }>("/api/v1/runtime-feedback/page-hints");
}

export interface RuntimeVersionBinding {
  rulepack_version: string;
  norm_version: string;
  specir_version: string;
  executor_version: string;
  bound_at?: string;
}

export interface RuntimeVersionReplayResponse {
  execution_id: string;
  replay_mode: "historical_interpretation" | "re_execute";
  pinned_version_binding: RuntimeVersionBinding;
  selected_version_binding: RuntimeVersionBinding;
  decision_unchanged: boolean;
  historical_interpretation?: Record<string, unknown>;
  historical_final_status?: string;
  replay_final_status?: string;
  replay_result?: Record<string, unknown>;
  note?: string;
}

export function getRuntimeVersionPinningSchema() {
  return request<{
    version_binding_schema: Record<string, unknown>;
    history_replay_mechanism: Record<string, unknown>;
    page_version_switch_scheme: Record<string, unknown>;
  }>("/api/v1/runtime/version-pinning/schema");
}

export function replayRuntimeWithVersionPinning(payload: {
  execution_id: string;
  replay_mode?: "historical_interpretation" | "re_execute";
  version_selection?: Partial<RuntimeVersionBinding>;
  branch_id?: string;
  assert_decision_unchanged?: boolean;
}) {
  return request<RuntimeVersionReplayResponse>("/api/v1/runtime/version-pinning/replay", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface RuntimeReplayExecutionResponse {
  replay_id: string;
  replay_at: string;
  spec_or_component_id: string;
  old_rulepack_version: string;
  new_rulepack_version: string;
  old_result: Record<string, unknown>;
  new_result: Record<string, unknown>;
  diff: Record<string, unknown>;
  affected_gates: string[];
  risk_change: Record<string, unknown>;
}

export function getRuntimeReplaySchema() {
  return request<{
    replay_schema: Record<string, unknown>;
    execution_flow: string[];
  }>("/api/v1/runtime/replay/schema");
}

export function executeRuntimeReplay(payload: {
  historical_input_snapshot: Record<string, unknown>;
  old_rulepack_version: string;
  new_rulepack_version: string;
  spu_id?: string;
  spec_or_component_id?: string;
  branch_id?: string;
  context?: Record<string, unknown>;
}) {
  return request<RuntimeReplayExecutionResponse>("/api/v1/runtime/replay/execute", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateRuntimeReplayReport(payload: {
  replay_result: Record<string, unknown>;
  project_id?: string;
  scope?: Record<string, unknown>;
}) {
  return request<Record<string, unknown>>("/api/v1/runtime/replay/report", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface AIPatchCenterResponse {
  patch_schema?: Record<string, unknown>;
  suggestion_payload?: Record<string, unknown>;
  patch_record?: Record<string, unknown>;
  patch_review_workflow?: Record<string, unknown>;
  revert_strategy?: Record<string, unknown>;
}

export function getAIPatchSchema() {
  return request<{ patch_schema: Record<string, unknown> }>("/api/v1/ai-patch/schema");
}

export function suggestAIPatch(payload: {
  form_code: string;
  unresolved_reason: string;
  nearby_rules: Array<Record<string, unknown>>;
  slot_graph: Record<string, unknown>;
  historical_fixes: Array<Record<string, unknown>>;
  semantic_context: Record<string, unknown>;
}) {
  return request<AIPatchCenterResponse>("/api/v1/ai-patch/suggest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAIPatches() {
  return request<{ items: Array<Record<string, unknown>> }>("/api/v1/ai-patch/list");
}

export function reviewAIPatch(payload: { patch_id: string; action: "accept" | "edit" | "reject"; edit_payload?: Record<string, unknown> }) {
  return request<{ item: Record<string, unknown> }>("/api/v1/ai-patch/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revertAIPatch(payload: { patch_id: string }) {
  return request<{ item: Record<string, unknown> }>("/api/v1/ai-patch/revert", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getContainerProof(containerId: string) {
  return request<{
    proof: ContainerProof;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/containers/${encodeURIComponent(containerId)}/proof`);
}

export interface ProofLayerPegRef {
  role: "spec" | "execution" | "proof";
  usi: string;
  docType: "spec" | "proof" | "report" | "form" | "sku" | "execution" | "container" | "other";
  sourceRef: string;
  documentApiPath: string;
}

export interface ProofAuditExecutionSummary {
  executionId: string | null;
  nodeId: string | null;
  containerId: string | null;
  spuId: string;
  projectId: string | null;
  stake: string | null;
  summaryText: string;
}

export interface ProofAuditResultSummary {
  status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
  passed: boolean;
  gateDecision: "pass" | "block" | "pending";
  ruleTotal: number;
  passedRules: number;
  failedRules: number;
  failedRuleIds: string[];
}

export interface ProofAuditSignature {
  role: string;
  signer?: string | null;
  signature?: string | null;
  status: "PENDING" | "SIGNED";
  signedAt?: string | null;
}

export interface ProofAuditTimestamps {
  createdAt: string;
  evaluatedAt?: string | null;
  finalizedAt?: string | null;
  archivedAt?: string | null;
}

export interface ProofNormReference {
  spuId: string;
  title: string | null;
  norm: string | null;
  clause: string | null;
  version: string | null;
}

export interface ProofAcceptanceArchiveInfo {
  archived: boolean;
  archivedAt: string | null;
}

export interface ProofAcceptanceIntegrity {
  hashAlgorithm: "sha256";
  proofId: string | null;
  proofHash: string;
  exportHash: string;
  anchorRef: string | null;
  anchorProvider: string | null;
}

export interface ProofAcceptanceCertificate {
  certificateId: string;
  projectId: string | null;
  stake: string | null;
  containerId: string | null;
  executionId: string | null;
  spuId: string;
  inputData: Record<string, unknown>;
  decisionResult: ProofAuditResultSummary;
  normReferences: ProofNormReference[];
  signatures: ProofAuditSignature[];
  archive: ProofAcceptanceArchiveInfo;
  integrity: ProofAcceptanceIntegrity;
}

export interface ProofAuditExportResponse {
  jsonExport: {
    schemaVersion: "proof-audit-export@v1";
    generatedAt: string;
    sourceKind: "proofFragment" | "nodeFinalProof" | "containerFinalProof";
    executionSummary: ProofAuditExecutionSummary;
    matchedSpecVersion: string;
    result: ProofAuditResultSummary;
    acceptanceCertificate: ProofAcceptanceCertificate;
    integrity: ProofAcceptanceIntegrity;
    signatures: ProofAuditSignature[];
    timestamps: ProofAuditTimestamps;
    linkedLayerPegDocumentRefs: ProofLayerPegRef[];
    sourceProof: Record<string, unknown>;
  };
  markdownSummary: string;
  pdfReadyPayload: {
    templateId: "proof-audit-pdf@v1";
    generatedAt: string;
    title: string;
    executionSummary: ProofAuditExecutionSummary;
    matchedSpecVersion: string;
    result: ProofAuditResultSummary;
    acceptanceCertificate: ProofAcceptanceCertificate;
    signatures: ProofAuditSignature[];
    timestamps: ProofAuditTimestamps;
    linkedLayerPegDocumentRefs: ProofLayerPegRef[];
  };
}

export function exportProofAuditPackage(payload: { nodeId?: string; containerId?: string }) {
  return request<ProofAuditExportResponse>("/api/proof/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ProofArchiveExportResponse {
  proof: ContainerProof;
  exportPackage: ProofAuditExportResponse;
  layerPegDocument?: LayerPegDocument | null;
  standardOutput?: LayerPegStandardOutput | null;
}

export function archiveAndExportProofAcceptance(payload: { containerId: string; anchor?: AnchorStepRequest }) {
  return request<ProofArchiveExportResponse>("/api/proof/archive-export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getContainerAudit(containerId: string) {
  return request<{ items: Array<{ eventType: string; timestamp: string; payload: object; actor?: string }> }>(
    `/api/containers/${encodeURIComponent(containerId)}/audit`,
  );
}

export function getAudit(entityType: "container" | "node", entityId: string) {
  return request<{ items: Array<{ eventType: string; timestamp: string; payload: object; actor?: string }> }>(
    `/api/audit/${entityType}/${encodeURIComponent(entityId)}`,
  );
}

export type PublicApiErrorCode =
  | "PUBLIC_INVALID_ARGUMENT"
  | "PUBLIC_UNAUTHORIZED"
  | "PUBLIC_FORBIDDEN"
  | "PUBLIC_NOT_FOUND"
  | "PUBLIC_CONFLICT"
  | "PUBLIC_GATE_REQUEST_INVALID"
  | "PUBLIC_GATE_DEPENDENCY_UNMET"
  | "PUBLIC_GATE_EXECUTION_FAILED"
  | "PUBLIC_INTERNAL_ERROR";

export interface PublicApiEnvelopeMeta {
  requestId: string;
  version: "public.v1";
  timestamp: string;
}

export interface PublicApiEnvelopeSuccess<T> {
  ok: true;
  data: T;
  error: null;
  meta: PublicApiEnvelopeMeta;
}

export interface PublicApiEnvelopeError {
  ok: false;
  data: null;
  error: {
    code: PublicApiErrorCode;
    message: string;
    details?: unknown;
  };
  meta: PublicApiEnvelopeMeta;
}

export type PublicApiEnvelope<T> = PublicApiEnvelopeSuccess<T> | PublicApiEnvelopeError;

async function requestPublic<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBase = getPlatformApiBase();
  let resp: Response;
  try {
    resp = await fetch(`${apiBase}${path}`, {
      headers: {
        "Content-Type": "application/json",
        "x-user-role": runtimeActorRole,
        "x-actor-id": runtimeActorId,
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch {
    throw new Error(`无法连接平台 API (${apiBase})，请先启动 apps/executable-spec-web/server/platform-api.ts`);
  }

  const { rawText, jsonBody } = await readResponsePayload(resp);
  if (!jsonBody) {
    throw new Error(`平台 API 返回了非 JSON 响应 (${path})`);
  }
  const envelope = jsonBody as unknown as PublicApiEnvelope<T>;
  if (!resp.ok || !envelope.ok) {
    const code = (envelope as PublicApiEnvelopeError).error?.code ?? "PUBLIC_INTERNAL_ERROR";
    const message = (envelope as PublicApiEnvelopeError).error?.message ?? rawText.trim() ?? `${resp.status} ${resp.statusText}`;
    throw new Error(`[${code}] ${message}`);
  }
  return envelope.data;
}

export function publicRegisterMarkdownSpec(payload: {
  markdown: string;
  source?: "template" | "pdf" | "markdown";
  riskWarnings?: ExtractionWarning[];
  originalDraftMarkdown?: string;
  editedMarkdown?: string;
  clauseReviewItems?: ClauseReviewItem[];
}) {
  return requestPublic<Record<string, unknown>>("/api/public/v1/specs/register-markdown", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publicPublishSpu(payload: { definition: SPUDefinition }) {
  return requestPublic<{ item: SPUDefinition }>("/api/public/v1/spus/publish", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publicExecute(payload: {
  spuId?: string;
  containerId?: string;
  nodeId?: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  externalInput?: {
    sourceId?: string;
    recordIndex?: number;
    strict?: boolean;
  };
}) {
  return requestPublic<Record<string, unknown>>("/api/public/v1/executions/evaluate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publicGetProof(containerId: string) {
  return requestPublic<{
    proof: ContainerProof;
    layerPegDocument?: LayerPegDocument | null;
    standardOutput?: LayerPegStandardOutput | null;
  }>(`/api/public/v1/proofs/${encodeURIComponent(containerId)}`);
}

export function publicGetMappingByStake(stake: string) {
  return requestPublic<{ item: MappingEntry }>(`/api/public/v1/mappings/by-stake?stake=${encodeURIComponent(stake)}`);
}

export function publicGetMappingMinimalByStake(stake: string) {
  return requestPublic<{ item: MappingMinimalStakeView }>(`/api/public/v1/mappings/minimal/by-stake?stake=${encodeURIComponent(stake)}`);
}

export function publicGetMappingByContainerId(containerId: string) {
  return requestPublic<{ item: MappingEntry }>(`/api/public/v1/mappings/by-container/${encodeURIComponent(containerId)}`);
}

export function publicGetMappingByNodeId(nodeId: string) {
  return requestPublic<{ item: MappingEntry }>(`/api/public/v1/mappings/by-node/${encodeURIComponent(nodeId)}`);
}

export function publicExportProofAuditPackage(payload: { nodeId?: string; containerId?: string }) {
  return requestPublic<ProofAuditExportResponse>("/api/public/v1/proofs/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function publicArchiveAndExportProofAcceptance(payload: { containerId: string; anchor?: AnchorStepRequest }) {
  return requestPublic<ProofArchiveExportResponse>("/api/public/v1/proofs/archive-export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export { API_BASE };
