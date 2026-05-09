import { randomUUID } from "node:crypto";

import { EventStore } from "../audit/event-store.ts";
import { AUDIT_EVENT } from "../audit/events.ts";
import {
  buildNormExecutionState,
  getNextExecutableSpec,
  type NormExecutionState,
  type NormRef,
} from "../norm/normref-execution.ts";
import type { LayerPegDocType, LayerPegDocument } from "../../layerpeg/document.ts";
import { NormRegistry, type PublishSpuVersionOptions, type SpuVersionRecord, type SpuVersionSelector } from "../norm/registry.ts";
import { buildContainerProof } from "../proof/proof-service.ts";
import {
  computeFinalProofHash,
  readProofAnchorReference,
  readProofChainLink,
  readProofHash,
} from "../proof/proof-chain.ts";
import {
  MockAnchorProvider,
  type AnchorProvider,
  type AnchorProviderStatus,
  type AnchorReceipt,
  type AnchorVerifyResult,
} from "../proof/anchor-service.ts";
import { ExecutionEngine } from "../runtime/execution-engine.ts";
import {
  classifyExecutionFailureStage,
  ExecutionLogService,
  type ExecutionLog,
} from "../runtime/execution-log.ts";
import {
  computeNextExecutableTasks,
  parseStation,
  scheduleProject,
  type CSDNextExecutableTaskResult,
  type CSDSchedulerInput,
  type CSDTaskStatus,
  type ProjectScheduleDecision,
  type ProjectSchedulerContainerInput,
  type ProjectSchedulerInput,
} from "../scheduler/csd-scheduler.ts";
import {
  deriveSpuKey,
  ensureSpuSemanticVersion,
  formatSemanticVersion,
  normalizeCompatibilityPolicy,
  summarizeSpuVersionDiff,
  type SpuVersionDiffSummary,
} from "../versioning/spu-versioning.ts";
import { buildSpecImpactAnalysis, type SpecImpactAnalysis } from "../../spec-compiler/impact/index.ts";
import {
  getSpuCrossDomainProfile,
  type CrossDomainSpuProfile,
} from "../domain/domain-adapter.ts";
import {
  buildContainerVuri,
  buildNodeVuri,
  buildProofVuri,
  readProjectIdFromVuri,
} from "../vuri/vuri.ts";
import type {
  ContainerProof,
  ContainerSpecBinding,
  EntityType,
  ExternalInputMappingRule,
  ExternalInputSource,
  ExternalInputSourceType,
  ExternalInputValidationStatus,
  ExecutionNode,
  MappingActiveProof,
  MappingActiveSpec,
  MappingContainerRef,
  MappingEntry,
  MappingMinimalStakeView,
  MappingNodeRef,
  MappingStateSummary,
  FinalProof,
  PlatformState,
  ProofAnchorReference,
  ProofChainDependencyRef,
  ProofChainLink,
  ProjectContext,
  ProjectContextOverrides,
  ProjectContextSummary,
  ProjectSpuVersionBinding,
  SPUDefinition,
  SpuClassification,
  SpecExecutionStatus,
  SpaceContainer,
  SpaceSlot,
} from "../types.ts";

export interface LayerPegDocumentRecord {
  usi: string;
  docType: LayerPegDocType;
  sourceRef: string;
  updatedAt: string;
  document: LayerPegDocument;
}

export interface PlatformServiceOptions {
  registry?: NormRegistry;
  executionEngine?: ExecutionEngine;
  eventStore?: EventStore;
  executionLogs?: ExecutionLogService;
  anchorProviders?: AnchorProvider[];
}

export interface AnchorStepOptions {
  enabled?: boolean;
  providerName?: string;
}

export interface FinalizeNodeOptions {
  anchor?: AnchorStepOptions;
}

export interface ArchiveContainerOptions {
  anchor?: AnchorStepOptions;
}

export interface ProofChainLineageEntry {
  proofId: string;
  proofHash: string;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  timestamp: string;
}

export interface ProofChainDependencyCheck {
  dependency: ProofChainDependencyRef;
  exists: boolean;
  hashMatched: boolean | null;
}

export interface ProofVerificationResult {
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
  dependencies: ProofChainDependencyCheck[];
  lineage: ProofChainLineageEntry[];
  issues: string[];
  anchorCheck: AnchorVerifyResult | null;
}

export interface RuntimeMinimalSpuState {
  spuId: string;
  status: SpecExecutionStatus;
  dependsOn: string[];
  latestNodeId: string | null;
  latestNodeStatus: ExecutionNode["status"] | null;
}

export interface RuntimeMinimalNextSuggestion {
  action: "EXECUTE" | "RETRY_FAILED" | "WAIT" | "ARCHIVE_READY";
  nextSpuId: string | null;
  reason: string;
  blockedBy: string[];
}

export interface RuntimeMinimalContainerView {
  containerId: string;
  lifecycleState: SpaceContainer["lifecycleState"];
  overallStatus: SpaceContainer["overallStatus"];
  runtimePhase: SpaceContainer["runtime"]["phase"];
  spuStates: RuntimeMinimalSpuState[];
  nextSuggestion: RuntimeMinimalNextSuggestion;
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
  bindingStatus: ContainerSpecBinding["status"];
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
  diffSummary: SpuVersionDiffSummary;
  specImpactAnalysis: SpecImpactAnalysis;
  affectedSpuIds: string[];
  affectedProjectIds: string[];
  affectedExecutions: SpecPatchAffectedExecution[];
  pendingRetests: SpecPatchPendingRetest[];
  summary: SpecPatchSummary;
}

export interface ApplySpecPatchPayload {
  oldSpuId: string;
  newDefinition: SPUDefinition;
  note?: string;
  invalidatePreviousResults?: boolean;
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

export interface SpecPatchRerunSummary {
  totalCandidates: number;
  rerunTriggered: number;
  skipped: number;
  failed: number;
}

export interface SpecPatchRerunResult {
  patchId: string;
  startedAt: string;
  completedAt: string;
  items: SpecPatchRerunItemResult[];
  summary: SpecPatchRerunSummary;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function finalStatusToBinding(status: ExecutionNode["status"]): ContainerSpecBinding["status"] {
  if (status === "FINAL_PASS") {
    return "PASS";
  }
  if (status === "FINAL_FAIL") {
    return "FAIL";
  }
  if (status === "DRAFT") {
    return "DRAFT";
  }
  return "RUNNING";
}

function ensureFinalStatus(status: ExecutionNode["status"]): "FINAL_PASS" | "FINAL_FAIL" | null {
  if (status === "FINAL_PASS" || status === "FINAL_FAIL") {
    return status;
  }
  return null;
}

interface ProofRecordRef {
  proof: FinalProof;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  timestamp: string;
}

interface ProjectContextRecord {
  projectId: string;
  overrides: ProjectContextOverrides;
  createdAt: string;
  updatedAt: string;
}

function emptyProjectOverrides(): ProjectContextOverrides {
  return {
    global: {},
    bySpuKey: {},
    bySpuId: {},
  };
}

function normalizeScalarMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, mapValue]) => [key.trim(), mapValue] as const)
    .filter(([key]) => key.length > 0);
  return Object.fromEntries(entries);
}

function normalizeNestedScalarMap(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    normalized[key] = normalizeScalarMap(rawValue);
  }
  return normalized;
}

function normalizeSourceId(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed || `external-source-${randomUUID()}`;
}

function isInputFilled(value: unknown): boolean {
  if (value === null || typeof value === "undefined") {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

function coerceExternalValue(
  value: unknown,
  expectedType: "number" | "string" | "boolean",
): { ok: boolean; value: unknown } {
  if (expectedType === "string") {
    if (value === null || typeof value === "undefined") {
      return { ok: false, value };
    }
    return { ok: true, value: String(value) };
  }
  if (expectedType === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return { ok: false, value };
    }
    return { ok: true, value: numeric };
  }
  if (typeof value === "boolean") {
    return { ok: true, value };
  }
  if (typeof value === "number") {
    return { ok: true, value: value !== 0 };
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return { ok: true, value: true };
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return { ok: true, value: false };
    }
  }
  return { ok: false, value };
}

function mergeProjectOverrides(
  base: ProjectContextOverrides,
  patch?: Partial<ProjectContextOverrides>,
): ProjectContextOverrides {
  if (!patch) {
    return {
      global: { ...base.global },
      bySpuKey: Object.fromEntries(
        Object.entries(base.bySpuKey).map(([spuKey, values]) => [spuKey, { ...values }]),
      ),
      bySpuId: Object.fromEntries(
        Object.entries(base.bySpuId).map(([spuId, values]) => [spuId, { ...values }]),
      ),
    };
  }

  const normalizedGlobal = normalizeScalarMap(patch.global);
  const normalizedBySpuKey = normalizeNestedScalarMap(patch.bySpuKey);
  const normalizedBySpuId = normalizeNestedScalarMap(patch.bySpuId);

  const nextBySpuKey: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(base.bySpuKey).map(([spuKey, values]) => [spuKey, { ...values }]),
  );
  for (const [spuKey, values] of Object.entries(normalizedBySpuKey)) {
    nextBySpuKey[spuKey] = {
      ...(nextBySpuKey[spuKey] ?? {}),
      ...values,
    };
  }

  const nextBySpuId: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(base.bySpuId).map(([spuId, values]) => [spuId, { ...values }]),
  );
  for (const [spuId, values] of Object.entries(normalizedBySpuId)) {
    nextBySpuId[spuId] = {
      ...(nextBySpuId[spuId] ?? {}),
      ...values,
    };
  }

  return {
    global: {
      ...base.global,
      ...normalizedGlobal,
    },
    bySpuKey: nextBySpuKey,
    bySpuId: nextBySpuId,
  };
}

export class PlatformService {
  private readonly registry: NormRegistry;
  private readonly executionEngine: ExecutionEngine;
  private readonly eventStore: EventStore;
  private readonly executionLogs: ExecutionLogService;
  private readonly anchorProviders = new Map<string, AnchorProvider>();

  private readonly state: PlatformState = {
    slots: {},
    containers: {},
    nodes: {},
    proofs: {},
    externalInputSources: {},
    mappingEntries: {},
  };
  private readonly layerPegDocuments = new Map<string, LayerPegDocumentRecord>();
  private readonly projectBindings = new Map<string, Map<string, ProjectSpuVersionBinding>>();
  private readonly projectBindingHistory = new Map<string, ProjectSpuVersionBinding[]>();
  private readonly projectContexts = new Map<string, ProjectContextRecord>();
  private readonly specPatchRecords = new Map<string, SpecUpdatePatchRecord>();

  constructor(options: PlatformServiceOptions = {}) {
    this.registry = options.registry ?? new NormRegistry();
    this.executionEngine = options.executionEngine ?? new ExecutionEngine();
    this.eventStore = options.eventStore ?? new EventStore();
    this.executionLogs = options.executionLogs ?? new ExecutionLogService();
    const providers = options.anchorProviders && options.anchorProviders.length > 0
      ? options.anchorProviders
      : [new MockAnchorProvider()];
    for (const provider of providers) {
      const key = provider.providerName.trim();
      if (!key) {
        throw new Error("anchor provider name is required");
      }
      if (this.anchorProviders.has(key)) {
        throw new Error(`duplicate anchor provider: ${key}`);
      }
      this.anchorProviders.set(key, provider);
    }
    if (this.anchorProviders.size === 0) {
      throw new Error("at least one anchor provider is required");
    }
    this.executionEngine.setExecutionLogService(this.executionLogs);
  }

  getRegistry(): SPUDefinition[] {
    return this.registry.list();
  }

  listSpusByClassification(classification: SpuClassification): SPUDefinition[] {
    return this.registry
      .list()
      .filter((item) => getSpuCrossDomainProfile(item).classification === classification);
  }

  getSpuCrossDomainProfile(spuId: string): CrossDomainSpuProfile | null {
    const spu = this.registry.get(spuId);
    if (!spu) {
      return null;
    }
    return getSpuCrossDomainProfile(spu);
  }

  importSpuDefinition(definitionText: string, sourceType: SPUDefinition["sourceType"] = "imported"): SPUDefinition {
    return this.registry.loadFromText(definitionText, sourceType);
  }

  publishSpuVersion(definition: SPUDefinition, options: PublishSpuVersionOptions = {}): SPUDefinition {
    return this.registry.publish(definition, options);
  }

  publishSpuVersionFromText(
    definitionText: string,
    sourceType: SPUDefinition["sourceType"] = "compiled",
    options: PublishSpuVersionOptions = {},
  ): SPUDefinition {
    return this.registry.publishFromText(definitionText, sourceType, options);
  }

  listSpuVersionRecords(spuKey?: string): SpuVersionRecord[] {
    return this.registry.listVersionRecords(spuKey);
  }

  getLatestSpuVersion(spuKey: string): SPUDefinition | null {
    return this.registry.getLatestBySpuKey(spuKey);
  }

  resolveSpuVersion(spuKey: string, selector: SpuVersionSelector = { latest: true }): SPUDefinition | null {
    return this.registry.resolveBySpuKey(spuKey, selector);
  }

  summarizeSpuVersionDiff(fromSpuId: string, toSpuId: string): SpuVersionDiffSummary {
    const from = this.mustSpu(fromSpuId);
    const to = this.mustSpu(toSpuId);
    return summarizeSpuVersionDiff(from, to);
  }

  listSpecUpdatePatches(): SpecUpdatePatchRecord[] {
    return Array.from(this.specPatchRecords.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => deepClone(item));
  }

  getSpecUpdatePatch(patchId: string): SpecUpdatePatchRecord | null {
    const normalized = patchId.trim();
    if (!normalized) {
      return null;
    }
    const item = this.specPatchRecords.get(normalized);
    return item ? deepClone(item) : null;
  }

  applySpecPatch(payload: ApplySpecPatchPayload): SpecUpdatePatchRecord {
    const oldSpuId = payload.oldSpuId.trim();
    if (!oldSpuId) {
      throw new Error("oldSpuId is required");
    }
    const oldSpu = this.mustSpu(oldSpuId);
    const oldSpuKey = deriveSpuKey(oldSpu.spuId);
    const newSpuKey = deriveSpuKey(payload.newDefinition.spuId);
    if (!newSpuKey) {
      throw new Error("newDefinition.spuId is required");
    }
    if (oldSpuKey !== newSpuKey) {
      throw new Error(`spec patch must keep same spuKey: ${oldSpuKey} -> ${newSpuKey}`);
    }

    const published = this.publishSpuVersion(payload.newDefinition);
    const patchId = `spec_patch_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const invalidatePreviousResults = payload.invalidatePreviousResults !== false;
    const reboundProjectIds = this.rebindProjectBindingsAfterSpecPatch(
      oldSpuKey,
      oldSpuId,
      published.spuId,
      patchId,
      payload.note,
    );

    if (invalidatePreviousResults) {
      this.invalidateExecutionsBySpecPatch({
        patchId,
        oldSpuId,
        newSpuId: published.spuId,
      });
    }

    const snapshot = this.collectSpecPatchImpactSnapshot({
      oldSpuId,
      newSpuId: published.spuId,
      patchId,
      oldVersion: oldSpu.meta.version,
    });
    const impactedProjects = Array.from(new Set([...snapshot.affectedProjectIds, ...reboundProjectIds]));
    const createdAt = nowIso();
    const record: SpecUpdatePatchRecord = {
      patchId,
      spuKey: oldSpuKey,
      oldSpuId,
      oldVersion: oldSpu.meta.version,
      newSpuId: published.spuId,
      newVersion: published.meta.version,
      note: payload.note?.trim() || undefined,
      createdAt,
      updatedAt: createdAt,
      lastRerunAt: null,
      invalidatePreviousResults,
      diffSummary: summarizeSpuVersionDiff(oldSpu, published),
      specImpactAnalysis: buildSpecImpactAnalysis(oldSpu, published),
      affectedSpuIds: snapshot.affectedSpuIds,
      affectedProjectIds: impactedProjects,
      affectedExecutions: snapshot.affectedExecutions,
      pendingRetests: snapshot.pendingRetests,
      summary: this.buildSpecPatchSummary(snapshot.affectedExecutions, snapshot.pendingRetests, snapshot.affectedSpuIds, impactedProjects),
    };
    this.specPatchRecords.set(record.patchId, deepClone(record));
    return deepClone(record);
  }

  rerunSpecUpdatePatch(payload: {
    patchId: string;
    autoSignRequired?: boolean;
    maxItems?: number;
  }): SpecPatchRerunResult {
    const patchId = payload.patchId.trim();
    if (!patchId) {
      throw new Error("patchId is required");
    }
    const record = this.specPatchRecords.get(patchId);
    if (!record) {
      throw new Error(`spec patch not found: ${patchId}`);
    }

    const snapshot = this.collectSpecPatchImpactSnapshot({
      oldSpuId: record.oldSpuId,
      newSpuId: record.newSpuId,
      patchId: record.patchId,
      oldVersion: record.oldVersion,
    });
    const maxItems = Number.isInteger(payload.maxItems) && Number(payload.maxItems) > 0
      ? Number(payload.maxItems)
      : snapshot.pendingRetests.length;
    const candidates = snapshot.pendingRetests.slice(0, maxItems);
    const autoSignRequired = payload.autoSignRequired !== false;
    const startedAt = nowIso();
    const items = candidates.map((item) => this.rerunSpecPatchRetestItem({
      item,
      patchId: record.patchId,
      autoSignRequired,
    }));
    const completedAt = nowIso();

    const summary: SpecPatchRerunSummary = {
      totalCandidates: candidates.length,
      rerunTriggered: items.filter((item) => item.status === "rerun_triggered").length,
      skipped: items.filter((item) => item.status === "skipped").length,
      failed: items.filter((item) => item.status === "failed").length,
    };

    const refreshed = this.collectSpecPatchImpactSnapshot({
      oldSpuId: record.oldSpuId,
      newSpuId: record.newSpuId,
      patchId: record.patchId,
      oldVersion: record.oldVersion,
    });
    const updatedRecord: SpecUpdatePatchRecord = {
      ...record,
      updatedAt: completedAt,
      lastRerunAt: completedAt,
      affectedSpuIds: refreshed.affectedSpuIds,
      affectedProjectIds: refreshed.affectedProjectIds,
      affectedExecutions: refreshed.affectedExecutions,
      pendingRetests: refreshed.pendingRetests,
      summary: this.buildSpecPatchSummary(
        refreshed.affectedExecutions,
        refreshed.pendingRetests,
        refreshed.affectedSpuIds,
        refreshed.affectedProjectIds,
      ),
    };
    this.specPatchRecords.set(patchId, updatedRecord);

    return {
      patchId,
      startedAt,
      completedAt,
      items,
      summary,
    };
  }

  bindProjectSpuVersion(payload: {
    projectId: string;
    spuKey: string;
    selector?: SpuVersionSelector;
    note?: string;
  }): ProjectSpuVersionBinding {
    const projectId = payload.projectId.trim();
    const spuKey = payload.spuKey.trim();
    if (!projectId) {
      throw new Error("projectId is required");
    }
    if (!spuKey) {
      throw new Error("spuKey is required");
    }
    const resolved = this.registry.resolveBySpuKey(spuKey, payload.selector ?? { latest: true });
    if (!resolved) {
      throw new Error(`spu version not found: ${spuKey}`);
    }
    const semver = ensureSpuSemanticVersion(resolved);
    const binding: ProjectSpuVersionBinding = {
      projectId,
      spuKey,
      activeSpuId: resolved.spuId,
      version: formatSemanticVersion(semver),
      semanticVersion: semver,
      compatibilityPolicy: normalizeCompatibilityPolicy(resolved.meta.compatibilityPolicy),
      boundAt: nowIso(),
      note: payload.note,
    };
    const bySpuKey = this.projectBindings.get(projectId) ?? new Map<string, ProjectSpuVersionBinding>();
    bySpuKey.set(spuKey, binding);
    this.projectBindings.set(projectId, bySpuKey);
    const history = this.projectBindingHistory.get(projectId) ?? [];
    history.push(binding);
    this.projectBindingHistory.set(projectId, history);
    this.touchProjectContext(projectId);
    return deepClone(binding);
  }

  rollbackProjectSpuVersion(payload: {
    projectId: string;
    spuKey: string;
    targetVersion: string;
    note?: string;
  }): ProjectSpuVersionBinding {
    return this.bindProjectSpuVersion({
      projectId: payload.projectId,
      spuKey: payload.spuKey,
      selector: {
        version: payload.targetVersion,
      },
      note: payload.note ?? "rollback",
    });
  }

  getProjectSpuBinding(projectId: string, spuKey: string): ProjectSpuVersionBinding | null {
    const bySpuKey = this.projectBindings.get(projectId.trim());
    if (!bySpuKey) {
      return null;
    }
    const binding = bySpuKey.get(spuKey.trim()) ?? null;
    return binding ? deepClone(binding) : null;
  }

  listProjectSpuBindings(projectId: string): ProjectSpuVersionBinding[] {
    const bySpuKey = this.projectBindings.get(projectId.trim());
    if (!bySpuKey) {
      return [];
    }
    return Array.from(bySpuKey.values())
      .sort((a, b) => a.spuKey.localeCompare(b.spuKey, "en"))
      .map((item) => deepClone(item));
  }

  listProjectSpuBindingHistory(projectId: string, spuKey?: string): ProjectSpuVersionBinding[] {
    const history = this.projectBindingHistory.get(projectId.trim()) ?? [];
    const filtered = spuKey?.trim()
      ? history.filter((item) => item.spuKey === spuKey.trim())
      : history;
    return filtered.map((item) => deepClone(item));
  }

  resolveProjectEffectiveSpu(projectId: string, spuKey: string): SPUDefinition | null {
    const binding = this.getProjectSpuBinding(projectId, spuKey);
    if (binding) {
      return this.registry.get(binding.activeSpuId);
    }
    return this.registry.getLatestBySpuKey(spuKey);
  }

  getCurrentEffectiveVersion(projectId: string, spuKey: string): {
    source: "project_binding" | "latest";
    spuId: string;
    version: string;
  } | null {
    const binding = this.getProjectSpuBinding(projectId, spuKey);
    if (binding) {
      return {
        source: "project_binding",
        spuId: binding.activeSpuId,
        version: binding.version,
      };
    }
    const latest = this.registry.getLatestBySpuKey(spuKey);
    if (!latest) {
      return null;
    }
    return {
      source: "latest",
      spuId: latest.spuId,
      version: formatSemanticVersion(ensureSpuSemanticVersion(latest)),
    };
  }

  upsertProjectContext(payload: {
    projectId: string;
    overrides?: Partial<ProjectContextOverrides>;
  }): ProjectContext {
    const projectId = payload.projectId.trim();
    if (!projectId) {
      throw new Error("projectId is required");
    }
    const current = this.ensureProjectContext(projectId);
    current.overrides = mergeProjectOverrides(current.overrides, payload.overrides);
    current.updatedAt = nowIso();
    this.projectContexts.set(projectId, current);
    return this.buildProjectContext(projectId);
  }

  getProjectContext(projectId: string): ProjectContext | null {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return null;
    }
    if (!this.hasProject(normalizedProjectId)) {
      return null;
    }
    this.ensureProjectContext(normalizedProjectId);
    return this.buildProjectContext(normalizedProjectId);
  }

  listProjectContexts(): ProjectContextSummary[] {
    const projectIds = this.collectProjectIds();
    return projectIds.map((projectId) => {
      const context = this.buildProjectContext(projectId);
      return {
        projectId: context.projectId,
        boundSpuVersionCount: context.boundSpuVersions.length,
        activeContainerCount: context.activeContainers.length,
        updatedAt: context.updatedAt,
      };
    });
  }

  resolveProjectExecutionSpuId(projectId: string | null | undefined, requestedSpuId: string): string {
    const normalizedSpuId = requestedSpuId.trim();
    const normalizedProjectId = projectId?.trim();
    if (!normalizedSpuId) {
      throw new Error("spuId is required");
    }
    if (!normalizedProjectId) {
      return normalizedSpuId;
    }
    const binding = this.getProjectSpuBinding(normalizedProjectId, deriveSpuKey(normalizedSpuId));
    if (!binding) {
      return normalizedSpuId;
    }
    return binding.activeSpuId;
  }

  resolveProjectExecutionInputs(params: {
    projectId?: string | null;
    spuId: string;
    inputs: Record<string, unknown>;
  }): {
    mergedInputs: Record<string, unknown>;
    appliedOverrideKeys: string[];
  } {
    const normalizedProjectId = params.projectId?.trim();
    if (!normalizedProjectId) {
      return {
        mergedInputs: deepClone(params.inputs),
        appliedOverrideKeys: [],
      };
    }
    const context = this.getProjectContext(normalizedProjectId);
    if (!context) {
      return {
        mergedInputs: deepClone(params.inputs),
        appliedOverrideKeys: [],
      };
    }

    const normalizedSpuId = params.spuId.trim();
    const spuKey = deriveSpuKey(normalizedSpuId);
    const globalOverrides = context.overrides.global ?? {};
    const keyOverrides = context.overrides.bySpuKey[spuKey] ?? {};
    const spuOverrides = context.overrides.bySpuId[normalizedSpuId] ?? {};
    const appliedOverrides = {
      ...globalOverrides,
      ...keyOverrides,
      ...spuOverrides,
    };
    const appliedOverrideKeys = Object.keys(appliedOverrides);

    return {
      mergedInputs: {
        ...params.inputs,
        ...appliedOverrides,
      },
      appliedOverrideKeys,
    };
  }

  listExternalInputSources(): ExternalInputSource[] {
    return Object.values(this.state.externalInputSources)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => deepClone(item));
  }

  getExternalInputSource(sourceId: string): ExternalInputSource | null {
    const normalizedSourceId = sourceId.trim();
    if (!normalizedSourceId) {
      return null;
    }
    const source = this.state.externalInputSources[normalizedSourceId];
    return source ? deepClone(source) : null;
  }

  upsertExternalInputSource(payload: {
    sourceId?: string;
    sourceType: ExternalInputSourceType;
    mappingRules: ExternalInputMappingRule[];
    validationStatus: ExternalInputValidationStatus;
    records: Array<Record<string, unknown>>;
    sourceRef?: string;
  }): ExternalInputSource {
    const sourceId = normalizeSourceId(payload.sourceId);
    const existing = this.state.externalInputSources[sourceId];
    const timestamp = nowIso();
    const source: ExternalInputSource = {
      sourceId,
      sourceType: payload.sourceType,
      mappingRules: deepClone(payload.mappingRules),
      validationStatus: deepClone(payload.validationStatus),
      records: deepClone(payload.records),
      sourceRef: payload.sourceRef?.trim() || undefined,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.state.externalInputSources[sourceId] = source;
    return deepClone(source);
  }

  resolveExternalSourceInputs(params: {
    sourceId: string;
    spuId: string;
    recordIndex?: number;
    inputs?: Record<string, unknown>;
    strict?: boolean;
  }): {
    source: ExternalInputSource;
    recordIndex: number;
    record: Record<string, unknown>;
    mappedInputs: Record<string, unknown>;
    missingInputs: string[];
  } {
    const sourceId = params.sourceId.trim();
    if (!sourceId) {
      throw new Error("sourceId is required");
    }
    const source = this.state.externalInputSources[sourceId];
    if (!source) {
      throw new Error(`external input source not found: ${sourceId}`);
    }
    const strict = params.strict !== false;
    if (strict && source.validationStatus.status === "invalid") {
      throw new Error(`external input source is invalid: ${sourceId}`);
    }
    if (!Array.isArray(source.records) || source.records.length === 0) {
      throw new Error(`external input source has no records: ${sourceId}`);
    }

    const recordIndex = Number.isInteger(params.recordIndex) ? Number(params.recordIndex) : 0;
    if (recordIndex < 0 || recordIndex >= source.records.length) {
      throw new Error(`external record index out of range: ${recordIndex}`);
    }

    const spu = this.mustSpu(params.spuId);
    const record = source.records[recordIndex] ?? {};
    const mappedInputs: Record<string, unknown> = {};
    const missingRequiredMappings: string[] = [];

    for (const rule of source.mappingRules) {
      const targetInput = rule.targetInput.trim();
      if (!targetInput) {
        continue;
      }
      const fieldDef = spu.data.inputs.find((item) => item.name === targetInput) ?? null;
      if (!fieldDef) {
        if (strict) {
          throw new Error(`mapping targetInput not found in SPU.inputs: ${targetInput}`);
        }
        continue;
      }
      const sourceField = rule.sourceField.trim();
      const sourceValue = sourceField ? record[sourceField] : undefined;
      const hasSourceValue = isInputFilled(sourceValue);
      const candidateValue = hasSourceValue ? sourceValue : rule.defaultValue;
      if (!isInputFilled(candidateValue)) {
        if (rule.required) {
          missingRequiredMappings.push(targetInput);
        }
        continue;
      }

      const expectedType = rule.typeHint && rule.typeHint !== "auto" ? rule.typeHint : fieldDef.type;
      const coerced = coerceExternalValue(candidateValue, expectedType);
      if (!coerced.ok) {
        if (strict) {
          throw new Error(`cannot coerce external field ${sourceField} to ${expectedType}`);
        }
        continue;
      }
      mappedInputs[targetInput] = coerced.value;
    }

    if (missingRequiredMappings.length > 0 && strict) {
      throw new Error(`required mapped inputs missing: ${missingRequiredMappings.join(", ")}`);
    }

    const mergedInputs = {
      ...mappedInputs,
      ...(params.inputs ?? {}),
    };
    const missingInputs = spu.data.inputs
      .map((item) => item.name)
      .filter((name) => !isInputFilled(mergedInputs[name]));

    return {
      source: deepClone(source),
      recordIndex,
      record: deepClone(record),
      mappedInputs: mergedInputs,
      missingInputs,
    };
  }

  listMappingEntries(filter?: { projectId?: string; stake?: string }): MappingEntry[] {
    this.ensureMappingCoverage();
    const projectId = filter?.projectId?.trim();
    const stake = filter?.stake?.trim();
    return Object.values(this.state.mappingEntries)
      .filter((item) => {
        if (projectId && item.projectId !== projectId) {
          return false;
        }
        if (stake && item.stake !== stake && item.location.station !== stake) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.currentStateSummary.updatedAt.localeCompare(a.currentStateSummary.updatedAt))
      .map((item) => deepClone(item));
  }

  queryMappingByStake(stake: string): MappingEntry | null {
    const normalizedStake = stake.trim();
    if (!normalizedStake) {
      return null;
    }
    this.ensureMappingCoverage();
    const matched = Object.values(this.state.mappingEntries)
      .filter((item) => item.stake === normalizedStake || item.location.station === normalizedStake)
      .sort((a, b) => b.currentStateSummary.updatedAt.localeCompare(a.currentStateSummary.updatedAt));
    return matched[0] ? deepClone(matched[0]) : null;
  }

  queryMappingMinimalByStake(stake: string): MappingMinimalStakeView | null {
    const normalizedStake = stake.trim();
    if (!normalizedStake) {
      return null;
    }
    const entries = this.listMappingEntries({ stake: normalizedStake });
    if (entries.length === 0) {
      return null;
    }

    const containers = entries
      .map((entry) => {
        const container = entry.containerRefs[0];
        if (!container) {
          return null;
        }
        const proofItems = [...entry.activeProofs]
          .sort((left, right) => (right.generatedAt ?? "").localeCompare(left.generatedAt ?? "", "en"));
        const latestProof = proofItems[0] ?? null;
        return {
          container: deepClone(container),
          spuExecutionStatuses: [...entry.activeSpecs].sort((a, b) => a.spuId.localeCompare(b.spuId, "en")),
          proofSummary: {
            latestProofId: latestProof?.proofId ?? null,
            latestProofStatus: latestProof?.status ?? null,
            totalProofs: proofItems.length,
            items: proofItems,
          },
          currentStateSummary: deepClone(entry.currentStateSummary),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.container.containerId.localeCompare(b.container.containerId, "en"));

    if (containers.length === 0) {
      return null;
    }

    let draftSpuCount = 0;
    let runningSpuCount = 0;
    let passSpuCount = 0;
    let failSpuCount = 0;
    let totalSpuCount = 0;
    let totalProofCount = 0;
    let lastUpdatedAt: string | null = null;

    for (const item of containers) {
      totalSpuCount += item.spuExecutionStatuses.length;
      totalProofCount += item.proofSummary.totalProofs;
      const updatedAt = item.currentStateSummary.updatedAt;
      if (!lastUpdatedAt || updatedAt.localeCompare(lastUpdatedAt, "en") > 0) {
        lastUpdatedAt = updatedAt;
      }
      for (const spec of item.spuExecutionStatuses) {
        if (spec.bindingStatus === "PASS") {
          passSpuCount += 1;
        } else if (spec.bindingStatus === "FAIL") {
          failSpuCount += 1;
        } else if (spec.bindingStatus === "RUNNING") {
          runningSpuCount += 1;
        } else {
          draftSpuCount += 1;
        }
      }
    }

    return {
      stake: normalizedStake,
      containers,
      summary: {
        containerCount: containers.length,
        totalSpuCount,
        draftSpuCount,
        runningSpuCount,
        passSpuCount,
        failSpuCount,
        totalProofCount,
        lastUpdatedAt,
      },
    };
  }

  queryMappingByContainerId(containerId: string): MappingEntry | null {
    const normalizedContainerId = containerId.trim();
    if (!normalizedContainerId) {
      return null;
    }
    const container = this.state.containers[normalizedContainerId];
    if (!container) {
      return null;
    }
    return deepClone(this.upsertMappingEntryForContainer(container.containerId));
  }

  queryMappingByNodeId(nodeId: string): MappingEntry | null {
    const normalizedNodeId = nodeId.trim();
    if (!normalizedNodeId) {
      return null;
    }
    const node = this.state.nodes[normalizedNodeId];
    if (!node) {
      return null;
    }
    this.syncNodeVuri(node);
    if (node.containerRef?.trim()) {
      return this.queryMappingByContainerId(node.containerRef);
    }

    const activeProofs: MappingActiveProof[] = node.proof
      ? [
          {
            proofKind: "node_final",
            proofId: node.proof.proofId,
            vuri: node.proof.vuri,
            executionId: node.proof.executionId,
            containerId: node.proof.containerId,
            nodeId: node.proof.nodeId,
            status: node.proof.status,
            hash: node.proof.hash ?? null,
            generatedAt: node.proof.generatedAt,
          },
        ]
      : [];
    const latestProof = activeProofs[0] ?? null;
    const fallbackSummary: MappingStateSummary = {
      lifecycleState: "DRAFT",
      overallStatus: "PENDING",
      runtimePhase: "idle",
      currentSpuId: node.spuId,
      currentNodeId: node.nodeId,
      latestNodeId: node.nodeId,
      latestNodeStatus: node.status,
      latestProofId: latestProof?.proofId ?? null,
      latestProofStatus: latestProof?.status ?? null,
      updatedAt: nowIso(),
    };
    return {
      mappingId: `mapping:node:${node.nodeId}`,
      projectId: null,
      stake: null,
      location: {
        geoSlotRef: "",
        station: null,
        chainage: null,
        x: null,
        y: null,
        elevation: null,
        alignment: null,
      },
      containerRefs: [],
      nodeRefs: [
        {
          nodeId: node.nodeId,
          containerId: null,
          vuri: node.vuri,
          spuId: node.spuId,
          status: node.status,
          attemptIndex: node.attemptIndex,
          updatedAt: node.updatedAt,
        },
      ],
      activeSpecs: [],
      activeProofs,
      currentStateSummary: fallbackSummary,
    };
  }

  importSlot(payload: {
    station: string;
    chainage: number;
    x: number;
    y: number;
    elevation: number;
    alignment?: string;
    sourceFile: string;
  }): SpaceSlot {
    const existed = Object.values(this.state.slots).find((item) => item.geo.station === payload.station);
    if (existed) {
      return deepClone(existed);
    }
    const slotId = `slot-${payload.station}`;
    const slot: SpaceSlot = {
      slotId,
      vAddress: `v://space/slot/${payload.station}`,
      slotType: "geo_reference",
      geo: {
        station: payload.station,
        chainage: payload.chainage,
        x: payload.x,
        y: payload.y,
        elevation: payload.elevation,
        alignment: payload.alignment,
      },
      createdFrom: payload.sourceFile,
      isStatic: true,
    };
    this.state.slots[slotId] = slot;
    this.pushAudit("container", slotId, AUDIT_EVENT.SLOT_IMPORTED, { slot });
    return deepClone(slot);
  }

  createContainer(payload: {
    containerId?: string;
    projectId?: string;
    geoSlotRef: string;
    inspector?: string;
    supervisor?: string;
    autoBindSpuIds?: string[];
    autoBindSpuKeys?: string[];
  }): SpaceContainer {
    const slot = this.state.slots[payload.geoSlotRef];
    if (!slot) {
      throw new Error(`slot not found: ${payload.geoSlotRef}`);
    }
    if (payload.containerId && this.state.containers[payload.containerId]) {
      const existing = this.state.containers[payload.containerId];
      this.mustEditable(existing);
      this.ensureRuntime(existing);
      if (typeof payload.projectId === "string") {
        const normalizedProjectId = payload.projectId.trim() || null;
        existing.projectId = normalizedProjectId;
        if (normalizedProjectId) {
          this.touchProjectContext(normalizedProjectId);
        }
      }
      this.syncContainerVuri(existing);
      for (const spuId of payload.autoBindSpuIds ?? []) {
        this.bindSpu(existing.containerId, spuId);
      }
      for (const spuKey of payload.autoBindSpuKeys ?? []) {
        this.bindSpuByKey(existing.containerId, spuKey, existing.projectId ?? undefined);
      }
      this.recomputeContainer(existing, "manual", "container_reconfigured");
      this.upsertMappingEntryForContainer(existing.containerId);
      return this.getContainer(existing.containerId)!;
    }

    const containerId = payload.containerId ?? `container_${randomUUID()}`;
    const container: SpaceContainer = {
      containerId,
      projectId: payload.projectId?.trim() || null,
      vAddress: `v://space/container/${containerId}`,
      vuri: buildContainerVuri({
        projectId: payload.projectId?.trim() || null,
        containerId,
      }),
      geoSlotRef: slot.vAddress,
      lifecycleState: "DRAFT",
      locked: false,
      runtime: {
        currentSpuId: null,
        currentNodeId: null,
        phase: "idle",
      },
      tripBinding: {
        inspector: payload.inspector,
        supervisor: payload.supervisor,
      },
      specBindings: [],
      overallStatus: "PENDING",
    };
    this.state.containers[containerId] = container;
    if (container.projectId) {
      this.touchProjectContext(container.projectId);
    }
    this.pushAudit("container", containerId, AUDIT_EVENT.CONTAINER_CREATED, { container });

    for (const spuId of payload.autoBindSpuIds ?? []) {
      this.bindSpu(containerId, spuId);
    }
    for (const spuKey of payload.autoBindSpuKeys ?? []) {
      this.bindSpuByKey(containerId, spuKey, container.projectId ?? undefined);
    }
    this.upsertMappingEntryForContainer(containerId);
    return this.getContainer(containerId)!;
  }

  bindSpu(containerId: string, spuId: string): SpaceContainer {
    const container = this.mustContainer(containerId);
    this.mustEditable(container);
    const spu = this.mustSpu(spuId);
    if (!container.specBindings.some((item) => item.spuId === spuId)) {
      const semver = ensureSpuSemanticVersion(spu);
      container.specBindings.push({
        spuId,
        spuKey: deriveSpuKey(spu.spuId),
        version: formatSemanticVersion(semver),
        semanticVersion: semver,
        status: "DRAFT",
        latestNodeId: undefined,
        historyNodeIds: [],
      });
      this.pushAudit("container", containerId, AUDIT_EVENT.SPU_BOUND, { spuId });
      this.recomputeContainer(container, "manual", "spu_bound");
    }
    this.upsertMappingEntryForContainer(containerId);
    return this.getContainer(containerId)!;
  }

  unbindSpu(containerId: string, spuId: string): SpaceContainer {
    const container = this.mustContainer(containerId);
    this.mustEditable(container);
    const normalizedSpuId = spuId.trim();
    if (!normalizedSpuId) {
      throw new Error("spuId is required");
    }
    const previousLength = container.specBindings.length;
    container.specBindings = container.specBindings.filter((item) => item.spuId !== normalizedSpuId);
    if (container.specBindings.length === previousLength) {
      return this.getContainer(containerId)!;
    }
    if (container.runtime.currentSpuId === normalizedSpuId) {
      container.runtime.currentSpuId = null;
      container.runtime.currentNodeId = null;
      container.runtime.phase = "idle";
    }
    this.recomputeContainer(container, "manual", "spu_unbound");
    this.pushAudit("container", containerId, AUDIT_EVENT.CONTAINER_STATE_CHANGED, {
      trigger: "manual",
      reason: "spu_unbound",
      spuId: normalizedSpuId,
    });
    this.upsertMappingEntryForContainer(containerId);
    return this.getContainer(containerId)!;
  }

  bindSpuByKey(containerId: string, spuKey: string, projectId?: string): SpaceContainer {
    const container = this.mustContainer(containerId);
    this.mustEditable(container);
    const resolvedProjectId = projectId?.trim() || container.projectId || null;
    const effective = resolvedProjectId
      ? this.resolveProjectEffectiveSpu(resolvedProjectId, spuKey)
      : this.registry.getLatestBySpuKey(spuKey);
    if (!effective) {
      throw new Error(`spu key not found: ${spuKey}`);
    }
    return this.bindSpu(containerId, effective.spuId);
  }

  createNode(payload: { containerId: string; spuId: string }): ExecutionNode {
    const container = this.mustContainer(payload.containerId);
    this.mustEditable(container);
    this.mustSpu(payload.spuId);
    const specState = this.buildContainerSpecExecutionState(container);
    const node = specState[payload.spuId] === "fail"
      ? this.restartFailedSpec(container, payload.spuId)
      : this.startSpecExecution(container, payload.spuId);
    this.recomputeContainer(container, "manual", "node_created");
    this.upsertMappingEntryForContainer(container.containerId);
    return deepClone(node);
  }

  createNodeByKey(payload: { containerId: string; spuKey: string; projectId?: string }): ExecutionNode {
    const container = this.mustContainer(payload.containerId);
    const resolvedProjectId = payload.projectId?.trim() || container.projectId || null;
    const effective = resolvedProjectId
      ? this.resolveProjectEffectiveSpu(resolvedProjectId, payload.spuKey)
      : this.registry.getLatestBySpuKey(payload.spuKey);
    if (!effective) {
      throw new Error(`spu key not found: ${payload.spuKey}`);
    }
    return this.createNode({
      containerId: payload.containerId,
      spuId: effective.spuId,
    });
  }

  submitNode(nodeId: string, inputs: Record<string, unknown>): ExecutionNode {
    const current = this.mustNode(nodeId);
    const container = current.containerRef ? this.mustContainer(current.containerRef) : null;
    if (!container) {
      throw new Error(`container missing for node: ${nodeId}`);
    }
    this.mustEditable(container);
    const next = this.executeSpec(container, current.spuId, inputs);
    this.recomputeContainer(container, "gate", "node_submitted");
    this.upsertMappingEntryForContainer(container.containerId);
    return deepClone(next);
  }

  signNode(nodeId: string, role: string): ExecutionNode {
    const current = this.mustNode(nodeId);
    if (!current.containerRef) {
      throw new Error(`container missing for node: ${nodeId}`);
    }
    const container = this.mustContainer(current.containerRef);
    this.mustEditable(container);
    const next = this.signSpec(container, current.spuId, role);
    this.recomputeContainer(container, "manual", "node_signed");
    this.upsertMappingEntryForContainer(container.containerId);
    return deepClone(next);
  }

  finalizeNode(nodeId: string, options: FinalizeNodeOptions = {}): ExecutionNode {
    const current = this.mustNode(nodeId);
    if (!current.containerRef) {
      throw new Error(`container missing for node: ${nodeId}`);
    }
    const container = this.mustContainer(current.containerRef);
    this.mustEditable(container);
    let next = this.finalizeSpec(container, current.spuId);
    next = this.attachNodeProofChain(next);
    next = this.tryAnchorNode(next, options.anchor);
    this.recomputeContainer(container, "manual", "node_finalized");
    this.upsertMappingEntryForContainer(container.containerId);
    return deepClone(next);
  }

  archiveContainer(containerId: string, options: ArchiveContainerOptions = {}): ContainerProof {
    const container = this.mustContainer(containerId);
    this.mustEditable(container);
    this.recomputeContainer(container, "manual", "container_archive_requested");
    if (container.lifecycleState !== "VERIFIED") {
      throw new Error(`container must be VERIFIED before archive, current: ${container.lifecycleState}`);
    }
    const archiveExecutionId = `archive_${container.containerId}_${Date.now()}`;
    this.executionLogs.startExecution({
      executionId: archiveExecutionId,
      requestSummary: {
        source: "PlatformService.archiveContainer",
        intent: "archive",
        containerId: container.containerId,
        nodeId: null,
        spuId: "container:aggregate",
        inputKeys: [],
        inputCount: 0,
      },
      matchedSpu: {
        spuId: "container:aggregate",
        version: "aggregate@v1",
      },
    });
    this.executionLogs.markCheckpoint(archiveExecutionId, "archive_started");

    const latestNodesBySpu: ExecutionNode[] = container.specBindings.map((binding) => {
      if (!binding.latestNodeId) {
        throw new Error(`latestNodeId missing for ${binding.spuId}`);
      }
      const node = this.mustNode(binding.latestNodeId);
      if (!ensureFinalStatus(node.status)) {
        throw new Error(`node is not finalized: ${node.nodeId}`);
      }
      return node;
    });
    const attemptsBySpu = Object.fromEntries(
      container.specBindings.map((binding) => [
        binding.spuId,
        binding.historyNodeIds.map((nodeId) => this.mustNode(nodeId)),
      ]),
    ) as Record<string, ExecutionNode[]>;

    const trail = this.eventStore.listByContainerWithNodes(
      container.containerId,
      container.specBindings.flatMap((binding) => binding.historyNodeIds),
    );
    let proof: ContainerProof;
    try {
      proof = buildContainerProof({
        container,
        latestNodesBySpu,
        attemptsBySpu,
        auditTrail: trail,
        executionId: archiveExecutionId,
      });
    } catch (reason) {
      this.executionLogs.captureError({
        executionId: archiveExecutionId,
        stage: "proof_aggregation",
        reason,
      });
      throw reason;
    }
    this.executionLogs.setGateDecisionSummary(archiveExecutionId, {
      status: proof.status,
      passed: proof.status === "PASS",
      totalRules: proof.specResults.length,
      passedRules: proof.specResults.filter((item) => item.status === "PASS").length,
      failedRules: proof.specResults.filter((item) => item.status !== "PASS").length,
      failedRuleIds: proof.specResults.filter((item) => item.status !== "PASS").map((item) => item.spuId),
    });
    this.executionLogs.addInputOutputSnapshot(archiveExecutionId, {
      label: "after_proof_aggregation",
      input: {
        containerId: container.containerId,
        latestNodeCount: latestNodesBySpu.length,
      },
      output: {
        proofId: proof.proofId,
        overallStatus: proof.overallStatus,
      },
    });
    this.executionLogs.markCheckpoint(archiveExecutionId, "proof_aggregated");
    proof = this.attachContainerProofChain(proof, latestNodesBySpu);
    proof = this.tryAnchorContainerProof(proof, options.anchor, archiveExecutionId);

    container.lifecycleState = "ARCHIVED";
    container.locked = true;
    this.state.proofs[container.containerId] = deepClone(proof);
    this.executionLogs.addStateTransition(archiveExecutionId, {
      scope: "CONTAINER",
      from: "VERIFIED",
      to: "ARCHIVED",
      reason: "container_archived",
    });
    this.executionLogs.markCompleted(archiveExecutionId);
    this.pushAudit("container", container.containerId, AUDIT_EVENT.CONTAINER_ARCHIVED, {
      proofHash: proof.hash,
    });
    this.upsertMappingEntryForContainer(container.containerId);
    return deepClone(proof);
  }

  getContainer(containerId: string): SpaceContainer | null {
    const container = this.state.containers[containerId];
    return container ? deepClone(container) : null;
  }

  listContainers(): Array<{ container: SpaceContainer; nodes: ExecutionNode[]; slot: SpaceSlot | null }> {
    return Object.values(this.state.containers)
      .map((container) => ({
        container: deepClone(container),
        nodes: this.getContainerNodes(container.containerId),
        slot: Object.values(this.state.slots).find((slot) => slot.vAddress === container.geoSlotRef) ?? null,
      }))
      .sort((a, b) => a.container.containerId.localeCompare(b.container.containerId));
  }

  getNode(nodeId: string): ExecutionNode | null {
    const node = this.state.nodes[nodeId];
    return node ? deepClone(node) : null;
  }

  getContainerNodes(containerId: string): ExecutionNode[] {
    const container = this.mustContainer(containerId);
    return container.specBindings
      .flatMap((binding) => binding.historyNodeIds)
      .map((nodeId) => this.mustNode(nodeId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((node) => deepClone(node));
  }

  getProof(containerId: string): ContainerProof | null {
    const proof = this.state.proofs[containerId];
    return proof ? deepClone(proof) : null;
  }

  verifyProof(params: {
    nodeId?: string;
    containerId?: string;
    proofId?: string;
    verifyAnchor?: boolean;
    providerName?: string;
  }): ProofVerificationResult {
    const nodeId = params.nodeId?.trim() ?? "";
    const containerId = params.containerId?.trim() ?? "";
    const proofId = params.proofId?.trim() ?? "";
    const providedCount = [nodeId, containerId, proofId].filter(Boolean).length;
    if (providedCount !== 1) {
      throw new Error("exactly one of nodeId, containerId, proofId is required");
    }

    const target = nodeId
      ? this.getProofRecordByNodeId(nodeId)
      : containerId
        ? this.getProofRecordByContainerId(containerId)
        : this.getProofRecordByProofId(proofId);
    if (!target) {
      throw new Error("proof not found");
    }

    const proof = target.proof;
    const issues: string[] = [];
    const storedHash = readProofHash(proof);
    const computedHash = computeFinalProofHash(proof);
    const hashMatched = Boolean(storedHash) && storedHash === computedHash;
    if (!storedHash) {
      issues.push("proof hash missing");
    } else if (!hashMatched) {
      issues.push("proof hash mismatch");
    }

    const chain = readProofChainLink(proof);
    const proofRecords = this.listProofRecordsByContainer(target.containerId);
    const proofMap = new Map<string, ProofRecordRef>(
      proofRecords.map((item) => [item.proof.proofId, item]),
    );
    const dependencyChecks: ProofChainDependencyCheck[] = [];
    let chainVerified = true;
    let previousProofId: string | null = null;
    let previousProofHash: string | null = null;

    if (!chain) {
      chainVerified = false;
      issues.push("proof chain link missing");
    } else {
      previousProofId = chain.previousProofId;
      previousProofHash = chain.previousProofHash;
      if (chain.chainId.trim().length === 0) {
        chainVerified = false;
        issues.push("proof chainId is empty");
      }

      if (chain.previousProofId || chain.previousProofHash) {
        const previous =
          (chain.previousProofId ? proofMap.get(chain.previousProofId) : null) ??
          (chain.previousProofHash
            ? proofRecords.find((item) => readProofHash(item.proof) === chain.previousProofHash) ?? null
            : null);
        if (!previous) {
          chainVerified = false;
          issues.push("previous proof reference not found");
        } else {
          const previousHash = readProofHash(previous.proof);
          if (chain.previousProofHash && previousHash !== chain.previousProofHash) {
            chainVerified = false;
            issues.push("previous proof hash mismatch");
          }
        }
      }

      for (const dependency of chain.dependencies) {
        const found = proofMap.get(dependency.proofId) ?? null;
        if (!found) {
          dependencyChecks.push({
            dependency,
            exists: false,
            hashMatched: null,
          });
          chainVerified = false;
          issues.push(`dependency proof not found: ${dependency.proofId}`);
          continue;
        }
        const dependencyHash = readProofHash(found.proof);
        const dependencyMatched = Boolean(dependencyHash) && dependencyHash === dependency.proofHash;
        dependencyChecks.push({
          dependency,
          exists: true,
          hashMatched: dependencyMatched,
        });
        if (!dependencyMatched) {
          chainVerified = false;
          issues.push(`dependency proof hash mismatch: ${dependency.proofId}`);
        }
      }
    }

    const lineage = this.buildProofLineage(proof.proofId, proofMap);
    const anchorRef = readProofAnchorReference(proof);
    let anchorCheck: AnchorVerifyResult | null = null;
    let anchorVerified: boolean | null = null;
    if (params.verifyAnchor || anchorRef) {
      if (!anchorRef) {
        anchorVerified = false;
        issues.push("anchor reference missing");
      } else {
        anchorCheck = this.verifyAnchor(
          anchorRef.anchorRef,
          params.providerName?.trim() || anchorRef.providerName || undefined,
        );
        if (anchorCheck.status !== "ANCHORED") {
          anchorVerified = false;
          issues.push("anchor verify failed: NOT_FOUND");
        } else if (anchorCheck.hash && storedHash && anchorCheck.hash !== storedHash) {
          anchorVerified = false;
          issues.push("anchor hash mismatch");
        } else {
          anchorVerified = true;
        }
      }
    }

    const verified = hashMatched && chainVerified && (anchorVerified !== false);

    return {
      proofId: proof.proofId,
      source: target.source,
      nodeId: target.nodeId,
      containerId: target.containerId,
      chainId: chain?.chainId ?? null,
      verified,
      hashMatched,
      chainVerified,
      anchorVerified,
      storedHash,
      computedHash,
      previousProofId,
      previousProofHash,
      dependencies: dependencyChecks,
      lineage,
      issues,
      anchorCheck,
    };
  }

  listAnchorProviderStatuses(): AnchorProviderStatus[] {
    return Array.from(this.anchorProviders.values()).map((provider) => provider.status());
  }

  verifyAnchor(anchorRef: string, providerName?: string): AnchorVerifyResult {
    const normalizedRef = anchorRef.trim();
    if (!normalizedRef) {
      throw new Error("anchorRef is required");
    }
    if (providerName?.trim()) {
      try {
        return this.resolveAnchorProvider(providerName).verify(normalizedRef);
      } catch {
        return {
          providerName: providerName.trim(),
          anchorRef: normalizedRef,
          hash: null,
          anchoredAt: null,
          status: "NOT_FOUND",
        };
      }
    }
    let fallback: AnchorVerifyResult | null = null;
    for (const provider of this.anchorProviders.values()) {
      let result: AnchorVerifyResult;
      try {
        result = provider.verify(normalizedRef);
      } catch {
        result = {
          providerName: provider.providerName,
          anchorRef: normalizedRef,
          hash: null,
          anchoredAt: null,
          status: "NOT_FOUND",
        };
      }
      if (!fallback) {
        fallback = result;
      }
      if (result.status === "ANCHORED") {
        return result;
      }
    }
    return fallback ?? {
      providerName: "unknown",
      anchorRef: normalizedRef,
      hash: null,
      anchoredAt: null,
      status: "NOT_FOUND",
    };
  }

  getExecutionLog(executionId: string): ExecutionLog | null {
    return this.executionLogs.getExecutionLog(executionId);
  }

  listExecutionLogs(): ExecutionLog[] {
    return this.executionLogs.listExecutionLogs();
  }

  getExecutionLogService(): ExecutionLogService {
    return this.executionLogs;
  }

  getAudit(entityType: EntityType, entityId: string) {
    return this.eventStore.listByEntity(entityType, entityId).map((item) => deepClone(item));
  }

  getContainerAuditTrail(containerId: string) {
    const container = this.mustContainer(containerId);
    const nodeIds = container.specBindings.flatMap((binding) => binding.historyNodeIds);
    return this.eventStore
      .listByContainerWithNodes(containerId, nodeIds)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((item) => deepClone(item));
  }

  getDashboard() {
    const containers = Object.values(this.state.containers);
    const archivedCount = containers.filter((item) => item.lifecycleState === "ARCHIVED").length;
    const pendingCount = containers.filter((item) => item.lifecycleState !== "ARCHIVED").length;
    return {
      totalContainers: containers.length,
      archivedCount,
      pendingCount,
      verifiedCount: containers.filter((item) => item.lifecycleState === "VERIFIED").length,
      registryCount: this.registry.list().length,
    };
  }

  evaluateSpuDirect(params: {
    spuId: string;
    inputs: Record<string, unknown>;
    containerRef?: string;
    autoSign?: boolean;
  }): ExecutionNode {
    const spu = this.mustSpu(params.spuId);
    const shouldAutoSign = params.autoSign ?? true;
    const directContainer = params.containerRef ? (this.state.containers[params.containerRef] ?? null) : null;
    let node = this.executionEngine.createNode({
      spu,
      containerRef: params.containerRef,
      attemptIndex: 1,
    });
    node.vuri = buildNodeVuri({
      projectId: directContainer?.projectId ?? null,
      containerId: params.containerRef ?? null,
      nodeId: node.nodeId,
    });
    this.executionLogs.setRequestSummary(node.nodeId, {
      source: "PlatformService.evaluateSpuDirect",
      intent: "gate.evaluate",
      containerId: params.containerRef ?? null,
      nodeId: node.nodeId,
      spuId: params.spuId,
      inputKeys: Object.keys(params.inputs),
      inputCount: Object.keys(params.inputs).length,
    });
    this.executionLogs.setMatchedSpu(node.nodeId, {
      spuId: spu.spuId,
      version: spu.meta.version,
      norm: spu.meta.norm,
      clause: spu.meta.clause,
    });
    this.executionLogs.markCheckpoint(node.nodeId, "evaluate_spu_direct_start");
    try {
      node = this.executionEngine.submitForm(node, params.inputs, spu);
      node = this.executionEngine.executePath(node, spu);
      node = this.executionEngine.evaluateRules(node, spu);
      if (shouldAutoSign && node.gate.passed) {
        for (const role of spu.proof.requiredSignatures) {
          node = this.executionEngine.sign(node, role);
        }
      }
      if (!node.gate.passed || shouldAutoSign) {
        node = this.executionEngine.finalize(node, spu);
      }
      if (node.status === "FINAL_PASS" || node.status === "FINAL_FAIL") {
        this.executionLogs.markCompleted(node.nodeId);
      }
      return deepClone(node);
    } catch (reason) {
      this.executionLogs.captureError({
        executionId: node.nodeId,
        stage: classifyExecutionFailureStage(reason),
        reason,
      });
      throw reason;
    }
  }

  upsertLayerPegDocument(document: LayerPegDocument, sourceRef: string): LayerPegDocumentRecord {
    const usi = document.header.usi.trim();
    if (!usi) {
      throw new Error("LayerPeg document usi is required");
    }
    const record: LayerPegDocumentRecord = {
      usi,
      docType: document.header.docType,
      sourceRef: sourceRef.trim(),
      updatedAt: nowIso(),
      document: deepClone(document),
    };
    this.layerPegDocuments.set(usi, record);
    return deepClone(record);
  }

  getLayerPegDocument(usi: string): LayerPegDocumentRecord | null {
    const normalized = usi.trim();
    if (!normalized) {
      return null;
    }
    const record = this.layerPegDocuments.get(normalized);
    return record ? deepClone(record) : null;
  }

  listLayerPegDocuments(filter?: {
    docType?: LayerPegDocType;
    sourceRefPrefix?: string;
  }): LayerPegDocumentRecord[] {
    const docType = filter?.docType?.trim();
    const sourceRefPrefix = filter?.sourceRefPrefix?.trim();
    return Array.from(this.layerPegDocuments.values())
      .filter((item) => {
        if (docType && item.docType !== docType) {
          return false;
        }
        if (sourceRefPrefix && !item.sourceRef.startsWith(sourceRefPrefix)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => deepClone(item));
  }

  getSchedulerNext(containerId: string): CSDNextExecutableTaskResult & { containerId: string; input: CSDSchedulerInput } {
    const container = this.mustContainer(containerId);
    const input = this.buildContainerSchedulerInput(container);
    const result = computeNextExecutableTasks(input);
    return {
      containerId: container.containerId,
      input,
      nextTasks: result.nextTasks,
      decision: result.decision,
    };
  }

  getProjectScheduler(): ProjectScheduleDecision & { input: ProjectSchedulerInput } {
    const containerInputs = Object.values(this.state.containers).map((container) => {
      const schedulerInput = this.buildContainerSchedulerInput(container);
      const status = this.resolveProjectContainerStatus(container, schedulerInput.tasks);
      return {
        containerId: this.resolveContainerStation(container),
        tasks: schedulerInput.tasks,
        normRef: schedulerInput.normRef,
        status,
      };
    });
    const currentStation = this.resolveCurrentProjectStation(containerInputs);
    const mergedInputs = this.ensureMultiContainerInputs(containerInputs, currentStation);
    const input: ProjectSchedulerInput = {
      containers: mergedInputs,
    };
    const decision = scheduleProject(input);
    return {
      ...decision,
      input,
    };
  }

  getRuntimeMinimal(containerId: string): RuntimeMinimalContainerView {
    const container = this.mustContainer(containerId);
    const specExecutionState = this.buildContainerSpecExecutionState(container);
    const schedulerInput = this.buildContainerSchedulerInput(container);
    const scheduler = computeNextExecutableTasks(schedulerInput);
    const spuStates: RuntimeMinimalSpuState[] = container.specBindings.map((binding, index) => {
      const dependsOn = container.specBindings.slice(0, index).map((item) => item.spuId);
      const latestNode = binding.latestNodeId ? this.state.nodes[binding.latestNodeId] ?? null : null;
      return {
        spuId: binding.spuId,
        status: specExecutionState[binding.spuId] ?? "blocked",
        dependsOn,
        latestNodeId: binding.latestNodeId ?? null,
        latestNodeStatus: latestNode?.status ?? null,
      };
    });
    return {
      containerId: container.containerId,
      lifecycleState: container.lifecycleState,
      overallStatus: container.overallStatus,
      runtimePhase: container.runtime.phase,
      spuStates,
      nextSuggestion: {
        action: scheduler.decision.action,
        nextSpuId: scheduler.decision.nextTask,
        reason: scheduler.decision.reason,
        blockedBy: scheduler.decision.blockedBy ?? [],
      },
    };
  }

  private readSpecPatchInvalidationPatchId(proof: FinalProof | null | undefined): string | null {
    if (!proof?.extensions || typeof proof.extensions !== "object") {
      return null;
    }
    const raw = (proof.extensions as Record<string, unknown>).specPatchInvalidation;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return null;
    }
    const patchId = String((raw as Record<string, unknown>).patchId ?? "").trim();
    return patchId || null;
  }

  private buildSpecPatchSummary(
    affectedExecutions: SpecPatchAffectedExecution[],
    pendingRetests: SpecPatchPendingRetest[],
    affectedSpuIds: string[],
    affectedProjectIds: string[],
  ): SpecPatchSummary {
    return {
      affectedSpuCount: affectedSpuIds.length,
      affectedProjectCount: affectedProjectIds.length,
      affectedExecutionCount: affectedExecutions.length,
      invalidatedExecutionCount: affectedExecutions.filter((item) => item.invalidated).length,
      pendingRetestCount: pendingRetests.length,
      autoRerunReadyCount: pendingRetests.filter((item) => item.canAutoRerun).length,
    };
  }

  private collectSpecPatchImpactSnapshot(params: {
    oldSpuId: string;
    newSpuId: string;
    patchId: string;
    oldVersion: string;
  }): {
    affectedSpuIds: string[];
    affectedProjectIds: string[];
    affectedExecutions: SpecPatchAffectedExecution[];
    pendingRetests: SpecPatchPendingRetest[];
  } {
    const oldSpuId = params.oldSpuId;
    const newSpuId = params.newSpuId;
    const patchId = params.patchId;
    const oldSpuKey = deriveSpuKey(oldSpuId);
    const affectedSpuIds = this.registry.listBySpuKey(oldSpuKey).map((item) => item.spuId);
    const affectedExecutionRows: SpecPatchAffectedExecution[] = [];
    const affectedProjectIds = new Set<string>();

    for (const node of Object.values(this.state.nodes)) {
      if (node.spuId !== oldSpuId) {
        continue;
      }
      const invalidatedPatchId = this.readSpecPatchInvalidationPatchId(node.proof);
      const matchedSpecVersion = node.proof?.matchedSpecVersion ?? params.oldVersion;
      const finalizedAt = node.proof?.timestamps.finalizedAt ?? null;
      affectedExecutionRows.push({
        recordId: `node:${node.nodeId}`,
        recordType: "node",
        proofId: node.proof?.proofId ?? null,
        nodeId: node.nodeId,
        containerId: node.containerRef ?? null,
        spuId: oldSpuId,
        status: node.proof?.status ?? node.status,
        matchedSpecVersion,
        finalizedAt,
        invalidated: invalidatedPatchId === patchId,
      });
      const projectId = node.containerRef ? this.state.containers[node.containerRef]?.projectId ?? null : null;
      if (projectId?.trim()) {
        affectedProjectIds.add(projectId.trim());
      }
    }

    for (const proof of Object.values(this.state.proofs)) {
      if (!proof.specResults.some((item) => item.spuId === oldSpuId)) {
        continue;
      }
      const invalidatedPatchId = this.readSpecPatchInvalidationPatchId(proof);
      const finalizedAt = proof.timestamps.archivedAt ?? proof.timestamps.finalizedAt ?? null;
      affectedExecutionRows.push({
        recordId: `container_proof:${proof.containerId}`,
        recordType: "container_proof",
        proofId: proof.proofId,
        nodeId: null,
        containerId: proof.containerId,
        spuId: oldSpuId,
        status: proof.status,
        matchedSpecVersion: proof.matchedSpecVersion,
        finalizedAt,
        invalidated: invalidatedPatchId === patchId,
      });
      const projectId = this.state.containers[proof.containerId]?.projectId ?? null;
      if (projectId?.trim()) {
        affectedProjectIds.add(projectId.trim());
      }
    }

    const pendingRetests: SpecPatchPendingRetest[] = [];
    for (const container of Object.values(this.state.containers)) {
      const binding = container.specBindings.find((item) => item.spuId === oldSpuId) ?? null;
      if (!binding) {
        continue;
      }
      const latestProof = this.state.proofs[container.containerId] ?? null;
      pendingRetests.push({
        containerId: container.containerId,
        projectId: container.projectId?.trim() || null,
        oldSpuId,
        newSpuId,
        bindingStatus: binding.status,
        latestNodeId: binding.latestNodeId ?? null,
        latestProofId: latestProof?.proofId ?? null,
        canAutoRerun: container.lifecycleState !== "ARCHIVED" && !container.locked && !this.hasActiveNode(container),
        reason: `spec patched ${oldSpuId} -> ${newSpuId}`,
      });
      if (container.projectId?.trim()) {
        affectedProjectIds.add(container.projectId.trim());
      }
    }

    return {
      affectedSpuIds,
      affectedProjectIds: Array.from(affectedProjectIds).sort((a, b) => a.localeCompare(b, "en")),
      affectedExecutions: affectedExecutionRows.sort((left, right) => {
        const leftAt = left.finalizedAt ?? "";
        const rightAt = right.finalizedAt ?? "";
        const byTime = rightAt.localeCompare(leftAt, "en");
        if (byTime !== 0) {
          return byTime;
        }
        return left.recordId.localeCompare(right.recordId, "en");
      }),
      pendingRetests: pendingRetests.sort((left, right) => left.containerId.localeCompare(right.containerId, "en")),
    };
  }

  private rebindProjectBindingsAfterSpecPatch(
    spuKey: string,
    oldSpuId: string,
    newSpuId: string,
    patchId: string,
    note?: string,
  ): string[] {
    const affectedProjects: string[] = [];
    for (const [projectId, bySpuKey] of this.projectBindings.entries()) {
      const current = bySpuKey.get(spuKey);
      if (!current || current.activeSpuId !== oldSpuId) {
        continue;
      }
      this.bindProjectSpuVersion({
        projectId,
        spuKey,
        selector: { spuId: newSpuId },
        note: note?.trim() || `spec patch applied: ${patchId}`,
      });
      affectedProjects.push(projectId);
    }
    return affectedProjects.sort((a, b) => a.localeCompare(b, "en"));
  }

  private invalidateExecutionsBySpecPatch(params: {
    patchId: string;
    oldSpuId: string;
    newSpuId: string;
  }): void {
    const invalidatedAt = nowIso();
    const changedContainers = new Set<string>();
    const invalidationMeta = {
      patchId: params.patchId,
      oldSpuId: params.oldSpuId,
      newSpuId: params.newSpuId,
      invalidatedAt,
    };

    for (const node of Object.values(this.state.nodes)) {
      if (node.spuId !== params.oldSpuId) {
        continue;
      }
      node.outputs = {
        ...node.outputs,
        __resultValidity: "INVALIDATED",
        __invalidatedPatchId: params.patchId,
      };
      if (node.proof) {
        node.proof = {
          ...node.proof,
          extensions: {
            ...(node.proof.extensions ?? {}),
            specPatchInvalidation: invalidationMeta,
            resultValidity: "INVALIDATED",
          },
        };
      }
      node.updatedAt = invalidatedAt;
      this.pushAudit("node", node.nodeId, "NODE_RESULT_INVALIDATED", invalidationMeta);

      if (!node.containerRef) {
        continue;
      }
      const container = this.state.containers[node.containerRef];
      if (!container) {
        continue;
      }
      const binding = container.specBindings.find((item) => item.spuId === params.oldSpuId);
      if (binding?.latestNodeId === node.nodeId && container.lifecycleState !== "ARCHIVED" && !container.locked) {
        binding.status = "DRAFT";
        if (container.runtime.phase === "completed") {
          container.runtime.phase = "idle";
        }
        if (!container.runtime.currentSpuId) {
          container.runtime.currentSpuId = params.oldSpuId;
        }
      }
      changedContainers.add(container.containerId);
    }

    for (const proof of Object.values(this.state.proofs)) {
      if (!proof.specResults.some((item) => item.spuId === params.oldSpuId)) {
        continue;
      }
      proof.extensions = {
        ...(proof.extensions ?? {}),
        specPatchInvalidation: invalidationMeta,
        resultValidity: "INVALIDATED",
      };
      this.pushAudit("container", proof.containerId, "CONTAINER_PROOF_INVALIDATED", invalidationMeta);
      changedContainers.add(proof.containerId);
    }

    for (const containerId of changedContainers.values()) {
      const container = this.state.containers[containerId];
      if (!container) {
        continue;
      }
      if (container.lifecycleState !== "ARCHIVED" && !container.locked) {
        this.recomputeContainer(container, "manual", "spec_patch_invalidated");
      }
      this.upsertMappingEntryForContainer(containerId);
    }
  }

  private rerunSpecPatchRetestItem(params: {
    item: SpecPatchPendingRetest;
    patchId: string;
    autoSignRequired: boolean;
  }): SpecPatchRerunItemResult {
    const { item } = params;
    const container = this.state.containers[item.containerId];
    if (!container) {
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "skipped",
        reason: "container not found",
        nodeId: null,
        finalNodeStatus: null,
      };
    }
    if (container.lifecycleState === "ARCHIVED" || container.locked) {
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "skipped",
        reason: "container archived or locked",
        nodeId: null,
        finalNodeStatus: null,
      };
    }
    if (this.hasActiveNode(container)) {
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "skipped",
        reason: "container has active execution",
        nodeId: null,
        finalNodeStatus: null,
      };
    }

    const newSpu = this.mustSpu(item.newSpuId);
    const switched = this.switchContainerBindingToSpu(container, item.oldSpuId, newSpu);
    if (!switched) {
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "skipped",
        reason: "container does not bind target spu",
        nodeId: null,
        finalNodeStatus: null,
      };
    }

    const previousNode = switched.latestNodeId ? this.state.nodes[switched.latestNodeId] ?? null : null;
    const previousInputs = previousNode ? { ...previousNode.inputs } : {};
    switched.status = "DRAFT";
    container.runtime.currentSpuId = newSpu.spuId;
    container.runtime.currentNodeId = null;
    if (container.runtime.phase === "completed") {
      container.runtime.phase = "idle";
    }
    this.recomputeContainer(container, "manual", "spec_patch_rerun_requested");

    try {
      const created = this.createNode({
        containerId: container.containerId,
        spuId: newSpu.spuId,
      });
      let current = this.submitNode(created.nodeId, previousInputs);
      if (current.status === "SIGNING" && params.autoSignRequired) {
        for (const role of current.requiredSignatures) {
          if (!current.signedBy.includes(role)) {
            current = this.signNode(current.nodeId, role);
          }
        }
      }
      if (current.status === "SIGNING") {
        const allSigned = current.requiredSignatures.every((role) => current.signedBy.includes(role));
        if (allSigned) {
          current = this.finalizeNode(current.nodeId);
        }
      } else if (current.status === "FAIL") {
        current = this.finalizeNode(current.nodeId);
      }
      this.pushAudit("container", container.containerId, "SPEC_PATCH_RETEST_TRIGGERED", {
        patchId: params.patchId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        nodeId: current.nodeId,
      });
      this.upsertMappingEntryForContainer(container.containerId);
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "rerun_triggered",
        reason: "rerun completed",
        nodeId: current.nodeId,
        finalNodeStatus: current.status,
      };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      this.pushAudit("container", container.containerId, "SPEC_PATCH_RETEST_FAILED", {
        patchId: params.patchId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        reason: message,
      });
      this.upsertMappingEntryForContainer(container.containerId);
      return {
        containerId: item.containerId,
        projectId: item.projectId,
        oldSpuId: item.oldSpuId,
        newSpuId: item.newSpuId,
        status: "failed",
        reason: message,
        nodeId: null,
        finalNodeStatus: null,
      };
    }
  }

  private switchContainerBindingToSpu(
    container: SpaceContainer,
    oldSpuId: string,
    newSpu: SPUDefinition,
  ): ContainerSpecBinding | null {
    const oldIndex = container.specBindings.findIndex((item) => item.spuId === oldSpuId);
    const newIndex = container.specBindings.findIndex((item) => item.spuId === newSpu.spuId);
    if (oldIndex < 0 && newIndex < 0) {
      return null;
    }

    let target: ContainerSpecBinding | null = null;
    if (newIndex >= 0) {
      target = container.specBindings[newIndex] ?? null;
    }
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      const oldBinding = container.specBindings[oldIndex];
      const mergedHistory = Array.from(new Set([...(target?.historyNodeIds ?? []), ...oldBinding.historyNodeIds]));
      if (target) {
        target.historyNodeIds = mergedHistory;
        if (!target.latestNodeId && oldBinding.latestNodeId) {
          target.latestNodeId = oldBinding.latestNodeId;
        }
      }
      container.specBindings.splice(oldIndex, 1);
    } else if (oldIndex >= 0 && newIndex < 0) {
      target = container.specBindings[oldIndex] ?? null;
    }
    if (!target) {
      return null;
    }

    const semver = ensureSpuSemanticVersion(newSpu);
    target.spuId = newSpu.spuId;
    target.spuKey = deriveSpuKey(newSpu.spuId);
    target.version = formatSemanticVersion(semver);
    target.semanticVersion = semver;
    if (container.runtime.currentSpuId === oldSpuId) {
      container.runtime.currentSpuId = newSpu.spuId;
    }
    return target;
  }

  private ensureMappingCoverage(): void {
    for (const containerId of Object.keys(this.state.containers)) {
      if (!this.state.mappingEntries[containerId]) {
        this.upsertMappingEntryForContainer(containerId);
      }
    }
  }

  private upsertMappingEntryForContainer(containerId: string): MappingEntry {
    const container = this.state.containers[containerId];
    if (!container) {
      throw new Error(`container not found: ${containerId}`);
    }
    const entry = this.buildMappingEntry(container);
    this.state.mappingEntries[containerId] = entry;
    return entry;
  }

  private buildMappingEntry(container: SpaceContainer): MappingEntry {
    const slot = Object.values(this.state.slots).find((item) => item.vAddress === container.geoSlotRef) ?? null;
    const containerRefs: MappingContainerRef[] = [
      {
        containerId: container.containerId,
        vAddress: container.vAddress,
        vuri: container.vuri,
        lifecycleState: container.lifecycleState,
        overallStatus: container.overallStatus,
        runtimePhase: container.runtime.phase,
        currentSpuId: container.runtime.currentSpuId,
        currentNodeId: container.runtime.currentNodeId,
      },
    ];

    const nodes = container.specBindings
      .flatMap((binding) => binding.historyNodeIds)
      .map((nodeId) => this.state.nodes[nodeId] ?? null)
      .filter((node): node is ExecutionNode => Boolean(node))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const node of nodes) {
      this.syncNodeVuri(node);
    }
    const nodeRefs: MappingNodeRef[] = nodes.map((node) => ({
      nodeId: node.nodeId,
      containerId: node.containerRef ?? null,
      vuri: node.vuri,
      spuId: node.spuId,
      status: node.status,
      attemptIndex: node.attemptIndex,
      updatedAt: node.updatedAt,
    }));

    const activeSpecs: MappingActiveSpec[] = container.specBindings
      .map((binding) => {
        const latestNode = binding.latestNodeId ? this.state.nodes[binding.latestNodeId] ?? null : null;
        return {
          spuId: binding.spuId,
          spuKey: binding.spuKey ?? null,
          bindingStatus: binding.status,
          version: binding.version ?? null,
          latestNodeId: binding.latestNodeId ?? null,
          latestNodeStatus: latestNode?.status ?? null,
        };
      })
      .sort((a, b) => a.spuId.localeCompare(b.spuId, "en"));

    const activeProofs: MappingActiveProof[] = [];
    for (const node of nodes) {
      if (!node.proof) {
        continue;
      }
      activeProofs.push({
        proofKind: "node_final",
        proofId: node.proof.proofId,
        vuri: node.proof.vuri,
        executionId: node.proof.executionId,
        containerId: node.proof.containerId,
        nodeId: node.proof.nodeId,
        status: node.proof.status,
        hash: node.proof.hash ?? null,
        generatedAt: node.proof.generatedAt,
      });
    }
    const containerProof = this.state.proofs[container.containerId] ?? null;
    if (containerProof) {
      this.syncContainerProofVuri(containerProof);
      activeProofs.push({
        proofKind: "container_final",
        proofId: containerProof.proofId,
        vuri: containerProof.vuri,
        executionId: containerProof.executionId,
        containerId: containerProof.containerId,
        nodeId: null,
        status: containerProof.status,
        hash: containerProof.hash ?? null,
        generatedAt: containerProof.archivedAt,
      });
    }
    activeProofs.sort((a, b) => {
      const left = a.generatedAt ?? "";
      const right = b.generatedAt ?? "";
      return right.localeCompare(left);
    });

    const latestNode = nodeRefs[0] ?? null;
    const latestProof = activeProofs[0] ?? null;
    const currentStateSummary: MappingStateSummary = {
      lifecycleState: container.lifecycleState,
      overallStatus: container.overallStatus,
      runtimePhase: container.runtime.phase,
      currentSpuId: container.runtime.currentSpuId,
      currentNodeId: container.runtime.currentNodeId,
      latestNodeId: latestNode?.nodeId ?? null,
      latestNodeStatus: latestNode?.status ?? null,
      latestProofId: latestProof?.proofId ?? null,
      latestProofStatus: latestProof?.status ?? null,
      updatedAt: nowIso(),
    };

    return {
      mappingId: `mapping:${container.containerId}`,
      projectId: container.projectId?.trim() || null,
      stake: slot?.geo.station ?? null,
      location: {
        geoSlotRef: container.geoSlotRef,
        station: slot?.geo.station ?? null,
        chainage: slot?.geo.chainage ?? null,
        x: slot?.geo.x ?? null,
        y: slot?.geo.y ?? null,
        elevation: slot?.geo.elevation ?? null,
        alignment: slot?.geo.alignment ?? null,
      },
      containerRefs,
      nodeRefs,
      activeSpecs,
      activeProofs,
      currentStateSummary,
    };
  }

  private resolveProjectContainerStatus(
    container: SpaceContainer,
    tasks: Array<{ spuId: string; status: CSDTaskStatus }>,
  ): "pass" | "running" | "ready" | "blocked" {
    if (container.lifecycleState === "VERIFIED" || container.lifecycleState === "ARCHIVED") {
      return "pass";
    }
    if (container.runtime.phase === "running" || container.runtime.phase === "signing") {
      return "running";
    }
    if (tasks.some((task) => task.status === "ready" || task.status === "fail" || task.status === "failed")) {
      return "ready";
    }
    if (tasks.every((task) => task.status === "blocked")) {
      return "blocked";
    }
    return "ready";
  }

  private resolveCurrentProjectStation(containers: ProjectSchedulerContainerInput[]): string | null {
    if (containers.length === 0) {
      return null;
    }
    const byOrder = [...containers].sort((a, b) => parseStation(a.containerId) - parseStation(b.containerId));
    const running = byOrder.find((item) => item.status === "running");
    if (running) {
      return running.containerId;
    }
    const ready = byOrder.find((item) => item.status === "ready");
    if (ready) {
      return ready.containerId;
    }
    const blocked = byOrder.find((item) => item.status === "blocked");
    if (blocked) {
      return blocked.containerId;
    }
    return byOrder[0]?.containerId ?? null;
  }

  private ensureMultiContainerInputs(
    containers: ProjectSchedulerContainerInput[],
    currentStation: string | null,
  ): ProjectSchedulerContainerInput[] {
    if (!currentStation || containers.length >= 3) {
      return [...containers];
    }
    const template = containers.find((item) => item.containerId === currentStation) ?? containers[0] ?? null;
    if (!template) {
      return [...containers];
    }
    const mocks = this.buildMockContainers(currentStation, template);
    const byContainerId = new Map<string, ProjectSchedulerContainerInput>();
    for (const container of containers) {
      byContainerId.set(container.containerId, container);
    }
    for (const mock of mocks) {
      if (!byContainerId.has(mock.containerId)) {
        byContainerId.set(mock.containerId, mock);
      }
    }
    return Array.from(byContainerId.values());
  }

  private buildMockContainers(
    currentStation: string,
    template: ProjectSchedulerContainerInput,
  ): ProjectSchedulerContainerInput[] {
    const currentValue = parseStation(currentStation);
    const prevStation = this.formatStation(currentValue - 10);
    const nextStation = this.formatStation(currentValue + 10);
    const currentStatus = template.status ?? "running";
    const nextStatus: "ready" | "blocked" = currentStatus === "blocked" ? "blocked" : "ready";
    const order = template.normRef?.order ?? template.tasks.map((task) => task.spuId);
    const normRef = template.normRef ?? { order };

    return [
      {
        containerId: prevStation,
        tasks: this.buildMockTasksFromOrder(order, "pass"),
        normRef,
        status: "pass",
      },
      {
        containerId: currentStation,
        tasks: this.buildMockTasksFromOrder(order, currentStatus),
        normRef,
        status: currentStatus,
      },
      {
        containerId: nextStation,
        tasks: this.buildMockTasksFromOrder(order, nextStatus),
        normRef,
        status: nextStatus,
      },
    ];
  }

  private buildMockTasksFromOrder(
    order: string[],
    status: "pass" | "running" | "ready" | "blocked",
  ): Array<{ spuId: string; status: CSDTaskStatus }> {
    if (order.length === 0) {
      return [];
    }
    if (status === "pass") {
      return order.map((spuId) => ({ spuId, status: "pass" as const }));
    }
    if (status === "running") {
      return order.map((spuId, index) => ({
        spuId,
        status: index === 0 ? "running" : "blocked",
      }));
    }
    if (status === "ready") {
      return order.map((spuId, index) => ({
        spuId,
        status: index === 0 ? "ready" : "blocked",
      }));
    }
    return order.map((spuId) => ({ spuId, status: "blocked" as const }));
  }

  private formatStation(stationValue: number): string {
    const normalized = Number.isFinite(stationValue) ? Math.max(0, stationValue) : 0;
    const km = Math.floor(normalized / 1000);
    const meter = normalized % 1000;
    return `K${km}+${String(meter).padStart(3, "0")}`;
  }

  private ensureProjectContext(projectId: string): ProjectContextRecord {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      throw new Error("projectId is required");
    }
    const existing = this.projectContexts.get(normalizedProjectId);
    if (existing) {
      return existing;
    }
    const timestamp = nowIso();
    const created: ProjectContextRecord = {
      projectId: normalizedProjectId,
      overrides: emptyProjectOverrides(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.projectContexts.set(normalizedProjectId, created);
    return created;
  }

  private touchProjectContext(projectId: string): void {
    const current = this.ensureProjectContext(projectId);
    current.updatedAt = nowIso();
    this.projectContexts.set(projectId.trim(), current);
  }

  private hasProject(projectId: string): boolean {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return false;
    }
    if (this.projectContexts.has(normalizedProjectId) || this.projectBindings.has(normalizedProjectId)) {
      return true;
    }
    return Object.values(this.state.containers).some((container) => container.projectId === normalizedProjectId);
  }

  private collectProjectIds(): string[] {
    const ids = new Set<string>();
    for (const projectId of this.projectContexts.keys()) {
      if (projectId.trim()) {
        ids.add(projectId.trim());
      }
    }
    for (const projectId of this.projectBindings.keys()) {
      if (projectId.trim()) {
        ids.add(projectId.trim());
      }
    }
    for (const container of Object.values(this.state.containers)) {
      if (container.projectId?.trim()) {
        ids.add(container.projectId.trim());
      }
    }
    return Array.from(ids.values()).sort((a, b) => a.localeCompare(b, "en"));
  }

  private listActiveProjectContainers(projectId: string): string[] {
    const normalizedProjectId = projectId.trim();
    return Object.values(this.state.containers)
      .filter((container) => container.projectId === normalizedProjectId && container.lifecycleState !== "ARCHIVED")
      .map((container) => container.containerId)
      .sort((a, b) => a.localeCompare(b, "en"));
  }

  private buildProjectContext(projectId: string): ProjectContext {
    const normalizedProjectId = projectId.trim();
    const context = this.ensureProjectContext(normalizedProjectId);
    return {
      projectId: normalizedProjectId,
      boundSpuVersions: this.listProjectSpuBindings(normalizedProjectId),
      overrides: deepClone(context.overrides),
      activeContainers: this.listActiveProjectContainers(normalizedProjectId),
      createdAt: context.createdAt,
      updatedAt: context.updatedAt,
    };
  }

  private pushAudit(entityType: EntityType, entityId: string, eventType: string, payload: object, actor?: string): void {
    this.eventStore.append({
      entityType,
      entityId,
      eventType,
      payload,
      actor,
    });
  }

  private shouldAnchorProof(anchor?: AnchorStepOptions): boolean {
    return anchor?.enabled === true;
  }

  private resolveAnchorProvider(providerName?: string): AnchorProvider {
    const requested = providerName?.trim();
    if (requested) {
      const provider = this.anchorProviders.get(requested);
      if (!provider) {
        throw new Error(`anchor provider not found: ${requested}`);
      }
      return provider;
    }
    const first = this.anchorProviders.values().next().value;
    if (!first) {
      throw new Error("anchor provider is not configured");
    }
    return first;
  }

  private submitAnchor(
    proof: Record<string, unknown>,
    anchor: AnchorStepOptions | undefined,
    executionId: string,
    auditEntity: { type: EntityType; id: string },
  ): AnchorReceipt | null {
    if (!this.shouldAnchorProof(anchor)) {
      return null;
    }
    const provider = this.resolveAnchorProvider(anchor?.providerName);
    let submitted;
    try {
      submitted = provider.submit(proof);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.executionLogs.addWarning(
        executionId,
        `proof anchor submit failed via ${provider.providerName}: ${message}`,
      );
      this.pushAudit(auditEntity.type, auditEntity.id, "PROOF_ANCHOR_FAILED", {
        providerName: provider.providerName,
        proofId: typeof proof.proofId === "string" ? proof.proofId : null,
        proofHash: typeof proof.hash === "string" ? proof.hash : null,
        reason: message,
      });
      return null;
    }
    const receipt: AnchorReceipt = {
      anchorId: submitted.anchorRef,
      anchorRef: submitted.anchorRef,
      providerName: submitted.providerName,
      hash: submitted.hash,
      anchoredAt: submitted.anchoredAt,
      status: submitted.status,
    };
    this.executionLogs.addInputOutputSnapshot(executionId, {
      label: "after_proof_anchor",
      input: {
        proofId: typeof proof.proofId === "string" ? proof.proofId : null,
        proofHash: typeof proof.hash === "string" ? proof.hash : null,
      },
      output: {
        providerName: receipt.providerName ?? null,
        anchorRef: receipt.anchorRef ?? receipt.anchorId,
        anchoredAt: receipt.anchoredAt,
        status: receipt.status ?? "ANCHORED",
      },
      at: receipt.anchoredAt,
    });
    this.executionLogs.markCheckpoint(executionId, "proof_anchored", receipt.anchoredAt);
    this.pushAudit(auditEntity.type, auditEntity.id, "PROOF_ANCHORED", {
      providerName: receipt.providerName ?? null,
      anchorRef: receipt.anchorRef ?? receipt.anchorId,
      proofHash: receipt.hash,
      anchoredAt: receipt.anchoredAt,
      status: receipt.status ?? "ANCHORED",
    });
    return receipt;
  }

  private tryAnchorNode(node: ExecutionNode, anchor?: AnchorStepOptions): ExecutionNode {
    if (!node.proof) {
      return node;
    }
    const receipt = this.submitAnchor(
      node.proof as unknown as Record<string, unknown>,
      anchor,
      node.nodeId,
      { type: "node", id: node.nodeId },
    );
    if (!receipt) {
      return node;
    }
    const next: ExecutionNode = {
      ...node,
      proof: {
        ...node.proof,
        anchorReference: {
          providerName: receipt.providerName ?? "unknown",
          anchorRef: receipt.anchorRef ?? receipt.anchorId,
          hash: receipt.hash ?? null,
          anchoredAt: receipt.anchoredAt ?? null,
          status: receipt.status === "NOT_FOUND" ? "NOT_FOUND" : receipt.status === "MISMATCH" ? "MISMATCH" : "ANCHORED",
        },
        extensions: {
          ...(node.proof.extensions ?? {}),
          anchorReference: {
            providerName: receipt.providerName ?? "unknown",
            anchorRef: receipt.anchorRef ?? receipt.anchorId,
            hash: receipt.hash ?? null,
            anchoredAt: receipt.anchoredAt ?? null,
            status: receipt.status === "NOT_FOUND" ? "NOT_FOUND" : receipt.status === "MISMATCH" ? "MISMATCH" : "ANCHORED",
          },
          anchorReceipt: { ...receipt },
        },
      },
      updatedAt: receipt.anchoredAt,
    };
    this.state.nodes[next.nodeId] = next;
    return next;
  }

  private tryAnchorContainerProof(
    proof: ContainerProof,
    anchor: AnchorStepOptions | undefined,
    executionId: string,
  ): ContainerProof {
    const receipt = this.submitAnchor(
      proof as unknown as Record<string, unknown>,
      anchor,
      executionId,
      { type: "container", id: proof.containerId },
    );
    if (!receipt) {
      return proof;
    }
    return {
      ...proof,
      anchorReference: {
        providerName: receipt.providerName ?? "unknown",
        anchorRef: receipt.anchorRef ?? receipt.anchorId,
        hash: receipt.hash ?? null,
        anchoredAt: receipt.anchoredAt ?? null,
        status: receipt.status === "NOT_FOUND" ? "NOT_FOUND" : receipt.status === "MISMATCH" ? "MISMATCH" : "ANCHORED",
      },
      extensions: {
        ...(proof.extensions ?? {}),
        anchorReference: {
          providerName: receipt.providerName ?? "unknown",
          anchorRef: receipt.anchorRef ?? receipt.anchorId,
          hash: receipt.hash ?? null,
          anchoredAt: receipt.anchoredAt ?? null,
          status: receipt.status === "NOT_FOUND" ? "NOT_FOUND" : receipt.status === "MISMATCH" ? "MISMATCH" : "ANCHORED",
        },
        anchorReceipt: { ...receipt },
      },
    };
  }

  private getProofTimestamp(proof: FinalProof): string {
    return proof.timestamps.archivedAt ?? proof.timestamps.finalizedAt ?? proof.timestamps.createdAt;
  }

  private toProofRecordFromNode(node: ExecutionNode): ProofRecordRef | null {
    if (!node.proof) {
      return null;
    }
    return {
      proof: node.proof,
      source: "node",
      nodeId: node.nodeId,
      containerId: node.containerRef ?? null,
      timestamp: this.getProofTimestamp(node.proof),
    };
  }

  private toProofRecordFromContainer(proof: ContainerProof): ProofRecordRef {
    return {
      proof,
      source: "container",
      nodeId: null,
      containerId: proof.containerId,
      timestamp: this.getProofTimestamp(proof),
    };
  }

  private listProofRecordsByContainer(containerId: string | null): ProofRecordRef[] {
    const normalizedContainerId = containerId?.trim() ?? "";
    if (!normalizedContainerId) {
      return [];
    }
    const nodeRecords = this.getContainerNodes(normalizedContainerId)
      .map((node) => this.toProofRecordFromNode(node))
      .filter((item): item is ProofRecordRef => Boolean(item));
    const containerProof = this.state.proofs[normalizedContainerId] ?? null;
    const containerRecord = containerProof ? [this.toProofRecordFromContainer(containerProof)] : [];
    return [...nodeRecords, ...containerRecord]
      .sort((left, right) => {
        const byTime = left.timestamp.localeCompare(right.timestamp, "en");
        if (byTime !== 0) {
          return byTime;
        }
        return left.proof.proofId.localeCompare(right.proof.proofId, "en");
      });
  }

  private getProofRecordByNodeId(nodeId: string): ProofRecordRef | null {
    const node = this.state.nodes[nodeId];
    if (!node?.proof) {
      return null;
    }
    return this.toProofRecordFromNode(node);
  }

  private getProofRecordByContainerId(containerId: string): ProofRecordRef | null {
    const proof = this.state.proofs[containerId];
    if (!proof) {
      return null;
    }
    return this.toProofRecordFromContainer(proof);
  }

  private getProofRecordByProofId(proofId: string): ProofRecordRef | null {
    const normalized = proofId.trim();
    if (!normalized) {
      return null;
    }
    for (const node of Object.values(this.state.nodes)) {
      if (node.proof?.proofId === normalized) {
        return this.toProofRecordFromNode(node);
      }
    }
    for (const proof of Object.values(this.state.proofs)) {
      if (proof.proofId === normalized) {
        return this.toProofRecordFromContainer(proof);
      }
    }
    return null;
  }

  private toLineageEntry(record: ProofRecordRef): ProofChainLineageEntry {
    const hash = readProofHash(record.proof) ?? computeFinalProofHash(record.proof);
    return {
      proofId: record.proof.proofId,
      proofHash: hash,
      source: record.source,
      nodeId: record.nodeId,
      containerId: record.containerId,
      timestamp: record.timestamp,
    };
  }

  private buildProofLineage(proofId: string, proofMap: Map<string, ProofRecordRef>): ProofChainLineageEntry[] {
    const lineage: ProofChainLineageEntry[] = [];
    const visited = new Set<string>();
    let current = proofMap.get(proofId) ?? null;
    while (current && !visited.has(current.proof.proofId)) {
      lineage.push(this.toLineageEntry(current));
      visited.add(current.proof.proofId);
      const chain = readProofChainLink(current.proof);
      if (!chain?.previousProofId) {
        break;
      }
      current = proofMap.get(chain.previousProofId) ?? null;
    }
    return lineage.reverse();
  }

  private attachNodeProofChain(node: ExecutionNode): ExecutionNode {
    if (!node.proof) {
      return node;
    }
    const containerId = node.containerRef ?? null;
    const proofRecords = this.listProofRecordsByContainer(containerId);
    const selfIndex = proofRecords.findIndex((item) => item.proof.proofId === node.proof?.proofId);
    const previousRecord =
      selfIndex > 0
        ? proofRecords[selfIndex - 1] ?? null
        : proofRecords
          .filter((item) => item.proof.proofId !== node.proof?.proofId)
          .slice(-1)[0] ?? null;
    const proofHash = readProofHash(node.proof) ?? computeFinalProofHash(node.proof);
    const chain: ProofChainLink = {
      chainId: containerId || `node:${node.nodeId}`,
      index: selfIndex >= 0 ? selfIndex : proofRecords.length,
      previousProofId: previousRecord?.proof.proofId ?? null,
      previousProofHash: previousRecord ? (readProofHash(previousRecord.proof) ?? computeFinalProofHash(previousRecord.proof)) : null,
      linkedAt: nowIso(),
      dependencies: previousRecord
        ? [{
            proofId: previousRecord.proof.proofId,
            proofHash: readProofHash(previousRecord.proof) ?? computeFinalProofHash(previousRecord.proof),
            source: previousRecord.source,
            nodeId: previousRecord.nodeId,
            containerId: previousRecord.containerId,
            timestamp: previousRecord.timestamp,
          }]
        : [],
    };
    const next: ExecutionNode = {
      ...node,
      proof: {
        ...node.proof,
        hash: proofHash,
        proofHash,
        proofChain: chain,
        extensions: {
          ...(node.proof.extensions ?? {}),
          proof_hash: proofHash,
          payload_hash: proofHash,
          proofChain: chain,
          proof_chain: chain,
        },
      },
      updatedAt: nowIso(),
    };
    this.state.nodes[next.nodeId] = next;
    return next;
  }

  private attachContainerProofChain(proof: ContainerProof, latestNodesBySpu: ExecutionNode[]): ContainerProof {
    const proofRecords = this.listProofRecordsByContainer(proof.containerId);
    const previousRecord = proofRecords.length > 0 ? proofRecords[proofRecords.length - 1] : null;
    const proofHash = readProofHash(proof) ?? computeFinalProofHash(proof);
    const dependencies: ProofChainDependencyRef[] = latestNodesBySpu
      .map((node) => node.proof)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((nodeProof) => ({
        proofId: nodeProof.proofId,
        proofHash: readProofHash(nodeProof) ?? computeFinalProofHash(nodeProof),
        source: "node",
        nodeId: nodeProof.nodeId,
        containerId: nodeProof.containerId,
        timestamp: nodeProof.timestamps.finalizedAt ?? nodeProof.timestamps.createdAt,
      }));
    const chain: ProofChainLink = {
      chainId: proof.containerId,
      index: proofRecords.length,
      previousProofId: previousRecord?.proof.proofId ?? null,
      previousProofHash: previousRecord ? (readProofHash(previousRecord.proof) ?? computeFinalProofHash(previousRecord.proof)) : null,
      linkedAt: nowIso(),
      dependencies,
    };
    return {
      ...proof,
      hash: proofHash,
      proofHash,
      proofChain: chain,
      extensions: {
        ...(proof.extensions ?? {}),
        proof_hash: proofHash,
        payload_hash: proofHash,
        proofChain: chain,
        proof_chain: chain,
      },
    };
  }

  private ensureRuntime(container: SpaceContainer): void {
    if (!container.runtime) {
      container.runtime = {
        currentSpuId: null,
        currentNodeId: null,
        phase: "idle",
      };
      return;
    }
    if (typeof container.runtime.currentNodeId === "undefined") {
      container.runtime.currentNodeId = null;
    }
    if (typeof container.runtime.phase === "undefined") {
      container.runtime.phase = "idle";
    }
  }

  private mustContainer(containerId: string): SpaceContainer {
    const container = this.state.containers[containerId];
    if (!container) {
      throw new Error(`container not found: ${containerId}`);
    }
    this.ensureRuntime(container);
    if (!container.vuri) {
      this.syncContainerVuri(container);
    }
    return container;
  }

  private mustNode(nodeId: string): ExecutionNode {
    const node = this.state.nodes[nodeId];
    if (!node) {
      throw new Error(`node not found: ${nodeId}`);
    }
    this.syncNodeVuri(node);
    return node;
  }

  private mustSpu(spuId: string): SPUDefinition {
    const spu = this.registry.get(spuId);
    if (!spu) {
      throw new Error(`spu not found: ${spuId}`);
    }
    return spu;
  }

  private mustBinding(container: SpaceContainer, spuId: string): ContainerSpecBinding {
    const binding = container.specBindings.find((item) => item.spuId === spuId);
    if (!binding) {
      throw new Error(`container does not bind spu: ${spuId}`);
    }
    return binding;
  }

  private buildContainerNormRef(container: SpaceContainer): NormRef {
    const orderedBindings = [...container.specBindings];
    return {
      normRefId: `normref.container.${container.containerId}`,
      name: `container-${container.containerId}`,
      specs: orderedBindings.map((binding, index) => ({
        spuId: binding.spuId,
        order: index + 1,
        dependsOn: index === 0 ? [] : [orderedBindings[index - 1].spuId],
        required: true,
      })),
    };
  }

  private buildContainerExecutionState(container: SpaceContainer): NormExecutionState {
    const specState = this.buildContainerSpecExecutionState(container);
    const executionState: NormExecutionState = {};
    for (const binding of container.specBindings) {
      const status = specState[binding.spuId] ?? "blocked";
      if (status === "pass") {
        executionState[binding.spuId] = "pass";
        continue;
      }
      if (status === "fail") {
        executionState[binding.spuId] = "fail";
        continue;
      }
      if (status === "running" || status === "gate_pass" || status === "gate_fail" || status === "signing") {
        executionState[binding.spuId] = "running";
        continue;
      }
      executionState[binding.spuId] = status;
    }
    return executionState;
  }

  private buildContainerSchedulerInput(container: SpaceContainer): CSDSchedulerInput {
    const normRef = this.buildContainerNormRef(container);
    const executionState = this.buildContainerExecutionState(container);
    const orderedSpecs = [...normRef.specs].sort((a, b) => a.order - b.order);
    return {
      container: {
        id: container.containerId,
        geo: {
          geoSlotRef: container.geoSlotRef,
          station: this.resolveContainerStation(container),
        },
      },
      tasks: orderedSpecs.map((spec) => ({
        spuId: spec.spuId,
        status: (executionState[spec.spuId] ?? "blocked") as CSDTaskStatus,
      })),
      normRef: {
        order: orderedSpecs.map((spec) => spec.spuId),
      },
    };
  }

  private resolveContainerStation(container: SpaceContainer): string {
    const slot = Object.values(this.state.slots).find((item) => item.vAddress === container.geoSlotRef) ?? null;
    return slot?.geo.station ?? container.containerId;
  }

  private buildContainerSpecExecutionState(container: SpaceContainer): Record<string, SpecExecutionStatus> {
    const normRef = this.buildContainerNormRef(container);
    const specResults: Record<string, Record<string, unknown>> = {};

    for (const binding of container.specBindings) {
      if (binding.status === "PASS") {
        specResults[binding.spuId] = {
          status: "pass",
          latestNodeId: binding.latestNodeId ?? null,
        };
        continue;
      }
      if (binding.status === "FAIL") {
        specResults[binding.spuId] = {
          status: "fail",
          latestNodeId: binding.latestNodeId ?? null,
        };
      }
    }

    const baseState = buildNormExecutionState(normRef, specResults);
    const detailedState: Record<string, SpecExecutionStatus> = {};
    for (const binding of container.specBindings) {
      detailedState[binding.spuId] = baseState[binding.spuId] ?? "blocked";
    }

    const currentSpuId = container.runtime.currentSpuId;
    const currentNode = this.getCurrentNode(container);
    if (currentSpuId && currentNode && currentNode.spuId === currentSpuId) {
      if (currentNode.status === "SIGNING") {
        detailedState[currentSpuId] = currentNode.signedBy.length > 0 ? "signing" : "gate_pass";
      } else if (currentNode.status === "PASS") {
        detailedState[currentSpuId] = "gate_pass";
      } else if (currentNode.status === "FAIL") {
        detailedState[currentSpuId] = "gate_fail";
      } else {
        detailedState[currentSpuId] = "running";
      }
    }

    return detailedState;
  }

  private getCurrentNode(container: SpaceContainer): ExecutionNode | null {
    if (!container.runtime.currentNodeId) {
      return null;
    }
    return this.state.nodes[container.runtime.currentNodeId] ?? null;
  }

  private hasActiveNode(container: SpaceContainer): boolean {
    return container.specBindings.some((binding) => {
      if (!binding.latestNodeId) {
        return false;
      }
      const latestNode = this.mustNode(binding.latestNodeId);
      return !ensureFinalStatus(latestNode.status);
    });
  }

  private canStartSpec(
    container: SpaceContainer,
    spuId: string,
    executionState: Record<string, SpecExecutionStatus>,
  ): boolean {
    if (container.runtime.currentSpuId && container.runtime.currentSpuId !== spuId) {
      return false;
    }
    if (this.hasActiveNode(container)) {
      return false;
    }
    return executionState[spuId] === "ready";
  }

  private startSpecExecution(container: SpaceContainer, spuId: string): ExecutionNode {
    const executionState = this.buildContainerSpecExecutionState(container);
    if (this.hasActiveNode(container)) {
      throw new Error("Only one running SPU is allowed");
    }
    if (!this.canStartSpec(container, spuId, executionState)) {
      throw new Error("SPU is blocked by dependency");
    }
    return this.createNodeForSpec(container, spuId);
  }

  private createNodeForSpec(container: SpaceContainer, spuId: string): ExecutionNode {
    const binding = this.mustBinding(container, spuId);
    const spu = this.mustSpu(spuId);
    const attemptIndex = binding.historyNodeIds.length + 1;
    const node = this.executionEngine.createNode({
      spu,
      containerRef: container.containerId,
      attemptIndex,
    });
    node.vuri = buildNodeVuri({
      projectId: container.projectId ?? null,
      containerId: container.containerId,
      nodeId: node.nodeId,
    });
    this.state.nodes[node.nodeId] = node;
    binding.latestNodeId = node.nodeId;
    binding.historyNodeIds.push(node.nodeId);
    binding.status = "RUNNING";
    container.runtime.currentSpuId = spuId;
    container.runtime.currentNodeId = node.nodeId;
    container.runtime.phase = "running";
    this.pushAudit("node", node.nodeId, AUDIT_EVENT.NODE_CREATED, {
      containerId: container.containerId,
      spuId: node.spuId,
      attemptIndex: node.attemptIndex,
    });
    return node;
  }

  private syncContainerVuri(container: SpaceContainer): void {
    container.vuri = buildContainerVuri({
      projectId: container.projectId ?? null,
      containerId: container.containerId,
    });
  }

  private syncNodeVuri(node: ExecutionNode): void {
    if (!node.vuri) {
      const container = node.containerRef ? this.state.containers[node.containerRef] ?? null : null;
      node.vuri = buildNodeVuri({
        projectId: container?.projectId ?? null,
        containerId: node.containerRef ?? null,
        nodeId: node.nodeId,
      });
    }
    if (node.proof && !node.proof.vuri) {
      const projectId =
        readProjectIdFromVuri(node.vuri) ??
        (node.containerRef ? (this.state.containers[node.containerRef]?.projectId ?? null) : null);
      node.proof = {
        ...node.proof,
        vuri: buildProofVuri({
          projectId,
          proofId: node.proof.proofId,
        }),
      };
    }
  }

  private syncContainerProofVuri(proof: ContainerProof): void {
    if (proof.vuri) {
      return;
    }
    const projectId = this.state.containers[proof.containerId]?.projectId ?? null;
    proof.vuri = buildProofVuri({
      projectId,
      proofId: proof.proofId,
    });
  }

  private canExecuteCurrentSpec(container: SpaceContainer, spuId: string): boolean {
    if (container.runtime.currentSpuId !== spuId) {
      return false;
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode || currentNode.spuId !== spuId) {
      return false;
    }
    const state = this.buildContainerSpecExecutionState(container)[spuId];
    return state === "running";
  }

  private executeSpec(container: SpaceContainer, spuId: string, formData: Record<string, unknown>): ExecutionNode {
    if (!this.canExecuteCurrentSpec(container, spuId)) {
      throw new Error("SPU is blocked by dependency");
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode) {
      throw new Error("current execution node is missing");
    }
    const spu = this.mustSpu(spuId);
    this.executionLogs.setRequestSummary(currentNode.nodeId, {
      source: "PlatformService.executeSpec",
      intent: "gate.evaluate",
      containerId: container.containerId,
      nodeId: currentNode.nodeId,
      spuId,
      inputKeys: Object.keys(formData),
      inputCount: Object.keys(formData).length,
    });
    this.executionLogs.setMatchedSpu(currentNode.nodeId, {
      spuId: spu.spuId,
      version: spu.meta.version,
      norm: spu.meta.norm,
      clause: spu.meta.clause,
    });
    let next = this.executionEngine.submitForm(currentNode, formData, spu);
    this.state.nodes[next.nodeId] = next;
    this.pushAudit("node", next.nodeId, AUDIT_EVENT.FORM_SUBMITTED, { inputs: formData });

    next = this.executionEngine.executePath(next, spu);
    this.state.nodes[next.nodeId] = next;
    this.pushAudit("node", next.nodeId, AUDIT_EVENT.PATH_EXECUTED, { trace: next.trace, outputs: next.outputs });

    next = this.executionEngine.evaluateRules(next, spu);
    if (next.gate.passed) {
      const passNode = next;
      const signingAt = nowIso();
      next = {
        ...next,
        status: "SIGNING",
        updatedAt: signingAt,
      };
      this.executionLogs.addStateTransition(next.nodeId, {
        scope: "NODE",
        from: passNode.status,
        to: "SIGNING",
        reason: "await_required_signatures",
        at: signingAt,
      });
      this.executionLogs.addInputOutputSnapshot(next.nodeId, {
        label: "after_manual_signing_transition",
        input: { ...next.inputs },
        output: {
          ...next.outputs,
          gatePassed: next.gate.passed,
        },
        at: signingAt,
      });
      this.executionLogs.markCheckpoint(next.nodeId, "awaiting_signatures", signingAt);
    }
    this.state.nodes[next.nodeId] = next;
    this.pushAudit("node", next.nodeId, AUDIT_EVENT.RULES_EVALUATED, { gate: next.gate });

    this.syncBinding(container, next);
    container.runtime.phase = next.gate.passed ? "signing" : "running";
    return next;
  }

  private canSignCurrentSpec(container: SpaceContainer, spuId: string, role: string): boolean {
    if (container.runtime.currentSpuId !== spuId) {
      return false;
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode || currentNode.spuId !== spuId) {
      return false;
    }
    if (!currentNode.requiredSignatures.includes(role)) {
      return false;
    }
    const state = this.buildContainerSpecExecutionState(container)[spuId];
    return state === "gate_pass" || state === "signing";
  }

  private signSpec(container: SpaceContainer, spuId: string, role: string): ExecutionNode {
    if (!this.canSignCurrentSpec(container, spuId, role)) {
      throw new Error("SPU is blocked by dependency");
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode) {
      throw new Error("current execution node is missing");
    }
    const next = this.executionEngine.sign(currentNode, role);
    this.state.nodes[next.nodeId] = next;
    this.pushAudit("node", next.nodeId, AUDIT_EVENT.NODE_SIGNED, { role }, role);
    this.syncBinding(container, next);
    container.runtime.phase = "signing";
    return next;
  }

  private canFinalizeCurrentSpec(container: SpaceContainer, spuId: string): boolean {
    if (container.runtime.currentSpuId !== spuId) {
      return false;
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode || currentNode.spuId !== spuId) {
      return false;
    }
    const state = this.buildContainerSpecExecutionState(container)[spuId];
    if (state === "gate_fail") {
      return true;
    }
    if (state !== "gate_pass" && state !== "signing") {
      return false;
    }
    return currentNode.requiredSignatures.every((role) => currentNode.signedBy.includes(role));
  }

  private finalizeSpec(container: SpaceContainer, spuId: string): ExecutionNode {
    if (!this.canFinalizeCurrentSpec(container, spuId)) {
      throw new Error("SPU is blocked by dependency");
    }
    const currentNode = this.getCurrentNode(container);
    if (!currentNode) {
      throw new Error("current execution node is missing");
    }
    const spu = this.mustSpu(spuId);
    const next = this.executionEngine.finalize(currentNode, spu);
    this.state.nodes[next.nodeId] = next;
    this.pushAudit("node", next.nodeId, AUDIT_EVENT.NODE_FINALIZED, {
      status: next.status,
      proof: next.proof,
    });
    this.syncBinding(container, next);
    this.executionLogs.markCompleted(next.nodeId);

    const isPass = next.status === "FINAL_PASS";
    if (!isPass) {
      container.runtime.currentSpuId = spuId;
      container.runtime.currentNodeId = null;
      container.runtime.phase = "idle";
      return next;
    }

    const normRef = this.buildContainerNormRef(container);
    const executionState = this.buildContainerExecutionState(container);
    const nextSpuId = getNextExecutableSpec(normRef, executionState);
    container.runtime.currentSpuId = nextSpuId;
    container.runtime.currentNodeId = null;
    container.runtime.phase = nextSpuId ? "idle" : "completed";
    return next;
  }

  private restartFailedSpec(container: SpaceContainer, spuId: string): ExecutionNode {
    const state = this.buildContainerSpecExecutionState(container)[spuId];
    if (state !== "fail" || container.runtime.currentSpuId !== spuId) {
      throw new Error("SPU is blocked by dependency");
    }
    if (this.hasActiveNode(container)) {
      throw new Error("Only one running SPU is allowed");
    }
    return this.createNodeForSpec(container, spuId);
  }

  private syncBinding(container: SpaceContainer, node: ExecutionNode): void {
    const binding = this.mustBinding(container, node.spuId);
    binding.latestNodeId = node.nodeId;
    binding.status = finalStatusToBinding(node.status);
  }

  private mustEditable(container: SpaceContainer): void {
    if (container.locked || container.lifecycleState === "ARCHIVED") {
      throw new Error("container is archived and locked");
    }
  }

  private recomputeContainer(
    container: SpaceContainer,
    trigger: "gate" | "manual",
    reason: string,
  ): void {
    if (trigger !== "gate" && trigger !== "manual") {
      throw new Error("container state can only be mutated by gate/manual trigger");
    }
    if (container.lifecycleState === "ARCHIVED") {
      return;
    }
    const previousLifecycleState = container.lifecycleState;
    const previousOverallStatus = container.overallStatus;
    if (container.specBindings.length === 0) {
      container.lifecycleState = "DRAFT";
      container.overallStatus = "PENDING";
      if (previousLifecycleState !== container.lifecycleState || previousOverallStatus !== container.overallStatus) {
        this.pushAudit("container", container.containerId, AUDIT_EVENT.CONTAINER_STATE_CHANGED, {
          trigger,
          reason,
          from: {
            lifecycleState: previousLifecycleState,
            overallStatus: previousOverallStatus,
          },
          to: {
            lifecycleState: container.lifecycleState,
            overallStatus: container.overallStatus,
          },
        });
      }
      return;
    }

    const allPass = container.specBindings.every((binding) => binding.status === "PASS");
    const anyFail = container.specBindings.some((binding) => binding.status === "FAIL");
    container.lifecycleState = allPass ? "VERIFIED" : "RUNNING";
    if (allPass) {
      container.overallStatus = "PASS";
    } else {
      container.overallStatus = anyFail ? "FAIL" : "PENDING";
    }
    if (previousLifecycleState !== container.lifecycleState || previousOverallStatus !== container.overallStatus) {
      this.pushAudit("container", container.containerId, AUDIT_EVENT.CONTAINER_STATE_CHANGED, {
        trigger,
        reason,
        from: {
          lifecycleState: previousLifecycleState,
          overallStatus: previousOverallStatus,
        },
        to: {
          lifecycleState: container.lifecycleState,
          overallStatus: container.overallStatus,
        },
      });
    }
  }
}
