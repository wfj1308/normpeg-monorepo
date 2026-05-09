import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { ExecutionLogService } from "../src/platform/runtime/execution-log.ts";
import { PlatformService } from "../src/platform/workflow/platform-service.ts";
import {
  buildLayerPegDocumentIndex,
  layerPegFromContainerProof,
  layerPegFromNodeExecution,
  layerPegFromSpu,
  toLayerPegStandardOutput,
} from "../src/layerpeg/transformer.ts";
import type { ProjectSchedulerInput } from "../src/platform/scheduler/csd-scheduler.ts";
import { buildRuntimeContainerModel, buildRuntimeNodeModels } from "../src/platform/runtime/runtime-model.ts";
import { RuntimeDependencyEngine } from "../src/platform/runtime/runtime-dependency-engine.ts";
import {
  buildRuntimeProjectExecuteSuggestion,
  computeRuntimeContainerNextExecution,
} from "../src/platform/runtime/runtime-scheduler.ts";
import {
  evaluateGateBatchRequestConcurrent,
  evaluateGateRequest,
  GateEvaluateError,
} from "./services/gate_evaluate_service.ts";
import { SpecBotDualOutput, exportLoadedSpuSpec } from "../src/specbot/core/dual-output.ts";
import { buildProofFragment } from "../src/platform/proof/proof-service.ts";
import {
  IpfsHttpAnchorProvider,
  MockAnchorProvider,
  type AnchorProvider,
} from "../src/platform/proof/anchor-service.ts";
import { registerMarkdownSpec } from "../src/spec-compiler/register_markdown.ts";
import { compileSpec } from "../src/spec-compiler/compile_spec.ts";
import { listSpecTemplates, createAndRegisterSpecFromTemplate } from "./services/spec-template-service.ts";
import { generateDraftMarkdownFromPDF } from "./services/pdf-draft-service.ts";
import { evaluatePreRegisterGuard } from "./services/pre_register_guard.ts";
import { evaluateSpecUpgradeGuard } from "./services/spec_upgrade_guard.ts";
import { evaluateSpecRuntimeImpactGuard } from "./services/spec_runtime_impact_guard.ts";
import { buildActivationPolicyOnRegister } from "./services/spu_activation_service.ts";
import {
  browseCatalogItems,
  catalogItemIdFromSpuId,
  deprecateCatalogItem,
  enterCatalogNamespace,
  getComponentCatalogDetail,
  importCatalogItem,
  listCatalogComponents,
  listComponentCatalogs,
  listComponentMarketplaceListings,
  listMarketplaceItems,
  publishCatalogItem,
  rateCatalogItem,
  registerMarketplaceDownload,
  registerMarketplaceReference,
  searchCatalogItems,
  updateCatalogItemCompatibility,
  type CatalogBrowseOptions,
  type CatalogItemStatus,
  type CatalogItemType,
  type CatalogItemVisibility,
} from "./services/component_catalog_service.ts";
import { selectSpuCandidates, type SpuSelectorInput } from "./services/spu_selector_service.ts";
import {
  assertCanSignProof,
  assertRoleCan,
  AuthorizationError,
  resolveRequestActor,
  type PermissionAction,
  type RequestActor,
} from "./services/authorization_service.ts";
import {
  ApprovalFlowError,
  ApprovalFlowService,
  type ApprovalAssetType,
  type CandidateApprovalStatus,
} from "./services/approval_flow_service.ts";
import { LocalExecutionLogFileStore } from "./services/execution_log_file_store.ts";
import {
  CompositeExecutionLogSink,
  ObservabilityMetricsCollector,
} from "./services/observability_metrics_service.ts";
import {
  resolveTenantIdFromRequest,
  TenantPlatformRegistry,
} from "./services/tenant_platform_registry.ts";
import { queryNl2Gate } from "./services/nl2gate_bridge_service.ts";
import { getRuntimeReplaySchema, runRuntimeReplay } from "./services/runtime_replay_engine.ts";
import { RuntimeTrustChainService } from "./services/runtime_trust_chain_service.ts";
import { RuntimeSemanticConsistencyService } from "./services/runtime_semantic_consistency_service.ts";
import { LiveRuntimeSystemService } from "./services/live_runtime_system_service.ts";
import { getEngineeringReasoningSchema, runEngineeringReasoning } from "./services/engineering_reasoning_service.ts";
import { EngineeringCausalGraphService } from "./services/engineering_causal_graph_service.ts";
import { RuntimeAnomalyDetectionService } from "./services/runtime_anomaly_detection_service.ts";
import { PredictiveRuntimeEngineService } from "./services/predictive_runtime_engine_service.ts";
import { SemanticRuntimeMemoryService } from "./services/semantic_runtime_memory_service.ts";
import { AutonomousRemediationPlannerService } from "./services/autonomous_remediation_planner_service.ts";
import { ProjectSemanticBrainService } from "./services/project_semantic_brain_service.ts";
import { EngineeringCopilotV2Service } from "./services/engineering_copilot_v2_service.ts";
import { ComplianceIntelligenceEngineService } from "./services/compliance_intelligence_engine_service.ts";
import { RuntimeKnowledgeCompressionService } from "./services/runtime_knowledge_compression_service.ts";
import { CrossProjectSemanticLearningService } from "./services/cross_project_semantic_learning_service.ts";
import { loadAppConfig, redactAppConfig } from "./config/app-config.ts";
import {
  RuleStoreService,
  type RuleItem,
  type RuleStoreBundle,
  type RuleStoreStatus,
} from "./services/rule_store_service.ts";
import {
  buildProofAuditExportPackage,
  type ProofExecutionSummary,
  type ProofLayerPegRef,
  type ProofNormReference,
} from "./services/proof_export_service.ts";
import {
  buildExternalInputValidationStatus,
  normalizeExternalInputMappingRules,
  normalizeJsonImportRecords,
  parseCsvImportRecords,
} from "./services/external_input_service.ts";
import type {
  ContainerProof,
  EntityType,
  ExecutionNode,
  ExternalInputSourceType,
  FinalProof,
  ProjectSpuVersionBinding,
  RuleResult,
  SPUDefinition,
} from "../src/platform/types.ts";
import type { ClauseReviewItem, ExtractionWarning } from "../src/spec-compiler/review/index.ts";
import type { SPU } from "../src/spu-types.ts";

const { config: appConfig, warnings: appConfigWarnings } = loadAppConfig(process.env, {
  serviceName: "platform-api",
  defaultPort: 8790,
  portEnvKeys: ["PLATFORM_API_PORT", "PORT"],
});

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function buildAnchorProvidersFromEnv(env: NodeJS.ProcessEnv): AnchorProvider[] {
  const provider = String(env.NORMPEG_ANCHOR_PROVIDER ?? "mock").trim().toLowerCase();
  if (provider === "ipfs" || provider === "ipfs_http") {
    return [
      new IpfsHttpAnchorProvider({
        providerName: String(env.NORMPEG_IPFS_ANCHOR_PROVIDER_NAME ?? "ipfs_http_anchor_provider").trim(),
        apiBaseUrl: String(env.NORMPEG_IPFS_API_BASE_URL ?? "http://127.0.0.1:5001").trim(),
        authToken: String(env.NORMPEG_IPFS_AUTH_TOKEN ?? "").trim() || null,
        pin: parseBooleanEnv(env.NORMPEG_IPFS_PIN, true),
      }),
    ];
  }
  return [new MockAnchorProvider()];
}

const anchorProviders = buildAnchorProvidersFromEnv(process.env);
const PORT = appConfig.network.port;
const observabilityMetricsCollector = new ObservabilityMetricsCollector();
const executionLogSink = new CompositeExecutionLogSink([
  new LocalExecutionLogFileStore(
    appConfig.storage.driver === "local" ? appConfig.storage.localDir : undefined,
  ),
  observabilityMetricsCollector,
]);
const bootstrapTenantService = new PlatformService({
  executionLogs: new ExecutionLogService(executionLogSink),
  anchorProviders: buildAnchorProvidersFromEnv(process.env),
});
const tenantRegistry = new TenantPlatformRegistry({
  createPlatformService: () =>
    new PlatformService({
      executionLogs: new ExecutionLogService(executionLogSink),
      anchorProviders: buildAnchorProvidersFromEnv(process.env),
    }),
  sharedCatalogSeed: bootstrapTenantService.getRegistry(),
  defaultTenantId: "default",
});
const service = tenantRegistry.getScopedServiceProxy();
const approvalFlowByTenant = new Map<string, ApprovalFlowService>();
const ruleStoreByTenant = new Map<string, RuleStoreService>();
const approvalFlow = new Proxy({} as ApprovalFlowService, {
  get: (_target, property) => {
    const tenantId = tenantRegistry.getCurrentTenantId();
    const scoped = approvalFlowByTenant.get(tenantId) ?? (() => {
      const created = new ApprovalFlowService();
      approvalFlowByTenant.set(tenantId, created);
      return created;
    })();
    const value = (scoped as Record<string | symbol, unknown>)[property];
    if (typeof value === "function") {
      return value.bind(scoped);
    }
    return value;
  },
});
const ruleStore = new Proxy({} as RuleStoreService, {
  get: (_target, property) => {
    const tenantId = tenantRegistry.getCurrentTenantId();
    const scoped = ruleStoreByTenant.get(tenantId) ?? (() => {
      const created = new RuleStoreService();
      ruleStoreByTenant.set(tenantId, created);
      return created;
    })();
    const value = (scoped as Record<string | symbol, unknown>)[property];
    if (typeof value === "function") {
      return value.bind(scoped);
    }
    return value;
  },
});
const exportedBundleStore = new Map<string, Buffer>();
const runtimeDependencyEngine = new RuntimeDependencyEngine();
const runtimeTrustChain = new RuntimeTrustChainService();
const runtimeSemanticConsistency = new RuntimeSemanticConsistencyService();
const liveRuntimeSystem = new LiveRuntimeSystemService();
const engineeringCausalGraph = new EngineeringCausalGraphService();
const runtimeAnomalyDetection = new RuntimeAnomalyDetectionService();
const predictiveRuntimeEngine = new PredictiveRuntimeEngineService();
const semanticRuntimeMemory = new SemanticRuntimeMemoryService();
const autonomousRemediationPlanner = new AutonomousRemediationPlannerService();
const projectSemanticBrain = new ProjectSemanticBrainService();
const engineeringCopilotV2 = new EngineeringCopilotV2Service();
const complianceIntelligenceEngine = new ComplianceIntelligenceEngineService();
const runtimeKnowledgeCompression = new RuntimeKnowledgeCompressionService();
const crossProjectSemanticLearning = new CrossProjectSemanticLearningService();

function scopedBundleKey(bundleName: string): string {
  return `${tenantRegistry.getCurrentTenantId()}:${bundleName}`;
}

function setExportedBundle(bundleName: string, payload: Buffer): void {
  exportedBundleStore.set(scopedBundleKey(bundleName), payload);
}

function getExportedBundle(bundleName: string): Buffer | null {
  return exportedBundleStore.get(scopedBundleKey(bundleName)) ?? null;
}

function headerValueAsString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : null;
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

const specExporter = new SpecBotDualOutput();

type JsonRecord = Record<string, unknown>;
type RuleValue = number | string;
const PUBLIC_API_VERSION = "public.v1";

type PublicApiErrorCode =
  | "PUBLIC_INVALID_ARGUMENT"
  | "PUBLIC_UNAUTHORIZED"
  | "PUBLIC_FORBIDDEN"
  | "PUBLIC_NOT_FOUND"
  | "PUBLIC_CONFLICT"
  | "PUBLIC_GATE_REQUEST_INVALID"
  | "PUBLIC_GATE_DEPENDENCY_UNMET"
  | "PUBLIC_GATE_EXECUTION_FAILED"
  | "PUBLIC_INTERNAL_ERROR";

interface PublicApiEnvelopeMeta {
  requestId: string;
  version: typeof PUBLIC_API_VERSION;
  timestamp: string;
}

interface PublicApiEnvelopeSuccess<T> {
  ok: true;
  data: T;
  error: null;
  meta: PublicApiEnvelopeMeta;
}

interface PublicApiEnvelopeError {
  ok: false;
  data: null;
  error: {
    code: PublicApiErrorCode;
    message: string;
    details?: unknown;
  };
  meta: PublicApiEnvelopeMeta;
}

class PublicApiError extends Error {
  constructor(
    message: string,
    public readonly code: PublicApiErrorCode,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type ExecutorRunErrorCode = "RULE_NOT_FOUND" | "EXECUTOR_INVALID_ARGUMENT";

class ExecutorRunError extends Error {
  constructor(
    message: string,
    public readonly code: ExecutorRunErrorCode,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

function normalizeRuleValue(rule: SPUDefinition["rules"][number]): RuleValue {
  const directValue = rule.value ?? rule.threshold;

  if (typeof directValue === "number" || typeof directValue === "string") {
    return directValue;
  }
  if (typeof directValue === "boolean") {
    return String(directValue);
  }
  if (directValue && typeof directValue === "object") {
    const inputRef = "inputRef" in directValue ? directValue.inputRef : undefined;
    if (typeof inputRef === "string" && inputRef.trim().length > 0) {
      return `**INPUT**:${inputRef.trim()}`;
    }
    const outputRef = "outputRef" in directValue ? directValue.outputRef : undefined;
    if (typeof outputRef === "string" && outputRef.trim().length > 0) {
      return `outputRef:${outputRef.trim()}`;
    }
    const literalValue = "value" in directValue ? directValue.value : undefined;
    if (typeof literalValue === "number" || typeof literalValue === "string") {
      return literalValue;
    }
    if (typeof literalValue === "boolean") {
      return String(literalValue);
    }
  }
  return "";
}

function normalizeSpuDefinition(definition: SPUDefinition): SPU {
  return {
    spuId: definition.spuId,
    meta: {
      name: definition.meta.name,
      norm: definition.meta.norm,
      clause: definition.meta.clause,
      version: definition.meta.version,
    },
    forms: (definition.forms ?? []).map((item) => ({
      formCode: item.formCode,
      role: item.role,
      required: item.required,
    })),
    data: {
      inputs: definition.data.inputs.map((item) => ({
        name: item.name,
        type: item.type,
        label: item.label,
      })),
      outputs: definition.data.outputs.map((item) => ({ name: item.name })),
    },
    path: definition.path.map((item) => ({
      step: item.step,
      formula: item.formula,
    })),
    rules: definition.rules.map((item, index) => ({
      ruleId: item.ruleId?.trim() || `RULE-${String(index + 1).padStart(3, "0")}`,
      field: item.field,
      operator: item.operator,
      value: normalizeRuleValue(item),
      message: item.message,
    })),
    proof: {
      resultField: definition.proof.resultField,
      passMessage: "妫€娴嬮€氳繃",
      failMessage: "妫€娴嬩笉閫氳繃",
      requiredSignatures: [...definition.proof.requiredSignatures],
    },
  };
}

type NormDocListItemResponse = {
  key: string;
  id?: string;
  normdocId?: string;
  packageId?: string;
  normdoc_id?: string;
  standard_code?: string;
  standard_name?: string;
  standardCode: string;
  name?: string;
  version: string;
  bundle_hash?: string;
  rule_count?: number;
  component_count?: number;
  published_at?: string | null;
  sampleSpuKey: string;
  publishedAt: string;
  updatedAt: string;
  projectCustomized: boolean;
  availableItemCount: number;
  spuIds: string[];
  sampleSpuId: string;
  status?: RuleStoreStatus;
  signedBy?: string | null;
};

type RuleStoreListItemResponse = NormDocListItemResponse & {
  id: string;
  published: boolean;
  projectBoundCount?: number;
};

type RuleStoreVersionSnapshotResponse = {
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
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function deriveSpuKeyFromSpuId(spuId: string): string {
  const normalized = String(spuId ?? "").trim();
  const index = normalized.lastIndexOf("@");
  if (index <= 0) {
    return normalized;
  }
  return normalized.slice(0, index);
}

function normalizeDateLabel(value: unknown): string {
  if (typeof value !== "string") {
    return "-";
  }
  const text = value.trim();
  if (!text) {
    return "-";
  }
  const ts = Date.parse(text);
  if (Number.isNaN(ts)) {
    return text;
  }
  return new Date(ts).toLocaleDateString("zh-CN");
}

function normalizeDateTimeLabel(value: unknown): string {
  if (typeof value !== "string") {
    return "-";
  }
  const text = value.trim();
  if (!text) {
    return "-";
  }
  const ts = Date.parse(text);
  if (Number.isNaN(ts)) {
    return text;
  }
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function isRuleStorePublishedSpec(definition: SPUDefinition): boolean {
  const extensions = toRecord(definition.meta.extensions);
  if (!extensions) {
    return String(definition.sourceType || "").trim().toLowerCase() === "builtin";
  }
  const publishedAt = String(extensions.publishedAt ?? extensions.releasedAt ?? "").trim();
  const source = String(extensions.source ?? extensions.registrySource ?? extensions.ruleSource ?? "").trim().toLowerCase();
  const publishFlag = normalizeBooleanFlag(extensions.published ?? extensions.ruleStorePublished ?? extensions.normDocPublished);
  if (publishFlag) {
    return true;
  }
  if (publishedAt) {
    return true;
  }
  if (source.includes("rule_store") || source.includes("rulestore") || source.includes("normdoc")) {
    return true;
  }
  return false;
}

function syncRuleStoreFromRegistry(): void {
  ruleStore.syncFromRegistry(service.getRegistry(), {
    resolveStatus: (items) => (items.some((item) => isRuleStorePublishedSpec(item)) ? "published" : "draft"),
  });
}

function buildNormDocListPayload(options?: {
  statuses?: RuleStoreStatus[];
}): { items: NormDocListItemResponse[]; missingVersionCount: number } {
  syncRuleStoreFromRegistry();
  const bundles = ruleStore.listBundles({
    statuses: options?.statuses,
  });
  const items = bundles.map((bundle) => {
    const sampleRuleId = bundle.ruleItems[0]?.rule_id ?? "";
    return {
      key: bundle.key,
      id: bundle.key,
      normdocId: bundle.normdoc.normdoc_id,
      packageId: bundle.rulePackage.package_id,
      standardCode: bundle.normdoc.standard_code,
      name: bundle.normdoc.name,
      version: bundle.normdoc.version,
      normdoc_id: bundle.normdoc.normdoc_id,
      standard_code: bundle.normdoc.standard_code,
      standard_name: bundle.normdoc.standard_name || bundle.normdoc.name,
      bundle_hash: bundle.normdoc.bundle_hash,
      rule_count: bundle.normdoc.rule_count,
      component_count: bundle.normdoc.component_count,
      published_at: bundle.normdoc.published_at,
      sampleSpuKey: deriveSpuKeyFromSpuId(sampleRuleId),
      publishedAt: normalizeDateLabel(bundle.normdoc.published_at),
      updatedAt: normalizeDateTimeLabel(bundle.normdoc.updated_at),
      projectCustomized: false,
      availableItemCount: bundle.ruleItems.length,
      spuIds: bundle.ruleItems.map((item) => item.rule_id),
      sampleSpuId: sampleRuleId,
      status: bundle.normdoc.status,
      signedBy: bundle.normdoc.signed_by,
    };
  });
  return { items, missingVersionCount: 0 };
}

function parseQueryBoolean(value: string | null, fallback = false): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseRuleStoreStatuses(raw: string | null): RuleStoreStatus[] {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (!normalized) {
    return [];
  }
  return Array.from(
    new Set(
      normalized
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is RuleStoreStatus =>
          item === "draft" || item === "reviewed" || item === "published" || item === "deprecated"),
    ),
  );
}

function toRuleStoreEnvelope<T>(data: T): {
  version: typeof PUBLIC_API_VERSION;
  status: "ok";
  source: "Rule Store";
  data: T;
} {
  return {
    version: PUBLIC_API_VERSION,
    status: "ok",
    source: "Rule Store",
    data,
  };
}

function buildNormDocMarkdownPreview(bundle: RuleStoreBundle): string {
  const header = [
    `# ${bundle.normdoc.standard_name || bundle.normdoc.name}`,
    "",
    `- NormDoc ID: ${bundle.normdoc.normdoc_id}`,
    `- 鏍囧噯缂栧彿: ${bundle.normdoc.standard_code}`,
    `- 鐗堟湰: ${bundle.normdoc.version}`,
    `- 鐘舵€? ${bundle.normdoc.status}`,
    `- bundle_hash: ${bundle.normdoc.bundle_hash}`,
    "",
    "## 鏋勪欢鍒楄〃",
  ];
  const componentLines = Array.from(
    new Set(bundle.ruleItems.map((item) => deriveSpuKeyFromSpuId(item.rule_id)).filter(Boolean)),
  ).map((componentKey) => `- ${componentKey}`);
  const ruleLines = [
    "",
    "## 瑙勫垯鍒楄〃",
    ...bundle.ruleItems.map((item) => `- ${item.rule_id}: ${item.condition || "-"} (clause: ${item.clause_id || "-"})`),
  ];
  return [...header, ...componentLines, ...ruleLines].join("\n");
}

function buildNormDocSpecJsonPreview(bundle: RuleStoreBundle): Record<string, unknown> {
  return {
    spec_id: bundle.normdoc.normdoc_id,
    standard_code: bundle.normdoc.standard_code,
    standard_name: bundle.normdoc.standard_name || bundle.normdoc.name,
    version: bundle.normdoc.version,
    components: Array.from(
      new Set(bundle.ruleItems.map((item) => deriveSpuKeyFromSpuId(item.rule_id)).filter(Boolean)),
    ).map((component_id) => ({ component_id })),
    rules: bundle.ruleItems.map((item) => ({
      rule_id: item.rule_id,
      component_id: deriveSpuKeyFromSpuId(item.rule_id),
      clause_id: item.clause_id,
      condition: item.condition,
      source_clause: item.clause_id,
    })),
    source_clauses: Array.from(new Set(bundle.ruleItems.flatMap((item) => item.clause_ids ?? []).filter(Boolean))),
  };
}

function buildNormDocSpecIrYamlPreview(bundle: RuleStoreBundle): string {
  const lines = [
    `spec_id: ${bundle.normdoc.normdoc_id}`,
    `standard_code: ${bundle.normdoc.standard_code}`,
    `standard_name: "${bundle.normdoc.standard_name || bundle.normdoc.name}"`,
    `version: ${bundle.normdoc.version}`,
    "components:",
  ];
  const componentIds = Array.from(
    new Set(bundle.ruleItems.map((item) => deriveSpuKeyFromSpuId(item.rule_id)).filter(Boolean)),
  );
  for (const componentId of componentIds) {
    lines.push(`  - component_id: ${componentId}`);
  }
  lines.push("rules:");
  for (const item of bundle.ruleItems) {
    lines.push(`  - rule_id: ${item.rule_id}`);
    lines.push(`    component_id: ${deriveSpuKeyFromSpuId(item.rule_id)}`);
    lines.push(`    clause_id: ${item.clause_id}`);
  }
  return lines.join("\n");
}

function isRuleItemRequiredFromSeverity(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return normalized === "blocking" || normalized === "required" || normalized === "must";
}

function resolveRuleStoreItemById(
  ruleId: string,
  options?: {
    statuses?: RuleStoreStatus[];
  },
): NormDocListItemResponse | null {
  const normalized = ruleId.trim();
  if (!normalized) {
    return null;
  }
  syncRuleStoreFromRegistry();
  const bundle = ruleStore.resolveBundle(normalized, { statuses: options?.statuses });
  if (!bundle) {
    return null;
  }
  const sampleRuleId = bundle.ruleItems[0]?.rule_id ?? "";
  return {
    key: bundle.key,
    id: bundle.key,
    normdocId: bundle.normdoc.normdoc_id,
    packageId: bundle.rulePackage.package_id,
    standardCode: bundle.normdoc.standard_code,
    name: bundle.normdoc.name,
    version: bundle.normdoc.version,
    normdoc_id: bundle.normdoc.normdoc_id,
    standard_code: bundle.normdoc.standard_code,
    standard_name: bundle.normdoc.standard_name || bundle.normdoc.name,
    bundle_hash: bundle.normdoc.bundle_hash,
    rule_count: bundle.normdoc.rule_count,
    component_count: bundle.normdoc.component_count,
    published_at: bundle.normdoc.published_at,
    sampleSpuKey: deriveSpuKeyFromSpuId(sampleRuleId),
    publishedAt: normalizeDateLabel(bundle.normdoc.published_at),
    updatedAt: normalizeDateTimeLabel(bundle.normdoc.updated_at),
    projectCustomized: false,
    availableItemCount: bundle.ruleItems.length,
    spuIds: bundle.ruleItems.map((item) => item.rule_id),
    sampleSpuId: sampleRuleId,
    status: bundle.normdoc.status,
    signedBy: bundle.normdoc.signed_by,
  };
}

function buildRuleStoreListPayload(
  projectId?: string,
  options?: {
    statuses?: RuleStoreStatus[];
  },
): { items: RuleStoreListItemResponse[]; missingVersionCount: number } {
  const payload = buildNormDocListPayload({
    statuses: options?.statuses,
  });
  const normalizedProjectId = String(projectId ?? "").trim();
  const items = payload.items.map((item) => {
    const uniqueSpuKeys = Array.from(new Set(item.spuIds.map((spuId) => deriveSpuKeyFromSpuId(spuId)).filter(Boolean)));
    const published = item.status === "published";
    const projectBoundCount = normalizedProjectId
      ? uniqueSpuKeys.filter((spuKey) => Boolean(service.getProjectSpuBinding(normalizedProjectId, spuKey))).length
      : undefined;
    return {
      ...item,
      id: item.key,
      published,
      ...(typeof projectBoundCount === "number" ? { projectBoundCount } : {}),
    };
  });
  return { items, missingVersionCount: payload.missingVersionCount };
}

function collectRuleVersionSnapshots(
  spuKeys: string[],
  projectId?: string,
): {
  items: RuleStoreVersionSnapshotResponse[];
  projectBindings: ProjectSpuVersionBinding[];
} {
  syncRuleStoreFromRegistry();
  const normalizedProjectId = String(projectId ?? "").trim();
  const snapshots: RuleStoreVersionSnapshotResponse[] = [];
  const projectBindings: ProjectSpuVersionBinding[] = [];
  const seenSnapshots = new Set<string>();
  for (const spuKey of spuKeys) {
    const binding = normalizedProjectId ? service.getProjectSpuBinding(normalizedProjectId, spuKey) : null;
    if (binding) {
      projectBindings.push(binding);
    }
    for (const version of ruleStore.listRuleVersionSnapshotsBySpuKey(spuKey)) {
      const id = `${version.spuKey}@@${version.spuId}@@${version.version}`;
      if (seenSnapshots.has(id)) {
        continue;
      }
      seenSnapshots.add(id);
      snapshots.push({
        spuKey: version.spuKey,
        spuId: version.spuId,
        version: version.version,
        semanticVersion: version.semanticVersion,
        compatibilityPolicy: version.compatibilityPolicy,
        isLatest: version.isLatest,
        isProjectBound: Boolean(binding && binding.activeSpuId === version.spuId),
      });
    }
  }
  snapshots.sort(
    (a, b) =>
      a.spuKey.localeCompare(b.spuKey, "en")
      || b.semanticVersion.major - a.semanticVersion.major
      || b.semanticVersion.minor - a.semanticVersion.minor
      || b.semanticVersion.patch - a.semanticVersion.patch
      || a.spuId.localeCompare(b.spuId, "en"),
  );
  return { items: snapshots, projectBindings };
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-user-role, x-role, x-actor-role, x-actor-id, x-user-id, x-tenant-id",
  );
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendBinary(res: ServerResponse, statusCode: number, payload: Buffer, fileName: string): void {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.end(payload);
}

function buildPublicMeta(requestId: string): PublicApiEnvelopeMeta {
  return {
    requestId,
    version: PUBLIC_API_VERSION,
    timestamp: new Date().toISOString(),
  };
}

function sendPublicSuccess<T>(res: ServerResponse, requestId: string, data: T, statusCode = 200): void {
  const payload: PublicApiEnvelopeSuccess<T> = {
    ok: true,
    data,
    error: null,
    meta: buildPublicMeta(requestId),
  };
  sendJson(res, statusCode, payload);
}

function sendPublicError(
  res: ServerResponse,
  requestId: string,
  statusCode: number,
  code: PublicApiErrorCode,
  message: string,
  details?: unknown,
): void {
  const payload: PublicApiEnvelopeError = {
    ok: false,
    data: null,
    error: {
      code,
      message,
      ...(typeof details === "undefined" ? {} : { details }),
    },
    meta: buildPublicMeta(requestId),
  };
  sendJson(res, statusCode, payload);
}

function toPublicErrorCodeFromStatus(statusCode: number): PublicApiErrorCode {
  if (statusCode === 401) {
    return "PUBLIC_UNAUTHORIZED";
  }
  if (statusCode === 403) {
    return "PUBLIC_FORBIDDEN";
  }
  if (statusCode === 404) {
    return "PUBLIC_NOT_FOUND";
  }
  if (statusCode === 409) {
    return "PUBLIC_CONFLICT";
  }
  if (statusCode >= 500) {
    return "PUBLIC_INTERNAL_ERROR";
  }
  return "PUBLIC_INVALID_ARGUMENT";
}

async function readBody<T = JsonRecord>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch {
        reject(new Error("鐠囬攱鐪版担鎾崇箑妞ょ粯妲?JSON"));
      }
    });
    req.on("error", reject);
  });
}

function pathParts(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((item) => decodeURIComponent(item));
}

function readOptionalQuery(url: URL, key: string): string | undefined {
  const value = String(url.searchParams.get(key) ?? "").trim();
  return value || undefined;
}

function readListQuery(url: URL, key: string): string[] {
  const raw = readOptionalQuery(url, key);
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toCatalogItemTypes(values: string[]): CatalogItemType[] {
  return values
    .filter((value): value is CatalogItemType => value === "spu" || value === "spec" || value === "template" || value === "specbundle");
}

function toCatalogStatuses(values: string[]): CatalogItemStatus[] {
  return values
    .filter((value): value is CatalogItemStatus => value === "draft" || value === "published" || value === "deprecated");
}

function toCatalogVisibility(value: unknown): CatalogItemVisibility | undefined {
  if (value === "internal" || value === "public") {
    return value;
  }
  return undefined;
}

function toExternalSourceType(value: unknown, fallback: ExternalInputSourceType): ExternalInputSourceType {
  if (value === "csv" || value === "device" || value === "api" || value === "manual_import") {
    return value;
  }
  return fallback;
}

function resolveSpuIdForExternalInput(payload: {
  spuId?: string;
  nodeId?: string;
  containerId?: string;
}): string {
  const directSpuId = String(payload.spuId ?? "").trim();
  if (directSpuId) {
    return directSpuId;
  }
  const nodeId = String(payload.nodeId ?? "").trim();
  if (nodeId) {
    const node = service.getNode(nodeId);
    if (!node) {
      throw new Error("node not found: " + nodeId);
    }
    return node.spuId;
  }
  const containerId = String(payload.containerId ?? "").trim();
  if (containerId) {
    throw new Error("spuId is required when externalInput is used with containerId");
  }
  throw new Error("spuId is required when externalInput is used");
}

type GateExternalInputPayload = {
  sourceId?: string;
  recordIndex?: number;
  strict?: boolean;
};

type RuleBoundExecutionInputPayload = {
  rule_id?: string;
  rule_version?: string;
  spuId?: string;
  nodeId?: string;
  containerId?: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  externalInput?: GateExternalInputPayload;
};

type ExecutorRunRequestPayload = {
  rule_id?: string;
  rule_version?: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

type ExecutorAggregateRunRequestPayload = {
  query?: string;
  context?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
};

type RuleStoreExecutionBinding = {
  ruleId: string;
  ruleVersion: string;
  spuId: string;
  normdocId: string;
  packageId: string;
  bundleHash: string;
  componentId: string;
  standardCode: string;
  clauseId: string;
  clauseNo: string;
  clauseTitle: string;
  clauseContent: string;
};

type Nl2GateRuleStoreMappingCandidate = {
  ruleId: string;
  ruleVersion: string;
  normdocId: string;
  packageId: string;
  standardCode: string;
  score: number;
  matchReasons: string[];
};

type PegBotRuleStoreSessionTarget = {
  metric: string | null;
  stake: string | null;
  ruleId: string | null;
  ruleVersion: string | null;
  normdocId: string | null;
  packageId: string | null;
  standardCode: string | null;
};

type PegBotRuleStoreSessionRecord = {
  conversationId: string;
  pendingIntent: "gate.preview" | "gate.evaluate" | null;
  pendingSpu: string | null;
  collectedInputs: Record<string, number>;
  context: Record<string, unknown>;
  target: PegBotRuleStoreSessionTarget;
  createdAt: string;
  updatedAt: string;
};

const pegbotRuleStoreSessionStore = new Map<string, PegBotRuleStoreSessionRecord>();

const RULE_STORE_INPUT_ALIAS_MAP: Record<string, string[]> = {
  compactiondegree: ["compactiondegree", "compaction_degree", "representative_value", "compaction"],
  compaction_degree: ["compaction_degree", "compactiondegree", "representative_value", "compaction"],
  representativevalue: ["representativevalue", "representative_value", "compactiondegree", "compaction_degree"],
  representative_value: ["representative_value", "representativevalue", "compactiondegree", "compaction_degree"],
  massholesand: ["massholesand", "holesandmass"],
  masssandcone: ["masssandcone", "conesandmass"],
  volumesand: ["volumesand", "sandvolume"],
  moisturecontent: ["moisturecontent", "watercontent"],
  maxdrydensity: ["maxdrydensity", "maximumdrydensity"],
  measuredthickness: ["measuredthickness", "thickness"],
  designthickness: ["designthickness", "targetthickness"],
  measureddeflection: ["measureddeflection", "deflectionvalue", "deflection"],
  deflectionvalue: ["deflectionvalue", "measureddeflection", "deflection"],
};

const FORBIDDEN_FRONTEND_RULE_FIELDS = new Set([
  "condition",
  "conditions",
  "expr",
  "expression",
  "expressions",
  "threshold",
  "thresholds",
  "rule",
  "rules",
  "matchedrules",
  "gatedecision",
  "gatestatus",
  "status",
  "outcome",
  "passed",
  "finalstatus",
  "proofstatus",
]);

function normalizeExecutionFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function assertNoTemporaryRuleFields(record: Record<string, unknown>, scope: string): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_FRONTEND_RULE_FIELDS.has(normalizeExecutionFieldKey(key))) {
      throw new Error(`绂佹鍦?{scope}涓彁浜や复鏃惰鍒欏瓧娈碉細${key}`);
    }
  }
}

function extractClauseOriginalTextFromDraft(draftMarkdown: string, clauseId: string): string | null {
  const draft = String(draftMarkdown ?? "").replace(/\r\n/g, "\n");
  const normalizedClauseId = String(clauseId ?? "").trim();
  if (!draft || !normalizedClauseId) {
    return null;
  }
  const lines = draft.split("\n");
  const index = lines.findIndex((line) => line.includes(normalizedClauseId));
  if (index < 0) {
    return null;
  }
  const start = Math.max(0, index - 1);
  const end = Math.min(lines.length, index + 4);
  const snippet = lines.slice(start, end).map((line) => line.trim()).filter(Boolean).join(" ");
  return snippet.length > 0 ? snippet : null;
}

function resolvePublishedRuleStoreExecutionBinding(
  ruleId: string,
  ruleVersion: string,
  options?: { notFoundCode?: ExecutorRunErrorCode },
): RuleStoreExecutionBinding {
  const normalizedRuleId = String(ruleId ?? "").trim();
  const normalizedRuleVersion = String(ruleVersion ?? "").trim();
  if (!normalizedRuleId) {
    throw new Error("rule_id is required");
  }
  if (!normalizedRuleVersion) {
    throw new Error("rule_version is required");
  }
  syncRuleStoreFromRegistry();
  const bundles = ruleStore.listBundles({ statuses: ["published"] });
  const matchedBundle = bundles.find((bundle) => {
    const matchedRule = bundle.ruleItems.find((item) => String(item.rule_id ?? "").trim() === normalizedRuleId) ?? null;
    if (!matchedRule) {
      return false;
    }
    const itemRuleVersion = String(matchedRule.rule_version ?? "").trim();
    const packageVersion = String(bundle.rulePackage.version ?? "").trim();
    const normdocVersion = String(bundle.normdoc.version ?? "").trim();
    if (itemRuleVersion) {
      return itemRuleVersion === normalizedRuleVersion;
    }
    return packageVersion === normalizedRuleVersion || normdocVersion === normalizedRuleVersion;
  }) ?? null;
  if (!matchedBundle) {
    if (options?.notFoundCode) {
      throw new ExecutorRunError(
        `rule not found in Rule Store: ${normalizedRuleId}@${normalizedRuleVersion}`,
        options.notFoundCode,
        404,
      );
    }
    throw new Error(`rule not found in Rule Store: ${normalizedRuleId}@${normalizedRuleVersion}`);
  }
  const matchedRule = matchedBundle.ruleItems.find((item) => String(item.rule_id ?? "").trim() === normalizedRuleId) ?? null;
  if (!matchedRule) {
    if (options?.notFoundCode) {
      throw new ExecutorRunError(
        `rule not found in Rule Store: ${normalizedRuleId}@${normalizedRuleVersion}`,
        options.notFoundCode,
        404,
      );
    }
    throw new Error(`rule not found in package: ${normalizedRuleId}`);
  }
  if (!matchedRule.enabled) {
    throw new Error(`rule is disabled: ${normalizedRuleId}`);
  }
  const effectiveRuleVersion = String(matchedRule.rule_version ?? "").trim() || normalizedRuleVersion;
  const registrySpu = service.getRegistry().find((item) => item.spuId === normalizedRuleId) ?? null;
  if (!registrySpu) {
    throw new Error(`executor registry missing rule: ${normalizedRuleId}`);
  }
  const registryVersion = String(registrySpu.meta.version ?? "").trim();
  if (registryVersion && registryVersion !== effectiveRuleVersion) {
    throw new Error(`rule_version mismatch: expected ${registryVersion}, got ${effectiveRuleVersion}`);
  }
  const clauseId = String(matchedRule.clause_id ?? matchedRule.clause_no ?? matchedRule.clause ?? "").trim();
  const clauseNo = String(matchedRule.clause_no ?? matchedRule.clause ?? clauseId).trim() || clauseId;
  const clauseTitle = String(matchedRule.item_name ?? "").trim();
  const clauseContent = String(matchedRule.source_text ?? "").trim();
  const nextMetaExtensions = (
    registrySpu.meta.extensions && typeof registrySpu.meta.extensions === "object" && !Array.isArray(registrySpu.meta.extensions)
      ? registrySpu.meta.extensions
      : {}
  ) as Record<string, unknown>;
  registrySpu.meta.extensions = {
    ...nextMetaExtensions,
    normdoc_id: matchedBundle.normdoc.normdoc_id,
    package_id: matchedBundle.rulePackage.package_id,
    bundle_hash: String(matchedBundle.normdoc.bundle_hash ?? "").trim() || undefined,
    component_id: deriveSpuKeyFromSpuId(registrySpu.spuId) || registrySpu.spuId,
    clause_id: clauseId || undefined,
    clause_no: clauseNo || undefined,
    clause_content: clauseContent || undefined,
  };
  return {
    ruleId: normalizedRuleId,
    ruleVersion: effectiveRuleVersion,
    spuId: registrySpu.spuId,
    normdocId: matchedBundle.normdoc.normdoc_id,
    packageId: matchedBundle.rulePackage.package_id,
    bundleHash: String(matchedBundle.normdoc.bundle_hash ?? "").trim(),
    componentId: deriveSpuKeyFromSpuId(registrySpu.spuId) || registrySpu.spuId,
    standardCode: matchedBundle.normdoc.standard_code,
    clauseId,
    clauseNo,
    clauseTitle,
    clauseContent,
  };
}

function requireNonEmptyExecutorContextField(
  context: Record<string, unknown>,
  field: "project_id" | "point" | "user_id",
): string {
  const value = String(context[field] ?? "").trim();
  if (!value) {
    throw new ExecutorRunError(`context.${field} is required`, "EXECUTOR_INVALID_ARGUMENT", 400);
  }
  return value;
}

function resolveExecutorRunContainer(params: {
  projectId: string;
  point: string;
  userId: string;
  spuId: string;
  preferredContainerId?: string | null;
}): {
  containerId: string;
  slotId: string;
} {
  const normalizedPreferredContainerId = String(params.preferredContainerId ?? "").trim();
  if (normalizedPreferredContainerId) {
    const preferredContainer = service.listContainers().find((item) => item.container.containerId === normalizedPreferredContainerId) ?? null;
    if (!preferredContainer) {
      throw new ExecutorRunError(
        `context.container_id not found: ${normalizedPreferredContainerId}`,
        "EXECUTOR_INVALID_ARGUMENT",
        400,
      );
    }
    if (preferredContainer.container.lifecycleState === "ARCHIVED") {
      throw new ExecutorRunError(
        `context.container_id is archived: ${normalizedPreferredContainerId}`,
        "EXECUTOR_INVALID_ARGUMENT",
        400,
      );
    }
    const preferredProjectId = String(preferredContainer.container.projectId ?? "").trim();
    const preferredPoint = String(preferredContainer.slot?.geo.station ?? "").trim();
    if (preferredProjectId !== params.projectId || preferredPoint !== params.point) {
      throw new ExecutorRunError(
        `context.container_id does not match context.project_id/context.point: ${normalizedPreferredContainerId}`,
        "EXECUTOR_INVALID_ARGUMENT",
        400,
      );
    }
    if (!preferredContainer.container.specBindings.some((binding) => binding.spuId === params.spuId)) {
      service.bindSpu(preferredContainer.container.containerId, params.spuId);
    }
    return {
      containerId: preferredContainer.container.containerId,
      slotId: String(preferredContainer.slot?.slotId ?? `slot-${params.point}`).trim(),
    };
  }

  const matchedContainer = service.listContainers().find((item) => {
    if (item.container.lifecycleState === "ARCHIVED") {
      return false;
    }
    const containerProjectId = String(item.container.projectId ?? "").trim();
    const station = String(item.slot?.geo.station ?? "").trim();
    return containerProjectId === params.projectId && station === params.point;
  }) ?? null;
  if (matchedContainer) {
    if (!matchedContainer.container.specBindings.some((binding) => binding.spuId === params.spuId)) {
      service.bindSpu(matchedContainer.container.containerId, params.spuId);
    }
    return {
      containerId: matchedContainer.container.containerId,
      slotId: String(matchedContainer.slot?.slotId ?? `slot-${params.point}`).trim(),
    };
  }

  const slot = service.importSlot({
    station: params.point,
    chainage: 19070,
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    sourceFile: "executor-run.auto.csv",
  });
  const container = service.createContainer({
    projectId: params.projectId,
    geoSlotRef: slot.slotId,
    inspector: params.userId,
    autoBindSpuIds: [params.spuId],
  });
  return {
    containerId: container.containerId,
    slotId: slot.slotId,
  };
}

function normalizeExecutorRunPayload(payload: ExecutorRunRequestPayload): {
  ruleBinding: RuleStoreExecutionBinding;
  inputs: Record<string, unknown>;
  context: Record<string, unknown>;
  executionContext: {
    projectId: string;
    point: string;
    userId: string;
    preferredContainerId: string | null;
  };
} {
  const payloadRecord = toRecord(payload);
  if (!payloadRecord) {
    throw new ExecutorRunError("invalid request body", "EXECUTOR_INVALID_ARGUMENT", 400);
  }
  const allowedTopLevelFields = new Set(["rule_id", "rule_version", "inputs", "context"]);
  for (const key of Object.keys(payloadRecord)) {
    if (!allowedTopLevelFields.has(key)) {
      throw new ExecutorRunError(
        `executor run request only accepts rule_id, rule_version, inputs, context; invalid field: ${key}`,
        "EXECUTOR_INVALID_ARGUMENT",
        400,
      );
    }
  }
  assertNoTemporaryRuleFields(payloadRecord, "鎵ц璇锋眰");
  const contextRecord = toRecord(payload.context);
  if (!contextRecord) {
    throw new ExecutorRunError("context is required", "EXECUTOR_INVALID_ARGUMENT", 400);
  }
  assertNoTemporaryRuleFields(contextRecord, "context");
  const projectId = requireNonEmptyExecutorContextField(contextRecord, "project_id");
  const point = requireNonEmptyExecutorContextField(contextRecord, "point");
  const userId = requireNonEmptyExecutorContextField(contextRecord, "user_id");
  const operatorId = String(contextRecord.operator_id ?? contextRecord.operatorId ?? userId).trim() || userId;
  const executorVersion = String(contextRecord.executor_version ?? contextRecord.executorVersion ?? "executor@v1").trim()
    || "executor@v1";
  const preferredContainerId = String(contextRecord.container_id ?? contextRecord.containerId ?? "").trim() || null;
  let normalizedInputs: Record<string, unknown>;
  try {
    normalizedInputs = ensureGateInputsObject(payload.inputs);
  } catch (reason) {
    throw new ExecutorRunError(
      reason instanceof Error ? reason.message : String(reason),
      "EXECUTOR_INVALID_ARGUMENT",
      400,
    );
  }

  const ruleBinding = resolvePublishedRuleStoreExecutionBinding(
    payload.rule_id ?? "",
    payload.rule_version ?? "",
    { notFoundCode: "RULE_NOT_FOUND" },
  );
  return {
    ruleBinding,
    inputs: normalizedInputs,
    context: {
      ...contextRecord,
      project_id: projectId,
      point,
      user_id: userId,
      operator_id: operatorId,
      executor_version: executorVersion,
      rule_id: ruleBinding.ruleId,
      rule_version: ruleBinding.ruleVersion,
      normdoc_id: ruleBinding.normdocId,
      standard_code: ruleBinding.standardCode,
      package_id: ruleBinding.packageId,
      bundle_hash: ruleBinding.bundleHash,
      component_id: ruleBinding.componentId,
      clause_id: ruleBinding.clauseId,
      clause_no: ruleBinding.clauseNo,
      clause_title: ruleBinding.clauseTitle,
      clause_content: ruleBinding.clauseContent,
      rule_source: "Rule Store",
    },
    executionContext: {
      projectId,
      point,
      userId,
      preferredContainerId,
    },
  };
}

type NormalizedExecutorRunPayload = ReturnType<typeof normalizeExecutorRunPayload>;

function executeExecutorRunWithNormalizedPayload(
  normalized: NormalizedExecutorRunPayload,
  forcedContainer?: { containerId: string; slotId: string },
) {
  const executionContainer = forcedContainer
    ?? resolveExecutorRunContainer({
      projectId: normalized.executionContext.projectId,
      point: normalized.executionContext.point,
      userId: normalized.executionContext.userId,
      spuId: normalized.ruleBinding.spuId,
      preferredContainerId: normalized.executionContext.preferredContainerId,
    });
  const response = evaluateGateRequest(service, {
    spuId: normalized.ruleBinding.spuId,
    containerId: executionContainer.containerId,
    inputs: normalized.inputs,
    context: {
      ...normalized.context,
      container_id: executionContainer.containerId,
      slot_id: executionContainer.slotId,
    },
  });
  return {
    response,
    executionContainer,
  };
}

function deriveChainageFromPoint(point: string): number {
  const digits = String(point ?? "").replace(/[^0-9]/g, "");
  const parsed = Number(digits);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 19070;
}

function createIsolatedExecutorReplayContainer(params: {
  projectId: string;
  point: string;
  userId: string;
  spuId: string;
}): {
  containerId: string;
  slotId: string;
} {
  const slot = service.importSlot({
    station: params.point,
    chainage: deriveChainageFromPoint(params.point),
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    sourceFile: "proof-replay.auto.csv",
  });
  const container = service.createContainer({
    projectId: params.projectId,
    geoSlotRef: slot.slotId,
    inspector: params.userId,
    autoBindSpuIds: [params.spuId],
  });
  return {
    containerId: container.containerId,
    slotId: slot.slotId,
  };
}

interface ProofReplayLookupRecord {
  proof: FinalProof;
  source: "node" | "container";
  nodeId: string | null;
  containerId: string | null;
  projectId: string | null;
  point: string | null;
  operatorId: string | null;
}

type AggregateMetricKey = "compaction" | "thickness" | "deflection";
type AggregateOverallStatus = "PASS" | "FAIL" | "INCOMPLETE";
type AggregateItemStatus = "PASS" | "FAIL" | "INCOMPLETE";

interface ExecutorAggregateItemResult {
  item_key: AggregateMetricKey;
  item_name: string;
  required: boolean;
  status: AggregateItemStatus;
  rule_id: string | null;
  rule_version: string | null;
  result: "PASS" | "FAIL" | null;
  reason: string | null;
  missing_inputs: string[];
}

interface ExecutorAggregateProofRef {
  item_key: AggregateMetricKey;
  proof_id: string | null;
  execution_id: string | null;
  rule_id: string | null;
  rule_version: string | null;
  result: "PASS" | "FAIL" | null;
}

interface ExecutorAggregateRunResponse {
  overall: AggregateOverallStatus;
  item_results: ExecutorAggregateItemResult[];
  proof_refs: ExecutorAggregateProofRef[];
}

const AGGREGATE_ACCEPTANCE_METRICS: AggregateMetricKey[] = ["compaction", "thickness", "deflection"];

function isAcceptanceAggregateQuery(query: string): boolean {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.includes("璺熀") && (normalized.includes("楠屾敹") || normalized.includes("婊¤冻"))) {
    return true;
  }
  if (normalized.includes("acceptance") && (normalized.includes("subgrade") || normalized.includes("roadbed"))) {
    return true;
  }
  return false;
}

function readContextTextValue(context: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = String(context[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function parseStakeFromQuery(query: string): string | null {
  const matched = String(query ?? "").match(/K\d+\+\d+/i);
  return matched ? String(matched[0]).trim() : null;
}

function parseMetricValueFromQuery(query: string, metric: AggregateMetricKey): number | null {
  const text = String(query ?? "");
  const pattern =
    metric === "compaction"
      ? /鍘嬪疄搴^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i
      : metric === "thickness"
        ? /鍘氬害[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i
        : /寮矇[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i;
  const matched = text.match(pattern);
  if (!matched?.[1]) {
    return null;
  }
  const value = Number(matched[1]);
  return Number.isFinite(value) ? value : null;
}

function readRuleItemClauseIds(item: RuleItem): string[] {
  const candidates: unknown[] = [
    item.clause_id,
    item.clause_no,
    item.clause,
    item.clause_ids,
  ];
  const list = candidates.flatMap((value) => {
    if (Array.isArray(value)) {
      return value.map((entry) => String(entry ?? "").trim());
    }
    return String(value ?? "")
        .split(/[,;|]/u)
      .map((entry) => entry.trim());
  });
  return Array.from(new Set(list.filter(Boolean)));
}

function buildRuleItemSearchText(item: RuleItem): string {
  const clauseTokens = readRuleItemClauseIds(item).join(" ");
  return `${item.rule_id} ${item.item_name} ${item.source_text} ${item.clause} ${item.clause_no} ${clauseTokens}`.toLowerCase();
}

function matchesRuleItemClause(item: RuleItem, clauseHint: string): boolean {
  const normalizedHint = String(clauseHint ?? "").trim();
  if (!normalizedHint) {
    return false;
  }
  return readRuleItemClauseIds(item).includes(normalizedHint);
}

function detectMetricFromRuleItem(item: RuleItem): AggregateMetricKey | null {
  const searchText = buildRuleItemSearchText(item);
  if (includesMetricHint("compaction", searchText)) {
    return "compaction";
  }
  if (includesMetricHint("thickness", searchText)) {
    return "thickness";
  }
  if (includesMetricHint("deflection", searchText)) {
    return "deflection";
  }
  return null;
}

function metricDisplayName(metric: AggregateMetricKey): string {
  if (metric === "compaction") {
    return "compaction";
  }
  if (metric === "thickness") {
    return "鍘氬害";
  }
  return "寮矇";
}

function resolveAcceptanceAggregateBundle(contextRecord: Record<string, unknown>): RuleStoreBundle | null {
  syncRuleStoreFromRegistry();
  const contextPackageId = readContextTextValue(contextRecord, ["package_id", "packageId"]);
  const contextNormdocId = readContextTextValue(contextRecord, ["normdoc_id", "normdocId"]);
  const contextStandardCode = readContextTextValue(contextRecord, ["standard_code", "standardCode"]);
  const contextRuleVersion = readContextTextValue(contextRecord, ["rule_version", "ruleVersion"]);

  let bundles = ruleStore.listBundles({ statuses: ["published"] });
  if (contextPackageId) {
    bundles = bundles.filter((bundle) => bundle.rulePackage.package_id === contextPackageId);
  }
  if (contextNormdocId) {
    bundles = bundles.filter((bundle) => bundle.normdoc.normdoc_id === contextNormdocId);
  }
  if (contextStandardCode) {
    const normalizedStandard = contextStandardCode.trim().toLowerCase();
    bundles = bundles.filter((bundle) => bundle.normdoc.standard_code.trim().toLowerCase() === normalizedStandard);
  }
  if (contextRuleVersion) {
    bundles = bundles.filter((bundle) =>
      bundle.rulePackage.version === contextRuleVersion
      || bundle.normdoc.version === contextRuleVersion);
  }
  if (bundles.length === 0) {
    return null;
  }

  const scored = bundles.map((bundle) => {
    const metricCoverage = new Set(
      bundle.ruleItems
        .filter((item) => item.enabled)
        .map((item) => detectMetricFromRuleItem(item))
        .filter((item): item is AggregateMetricKey => Boolean(item)),
    ).size;
    const publishedAt = String(bundle.normdoc.published_at ?? bundle.normdoc.updated_at ?? "");
    return {
      bundle,
      metricCoverage,
      publishedAt,
      packageVersion: String(bundle.rulePackage.version ?? ""),
    };
  });

  scored.sort((left, right) =>
    right.metricCoverage - left.metricCoverage
    || right.publishedAt.localeCompare(left.publishedAt, "en")
    || right.packageVersion.localeCompare(left.packageVersion, "en"));
  return scored[0]?.bundle ?? null;
}

function resolveAggregateRuleItemsByMetric(bundle: RuleStoreBundle): Record<AggregateMetricKey, RuleItem | null> {
  const result: Record<AggregateMetricKey, RuleItem | null> = {
    compaction: null,
    thickness: null,
    deflection: null,
  };
  for (const metric of AGGREGATE_ACCEPTANCE_METRICS) {
    result[metric] = bundle.ruleItems.find((item) => item.enabled && detectMetricFromRuleItem(item) === metric) ?? null;
  }
  return result;
}

function buildAggregateInputSnapshot(query: string, contextRecord: Record<string, unknown>): Record<string, unknown> {
  const contextInputs = toRecord(contextRecord.inputs) ?? {};
  const nextInputs: Record<string, unknown> = {
    ...contextInputs,
  };
  const queryCompaction = parseMetricValueFromQuery(query, "compaction");
  if (queryCompaction !== null && nextInputs.compactionDegree === undefined) {
    nextInputs.compactionDegree = queryCompaction;
  }
  const queryThickness = parseMetricValueFromQuery(query, "thickness");
  if (queryThickness !== null && nextInputs.measuredThickness === undefined) {
    nextInputs.measuredThickness = queryThickness;
  }
  const queryDeflection = parseMetricValueFromQuery(query, "deflection");
  if (queryDeflection !== null && nextInputs.measuredDeflection === undefined) {
    nextInputs.measuredDeflection = queryDeflection;
  }
  return nextInputs;
}

function resolveMissingRuleInputs(requiredInputFields: string[], inputs: Record<string, unknown>): string[] {
  const normalizedInputKeys = new Set(
    Object.keys(inputs).map((key) => key.trim().toLowerCase()),
  );
  return requiredInputFields
    .map((field) => String(field).trim())
    .filter((field) => field.length > 0)
    .filter((field) => !normalizedInputKeys.has(field.toLowerCase()));
}

function normalizeRuleStorePegBotConversationId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRuleStoreInputKey(value: string): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function normalizeRuleStoreInputNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mergeRuleStoreInputSnapshots(
  ...sources: Array<Record<string, unknown> | Record<string, number> | null | undefined>
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      const numeric = normalizeRuleStoreInputNumber(value);
      if (numeric === null) {
        continue;
      }
      next[key] = numeric;
    }
  }
  return next;
}

function clonePegBotRuleStoreSession(record: PegBotRuleStoreSessionRecord): PegBotRuleStoreSessionRecord {
  return {
    conversationId: record.conversationId,
    pendingIntent: record.pendingIntent,
    pendingSpu: record.pendingSpu,
    collectedInputs: { ...record.collectedInputs },
    context: { ...record.context },
    target: { ...record.target },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function readPegBotRuleStoreSession(conversationId: string | null): PegBotRuleStoreSessionRecord | null {
  if (!conversationId) {
    return null;
  }
  const item = pegbotRuleStoreSessionStore.get(conversationId);
  return item ? clonePegBotRuleStoreSession(item) : null;
}

function writePegBotRuleStoreSession(record: PegBotRuleStoreSessionRecord): void {
  const now = new Date().toISOString();
  const existing = pegbotRuleStoreSessionStore.get(record.conversationId);
  pegbotRuleStoreSessionStore.set(record.conversationId, {
    ...clonePegBotRuleStoreSession(record),
    createdAt: existing?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  });
}

function clearPegBotRuleStoreSession(conversationId: string | null): void {
  if (!conversationId) {
    return;
  }
  pegbotRuleStoreSessionStore.delete(conversationId);
}

function resolveRuleStoreRuleInputFields(ruleId: string, ruleVersion: string): string[] {
  const normalizedRuleId = String(ruleId ?? "").trim();
  const normalizedRuleVersion = String(ruleVersion ?? "").trim();
  if (!normalizedRuleId || !normalizedRuleVersion) {
    return [];
  }
  syncRuleStoreFromRegistry();
  for (const bundle of ruleStore.listBundles({ statuses: ["published"] })) {
    const packageVersion = String(bundle.rulePackage.version ?? "").trim();
    const normdocVersion = String(bundle.normdoc.version ?? "").trim();
    if (packageVersion !== normalizedRuleVersion && normdocVersion !== normalizedRuleVersion) {
      continue;
    }
    const matchedRule = bundle.ruleItems.find((item) =>
      item.enabled && String(item.rule_id ?? "").trim() === normalizedRuleId) ?? null;
    if (!matchedRule) {
      continue;
    }
    return Array.isArray(matchedRule.input_fields)
      ? matchedRule.input_fields.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  }
  return [];
}

function resolveRuleStoreInputValueByAlias(field: string, snapshot: Record<string, number>): number | null {
  const direct = snapshot[field];
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  const normalizedField = normalizeRuleStoreInputKey(field);
  const aliases = new Set<string>([normalizedField, ...(RULE_STORE_INPUT_ALIAS_MAP[normalizedField] ?? [])]);
  for (const [key, value] of Object.entries(snapshot)) {
    if (!Number.isFinite(value)) {
      continue;
    }
    if (aliases.has(normalizeRuleStoreInputKey(key))) {
      return Number(value);
    }
  }
  return null;
}

function buildRuleStoreExecutorInputPayload(
  requiredInputFields: string[],
  snapshot: Record<string, number>,
): {
  inputs: Record<string, unknown>;
  missingInputs: string[];
} {
  if (!Array.isArray(requiredInputFields) || requiredInputFields.length === 0) {
    return {
      inputs: { ...snapshot },
      missingInputs: [],
    };
  }
  const inputs: Record<string, unknown> = {};
  const missingInputs: string[] = [];
  for (const rawField of requiredInputFields) {
    const field = String(rawField ?? "").trim();
    if (!field) {
      continue;
    }
    const value = resolveRuleStoreInputValueByAlias(field, snapshot);
    if (value === null) {
      missingInputs.push(field);
      continue;
    }
    inputs[field] = value;
  }
  return {
    inputs,
    missingInputs,
  };
}

function buildRuleStoreMissingQuestions(missingInputs: string[]): string[] {
  const normalized = Array.from(new Set(missingInputs.map((item) => String(item ?? "").trim()).filter(Boolean)));
  return normalized.map((field) => "Please provide input for " + field + ".");
}

function buildRuleStorePegBotContext(
  existingContext: Record<string, unknown> | null,
  incomingContext: Record<string, unknown>,
  carriedInputs: Record<string, number>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...(existingContext ?? {}),
    ...(incomingContext ?? {}),
  };
  const mergedInputs = mergeRuleStoreInputSnapshots(
    toRecord(existingContext?.inputs) ?? {},
    toRecord(incomingContext.inputs) ?? {},
    carriedInputs,
  );
  if (Object.keys(mergedInputs).length > 0) {
    merged.inputs = mergedInputs;
  }
  return merged;
}

function buildProofRefFromExecution(params: {
  itemKey: AggregateMetricKey;
  ruleId: string;
  ruleVersion: string;
  executionPayload: Record<string, unknown>;
}): ExecutorAggregateProofRef {
  const execution = params.executionPayload;
  const proofFragment = toRecord(execution.proofFragment);
  const proof = toRecord(execution.proof);
  const proofId = String(
    proofFragment?.proof_id
    ?? proofFragment?.proofId
    ?? proof?.proof_id
    ?? proof?.proofId
    ?? "",
  ).trim() || null;
  const executionId = String(
    proofFragment?.execution_id
    ?? execution.executionId
    ?? execution.execution_id
    ?? "",
  ).trim() || null;
  const status = normalizeProofResultValue(execution.status);
  return {
    item_key: params.itemKey,
    proof_id: proofId,
    execution_id: executionId,
    rule_id: params.ruleId,
    rule_version: params.ruleVersion,
    result: status === "PASS" ? "PASS" : status === "FAIL" ? "FAIL" : null,
  };
}

function executeAcceptanceAggregateRun(params: {
  query: string;
  context: Record<string, unknown>;
}): ExecutorAggregateRunResponse {
  const query = String(params.query ?? "").trim();
  const contextRecord = params.context;
  const projectId = readContextTextValue(contextRecord, ["project_id", "projectId"]) ?? "P1";
  const point =
    readContextTextValue(contextRecord, ["point", "stake"])
    ?? parseStakeFromQuery(query)
    ?? "K19+070";
  const userId = readContextTextValue(contextRecord, ["user_id", "userId"]) ?? "did:peg:ins_001";
  const bundle = resolveAcceptanceAggregateBundle(contextRecord);
  const itemResults: ExecutorAggregateItemResult[] = [];
  const proofRefs: ExecutorAggregateProofRef[] = [];
  const aggregateInputs = buildAggregateInputSnapshot(query, contextRecord);

  if (!bundle) {
    for (const metric of AGGREGATE_ACCEPTANCE_METRICS) {
      itemResults.push({
        item_key: metric,
        item_name: metricDisplayName(metric),
        required: true,
        status: "INCOMPLETE",
        rule_id: null,
        rule_version: null,
        result: null,
        reason: "RULE_BUNDLE_NOT_FOUND",
        missing_inputs: [],
      });
    }
    return {
      overall: "INCOMPLETE",
      item_results: itemResults,
      proof_refs: [],
    };
  }

  const rulesByMetric = resolveAggregateRuleItemsByMetric(bundle);
  for (const metric of AGGREGATE_ACCEPTANCE_METRICS) {
    const ruleItem = rulesByMetric[metric];
    const required = true;
    if (!ruleItem) {
      itemResults.push({
        item_key: metric,
        item_name: metricDisplayName(metric),
        required,
        status: "INCOMPLETE",
        rule_id: null,
        rule_version: null,
        result: null,
        reason: "RULE_NOT_FOUND",
        missing_inputs: [],
      });
      continue;
    }
    const ruleId = String(ruleItem.rule_id ?? "").trim();
    const ruleVersion = String(bundle.rulePackage.version ?? bundle.normdoc.version ?? "").trim();
    const missingInputs = resolveMissingRuleInputs(ruleItem.input_fields, aggregateInputs);
    if (missingInputs.length > 0) {
      itemResults.push({
        item_key: metric,
        item_name: String(ruleItem.item_name ?? "").trim() || metricDisplayName(metric),
        required,
        status: "INCOMPLETE",
        rule_id: ruleId || null,
        rule_version: ruleVersion || null,
        result: null,
        reason: "MISSING_INPUTS",
        missing_inputs: missingInputs,
      });
      continue;
    }
    const itemContext: Record<string, unknown> = {
      ...contextRecord,
      project_id: projectId,
      point,
      user_id: userId,
      rule_id: ruleId,
      rule_version: ruleVersion,
      normdoc_id: bundle.normdoc.normdoc_id,
      package_id: bundle.rulePackage.package_id,
      standard_code: bundle.normdoc.standard_code,
      rule_source: "Rule Store",
      // Aggregate mode executes each rule in an isolated container to avoid
      // cross-rule lifecycle/dependency interference.
      container_id: null,
      containerId: null,
      inputs: aggregateInputs,
    };
    try {
      const normalized = normalizeExecutorRunPayload({
        rule_id: ruleId,
        rule_version: ruleVersion,
        inputs: aggregateInputs,
        context: itemContext,
      });
      const isolatedContainer = createIsolatedExecutorReplayContainer({
        projectId: normalized.executionContext.projectId,
        point: normalized.executionContext.point,
        userId: normalized.executionContext.userId,
        spuId: normalized.ruleBinding.spuId,
      });
      const execution = executeExecutorRunWithNormalizedPayload(normalized, isolatedContainer);
      const itemStatus = String(execution.response.status ?? "").trim().toUpperCase() === "PASS" ? "PASS" : "FAIL";
      const proofRef = buildProofRefFromExecution({
        itemKey: metric,
        ruleId,
        ruleVersion,
        executionPayload: execution.response as unknown as Record<string, unknown>,
      });
      proofRefs.push(proofRef);
      itemResults.push({
        item_key: metric,
        item_name: String(ruleItem.item_name ?? "").trim() || metricDisplayName(metric),
        required,
        status: itemStatus,
        rule_id: ruleId,
        rule_version: ruleVersion,
        result: itemStatus,
        reason: null,
        missing_inputs: [],
      });
    } catch (reason) {
      const isDependencyError = reason instanceof GateEvaluateError && reason.code === "GATE_DEPENDENCY_UNMET";
      const isRuleNotFound = reason instanceof ExecutorRunError && reason.code === "RULE_NOT_FOUND";
      const incomplete = isDependencyError || isRuleNotFound;
      itemResults.push({
        item_key: metric,
        item_name: String(ruleItem.item_name ?? "").trim() || metricDisplayName(metric),
        required,
        status: incomplete ? "INCOMPLETE" : "FAIL",
        rule_id: ruleId,
        rule_version: ruleVersion,
        result: incomplete ? null : "FAIL",
        reason: reason instanceof Error ? reason.message : String(reason),
        missing_inputs: [],
      });
    }
  }

  const hasFail = itemResults.some((item) => item.required && item.status === "FAIL");
  const hasIncomplete = itemResults.some((item) => item.status === "INCOMPLETE");
  const overall: AggregateOverallStatus = hasFail ? "FAIL" : hasIncomplete ? "INCOMPLETE" : "PASS";
  return {
    overall,
    item_results: itemResults,
    proof_refs: proofRefs,
  };
}

function normalizeProofResultValue(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) {
    return "UNKNOWN";
  }
  if (normalized === "FAIL" || normalized === "BLOCK") {
    return "FAIL";
  }
  if (normalized === "PASS" || normalized === "OVERRIDE") {
    return "PASS";
  }
  return normalized;
}

function resolveProofReplayLookupByProofId(proofId: string): ProofReplayLookupRecord | null {
  const normalizedProofId = String(proofId ?? "").trim();
  if (!normalizedProofId) {
    return null;
  }
  const containers = service.listContainers();
  for (const item of containers) {
    const containerId = String(item.container.containerId ?? "").trim() || null;
    const projectId = String(item.container.projectId ?? "").trim() || null;
    const point = String(item.slot?.geo.station ?? "").trim() || null;
    for (const node of item.nodes) {
      const proof = node.proof;
      if (!proof) {
        continue;
      }
      const aliasProofId = String(proof.proof_id ?? "").trim();
      if (proof.proofId !== normalizedProofId && aliasProofId !== normalizedProofId) {
        continue;
      }
      const operatorId =
        String(
          proof.operator_id
          ?? item.container.tripBinding.inspector
          ?? item.container.tripBinding.supervisor
          ?? "",
        ).trim() || null;
      return {
        proof,
        source: "node",
        nodeId: node.nodeId,
        containerId: node.containerRef ?? containerId,
        projectId,
        point,
        operatorId,
      };
    }
    const containerProof = containerId ? service.getProof(containerId) : null;
    if (containerProof) {
      const aliasProofId = String(containerProof.proof_id ?? "").trim();
      if (containerProof.proofId === normalizedProofId || aliasProofId === normalizedProofId) {
        const operatorId =
          String(
            containerProof.operator_id
            ?? item.container.tripBinding.inspector
            ?? item.container.tripBinding.supervisor
            ?? "",
          ).trim() || null;
        return {
          proof: containerProof,
          source: "container",
          nodeId: null,
          containerId,
          projectId,
          point,
          operatorId,
        };
      }
    }
  }
  return null;
}

function buildExecutorReplayPayloadFromProof(params: {
  proofId: string;
  proof: FinalProof;
  projectId: string | null;
  point: string | null;
  operatorId: string | null;
}): ExecutorRunRequestPayload {
  const ruleId = String(params.proof.rule_id ?? params.proof.spuId ?? "").trim();
  if (!ruleId) {
    throw new Error("stored proof missing rule_id");
  }
  const ruleVersion = String(params.proof.rule_version ?? params.proof.matchedSpecVersion ?? "").trim();
  if (!ruleVersion) {
    throw new Error("stored proof missing rule_version");
  }
  const projectId = String(params.projectId ?? "").trim();
  if (!projectId) {
    throw new Error("stored proof missing project_id context");
  }
  const point = String(params.point ?? "").trim();
  if (!point) {
    throw new Error("stored proof missing point context");
  }
  const operatorId = String(params.operatorId ?? params.proof.operator_id ?? "").trim() || "proof-replay-operator";
  const executorVersion = String(params.proof.executor_version ?? "executor@v1").trim() || "executor@v1";
  const storedInputs = toRecord(params.proof.inputs) ?? toRecord(params.proof.inputSnapshot) ?? {};
  return {
    rule_id: ruleId,
    rule_version: ruleVersion,
    inputs: { ...storedInputs },
    context: {
      project_id: projectId,
      point,
      user_id: operatorId,
      operator_id: operatorId,
      executor_version: executorVersion,
      replay_from_proof_id: params.proofId,
      replay_source: "proof_replay",
    },
  };
}

function normalizeRuleBoundExecutionPayload(payload: RuleBoundExecutionInputPayload): {
  ruleBinding: RuleStoreExecutionBinding;
  nodeId?: string;
  containerId?: string;
  inputs?: Record<string, unknown>;
  context: Record<string, unknown>;
  externalInput?: GateExternalInputPayload;
} {
  const payloadRecord = toRecord(payload) ?? {};
  assertNoTemporaryRuleFields(payloadRecord, "鎵ц璇锋眰");
  const contextRecord = toRecord(payload.context);
  if (!contextRecord) {
    throw new Error("context is required");
  }
  assertNoTemporaryRuleFields(contextRecord, "context");
  const ruleBinding = resolvePublishedRuleStoreExecutionBinding(payload.rule_id ?? "", payload.rule_version ?? "");
  const directSpuId = String(payload.spuId ?? "").trim();
  if (directSpuId && directSpuId !== ruleBinding.spuId) {
    throw new Error("spuId mismatch with rule_id: " + directSpuId + " vs " + ruleBinding.spuId);
  }
  const nodeId = String(payload.nodeId ?? "").trim() || undefined;
  const containerId = String(payload.containerId ?? "").trim() || undefined;
  if (nodeId) {
    const node = service.getNode(nodeId);
    if (!node) {
      throw new Error("node not found: " + nodeId);
    }
    if (node.spuId !== ruleBinding.spuId) {
      throw new Error("node rule mismatch: node=" + node.spuId + ", request=" + ruleBinding.spuId);
    }
    if (containerId && node.containerRef && node.containerRef !== containerId) {
      throw new Error("container mismatch: node=" + node.containerRef + ", request=" + containerId);
    }
  }
  return {
    ruleBinding,
    nodeId,
    containerId,
    inputs: payload.inputs,
    externalInput: payload.externalInput,
    context: {
      ...contextRecord,
      rule_id: ruleBinding.ruleId,
      rule_version: ruleBinding.ruleVersion,
      normdoc_id: ruleBinding.normdocId,
      standard_code: ruleBinding.standardCode,
      package_id: ruleBinding.packageId,
      bundle_hash: ruleBinding.bundleHash,
      component_id: ruleBinding.componentId,
      clause_id: ruleBinding.clauseId,
      clause_no: ruleBinding.clauseNo,
      clause_title: ruleBinding.clauseTitle,
      clause_content: ruleBinding.clauseContent,
      rule_source: "Rule Store",
    },
  };
}

function ensureGateInputsObject(inputs: unknown): Record<string, unknown> {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new Error("inputs is required");
  }
  return { ...(inputs as Record<string, unknown>) };
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseClauseHintFromText(value: string): string | null {
  const matched = String(value ?? "").match(/(\d+(?:\.\d+){1,3})/);
  return matched?.[1] ? matched[1] : null;
}

function includesMetricHint(metric: string, text: string): boolean {
  const normalizedMetric = metric.trim().toLowerCase();
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedMetric || !normalizedText) {
    return false;
  }
  if (normalizedMetric === "compaction") {
    return normalizedText.includes("compaction");
  }
  if (normalizedMetric === "thickness") {
    return normalizedText.includes("thickness");
  }
  if (normalizedMetric === "deflection") {
    return normalizedText.includes("deflection");
  }
  return false;
}

function resolveNl2GateRuleStoreMapping(params: {
  query: string;
  metric: string | null;
  context: Record<string, unknown>;
}): {
  selected: Nl2GateRuleStoreMappingCandidate | null;
  candidates: Nl2GateRuleStoreMappingCandidate[];
} {
  syncRuleStoreFromRegistry();
  const normalizedContext = toRecord(params.context) ?? {};
  const contextPackageId = String(normalizedContext.package_id ?? normalizedContext.packageId ?? "").trim();
  const contextNormdocId = String(normalizedContext.normdoc_id ?? normalizedContext.normdocId ?? "").trim();
  const contextStandardCode = normalizeSearchText(normalizedContext.standard_code ?? normalizedContext.standardCode);
  const contextRuleVersion = String(normalizedContext.rule_version ?? normalizedContext.ruleVersion ?? "").trim();
  const clauseHint = parseClauseHintFromText(String(normalizedContext.clause ?? "").trim()) ?? parseClauseHintFromText(params.query);
  const metricHint = String(params.metric ?? "").trim().toLowerCase();
  const queryText = normalizeSearchText(params.query);

  let bundles = ruleStore.listBundles({ statuses: ["published"] });
  if (contextPackageId) {
    bundles = bundles.filter((bundle) => bundle.rulePackage.package_id === contextPackageId);
  }
  if (contextNormdocId) {
    bundles = bundles.filter((bundle) => bundle.normdoc.normdoc_id === contextNormdocId);
  }
  if (contextStandardCode) {
    bundles = bundles.filter((bundle) => normalizeSearchText(bundle.normdoc.standard_code) === contextStandardCode);
  }
  if (contextRuleVersion) {
    bundles = bundles.filter((bundle) =>
      bundle.rulePackage.version === contextRuleVersion || bundle.normdoc.version === contextRuleVersion);
  }

  const candidates: Nl2GateRuleStoreMappingCandidate[] = [];
  for (const bundle of bundles) {
    for (const item of bundle.ruleItems) {
      if (!item.enabled) {
        continue;
      }
      let score = 0;
      const matchReasons: string[] = [];
      const searchText = buildRuleItemSearchText(item);
      if (metricHint) {
        if (!includesMetricHint(metricHint, searchText)) {
          continue;
        }
        score += 100;
        matchReasons.push("metric:" + metricHint);
      }
      if (clauseHint && matchesRuleItemClause(item, clauseHint)) {
        score += 40;
        matchReasons.push("clause:" + clauseHint);
      }
      if (contextRuleVersion && bundle.rulePackage.version === contextRuleVersion) {
        score += 20;
        matchReasons.push("version:" + contextRuleVersion);
      }
      if (queryText && item.item_name && queryText.includes(normalizeSearchText(item.item_name))) {
        score += 15;
        matchReasons.push("name");
      }
      const ruleClauseTokens = readRuleItemClauseIds(item).map((entry) => entry.toLowerCase());
      if (queryText && ruleClauseTokens.some((entry) => queryText.includes(entry))) {
        score += 10;
        matchReasons.push("query-clause");
      }
      if (score <= 0 && !metricHint) {
        score = 1;
      }
      candidates.push({
        ruleId: item.rule_id,
        ruleVersion: item.rule_version || bundle.rulePackage.version || bundle.normdoc.version,
        normdocId: bundle.normdoc.normdoc_id,
        packageId: bundle.rulePackage.package_id,
        standardCode: bundle.normdoc.standard_code,
        score,
        matchReasons: matchReasons.length > 0 ? matchReasons : ["fallback"],
      });
    }
  }

  candidates.sort((left, right) =>
    right.score - left.score
    || right.ruleVersion.localeCompare(left.ruleVersion, "en")
    || left.ruleId.localeCompare(right.ruleId, "en"));
  return {
    selected: candidates[0] ?? null,
    candidates: candidates.slice(0, 5),
  };
}
function applyExternalInputToGatePayload(payload: {
  spuId?: string;
  nodeId?: string;
  containerId?: string;
  inputs?: Record<string, unknown>;
  externalInput?: {
    sourceId?: string;
    recordIndex?: number;
    strict?: boolean;
  };
}): {
  inputs?: Record<string, unknown>;
  externalInputMapping: {
    sourceId: string;
    recordIndex: number;
    missingInputs: string[];
    validationStatus: "valid" | "warning" | "invalid";
    record: Record<string, unknown>;
  } | null;
} {
  const sourceId = String(payload.externalInput?.sourceId ?? "").trim();
  const directInputs = payload.inputs && typeof payload.inputs === "object" && !Array.isArray(payload.inputs)
    ? payload.inputs
    : undefined;
  if (!sourceId) {
    return {
      inputs: directInputs ? { ...directInputs } : undefined,
      externalInputMapping: null,
    };
  }
  const mapped = service.resolveExternalSourceInputs({
    sourceId,
    spuId: resolveSpuIdForExternalInput(payload),
    recordIndex: payload.externalInput?.recordIndex,
    inputs: directInputs ?? {},
    strict: payload.externalInput?.strict,
  });
  return {
    inputs: mapped.mappedInputs,
    externalInputMapping: {
      sourceId: mapped.source.sourceId,
      recordIndex: mapped.recordIndex,
      missingInputs: mapped.missingInputs,
      validationStatus: mapped.source.validationStatus.status,
      record: mapped.record,
    },
  };
}

function readCatalogBrowseOptions(url: URL): CatalogBrowseOptions {
  const scope = readOptionalQuery(url, "scope");
  const types = toCatalogItemTypes(readListQuery(url, "types"));
  const statuses = toCatalogStatuses(readListQuery(url, "statuses"));
  const tags = readListQuery(url, "tags");
  const owner = readOptionalQuery(url, "owner");
  const limitRaw = Number(readOptionalQuery(url, "limit") ?? "");
  const includeDeprecated = readOptionalQuery(url, "includeDeprecated") === "true";
  return {
    scope: scope === "internal" || scope === "public" || scope === "all" ? scope : undefined,
    types: types.length > 0 ? types : undefined,
    statuses: statuses.length > 0 ? statuses : undefined,
    tags: tags.length > 0 ? tags : undefined,
    owner,
    includeDeprecated,
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
  };
}

function authorize(req: IncomingMessage, action: PermissionAction): RequestActor {
  const actor = resolveRequestActor(req);
  assertRoleCan(actor, action);
  return actor;
}

interface LayerPegQueryContext {
  ownerDid?: string;
  projectRef?: string;
  rootRef?: string;
  usi?: string;
}

function readLayerPegQueryContext(url: URL): LayerPegQueryContext {
  return {
    ownerDid: readOptionalQuery(url, "ownerDid"),
    projectRef: readOptionalQuery(url, "projectRef"),
    rootRef: readOptionalQuery(url, "rootRef"),
    usi: readOptionalQuery(url, "usi"),
  };
}

interface LayerPegResolveContext extends LayerPegQueryContext {
  persist?: boolean;
}

interface AnchorRequestPayload {
  enabled?: boolean;
  providerName?: string;
}

function resolveLayerPegSpecDocument(spuId: string, ctx: LayerPegResolveContext = {}) {
  const spu = service.getRegistry().find((item) => item.spuId === spuId) ?? null;
  if (!spu) {
    return null;
  }
  const document = layerPegFromSpu(spu, ctx);
  if (ctx.persist ?? true) {
    service.upsertLayerPegDocument(document, `spec:${spuId}`);
  }
  return document;
}

function resolveLayerPegNodeDocument(nodeId: string, ctx: LayerPegResolveContext = {}) {
  const node = service.getNode(nodeId);
  if (!node) {
    return null;
  }
  const container = node.containerRef ? service.getContainer(node.containerRef) : null;
  const spu = service.getRegistry().find((item) => item.spuId === node.spuId) ?? null;
  const auditTrail = service.getAudit("node", nodeId);
  const document = layerPegFromNodeExecution(node, {
    ...ctx,
    spu,
    container,
    auditTrail,
  });
  if (ctx.persist ?? true) {
    service.upsertLayerPegDocument(document, `node:${nodeId}`);
  }
  return document;
}

function resolveLayerPegContainerProofDocument(containerId: string, ctx: LayerPegResolveContext = {}) {
  const proof = service.getProof(containerId);
  if (!proof) {
    return null;
  }
  const container = service.getContainer(containerId);
  const auditTrail = service.getContainerAuditTrail(containerId);
  const document = layerPegFromContainerProof(proof, {
    ...ctx,
    container,
    auditTrail,
  });
  if (ctx.persist ?? true) {
    service.upsertLayerPegDocument(document, `container_proof:${containerId}`);
  }
  return document;
}

function toLayerPegRef(
  role: ProofLayerPegRef["role"],
  document: ReturnType<typeof resolveLayerPegSpecDocument>,
  sourceRef: string,
): ProofLayerPegRef | null {
  if (!document) {
    return null;
  }
  return {
    role,
    usi: document.header.usi,
    docType: document.header.docType,
    sourceRef,
    documentApiPath: `/api/layerpeg/documents/${encodeURIComponent(document.header.usi)}`,
  };
}

function resolveContainerStake(containerId: string): string | null {
  const mapping = service.queryMappingByContainerId(containerId);
  return mapping?.stake ?? mapping?.location.station ?? null;
}

function buildExecutionSummaryFromNode(node: ExecutionNode): ProofExecutionSummary {
  const containerId = node.containerRef ?? null;
  const container = containerId ? service.getContainer(containerId) : null;
  const stake = containerId ? resolveContainerStake(containerId) : null;
  const summaryText = `Node ${node.nodeId} for ${node.spuId} is ${node.status}`;
  return {
    executionId: node.nodeId,
    nodeId: node.nodeId,
    containerId,
    spuId: node.spuId,
    projectId: container?.projectId?.trim() || null,
    stake,
    summaryText,
  };
}

function buildExecutionSummaryFromContainerProof(proof: ContainerProof): ProofExecutionSummary {
  const container = service.getContainer(proof.containerId);
  const stake = resolveContainerStake(proof.containerId);
  const summaryText = `Container ${proof.containerId} archived with status ${proof.status}`;
  return {
    executionId: proof.executionId,
    nodeId: null,
    containerId: proof.containerId,
    spuId: proof.spuId,
    projectId: container?.projectId?.trim() || null,
    stake,
    summaryText,
  };
}

function buildNodeProofForExport(node: ExecutionNode): NonNullable<ExecutionNode["proof"]> | ReturnType<typeof buildProofFragment> {
  if (node.proof) {
    return node.proof;
  }
  const spu = service.getRegistry().find((item) => item.spuId === node.spuId);
  const matchedSpecVersion = spu?.meta.version ?? "unknown";
  const metaExtensions = toRecord(spu?.meta.extensions);
  const normdocId = String(metaExtensions?.normdoc_id ?? metaExtensions?.normdocId ?? "").trim()
    || (spu?.meta.norm && matchedSpecVersion ? `${spu.meta.norm}@@${matchedSpecVersion}` : "");
  const packageId = String(metaExtensions?.package_id ?? metaExtensions?.packageId ?? "").trim();
  const matchedRules = node.gate.results.map((item) => ({
    ruleId: item.ruleId,
    condition: `${item.field} ${item.operator} ${String(item.threshold)}`,
    passed: item.passed,
    severity: item.passed ? "info" : "blocking",
    message: item.message,
    actual: item.actual,
    expected: item.threshold,
  }));
  return buildProofFragment({
    executionId: node.nodeId,
    spuId: node.spuId,
    nodeId: node.nodeId,
    containerId: node.containerRef ?? null,
    inputSnapshot: { ...node.inputs },
    resultSnapshot: {
      outputs: { ...node.outputs },
      gate: node.gate,
    },
    matchedSpecVersion,
    matchedRules,
    status: node.gate.passed ? "PASS" : "FAIL",
    requiredSignatures: node.requiredSignatures,
    ruleBinding: {
      ruleId: node.spuId,
      ruleVersion: matchedSpecVersion,
      normdocId: normdocId || null,
      packageId: packageId || null,
    },
  });
}

function dedupeProofLayerPegRefs(refs: ProofLayerPegRef[]): ProofLayerPegRef[] {
  return Array.from(new Map(refs.map((item) => [`${item.role}:${item.usi}:${item.sourceRef}`, item])).values());
}

function buildProofLayerPegRefsFromNode(node: ExecutionNode): ProofLayerPegRef[] {
  const nodeSourceRef = node.vuri ?? `node:${node.nodeId}`;
  const containerProof = node.containerRef ? service.getProof(node.containerRef) : null;
  const container = node.containerRef ? service.getContainer(node.containerRef) : null;
  const proofSourceRef = containerProof?.vuri ?? container?.vuri ?? (node.containerRef ? `container_proof:${node.containerRef}` : null);
  return dedupeProofLayerPegRefs([
    toLayerPegRef("spec", resolveLayerPegSpecDocument(node.spuId), `spec:${node.spuId}`),
    toLayerPegRef("execution", resolveLayerPegNodeDocument(node.nodeId), nodeSourceRef),
    node.containerRef
      ? toLayerPegRef("proof", resolveLayerPegContainerProofDocument(node.containerRef), proofSourceRef ?? `container_proof:${node.containerRef}`)
      : null,
  ].filter((item): item is ProofLayerPegRef => Boolean(item)));
}

function buildProofLayerPegRefsFromContainer(containerId: string): ProofLayerPegRef[] {
  const container = service.getContainer(containerId);
  const containerProof = service.getProof(containerId);
  const refs: ProofLayerPegRef[] = [];
  const proofSourceRef = containerProof?.vuri ?? container?.vuri ?? `container_proof:${containerId}`;
  const proofRef = toLayerPegRef("proof", resolveLayerPegContainerProofDocument(containerId), proofSourceRef);
  if (proofRef) {
    refs.push(proofRef);
  }
  if (container) {
    for (const binding of container.specBindings) {
      const specRef = toLayerPegRef("spec", resolveLayerPegSpecDocument(binding.spuId), `spec:${binding.spuId}`);
      if (specRef) {
        refs.push(specRef);
      }
      if (binding.latestNodeId) {
        const node = service.getNode(binding.latestNodeId);
        const nodeSourceRef = node?.vuri ?? `node:${binding.latestNodeId}`;
        const nodeRef = toLayerPegRef("execution", resolveLayerPegNodeDocument(binding.latestNodeId), nodeSourceRef);
        if (nodeRef) {
          refs.push(nodeRef);
        }
      }
    }
  }
  return dedupeProofLayerPegRefs(refs);
}

function buildProofNormReferenceForSpu(spuId: string, fallbackVersion: string | null = null): ProofNormReference {
  const spu = service.getRegistry().find((item) => item.spuId === spuId);
  return {
    spuId,
    title: spu?.meta.name ?? null,
    norm: spu?.meta.norm ?? null,
    clause: spu?.meta.clause ?? null,
    version: spu?.meta.version ?? fallbackVersion,
  };
}

function buildProofNormReferencesFromNode(node: ExecutionNode, matchedSpecVersion: string): ProofNormReference[] {
  return [buildProofNormReferenceForSpu(node.spuId, matchedSpecVersion)];
}

function buildProofNormReferencesFromContainer(containerId: string, proof: ContainerProof): ProofNormReference[] {
  const container = service.getContainer(containerId);
  const candidates = container && container.specBindings.length > 0
    ? container.specBindings.map((binding) => ({
      spuId: binding.spuId,
      fallbackVersion: binding.version ?? null,
    }))
    : [{
      spuId: proof.spuId,
      fallbackVersion: proof.matchedSpecVersion ?? null,
    }];
  return Array.from(new Map(
    candidates.map((item) => {
      const resolved = buildProofNormReferenceForSpu(item.spuId, item.fallbackVersion);
      return [`${resolved.spuId}:${resolved.version ?? "-"}`, resolved];
    }),
  ).values());
}

function buildProofAuditPackageFromNode(node: ExecutionNode): ReturnType<typeof buildProofAuditExportPackage> {
  const proof = buildNodeProofForExport(node);
  return buildProofAuditExportPackage({
    proof,
    executionSummary: buildExecutionSummaryFromNode(node),
    linkedLayerPegDocumentRefs: buildProofLayerPegRefsFromNode(node),
    normReferences: buildProofNormReferencesFromNode(node, proof.matchedSpecVersion),
  });
}

function buildProofAuditPackageFromContainer(containerId: string, proof: ContainerProof): ReturnType<typeof buildProofAuditExportPackage> {
  return buildProofAuditExportPackage({
    proof,
    executionSummary: buildExecutionSummaryFromContainerProof(proof),
    linkedLayerPegDocumentRefs: buildProofLayerPegRefsFromContainer(containerId),
    normReferences: buildProofNormReferencesFromContainer(containerId, proof),
  });
}

function syncRuntimeDependencyEngine(): void {
  runtimeDependencyEngine.sync({
    registry: service.getRegistry(),
    containers: service.listContainers().map((item) => ({ container: item.container })),
  });
}

createServer(async (req, res) => {
  const publicRequestId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let isPublicRequest = false;
  try {
    if (req.method === "OPTIONS") {
      setCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    isPublicRequest = url.pathname.startsWith("/api/public/v1/");
    const resolvedTenantId = resolveTenantIdFromRequest({
      headerTenantId: headerValueAsString(req.headers["x-tenant-id"]),
      queryTenantId: url.searchParams.get("tenantId"),
      fallbackTenantId: "default",
    });
    tenantRegistry.enterTenant(resolvedTenantId);
    enterCatalogNamespace(resolvedTenantId);
    const parts = pathParts(url.pathname);

    if (req.method === "GET" && url.pathname === "/api/tenants") {
      sendJson(res, 200, {
        currentTenantId: tenantRegistry.getCurrentTenantId(),
        items: tenantRegistry.listTenants(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tenants") {
      authorize(req, "register");
      const body = await readBody<{
        tenantId?: string;
        projects?: string[];
        users?: Array<{ userId?: string; role?: string }>;
      }>(req);
      const tenantId = String(body.tenantId ?? "").trim();
      if (!tenantId) {
        throw new Error("tenantId is required");
      }
      const item = tenantRegistry.upsertTenant({
        tenantId,
        projects: Array.isArray(body.projects) ? body.projects.map((value) => String(value)) : undefined,
        users: Array.isArray(body.users)
          ? body.users.map((user) => ({
              userId: String(user?.userId ?? "").trim(),
              role: String(user?.role ?? "").trim() || undefined,
            }))
          : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tenants/shared-catalog") {
      const query = String(url.searchParams.get("query") ?? "").trim();
      const category = String(url.searchParams.get("category") ?? "").trim();
      const norm = String(url.searchParams.get("norm") ?? "").trim();
      sendJson(res, 200, {
        items: tenantRegistry.listSharedCatalog({
          query: query || undefined,
          category: category || undefined,
          norm: norm || undefined,
        }),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/public/v1/specs/register-markdown") {
      authorize(req, "register");
      const body = await readBody<{
        markdown?: string;
        source?: "template" | "pdf" | "markdown";
        riskWarnings?: ExtractionWarning[];
        originalDraftMarkdown?: string;
        editedMarkdown?: string;
        clauseReviewItems?: ClauseReviewItem[];
      }>(req);
      const markdown = String(body.markdown ?? "").trim();
      if (!markdown) {
        throw new PublicApiError("markdown is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      const warnings = Array.isArray(body.riskWarnings) ? body.riskWarnings : [];
      const clauseReviewItems = Array.isArray(body.clauseReviewItems) ? body.clauseReviewItems : [];
      const sourceHint = body.source;
      const compileSource: "template" | "pdf" | "markdown" =
        sourceHint === "template" || sourceHint === "pdf" || sourceHint === "markdown"
          ? sourceHint
          : warnings.length > 0 || Boolean(body.originalDraftMarkdown)
            ? "pdf"
            : "markdown";
      const preRegisterGuard = evaluatePreRegisterGuard({
        warnings,
        originalDraftMarkdown: String(body.originalDraftMarkdown ?? markdown),
        editedMarkdown: String(body.editedMarkdown ?? markdown),
        clauseReviewItems,
      });
      if (preRegisterGuard.blocked) {
        sendPublicSuccess(
          res,
          publicRequestId,
          {
            success: false,
            stage: "pre_register_review",
            error: preRegisterGuard.error,
            reasons: preRegisterGuard.reasons,
            lintResult: null,
            compileResult: null,
            spu: null,
            specbundle: null,
            preRegisterReview: preRegisterGuard.preRegisterReview,
            riskReview: preRegisterGuard.preRegisterReview.riskReview,
          },
        );
        return;
      }
      const result = await registerMarkdownSpec(service, markdown, compileSource);
      if (result.success && compileSource === "pdf") {
        const item = result.registered.item;
        const currentExtensions =
          item.meta.extensions && typeof item.meta.extensions === "object" && !Array.isArray(item.meta.extensions)
            ? item.meta.extensions as Record<string, unknown>
            : {};
        const clauseId = String(item.meta.clause ?? "").trim();
        const clauseOriginalText = extractClauseOriginalTextFromDraft(String(body.originalDraftMarkdown ?? markdown), clauseId);
        if (clauseOriginalText) {
          item.meta.extensions = {
            ...currentExtensions,
            clause_content: clauseOriginalText,
            original_text: clauseOriginalText,
          };
        }
      }
      const specUpgradeGuard =
        "json" in result
          ? evaluateSpecUpgradeGuard(service, result.json)
          : {
              hasBaseline: false,
              oldSpuId: null,
              impactAnalysis: null,
            };
      const runtimeImpactGuard =
        "json" in result
          ? evaluateSpecRuntimeImpactGuard(service, result.json, specUpgradeGuard.oldSpuId)
          : {
              hasRuntimeImpact: false,
              runningImpactScan: null,
            };
      const spuActivationPolicy =
        "json" in result
          ? buildActivationPolicyOnRegister(service, result.json, specUpgradeGuard.oldSpuId, "new_containers_only")
          : null;
      const layerPegDocument = result.success && result.stage === "registered"
        ? resolveLayerPegSpecDocument(result.spuId)
        : null;
      sendPublicSuccess(res, publicRequestId, {
        ...result,
        preRegisterReview: preRegisterGuard.preRegisterReview,
        riskReview: preRegisterGuard.preRegisterReview.riskReview,
        specImpactAnalysis: specUpgradeGuard.impactAnalysis,
        specImpactBaseSpuId: specUpgradeGuard.oldSpuId,
        runningImpactScan: runtimeImpactGuard.runningImpactScan,
        spuActivationPolicy,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/public/v1/spus/publish") {
      const actor = authorize(req, "register");
      const body = await readBody<{ definition?: SPUDefinition }>(req);
      if (!body.definition) {
        throw new PublicApiError("definition is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      const item = service.publishSpuVersion(body.definition, {});
      ruleStore.upsertNormDocFromSpus({
        standard_code: item.meta.norm,
        name: item.meta.name,
        version: item.meta.version,
        status: "published",
        signed_by: actor.actorId,
        created_by: actor.actorId,
        spuDefinitions: [item],
      });
      publishCatalogItem(service.getRegistry(), catalogItemIdFromSpuId(item.spuId), {
        owner: actor.actorId,
        visibility: "public",
      });
      sendPublicSuccess(res, publicRequestId, { item });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/public/v1/executions/evaluate") {
      authorize(req, "execute");
      const body = await readBody<RuleBoundExecutionInputPayload>(req);
      const normalized = normalizeRuleBoundExecutionPayload(body);
      const applied = applyExternalInputToGatePayload({
        spuId: normalized.ruleBinding.spuId,
        containerId: normalized.containerId,
        nodeId: normalized.nodeId,
        inputs: normalized.inputs,
        externalInput: normalized.externalInput,
      });
      const normalizedInputs = ensureGateInputsObject(applied.inputs);
      const response = evaluateGateRequest(service, {
        spuId: normalized.ruleBinding.spuId,
        containerId: normalized.containerId,
        nodeId: normalized.nodeId,
        inputs: normalizedInputs,
        context: normalized.context,
      });
      const layerPegDocument = resolveLayerPegNodeDocument(response.node.nodeId);
      sendPublicSuccess(res, publicRequestId, {
        ...response,
        externalInputMapping: applied.externalInputMapping,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "public" && parts[2] === "v1" && parts[3] === "proofs") {
      const containerId = parts[4];
      const proof = service.getProof(containerId);
      if (!proof) {
        throw new PublicApiError("proof not found", "PUBLIC_NOT_FOUND", 404);
      }
      const layerPegDocument = resolveLayerPegContainerProofDocument(containerId);
      sendPublicSuccess(res, publicRequestId, {
        proof,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/public/v1/mappings/by-stake") {
      const stake = String(url.searchParams.get("stake") ?? "").trim();
      if (!stake) {
        throw new PublicApiError("stake is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      const item = service.queryMappingByStake(stake);
      if (!item) {
        throw new PublicApiError("mapping not found", "PUBLIC_NOT_FOUND", 404);
      }
      sendPublicSuccess(res, publicRequestId, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/public/v1/mappings/minimal/by-stake") {
      const stake = String(url.searchParams.get("stake") ?? "").trim();
      if (!stake) {
        throw new PublicApiError("stake is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      const item = service.queryMappingMinimalByStake(stake);
      if (!item) {
        throw new PublicApiError("mapping not found", "PUBLIC_NOT_FOUND", 404);
      }
      sendPublicSuccess(res, publicRequestId, { item });
      return;
    }

    if (
      req.method === "GET" &&
      parts.length === 6 &&
      parts[0] === "api" &&
      parts[1] === "public" &&
      parts[2] === "v1" &&
      parts[3] === "mappings" &&
      (parts[4] === "container" || parts[4] === "by-container")
    ) {
      const item = service.queryMappingByContainerId(parts[5]);
      if (!item) {
        throw new PublicApiError("mapping not found", "PUBLIC_NOT_FOUND", 404);
      }
      sendPublicSuccess(res, publicRequestId, { item });
      return;
    }

    if (
      req.method === "GET" &&
      parts.length === 6 &&
      parts[0] === "api" &&
      parts[1] === "public" &&
      parts[2] === "v1" &&
      parts[3] === "mappings" &&
      (parts[4] === "node" || parts[4] === "by-node")
    ) {
      const item = service.queryMappingByNodeId(parts[5]);
      if (!item) {
        throw new PublicApiError("mapping not found", "PUBLIC_NOT_FOUND", 404);
      }
      sendPublicSuccess(res, publicRequestId, { item });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/public/v1/proofs/export") {
      authorize(req, "execute");
      const body = await readBody<{
        nodeId?: string;
        containerId?: string;
      }>(req);
      const nodeId = String(body.nodeId ?? "").trim();
      const containerId = String(body.containerId ?? "").trim();
      if (!nodeId && !containerId) {
        throw new PublicApiError("nodeId or containerId is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      if (nodeId && containerId) {
        throw new PublicApiError("only one of nodeId or containerId is allowed", "PUBLIC_INVALID_ARGUMENT", 400);
      }

      if (nodeId) {
        const node = service.getNode(nodeId);
        if (!node) {
          throw new PublicApiError("node not found", "PUBLIC_NOT_FOUND", 404);
        }
        const result = buildProofAuditPackageFromNode(node);
        sendPublicSuccess(res, publicRequestId, result);
        return;
      }

      const proof = service.getProof(containerId);
      if (!proof) {
        throw new PublicApiError("proof not found", "PUBLIC_NOT_FOUND", 404);
      }
      const result = buildProofAuditPackageFromContainer(containerId, proof);
      sendPublicSuccess(res, publicRequestId, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/public/v1/proofs/archive-export") {
      authorize(req, "archive");
      const body = await readBody<{
        containerId?: string;
        anchor?: AnchorRequestPayload;
      }>(req);
      const containerId = String(body.containerId ?? "").trim();
      if (!containerId) {
        throw new PublicApiError("containerId is required", "PUBLIC_INVALID_ARGUMENT", 400);
      }
      const proof = service.archiveContainer(containerId, {
        anchor: body.anchor,
      });
      const layerPegDocument = resolveLayerPegContainerProofDocument(containerId);
      const exportPackage = buildProofAuditPackageFromContainer(containerId, proof);
      sendPublicSuccess(res, publicRequestId, {
        proof,
        exportPackage,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard") {
      const observability = observabilityMetricsCollector.snapshot({
        windowMinutes: 60,
        bucketMinutes: 10,
      });
      sendJson(res, 200, {
        tenantId: tenantRegistry.getCurrentTenantId(),
        ...service.getDashboard(),
        observability: observability.summary,
        observabilityAlerts: observability.alerts,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/system/config") {
      sendJson(res, 200, {
        config: redactAppConfig(appConfig),
        warnings: appConfigWarnings,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/dashboard/metrics") {
      const windowMinutesRaw = Number(url.searchParams.get("windowMinutes"));
      const bucketMinutesRaw = Number(url.searchParams.get("bucketMinutes"));
      const dashboard = observabilityMetricsCollector.snapshot({
        windowMinutes: Number.isFinite(windowMinutesRaw) ? windowMinutesRaw : undefined,
        bucketMinutes: Number.isFinite(bucketMinutesRaw) ? bucketMinutesRaw : undefined,
      });
      sendJson(res, 200, dashboard);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rule-store/normdocs") {
      syncRuleStoreFromRegistry();
      const statuses = parseRuleStoreStatuses(url.searchParams.get("status"));
      const bundles = ruleStore.listBundles({
        statuses: statuses.length > 0 ? statuses : ["published"],
      });
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          items: bundles.map((bundle) => ({
            normdoc_id: bundle.normdoc.normdoc_id,
            standard_code: bundle.normdoc.standard_code,
            standard_name: bundle.normdoc.standard_name || bundle.normdoc.name,
            name: bundle.normdoc.name,
            version: bundle.normdoc.version,
            status: bundle.normdoc.status,
            bundle_hash: bundle.normdoc.bundle_hash,
            rule_count: bundle.normdoc.rule_count,
            component_count: bundle.normdoc.component_count,
            created_at: bundle.normdoc.created_at,
            published_at: bundle.normdoc.published_at,
            signed_by: bundle.normdoc.signed_by,
            source: "Rule Store",
          })),
        }),
      });
      return;
    }

    if (
      req.method === "POST"
      && parts.length === 5
      && parts[0] === "api"
      && parts[1] === "rule-store"
      && parts[2] === "normdocs"
      && (parts[4] === "publish" || parts[4] === "deprecate")
    ) {
      const actor = authorize(req, "register");
      syncRuleStoreFromRegistry();
      const normdocId = String(parts[3] ?? "").trim();
      if (!normdocId) {
        sendJson(res, 400, { error: "normdoc_id is required" });
        return;
      }
      const status: RuleStoreStatus = parts[4] === "publish" ? "published" : "deprecated";
      const updated = ruleStore.updateNormDocStatus(normdocId, {
        status,
        signed_by: actor.actorId,
      });
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          item: {
            normdoc: {
              ...updated.normdoc,
              source: "Rule Store",
            },
            rule_package: {
              ...updated.rulePackage,
              source: "Rule Store",
            },
            rules: updated.ruleItems.map((item) => ({
              ...item,
              required: isRuleItemRequiredFromSeverity(item.severity),
              version: updated.rulePackage.version,
              status: updated.rulePackage.status,
              source: "Rule Store",
            })),
          },
        }),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rule-store/rollback") {
      const actor = authorize(req, "register");
      syncRuleStoreFromRegistry();
      const body = await readBody<{
        standard_code?: string;
        target_normdoc_id?: string;
      }>(req);
      const standardCode = String(body.standard_code ?? "").trim();
      const targetNormdocId = String(body.target_normdoc_id ?? "").trim();
      if (!standardCode || !targetNormdocId) {
        sendJson(res, 400, { error: "standard_code and target_normdoc_id are required" });
        return;
      }
      const allBundles = ruleStore.listBundles();
      const family = allBundles.filter((bundle) => bundle.normdoc.standard_code === standardCode);
      if (family.length === 0) {
        sendJson(res, 404, { error: "no normdoc family found for standard_code" });
        return;
      }
      const target = family.find((bundle) => bundle.normdoc.normdoc_id === targetNormdocId);
      if (!target) {
        sendJson(res, 404, { error: "target_normdoc_id not found in standard family" });
        return;
      }
      for (const item of family) {
        if (item.normdoc.normdoc_id === targetNormdocId) {
          continue;
        }
        if (item.normdoc.status === "published") {
          ruleStore.updateNormDocStatus(item.normdoc.normdoc_id, {
            status: "deprecated",
            signed_by: actor.actorId,
          });
        }
      }
      const updated = ruleStore.updateNormDocStatus(targetNormdocId, {
        status: "published",
        signed_by: actor.actorId,
      });
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          item: {
            normdoc: {
              ...updated.normdoc,
              source: "Rule Store",
            },
            rule_package: {
              ...updated.rulePackage,
              source: "Rule Store",
            },
            rules: updated.ruleItems.map((item) => ({
              ...item,
              required: isRuleItemRequiredFromSeverity(item.severity),
              version: updated.rulePackage.version,
              status: updated.rulePackage.status,
              source: "Rule Store",
            })),
          },
        }),
      });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "rule-store" && parts[2] === "normdocs") {
      syncRuleStoreFromRegistry();
      const normdocId = String(parts[3] ?? "").trim();
      if (!normdocId) {
        sendJson(res, 404, { error: "normdoc not found" });
        return;
      }
      const bundle = ruleStore.getNormDocAggregate(normdocId)
        ?? ruleStore.resolveBundle(normdocId, { statuses: ["published"] });
      if (!bundle || bundle.normdoc.status !== "published") {
        sendJson(res, 404, { error: "normdoc not found" });
        return;
      }
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          item: {
            normdoc: {
              ...bundle.normdoc,
              source: "Rule Store",
            },
            rule_package: {
              ...bundle.rulePackage,
              source: "Rule Store",
            },
            previews: {
              spec_md: buildNormDocMarkdownPreview(bundle),
              spec_json: buildNormDocSpecJsonPreview(bundle),
              specir_yaml: buildNormDocSpecIrYamlPreview(bundle),
            },
            components: Array.from(
              new Set(bundle.ruleItems.map((item) => deriveSpuKeyFromSpuId(item.rule_id)).filter(Boolean)),
            ).map((componentId) => ({
              component_id: componentId,
              bound_clause_ids: Array.from(new Set(
                bundle.ruleItems
                  .filter((item) => deriveSpuKeyFromSpuId(item.rule_id) === componentId)
                  .flatMap((item) => item.clause_ids ?? [])
                  .filter(Boolean),
              )),
            })),
            source_clauses: Array.from(new Set(bundle.ruleItems.flatMap((item) => item.clause_ids ?? []).filter(Boolean))),
            rules: bundle.ruleItems.map((item) => ({
              ...item,
              required: isRuleItemRequiredFromSeverity(item.severity),
              version: bundle.rulePackage.version,
              status: bundle.rulePackage.status,
              source: "Rule Store",
            })),
          },
        }),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rule-store/packages") {
      syncRuleStoreFromRegistry();
      const normdocIdQuery = String(url.searchParams.get("normdoc_id") ?? "").trim();
      const bundles = ruleStore.listBundles({
        statuses: ["published"],
      }).filter((bundle) => (normdocIdQuery ? bundle.rulePackage.normdoc_id === normdocIdQuery : true));
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          items: bundles.map((bundle) => ({
            package_id: bundle.rulePackage.package_id,
            normdoc_id: bundle.rulePackage.normdoc_id,
            name: bundle.rulePackage.name,
            version: bundle.rulePackage.version,
            items_count: bundle.rulePackage.items_count,
            status: bundle.rulePackage.status,
            source: "Rule Store",
          })),
        }),
      });
      return;
    }

    if (
      req.method === "GET"
      && parts.length === 5
      && parts[0] === "api"
      && parts[1] === "rule-store"
      && parts[2] === "packages"
      && parts[4] === "rules"
    ) {
      syncRuleStoreFromRegistry();
      const packageId = String(parts[3] ?? "").trim();
      if (!packageId) {
        sendJson(res, 404, { error: "package not found" });
        return;
      }
      const bundle = ruleStore.listBundles({ statuses: ["published"] })
        .find((item) => item.rulePackage.package_id === packageId);
      if (!bundle) {
        sendJson(res, 404, { error: "package not found" });
        return;
      }
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          package: {
            ...bundle.rulePackage,
            source: "Rule Store",
          },
          items: bundle.ruleItems.map((item) => ({
            ...item,
            required: isRuleItemRequiredFromSeverity(item.severity),
            version: bundle.rulePackage.version,
            status: bundle.rulePackage.status,
            source: "Rule Store",
          })),
        }),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rule-store/publish") {
      const actor = authorize(req, "register");
      syncRuleStoreFromRegistry();
      const body = await readBody<{
        normdoc_id?: string;
        package_id?: string;
        standard_code?: string;
        name?: string;
        version?: string;
        signed_by?: string;
        created_by?: string;
        spu_ids?: string[];
        spu_clause_bindings?: Record<string, {
          clause_id?: string;
          clause_no?: string;
          clause_ids?: string[];
          normdoc_id?: string;
          rule_version?: string;
          review_required?: boolean;
        }>;
      }>(req);
      const spuIds = Array.isArray(body.spu_ids)
        ? Array.from(new Set(body.spu_ids.map((item) => String(item ?? "").trim()).filter(Boolean)))
        : [];
      if (spuIds.length > 0) {
        sendJson(res, 400, {
          error: "spu_ids direct publish is disabled; publish must target existing NormDoc generated from specbundle",
        });
        return;
      }
      const normdocId = String(body.normdoc_id ?? "").trim();
      const packageId = String(body.package_id ?? "").trim();
      let targetNormdocId = normdocId;
      if (!targetNormdocId && packageId) {
        const matched = ruleStore.listBundles()
          .find((item) => item.rulePackage.package_id === packageId);
        targetNormdocId = matched?.normdoc.normdoc_id ?? "";
      }
      if (targetNormdocId) {
        const exists = ruleStore.getNormDoc(targetNormdocId);
        if (!exists) {
          targetNormdocId = "";
        }
      }
      if (!targetNormdocId) {
        const fallbackStandardCode = String(body.standard_code ?? "").trim();
        const fallbackVersion = String(body.version ?? "").trim();
        if (fallbackStandardCode && fallbackVersion) {
          const fallback = ruleStore
            .listBundles()
            .find((item) =>
              item.normdoc.standard_code === fallbackStandardCode
              && item.normdoc.version === fallbackVersion
              && item.normdoc.status === "draft");
          targetNormdocId = fallback?.normdoc.normdoc_id ?? "";
        }
      }
      if (!targetNormdocId) {
        sendJson(res, 400, { error: "normdoc_id is required" });
        return;
      }
      const updated = ruleStore.updateNormDocStatus(targetNormdocId, {
        status: "published",
        signed_by: body.signed_by || actor.actorId,
      });
      sendJson(res, 200, {
        ...toRuleStoreEnvelope({
          item: {
            normdoc: {
              ...updated.normdoc,
              source: "Rule Store",
            },
            rule_package: {
              ...updated.rulePackage,
              source: "Rule Store",
            },
            rules: updated.ruleItems.map((item) => ({
              ...item,
              required: isRuleItemRequiredFromSeverity(item.severity),
              version: updated.rulePackage.version,
              status: updated.rulePackage.status,
              source: "Rule Store",
            })),
          },
        }),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rules") {
      const projectId = String(url.searchParams.get("projectId") ?? "").trim();
      const statuses = parseRuleStoreStatuses(url.searchParams.get("status"));
      const effectiveStatuses: RuleStoreStatus[] = statuses.length > 0 ? statuses : ["published"];
      sendJson(res, 200, {
        ...buildRuleStoreListPayload(projectId || undefined, {
          statuses: effectiveStatuses,
        }),
        source: "Rule Store",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/rules/version") {
      const projectId = String(url.searchParams.get("projectId") ?? "").trim();
      const includeHistory = parseQueryBoolean(url.searchParams.get("includeHistory"));
      const spuKey = String(url.searchParams.get("spuKey") ?? "").trim();
      const ruleId = String(url.searchParams.get("id") ?? "").trim();
      const publishedPayload = buildRuleStoreListPayload(projectId || undefined, { statuses: ["published"] });
      const publishedSpuKeys = new Set(
        publishedPayload.items.flatMap((item) => item.spuIds.map((spuId) => deriveSpuKeyFromSpuId(spuId))).filter(Boolean),
      );

      const targetSpuKeys = new Set<string>();
      if (spuKey) {
        if (!publishedSpuKeys.has(spuKey)) {
          sendJson(res, 200, {
            items: [],
            projectId: projectId || null,
          });
          return;
        }
        targetSpuKeys.add(spuKey);
      } else if (ruleId) {
        const resolved = resolveRuleStoreItemById(ruleId, { statuses: ["published"] });
        if (!resolved) {
          sendJson(res, 404, { error: "rule not found" });
          return;
        }
        for (const ruleSpuId of resolved.spuIds) {
          targetSpuKeys.add(deriveSpuKeyFromSpuId(ruleSpuId));
        }
      } else {
        for (const item of publishedPayload.items) {
          for (const ruleSpuId of item.spuIds) {
            targetSpuKeys.add(deriveSpuKeyFromSpuId(ruleSpuId));
          }
        }
      }

      const items = Array.from(targetSpuKeys)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "en"))
        .map((targetSpuKey) => {
          const payload = collectRuleVersionSnapshots([targetSpuKey], projectId || undefined);
          const bindingHistory = projectId
            ? service.listProjectSpuBindingHistory(projectId, targetSpuKey)
            : [];
          return {
            spuKey: targetSpuKey,
            versions: payload.items,
            projectBinding: payload.projectBindings[0] ?? null,
            ...(includeHistory ? { bindingHistory } : {}),
          };
        });

      sendJson(res, 200, {
        items,
        projectId: projectId || null,
      });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "rules") {
      const ruleId = String(parts[2] ?? "").trim();
      if (!ruleId || ruleId.toLowerCase() === "version") {
        sendJson(res, 404, { error: "rule not found" });
        return;
      }
      const resolved = resolveRuleStoreItemById(ruleId, { statuses: ["published"] });
      if (!resolved) {
        sendJson(res, 404, { error: "rule not found" });
        return;
      }
      const projectId = String(url.searchParams.get("projectId") ?? "").trim();
      const includeHistory = parseQueryBoolean(url.searchParams.get("includeHistory"));
      const spuKeys = Array.from(new Set(resolved.spuIds.map((spuId) => deriveSpuKeyFromSpuId(spuId)).filter(Boolean)));
      const versionsPayload = collectRuleVersionSnapshots(spuKeys, projectId || undefined);
      const bindingHistory = projectId
        ? spuKeys.flatMap((spuKey) => service.listProjectSpuBindingHistory(projectId, spuKey))
        : [];
      const listPayload = buildRuleStoreListPayload(projectId || undefined, { statuses: ["published"] });
      const item = listPayload.items.find((entry) => entry.key === resolved.key);
      if (!item) {
        sendJson(res, 404, { error: "rule not found" });
        return;
      }
      sendJson(res, 200, {
        item: {
          ...item,
          spuKeys,
        },
        versions: versionsPayload.items,
        projectBindings: versionsPayload.projectBindings,
        ...(includeHistory ? { bindingHistory } : {}),
        projectId: projectId || null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/normdoc/list") {
      const statuses = parseRuleStoreStatuses(url.searchParams.get("status"));
      sendJson(res, 200, buildNormDocListPayload({
        statuses: statuses.length > 0 ? statuses : undefined,
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/registry/spus") {
      const classification = String(url.searchParams.get("classification") ?? "").trim().toLowerCase();
      if (classification === "measurement" || classification === "validation" || classification === "compliance") {
        sendJson(res, 200, { items: service.listSpusByClassification(classification) });
        return;
      }
      sendJson(res, 200, { items: service.getRegistry() });
      return;
    }

    if (
      req.method === "GET" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "registry" &&
      parts[2] === "spus" &&
      parts[4] === "profile"
    ) {
      const spuId = decodeURIComponent(parts[3] ?? "");
      const profile = service.getSpuCrossDomainProfile(spuId);
      if (!profile) {
        sendJson(res, 404, { error: "spu not found" });
        return;
      }
      sendJson(res, 200, { profile });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/registry/spu-versions") {
      const spuKey = String(url.searchParams.get("spuKey") ?? "").trim();
      sendJson(res, 200, { items: service.listSpuVersionRecords(spuKey || undefined) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/registry/spu-versions/publish") {
      const actor = authorize(req, "register");
      const body = await readBody<{
        definition?: SPUDefinition;
        sourceType?: SPUDefinition["sourceType"];
      }>(req);
      if (!body.definition) {
        throw new Error("definition is required");
      }
      const published = service.publishSpuVersion(body.definition, {});
      ruleStore.upsertNormDocFromSpus({
        standard_code: published.meta.norm,
        name: published.meta.name,
        version: published.meta.version,
        status: "published",
        signed_by: actor.actorId,
        created_by: actor.actorId,
        spuDefinitions: [published],
      });
      publishCatalogItem(service.getRegistry(), catalogItemIdFromSpuId(published.spuId), {
        owner: actor.actorId,
        visibility: "public",
      });
      sendJson(res, 200, { item: published });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/versioning/projects/bind") {
      const body = await readBody<{
        projectId?: string;
        spuKey?: string;
        selector?: { spuId?: string; version?: string; major?: number; minor?: number; patch?: number; latest?: boolean };
        note?: string;
      }>(req);
      if (!body.projectId || !body.spuKey) {
        throw new Error("projectId and spuKey are required");
      }
      const binding = service.bindProjectSpuVersion({
        projectId: String(body.projectId),
        spuKey: String(body.spuKey),
        selector: body.selector,
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { binding });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/versioning/projects/rollback") {
      const body = await readBody<{
        projectId?: string;
        spuKey?: string;
        targetVersion?: string;
        note?: string;
      }>(req);
      if (!body.projectId || !body.spuKey || !body.targetVersion) {
        throw new Error("projectId, spuKey and targetVersion are required");
      }
      const binding = service.rollbackProjectSpuVersion({
        projectId: String(body.projectId),
        spuKey: String(body.spuKey),
        targetVersion: String(body.targetVersion),
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { binding });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/versioning/spec-patches/apply") {
      const actor = authorize(req, "register");
      const body = await readBody<{
        oldSpuId?: string;
        newDefinition?: SPUDefinition;
        note?: string;
        invalidatePreviousResults?: boolean;
      }>(req);
      if (!body.oldSpuId || !body.newDefinition) {
        throw new Error("oldSpuId and newDefinition are required");
      }
      const patch = service.applySpecPatch({
        oldSpuId: String(body.oldSpuId),
        newDefinition: body.newDefinition,
        note: body.note ? String(body.note) : `patched by ${actor.actorId}`,
        invalidatePreviousResults: body.invalidatePreviousResults !== false,
      });
      sendJson(res, 200, { patch });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/versioning/spec-patches") {
      sendJson(res, 200, { items: service.listSpecUpdatePatches() });
      return;
    }

    if (
      req.method === "GET" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "versioning" &&
      parts[2] === "spec-patches"
    ) {
      const item = service.getSpecUpdatePatch(parts[3]);
      if (!item) {
        sendJson(res, 404, { error: "spec patch not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "versioning" &&
      parts[2] === "spec-patches" &&
      parts[4] === "rerun"
    ) {
      authorize(req, "execute");
      const body = await readBody<{
        autoSignRequired?: boolean;
        maxItems?: number;
      }>(req);
      const result = service.rerunSpecUpdatePatch({
        patchId: parts[3],
        autoSignRequired: body.autoSignRequired !== false,
        maxItems: Number.isInteger(body.maxItems) ? Number(body.maxItems) : undefined,
      });
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/versioning/spu-diff") {
      const body = await readBody<{ fromSpuId?: string; toSpuId?: string }>(req);
      if (!body.fromSpuId || !body.toSpuId) {
        throw new Error("fromSpuId and toSpuId are required");
      }
      sendJson(res, 200, { diff: service.summarizeSpuVersionDiff(String(body.fromSpuId), String(body.toSpuId)) });
      return;
    }

    if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "versioning" && parts[2] === "projects" && parts[4] === "bindings") {
      sendJson(res, 200, { items: service.listProjectSpuBindings(parts[3]) });
      return;
    }

    if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "versioning" && parts[2] === "projects" && parts[4] === "effective") {
      const spuKey = String(url.searchParams.get("spuKey") ?? "").trim();
      if (!spuKey) {
        throw new Error("spuKey is required");
      }
      sendJson(res, 200, { item: service.getCurrentEffectiveVersion(parts[3], spuKey) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/projects/context") {
      const body = await readBody<{
        projectId?: string;
        overrides?: {
          global?: Record<string, unknown>;
          bySpuKey?: Record<string, Record<string, unknown>>;
          bySpuId?: Record<string, Record<string, unknown>>;
        };
      }>(req);
      if (!body.projectId) {
        throw new Error("projectId is required");
      }
      const item = service.upsertProjectContext({
        projectId: String(body.projectId),
        overrides: body.overrides,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, { items: service.listProjectContexts() });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "projects") {
      const item = service.getProjectContext(parts[2]);
      if (!item) {
        sendJson(res, 404, { error: "project not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/approval/candidates") {
      const actor = authorize(req, "compile");
      const body = await readBody<{
        title?: string;
        summary?: string;
        content?: Record<string, unknown>;
        assetType?: ApprovalAssetType;
        assetRef?: string;
      }>(req);
      const item = approvalFlow.createCandidate({
        title: String(body.title ?? ""),
        summary: body.summary ? String(body.summary) : undefined,
        content: body.content,
        assetType: body.assetType,
        assetRef: body.assetRef ? String(body.assetRef) : undefined,
        actorId: actor.actorId,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/approval/candidates") {
      const assetTypeRaw = String(url.searchParams.get("assetType") ?? "").trim();
      const statusRaw = String(url.searchParams.get("status") ?? "").trim();
      const assetType: ApprovalAssetType | undefined =
        assetTypeRaw === "spu" || assetTypeRaw === "template" || assetTypeRaw === "specbundle"
          ? assetTypeRaw
          : undefined;
      const status: CandidateApprovalStatus | undefined =
        statusRaw === "draft" ||
          statusRaw === "submitted" ||
          statusRaw === "in_review" ||
          statusRaw === "approved" ||
          statusRaw === "rejected" ||
          statusRaw === "published" ||
          statusRaw === "deprecated"
          ? statusRaw
          : undefined;
      sendJson(res, 200, {
        items: approvalFlow.listCandidates({
          assetType,
          status,
        }),
      });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "approval" && parts[2] === "candidates") {
      const item = approvalFlow.getCandidate(parts[3]);
      if (!item) {
        sendJson(res, 404, { error: "candidate not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "approval" &&
      parts[2] === "candidates" &&
      parts[4] === "submit"
    ) {
      const actor = authorize(req, "compile");
      const body = await readBody<{ note?: string }>(req);
      const item = approvalFlow.submitCandidate(parts[3], {
        actorId: actor.actorId,
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "approval" &&
      parts[2] === "candidates" &&
      parts[4] === "review"
    ) {
      const actor = authorize(req, "approve_candidate_rule");
      const body = await readBody<{ note?: string }>(req);
      const item = approvalFlow.moveToReview(parts[3], {
        actorId: actor.actorId,
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "approval" &&
      parts[2] === "candidates" &&
      parts[4] === "decision"
    ) {
      const actor = authorize(req, "approve_candidate_rule");
      const body = await readBody<{ decision?: "approve" | "reject"; note?: string }>(req);
      const item = approvalFlow.decideCandidate(parts[3], {
        actorId: actor.actorId,
        decision: body.decision === "reject" ? "reject" : "approve",
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "approval" &&
      parts[2] === "candidates" &&
      parts[4] === "publish"
    ) {
      const actor = authorize(req, "register");
      const body = await readBody<{
        publishedRef?: string;
        note?: string;
        definition?: SPUDefinition;
      }>(req);
      const candidate = approvalFlow.getCandidate(parts[3]);
      if (!candidate) {
        sendJson(res, 404, { error: "candidate not found" });
        return;
      }
      if (body.definition && candidate.assetType !== "spu") {
        throw new Error("definition publish is only supported for assetType=spu");
      }
      let publishedSpuId = body.publishedRef ? String(body.publishedRef) : undefined;
      let publishedItem: SPUDefinition | null = null;
      if (body.definition) {
        publishedItem = service.publishSpuVersion(body.definition, {});
        publishedSpuId = publishedItem.spuId;
        ruleStore.upsertNormDocFromSpus({
          standard_code: publishedItem.meta.norm,
          name: publishedItem.meta.name,
          version: publishedItem.meta.version,
          status: "published",
          signed_by: actor.actorId,
          created_by: actor.actorId,
          spuDefinitions: [publishedItem],
        });
      }
      const item = approvalFlow.publishCandidate(parts[3], {
        actorId: actor.actorId,
        publishedRef: publishedSpuId,
        note: body.note ? String(body.note) : undefined,
      });
      if (publishedSpuId) {
        publishCatalogItem(service.getRegistry(), catalogItemIdFromSpuId(publishedSpuId), {
          owner: actor.actorId,
          visibility: "public",
        });
        if (!publishedItem) {
          const existingPublished = service.getRegistry().find((item) => item.spuId === publishedSpuId) ?? null;
          if (existingPublished) {
            ruleStore.upsertNormDocFromSpus({
              standard_code: existingPublished.meta.norm,
              name: existingPublished.meta.name,
              version: existingPublished.meta.version,
              status: "published",
              signed_by: actor.actorId,
              created_by: actor.actorId,
              spuDefinitions: [existingPublished],
            });
          }
        }
      }
      sendJson(res, 200, { item, publishedItem });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "approval" &&
      parts[2] === "candidates" &&
      parts[4] === "deprecate"
    ) {
      const actor = authorize(req, "register");
      const body = await readBody<{ note?: string }>(req);
      const item = approvalFlow.deprecateCandidate(parts[3], {
        actorId: actor.actorId,
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/catalog-assets") {
      const options = readCatalogBrowseOptions(url);
      sendJson(res, 200, { items: browseCatalogItems(service.getRegistry(), options) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/catalog-assets/search") {
      const query = String(url.searchParams.get("q") ?? "").trim();
      const options = readCatalogBrowseOptions(url);
      sendJson(res, 200, { items: searchCatalogItems(service.getRegistry(), { ...options, query }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/catalog-assets/import") {
      const actor = authorize(req, "register");
      const body = await readBody<{
        itemId?: string;
        type?: CatalogItemType;
        title?: string;
        normSource?: string;
        version?: string;
        owner?: string;
        visibility?: CatalogItemVisibility;
        tags?: string[];
        dependencies?: string[];
        status?: CatalogItemStatus;
        refSpuId?: string;
        sourceType?: SPUDefinition["sourceType"];
        definitionText?: string;
      }>(req);
      const normalizedType: CatalogItemType =
        body.type === "spu" || body.type === "spec" || body.type === "template" || body.type === "specbundle"
          ? body.type
          : "spu";
      const validStatus: CatalogItemStatus | undefined =
        body.status === "draft" || body.status === "published" || body.status === "deprecated"
          ? body.status
          : undefined;

      let importedSpu: SPUDefinition | null = null;
      if (normalizedType === "spu" && String(body.definitionText ?? "").trim()) {
        importedSpu = service.importSpuDefinition(String(body.definitionText), body.sourceType ?? "imported");
      }
      const nextItem = importCatalogItem(service.getRegistry(), {
        itemId: body.itemId ?? (importedSpu ? catalogItemIdFromSpuId(importedSpu.spuId) : undefined),
        type: normalizedType,
        title: body.title ?? importedSpu?.meta.name ?? body.refSpuId ?? "Untitled Asset",
        normSource: body.normSource ?? importedSpu?.meta.norm ?? "UNKNOWN",
        version: body.version ?? importedSpu?.meta.version ?? "v1",
        owner: body.owner ?? actor.actorId,
        visibility: toCatalogVisibility(body.visibility) ?? "internal",
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        dependencies: Array.isArray(body.dependencies) ? body.dependencies : undefined,
        status: validStatus ?? (normalizedType === "spu" ? "draft" : "draft"),
        refSpuId: body.refSpuId ?? importedSpu?.spuId ?? null,
        sourceType: importedSpu?.sourceType ?? body.sourceType ?? null,
      });
      sendJson(res, 200, { item: nextItem, importedSpu });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "publish"
    ) {
      const actor = authorize(req, "register");
      const body = await readBody<{
        visibility?: CatalogItemVisibility;
        tags?: string[];
        runtimeVersionRange?: string;
        compatibleAssetVersions?: string[];
        compatibilityNotes?: string;
      }>(req);
      const item = publishCatalogItem(service.getRegistry(), parts[2], {
        owner: actor.actorId,
        visibility: toCatalogVisibility(body.visibility) ?? "public",
        tags: Array.isArray(body.tags) ? body.tags : undefined,
        runtimeVersionRange: body.runtimeVersionRange ? String(body.runtimeVersionRange) : undefined,
        compatibleAssetVersions: Array.isArray(body.compatibleAssetVersions)
          ? body.compatibleAssetVersions.map((value) => String(value))
          : undefined,
        compatibilityNotes: body.compatibilityNotes ? String(body.compatibilityNotes) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "deprecate"
    ) {
      authorize(req, "register");
      const item = deprecateCatalogItem(service.getRegistry(), parts[2]);
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "rate"
    ) {
      authorize(req, "execute");
      const actor = resolveRequestActor(req);
      const body = await readBody<{ score?: number; reviewerId?: string; comment?: string }>(req);
      const item = rateCatalogItem(service.getRegistry(), parts[2], {
        reviewerId: body.reviewerId ? String(body.reviewerId) : actor.actorId,
        score: Number(body.score ?? 0),
        comment: body.comment ? String(body.comment) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "download"
    ) {
      authorize(req, "execute");
      const item = registerMarketplaceDownload(service.getRegistry(), parts[2]);
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "reference"
    ) {
      authorize(req, "execute");
      const body = await readBody<{ referenceId?: string; referenceType?: string; note?: string }>(req);
      const item = registerMarketplaceReference(service.getRegistry(), parts[2], {
        referenceId: body.referenceId ? String(body.referenceId) : undefined,
        referenceType: body.referenceType ? String(body.referenceType) : undefined,
        note: body.note ? String(body.note) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (
      req.method === "POST" &&
      parts.length === 4 &&
      parts[0] === "api" &&
      parts[1] === "catalog-assets" &&
      parts[3] === "compatibility"
    ) {
      authorize(req, "register");
      const body = await readBody<{
        runtimeVersionRange?: string;
        compatibleAssetVersions?: string[];
        notes?: string;
      }>(req);
      const item = updateCatalogItemCompatibility(service.getRegistry(), parts[2], {
        runtimeVersionRange: body.runtimeVersionRange ? String(body.runtimeVersionRange) : undefined,
        compatibleAssetVersions: Array.isArray(body.compatibleAssetVersions)
          ? body.compatibleAssetVersions.map((value) => String(value))
          : undefined,
        notes: body.notes ? String(body.notes) : undefined,
      });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/marketplace/items") {
      const options = readCatalogBrowseOptions(url);
      const statuses = options.statuses && options.statuses.length > 0 ? options.statuses : ["published"];
      sendJson(res, 200, {
        items: listMarketplaceItems(service.getRegistry(), {
          ...options,
          statuses,
        }),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/component-catalogs") {
      sendJson(res, 200, { items: listComponentCatalogs(service.getRegistry()) });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "component-catalogs" && parts[3] === "components") {
      sendJson(res, 200, { items: listCatalogComponents(service.getRegistry(), parts[2]) });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "component-catalogs") {
      const detail = getComponentCatalogDetail(service.getRegistry(), parts[2]);
      if (!detail) {
        sendJson(res, 404, { error: "component catalog not found" });
        return;
      }
      sendJson(res, 200, { catalog: detail });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/component-market/listings") {
      sendJson(res, 200, { items: listComponentMarketplaceListings(service.getRegistry()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spu-selector/select") {
      const body = await readBody<SpuSelectorInput>(req);
      const result = selectSpuCandidates(service, {
        intent: String(body.intent ?? "").trim() || "gate.preview",
        projectContext: body.projectContext,
        containerMetadata: body.containerMetadata,
        nodeMetadata: body.nodeMetadata,
        hints: body.hints,
        inputs: body.inputs,
        limit: body.limit,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/nl2gate/query") {
      const body = await readBody<{
        query?: string;
        mode?: "preview" | "evaluate";
        context?: Record<string, unknown>;
        conversationId?: string;
        execute?: boolean;
        externalInput?: {
          sourceId?: string;
          recordIndex?: number;
          strict?: boolean;
        };
      }>(req);
      const query = String(body.query ?? "").trim();
      const shouldExecute = body.execute !== false;
      const incomingContextRecord = toRecord(body.context) ?? {};
      const inputConversationId = normalizeRuleStorePegBotConversationId(body.conversationId)
        ?? normalizeRuleStorePegBotConversationId(incomingContextRecord.conversationId);
      const existingRuleStoreSession = readPegBotRuleStoreSession(inputConversationId);
      const aggregateContextRecord = buildRuleStorePegBotContext(
        existingRuleStoreSession?.context ?? null,
        incomingContextRecord,
        existingRuleStoreSession?.collectedInputs ?? {},
      );
      if (isAcceptanceAggregateQuery(query)) {
        const aggregateResult = executeAcceptanceAggregateRun({
          query,
          context: aggregateContextRecord,
        });
        const aggregatePoint =
          readContextTextValue(aggregateContextRecord, ["point", "stake"])
          ?? parseStakeFromQuery(query)
          ?? "K19+070";
        const aggregateProjectId = readContextTextValue(aggregateContextRecord, ["project_id", "projectId"]) ?? "P1";
        const aggregateUserId = readContextTextValue(aggregateContextRecord, ["user_id", "userId"]) ?? "did:peg:ins_001";
        const executionStatus = aggregateResult.overall === "PASS" ? "PASS" : "FAIL";
        const aggregateExecution = shouldExecute
          ? {
              status: executionStatus as "PASS" | "FAIL",
              executionId: `aggregate_${Date.now()}`,
              outputs: {
                overall: aggregateResult.overall,
                item_results: aggregateResult.item_results,
                proof_refs: aggregateResult.proof_refs,
              },
              gate: {
                passed: aggregateResult.overall === "PASS",
                results: [] as RuleResult[],
              },
              proofHash: null as string | null,
              intent: "gate.evaluate" as const,
              endpoint: "/api/executor/aggregate-run" as const,
              aggregation: aggregateResult,
            }
          : null;
        const incompleteItems = aggregateResult.item_results.filter((item) => item.status === "INCOMPLETE");
        const answer = !shouldExecute
          ? "Aggregate execution identified. Ready to run compaction/thickness/deflection checks."
          : aggregateResult.overall === "PASS"
            ? "All required checks passed."
            : aggregateResult.overall === "FAIL"
              ? "At least one required check failed."
              : "Some required inputs are missing; aggregate decision is incomplete.";
        sendJson(res, 200, {
          success: shouldExecute ? aggregateResult.overall !== "INCOMPLETE" : true,
          query,
          parsed: {
            metric: null,
            stake: aggregatePoint,
          },
          command: {
            action: "aggregate_acceptance",
            intent: "gate.evaluate",
            endpoint: "/api/executor/aggregate-run",
            spuId: "aggregate:subgrade_acceptance",
            stake: aggregatePoint,
            formData: toRecord(aggregateContextRecord.inputs) ?? {},
            context: {
              ...aggregateContextRecord,
              project_id: aggregateProjectId,
              point: aggregatePoint,
              user_id: aggregateUserId,
            },
          },
          execution: aggregateExecution,
          answer,
          aggregation: aggregateResult,
          structured: {
            intent: "gate.evaluate",
            target: {
              metric: null,
              stake: aggregatePoint,
              spuId: null,
              containerId: readContextTextValue(aggregateContextRecord, ["container_id", "containerId"]),
              nodeId: null,
            },
            inputs: toRecord(aggregateContextRecord.inputs) ?? {},
            context: {
              ...aggregateContextRecord,
              project_id: aggregateProjectId,
              point: aggregatePoint,
              user_id: aggregateUserId,
            },
            spuCandidates: [],
            missing: incompleteItems.map((item) => ({
              field: `inputs.${item.item_key}`,
              reason: item.reason ?? "missing_inputs",
              required: true,
              expected: item.missing_inputs.length > 0 ? item.missing_inputs.join(",") : "required_inputs",
            })),
            missingResponse: null,
            conversation: null,
            command: {
              action: "aggregate_acceptance",
              intent: "gate.evaluate",
              endpoint: "/api/executor/aggregate-run",
              spuId: "aggregate:subgrade_acceptance",
              stake: aggregatePoint,
              formData: toRecord(aggregateContextRecord.inputs) ?? {},
              context: {
                ...aggregateContextRecord,
                project_id: aggregateProjectId,
                point: aggregatePoint,
                user_id: aggregateUserId,
              },
            },
            execution: aggregateExecution,
          },
        });
        return;
      }
      const parseResult = queryNl2Gate(service, query, {
        mode: body.mode,
        context: aggregateContextRecord,
        conversationId: inputConversationId ?? undefined,
        execute: false,
        matchSource: "rule_store",
      });
      if (!parseResult.success) {
        sendJson(res, 200, parseResult);
        return;
      }

      const mapping = resolveNl2GateRuleStoreMapping({
        query,
        metric: parseResult.structured.target.metric,
        context: parseResult.structured.context,
      });
      const mappedCandidates = mapping.candidates.map((item, index) => ({
        rank: index + 1,
        spuId: item.ruleId,
        spuKey: deriveSpuKeyFromSpuId(item.ruleId),
        score: Number(item.score),
        matchReasons: [...item.matchReasons],
        requiredMissingInputs: [] as string[],
      }));

      if (!mapping.selected) {
        const message = "褰撳墠瑙勮寖搴撴湭鍖呭惈璇ユ娴嬮」";
        sendJson(res, 200, {
          ...parseResult,
          success: false,
          answer: message,
          errorCode: "SPU_NOT_FOUND",
          error: message,
          command: null,
          execution: null,
          structured: {
            ...parseResult.structured,
            target: {
              ...parseResult.structured.target,
              spuId: null,
            },
            spuCandidates: mappedCandidates,
            missing: [
              ...parseResult.structured.missing,
              {
                field: "target.spuId",
                reason: "rule_store_not_found",
                required: true,
                expected: "published_rule",
              },
            ],
            command: null,
            execution: null,
          },
        });
        return;
      }

      const resolvedIntent = parseResult.structured.intent ?? (body.mode === "evaluate" ? "gate.evaluate" : "gate.preview");
      const endpoint: "/api/gate/preview" | "/api/executor/run" =
        resolvedIntent === "gate.evaluate" ? "/api/executor/run" : "/api/gate/preview";
      const requestActor = resolveRequestActor(req);
      const actorUserId = requestActor.actorId === "anonymous" ? "" : requestActor.actorId;
      const contextProjectId =
        String(
          parseResult.structured.context.project_id
          ?? parseResult.structured.context.projectId
          ?? "",
        ).trim()
        || "P1";
      const contextPoint =
        String(
          parseResult.structured.target.stake
          ?? parseResult.structured.context.point
          ?? parseResult.structured.context.stake
          ?? "",
        ).trim()
        || "K19+070";
      const contextUserId =
        String(
          parseResult.structured.context.user_id
          ?? parseResult.structured.context.userId
          ?? actorUserId
          ?? "",
        ).trim()
        || "did:peg:ins_001";
      const targetContainerId = String(
        parseResult.structured.target.containerId
        ?? parseResult.structured.context.container_id
        ?? parseResult.structured.context.containerId
        ?? "",
      ).trim();
      const mappedContext = {
        ...parseResult.structured.context,
        project_id: contextProjectId,
        point: contextPoint,
        user_id: contextUserId,
        rule_id: mapping.selected.ruleId,
        rule_version: mapping.selected.ruleVersion,
        normdoc_id: mapping.selected.normdocId,
        package_id: mapping.selected.packageId,
        standard_code: mapping.selected.standardCode,
        rule_source: "Rule Store",
        ...(targetContainerId ? { container_id: targetContainerId } : {}),
      };
      const mergedCollectedInputs = mergeRuleStoreInputSnapshots(
        existingRuleStoreSession?.collectedInputs ?? {},
        toRecord(parseResult.structured.context.inputs) ?? {},
        toRecord(parseResult.structured.inputs) ?? {},
      );
      const requiredInputFields = resolveRuleStoreRuleInputFields(mapping.selected.ruleId, mapping.selected.ruleVersion);
      const preparedExecutorInputs = buildRuleStoreExecutorInputPayload(requiredInputFields, mergedCollectedInputs);
      if (preparedExecutorInputs.missingInputs.length > 0) {
        const conversationId = inputConversationId ?? randomUUID();
        const suggestedQuestions = buildRuleStoreMissingQuestions(preparedExecutorInputs.missingInputs);
        const target = {
          metric: parseResult.structured.target.metric ?? existingRuleStoreSession?.target.metric ?? null,
          stake: parseResult.structured.target.stake ?? contextPoint,
          spuId: mapping.selected.ruleId,
          containerId: parseResult.structured.target.containerId ?? null,
          nodeId: parseResult.structured.target.nodeId ?? null,
        };
        const conversationState = {
          conversationId,
          pendingIntent: resolvedIntent,
          pendingSpu: mapping.selected.ruleId,
          collectedInputs: mergedCollectedInputs,
        };
        const sessionContext: Record<string, unknown> = {
          ...mappedContext,
          metric: target.metric,
          stake: target.stake,
          inputs: mergedCollectedInputs,
        };
        writePegBotRuleStoreSession({
          conversationId,
          pendingIntent: resolvedIntent,
          pendingSpu: mapping.selected.ruleId,
          collectedInputs: mergedCollectedInputs,
          context: sessionContext,
          target: {
            metric: target.metric,
            stake: target.stake,
            ruleId: mapping.selected.ruleId,
            ruleVersion: mapping.selected.ruleVersion,
            normdocId: mapping.selected.normdocId,
            packageId: mapping.selected.packageId,
            standardCode: mapping.selected.standardCode,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        const missingItems = preparedExecutorInputs.missingInputs.map((field) => ({
          field: `inputs.${field}`,
          reason: "input_value_missing",
          required: true as const,
          expected: "number",
        }));
        const answerBase = "Missing required inputs: " + preparedExecutorInputs.missingInputs.join(", ") + ".";
        const answer = suggestedQuestions.length > 0 ? `${answerBase} ${suggestedQuestions[0]}` : answerBase;
        sendJson(res, 200, {
          ...parseResult,
          success: false,
          answer,
          errorCode: "MISSING_REQUIRED_FIELDS",
          error: answer,
          command: null,
          execution: null,
          structured: {
            ...parseResult.structured,
            intent: resolvedIntent,
            target,
            inputs: mergedCollectedInputs,
            context: sessionContext,
            spuCandidates: mappedCandidates,
            missing: missingItems,
            missingResponse: {
              missingFields: missingItems,
              suggestedQuestions,
              partialContext: {
                intent: resolvedIntent,
                target,
                collectedInputs: mergedCollectedInputs,
                context: sessionContext,
              },
            },
            conversation: conversationState,
            command: null,
            execution: null,
          },
        });
        return;
      }
      const mappedCommand = {
        action: "validate_spu_direct" as const,
        intent: resolvedIntent,
        endpoint,
        spuId: mapping.selected.ruleId,
        stake: parseResult.structured.target.stake ?? "",
        formData: preparedExecutorInputs.inputs as Record<string, number>,
        context: mappedContext,
      };
      const activeRuleStoreConversationId = inputConversationId
        ?? normalizeRuleStorePegBotConversationId(parseResult.structured.conversation?.conversationId);

      let mappedExecution: {
        status: "PASS" | "FAIL";
        executionId: string;
        outputs: Record<string, unknown>;
        gate: {
          passed: boolean;
          results: RuleResult[];
        };
        proofHash: string | null;
        proofFragment: Record<string, unknown> | null;
        intent: "gate.preview" | "gate.evaluate";
        endpoint: "/api/gate/preview" | "/api/executor/run";
      } | null = null;
      let answer = parseResult.answer;

      if (shouldExecute) {
        if (resolvedIntent === "gate.evaluate") {
          const normalizedExecutor = normalizeExecutorRunPayload({
            rule_id: mapping.selected.ruleId,
            rule_version: mapping.selected.ruleVersion,
            inputs: preparedExecutorInputs.inputs,
            context: mappedContext,
          });
          const executionContainer = resolveExecutorRunContainer({
            projectId: normalizedExecutor.executionContext.projectId,
            point: normalizedExecutor.executionContext.point,
            userId: normalizedExecutor.executionContext.userId,
            spuId: normalizedExecutor.ruleBinding.spuId,
            preferredContainerId: normalizedExecutor.executionContext.preferredContainerId,
          });
          const executorResponse = evaluateGateRequest(service, {
            spuId: normalizedExecutor.ruleBinding.spuId,
            containerId: executionContainer.containerId,
            inputs: normalizedExecutor.inputs,
            context: {
              ...normalizedExecutor.context,
              container_id: executionContainer.containerId,
              slot_id: executionContainer.slotId,
            },
          });
          mappedExecution = {
            status: executorResponse.status,
            executionId: executorResponse.executionId,
            outputs: executorResponse.outputs,
            gate: {
              passed: executorResponse.result.passed,
              results: executorResponse.gateResults,
            },
            proofHash:
              typeof executorResponse.proof?.extensions?.proof_hash === "string"
                ? String(executorResponse.proof.extensions.proof_hash)
                : null,
            proofFragment:
              executorResponse.proofFragment && typeof executorResponse.proofFragment === "object"
                ? { ...(executorResponse.proofFragment as Record<string, unknown>) }
                : null,
            intent: resolvedIntent,
            endpoint,
          };
          answer = "Rule mapping completed and Executor run submitted. See execution result.";
        } else {
          const normalized = normalizeRuleBoundExecutionPayload({
            rule_id: mapping.selected.ruleId,
            rule_version: mapping.selected.ruleVersion,
            containerId: parseResult.structured.target.containerId ?? undefined,
            nodeId: parseResult.structured.target.nodeId ?? undefined,
            inputs: preparedExecutorInputs.inputs,
            context: mappedContext,
            externalInput: body.externalInput,
          });
          const applied = applyExternalInputToGatePayload({
            spuId: normalized.ruleBinding.spuId,
            containerId: normalized.containerId,
            nodeId: normalized.nodeId,
            inputs: normalized.inputs,
            externalInput: normalized.externalInput,
          });
          const gateResponse = evaluateGateRequest(service, {
            spuId: normalized.ruleBinding.spuId,
            containerId: normalized.containerId,
            nodeId: normalized.nodeId,
            inputs: ensureGateInputsObject(applied.inputs),
            context: normalized.context,
          });
          mappedExecution = {
            status: gateResponse.status,
            executionId: gateResponse.executionId,
            outputs: gateResponse.outputs,
            gate: {
              passed: gateResponse.result.passed,
              results: gateResponse.gateResults,
            },
            proofHash:
              typeof gateResponse.proof?.extensions?.proof_hash === "string"
                ? String(gateResponse.proof.extensions.proof_hash)
                : null,
            proofFragment:
              gateResponse.proofFragment && typeof gateResponse.proofFragment === "object"
                ? { ...(gateResponse.proofFragment as Record<string, unknown>) }
                : null,
            intent: resolvedIntent,
            endpoint,
          };
          answer = "Rule mapping completed and preview execution finished. See execution result.";
        }
      } else {
        answer = "Rule mapping completed. You can continue with Executor run.";
      }
      clearPegBotRuleStoreSession(activeRuleStoreConversationId);
      const completedConversation = activeRuleStoreConversationId
        ? {
            conversationId: activeRuleStoreConversationId,
            pendingIntent: null as const,
            pendingSpu: null,
            collectedInputs: mergedCollectedInputs,
          }
        : null;

      sendJson(res, 200, {
        ...parseResult,
        success: true,
        answer,
        command: mappedCommand,
        execution: mappedExecution,
        structured: {
          ...parseResult.structured,
          target: {
            ...parseResult.structured.target,
            spuId: mapping.selected.ruleId,
          },
          inputs: mergedCollectedInputs,
          context: mappedContext,
          spuCandidates: mappedCandidates,
          missing: [],
          missingResponse: null,
          conversation: completedConversation,
          command: mappedCommand,
          execution: mappedExecution,
        },
      });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "layerpeg" && parts[2] === "spec") {
      const spuId = parts[3];
      const spu = service.getRegistry().find((item) => item.spuId === spuId) ?? null;
      if (!spu) {
        sendJson(res, 404, { error: "spu not found" });
        return;
      }

      const document = resolveLayerPegSpecDocument(spuId, readLayerPegQueryContext(url));
      if (!document) {
        sendJson(res, 404, { error: "spu not found" });
        return;
      }
      sendJson(res, 200, {
        document,
        standardOutput: toLayerPegStandardOutput(document),
      });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "layerpeg" && parts[2] === "node") {
      const nodeId = parts[3];
      const node = service.getNode(nodeId);
      if (!node) {
        sendJson(res, 404, { error: "node not found" });
        return;
      }

      const document = resolveLayerPegNodeDocument(nodeId, readLayerPegQueryContext(url));
      if (!document) {
        sendJson(res, 404, { error: "node not found" });
        return;
      }
      sendJson(res, 200, {
        document,
        standardOutput: toLayerPegStandardOutput(document),
      });
      return;
    }

    if (
      req.method === "GET" &&
      parts.length === 5 &&
      parts[0] === "api" &&
      parts[1] === "layerpeg" &&
      parts[2] === "container" &&
      parts[4] === "proof"
    ) {
      const containerId = parts[3];
      const proof = service.getProof(containerId);
      if (!proof) {
        sendJson(res, 404, { error: "proof not found" });
        return;
      }

      const document = resolveLayerPegContainerProofDocument(containerId, readLayerPegQueryContext(url));
      if (!document) {
        sendJson(res, 404, { error: "proof not found" });
        return;
      }
      sendJson(res, 200, {
        document,
        standardOutput: toLayerPegStandardOutput(document),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/layerpeg/documents") {
      const docType = readOptionalQuery(url, "docType") as any;
      const sourceRefPrefix = readOptionalQuery(url, "sourceRefPrefix");
      const records = service.listLayerPegDocuments({ docType, sourceRefPrefix });
      const items = buildLayerPegDocumentIndex(records);
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "layerpeg" && parts[2] === "documents") {
      const record = service.getLayerPegDocument(parts[3]);
      if (!record) {
        sendJson(res, 404, { error: "layerpeg document not found" });
        return;
      }
      sendJson(res, 200, {
        document: record.document,
        meta: {
          usi: record.usi,
          docType: record.docType,
          sourceRef: record.sourceRef,
          updatedAt: record.updatedAt,
        },
        standardOutput: toLayerPegStandardOutput(record.document),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/scheduler/next") {
      const containerId = String(url.searchParams.get("containerId") ?? "").trim();
      if (!containerId) {
        throw new Error("containerId is required");
      }
      const scheduler = service.getSchedulerNext(containerId);
      sendJson(res, 200, scheduler);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/scheduler/project") {
      const scheduler = service.getProjectScheduler();
      sendJson(res, 200, scheduler);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runtime/minimal/next") {
      const containerId = String(url.searchParams.get("containerId") ?? "").trim();
      if (!containerId) {
        throw new Error("containerId is required");
      }
      const runtime = service.getRuntimeMinimal(containerId);
      sendJson(res, 200, runtime);
      return;
    }

    if (req.method === "GET" && parts.length === 5 && parts[0] === "api" && parts[1] === "runtime" && parts[2] === "containers" && parts[4] === "model") {
      const containerId = parts[3];
      const container = service.getContainer(containerId);
      if (!container) {
        sendJson(res, 404, { error: "container not found" });
        return;
      }
      const nodes = service.getContainerNodes(containerId);
      const scheduler = computeRuntimeContainerNextExecution(container, nodes);
      const model = buildRuntimeContainerModel(container, nodes, scheduler.decision);
      sendJson(res, 200, {
        container: model,
        nodes: buildRuntimeNodeModels(container, nodes),
        scheduler: {
          containerId: scheduler.containerId,
          input: scheduler.input,
          tasks: scheduler.tasks,
          graph: scheduler.graph,
          nextExecutableNodes: scheduler.nextExecutableNodes,
          blockedNodes: scheduler.blockedNodes,
          schedulePlan: scheduler.schedulePlan,
          nextTasks: scheduler.nextTasks,
          decision: scheduler.decision,
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/runtime/project-execute") {
      authorize(req, "execute");
      const body = await readBody<{ input?: ProjectSchedulerInput }>(req);
      const customInput = body.input;

      if (customInput && typeof customInput === "object" && Array.isArray(customInput.containers)) {
        sendJson(res, 200, buildRuntimeProjectExecuteSuggestion(customInput));
        return;
      }

      const snapshot = service.getProjectScheduler();
      sendJson(res, 200, buildRuntimeProjectExecuteSuggestion(snapshot.input));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spec/compile-markdown") {
      authorize(req, "compile");
      const body = await readBody<{
        markdown?: string;
        source?: "template" | "pdf" | "markdown";
      }>(req);
      const markdown = String(body.markdown ?? "").trim();
      if (!markdown) {
        throw new Error("markdown is required");
      }
      const source = body.source === "template" || body.source === "pdf" || body.source === "markdown"
        ? body.source
        : "markdown";
      const result = await compileSpec(markdown, { source });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/registry/import") {
      const actor = authorize(req, "register");
      const body = await readBody<{ definitionText?: string; sourceType?: "builtin" | "imported" | "compiled" }>(req);
      if (!body.definitionText || !String(body.definitionText).trim()) {
        throw new Error("definitionText is required");
      }
      const item = service.importSpuDefinition(String(body.definitionText), body.sourceType ?? "imported");
      importCatalogItem(service.getRegistry(), {
        itemId: catalogItemIdFromSpuId(item.spuId),
        type: "spu",
        title: item.meta.name,
        normSource: item.meta.norm,
        version: item.meta.version,
        owner: actor.actorId,
        visibility: "internal",
        status: "draft",
        tags: [
          ...(Array.isArray(item.meta.domainTags) ? item.meta.domainTags : []),
          item.meta.classification ?? "",
          item.meta.domain ?? "",
          item.meta.clause ?? "",
        ],
        dependencies: [],
        refSpuId: item.spuId,
        sourceType: item.sourceType ?? null,
      });
      const layerPegDocument = resolveLayerPegSpecDocument(item.spuId);
      sendJson(res, 200, {
        item,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spec/register-markdown") {
      authorize(req, "register");
      const body = await readBody<{
        markdown?: string;
        source?: "template" | "pdf" | "markdown";
        riskWarnings?: ExtractionWarning[];
        originalDraftMarkdown?: string;
        editedMarkdown?: string;
        clauseReviewItems?: ClauseReviewItem[];
      }>(req);
      const markdown = String(body.markdown ?? "").trim();
      if (!markdown) {
        throw new Error("markdown is required");
      }
      const warnings = Array.isArray(body.riskWarnings) ? body.riskWarnings : [];
      const clauseReviewItems = Array.isArray(body.clauseReviewItems) ? body.clauseReviewItems : [];
      const sourceHint = body.source;
      const compileSource: "template" | "pdf" | "markdown" =
        sourceHint === "template" || sourceHint === "pdf" || sourceHint === "markdown"
          ? sourceHint
          : warnings.length > 0 || Boolean(body.originalDraftMarkdown)
            ? "pdf"
            : "markdown";
      const preRegisterGuard = evaluatePreRegisterGuard({
        warnings,
        originalDraftMarkdown: String(body.originalDraftMarkdown ?? markdown),
        editedMarkdown: String(body.editedMarkdown ?? markdown),
        clauseReviewItems,
      });
      if (preRegisterGuard.blocked) {
        sendJson(res, 200, {
          success: false,
          stage: "pre_register_review",
          error: preRegisterGuard.error,
          reasons: preRegisterGuard.reasons,
          lintResult: null,
          compileResult: null,
          spu: null,
          specbundle: null,
          preRegisterReview: preRegisterGuard.preRegisterReview,
          riskReview: preRegisterGuard.preRegisterReview.riskReview,
        });
        return;
      }
      const result = await registerMarkdownSpec(service, markdown, compileSource);
      if (result.success && compileSource === "pdf") {
        const item = result.registered.item;
        const currentExtensions =
          item.meta.extensions && typeof item.meta.extensions === "object" && !Array.isArray(item.meta.extensions)
            ? item.meta.extensions as Record<string, unknown>
            : {};
        const clauseId = String(item.meta.clause ?? "").trim();
        const clauseOriginalText = extractClauseOriginalTextFromDraft(String(body.originalDraftMarkdown ?? markdown), clauseId);
        if (clauseOriginalText) {
          item.meta.extensions = {
            ...currentExtensions,
            clause_content: clauseOriginalText,
            original_text: clauseOriginalText,
          };
        }
      }
      const specUpgradeGuard =
        "json" in result
          ? evaluateSpecUpgradeGuard(service, result.json)
          : {
              hasBaseline: false,
              oldSpuId: null,
              impactAnalysis: null,
            };
      const runtimeImpactGuard =
        "json" in result
          ? evaluateSpecRuntimeImpactGuard(service, result.json, specUpgradeGuard.oldSpuId)
          : {
              hasRuntimeImpact: false,
              runningImpactScan: null,
            };
      const spuActivationPolicy =
        "json" in result
          ? buildActivationPolicyOnRegister(service, result.json, specUpgradeGuard.oldSpuId, "new_containers_only")
          : null;
      const layerPegDocument = result.success && result.stage === "registered"
        ? resolveLayerPegSpecDocument(result.spuId)
        : null;
      sendJson(res, 200, {
        ...result,
        preRegisterReview: preRegisterGuard.preRegisterReview,
        riskReview: preRegisterGuard.preRegisterReview.riskReview,
        specImpactAnalysis: specUpgradeGuard.impactAnalysis,
        specImpactBaseSpuId: specUpgradeGuard.oldSpuId,
        runningImpactScan: runtimeImpactGuard.runningImpactScan,
        spuActivationPolicy,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/spec/templates") {
      sendJson(res, 200, { items: listSpecTemplates() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spec/register-template") {
      authorize(req, "register");
      const body = await readBody<{
        templateId?: string;
        values?: Record<string, string | number>;
        inheritFromSpuId?: string;
        overrides?: {
          clause?: string;
          threshold?: number;
          description?: string;
        };
      }>(req);
      const templateId = String(body.templateId ?? "").trim();
      if (!templateId) {
        throw new Error("templateId is required");
      }
      const values = body.values && typeof body.values === "object" ? body.values : {};
      const result = await createAndRegisterSpecFromTemplate(service, templateId, values, {
        inheritFromSpuId: typeof body.inheritFromSpuId === "string" ? body.inheritFromSpuId : undefined,
        overrides: body.overrides,
      });
      const registerSpuId = result.registerResult?.success ? result.registerResult.spuId : null;
      const layerPegDocument = registerSpuId ? resolveLayerPegSpecDocument(registerSpuId) : null;
      sendJson(res, 200, {
        ...result,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/spec/pdf-to-draft") {
      authorize(req, "compile");
      const body = await readBody<{
        pdfBase64?: string;
        fileName?: string;
        options?: {
          standardCode?: string;
          defaultCategory?: string;
          defaultVersion?: string;
        };
      }>(req);
      const pdfBase64 = String(body.pdfBase64 ?? "").trim();
      if (!pdfBase64) {
        throw new Error("pdfBase64 is required");
      }
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      if (!pdfBuffer.length) {
        throw new Error("PDF 閸愬懎顔愭稉铏光敄");
      }
      const result = generateDraftMarkdownFromPDF(pdfBuffer, body.options ?? {});
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/external-inputs") {
      authorize(req, "execute");
      sendJson(res, 200, { items: service.listExternalInputSources() });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "external-inputs") {
      authorize(req, "execute");
      const item = service.getExternalInputSource(parts[2]);
      if (!item) {
        sendJson(res, 404, { error: "external input source not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/external-inputs/import/csv") {
      authorize(req, "execute");
      const body = await readBody<{
        sourceId?: string;
        sourceType?: ExternalInputSourceType;
        sourceRef?: string;
        csvText?: string;
        mappingRules?: unknown;
      }>(req);
      const csvText = String(body.csvText ?? "").trim();
      if (!csvText) {
        throw new Error("csvText is required");
      }
      const mappingRules = normalizeExternalInputMappingRules(body.mappingRules);
      const records = parseCsvImportRecords(csvText);
      const validationStatus = buildExternalInputValidationStatus({
        mappingRules,
        records,
      });
      const source = service.upsertExternalInputSource({
        sourceId: body.sourceId ? String(body.sourceId) : undefined,
        sourceType: toExternalSourceType(body.sourceType, "csv"),
        sourceRef: body.sourceRef ? String(body.sourceRef) : undefined,
        mappingRules,
        validationStatus,
        records,
      });
      sendJson(res, 200, {
        source,
        sampleRecord: records[0] ?? null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/external-inputs/import/json") {
      authorize(req, "execute");
      const body = await readBody<{
        sourceId?: string;
        sourceType?: ExternalInputSourceType;
        sourceRef?: string;
        records?: unknown;
        data?: unknown;
        payload?: unknown;
        mappingRules?: unknown;
      }>(req);
      const mappingRules = normalizeExternalInputMappingRules(body.mappingRules);
      const records = normalizeJsonImportRecords(body.records ?? body.data ?? body.payload);
      const validationStatus = buildExternalInputValidationStatus({
        mappingRules,
        records,
      });
      const source = service.upsertExternalInputSource({
        sourceId: body.sourceId ? String(body.sourceId) : undefined,
        sourceType: toExternalSourceType(body.sourceType, "api"),
        sourceRef: body.sourceRef ? String(body.sourceRef) : undefined,
        mappingRules,
        validationStatus,
        records,
      });
      sendJson(res, 200, {
        source,
        sampleRecord: records[0] ?? null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/external-inputs/map-to-spu") {
      authorize(req, "execute");
      const body = await readBody<{
        sourceId?: string;
        spuId?: string;
        recordIndex?: number;
        inputs?: Record<string, unknown>;
        strict?: boolean;
      }>(req);
      const sourceId = String(body.sourceId ?? "").trim();
      const spuId = String(body.spuId ?? "").trim();
      if (!sourceId || !spuId) {
        throw new Error("sourceId and spuId are required");
      }
      const mapped = service.resolveExternalSourceInputs({
        sourceId,
        spuId,
        recordIndex: body.recordIndex,
        inputs: body.inputs,
        strict: body.strict,
      });
      sendJson(res, 200, mapped);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/mapping/by-stake") {
      authorize(req, "execute");
      const stake = String(url.searchParams.get("stake") ?? "").trim();
      if (!stake) {
        throw new Error("stake is required");
      }
      const item = service.queryMappingByStake(stake);
      if (!item) {
        sendJson(res, 404, { error: "mapping not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/mapping/minimal/by-stake") {
      authorize(req, "execute");
      const stake = String(url.searchParams.get("stake") ?? "").trim();
      if (!stake) {
        throw new Error("stake is required");
      }
      const item = service.queryMappingMinimalByStake(stake);
      if (!item) {
        sendJson(res, 404, { error: "mapping not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "mapping" && parts[2] === "container") {
      authorize(req, "execute");
      const item = service.queryMappingByContainerId(parts[3]);
      if (!item) {
        sendJson(res, 404, { error: "mapping not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "mapping" && parts[2] === "node") {
      authorize(req, "execute");
      const item = service.queryMappingByNodeId(parts[3]);
      if (!item) {
        sendJson(res, 404, { error: "mapping not found" });
        return;
      }
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/slots/import") {
      const body = await readBody<{
        station?: string;
        chainage?: number;
        x?: number;
        y?: number;
        elevation?: number;
        alignment?: string;
        sourceFile?: string;
      }>(req);
      const slot = service.importSlot({
        station: String(body.station ?? "K19+070"),
        chainage: Number(body.chainage ?? 19070),
        x: Number(body.x ?? 128.25),
        y: Number(body.y ?? 62.5),
        elevation: Number(body.elevation ?? 135.4),
        alignment: body.alignment ? String(body.alignment) : undefined,
        sourceFile: String(body.sourceFile ?? "manual-import.csv"),
      });
      sendJson(res, 200, { slot });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/containers") {
      const body = await readBody<{
        containerId?: string;
        projectId?: string;
        geoSlotRef?: string;
        inspector?: string;
        supervisor?: string;
        autoBindSpuIds?: string[];
        autoBindSpuKeys?: string[];
      }>(req);
      if (!body.geoSlotRef) {
        throw new Error("geoSlotRef is required");
      }
      const container = service.createContainer({
        containerId: body.containerId ? String(body.containerId) : undefined,
        projectId: body.projectId ? String(body.projectId) : undefined,
        geoSlotRef: String(body.geoSlotRef),
        inspector: body.inspector ? String(body.inspector) : undefined,
        supervisor: body.supervisor ? String(body.supervisor) : undefined,
        autoBindSpuIds: Array.isArray(body.autoBindSpuIds) ? body.autoBindSpuIds.map((item) => String(item)) : [],
        autoBindSpuKeys: Array.isArray(body.autoBindSpuKeys) ? body.autoBindSpuKeys.map((item) => String(item)) : [],
      });
      sendJson(res, 200, { container });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/containers") {
      sendJson(res, 200, { items: service.listContainers() });
      return;
    }

    if (req.method === "GET" && parts.length === 3 && parts[0] === "api" && parts[1] === "containers") {
      const container = service.getContainer(parts[2]);
      if (!container) {
        sendJson(res, 404, { error: "container not found" });
        return;
      }
      sendJson(res, 200, {
        container,
        nodes: service.getContainerNodes(container.containerId),
      });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "containers" && parts[3] === "bind-spu") {
      const body = await readBody<{ spuId?: string; spuKey?: string; projectId?: string }>(req);
      if (!body.spuId && !body.spuKey) {
        throw new Error("spuId or spuKey is required");
      }
      const container = body.spuId
        ? service.bindSpu(parts[2], String(body.spuId))
        : service.bindSpuByKey(parts[2], String(body.spuKey), body.projectId ? String(body.projectId) : undefined);
      sendJson(res, 200, { container });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "containers" && parts[3] === "unbind-spu") {
      const body = await readBody<{ spuId?: string }>(req);
      const spuId = String(body.spuId ?? "").trim();
      if (!spuId) {
        throw new Error("spuId is required");
      }
      const container = service.unbindSpu(parts[2], spuId);
      sendJson(res, 200, { container });
      return;
    }

    const isGateBatchExecutionPath =
      req.method === "POST" &&
      (
        url.pathname === "/api/gate/batch-evaluate" ||
        url.pathname === "/gate/batch-evaluate" ||
        url.pathname === "/api/v1/gate/batch-evaluate" ||
        url.pathname === "/v1/gate/batch-evaluate"
      );
    if (isGateBatchExecutionPath) {
      authorize(req, "execute");
      const body = await readBody<{
        items?: Array<RuleBoundExecutionInputPayload & { itemId?: string }>;
        executionOptions?: {
          concurrency?: number;
          timeoutMs?: number;
          maxRetries?: number;
          retryDelayMs?: number;
        };
      }>(req);
      const itemExternalMappings: Array<{
        itemId: string;
        sourceId: string;
        recordIndex: number;
        missingInputs: string[];
        validationStatus: "valid" | "warning" | "invalid";
      }> = [];
      const normalizedItems = Array.isArray(body.items)
        ? body.items.map((item, index) => {
            const normalized = normalizeRuleBoundExecutionPayload(item ?? {});
            const applied = applyExternalInputToGatePayload({
              spuId: normalized.ruleBinding.spuId,
              containerId: normalized.containerId,
              nodeId: normalized.nodeId,
              inputs: normalized.inputs,
              externalInput: normalized.externalInput,
            });
            if (applied.externalInputMapping) {
              itemExternalMappings.push({
                itemId: String(item?.itemId ?? `item_${index + 1}`),
                sourceId: applied.externalInputMapping.sourceId,
                recordIndex: applied.externalInputMapping.recordIndex,
                missingInputs: applied.externalInputMapping.missingInputs,
                validationStatus: applied.externalInputMapping.validationStatus,
              });
            }
            return {
              itemId: item?.itemId,
              spuId: normalized.ruleBinding.spuId,
              containerId: normalized.containerId,
              nodeId: normalized.nodeId,
              inputs: ensureGateInputsObject(applied.inputs),
              context: normalized.context,
            };
          })
        : [];
      const response = await evaluateGateBatchRequestConcurrent(
        service,
        {
          items: normalizedItems,
        },
        body.executionOptions,
      );
      sendJson(res, 200, {
        ...response,
        externalInputMappings: itemExternalMappings,
      });
      return;
    }

    const isExecutorRunPath =
      req.method === "POST" &&
      (
        url.pathname === "/api/executor/run" ||
        url.pathname === "/executor/run" ||
        url.pathname === "/api/v1/executor/run" ||
        url.pathname === "/v1/executor/run"
      );
    if (isExecutorRunPath) {
      authorize(req, "execute");
      const body = await readBody<ExecutorRunRequestPayload>(req);
      try {
        const normalized = normalizeExecutorRunPayload(body);
        const { response } = executeExecutorRunWithNormalizedPayload(normalized);
        const layerPegDocument = resolveLayerPegNodeDocument(response.node.nodeId);
        sendJson(res, 200, {
          ...response,
          layerPegDocument,
          standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
        });
        return;
      } catch (error) {
        if (error instanceof ExecutorRunError) {
          sendJson(res, error.statusCode, { error: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }

    const isExecutorRunByNormDocPath =
      req.method === "POST" &&
      (
        url.pathname === "/api/executor/run-by-normdoc" ||
        url.pathname === "/executor/run-by-normdoc" ||
        url.pathname === "/api/v1/executor/run-by-normdoc" ||
        url.pathname === "/v1/executor/run-by-normdoc"
      );
    if (isExecutorRunByNormDocPath) {
      authorize(req, "execute");
      const body = await readBody<{
        normdoc_id?: string;
        component_id?: string;
        inputs?: Record<string, unknown>;
        context?: Record<string, unknown>;
      }>(req);
      const normdocId = String(body.normdoc_id ?? "").trim();
      const componentId = String(body.component_id ?? "").trim();
      if (!normdocId || !componentId) {
        sendJson(res, 400, { error: "normdoc_id and component_id are required", code: "EXECUTOR_INVALID_ARGUMENT" });
        return;
      }
      syncRuleStoreFromRegistry();
      const bundle = ruleStore.resolveBundle(normdocId, { statuses: ["published"] });
      if (!bundle || bundle.normdoc.status !== "published") {
        sendJson(res, 404, { error: "published normdoc not found", code: "RULE_NOT_FOUND" });
        return;
      }
      const componentRuleItems = bundle.ruleItems.filter((item) => deriveSpuKeyFromSpuId(item.rule_id) === componentId);
      if (componentRuleItems.length === 0) {
        sendJson(res, 404, { error: "component not found in normdoc", code: "RULE_NOT_FOUND" });
        return;
      }
      const executableRuleItems = componentRuleItems.filter((item) => item.enabled);
      if (executableRuleItems.length === 0) {
        sendJson(res, 400, { error: "component exists but not executable", code: "COMPONENT_NOT_EXECUTABLE" });
        return;
      }
      const ruleItem = executableRuleItems[0] ?? null;
      if (!ruleItem) {
        sendJson(res, 400, { error: "component has no executable rule", code: "COMPONENT_NOT_EXECUTABLE" });
        return;
      }
      const inputsRecord = toRecord(body.inputs) ?? {};
      const requiredInputFields = Array.from(
        new Set(
          executableRuleItems
            .flatMap((item) => item.input_fields)
            .map((field) => String(field ?? "").trim())
            .filter(Boolean),
        ),
      );
      const missingRequiredFields = requiredInputFields.filter((field) => {
        const value = (inputsRecord as Record<string, unknown>)[field];
        if (value === null || value === undefined) {
          return true;
        }
        if (typeof value === "string" && value.trim() === "") {
          return true;
        }
        return false;
      });
      if (missingRequiredFields.length > 0) {
        sendJson(res, 400, {
          error: "required dto fields missing",
          code: "DTO_REQUIRED_FIELDS_MISSING",
          missing_fields: missingRequiredFields,
        });
        return;
      }
      const payload: ExecutorRunRequestPayload = {
        rule_id: ruleItem.rule_id,
        rule_version: ruleItem.rule_version || bundle.rulePackage.version || bundle.normdoc.version,
        inputs: inputsRecord,
        context: {
          ...(toRecord(body.context) ?? {}),
          normdoc_id: bundle.normdoc.normdoc_id,
          package_id: bundle.rulePackage.package_id,
          bundle_hash: bundle.normdoc.bundle_hash,
          component_id: componentId,
          source_clause_id: ruleItem.clause_id,
        },
      };
      try {
        const normalized = normalizeExecutorRunPayload(payload);
        const { response } = executeExecutorRunWithNormalizedPayload(normalized);
        const layerPegDocument = resolveLayerPegNodeDocument(response.node.nodeId);
        sendJson(res, 200, {
          ...response,
          layerPegDocument,
          standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
        });
        return;
      } catch (error) {
        if (error instanceof ExecutorRunError) {
          sendJson(res, error.statusCode, { error: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }

    const isExecutorAggregateRunPath =
      req.method === "POST" &&
      (
        url.pathname === "/api/executor/aggregate-run" ||
        url.pathname === "/executor/aggregate-run" ||
        url.pathname === "/api/v1/executor/aggregate-run" ||
        url.pathname === "/v1/executor/aggregate-run"
      );
    if (isExecutorAggregateRunPath) {
      authorize(req, "execute");
      const body = await readBody<ExecutorAggregateRunRequestPayload>(req);
      const contextRecord = toRecord(body.context) ?? {};
      const requestInputs = toRecord(body.inputs);
      const aggregateContext = requestInputs
        ? {
            ...contextRecord,
            inputs: {
              ...(toRecord(contextRecord.inputs) ?? {}),
              ...requestInputs,
            },
          }
        : contextRecord;
      const result = executeAcceptanceAggregateRun({
        query: String(body.query ?? "").trim(),
        context: aggregateContext,
      });
      sendJson(res, 200, result);
      return;
    }

    const isGateExecutionPath =
      req.method === "POST" &&
      (
        url.pathname === "/api/gate/preview" ||
        url.pathname === "/gate/preview" ||
        url.pathname === "/api/v1/gate/preview" ||
        url.pathname === "/v1/gate/preview" ||
        url.pathname === "/api/gate/evaluate" ||
        url.pathname === "/gate/evaluate" ||
        url.pathname === "/api/v1/gate/evaluate" ||
        url.pathname === "/v1/gate/evaluate"
      );
    if (isGateExecutionPath) {
      authorize(req, "execute");
      const body = await readBody<RuleBoundExecutionInputPayload>(req);
      const normalized = normalizeRuleBoundExecutionPayload(body);
      const applied = applyExternalInputToGatePayload({
        spuId: normalized.ruleBinding.spuId,
        containerId: normalized.containerId,
        nodeId: normalized.nodeId,
        inputs: normalized.inputs,
        externalInput: normalized.externalInput,
      });
      const normalizedInputs = ensureGateInputsObject(applied.inputs);
      const response = evaluateGateRequest(service, {
        spuId: normalized.ruleBinding.spuId,
        containerId: normalized.containerId,
        nodeId: normalized.nodeId,
        inputs: normalizedInputs,
        context: normalized.context,
      });
      const layerPegDocument = resolveLayerPegNodeDocument(response.node.nodeId);
      sendJson(res, 200, {
        ...response,
        externalInputMapping: applied.externalInputMapping,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/nodes") {
      authorize(req, "execute");
      const body = await readBody<{ containerId?: string; spuId?: string; spuKey?: string; projectId?: string }>(req);
      if (!body.containerId || (!body.spuId && !body.spuKey)) {
        throw new Error("containerId is required");
      }
      const node = body.spuId
        ? service.createNode({
            containerId: String(body.containerId),
            spuId: String(body.spuId),
          })
        : service.createNodeByKey({
            containerId: String(body.containerId),
            spuKey: String(body.spuKey),
            projectId: body.projectId ? String(body.projectId) : undefined,
          });
      const layerPegDocument = resolveLayerPegNodeDocument(node.nodeId);
      sendJson(res, 200, {
        node,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "nodes" && parts[3] === "submit") {
      authorize(req, "execute");
      const body = await readBody<{ inputs?: Record<string, unknown> }>(req);
      const node = service.submitNode(parts[2], body.inputs ?? {});
      const layerPegDocument = resolveLayerPegNodeDocument(node.nodeId);
      sendJson(res, 200, {
        node,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "nodes" && parts[3] === "sign") {
      const body = await readBody<{ role?: string }>(req);
      if (!body.role) {
        throw new Error("role is required");
      }
      const actor = resolveRequestActor(req);
      assertCanSignProof(actor, String(body.role));
      const node = service.signNode(parts[2], String(body.role));
      const layerPegDocument = resolveLayerPegNodeDocument(node.nodeId);
      sendJson(res, 200, {
        node,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "nodes" && parts[3] === "finalize") {
      authorize(req, "execute");
      const body = await readBody<{ anchor?: AnchorRequestPayload }>(req);
      const node = service.finalizeNode(parts[2], {
        anchor: body.anchor,
      });
      const layerPegDocument = resolveLayerPegNodeDocument(node.nodeId);
      sendJson(res, 200, {
        node,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "containers" && parts[3] === "archive") {
      authorize(req, "archive");
      const body = await readBody<{ anchor?: AnchorRequestPayload }>(req);
      const proof = service.archiveContainer(parts[2], {
        anchor: body.anchor,
      });
      const layerPegDocument = resolveLayerPegContainerProofDocument(parts[2]);
      sendJson(res, 200, {
        proof,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/anchors/providers") {
      sendJson(res, 200, {
        items: service.listAnchorProviderStatuses(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/anchors/verify") {
      const body = await readBody<{ anchorRef?: string; providerName?: string }>(req);
      const anchorRef = String(body.anchorRef ?? "").trim();
      if (!anchorRef) {
        throw new Error("anchorRef is required");
      }
      const result = service.verifyAnchor(
        anchorRef,
        body.providerName ? String(body.providerName) : undefined,
      );
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/proof/verify") {
      const body = await readBody<{
        nodeId?: string;
        containerId?: string;
        proofId?: string;
        verifyAnchor?: boolean;
        providerName?: string;
      }>(req);
      const result = service.verifyProof({
        nodeId: body.nodeId ? String(body.nodeId) : undefined,
        containerId: body.containerId ? String(body.containerId) : undefined,
        proofId: body.proofId ? String(body.proofId) : undefined,
        verifyAnchor: body.verifyAnchor === true,
        providerName: body.providerName ? String(body.providerName) : undefined,
      });
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/proof/replay") {
      authorize(req, "execute");
      const body = await readBody<{ proof_id?: string; proofId?: string }>(req);
      const replayProofId = String(body.proof_id ?? body.proofId ?? "").trim();
      if (!replayProofId) {
        throw new Error("proof_id is required");
      }
      const replayLookup = resolveProofReplayLookupByProofId(replayProofId);
      if (!replayLookup) {
        sendJson(res, 404, {
          error: "proof not found",
          code: "PROOF_NOT_FOUND",
        });
        return;
      }
      const replayPayload = buildExecutorReplayPayloadFromProof({
        proofId: replayProofId,
        proof: replayLookup.proof,
        projectId: replayLookup.projectId,
        point: replayLookup.point,
        operatorId: replayLookup.operatorId,
      });
      try {
        const normalizedReplay = normalizeExecutorRunPayload(replayPayload);
        const isolatedContainer = createIsolatedExecutorReplayContainer({
          projectId: normalizedReplay.executionContext.projectId,
          point: normalizedReplay.executionContext.point,
          userId: normalizedReplay.executionContext.userId,
          spuId: normalizedReplay.ruleBinding.spuId,
        });
        const { response: replayResponse } = executeExecutorRunWithNormalizedPayload(
          normalizedReplay,
          isolatedContainer,
        );
        const originalResult = normalizeProofResultValue(replayLookup.proof.result ?? replayLookup.proof.status);
        const replayResult = normalizeProofResultValue(replayResponse.status);
        sendJson(res, 200, {
          matched: originalResult === replayResult,
          original_result: originalResult,
          replay_result: replayResult,
        });
        return;
      } catch (error) {
        if (error instanceof ExecutorRunError) {
          sendJson(res, error.statusCode, { error: error.message, code: error.code });
          return;
        }
        throw error;
      }
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "containers" && parts[3] === "proof") {
      const proof = service.getProof(parts[2]);
      if (!proof) {
        sendJson(res, 404, { error: "proof not found" });
        return;
      }
      const layerPegDocument = resolveLayerPegContainerProofDocument(parts[2]);
      sendJson(res, 200, {
        proof,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/proof/archive-export") {
      authorize(req, "archive");
      const body = await readBody<{
        containerId?: string;
        anchor?: AnchorRequestPayload;
      }>(req);
      const containerId = String(body.containerId ?? "").trim();
      if (!containerId) {
        throw new Error("containerId is required");
      }
      const proof = service.archiveContainer(containerId, {
        anchor: body.anchor,
      });
      const layerPegDocument = resolveLayerPegContainerProofDocument(containerId);
      const exportPackage = buildProofAuditPackageFromContainer(containerId, proof);
      sendJson(res, 200, {
        proof,
        exportPackage,
        layerPegDocument,
        standardOutput: layerPegDocument ? toLayerPegStandardOutput(layerPegDocument) : null,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/proof/export") {
      authorize(req, "execute");
      const body = await readBody<{
        nodeId?: string;
        containerId?: string;
      }>(req);
      const nodeId = String(body.nodeId ?? "").trim();
      const containerId = String(body.containerId ?? "").trim();
      if (!nodeId && !containerId) {
        throw new Error("nodeId or containerId is required");
      }
      if (nodeId && containerId) {
        throw new Error("only one of nodeId or containerId is allowed");
      }

      if (nodeId) {
        const node = service.getNode(nodeId);
        if (!node) {
          sendJson(res, 404, { error: "node not found" });
          return;
        }
        const result = buildProofAuditPackageFromNode(node);
        sendJson(res, 200, result);
        return;
      }

      const proof = service.getProof(containerId);
      if (!proof) {
        sendJson(res, 404, { error: "proof not found" });
        return;
      }
      const result = buildProofAuditPackageFromContainer(containerId, proof);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "containers" && parts[3] === "audit") {
      sendJson(res, 200, { items: service.getContainerAuditTrail(parts[2]) });
      return;
    }

    if (req.method === "GET" && parts.length === 4 && parts[0] === "api" && parts[1] === "audit") {
      const entityType = parts[2] as EntityType;
      if (entityType !== "container" && entityType !== "node") {
        throw new Error("entityType 韫囧懘銆忛弰?container 閹?node");
      }
      sendJson(res, 200, { items: service.getAudit(entityType, parts[3]) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-dependency-graph/schema") {
      syncRuntimeDependencyEngine();
      sendJson(res, 200, {
        graph_schema: runtimeDependencyEngine.getSchema(),
        graph: runtimeDependencyEngine.getGraphSnapshot(),
        cycle_detection: {
          enabled: true,
          blocked_edges: runtimeDependencyEngine.getGraphSnapshot().blocked_edges,
        },
        recompute_strategy: runtimeDependencyEngine.getSchema().recompute_strategy,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-dependency-graph/recompute") {
      syncRuntimeDependencyEngine();
      const body = await readBody<Record<string, unknown>>(req);
      const recomputeResult = runtimeDependencyEngine.recompute(body as {
        body_id?: string;
        slotKey?: string;
        form_code?: string;
        project_id?: string;
        gate_id?: string;
        gate_ids?: string[];
        proof_id?: string;
        proof_ids?: string[];
        force?: boolean;
      });
      sendJson(res, 200, {
        recompute_result: recomputeResult,
        cycle_detection: {
          enabled: true,
          blocked_edges: runtimeDependencyEngine.getGraphSnapshot().blocked_edges,
        },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-replay/schema") {
      sendJson(res, 200, getRuntimeReplaySchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-replay/run") {
      const body = await readBody<{
        body_snapshot: Record<string, unknown>;
        old_rulepack: unknown;
        new_rulepack: unknown;
        replay_mode?: "what_if_simulation" | "upgrade_validation" | "rollback_validation";
        context?: {
          project_id?: string;
          form_code?: string;
          operator_id?: string;
        };
      }>(req);
      const result = runRuntimeReplay(service, body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-trust/schema") {
      const schema = runtimeTrustChain.getSchema();
      sendJson(res, 200, {
        trust_score_rules: schema.trust_scoring_model,
        trust_report_schema: {
          trust_level: ["trusted", "review_required", "suspicious", "untrusted"],
          required_fields: [
            "report_id",
            "project_id",
            "trust_score",
            "trust_level",
            "factor_scores",
            "low_trust_proofs",
            "suspicious_overrides",
            "missing_evidence",
            "compliance_gate",
          ],
        },
        trust_lifecycle: schema.trust_lifecycle,
        page_plan: schema.page_plan,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-trust/evaluate") {
      const body = await readBody<{
        project_id: string;
        source: Record<string, unknown>;
        device: Record<string, unknown>;
        manual_input: Record<string, unknown>;
        proof: Record<string, unknown>;
        runtime_events: Array<Record<string, unknown>>;
        recent_values: number[];
      }>(req);
      const result = runtimeTrustChain.evaluate(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-trust/dashboard") {
      const limitRaw = Number(url.searchParams.get("limit") ?? "100");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
      sendJson(res, 200, runtimeTrustChain.getDashboard(limit));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-trust/finalize-compliance") {
      const body = await readBody<{ report_id?: string; requested_by?: string }>(req);
      const result = runtimeTrustChain.finalizeCompliance({
        report_id: String(body.report_id ?? "").trim(),
        requested_by: body.requested_by ? String(body.requested_by) : undefined,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/v1/semantic-consistency/schema" || url.pathname === "/api/v1/consistency-check/schema")) {
      const schema = runtimeSemanticConsistency.getSchema();
      sendJson(res, 200, {
        consistency_rules: schema.consistency_rules,
        detection_engine: schema.detection_engine,
        remediation_workflow: schema.remediation_workflow,
        validation_engine: schema.detection_engine,
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/v1/semantic-consistency/run" || url.pathname === "/api/v1/consistency-check/run")) {
      const body = await readBody<{ project_id?: string; form_code?: string }>(req);
      const result = runtimeSemanticConsistency.runCheck(service, {
        project_id: String(body.project_id ?? "").trim() || "unknown_project",
        form_code: body.form_code ? String(body.form_code).trim() : undefined,
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/semantic-consistency/events") {
      const projectId = String(url.searchParams.get("project_id") ?? "").trim() || undefined;
      const limitRaw = Number(url.searchParams.get("limit") ?? "100");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;
      sendJson(res, 200, runtimeSemanticConsistency.listEvents({ project_id: projectId, limit }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/live-runtime/schema") {
      sendJson(res, 200, liveRuntimeSystem.getArchitecture());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/live-runtime/ingest") {
      const body = await readBody<{
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
      }>(req);
      sendJson(res, 200, liveRuntimeSystem.ingest(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/live-runtime/worker/drain") {
      const limitRaw = Number(url.searchParams.get("limit") ?? "20");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 20;
      sendJson(res, 200, liveRuntimeSystem.drain(limit));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/live-runtime/snapshot") {
      const projectId = String(url.searchParams.get("project_id") ?? "").trim() || undefined;
      sendJson(res, 200, liveRuntimeSystem.snapshot(projectId));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/live-runtime/replay") {
      const body = await readBody<{ event_id?: string }>(req);
      const eventId = String(body.event_id ?? "").trim();
      if (!eventId) throw new Error("event_id is required");
      sendJson(res, 200, liveRuntimeSystem.replay(eventId));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/live-runtime/rollback") {
      const body = await readBody<{ event_id?: string; reason?: string }>(req);
      const eventId = String(body.event_id ?? "").trim();
      if (!eventId) throw new Error("event_id is required");
      sendJson(res, 200, liveRuntimeSystem.rollback(eventId, body.reason ? String(body.reason) : undefined));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/live-runtime/audit") {
      const limitRaw = Number(url.searchParams.get("limit") ?? "200");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 200;
      sendJson(res, 200, liveRuntimeSystem.audit(limit));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/live-runtime/traceability") {
      const limitRaw = Number(url.searchParams.get("limit") ?? "200");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 200;
      sendJson(res, 200, liveRuntimeSystem.trace(limit));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/engineering-reasoning/schema") {
      sendJson(res, 200, getEngineeringReasoningSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-reasoning/run") {
      const body = await readBody<{
        body_snapshot: Record<string, unknown>;
        gate_result: Record<string, unknown>;
        runtime_events: Array<Record<string, unknown>>;
        specir: Record<string, unknown>;
        historical_runtime_traces: Array<Record<string, unknown>>;
      }>(req);
      const gate = (body.gate_result ?? {}) as Record<string, unknown>;
      const slotKey = String(gate.slotKey ?? gate.slot_key ?? "").trim();
      const gateId = String(gate.gate_id ?? gate.gateId ?? "").trim();
      const issueSignature = String(gate.violated_constraint ?? gate.rule_id ?? gate.ruleId ?? "").trim();
      const memoryContext = semanticRuntimeMemory.buildReasoningContext({
        issue_signature: issueSignature || undefined,
        slotKey: slotKey || undefined,
        gate_id: gateId || undefined,
      });
      sendJson(res, 200, runEngineeringReasoning({
        ...body,
        historical_runtime_traces: [
          ...(Array.isArray(body.historical_runtime_traces) ? body.historical_runtime_traces : []),
          ...memoryContext.memory_context.map((item) => ({
            trace_source: "semantic_runtime_memory",
            memory_id: item.memory_id,
            memory_type: item.memory_type,
            issue_signature: item.issue_signature,
            slotKey: item.slotKey,
            gate_id: item.gate_id,
            success_score: item.success_score,
            retrieval_score: item.retrieval_score,
            payload: item.payload,
          })),
        ],
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/engineering-causal-graph/schema") {
      const schema = engineeringCausalGraph.getSchema();
      sendJson(res, 200, {
        ...schema,
        example: engineeringCausalGraph.exampleLowCompactionChain(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-causal-graph/build") {
      const body = await readBody<Record<string, unknown>>(req);
      sendJson(res, 200, engineeringCausalGraph.buildGraph(body as {
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
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-causal-graph/traverse") {
      const body = await readBody<{
        start_node_id?: string;
        direction?: "upstream" | "downstream";
        max_depth?: number;
        relation_filter?: Array<"causes" | "contributes_to" | "blocks" | "amplifies" | "correlates">;
      }>(req);
      sendJson(res, 200, engineeringCausalGraph.traverse({
        start_node_id: String(body.start_node_id ?? "").trim(),
        direction: body.direction,
        max_depth: body.max_depth,
        relation_filter: body.relation_filter,
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-causal-graph/root-cause") {
      const body = await readBody<{ target_node_id?: string; max_depth?: number }>(req);
      sendJson(res, 200, engineeringCausalGraph.rootCause({
        target_node_id: String(body.target_node_id ?? "").trim(),
        max_depth: body.max_depth,
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-causal-graph/predict-impact") {
      const body = await readBody<{ source_node_id?: string; max_depth?: number }>(req);
      sendJson(res, 200, engineeringCausalGraph.predictImpact({
        source_node_id: String(body.source_node_id ?? "").trim(),
        max_depth: body.max_depth,
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-anomaly/schema") {
      sendJson(res, 200, runtimeAnomalyDetection.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-anomaly/detect") {
      const body = await readBody<{
        project_id: string;
        form_code?: string;
        sensor_data?: Array<Record<string, unknown>>;
        body_snapshot?: Record<string, unknown>;
        runtime_events?: Array<Record<string, unknown>>;
        proofs?: Array<Record<string, unknown>>;
        gate_results?: Array<Record<string, unknown>>;
      }>(req);
      sendJson(res, 200, runtimeAnomalyDetection.detect(body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-anomaly/risk-queue") {
      const projectId = String(url.searchParams.get("project_id") ?? "").trim() || undefined;
      const limitRaw = Number(url.searchParams.get("limit") ?? "200");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 200;
      sendJson(res, 200, runtimeAnomalyDetection.listQueue({ project_id: projectId, limit }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-anomaly/auto-compliance-gate") {
      const body = await readBody<{ anomaly_id?: string }>(req);
      sendJson(res, 200, runtimeAnomalyDetection.gateAutoCompliance({ anomaly_id: body.anomaly_id ? String(body.anomaly_id) : undefined }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/predictive-runtime/schema") {
      sendJson(res, 200, predictiveRuntimeEngine.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/predictive-runtime/predict") {
      const body = await readBody<{
        historical_runtime_traces: Array<Record<string, unknown>>;
        current_body_values: Record<string, unknown>;
        sensor_trends: Array<Record<string, unknown>>;
        weather: Record<string, unknown>;
        process_schedule: Record<string, unknown>;
      }>(req);
      sendJson(res, 200, predictiveRuntimeEngine.predict(body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-memory/schema") {
      sendJson(res, 200, semanticRuntimeMemory.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-memory/upsert") {
      const body = await readBody<{
        memory_type: "historical_failure" | "successful_remediation" | "override_pattern" | "recurring_issue" | "accepted_ai_patch";
        project_id: string;
        form_code?: string;
        slotKey?: string;
        gate_id?: string;
        issue_signature: string;
        tags?: string[];
        payload?: Record<string, unknown>;
        success_score?: number;
      }>(req);
      sendJson(res, 200, semanticRuntimeMemory.upsert(body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-memory/list") {
      const projectId = String(url.searchParams.get("project_id") ?? "").trim() || undefined;
      const memoryType = String(url.searchParams.get("memory_type") ?? "").trim() as
        | "historical_failure"
        | "successful_remediation"
        | "override_pattern"
        | "recurring_issue"
        | "accepted_ai_patch"
        | "";
      const limitRaw = Number(url.searchParams.get("limit") ?? "200");
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.floor(limitRaw))) : 200;
      sendJson(res, 200, semanticRuntimeMemory.list({
        project_id: projectId,
        memory_type: memoryType || undefined,
        limit,
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-memory/retrieve") {
      const body = await readBody<{
        issue_signature?: string;
        slotKey?: string;
        gate_id?: string;
        tags?: string[];
        project_id?: string;
        limit?: number;
        prefer_success?: boolean;
      }>(req);
      sendJson(res, 200, semanticRuntimeMemory.retrieve(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-memory/reasoning-context") {
      const body = await readBody<{
        issue_signature?: string;
        slotKey?: string;
        gate_id?: string;
        tags?: string[];
        project_id?: string;
      }>(req);
      sendJson(res, 200, semanticRuntimeMemory.buildReasoningContext(body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-memory/ai-reuse") {
      const body = await readBody<{
        issue_signature?: string;
        slotKey?: string;
        gate_id?: string;
        tags?: string[];
        project_id?: string;
      }>(req);
      sendJson(res, 200, semanticRuntimeMemory.suggestFromHistory(body));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/autonomous-remediation/schema") {
      sendJson(res, 200, autonomousRemediationPlanner.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/autonomous-remediation/plan") {
      const body = await readBody<{
        failed_gate: Record<string, unknown>;
        runtime_reasoning: Record<string, unknown>;
        historical_remediation?: Array<Record<string, unknown>>;
        project_context: Record<string, unknown>;
      }>(req);
      const failedGate = (body.failed_gate ?? {}) as Record<string, unknown>;
      const historical = Array.isArray(body.historical_remediation) ? body.historical_remediation : [];
      const issueSignature = String(failedGate.violated_constraint ?? failedGate.rule_id ?? failedGate.ruleId ?? "").trim();
      const slotKey = String(failedGate.slotKey ?? failedGate.slot_key ?? "").trim();
      const gateId = String(failedGate.gate_id ?? failedGate.gateId ?? "").trim();
      const projectId = String((body.project_context ?? {}).project_id ?? "").trim();
      const reuse = semanticRuntimeMemory.suggestFromHistory({
        issue_signature: issueSignature || undefined,
        slotKey: slotKey || undefined,
        gate_id: gateId || undefined,
        project_id: projectId || undefined,
      });
      const mergedHistorical = historical.concat(reuse.prioritized_cases);
      sendJson(res, 200, autonomousRemediationPlanner.plan({
        failed_gate: failedGate,
        runtime_reasoning: body.runtime_reasoning ?? {},
        historical_remediation: mergedHistorical,
        project_context: body.project_context ?? {},
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/project-semantic-brain/schema") {
      sendJson(res, 200, projectSemanticBrain.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/project-semantic-brain/build") {
      const body = await readBody<{
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
      }>(req);
      sendJson(res, 200, projectSemanticBrain.build({
        project_id: String(body.project_id ?? "").trim() || "unknown_project",
        specir: body.specir ?? [],
        runtime: body.runtime ?? [],
        bim: body.bim ?? [],
        iot: body.iot ?? [],
        proof: body.proof ?? [],
        compliance: body.compliance ?? [],
        risk: body.risk ?? [],
        historical_memory: body.historical_memory ?? [],
        dependencies: body.dependencies ?? [],
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/engineering-copilot-2/schema") {
      sendJson(res, 200, engineeringCopilotV2.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/engineering-copilot-2/ask") {
      const body = await readBody<{
        question: string;
        project_context: Record<string, unknown>;
        runtime_events: Array<Record<string, unknown>>;
        gate_records: Array<Record<string, unknown>>;
        proof_records: Array<Record<string, unknown>>;
        specir_records: Array<Record<string, unknown>>;
        historical_memory?: Array<Record<string, unknown>>;
        risk_records?: Array<Record<string, unknown>>;
      }>(req);
      sendJson(res, 200, engineeringCopilotV2.ask({
        question: String(body.question ?? "").trim(),
        project_context: body.project_context ?? {},
        runtime_events: body.runtime_events ?? [],
        gate_records: body.gate_records ?? [],
        proof_records: body.proof_records ?? [],
        specir_records: body.specir_records ?? [],
        historical_memory: body.historical_memory ?? [],
        risk_records: body.risk_records ?? [],
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/compliance-intelligence/schema") {
      sendJson(res, 200, complianceIntelligenceEngine.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/compliance-intelligence/analyze") {
      const body = await readBody<{
        runtime_graph: Array<Record<string, unknown>>;
        proof_chain: Array<Record<string, unknown>>;
        risk_events: Array<Record<string, unknown>>;
        override_history: Array<Record<string, unknown>>;
      }>(req);
      sendJson(res, 200, complianceIntelligenceEngine.analyze({
        runtime_graph: body.runtime_graph ?? [],
        proof_chain: body.proof_chain ?? [],
        risk_events: body.risk_events ?? [],
        override_history: body.override_history ?? [],
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/runtime-knowledge-compression/schema") {
      sendJson(res, 200, runtimeKnowledgeCompression.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/runtime-knowledge-compression/run") {
      const body = await readBody<{
        runtime_graph: Array<Record<string, unknown>>;
        proofs: Array<Record<string, unknown>>;
        risks: Array<Record<string, unknown>>;
        anomalies: Array<Record<string, unknown>>;
      }>(req);
      sendJson(res, 200, runtimeKnowledgeCompression.compress({
        runtime_graph: body.runtime_graph ?? [],
        proofs: body.proofs ?? [],
        risks: body.risks ?? [],
        anomalies: body.anomalies ?? [],
      }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/v1/cross-project-learning/schema") {
      sendJson(res, 200, crossProjectSemanticLearning.getSchema());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/cross-project-learning/transfer") {
      const body = await readBody<{
        source_project_id: string;
        target_project_id: string;
        successful_remediation: Array<Record<string, unknown>>;
        runtime_anomaly_patterns: Array<Record<string, unknown>>;
        semantic_mappings: Array<Record<string, unknown>>;
        gate_tuning_knowledge: Array<Record<string, unknown>>;
      }>(req);
      sendJson(res, 200, crossProjectSemanticLearning.transfer({
        source_project_id: String(body.source_project_id ?? "").trim() || "unknown_source",
        target_project_id: String(body.target_project_id ?? "").trim() || "unknown_target",
        successful_remediation: body.successful_remediation ?? [],
        runtime_anomaly_patterns: body.runtime_anomaly_patterns ?? [],
        semantic_mappings: body.semantic_mappings ?? [],
        gate_tuning_knowledge: body.gate_tuning_knowledge ?? [],
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/v1/spec/export") {
      const body = await readBody<{ spuId?: string }>(req);
      if (!body.spuId || !String(body.spuId).trim()) {
        throw new Error("spuId is required");
      }

      const spuId = String(body.spuId);
      let output;
      try {
        output = await exportLoadedSpuSpec(spuId);
      } catch {
        const definition = service.getRegistry().find((item) => item.spuId === spuId) as SPUDefinition | undefined;
        if (!definition) {
          throw new Error(`spu not found: ${spuId}`);
        }
        output = await specExporter.generate(normalizeSpuDefinition(definition));
      }
      const bundleName = specExporter.getBundleFileName(spuId);
      setExportedBundle(bundleName, Buffer.from(output.bundle));

      sendJson(res, 200, {
        markdown: output.markdown,
        json: output.json,
        downloadUrl: `/downloads/${encodeURIComponent(bundleName)}`,
      });
      return;
    }

    if (req.method === "GET" && parts.length === 2 && parts[0] === "downloads") {
      const fileName = parts[1];
      const bundle = getExportedBundle(fileName);
      if (!bundle) {
        sendJson(res, 404, { error: "download not found" });
        return;
      }
      sendBinary(res, 200, bundle, fileName);
      return;
    }

    sendJson(res, 404, { error: "Not Found" });
  } catch (error) {
    if (isPublicRequest) {
      if (error instanceof PublicApiError) {
        sendPublicError(res, publicRequestId, error.statusCode, error.code, error.message, error.details);
        return;
      }
      if (error instanceof AuthorizationError) {
        const mappedCode = error.statusCode === 401 ? "PUBLIC_UNAUTHORIZED" : "PUBLIC_FORBIDDEN";
        sendPublicError(res, publicRequestId, error.statusCode, mappedCode, error.message);
        return;
      }
      if (error instanceof GateEvaluateError) {
        const gateCode: PublicApiErrorCode =
          error.code === "GATE_REQUEST_INVALID"
            ? "PUBLIC_GATE_REQUEST_INVALID"
            : error.code === "GATE_DEPENDENCY_UNMET"
              ? "PUBLIC_GATE_DEPENDENCY_UNMET"
              : "PUBLIC_GATE_EXECUTION_FAILED";
        sendPublicError(res, publicRequestId, error.statusCode, gateCode, error.message);
        return;
      }
      if (error instanceof ApprovalFlowError) {
        sendPublicError(
          res,
          publicRequestId,
          error.statusCode,
          toPublicErrorCodeFromStatus(error.statusCode),
          error.message,
        );
        return;
      }
      if (error instanceof Error) {
        sendPublicError(res, publicRequestId, 400, "PUBLIC_INVALID_ARGUMENT", error.message);
        return;
      }
      sendPublicError(res, publicRequestId, 500, "PUBLIC_INTERNAL_ERROR", String(error));
      return;
    }

    if (error instanceof AuthorizationError) {
      sendJson(res, error.statusCode, { error: error.message, code: error.code });
      return;
    }
    if (error instanceof ApprovalFlowError) {
      sendJson(res, error.statusCode, { error: error.message, code: error.code });
      return;
    }
    if (error instanceof GateEvaluateError) {
      sendJson(res, error.statusCode, { error: error.message, code: error.code });
      return;
    }
    sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(PORT, appConfig.network.host, () => {
  // eslint-disable-next-line no-console
  console.log(`platform-api listening on ${appConfig.network.host}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[config] ${JSON.stringify(redactAppConfig(appConfig))}`);
  // eslint-disable-next-line no-console
  console.log(`[anchor] providers=${anchorProviders.map((item) => item.providerName).join(",")}`);
  for (const warning of appConfigWarnings) {
    // eslint-disable-next-line no-console
    console.warn(`[config warning] ${warning.code}: ${warning.message}`);
  }
});






