import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JSZip from "jszip";

import {
  API_BASE,
  archiveContainer,
  browseCatalogAssets,
  bindSpu,
  unbindSpu,
  createContainer,
  createNode,
  finalizeNode,
  getComponentCatalogComponents,
  getComponentCatalogs,
  getComponentMarketplaceListings,
  getLayerPegContainerProofDocument,
  getLayerPegDocuments,
  getLayerPegNodeDocument,
  getLayerPegSpecDocument,
  getLayerPegStoredDocument,
  getPlatformApiBase,
  getContainerAudit,
  getContainer,
  getContainerProof,
  getDashboard,
  getNormRegistry,
  getProjectEffectiveVersion,
  compareNormVersions,
  analyzeRuleImpact,
  getGoldenBaselineSchema,
  runGoldenRegressionCheck,
  runRuleTestFramework,
  getRuntimeObservabilitySchema,
  getRuntimeMetrics,
  getRuleHeatmap,
  getAIRepairReviewQueue,
  getAIRepairSchema,
  runAIRepairReviewAction,
  suggestAIRepair,
  runMultiStandardFusion,
  buildKnowledgeGraph,
  getSlotUsageKnowledgeGraph,
  queryKnowledgeGraph,
  semanticSearchKnowledgeGraph,
  traverseKnowledgeGraph,
  getSemanticCoreSchema,
  parseSemanticCore,
  recommendSlots,
  getSlotRecommendationReviewQueue,
  getConstraintReasonerSchema,
  reasonConstraint,
  getFormulaIntelligenceSchema,
  parseFormulaIntelligence,
  getLayoutSemanticSchema,
  analyzeLayoutSemantic,
  getHITL2Governance,
  enqueueHITL2Candidate,
  getHITL2Queue,
  runHITL2Action,
  getHITL2LearningLoop,
  getAIPatchSchema,
  suggestAIPatch,
  listAIPatches,
  reviewAIPatch,
  revertAIPatch,
  upsertGoldenBaseline,
  getRuntimeContainerModel,
  getClauseNeighbors,
  getRuleStoreNormdocDetail,
  listRuleStoreNormdocs,
  listRuleStorePackages,
  listRuleStorePackageRules,
  evaluateGateBatch,
  type GateEvaluateResponse,
  type GateBatchEvaluateResponse,
  projectExecute,
  importSlot,
  queryNl2Gate,
  searchClauses,
  searchCatalogAssets,
  selectSpuCandidates,
  type CatalogAssetItem,
  type ClauseSearchItem,
  type ComponentCatalogComponent,
  type ComponentCatalogSummary,
  type ComponentMarketplaceListing,
  type LayerPegDocumentMeta,
  type Nl2GateQueryResponse,
  type NormDocListItem,
  type RuleStorePackageRuleItem,
  type RuleStorePackageSummary,
  type SpuSelectorResponse,
  type RuntimeContainerModelResponse,
  type RuntimeProjectExecuteResponse,
  type RuleStoreNormDocDetail,
  type NormVersionCompareResponse,
  type RuleImpactAnalysisResponse,
  type GoldenRegressionReport,
  type RuleTestReport,
  type RuntimeMetricsResponse,
  type RuleHeatmapResponse,
  type AIRepairSuggestResponse,
  type MultiStandardFusionResponse,
  type KnowledgeGraphResponse,
  type SemanticCoreParseResponse,
  type SlotIntelligenceRecommendResponse,
  type ConstraintReasonerResponse,
  type FormulaIntelligenceResponse,
  type LayoutSemanticResponse,
  type HITL2QueueItem,
  setPlatformApiBase,
  runExecutor,
  signNode,
} from "./platform/api-client.ts";
import { exportSpuArtifacts, proofToMarkdown } from "./platform/export/export-service.ts";
import {
  buildNormExecutionState,
  canExecuteSpec,
  getNextExecutableSpec,
  type NormExecutionStatus,
  type NormRef,
} from "./platform/norm/normref-execution.ts";
import type {
  ContainerProof,
  ExecutionNode,
  ProofFragment,
  SPUDefinition,
  SpaceContainer,
  SpaceSlot,
} from "./platform/types.ts";
import { DEFAULT_APP_MODULE, getModuleConfig, type AppModule } from "./modules/module-config.ts";
import { getModuleSections } from "./modules/section-map.ts";
import {
  readModuleFromLocation,
  toModuleSubPathUrl,
  writeModuleSubPathToLocation,
} from "./routing/module-route.ts";
import { buildFormPegPreview, buildFormPegSchema } from "./platform/formpeg/formpeg-runtime.ts";

const TEMPLATE_SPU_IDS = [
  "highway.subgrade.compaction.4.2.1.soil@v1",
  "highway.subgrade.thickness@v1",
  "highway.subgrade.deflection@v1",
];
const DEMO_COMPACTION_SPU_ID = TEMPLATE_SPU_IDS[0];
const SUBGRADE_NORMREF: NormRef = {
  normRefId: "normref.highway.subgrade.basic.v1",
  name: "路基基础验收顺序",
  specs: [
    {
      spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
      order: 1,
      dependsOn: [],
      required: true,
    },
    {
      spuId: "highway.subgrade.thickness@v1",
      order: 2,
      dependsOn: ["highway.subgrade.compaction.4.2.1.soil@v1"],
      required: true,
    },
    {
      spuId: "highway.subgrade.deflection@v1",
      order: 3,
      dependsOn: ["highway.subgrade.thickness@v1"],
      required: true,
    },
  ],
};
const CONTAINER_ID_PREFIX = "container-K19+070";
const DEFAULT_RULE_VERSION_PROJECT_ID = "dajin-2024";
const FIXED_SLOT_PAYLOAD = {
  station: "K19+070",
  chainage: 19070,
  x: 128.25,
  y: 62.5,
  elevation: 135.4,
  alignment: "A1",
  sourceFile: "design_file_K19+000-K20+000.csv",
} as const;

const DEFAULT_NORM_COMPARE_OLD_SPEC = {
  spec_id: "demo.spec@v1",
  version: "v1",
  semantics: { catalog_id: "DEMO", standard_id: "DEMO_STD", measured_item: "compaction" },
  inputs: { input_dto: { compaction_degree: { type: "number", unit: "%" } } },
  gate: { rules: [{ rule_id: "r1", condition: "compaction_degree >= 95", on_fail: "block" }] },
};

const DEFAULT_NORM_COMPARE_NEW_SPEC = {
  spec_id: "demo.spec@v2",
  version: "v2",
  semantics: { catalog_id: "DEMO", standard_id: "DEMO_STD", measured_item: "compaction" },
  inputs: { input_dto: { compaction_degree: { type: "number", unit: "%" } } },
  gate: { rules: [{ rule_id: "r1", condition: "compaction_degree >= 96", on_fail: "block" }] },
};

const DEFAULT_RULE_IMPACT_SPECIR_ID = "JTG_F80_1_2017.4.2.1.compaction";
const DEFAULT_RULE_IMPACT_RULE_ID = "single_point_rule";
const DEFAULT_RULE_IMPACT_GATE_ID = "default";
const DEFAULT_RULE_IMPACT_SLOT_KEY = "compaction_degree";
const DEFAULT_GOLDEN_FORM_CODE = "JTG_F80_1_2017.4.2.1.compaction";
const DEFAULT_GOLDEN_BASELINE_RULEPACK = {
  component_id: DEFAULT_GOLDEN_FORM_CODE,
  component_name: "compaction",
  catalog_id: "JTG_F80_1_2017",
  standard_id: "JTG_F80_1_2017",
  version: "v1",
  gate: {
    rules: [{ rule_id: "single_point_rule", condition: "compaction_degree >= 95", severity: "blocking", on_fail: "block" }],
  },
};
const DEFAULT_RULE_TEST_THRESHOLD = 0.85;
const DEFAULT_AI_REPAIR_SOURCE_CLAUSE = "压实度应满足规范要求，代表值不得低于标准值。";
const DEFAULT_FUSION_STANDARDS = [
  {
    standard_id: "GB_DEMO",
    standard_type: "national",
    rules: [{ rule_id: "r.compaction", field: "compaction_degree", operator: ">=", threshold: 95, unit: "%", gate_logic: "AND" }],
  },
  {
    standard_id: "IND_DEMO",
    standard_type: "industry",
    rules: [{ rule_id: "r.compaction", field: "compaction_degree", operator: ">=", threshold: 96, unit: "%", gate_logic: "AND" }],
  },
  {
    standard_id: "LOCAL_DEMO",
    standard_type: "local",
    rules: [{ rule_id: "r.compaction", field: "compaction_degree", operator: ">=", threshold: 97, unit: "%", gate_logic: "AND" }],
  },
  {
    standard_id: "ENT_DEMO",
    standard_type: "enterprise",
    rules: [{ rule_id: "r.compaction", field: "compaction_degree", operator: ">=", threshold: 98, unit: "%", gate_logic: "AND" }],
  },
];
const DEFAULT_SEMANTIC_CLAUSE = "路基压实度代表值不得低于95%，且应按T0921方法检测。";
const DEFAULT_SLOT_BLUEPRINT_CONTEXT = {
  form_code: "JTG_F80_1_2017.4.2.1.compaction",
  dto_fields: ["compaction_degree", "station", "sample_count"],
  domain: "roadbed",
};
const DEFAULT_SLOT_NEARBY = [
  { slotKey: "compaction_degree", label: "压实度", type: "number", unit: "%" },
  { slotKey: "dry_density", label: "干密度", type: "number", unit: "g/cm3" },
];
const DEFAULT_SLOT_HISTORICAL_MAPPINGS = [
  { clause: "压实度代表值不得低于95%", slotKey: "compaction_degree", semantic_type: "threshold_constraint" },
  { clause: "压实度应按代表值评价", slotKey: "compaction_degree", semantic_type: "process_requirement" },
  { clause: "干密度不得低于设计值", slotKey: "dry_density", semantic_type: "threshold_constraint" },
];
const DEFAULT_CONSTRAINT_CLAUSE = "高速公路一级公路压实度不得小于95%";
const DEFAULT_FORMULA_EXPLAIN_CLAUSE = "压实度由干密度与最大干密度计算得到。";
const DEFAULT_FORMULA_EXPLAIN_FORMULA = "compactionDegree = (dryDensity / maxDryDensity) * 100";
const DEFAULT_LAYOUT_SEMANTIC_TEXT = `4 路基工程
4.2 压实度
4.2.1 高速公路一级公路压实度不得小于95%
允许偏差：压实度 -1%
合并单元格：桩号范围
compactionDegree = (dryDensity / maxDryDensity) * 100
注：雨天工况应增加复核`;
const DEFAULT_HITL2_CANDIDATE = {
  field: "compaction_degree",
  slotKey: "compaction_degree",
  operator: ">=",
  threshold: 95,
  unit: "%",
  gate_logic: "AND",
};
const DEFAULT_AI_PATCH_NEARBY_RULES = [{ slotKey: "compaction_degree", threshold: 95, operator: ">=", formula: "compaction_degree >= 95", gate_logic: "AND" }];
function generateContainerId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${CONTAINER_ID_PREFIX}-${ts}-${rand}`;
}

function readLaunchParams(): { containerId: string; spuId: string; source: string } | null {
  if (typeof window === "undefined") {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const containerId = (params.get("containerId") ?? "").trim();
  const spuId = (params.get("spuId") ?? "").trim();
  const source = (params.get("source") ?? "").trim();
  if (!containerId && !spuId && !source) {
    return null;
  }
  return { containerId, spuId, source };
}

const SAMPLE_CASES_BY_SPU: Record<string, { pass: Record<string, unknown>; fail: Record<string, unknown> }> = {
  "highway.subgrade.compaction.4.2.1.soil@v1": {
    pass: { massHoleSand: 1980, volumeSand: 1000, moistureContent: 5, maxDryDensity: 1.95 },
    fail: { massHoleSand: 1700, volumeSand: 1000, moistureContent: 6, maxDryDensity: 1.95 },
  },
  "highway.subgrade.thickness@v1": {
    pass: { measuredThickness: 210, designThickness: 200 },
    fail: { measuredThickness: 180, designThickness: 200 },
  },
  "highway.subgrade.deflection@v1": {
    pass: { measuredDeflection: 18, maxAllowedDeflection: 20 },
    fail: { measuredDeflection: 22, maxAllowedDeflection: 20 },
  },
};

const NORMREF_API_BASE_STORAGE_KEY = "normref.matrixApiBase";
const PRODUCT_TECHNICAL_DETAILS_STORAGE_KEY = "normref.productTechnicalDetails";
const FORMPEG_DRAFT_STORAGE_KEY_PREFIX = "normref.formpeg.draft.v1";
const DEFAULT_NORMREF_API_BASE = (import.meta.env.VITE_NORMREF_API_BASE as string | undefined)?.trim() || "http://127.0.0.1:8000";
const DEFAULT_NL2GATE_WORKBENCH_URL = "http://127.0.0.1:5173";
const PLATFORM_API_UNAVAILABLE_MARKER = "无法连接平台 API";
const DEBUG_TOPIC_NL2GATE = "nl2gate";
const PROJECT_CONTEXT_API_PREFIX = "";
const DEFAULT_PROJECT_SCOPE_FILTERS = {
  include_categories: ["subgrade", "pavement", "bridge"],
  include_work_items: [],
  exclude_categories: ["tunnel"],
  exclude_work_items: [],
};
const DEFAULT_PROJECT_ROLE_BINDINGS = [
  {
    did: "did:test:authorized",
    measured_item_ids: ["compaction"],
    spec_ids: [],
    actions: ["execute"],
  },
];
const DEFAULT_PROJECT_INSTRUMENT_BINDINGS = [
  {
    instrument_id: "SB_001",
    measured_item_ids: ["compaction"],
    spec_ids: [],
    start_stake: "K15+000",
    end_stake: "K20+000",
    valid_from: "2026-01-01T00:00:00Z",
    valid_to: "2026-12-31T23:59:59Z",
  },
];

type DebugTopic = "overview" | typeof DEBUG_TOPIC_NL2GATE;

type ProjectResolvedMeasuredItem = {
  measured_item_id: string;
  measured_item_name: string;
  spec_id: string;
  work_item_id: string;
  category_id: string;
};

type ProjectResolvedScope = {
  catalog_id: string;
  selection_source?: string;
  scope_filters?: Record<string, unknown>;
  selected_spec_ids?: string[];
  category_ids: string[];
  category_names?: string[];
  work_item_ids: string[];
  work_item_names?: string[];
  measured_items: ProjectResolvedMeasuredItem[];
  unresolved_spec_ids?: string[];
  counts?: {
    categories: number;
    work_items: number;
    measured_items: number;
    specs: number;
  };
};

type ProjectInfo = {
  project_id: string;
  catalog_id: string;
  selected_specs: string[];
  overrides: Record<string, unknown>;
  overrides_by_branch?: Record<string, Record<string, unknown>>;
  role_bindings?: Array<Record<string, unknown>>;
  instrument_bindings?: Array<Record<string, unknown>>;
  selection_source?: string;
  scope_filters?: Record<string, unknown>;
  resolved_scope?: ProjectResolvedScope;
  created_at: string;
};

function normalizeApiBase(value: string | undefined | null, fallback: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.replace(/\/+$/, "");
}

function sanitizeUiText(value: string): string {
  return value
    .replace(/container/gi, "验收任务")
    .replace(/spu[_\s-]*id|spuid/gi, "检测项编号")
    .replace(/\bgate\b/gi, "判定")
    .replace(/project_execute/gi, "下一步执行")
    .replace(/\bscore\b/gi, "结果评分")
    .replace(/\breasons?\b/gi, "说明")
    .replace(/missing[_\s-]*inputs?/gi, "待补充项")
    .replace(/\bready\b/gi, "未开始")
    .replace(/\bpass\b/gi, "已完成")
    .replace(/\bblocked\b/gi, "不可执行（依赖未完成）")
    .replace(/\bfail(?:ed)?\b/gi, "进行中")
    .replace(/\brunning\b/gi, "进行中")
    .replace(/\bdraft\b/gi, "未开始")
    .replace(/\bsuccess\b/gi, "已完成")
    .replace(/未启用/g, "不参与本次检测");
}

function readFromStorage(key: string): string | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }
  try {
    const value = window.localStorage.getItem(key);
    return value ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeToStorage(key: string, value: string): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures and keep runtime value.
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseJsonObjectText(text: string, fieldName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${fieldName} 不是合法 JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 对象`);
  }
  return parsed as Record<string, unknown>;
}

function parseJsonArrayText(text: string, fieldName: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${fieldName} 不是合法 JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须是 JSON 数组`);
  }
  return parsed;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function normalizeCatalogIdForProjectApi(raw: string | undefined | null): string {
  const text = String(raw ?? "").trim();
  if (!text) {
    return "JTG_F80_1_2017";
  }
  if (text === "JTG F80/1-2017" || text === "JTG-F80-1-2017") {
    return "JTG_F80_1_2017";
  }
  if (/^[A-Za-z0-9_.-]+$/.test(text)) {
    return text;
  }
  return text.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeSpecIdForProjectApi(raw: string): string {
  const text = String(raw ?? "").trim();
  if (!text) {
    return "";
  }
  if (text.startsWith("JTG_F80_1_2017.")) {
    return text;
  }
  // highway.subgrade.compaction.4.2.1@v1 -> 4.2.1.compaction
  const noVersion = text.split("@")[0]?.trim() ?? text;
  const parts = noVersion.split(".").map((item) => item.trim()).filter((item) => item.length > 0);
  const firstDigitIndex = parts.findIndex((item) => /^\d+$/.test(item));
  if (firstDigitIndex >= 0 && firstDigitIndex + 2 < parts.length) {
    const clause = `${parts[firstDigitIndex]}.${parts[firstDigitIndex + 1]}.${parts[firstDigitIndex + 2]}`;
    const metric = firstDigitIndex > 0 ? parts[firstDigitIndex - 1] : "";
    if (metric) {
      return `${clause}.${metric}`;
    }
  }
  return noVersion;
}

function expandSpecIdsWithCatalogPrefix(specs: string[], catalogId: string): string[] {
  const prefix = String(catalogId || "").trim();
  if (!prefix) {
    return specs;
  }
  return specs
    .map((raw) => String(raw ?? "").trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      if (item.startsWith(`${prefix}.`)) {
        return item;
      }
      // 4.2.1.compaction -> JTG_F80_1_2017.4.2.1.compaction
      if (/^\d+\.\d+\.\d+\.[A-Za-z0-9_]+$/.test(item)) {
        return `${prefix}.${item}`;
      }
      return item;
    });
}

function isPlatformApiUnavailableMessage(message: string): boolean {
  return message.includes(PLATFORM_API_UNAVAILABLE_MARKER);
}

function resolveVisibleModule(module: AppModule, _showTechnicalDetails: boolean): AppModule {
  if (module === "runtime") {
    return "runtime";
  }
  // 白色页面固定为执行侧，不暴露构建/调试模块入口。
  return "executor";
}

function readDebugTopicFromPathname(pathname: string): DebugTopic {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  if (segments[0] !== "debug") {
    return "overview";
  }
  if (segments[1] === DEBUG_TOPIC_NL2GATE) {
    return DEBUG_TOPIC_NL2GATE;
  }
  return "overview";
}

function getNl2GateWorkbenchUrl(): string {
  const raw = (import.meta.env.VITE_NL2GATE_WEB_URL as string | undefined)?.trim();
  if (!raw) {
    return DEFAULT_NL2GATE_WORKBENCH_URL;
  }
  return raw.replace(/\/+$/, "");
}

async function readHttpErrorMessage(resp: Response): Promise<string> {
  const raw = (await resp.text()).trim();
  if (!raw) {
    return `${resp.status} ${resp.statusText}`.trim();
  }
  try {
    const parsed = JSON.parse(raw) as { detail?: unknown; message?: unknown; error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    // Keep raw response text for non-JSON body.
  }
  return raw;
}

const DEFAULT_NORMREF_GATE_PAYLOAD_TEXT = JSON.stringify(
  {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    inputs: {
      massHoleSand: 2850.5,
      volumeSand: 2000,
      moistureContent: 8.5,
      maxDryDensity: 2.35,
    },
    context: {
      projectId: "dajin-2024",
      layerZone: "96区",
      vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_PATH_PAYLOAD_TEXT = JSON.stringify(
  {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    inputs: {
      massHoleSand: 2850.5,
      volumeSand: 2000,
      moistureContent: 8.5,
      maxDryDensity: 2.35,
    },
    context: {
      projectId: "dajin-2024",
      layerZone: "96区",
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_STATE_PAYLOAD_TEXT = JSON.stringify(
  {
    vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    fromState: "COMPUTED",
    toState: "VALIDATED",
    triggeredBy: "did:peg:ins_001",
    signatures: {
      lab: "0xsign123",
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_PROOF_PAYLOAD_TEXT = JSON.stringify(
  {
    proofId: "",
    proofHash: "",
    verifyOptions: {
      includeTrace: true,
      verifySignatures: true,
      checkAnchor: true,
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_MAPPING_PAYLOAD_TEXT = JSON.stringify(
  {
    vuri: "v:/cn.highway/dajin/subgrade/DB-01/K15+200",
    context: {
      layer: "96区",
      time: "2026-04-17T10:00:00Z",
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_IMAGE_PAYLOAD_TEXT = JSON.stringify(
  {
    imageUrl: "https://example.com/site.jpg",
    options: {
      ocrText: "K15+200 compaction 95.0%",
    },
  },
  null,
  2,
);

const DEFAULT_NORMREF_VOICE_PAYLOAD_TEXT = JSON.stringify(
  {
    audioText: "K15+200 compaction 95.0",
  },
  null,
  2,
);

const DEFAULT_NORMREF_SPEC_PAYLOAD_TEXT = JSON.stringify(
  {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
  },
  null,
  2,
);

const DEFAULT_NORMREF_FORM_PAYLOAD_TEXT = JSON.stringify(
  {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    context: {
      layer: "96区",
    },
    values: {},
  },
  null,
  2,
);

const DEFAULT_NORMREF_REPORT_PAYLOAD_TEXT = JSON.stringify(
  {
    reportType: "quality_assessment",
    projectId: "dajin-2024",
    scope: {
      startStake: "K15+000",
      endStake: "K16+000",
    },
    data: {
      passCount: 10,
      failCount: 1,
    },
  },
  null,
  2,
);

type DashboardData = {
  totalContainers: number;
  archivedCount: number;
  pendingCount: number;
  verifiedCount: number;
  registryCount: number;
};

type ImportedBundleItem = {
  fileName: string;
  specId: string;
  name: string;
  registered: boolean;
  error?: string;
};

type FormPegBatchRowStatus = "IDLE" | "PENDING" | "PASS" | "FAIL" | "BLOCKED" | "ERROR" | "INVALID";

type FormPegBatchRow = {
  rowId: string;
  pointLabel: string;
  values: Record<string, string>;
  status: FormPegBatchRowStatus;
  message?: string;
  proofId?: string;
  proofHash?: string;
};

type FormPegDraftPayload = {
  version: 1;
  savedAt: string;
  formValues: Record<string, string>;
  batchRows: Array<{
    rowId: string;
    pointLabel: string;
    values: Record<string, string>;
  }>;
};

function toFormPegInputString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function buildInitialFormValues(spu: SPUDefinition): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of spu.data.inputs) {
    next[field.name] = "";
  }
  return next;
}

function createFormPegBatchRow(spu: SPUDefinition, rowIndex: number): FormPegBatchRow {
  return {
    rowId: `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    pointLabel: `P${rowIndex + 1}`,
    values: buildInitialFormValues(spu),
    status: "IDLE",
  };
}

function buildFormPegDraftStorageKey(containerId: string | null | undefined, spuId: string): string {
  const normalizedContainerId = String(containerId ?? "").trim() || "no-container";
  const normalizedSpuId = String(spuId ?? "").trim() || "no-spu";
  return `${FORMPEG_DRAFT_STORAGE_KEY_PREFIX}:${normalizedContainerId}:${normalizedSpuId}`;
}

function readFormPegDraft(storageKey: string): FormPegDraftPayload | null {
  const raw = readFromStorage(storageKey);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as FormPegDraftPayload;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.version !== 1) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeDraftFormValues(spu: SPUDefinition, value: unknown): Record<string, string> {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const next = buildInitialFormValues(spu);
  for (const field of spu.data.inputs) {
    next[field.name] = toFormPegInputString(source[field.name]);
  }
  return next;
}

function sanitizeDraftBatchRows(spu: SPUDefinition, value: unknown): FormPegBatchRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rows: FormPegBatchRow[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const row = raw as Record<string, unknown>;
    rows.push({
      rowId: typeof row.rowId === "string" && row.rowId.trim() ? row.rowId.trim() : `row_${index + 1}`,
      pointLabel: typeof row.pointLabel === "string" && row.pointLabel.trim() ? row.pointLabel.trim() : `P${index + 1}`,
      values: sanitizeDraftFormValues(spu, row.values),
      status: "IDLE",
    });
  }
  return rows;
}

function triggerDownload(filename: string, payload: BlobPart, mimeType: string): void {
  const blob = new Blob([payload], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function normalizeLifecycleLabel(state: SpaceContainer["lifecycleState"] | undefined): string {
  if (state === "DRAFT") {
    return "未开始";
  }
  if (state === "RUNNING") {
    return "进行中";
  }
  if (state === "VERIFIED") {
    return "已完成";
  }
  if (state === "ARCHIVED") {
    return "已完成";
  }
  return state ?? "-";
}

function formatDisplayTime(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "-";
  }
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) {
    return raw;
  }
  return new Date(ts).toLocaleString("zh-CN", { hour12: false });
}

function readProofStringField(proof: ContainerProof | null, keys: string[]): string {
  if (!proof) {
    return "";
  }
  const record = toRecord(proof);
  if (!record) {
    return "";
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeRuleStorePublishedAt(value: unknown): string {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return "-";
    }
    const ts = Date.parse(text);
    if (!Number.isNaN(ts)) {
      return new Date(ts).toLocaleDateString("zh-CN");
    }
    return text;
  }
  return "-";
}

function normalizeRuleStoreUpdatedAt(value: unknown): string {
  if (typeof value !== "string") {
    return "-";
  }
  const text = value.trim();
  if (!text) {
    return "-";
  }
  return formatDisplayTime(text);
}

function isProjectCustomizedSpec(definition: SPUDefinition): boolean {
  const domain = String(definition.meta.domain || "").trim().toLowerCase();
  const category = String(definition.meta.category || "").trim().toLowerCase();
  const sourceType = String(definition.sourceType || "").trim().toLowerCase();
  const extensions = toRecord(definition.meta.extensions);
  const extensionFlag = extensions?.projectCustomized;
  if (typeof extensionFlag === "boolean") {
    return extensionFlag;
  }
  if (domain === "project" || category === "project") {
    return true;
  }
  if (sourceType === "imported" || sourceType === "compiled") {
    return true;
  }
  return false;
}

function formatSpecVersionLabel(version: string): string {
  const text = String(version || "").trim();
  if (!text) {
    return "v-";
  }
  return text.toLowerCase().startsWith("v") ? text : `v${text}`;
}

function normalizeStandardCodeLabel(standardCode: string): string {
  return String(standardCode || "")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeClauseNoToken(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const dotted = raw.match(/\d+(?:\.\d+)+/);
  if (dotted) {
    return dotted[0];
  }
  const grouped = raw.match(/\d+/g);
  if (grouped && grouped.length > 0) {
    return grouped.join(".");
  }
  return raw;
}

function clauseNoSortKey(value: string | null | undefined): number[] {
  const normalized = normalizeClauseNoToken(value);
  if (!normalized) {
    return [];
  }
  return normalized
    .split(".")
    .map((segment) => Number.parseInt(segment, 10))
    .filter((segment) => Number.isFinite(segment));
}

function compareClauseNo(left: string | null | undefined, right: string | null | undefined): number {
  const leftKey = clauseNoSortKey(left);
  const rightKey = clauseNoSortKey(right);
  const maxLength = Math.max(leftKey.length, rightKey.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = index < leftKey.length ? leftKey[index] : -1;
    const rightValue = index < rightKey.length ? rightKey[index] : -1;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return leftText.localeCompare(rightText, "zh-CN");
}

function buildClausePreview(content: string, maxLength = 110): string {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "暂无原文预览";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function deriveSpuKeyFromSpuId(spuId: string): string {
  const normalized = String(spuId ?? "").trim();
  const index = normalized.lastIndexOf("@");
  if (index <= 0) {
    return normalized;
  }
  return normalized.slice(0, index);
}

function inferWorkflowMetricFromSpuId(spuId: string): "compaction" | "thickness" | "deflection" | "other" {
  const lowered = deriveSpuKeyFromSpuId(spuId).toLowerCase();
  if (lowered.includes("compaction")) {
    return "compaction";
  }
  if (lowered.includes("thickness")) {
    return "thickness";
  }
  if (lowered.includes("deflection")) {
    return "deflection";
  }
  return "other";
}

function normalizeWorkflowSpuToken(spuId: string): string {
  const metric = inferWorkflowMetricFromSpuId(spuId);
  const clause = inferClauseFromSpuId(spuId);
  if (metric === "other") {
    return deriveSpuKeyFromSpuId(spuId).toLowerCase();
  }
  return clause ? `${metric}:${clause}` : metric;
}

function isWorkflowSpuEquivalent(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftValue = String(left ?? "").trim();
  const rightValue = String(right ?? "").trim();
  if (!leftValue || !rightValue) {
    return false;
  }
  if (leftValue === rightValue) {
    return true;
  }
  const leftKey = deriveSpuKeyFromSpuId(leftValue);
  const rightKey = deriveSpuKeyFromSpuId(rightValue);
  if (leftKey && rightKey && leftKey === rightKey) {
    return true;
  }
  return normalizeWorkflowSpuToken(leftValue) === normalizeWorkflowSpuToken(rightValue);
}

function resolveSchedulerDetailBySpuIds(
  details: RuntimeSchedulerDecisionDetail[] | undefined,
  candidateSpuIds: Array<string | null | undefined>,
): RuntimeSchedulerDecisionDetail | null {
  const allDetails = details ?? [];
  if (allDetails.length === 0) {
    return null;
  }
  const normalizedCandidates = candidateSpuIds
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
  if (normalizedCandidates.length === 0) {
    return null;
  }
  for (const candidate of normalizedCandidates) {
    const direct = allDetails.find((item) => item.spuId === candidate);
    if (direct) {
      return direct;
    }
  }
  for (const candidate of normalizedCandidates) {
    const equivalent = allDetails.find((item) => isWorkflowSpuEquivalent(item.spuId, candidate));
    if (equivalent) {
      return equivalent;
    }
  }
  const candidateKeys = new Set(normalizedCandidates.map((item) => deriveSpuKeyFromSpuId(item)));
  return allDetails.find((item) => candidateKeys.has(deriveSpuKeyFromSpuId(item.spuId))) ?? null;
}

function formatVersionSourceLabel(source: "project_binding" | "latest" | undefined): string {
  if (source === "project_binding") {
    return "项目绑定版本";
  }
  if (source === "latest") {
    return "规则库最新版本";
  }
  return "-";
}

function pickPegBotTargetSpuId(
  selectedVersion: RuleStoreVersionOption | null,
  response: Nl2GateQueryResponse,
): string | null {
  if (!selectedVersion) {
    return response.structured.target.spuId ?? null;
  }
  const versionSpuIds = new Set(selectedVersion.spuIds);
  const direct = response.structured.target.spuId ?? "";
  if (direct && versionSpuIds.has(direct)) {
    return direct;
  }
  const candidate = response.structured.spuCandidates.find((item) => item.spuId && versionSpuIds.has(item.spuId));
  return candidate?.spuId ?? null;
}

function readNumericValue(source: Record<string, unknown> | null | undefined, keys: string[]): number | undefined {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function normalizeInputFieldName(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s-]/g, "");
}

function resolveInputFieldByAliases(spu: SPUDefinition, aliases: string[], keyword?: string): string | null {
  const fieldNames = spu.data.inputs.map((field) => field.name);
  const aliasSet = new Set(aliases.map((item) => normalizeInputFieldName(item)));
  const exact = fieldNames.find((name) => aliasSet.has(normalizeInputFieldName(name)));
  if (exact) {
    return exact;
  }
  if (keyword) {
    const normalizedKeyword = normalizeInputFieldName(keyword);
    const fuzzy = fieldNames.find((name) => normalizeInputFieldName(name).includes(normalizedKeyword));
    if (fuzzy) {
      return fuzzy;
    }
  }
  return null;
}

function inferMetricFromQuery(queryText: string): "compaction" | "thickness" | "deflection" | null {
  const text = queryText.toLowerCase();
  if (text.includes("压实度") || text.includes("compaction")) {
    return "compaction";
  }
  if (text.includes("厚度") || text.includes("thickness")) {
    return "thickness";
  }
  if (text.includes("弯沉") || text.includes("deflection")) {
    return "deflection";
  }
  return null;
}

function parseMetricValueFromQuery(queryText: string, metric: "compaction" | "thickness" | "deflection" | null): number | undefined {
  const source = queryText.trim();
  if (!source || !metric) {
    return undefined;
  }
  const patterns = metric === "compaction"
    ? [/(?:压实度|compaction)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)/i]
    : metric === "thickness"
    ? [/(?:厚度|thickness)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)/i]
    : [/(?:弯沉|deflection)\s*[:：=]?\s*(-?\d+(?:\.\d+)?)/i];
  for (const pattern of patterns) {
    const matched = source.match(pattern);
    if (!matched?.[1]) {
      continue;
    }
    const value = Number(matched[1]);
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function toPegBotIntent(metric: "compaction" | "thickness" | "deflection" | null): PegBotStructuredIntent {
  if (metric === "compaction") {
    return "check_compaction";
  }
  if (metric === "thickness") {
    return "check_thickness";
  }
  if (metric === "deflection") {
    return "check_deflection";
  }
  return "check_quality";
}

function toPegBotFormType(metric: "compaction" | "thickness" | "deflection" | null): PegBotStructuredOutput["form_type"] {
  if (metric === "compaction") {
    return "subgrade.compaction";
  }
  if (metric === "thickness") {
    return "subgrade.thickness";
  }
  if (metric === "deflection") {
    return "subgrade.deflection";
  }
  return "subgrade.quality";
}

function buildClauseRuleId(clauseText: string | undefined): string {
  const normalized = String(clauseText ?? "").trim();
  if (!normalized) {
    return "clause_unknown";
  }
  return `clause_${normalized.replace(/[^\d.]/g, "").replace(/\./g, "_") || "unknown"}`;
}

function normalizePegBotExecutionLabel(status: "PASS" | "FAIL" | undefined, success: boolean | undefined): string {
  if (status === "PASS") {
    return "合格";
  }
  if (status === "FAIL") {
    return "不合格";
  }
  if (success === false) {
    return "未完成";
  }
  return "待执行";
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

function isEphemeralRuleSpec(definition: SPUDefinition): boolean {
  const extensions = toRecord(definition.meta.extensions);
  if (!extensions) {
    return false;
  }
  const explicitFlag = extensions.ephemeralRule ?? extensions.ephemeralRules;
  if (normalizeBooleanFlag(explicitFlag)) {
    return true;
  }
  const lifecycle = String(extensions.ruleLifecycle ?? extensions.lifecycleScope ?? "").trim().toLowerCase();
  return lifecycle === "current_task" || lifecycle === "ephemeral";
}

function isRuleStorePublishedSpec(definition: SPUDefinition): boolean {
  const extensions = toRecord(definition.meta.extensions);
  if (!extensions) {
    return false;
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

function formatTimelineTime(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "-";
  }
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) {
    return raw;
  }
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function normalizeResultStatus(status: ExecutionNode["status"]): "PASS" | "FAIL" | "RUNNING" | "DRAFT" {
  if (status === "FINAL_PASS" || status === "PASS") {
    return "PASS";
  }
  if (status === "FINAL_FAIL" || status === "FAIL") {
    return "FAIL";
  }
  if (status === "DRAFT") {
    return "DRAFT";
  }
  return "RUNNING";
}

async function readSpecBundle(file: File): Promise<{ definitionText: string; specId: string; name: string }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const specJsonFile = zip.file("spec.json");
  if (!specJsonFile) {
    throw new Error(`${file.name} 缺少 spec.json`);
  }
  const definitionText = await specJsonFile.async("string");
  const parsed = JSON.parse(definitionText) as { spuId?: string; meta?: { name?: string } };
  if (!parsed.spuId) {
    throw new Error(`${file.name} 内 spec.json 缺少 spuId`);
  }
  return {
    definitionText,
    specId: parsed.spuId,
    name: parsed.meta?.name ?? parsed.spuId,
  };
}

function normalizeNormExecutionStatusLabel(status: NormExecutionStatus | undefined): string {
  if (status === "pass") {
    return "已完成";
  }
  if (status === "fail") {
    return "进行中";
  }
  if (status === "running") {
    return "进行中";
  }
  if (status === "ready") {
    return "未开始";
  }
  return "不可执行（依赖未完成）";
}

function normExecutionStatusColorClass(status: NormExecutionStatus | undefined): string {
  if (status === "pass") {
    return "text-emerald-700";
  }
  if (status === "fail") {
    return "text-amber-700";
  }
  if (status === "running") {
    return "text-blue-700";
  }
  if (status === "ready") {
    return "text-slate-600";
  }
  return "text-amber-700";
}

function normalizeNodeStatusForDisplay(status: ExecutionNode["status"]): "PASS" | "FAIL" | "RUNNING" | "DRAFT" {
  if (status === "FINAL_PASS" || status === "PASS") {
    return "PASS";
  }
  if (status === "FINAL_FAIL" || status === "FAIL") {
    return "FAIL";
  }
  if (status === "SIGNING" || status === "RUNNING") {
    return "RUNNING";
  }
  return "DRAFT";
}

function normalizeBatchRowStatusLabel(status: FormPegBatchRowStatus): string {
  if (status === "IDLE") {
    return "未填写";
  }
  if (status === "PENDING") {
    return "进行中";
  }
  if (status === "PASS") {
    return "已完成";
  }
  if (status === "BLOCKED") {
    return "不可执行（依赖未完成）";
  }
  if (status === "FAIL" || status === "ERROR") {
    return "进行中";
  }
  return "未开始";
}

function isFinalNodeStatus(status: ExecutionNode["status"]): boolean {
  return status === "FINAL_PASS" || status === "FINAL_FAIL";
}

function normalizeSchedulerStatusToNormStatus(status: string | undefined): NormExecutionStatus {
  if (status === "pass") {
    return "pass";
  }
  if (status === "ready") {
    return "ready";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "failed") {
    return "fail";
  }
  return "blocked";
}

function roleLabel(role: string): string {
  if (role === "lab") {
    return "试验员";
  }
  if (role === "supervision") {
    return "监理";
  }
  return role;
}

function inferClauseFromSpuId(spuId: string | undefined): string {
  if (!spuId) {
    return "";
  }
  const matched = spuId.match(/(\d+(?:\.\d+){1,3})/);
  return matched?.[1] ?? "";
}

function inferRuleNameFromSpuId(spuId: string | undefined): string {
  const lowered = String(spuId ?? "").toLowerCase();
  if (lowered.includes("compaction")) {
    return "路基压实度";
  }
  if (lowered.includes("deflection")) {
    return "路基弯沉";
  }
  if (lowered.includes("thickness")) {
    return "路基厚度";
  }
  return "检测项";
}

function looksLikeTechnicalRuleId(value: string | undefined): boolean {
  const lowered = String(value ?? "").trim().toLowerCase();
  if (!lowered) {
    return false;
  }
  return lowered.includes("spuid") || lowered.includes("highway.") || /@v\d+/.test(lowered);
}

function resolveRuleNameForUi(
  definition: SPUDefinition | null | undefined,
  fallbackSpuId?: string,
): string {
  const rawName = String(definition?.meta.name ?? "").trim();
  if (rawName && !looksLikeTechnicalRuleId(rawName)) {
    return rawName;
  }
  return inferRuleNameFromSpuId(fallbackSpuId);
}

function resolveRuleClauseForUi(
  definition: SPUDefinition | null | undefined,
  fallbackSpuId?: string,
): string {
  const rawClause = String(definition?.meta.clause ?? "").trim();
  if (/^\d+(?:\.\d+){1,3}$/.test(rawClause)) {
    return rawClause;
  }
  return inferClauseFromSpuId(fallbackSpuId);
}

function formatRuleDisplayName(
  definition: SPUDefinition | null | undefined,
  fallbackSpuId?: string,
): string {
  const ruleName = resolveRuleNameForUi(definition, fallbackSpuId);
  const clause = resolveRuleClauseForUi(definition, fallbackSpuId);
  if (clause) {
    return `${ruleName} - 条款 ${clause}`;
  }
  return ruleName;
}

function formatRuleFileStem(definition: SPUDefinition | null | undefined, fallbackSpuId?: string): string {
  const ruleName = resolveRuleNameForUi(definition, fallbackSpuId);
  const clause = resolveRuleClauseForUi(definition, fallbackSpuId);
  const rawStem = clause ? `${ruleName}-条款${clause}` : ruleName;
  const sanitized = rawStem
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || "检测项";
}

function schedulerTaskLabel(spuId: string, registry: SPUDefinition[]): string {
  const definition = registry.find((item) => item.spuId === spuId);
  const measuredItem = String(definition?.meta.measuredItem ?? "").trim();
  if (measuredItem && !looksLikeTechnicalRuleId(measuredItem)) {
    return measuredItem;
  }
  const uiName = resolveRuleNameForUi(definition, spuId);
  if (uiName) {
    return uiName;
  }
  const lowered = spuId.toLowerCase();
  if (lowered.includes("compaction")) {
    return "压实度";
  }
  if (lowered.includes("deflection")) {
    return "弯沉";
  }
  if (lowered.includes("thickness")) {
    return "厚度";
  }
  return "检测项";
}

function schedulerActionLabel(action: string | undefined): string {
  if (action === "EXECUTE") {
    return "执行";
  }
  if (action === "RETRY_FAILED") {
    return "失败重试";
  }
  if (action === "ARCHIVE_READY") {
    return "可归档";
  }
  if (action === "WAIT") {
    return "等待";
  }
  return "-";
}

function projectSchedulerActionLabel(action: string | undefined): string {
  if (action === "PROJECT_EXECUTE") {
    return "执行";
  }
  if (action === "PROJECT_WAIT") {
    return "等待";
  }
  if (action === "PROJECT_BLOCKED") {
    return "受阻";
  }
  if (action === "PROJECT_COMPLETE") {
    return "全部完成";
  }
  return "-";
}

function schedulerDetailStatusLabel(status: string | undefined): string {
  if (status === "pass") {
    return "已完成";
  }
  if (status === "ready") {
    return "未开始";
  }
  if (status === "running") {
    return "进行中";
  }
  if (status === "failed") {
    return "进行中";
  }
  if (status === "blocked") {
    return "不可执行（依赖未完成）";
  }
  return status ?? "-";
}

function projectContainerStatusLabel(status: string | undefined): string {
  if (status === "running") {
    return "进行中";
  }
  if (status === "ready") {
    return "未开始";
  }
  if (status === "blocked") {
    return "不可执行（依赖未完成）";
  }
  if (status === "pass") {
    return "已完成";
  }
  return status ?? "-";
}

function buildNormSpecResults(
  normRef: NormRef,
  container: SpaceContainer | null,
  nodes: ExecutionNode[],
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const rule of normRef.specs) {
    const binding = container?.specBindings.find((item) => {
      if (item.spuId === rule.spuId) {
        return true;
      }
      const bindingSpuKey = String(item.spuKey || deriveSpuKeyFromSpuId(item.spuId)).trim();
      const ruleSpuKey = deriveSpuKeyFromSpuId(rule.spuId);
      if (bindingSpuKey && ruleSpuKey && bindingSpuKey === ruleSpuKey) {
        return true;
      }
      return isWorkflowSpuEquivalent(item.spuId, rule.spuId);
    }) ?? null;
    const attempts = nodes
      .filter((item) => item.spuId === rule.spuId || isWorkflowSpuEquivalent(item.spuId, rule.spuId))
      .sort((a, b) => b.attemptIndex - a.attemptIndex);
    const latestAttempt = attempts[0] ?? null;
    const hasActiveAttempt = latestAttempt ? !isFinalNodeStatus(latestAttempt.status) : false;

    if (binding?.status === "PASS") {
      result[rule.spuId] = {
        status: "pass",
        latestNodeId: binding.latestNodeId ?? null,
      };
      continue;
    }
    if (binding?.status === "FAIL") {
      result[rule.spuId] = {
        status: "fail",
        latestNodeId: binding.latestNodeId ?? null,
      };
      continue;
    }
    if (hasActiveAttempt) {
      result[rule.spuId] = {
        status: "running",
        latestNodeStatus: latestAttempt?.status ?? null,
        latestNodeId: latestAttempt?.nodeId ?? null,
      };
    }
  }
  return result;
}

type WorkflowStep = "spec-import" | "executor" | "runtime";

type WorkflowStepItem = {
  id: WorkflowStep;
  title: string;
  subtitle: string;
  module: AppModule;
};

type RuleStoreVersionOption = NormDocListItem;

type PegBotStructuredIntent = "check_compaction" | "check_thickness" | "check_deflection" | "check_quality";

type PegBotStructuredOutput = {
  intent: PegBotStructuredIntent;
  form_type: "subgrade.compaction" | "subgrade.thickness" | "subgrade.deflection" | "subgrade.quality";
  params: {
    location: string;
    compactionDegree?: number;
    measuredThickness?: number;
    measuredDeflection?: number;
  };
};

type PegBotExecutorRequest = {
  rule_id: string;
  inputs: Record<string, unknown>;
};

type PegBotExecutionResultView = {
  status: "PASS" | "FAIL";
  proofPath: string[];
  ruleVersion: string;
  executionId: string;
  proofId: string;
  proofHash: string;
};

type ExecutionRuleAuditBinding = {
  ruleId: string;
  ruleVersion: string;
  normdocId: string;
  standardLabel: string;
};

type ExecutionState = {
  hasSpec: boolean;
  hasContainer: boolean;
  hasBoundSPU: boolean;
  hasExecuted: boolean;
  allPassed: boolean;
};

type RuntimeSchedulerDecisionDetail = RuntimeContainerModelResponse["scheduler"]["decision"]["details"][number];

type WhitePageClosureStatus =
  | "未选择规范"
  | "已选择规范"
  | "已选择检测项"
  | "检测中"
  | "检测完成"
  | "已生成报告";

const WORKFLOW_STEPS: WorkflowStepItem[] = [
  { id: "spec-import", title: "Step 1: 选择规范版本", subtitle: "从 Rule Store 选择发布版本", module: "executor" },
  { id: "executor", title: "Step 2: 选择本次检测项", subtitle: "仅配置本次执行，不定义规则", module: "executor" },
  { id: "runtime", title: "Step 3: 验收报告（Runtime）", subtitle: "归档与验收结果", module: "runtime" },
];

function getWorkflowModule(step: WorkflowStep): AppModule {
  return WORKFLOW_STEPS.find((item) => item.id === step)?.module ?? "executor";
}

function WorkflowContainer({
  currentStep,
  setCurrentStep,
}: {
  currentStep: WorkflowStep;
  setCurrentStep: (step: WorkflowStep) => void;
}) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-semibold">主流程导航</h2>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
        {WORKFLOW_STEPS.map((step) => {
          const isActive = step.id === currentStep;
          return (
            <button
              key={step.id}
              className={`rounded-lg border px-3 py-3 text-left transition ${
                isActive ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
              }`}
              type="button"
              onClick={() => setCurrentStep(step.id)}
            >
              <p className="text-sm font-semibold">{step.title}</p>
              <p className={`mt-1 text-xs ${isActive ? "text-slate-200" : "text-slate-500"}`}>{step.subtitle}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TechDetailCollapse({
  expanded,
  onToggle,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">技术细节</h2>
        <button
          className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={onToggle}
        >
          {expanded ? "收起技术细节" : "展开技术细节"}
        </button>
      </div>
      {expanded ? <div className="mt-3 space-y-4">{children}</div> : null}
    </section>
  );
}

export default function SPUApp() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [registry, setRegistry] = useState<SPUDefinition[]>([]);
  const [slot, setSlot] = useState<SpaceSlot | null>(null);
  const [container, setContainer] = useState<SpaceContainer | null>(null);
  const [nodes, setNodes] = useState<ExecutionNode[]>([]);
  const [runtimeScheduler, setRuntimeScheduler] = useState<RuntimeContainerModelResponse["scheduler"] | null>(null);
  const [projectScheduler, setProjectScheduler] = useState<RuntimeProjectExecuteResponse | null>(null);
  const [schedulerApiWarning, setSchedulerApiWarning] = useState("");
  const [proof, setProof] = useState<ContainerProof | null>(null);
  const [auditEvents, setAuditEvents] = useState<Array<{ eventType: string; timestamp: string; payload: object; actor?: string }>>([]);
  const [importedBundles, setImportedBundles] = useState<ImportedBundleItem[]>([]);
  const [selectedSpuId, setSelectedSpuId] = useState<string>(TEMPLATE_SPU_IDS[0]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [batchRows, setBatchRows] = useState<FormPegBatchRow[]>([]);
  const [batchEvaluateResult, setBatchEvaluateResult] = useState<GateBatchEvaluateResponse | null>(null);
  const [offlineDraftSavedAt, setOfflineDraftSavedAt] = useState("");
  const [draftHydratedKey, setDraftHydratedKey] = useState("");
  const [latestGateProofFragment, setLatestGateProofFragment] = useState<ProofFragment | null>(null);
  const [latestGateStatePatch, setLatestGateStatePatch] = useState<GateEvaluateResponse["statePatch"] | null>(null);
  const [latestExecutionEvidence, setLatestExecutionEvidence] = useState<GateEvaluateResponse["evidence"] | null>(null);
  const [latestExecutionRuleBinding, setLatestExecutionRuleBinding] = useState<{ ruleId: string; ruleVersion: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [layerPegDocument, setLayerPegDocument] = useState<unknown>(null);
  const [layerPegDocumentLabel, setLayerPegDocumentLabel] = useState("");
  const [layerPegLoading, setLayerPegLoading] = useState(false);
  const [layerPegError, setLayerPegError] = useState("");
  const [layerPegLedgerItems, setLayerPegLedgerItems] = useState<LayerPegDocumentMeta[]>([]);
  const [componentCatalogs, setComponentCatalogs] = useState<ComponentCatalogSummary[]>([]);
  const [componentCatalogMarket, setComponentCatalogMarket] = useState<ComponentMarketplaceListing[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState("");
  const [catalogComponents, setCatalogComponents] = useState<ComponentCatalogComponent[]>([]);
  const [catalogAssets, setCatalogAssets] = useState<CatalogAssetItem[]>([]);
  const [catalogScope, setCatalogScope] = useState<"internal" | "public" | "all">("internal");
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [nlQuery, setNlQuery] = useState("K15+200 压实度合格吗？");
  const [nlQueryLoading, setNlQueryLoading] = useState(false);
  const [nlQueryError, setNlQueryError] = useState("");
  const [nlQueryResult, setNlQueryResult] = useState<Nl2GateQueryResponse | null>(null);
  const [nlConversationId, setNlConversationId] = useState("");
  const [pegBotStructuredOutput, setPegBotStructuredOutput] = useState<PegBotStructuredOutput | null>(null);
  const [pegBotExecutorRequest, setPegBotExecutorRequest] = useState<PegBotExecutorRequest | null>(null);
  const [pegBotExecutionResult, setPegBotExecutionResult] = useState<PegBotExecutionResultView | null>(null);
  const [pegBotPrefillSnapshot, setPegBotPrefillSnapshot] = useState<Array<{ field: string; value: string }>>([]);
  const [spuSelectorResult, setSpuSelectorResult] = useState<SpuSelectorResponse | null>(null);
  const [guideMessage, setGuideMessage] = useState("");
  const [activeGuideSpuId, setActiveGuideSpuId] = useState<string | null>(null);
  const [platformApiBaseInput, setPlatformApiBaseInput] = useState<string>(() => getPlatformApiBase());
  const [normrefApiBaseInput, setNormrefApiBaseInput] = useState<string>(() =>
    normalizeApiBase(readFromStorage(NORMREF_API_BASE_STORAGE_KEY) ?? DEFAULT_NORMREF_API_BASE, DEFAULT_NORMREF_API_BASE),
  );
  const [normrefToken, setNormrefToken] = useState("");
  const [normrefGatePayloadText, setNormrefGatePayloadText] = useState(DEFAULT_NORMREF_GATE_PAYLOAD_TEXT);
  const [normrefPathPayloadText, setNormrefPathPayloadText] = useState(DEFAULT_NORMREF_PATH_PAYLOAD_TEXT);
  const [normrefStatePayloadText, setNormrefStatePayloadText] = useState(DEFAULT_NORMREF_STATE_PAYLOAD_TEXT);
  const [normrefProofPayloadText, setNormrefProofPayloadText] = useState(DEFAULT_NORMREF_PROOF_PAYLOAD_TEXT);
  const [normrefMappingPayloadText, setNormrefMappingPayloadText] = useState(DEFAULT_NORMREF_MAPPING_PAYLOAD_TEXT);
  const [normrefImagePayloadText, setNormrefImagePayloadText] = useState(DEFAULT_NORMREF_IMAGE_PAYLOAD_TEXT);
  const [normrefVoicePayloadText, setNormrefVoicePayloadText] = useState(DEFAULT_NORMREF_VOICE_PAYLOAD_TEXT);
  const [normrefSpecPayloadText, setNormrefSpecPayloadText] = useState(DEFAULT_NORMREF_SPEC_PAYLOAD_TEXT);
  const [normrefFormPayloadText, setNormrefFormPayloadText] = useState(DEFAULT_NORMREF_FORM_PAYLOAD_TEXT);
  const [normrefReportPayloadText, setNormrefReportPayloadText] = useState(DEFAULT_NORMREF_REPORT_PAYLOAD_TEXT);
  const [normrefResponseMap, setNormrefResponseMap] = useState<Record<string, unknown>>({});
  const [normrefLoading, setNormrefLoading] = useState(false);
  const [normrefError, setNormrefError] = useState("");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<WorkflowStep>("spec-import");
  const [ruleStoreVersionOptions, setRuleStoreVersionOptions] = useState<RuleStoreVersionOption[]>([]);
  const [selectedRuleStoreVersionKey, setSelectedRuleStoreVersionKey] = useState("");
  const [ruleStorePackageOptions, setRuleStorePackageOptions] = useState<RuleStorePackageSummary[]>([]);
  const [selectedRuleStorePackageId, setSelectedRuleStorePackageId] = useState("");
  const [ruleStorePackageRules, setRuleStorePackageRules] = useState<RuleStorePackageRuleItem[]>([]);
  const [selectedRuleStoreNormdocDetail, setSelectedRuleStoreNormdocDetail] = useState<RuleStoreNormDocDetail | null>(null);
  const [ruleStorePackageLoading, setRuleStorePackageLoading] = useState(false);
  const [projectEffectiveVersion, setProjectEffectiveVersion] = useState<{
    source: "project_binding" | "latest";
    spuId: string;
    version: string;
  } | null>(null);
  const [projectEffectiveLoading, setProjectEffectiveLoading] = useState(false);
  const [versionControlProjectId, setVersionControlProjectId] = useState(DEFAULT_RULE_VERSION_PROJECT_ID);
  const [versionControlError, setVersionControlError] = useState("");
  const [normCompareOldSpecId, setNormCompareOldSpecId] = useState("JTG_F80_1_2017.4.2.1.compaction");
  const [normCompareNewSpecId, setNormCompareNewSpecId] = useState("JTG_F80_1_2017.4.2.2.deflection");
  const [normCompareOldSpecText, setNormCompareOldSpecText] = useState(
    JSON.stringify(DEFAULT_NORM_COMPARE_OLD_SPEC, null, 2),
  );
  const [normCompareNewSpecText, setNormCompareNewSpecText] = useState(
    JSON.stringify(DEFAULT_NORM_COMPARE_NEW_SPEC, null, 2),
  );
  const [normCompareResult, setNormCompareResult] = useState<NormVersionCompareResponse | null>(null);
  const [normCompareLoading, setNormCompareLoading] = useState(false);
  const [normCompareError, setNormCompareError] = useState("");
  const [ruleImpactSpecirId, setRuleImpactSpecirId] = useState(DEFAULT_RULE_IMPACT_SPECIR_ID);
  const [ruleImpactRuleId, setRuleImpactRuleId] = useState(DEFAULT_RULE_IMPACT_RULE_ID);
  const [ruleImpactGateId, setRuleImpactGateId] = useState(DEFAULT_RULE_IMPACT_GATE_ID);
  const [ruleImpactSlotKey, setRuleImpactSlotKey] = useState(DEFAULT_RULE_IMPACT_SLOT_KEY);
  const [ruleImpactResult, setRuleImpactResult] = useState<RuleImpactAnalysisResponse | null>(null);
  const [ruleImpactLoading, setRuleImpactLoading] = useState(false);
  const [ruleImpactError, setRuleImpactError] = useState("");
  const [goldenFormCode, setGoldenFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [goldenBaselineSchema, setGoldenBaselineSchema] = useState<Record<string, unknown> | null>(null);
  const [goldenBaselineRulepackText, setGoldenBaselineRulepackText] = useState(
    JSON.stringify(DEFAULT_GOLDEN_BASELINE_RULEPACK, null, 2),
  );
  const [goldenBaselineRuntimeText, setGoldenBaselineRuntimeText] = useState(
    JSON.stringify({ final_status: "PASS", gate_summary: "PASS" }, null, 2),
  );
  const [goldenBaselinePublishText, setGoldenBaselinePublishText] = useState(
    JSON.stringify({ version: "v1", published: true }, null, 2),
  );
  const [goldenCandidateRulepackText, setGoldenCandidateRulepackText] = useState(
    JSON.stringify(DEFAULT_GOLDEN_BASELINE_RULEPACK, null, 2),
  );
  const [goldenReport, setGoldenReport] = useState<GoldenRegressionReport | null>(null);
  const [goldenLoading, setGoldenLoading] = useState(false);
  const [goldenError, setGoldenError] = useState("");
  const [ruleTestFormCode, setRuleTestFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [ruleTestRulepackText, setRuleTestRulepackText] = useState(JSON.stringify(DEFAULT_GOLDEN_BASELINE_RULEPACK, null, 2));
  const [ruleTestThreshold, setRuleTestThreshold] = useState(String(DEFAULT_RULE_TEST_THRESHOLD));
  const [ruleTestReport, setRuleTestReport] = useState<RuleTestReport | null>(null);
  const [ruleTestLoading, setRuleTestLoading] = useState(false);
  const [ruleTestError, setRuleTestError] = useState("");
  const [runtimeMetricsFormCode, setRuntimeMetricsFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [runtimeMetricsRulepackVersion, setRuntimeMetricsRulepackVersion] = useState("");
  const [runtimeMetricsProjectId, setRuntimeMetricsProjectId] = useState("");
  const [runtimeObservabilitySchema, setRuntimeObservabilitySchema] = useState<Record<string, unknown> | null>(null);
  const [runtimeMetrics, setRuntimeMetrics] = useState<RuntimeMetricsResponse | null>(null);
  const [runtimeMetricsLoading, setRuntimeMetricsLoading] = useState(false);
  const [runtimeMetricsError, setRuntimeMetricsError] = useState("");
  const [heatmapStandard, setHeatmapStandard] = useState("");
  const [heatmapFormCode, setHeatmapFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [heatmapProject, setHeatmapProject] = useState("");
  const [ruleHeatmap, setRuleHeatmap] = useState<RuleHeatmapResponse | null>(null);
  const [ruleHeatmapLoading, setRuleHeatmapLoading] = useState(false);
  const [ruleHeatmapError, setRuleHeatmapError] = useState("");
  const [aiRepairFormCode, setAiRepairFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [aiRepairSourceClause, setAiRepairSourceClause] = useState(DEFAULT_AI_REPAIR_SOURCE_CLAUSE);
  const [aiRepairSpecirText, setAiRepairSpecirText] = useState(JSON.stringify({ spec_id: DEFAULT_GOLDEN_FORM_CODE }, null, 2));
  const [aiRepairUnresolvedReason, setAiRepairUnresolvedReason] = useState("threshold unresolved");
  const [aiRepairNearbyRulesText, setAiRepairNearbyRulesText] = useState(
    JSON.stringify([{ field: "compaction_degree", operator: ">=", threshold: 95, unit: "%", gate_logic: "AND" }], null, 2),
  );
  const [aiRepairSlotRegistryText, setAiRepairSlotRegistryText] = useState(
    JSON.stringify([{ slotKey: "compaction_degree", unit: "%", type: "number" }], null, 2),
  );
  const [aiRepairSchema, setAiRepairSchema] = useState<Record<string, unknown> | null>(null);
  const [aiRepairSuggestResult, setAiRepairSuggestResult] = useState<AIRepairSuggestResponse | null>(null);
  const [aiRepairQueue, setAiRepairQueue] = useState<Array<Record<string, unknown>>>([]);
  const [aiRepairSelectedPatchId, setAiRepairSelectedPatchId] = useState("");
  const [aiRepairManualEditText, setAiRepairManualEditText] = useState(JSON.stringify({}, null, 2));
  const [aiRepairLoading, setAiRepairLoading] = useState(false);
  const [aiRepairError, setAiRepairError] = useState("");
  const [fusionStandardsText, setFusionStandardsText] = useState(JSON.stringify(DEFAULT_FUSION_STANDARDS, null, 2));
  const [fusionResult, setFusionResult] = useState<MultiStandardFusionResponse | null>(null);
  const [fusionLoading, setFusionLoading] = useState(false);
  const [fusionError, setFusionError] = useState("");
  const [kgNodeType, setKgNodeType] = useState("");
  const [kgKeyword, setKgKeyword] = useState("");
  const [kgStartNodeId, setKgStartNodeId] = useState("slot:compaction_degree");
  const [kgSemanticQuery, setKgSemanticQuery] = useState("compaction");
  const [kgSlotKey, setKgSlotKey] = useState("compaction_degree");
  const [kgGraph, setKgGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [kgQueryResult, setKgQueryResult] = useState<Record<string, unknown> | null>(null);
  const [kgTraverseResult, setKgTraverseResult] = useState<Record<string, unknown> | null>(null);
  const [kgSemanticResult, setKgSemanticResult] = useState<Record<string, unknown> | null>(null);
  const [kgSlotUsageResult, setKgSlotUsageResult] = useState<Record<string, unknown> | null>(null);
  const [kgLoading, setKgLoading] = useState(false);
  const [kgError, setKgError] = useState("");
  const [semanticClauseText, setSemanticClauseText] = useState(DEFAULT_SEMANTIC_CLAUSE);
  const [semanticTableCellText, setSemanticTableCellText] = useState("压实度 | >=95% | T0921");
  const [semanticFormulaText, setSemanticFormulaText] = useState("compaction_degree >= 95");
  const [semanticNoteText, setSemanticNoteText] = useState("特殊工况需复核");
  const [semanticSchema, setSemanticSchema] = useState<Record<string, unknown> | null>(null);
  const [semanticParseResult, setSemanticParseResult] = useState<SemanticCoreParseResponse | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState("");
  const [slotRecFormCode, setSlotRecFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [slotRecClause, setSlotRecClause] = useState(DEFAULT_SEMANTIC_CLAUSE);
  const [slotRecSemanticType, setSlotRecSemanticType] = useState("threshold_constraint");
  const [slotRecNearbySlotsText, setSlotRecNearbySlotsText] = useState(
    JSON.stringify(DEFAULT_SLOT_NEARBY, null, 2),
  );
  const [slotRecHistoricalMappingsText, setSlotRecHistoricalMappingsText] = useState(
    JSON.stringify(DEFAULT_SLOT_HISTORICAL_MAPPINGS, null, 2),
  );
  const [slotRecBlueprintContextText, setSlotRecBlueprintContextText] = useState(
    JSON.stringify(DEFAULT_SLOT_BLUEPRINT_CONTEXT, null, 2),
  );
  const [slotRecResult, setSlotRecResult] = useState<SlotIntelligenceRecommendResponse | null>(null);
  const [slotRecQueueItems, setSlotRecQueueItems] = useState<Array<Record<string, unknown>>>([]);
  const [slotRecLoading, setSlotRecLoading] = useState(false);
  const [slotRecError, setSlotRecError] = useState("");
  const [constraintClauseText, setConstraintClauseText] = useState(DEFAULT_CONSTRAINT_CLAUSE);
  const [constraintSchema, setConstraintSchema] = useState<Record<string, unknown> | null>(null);
  const [constraintResult, setConstraintResult] = useState<ConstraintReasonerResponse | null>(null);
  const [constraintLoading, setConstraintLoading] = useState(false);
  const [constraintError, setConstraintError] = useState("");
  const [formulaClauseText, setFormulaClauseText] = useState(DEFAULT_FORMULA_EXPLAIN_CLAUSE);
  const [formulaText, setFormulaText] = useState(DEFAULT_FORMULA_EXPLAIN_FORMULA);
  const [formulaSchema, setFormulaSchema] = useState<Record<string, unknown> | null>(null);
  const [formulaResult, setFormulaResult] = useState<FormulaIntelligenceResponse | null>(null);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [formulaError, setFormulaError] = useState("");
  const [layoutDocType, setLayoutDocType] = useState<"pdf" | "word" | "scanned_image" | "screenshot">("pdf");
  const [layoutContentText, setLayoutContentText] = useState(DEFAULT_LAYOUT_SEMANTIC_TEXT);
  const [layoutSchema, setLayoutSchema] = useState<Record<string, unknown> | null>(null);
  const [layoutResult, setLayoutResult] = useState<LayoutSemanticResponse | null>(null);
  const [layoutLoading, setLayoutLoading] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [hitl2FormCode, setHitl2FormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [hitl2Confidence, setHitl2Confidence] = useState("0.86");
  const [hitl2ImpactScore, setHitl2ImpactScore] = useState("0.72");
  const [hitl2CandidateText, setHitl2CandidateText] = useState(JSON.stringify(DEFAULT_HITL2_CANDIDATE, null, 2));
  const [hitl2Governance, setHitl2Governance] = useState<Record<string, unknown> | null>(null);
  const [hitl2QueueItems, setHitl2QueueItems] = useState<HITL2QueueItem[]>([]);
  const [hitl2PatchId, setHitl2PatchId] = useState("");
  const [hitl2Reviewer, setHitl2Reviewer] = useState("reviewer_01");
  const [hitl2EditPayloadText, setHitl2EditPayloadText] = useState(JSON.stringify({}, null, 2));
  const [hitl2LearningLoop, setHitl2LearningLoop] = useState<Record<string, unknown> | null>(null);
  const [hitl2Loading, setHitl2Loading] = useState(false);
  const [hitl2Error, setHitl2Error] = useState("");
  const [aiPatchFormCode, setAiPatchFormCode] = useState(DEFAULT_GOLDEN_FORM_CODE);
  const [aiPatchReason, setAiPatchReason] = useState("unresolved threshold and gate condition");
  const [aiPatchNearbyRulesText, setAiPatchNearbyRulesText] = useState(JSON.stringify(DEFAULT_AI_PATCH_NEARBY_RULES, null, 2));
  const [aiPatchSlotGraphText, setAiPatchSlotGraphText] = useState(JSON.stringify({ nodes: [{ id: "compaction_degree" }] }, null, 2));
  const [aiPatchHistoricalFixesText, setAiPatchHistoricalFixesText] = useState(JSON.stringify(DEFAULT_AI_PATCH_NEARBY_RULES, null, 2));
  const [aiPatchSemanticContextText, setAiPatchSemanticContextText] = useState(JSON.stringify({ clause: "4.2.1", scene: "subgrade" }, null, 2));
  const [aiPatchSchema, setAiPatchSchema] = useState<Record<string, unknown> | null>(null);
  const [aiPatchSuggestResult, setAiPatchSuggestResult] = useState<Record<string, unknown> | null>(null);
  const [aiPatchListItems, setAiPatchListItems] = useState<Array<Record<string, unknown>>>([]);
  const [aiPatchSelectedId, setAiPatchSelectedId] = useState("");
  const [aiPatchEditPayloadText, setAiPatchEditPayloadText] = useState(JSON.stringify({}, null, 2));
  const [aiPatchLoading, setAiPatchLoading] = useState(false);
  const [aiPatchError, setAiPatchError] = useState("");
  const [projectScopeFiltersText, setProjectScopeFiltersText] = useState(
    JSON.stringify(DEFAULT_PROJECT_SCOPE_FILTERS, null, 2),
  );
  const [projectRoleBindingsText, setProjectRoleBindingsText] = useState(
    JSON.stringify(DEFAULT_PROJECT_ROLE_BINDINGS, null, 2),
  );
  const [projectInstrumentBindingsText, setProjectInstrumentBindingsText] = useState(
    JSON.stringify(DEFAULT_PROJECT_INSTRUMENT_BINDINGS, null, 2),
  );
  const [projectContextInfo, setProjectContextInfo] = useState<ProjectInfo | null>(null);
  const [projectContextLoading, setProjectContextLoading] = useState(false);
  const [projectContextError, setProjectContextError] = useState("");
  const [projectConfigAdvancedOpen, setProjectConfigAdvancedOpen] = useState(false);
  const [builderSubmitting, setBuilderSubmitting] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [builderMessage, setBuilderMessage] = useState("");
  const [builderError, setBuilderError] = useState("");
  const [pegBotError, setPegBotError] = useState("");
  const [showApiStartCommand, setShowApiStartCommand] = useState(false);
  const [isClauseSourceDialogOpen, setIsClauseSourceDialogOpen] = useState(false);
  const [clauseDialogLoading, setClauseDialogLoading] = useState(false);
  const [clauseDialogError, setClauseDialogError] = useState("");
  const [clauseDialogClause, setClauseDialogClause] = useState<ClauseSearchItem | null>(null);
  const [clauseDialogNeighbors, setClauseDialogNeighbors] = useState<{
    current: ClauseSearchItem | null;
    previous: ClauseSearchItem | null;
    next: ClauseSearchItem | null;
  } | null>(null);
  const [activeModule, setActiveModule] = useState<AppModule>(() =>
    typeof window === "undefined"
      ? DEFAULT_APP_MODULE
      : resolveVisibleModule(readModuleFromLocation(window.location), false),
  );
  const [activeDebugTopic, setActiveDebugTopic] = useState<DebugTopic>(() =>
    typeof window === "undefined" ? "overview" : readDebugTopicFromPathname(window.location.pathname),
  );
  const [platformApiUnavailableMessage, setPlatformApiUnavailableMessage] = useState("");
  const executionSectionRef = useRef<HTMLElement | null>(null);
  const launchParams = useMemo(() => readLaunchParams(), []);

  const hasAllTemplateSpus = useMemo(
    () => TEMPLATE_SPU_IDS.every((spuId) => registry.some((item) => item.spuId === spuId)),
    [registry],
  );

  const selectedSpu = useMemo(() => registry.find((item) => item.spuId === selectedSpuId) ?? null, [registry, selectedSpuId]);
  const formPegSchema = useMemo(() => (selectedSpu ? buildFormPegSchema(selectedSpu) : null), [selectedSpu]);
  const formPegPreview = useMemo(() => (selectedSpu ? buildFormPegPreview(selectedSpu, formValues) : null), [formValues, selectedSpu]);
  const formPegDraftStorageKey = useMemo(
    () => buildFormPegDraftStorageKey(container?.containerId ?? null, selectedSpuId),
    [container?.containerId, selectedSpuId],
  );
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) {
      return null;
    }
    return nodes.find((item) => item.nodeId === selectedNodeId) ?? null;
  }, [nodes, selectedNodeId]);
  const selectedSpuAttempts = useMemo(
    () =>
      nodes
        .filter((item) => item.spuId === selectedSpuId || isWorkflowSpuEquivalent(item.spuId, selectedSpuId))
        .sort((a, b) => b.attemptIndex - a.attemptIndex),
    [nodes, selectedSpuId],
  );
  const templateBindingBase = useMemo(
    () =>
      TEMPLATE_SPU_IDS.map((spuId) => {
        const definition = registry.find((item) => item.spuId === spuId) ?? null;
        const binding = container?.specBindings.find((item) => item.spuId === spuId) ?? null;
        const attempts = nodes
          .filter((item) => item.spuId === spuId)
          .sort((a, b) => a.attemptIndex - b.attemptIndex);
        return { spuId, definition, binding, attempts };
      }),
    [container, nodes, registry],
  );
  const normSpecResults = useMemo(() => {
    return buildNormSpecResults(SUBGRADE_NORMREF, container, nodes);
  }, [container, nodes]);
  const normExecutionState = useMemo(
    () => buildNormExecutionState(SUBGRADE_NORMREF, normSpecResults),
    [normSpecResults],
  );
  const templateBindings = useMemo(
    () =>
      templateBindingBase.map((item) => ({
        ...item,
        normStatus: normExecutionState[item.spuId] ?? "blocked",
        canExecute: canExecuteSpec(item.spuId, SUBGRADE_NORMREF, normExecutionState),
      })),
    [normExecutionState, templateBindingBase],
  );
  const selectedRuleStoreVersion = useMemo(
    () => ruleStoreVersionOptions.find((item) => item.key === selectedRuleStoreVersionKey) ?? null,
    [ruleStoreVersionOptions, selectedRuleStoreVersionKey],
  );
  const selectedRuleStoreNormdocId = useMemo(
    () => String(selectedRuleStoreVersion?.normdocId || selectedRuleStoreVersion?.id || selectedRuleStoreVersion?.key || "").trim(),
    [selectedRuleStoreVersion],
  );
  const selectedRuleStorePackage = useMemo(
    () => ruleStorePackageOptions.find((item) => item.packageId === selectedRuleStorePackageId) ?? null,
    [ruleStorePackageOptions, selectedRuleStorePackageId],
  );
  const selectedRuleStoreSpuKey = useMemo(
    () => selectedRuleStoreVersion?.sampleSpuKey ?? "",
    [selectedRuleStoreVersion],
  );
  const selectedRuleStoreItems = useMemo(() => {
    if (!selectedRuleStoreVersion) {
      return [] as SPUDefinition[];
    }
    const allowed = new Set(selectedRuleStoreVersion.spuIds);
    return registry.filter((item) => allowed.has(item.spuId));
  }, [registry, selectedRuleStoreVersion]);
  const normalizedVersionControlProjectId = useMemo(() => {
    const text = versionControlProjectId.trim();
    return text || DEFAULT_RULE_VERSION_PROJECT_ID;
  }, [versionControlProjectId]);
  const currentNormSourceSummary = useMemo(() => {
    if (!selectedRuleStoreVersion) {
      return {
        currentSpec: "-",
        source: "Rule Store（NormDoc 已发布）",
        projectCustomized: "否",
        updatedAt: "-",
      };
    }
    const standardLabel = normalizeStandardCodeLabel(selectedRuleStoreVersion.standardCode) || selectedRuleStoreVersion.standardCode;
    return {
      currentSpec: `${standardLabel} ${formatSpecVersionLabel(selectedRuleStoreVersion.version)}`,
      source: "Rule Store（NormDoc 已发布）",
      projectCustomized: selectedRuleStoreVersion.projectCustomized ? "是" : "否",
      updatedAt: selectedRuleStoreVersion.updatedAt !== "-" ? selectedRuleStoreVersion.updatedAt : selectedRuleStoreVersion.publishedAt,
    };
  }, [selectedRuleStoreVersion]);
  useEffect(() => {
    if (ruleStoreVersionOptions.length === 0) {
      if (selectedRuleStoreVersionKey) {
        setSelectedRuleStoreVersionKey("");
      }
      return;
    }
    if (selectedRuleStoreVersionKey && !ruleStoreVersionOptions.some((item) => item.key === selectedRuleStoreVersionKey)) {
      setSelectedRuleStoreVersionKey("");
    }
  }, [ruleStoreVersionOptions, selectedRuleStoreVersionKey]);
  useEffect(() => {
    if (!selectedRuleStoreVersionKey || !selectedRuleStoreNormdocId) {
      setRuleStorePackageOptions([]);
      setSelectedRuleStorePackageId("");
      setRuleStorePackageRules([]);
      setSelectedRuleStoreNormdocDetail(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await hydrateRuleStorePackageForNormdoc(selectedRuleStoreNormdocId, selectedRuleStoreVersionKey);
      } catch (reason) {
        if (cancelled) {
          return;
        }
        const message = reason instanceof Error ? reason.message : String(reason);
        setRuleStorePackageOptions([]);
        setSelectedRuleStorePackageId("");
        setRuleStorePackageRules([]);
        setVersionControlError(`读取规则包失败：${message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRuleStoreNormdocId, selectedRuleStoreVersionKey]);
  useEffect(() => {
    const containerProjectId = String(container?.projectId ?? "").trim();
    if (!containerProjectId) {
      return;
    }
    if (!versionControlProjectId.trim() || versionControlProjectId.trim() === DEFAULT_RULE_VERSION_PROJECT_ID) {
      setVersionControlProjectId(containerProjectId);
    }
  }, [container?.projectId, versionControlProjectId]);
  useEffect(() => {
    if (!selectedRuleStoreSpuKey) {
      setProjectEffectiveVersion(null);
      return;
    }
    const projectId = normalizedVersionControlProjectId;
    void refreshProjectEffectiveVersion(projectId, selectedRuleStoreSpuKey);
  }, [normalizedVersionControlProjectId, selectedRuleStoreSpuKey]);
  const selectedSpuKey = useMemo(() => deriveSpuKeyFromSpuId(selectedSpuId), [selectedSpuId]);
  const selectedBinding = useMemo(() => {
    if (!container) {
      return null;
    }
    const direct = container.specBindings.find((item) => item.spuId === selectedSpuId);
    if (direct) {
      return direct;
    }
    return container.specBindings.find((item) => {
      const bindingSpuKey = String(item.spuKey || deriveSpuKeyFromSpuId(item.spuId)).trim();
      return (bindingSpuKey.length > 0 && bindingSpuKey === selectedSpuKey)
        || isWorkflowSpuEquivalent(item.spuId, selectedSpuId);
    }) ?? null;
  }, [container, selectedSpuId, selectedSpuKey]);
  const currentExecutionRuleBinding = useMemo<ExecutionRuleAuditBinding | null>(() => {
    if (!selectedSpu || !selectedRuleStoreVersion) {
      return null;
    }
    if (!selectedRuleStoreVersion.spuIds.includes(selectedSpu.spuId)) {
      return null;
    }
    // Runtime execution must use the published Rule Store version.
    // Container binding version may be semantic (e.g. v1.0.0) and can drift from Rule Store labels (e.g. v1).
    const ruleVersion = String(selectedRuleStoreVersion.version || selectedBinding?.version || "").trim();
    if (!ruleVersion) {
      return null;
    }
    const normdocId = String(selectedRuleStoreVersion.normdocId || selectedRuleStoreVersion.id || selectedRuleStoreVersion.key || "").trim()
      || `${selectedRuleStoreVersion.standardCode}@@${selectedRuleStoreVersion.version}`;
    const standardLabel = normalizeStandardCodeLabel(selectedRuleStoreVersion.standardCode) || selectedRuleStoreVersion.standardCode;
    return {
      // Prefer container-bound spuId to keep runtime scheduling and execution target consistent.
      ruleId: selectedBinding?.spuId ?? selectedSpu.spuId,
      ruleVersion,
      normdocId,
      standardLabel,
    };
  }, [selectedBinding?.spuId, selectedBinding?.version, selectedRuleStoreVersion, selectedSpu]);
  const selectedTemplateSpuId = selectedBinding?.spuId ?? selectedSpuId;
  const selectedIsTemplateSpu = SUBGRADE_NORMREF.specs.some((item) => item.spuId === selectedTemplateSpuId);
  const selectedSchedulerDetail = useMemo(
    () => resolveSchedulerDetailBySpuIds(runtimeScheduler?.decision.details, [selectedSpuId, selectedBinding?.spuId]),
    [runtimeScheduler?.decision.details, selectedBinding?.spuId, selectedSpuId],
  );
  const hasActiveNode = nodes.some((item) => !isFinalNodeStatus(item.status));
  const selectedNormStatus: NormExecutionStatus = (() => {
    if (selectedSchedulerDetail) {
      return normalizeSchedulerStatusToNormStatus(selectedSchedulerDetail.status);
    }
    if (selectedIsTemplateSpu) {
      return normExecutionState[selectedTemplateSpuId] ?? "blocked";
    }
    if (!selectedBinding) {
      return "blocked";
    }
    if (selectedBinding.status === "PASS") {
      return "pass";
    }
    if (selectedBinding.status === "FAIL") {
      return "fail";
    }
    if (selectedBinding.status === "RUNNING") {
      return "running";
    }
    return "ready";
  })();
  const selectedCanExecute = selectedSchedulerDetail
    ? selectedSchedulerDetail.status === "ready" || selectedSchedulerDetail.status === "failed"
    : selectedIsTemplateSpu
    ? canExecuteSpec(selectedTemplateSpuId, SUBGRADE_NORMREF, normExecutionState)
    : Boolean(
        container
        && selectedSpu
        && selectedBinding
        && selectedBinding.status !== "PASS"
        && !hasActiveNode,
      );
  const isArchived = container?.lifecycleState === "ARCHIVED";
  const canArchive = !isArchived && (
    runtimeScheduler?.decision.action === "ARCHIVE_READY" || container?.lifecycleState === "VERIFIED"
  );
  const requiredSpuIds = container?.specBindings.map((binding) => binding.spuId) ?? [];
  const passedCount = requiredSpuIds.filter((spuId) => {
    const binding = container?.specBindings.find((item) => item.spuId === spuId);
    return binding?.status === "PASS";
  }).length;
  const nextPendingSpuId =
    getNextExecutableSpec(SUBGRADE_NORMREF, normExecutionState)
    ?? TEMPLATE_SPU_IDS.find((spuId) => normExecutionState[spuId] !== "pass")
    ?? TEMPLATE_SPU_IDS[0];
  const projectDecision = projectScheduler?.decision ?? {
    action: "PROJECT_WAIT",
    nextContainer: null,
    nextTask: null,
    summary: "暂无项目级调度结果",
    reason: "请先创建并刷新验收单元",
    containerDetails: [],
    taskDetails: [],
  };

  function setNormrefPayloadText(
    setter: (value: string | ((prev: string) => string)) => void,
    update: (payload: Record<string, unknown>) => Record<string, unknown>,
  ): void {
    setter((prev) => {
      let current: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(prev) as unknown;
        const record = toRecord(parsed);
        if (record) {
          current = record;
        }
      } catch {
        current = {};
      }
      return JSON.stringify(update(current), null, 2);
    });
  }

  function saveNormrefResponse(key: string, payload: unknown): void {
    setNormrefResponseMap((prev) => ({ ...prev, [key]: payload }));
  }

  function applyNormrefApiBase(): string {
    const normalized = normalizeApiBase(normrefApiBaseInput, DEFAULT_NORMREF_API_BASE);
    setNormrefApiBaseInput(normalized);
    writeToStorage(NORMREF_API_BASE_STORAGE_KEY, normalized);
    return normalized;
  }

  async function requestNormref(path: string, init?: RequestInit): Promise<unknown> {
    const base = applyNormrefApiBase();
    const headers = new Headers(init?.headers ?? {});
    if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const token = normrefToken.trim();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error(`无法连接 NormRef API（${base}），请确认 backend 服务已启动并允许跨域。`);
    }
    if (!response.ok) {
      throw new Error(await readHttpErrorMessage(response));
    }
    const raw = (await response.text()).trim();
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return { raw };
    }
  }

  async function callNormrefJsonEndpoint(key: string, path: string, payloadText: string): Promise<unknown> {
    const payload = parseJsonObjectText(payloadText, key);
    const data = await requestNormref(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    saveNormrefResponse(key, data);
    return data;
  }

  async function requestNormrefGateEvaluate(): Promise<Record<string, unknown>> {
    const data = (await callNormrefJsonEndpoint("gate_evaluate", "/api/v1/gate/evaluate", normrefGatePayloadText)) as unknown;
    const result = toRecord(data) ?? {};
    const proof = toRecord(result.proof);
    const proofId = typeof proof?.proofId === "string" ? proof.proofId : "";
    const proofHash = typeof proof?.hash === "string" ? proof.hash : "";
    if (proofId || proofHash) {
      setNormrefPayloadText(setNormrefProofPayloadText, (prev) => ({
        ...prev,
        proofId: proofId || prev.proofId || "",
        proofHash: proofHash || prev.proofHash || "",
      }));
    }
    const gatePayload = parseJsonObjectText(normrefGatePayloadText, "gate.payload");
    const context = toRecord(gatePayload.context);
    const vuri = typeof context?.vuri === "string" ? context.vuri : "";
    if (vuri) {
      setNormrefPayloadText(setNormrefStatePayloadText, (prev) => ({ ...prev, vuri }));
      setNormrefPayloadText(setNormrefMappingPayloadText, (prev) => ({ ...prev, vuri }));
    }
    return result;
  }

  async function requestNormrefPathExecute(): Promise<unknown> {
    return callNormrefJsonEndpoint("path_execute", "/api/v1/path/execute", normrefPathPayloadText);
  }

  async function requestNormrefStateTransition(): Promise<unknown> {
    return callNormrefJsonEndpoint("state_transition", "/api/v1/state/transition", normrefStatePayloadText);
  }

  async function requestNormrefProofVerify(): Promise<unknown> {
    return callNormrefJsonEndpoint("proof_verify", "/api/v1/proof/verify", normrefProofPayloadText);
  }

  async function requestNormrefMappingResolve(): Promise<unknown> {
    return callNormrefJsonEndpoint("mapping_resolve", "/api/v1/mapping/resolve", normrefMappingPayloadText);
  }

  async function requestNormrefImageRecognize(): Promise<unknown> {
    return callNormrefJsonEndpoint("image_recognize", "/api/v1/image/recognize", normrefImagePayloadText);
  }

  async function requestNormrefVoiceTranscribe(): Promise<unknown> {
    return callNormrefJsonEndpoint("voice_transcribe", "/api/v1/voice/transcribe", normrefVoicePayloadText);
  }

  async function requestNormrefSpecValidate(): Promise<unknown> {
    return callNormrefJsonEndpoint("spec_validate", "/api/v1/spec/validate", normrefSpecPayloadText);
  }

  async function requestNormrefFormRender(): Promise<unknown> {
    return callNormrefJsonEndpoint("form_render", "/api/v1/form/render", normrefFormPayloadText);
  }

  async function requestNormrefReportGenerate(): Promise<unknown> {
    return callNormrefJsonEndpoint("report_generate", "/api/v1/report/generate", normrefReportPayloadText);
  }

  async function runNormrefAction(action: () => Promise<unknown>): Promise<void> {
    setNormrefLoading(true);
    setNormrefError("");
    try {
      await action();
    } catch (reason) {
      setNormrefError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setNormrefLoading(false);
    }
  }

  async function requestProjectContextApi<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await fetch(`${PROJECT_CONTEXT_API_PREFIX}${path}`, {
        ...init,
        headers,
      });
    } catch {
      throw new Error("无法连接 /api/v1 项目接口，请先启动 backend 服务（默认 127.0.0.1:8091）。");
    }
    if (!response.ok) {
      const detail = await readHttpErrorMessage(response);
      if (response.status >= 500) {
        throw new Error(`项目后端接口异常（${response.status}）：${detail || "Internal Server Error"}。请确认 backend 已启动并查看 backend 日志。`);
      }
      throw new Error(detail);
    }
    return await response.json() as T;
  }

  function resolveProjectSelectedSpecs(): string[] {
    if (selectedRuleStoreVersion?.spuIds?.length) {
      return Array.from(
        new Set(
          selectedRuleStoreVersion.spuIds
            .map((item) => normalizeSpecIdForProjectApi(String(item ?? "").trim()))
            .filter((item) => item.length > 0),
        ),
      );
    }
    if (selectedRuleStoreItems.length > 0) {
      return Array.from(
        new Set(
          selectedRuleStoreItems
            .map((item) => normalizeSpecIdForProjectApi(String(item.spuId ?? "").trim()))
            .filter((item) => item.length > 0),
        ),
      );
    }
    if (ruleStoreVersionOptions.length > 0) {
      const fallback = ruleStoreVersionOptions[0];
      if (fallback?.spuIds?.length) {
        return Array.from(
          new Set(
            fallback.spuIds
              .map((item) => normalizeSpecIdForProjectApi(String(item ?? "").trim()))
              .filter((item) => item.length > 0),
          ),
        );
      }
    }
    return [];
  }

  async function handleCreateOrUpdateProjectContext(): Promise<ProjectInfo | null> {
    const projectId = normalizedVersionControlProjectId;
    if (!projectId) {
      setProjectContextError("project_id 不能为空。");
      return null;
    }
    let activeVersion = selectedRuleStoreVersion;
    if (!activeVersion && ruleStoreVersionOptions.length > 0) {
      activeVersion = ruleStoreVersionOptions[0];
      setSelectedRuleStoreVersionKey(activeVersion.key);
      setBuilderMessage(`未手动选择规范版本，已自动使用：${activeVersion.standardCode} ${activeVersion.version}`);
    }
    const selectedSpecs = resolveProjectSelectedSpecs();
    if (selectedSpecs.length === 0) {
      setProjectContextError("请先在 Rule Store 选择规范版本，再创建项目执行配置。");
      return null;
    }

    setProjectContextLoading(true);
    setProjectContextError("");
    try {
      const scope = parseJsonObjectText(projectScopeFiltersText, "scope_filters");
      const catalogId = normalizeCatalogIdForProjectApi(activeVersion?.standardCode || "JTG_F80_1_2017");
      const expandedSpecs = expandSpecIdsWithCatalogPrefix(selectedSpecs, catalogId);
      const primaryPayload = {
        project_id: projectId,
        catalog_id: catalogId,
        selected_specs: expandedSpecs,
        include_categories: normalizeStringArray(scope.include_categories),
        include_work_items: normalizeStringArray(scope.include_work_items),
        exclude_categories: normalizeStringArray(scope.exclude_categories),
        exclude_work_items: normalizeStringArray(scope.exclude_work_items),
      };

      let data: ProjectInfo;
      try {
        data = await requestProjectContextApi<ProjectInfo>("/api/v1/project/create", {
          method: "POST",
          body: JSON.stringify(primaryPayload),
        });
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : String(reason);
        // Compatibility fallback for older backend implementations that fail on scope filters.
        if (!message.includes("（500）")) {
          throw reason;
        }
        data = await requestProjectContextApi<ProjectInfo>("/api/v1/project/create", {
          method: "POST",
          body: JSON.stringify({
            project_id: projectId,
            catalog_id: catalogId,
            selected_specs: expandedSpecs,
          }),
        });
        setBuilderMessage("检测到后端兼容模式：已按精简参数创建项目配置（仅 selected_specs）。");
      }
      setProjectContextInfo(data);
      return data;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setProjectContextError(message);
      return null;
    } finally {
      setProjectContextLoading(false);
    }
  }

  async function handleLoadProjectContext(): Promise<void> {
    const projectId = normalizedVersionControlProjectId;
    if (!projectId) {
      setProjectContextError("project_id 不能为空。");
      return;
    }
    setProjectContextLoading(true);
    setProjectContextError("");
    try {
      const data = await requestProjectContextApi<ProjectInfo>(`/api/v1/project/${encodeURIComponent(projectId)}`);
      setProjectContextInfo(data);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setProjectContextError(message);
      setProjectContextInfo(null);
    } finally {
      setProjectContextLoading(false);
    }
  }

  async function handleSaveProjectRoleBindings(): Promise<void> {
    const projectId = normalizedVersionControlProjectId;
    if (!projectId) {
      setProjectContextError("project_id 不能为空。");
      return;
    }
    setProjectContextLoading(true);
    setProjectContextError("");
    try {
      const bindings = parseJsonArrayText(projectRoleBindingsText, "role_bindings");
      await requestProjectContextApi<Record<string, unknown>>("/api/v1/project/role-bindings", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          bindings,
        }),
      });
      await handleLoadProjectContext();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setProjectContextError(message);
    } finally {
      setProjectContextLoading(false);
    }
  }

  async function handleSaveProjectInstrumentBindings(): Promise<void> {
    const projectId = normalizedVersionControlProjectId;
    if (!projectId) {
      setProjectContextError("project_id 不能为空。");
      return;
    }
    setProjectContextLoading(true);
    setProjectContextError("");
    try {
      const bindings = parseJsonArrayText(projectInstrumentBindingsText, "instrument_bindings");
      await requestProjectContextApi<Record<string, unknown>>("/api/v1/project/instrument-bindings", {
        method: "POST",
        body: JSON.stringify({
          project_id: projectId,
          bindings,
        }),
      });
      await handleLoadProjectContext();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setProjectContextError(message);
    } finally {
      setProjectContextLoading(false);
    }
  }

  async function handleApplyPlatformApiBase(): Promise<void> {
    const normalized = setPlatformApiBase(platformApiBaseInput);
    setPlatformApiBaseInput(normalized);
    await refreshDashboard();
    await refreshRegistry();
    if (container) {
      await refreshContainerState(container.containerId);
    }
    setInfo(`平台 API 已切换并刷新：${normalized}`);
  }

  async function guarded<T>(job: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    setError("");
    try {
      const result = await job();
      setPlatformApiUnavailableMessage("");
      return result;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setInfo("");
      if (isPlatformApiUnavailableMessage(message)) {
        setPlatformApiUnavailableMessage(message);
      } else {
        setError(message);
      }
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadLayerPegDocument(
    loader: () => Promise<{ document: unknown }>,
    label: string,
  ): Promise<void> {
    setLayerPegLoading(true);
    setLayerPegError("");
    try {
      const response = await loader();
      setLayerPegDocument(response.document);
      setLayerPegDocumentLabel(label);
      setInfo(`已加载 LayerPeg 文档：${label}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setLayerPegError(message);
    } finally {
      setLayerPegLoading(false);
    }
  }

  async function handleLoadLayerPegSpec(): Promise<void> {
    if (!selectedSpuId) {
      setLayerPegError("请先选择规范，再读取 LayerPeg 规范文档。");
      return;
    }
    await loadLayerPegDocument(() => getLayerPegSpecDocument(selectedSpuId), `SPU ${selectedSpuId}`);
  }

  async function handleLoadLayerPegNode(): Promise<void> {
    if (!selectedNodeId) {
      setLayerPegError("请先选择执行节点，再读取 LayerPeg 节点文档。");
      return;
    }
    await loadLayerPegDocument(() => getLayerPegNodeDocument(selectedNodeId), `Node ${selectedNodeId}`);
  }

  async function handleLoadLayerPegContainerProof(): Promise<void> {
    if (!container?.containerId) {
      setLayerPegError("请先创建或加载容器，再读取 LayerPeg Proof 文档。");
      return;
    }
    await loadLayerPegDocument(
      () => getLayerPegContainerProofDocument(container.containerId),
      `Container ${container.containerId} Proof`,
    );
  }

  async function refreshLayerPegLedger(): Promise<void> {
    setLayerPegLoading(true);
    setLayerPegError("");
    try {
      const response = await getLayerPegDocuments();
      setLayerPegLedgerItems(response.items);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setLayerPegError(message);
    } finally {
      setLayerPegLoading(false);
    }
  }

  async function handleLoadLayerPegFromLedger(usi: string): Promise<void> {
    await loadLayerPegDocument(async () => {
      const response = await getLayerPegStoredDocument(usi);
      return { document: response.document };
    }, usi);
  }

  async function refreshComponentCatalogs(): Promise<void> {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const [catalogResp, marketResp, assetsResp] = await Promise.all([
        getComponentCatalogs(),
        getComponentMarketplaceListings(),
        browseCatalogAssets({
          scope: catalogScope,
          limit: 200,
        }),
      ]);
      setComponentCatalogs(catalogResp.items);
      setComponentCatalogMarket(marketResp.items);
      setCatalogAssets(assetsResp.items);
      setSelectedCatalogId((prev) => {
        if (prev && catalogResp.items.some((item) => item.catalogId === prev)) {
          return prev;
        }
        return catalogResp.items[0]?.catalogId ?? "";
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCatalogError(message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function runNormVersionCompareBySpecId(): Promise<void> {
    setNormCompareLoading(true);
    setNormCompareError("");
    try {
      const response = await compareNormVersions({
        old_spec_id: normCompareOldSpecId.trim(),
        new_spec_id: normCompareNewSpecId.trim(),
      });
      setNormCompareResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNormCompareError(message || "规范版本对比失败");
    } finally {
      setNormCompareLoading(false);
    }
  }

  async function runNormVersionCompareByRawSpec(): Promise<void> {
    setNormCompareLoading(true);
    setNormCompareError("");
    try {
      const oldSpec = parseJsonObjectText(normCompareOldSpecText, "old_spec");
      const newSpec = parseJsonObjectText(normCompareNewSpecText, "new_spec");
      const response = await compareNormVersions({
        old_spec: oldSpec,
        new_spec: newSpec,
      });
      setNormCompareResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setNormCompareError(message || "规范版本对比失败");
    } finally {
      setNormCompareLoading(false);
    }
  }

  async function runRuleImpactAnalysis(): Promise<void> {
    setRuleImpactLoading(true);
    setRuleImpactError("");
    try {
      const response = await analyzeRuleImpact({
        specir_id: ruleImpactSpecirId.trim(),
        rule_id: ruleImpactRuleId.trim(),
        gate_id: ruleImpactGateId.trim() || "default",
        slotKey: ruleImpactSlotKey.trim(),
      });
      setRuleImpactResult(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuleImpactError(message || "Rule Impact Analysis 执行失败");
    } finally {
      setRuleImpactLoading(false);
    }
  }

  async function loadGoldenBaselineSchema(): Promise<void> {
    setGoldenLoading(true);
    setGoldenError("");
    try {
      const response = await getGoldenBaselineSchema();
      setGoldenBaselineSchema((response?.schema ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGoldenError(message || "加载 baseline schema 失败");
    } finally {
      setGoldenLoading(false);
    }
  }

  async function saveGoldenBaseline(): Promise<void> {
    setGoldenLoading(true);
    setGoldenError("");
    try {
      await upsertGoldenBaseline({
        form_code: goldenFormCode.trim(),
        baseline_rulepack: parseJsonObjectText(goldenBaselineRulepackText, "baseline_rulepack"),
        baseline_runtime_result: parseJsonObjectText(goldenBaselineRuntimeText, "baseline_runtime_result"),
        baseline_publish_result: parseJsonObjectText(goldenBaselinePublishText, "baseline_publish_result"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGoldenError(message || "保存 baseline 失败");
    } finally {
      setGoldenLoading(false);
    }
  }

  async function runGoldenRegression(): Promise<void> {
    setGoldenLoading(true);
    setGoldenError("");
    try {
      const report = await runGoldenRegressionCheck({
        form_code: goldenFormCode.trim(),
        candidate_rulepack: parseJsonObjectText(goldenCandidateRulepackText, "candidate_rulepack"),
      });
      setGoldenReport(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGoldenError(message || "执行 golden 回归失败");
    } finally {
      setGoldenLoading(false);
    }
  }

  async function runRuleTesting(): Promise<void> {
    setRuleTestLoading(true);
    setRuleTestError("");
    try {
      const threshold = Number(ruleTestThreshold);
      const report = await runRuleTestFramework({
        form_code: ruleTestFormCode.trim(),
        rulepack: parseJsonObjectText(ruleTestRulepackText, "rulepack"),
        pass_rate_threshold: Number.isFinite(threshold) ? threshold : DEFAULT_RULE_TEST_THRESHOLD,
      });
      setRuleTestReport(report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuleTestError(message || "Rule Testing 执行失败");
    } finally {
      setRuleTestLoading(false);
    }
  }

  async function loadRuntimeObservabilitySchema(): Promise<void> {
    setRuntimeMetricsLoading(true);
    setRuntimeMetricsError("");
    try {
      const response = await getRuntimeObservabilitySchema();
      setRuntimeObservabilitySchema((response?.schema ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeMetricsError(message || "加载 observability schema 失败");
    } finally {
      setRuntimeMetricsLoading(false);
    }
  }

  async function loadRuntimeMetrics(): Promise<void> {
    setRuntimeMetricsLoading(true);
    setRuntimeMetricsError("");
    try {
      const response = await getRuntimeMetrics({
        form_code: runtimeMetricsFormCode.trim(),
        rulepack_version: runtimeMetricsRulepackVersion.trim(),
        project_id: runtimeMetricsProjectId.trim(),
      });
      setRuntimeMetrics(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeMetricsError(message || "加载 runtime metrics 失败");
    } finally {
      setRuntimeMetricsLoading(false);
    }
  }

  async function loadRuleHeatmap(): Promise<void> {
    setRuleHeatmapLoading(true);
    setRuleHeatmapError("");
    try {
      const response = await getRuleHeatmap({
        standard: heatmapStandard.trim(),
        form_code: heatmapFormCode.trim(),
        project: heatmapProject.trim(),
      });
      setRuleHeatmap(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuleHeatmapError(message || "加载 Rule Heatmap 失败");
    } finally {
      setRuleHeatmapLoading(false);
    }
  }

  async function loadAIRepairSchemaAndQueue(): Promise<void> {
    setAiRepairLoading(true);
    setAiRepairError("");
    try {
      const [schemaResp, queueResp] = await Promise.all([getAIRepairSchema(), getAIRepairReviewQueue()]);
      setAiRepairSchema((schemaResp?.schema ?? null) as Record<string, unknown> | null);
      const items = Array.isArray(queueResp?.items) ? queueResp.items : [];
      setAiRepairQueue(items);
      if (!aiRepairSelectedPatchId && items.length > 0) {
        const first = String(items[0]?.patch_id ?? "").trim();
        if (first) setAiRepairSelectedPatchId(first);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiRepairError(message || "加载 AI repair schema/queue 失败");
    } finally {
      setAiRepairLoading(false);
    }
  }

  async function runAIRepairSuggest(): Promise<void> {
    setAiRepairLoading(true);
    setAiRepairError("");
    try {
      const resp = await suggestAIRepair({
        form_code: aiRepairFormCode.trim(),
        source_clause: aiRepairSourceClause.trim(),
        specir: parseJsonObjectText(aiRepairSpecirText, "specir"),
        unresolved_reason: aiRepairUnresolvedReason.trim(),
        nearby_resolved_rules: parseJsonArrayText(aiRepairNearbyRulesText, "nearby_resolved_rules") as Array<Record<string, unknown>>,
        slot_registry: parseJsonArrayText(aiRepairSlotRegistryText, "slot_registry") as Array<Record<string, unknown>>,
      });
      setAiRepairSuggestResult(resp);
      const queueResp = await getAIRepairReviewQueue();
      const items = Array.isArray(queueResp?.items) ? queueResp.items : [];
      setAiRepairQueue(items);
      const patchId = String((resp.review_queue_item as Record<string, unknown> | undefined)?.patch_id ?? "").trim();
      if (patchId) setAiRepairSelectedPatchId(patchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiRepairError(message || "生成 AI 修复建议失败");
    } finally {
      setAiRepairLoading(false);
    }
  }

  async function runAIRepairAction(action: "accept_patch" | "reject_suggestion" | "manual_edit"): Promise<void> {
    setAiRepairLoading(true);
    setAiRepairError("");
    try {
      await runAIRepairReviewAction({
        patch_id: aiRepairSelectedPatchId.trim(),
        action,
        manual_edit: action === "manual_edit" ? parseJsonObjectText(aiRepairManualEditText, "manual_edit") : {},
      });
      const queueResp = await getAIRepairReviewQueue();
      setAiRepairQueue(Array.isArray(queueResp?.items) ? queueResp.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiRepairError(message || "执行 review action 失败");
    } finally {
      setAiRepairLoading(false);
    }
  }

  async function runFusionManifest(): Promise<void> {
    setFusionLoading(true);
    setFusionError("");
    try {
      const standards = parseJsonArrayText(fusionStandardsText, "standards") as Array<Record<string, unknown>>;
      const resp = await runMultiStandardFusion({ standards });
      setFusionResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFusionError(message || "执行 Multi-Standard Fusion 失败");
    } finally {
      setFusionLoading(false);
    }
  }

  async function runKnowledgeGraphBuild(): Promise<void> {
    setKgLoading(true);
    setKgError("");
    try {
      const resp = await buildKnowledgeGraph({ specs: [] });
      setKgGraph(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKgError(message || "构建知识图谱失败");
    } finally {
      setKgLoading(false);
    }
  }

  async function runKnowledgeGraphQuery(): Promise<void> {
    setKgLoading(true);
    setKgError("");
    try {
      const resp = await queryKnowledgeGraph({ node_type: kgNodeType.trim(), keyword: kgKeyword.trim() });
      setKgQueryResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKgError(message || "graph query 失败");
    } finally {
      setKgLoading(false);
    }
  }

  async function runKnowledgeGraphTraverse(): Promise<void> {
    setKgLoading(true);
    setKgError("");
    try {
      const resp = await traverseKnowledgeGraph({ start_node_id: kgStartNodeId.trim(), max_depth: 3 });
      setKgTraverseResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKgError(message || "impact traversal 失败");
    } finally {
      setKgLoading(false);
    }
  }

  async function runKnowledgeGraphSemanticSearch(): Promise<void> {
    setKgLoading(true);
    setKgError("");
    try {
      const resp = await semanticSearchKnowledgeGraph({ query: kgSemanticQuery.trim(), limit: 20 });
      setKgSemanticResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKgError(message || "semantic search 失败");
    } finally {
      setKgLoading(false);
    }
  }

  async function runKnowledgeGraphSlotUsage(): Promise<void> {
    setKgLoading(true);
    setKgError("");
    try {
      const resp = await getSlotUsageKnowledgeGraph(kgSlotKey.trim());
      setKgSlotUsageResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setKgError(message || "slot usage query 失败");
    } finally {
      setKgLoading(false);
    }
  }

  async function loadSemanticSchema(): Promise<void> {
    setSemanticLoading(true);
    setSemanticError("");
    try {
      const resp = await getSemanticCoreSchema();
      setSemanticSchema((resp?.schema ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSemanticError(message || "加载 semantic schema 失败");
    } finally {
      setSemanticLoading(false);
    }
  }

  async function runSemanticParse(): Promise<void> {
    setSemanticLoading(true);
    setSemanticError("");
    try {
      const resp = await parseSemanticCore({
        clause_text: semanticClauseText,
        table_cell: semanticTableCellText,
        formula: semanticFormulaText,
        note: semanticNoteText,
      });
      setSemanticParseResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSemanticError(message || "Semantic parse 失败");
    } finally {
      setSemanticLoading(false);
    }
  }

  async function runSlotRecommendation(): Promise<void> {
    setSlotRecLoading(true);
    setSlotRecError("");
    try {
      const resp = await recommendSlots({
        form_code: slotRecFormCode.trim(),
        clause: slotRecClause.trim(),
        semantic_type: slotRecSemanticType.trim(),
        nearby_slots: parseJsonArrayText(slotRecNearbySlotsText, "nearby_slots") as Array<Record<string, unknown>>,
        historical_mappings: parseJsonArrayText(slotRecHistoricalMappingsText, "historical_mappings") as Array<Record<string, unknown>>,
        blueprint_context: parseJsonObjectText(slotRecBlueprintContextText, "blueprint_context"),
      });
      setSlotRecResult(resp);
      const queueResp = await getSlotRecommendationReviewQueue();
      setSlotRecQueueItems(Array.isArray(queueResp?.items) ? queueResp.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSlotRecError(message || "Slot 推荐执行失败");
    } finally {
      setSlotRecLoading(false);
    }
  }

  async function loadSlotRecommendationQueue(): Promise<void> {
    setSlotRecLoading(true);
    setSlotRecError("");
    try {
      const resp = await getSlotRecommendationReviewQueue();
      setSlotRecQueueItems(Array.isArray(resp?.items) ? resp.items : []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSlotRecError(message || "加载复核队列失败");
    } finally {
      setSlotRecLoading(false);
    }
  }

  async function loadConstraintSchema(): Promise<void> {
    setConstraintLoading(true);
    setConstraintError("");
    try {
      const resp = await getConstraintReasonerSchema();
      setConstraintSchema((resp?.condition_schema ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConstraintError(message || "加载 condition schema 失败");
    } finally {
      setConstraintLoading(false);
    }
  }

  async function runConstraintReasoner(): Promise<void> {
    setConstraintLoading(true);
    setConstraintError("");
    try {
      const resp = await reasonConstraint({ clause: constraintClauseText.trim() });
      setConstraintResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConstraintError(message || "Constraint 推理失败");
    } finally {
      setConstraintLoading(false);
    }
  }

  async function loadFormulaSchema(): Promise<void> {
    setFormulaLoading(true);
    setFormulaError("");
    try {
      const resp = await getFormulaIntelligenceSchema();
      setFormulaSchema((resp ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFormulaError(message || "加载 formula schema 失败");
    } finally {
      setFormulaLoading(false);
    }
  }

  async function runFormulaIntelligence(): Promise<void> {
    setFormulaLoading(true);
    setFormulaError("");
    try {
      const resp = await parseFormulaIntelligence({
        clause: formulaClauseText.trim(),
        formula: formulaText.trim(),
      });
      setFormulaResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFormulaError(message || "Formula Intelligence 解析失败");
    } finally {
      setFormulaLoading(false);
    }
  }

  async function loadLayoutSemanticSchema(): Promise<void> {
    setLayoutLoading(true);
    setLayoutError("");
    try {
      const resp = await getLayoutSemanticSchema();
      setLayoutSchema((resp?.layout_schema ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLayoutError(message || "加载 layout schema 失败");
    } finally {
      setLayoutLoading(false);
    }
  }

  async function runLayoutSemanticAnalyze(): Promise<void> {
    setLayoutLoading(true);
    setLayoutError("");
    try {
      const resp = await analyzeLayoutSemantic({
        document_type: layoutDocType,
        content_text: layoutContentText,
      });
      setLayoutResult(resp);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLayoutError(message || "Layout Semantic 分析失败");
    } finally {
      setLayoutLoading(false);
    }
  }

  async function loadHITL2GovernanceAndQueue(): Promise<void> {
    setHitl2Loading(true);
    setHitl2Error("");
    try {
      const [govResp, queueResp, learnResp] = await Promise.all([
        getHITL2Governance(),
        getHITL2Queue(true),
        getHITL2LearningLoop(),
      ]);
      setHitl2Governance((govResp?.confidence_governance ?? null) as Record<string, unknown> | null);
      const items = Array.isArray(queueResp?.items) ? queueResp.items : [];
      items.sort((a, b) => {
        const confidenceDiff = Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0);
        if (Math.abs(confidenceDiff) > 1e-9) return confidenceDiff;
        const impactDiff = Number(b?.impact_score ?? 0) - Number(a?.impact_score ?? 0);
        if (Math.abs(impactDiff) > 1e-9) return impactDiff;
        return String(b?.created_at ?? "").localeCompare(String(a?.created_at ?? ""));
      });
      setHitl2QueueItems(items);
      if (!hitl2PatchId && items.length > 0) {
        const first = String(items[0]?.patch_id ?? "").trim();
        if (first) setHitl2PatchId(first);
      }
      setHitl2LearningLoop((learnResp?.ai_learning_loop ?? null) as Record<string, unknown> | null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHitl2Error(message || "加载 HITL2 数据失败");
    } finally {
      setHitl2Loading(false);
    }
  }

  async function enqueueHITL2ReviewCandidate(): Promise<void> {
    setHitl2Loading(true);
    setHitl2Error("");
    try {
      const confidence = Number(hitl2Confidence);
      const impactScore = Number(hitl2ImpactScore);
      await enqueueHITL2Candidate({
        form_code: hitl2FormCode.trim(),
        source: "manual_enqueue",
        candidate: parseJsonObjectText(hitl2CandidateText, "candidate"),
        confidence: Number.isFinite(confidence) ? confidence : 0.8,
        impact_score: Number.isFinite(impactScore) ? impactScore : 0.5,
      });
      await loadHITL2GovernanceAndQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHitl2Error(message || "入队失败");
    } finally {
      setHitl2Loading(false);
    }
  }

  async function runHITL2ReviewerAction(action: "accept" | "edit" | "reject"): Promise<void> {
    setHitl2Loading(true);
    setHitl2Error("");
    try {
      const resp = await runHITL2Action({
        patch_id: hitl2PatchId.trim(),
        action,
        edit_payload: action === "edit" ? parseJsonObjectText(hitl2EditPayloadText, "edit_payload") : {},
        reviewer: hitl2Reviewer.trim(),
      });
      setHitl2LearningLoop((resp?.ai_learning_loop ?? null) as Record<string, unknown> | null);
      await loadHITL2GovernanceAndQueue();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setHitl2Error(message || "review action 执行失败");
    } finally {
      setHitl2Loading(false);
    }
  }

  async function loadAIPatchCenter(): Promise<void> {
    setAiPatchLoading(true);
    setAiPatchError("");
    try {
      const [schemaResp, listResp] = await Promise.all([getAIPatchSchema(), listAIPatches()]);
      setAiPatchSchema((schemaResp?.patch_schema ?? null) as Record<string, unknown> | null);
      const items = Array.isArray(listResp?.items) ? listResp.items : [];
      setAiPatchListItems(items);
      if (!aiPatchSelectedId && items.length > 0) {
        const first = String(items[0]?.patch_id ?? "").trim();
        if (first) setAiPatchSelectedId(first);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiPatchError(message || "加载 AI Patch Center 失败");
    } finally {
      setAiPatchLoading(false);
    }
  }

  async function runSuggestAIPatch(): Promise<void> {
    setAiPatchLoading(true);
    setAiPatchError("");
    try {
      const resp = await suggestAIPatch({
        form_code: aiPatchFormCode.trim(),
        unresolved_reason: aiPatchReason.trim(),
        nearby_rules: parseJsonArrayText(aiPatchNearbyRulesText, "nearby_rules") as Array<Record<string, unknown>>,
        slot_graph: parseJsonObjectText(aiPatchSlotGraphText, "slot_graph"),
        historical_fixes: parseJsonArrayText(aiPatchHistoricalFixesText, "historical_fixes") as Array<Record<string, unknown>>,
        semantic_context: parseJsonObjectText(aiPatchSemanticContextText, "semantic_context"),
      });
      setAiPatchSuggestResult((resp ?? null) as Record<string, unknown> | null);
      await loadAIPatchCenter();
      const patchId = String((resp.patch_record as Record<string, unknown> | undefined)?.patch_id ?? "").trim();
      if (patchId) setAiPatchSelectedId(patchId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiPatchError(message || "生成 AI patch 失败");
    } finally {
      setAiPatchLoading(false);
    }
  }

  async function runAIPatchReview(action: "accept" | "edit" | "reject"): Promise<void> {
    setAiPatchLoading(true);
    setAiPatchError("");
    try {
      await reviewAIPatch({
        patch_id: aiPatchSelectedId.trim(),
        action,
        edit_payload: action === "edit" ? parseJsonObjectText(aiPatchEditPayloadText, "edit_payload") : {},
      });
      await loadAIPatchCenter();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiPatchError(message || "patch review 失败");
    } finally {
      setAiPatchLoading(false);
    }
  }

  async function runAIPatchRevert(): Promise<void> {
    setAiPatchLoading(true);
    setAiPatchError("");
    try {
      await revertAIPatch({ patch_id: aiPatchSelectedId.trim() });
      await loadAIPatchCenter();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiPatchError(message || "patch revert 失败");
    } finally {
      setAiPatchLoading(false);
    }
  }

  async function handleSearchCatalogAssets(): Promise<void> {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const query = catalogSearchQuery.trim();
      if (!query) {
        const response = await browseCatalogAssets({
          scope: catalogScope,
          limit: 200,
        });
        setCatalogAssets(response.items);
        return;
      }
      const response = await searchCatalogAssets(query, {
        scope: catalogScope,
        limit: 200,
      });
      setCatalogAssets(response.items);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCatalogError(message);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function refreshCatalogComponents(catalogId: string): Promise<void> {
    if (!catalogId) {
      setCatalogComponents([]);
      return;
    }
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const response = await getComponentCatalogComponents(catalogId);
      setCatalogComponents(response.items);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setCatalogError(message);
    } finally {
      setCatalogLoading(false);
    }
  }

  function buildSpuSelectorInputSnapshot(): Record<string, unknown> {
    const snapshot: Record<string, unknown> = {};
    if (selectedNode?.inputs) {
      Object.assign(snapshot, selectedNode.inputs);
    }
    for (const [key, raw] of Object.entries(formValues)) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const numeric = Number(trimmed);
      snapshot[key] = Number.isFinite(numeric) ? numeric : trimmed;
    }
    return snapshot;
  }

  async function refreshSpuSelectorCandidates(autoApply = false): Promise<void> {
    if (registry.length === 0) {
      setSpuSelectorResult(null);
      return;
    }
    const selectedBound = Boolean(container?.specBindings.some((item) => item.spuId === selectedSpuId));
    const response = await guarded(() =>
      selectSpuCandidates({
        intent: "gate.evaluate",
        projectContext: {
          projectId: container?.projectId ?? null,
          preferredCategory: selectedSpu?.meta.category ?? null,
          preferredClause: selectedSpu?.meta.clause ?? null,
        },
        containerMetadata: {
          containerId: container?.containerId ?? null,
          projectId: container?.projectId ?? null,
          boundSpuIds: container?.specBindings.map((item) => item.spuId) ?? [],
          currentSpuId: container?.runtime.currentSpuId ?? null,
          nodeType: "executor",
        },
        nodeMetadata: {
          nodeId: selectedNode?.nodeId ?? null,
          spuId: selectedNode?.spuId ?? null,
          nodeType: "execution-node",
        },
        hints: {
          spuId: selectedNode?.spuId ?? null,
          category: selectedSpu?.meta.category ?? null,
          clause: selectedSpu?.meta.clause ?? null,
          measuredItem: selectedSpu?.meta.measuredItem ?? null,
        },
        inputs: buildSpuSelectorInputSnapshot(),
        limit: 5,
      }),
    );
    if (!response) {
      return;
    }
    setSpuSelectorResult(response);
    if (!autoApply || !response.selectedSpuId) {
      return;
    }
    const recommended = response.selectedSpuId;
    const recommendedExists = registry.some((item) => item.spuId === recommended);
    if (!recommendedExists) {
      return;
    }
    const currentExists = registry.some((item) => item.spuId === selectedSpuId);
    const recommendedBound = Boolean(container?.specBindings.some((item) => item.spuId === recommended));
    if (!currentExists || (!selectedBound && recommendedBound)) {
      setSelectedSpuId(recommended);
      setActiveGuideSpuId(recommended);
    }
  }

  async function runNl2GateQueryEntry(
    queryText: string,
    options: {
      mode?: "preview" | "evaluate";
      execute?: boolean;
      context?: Record<string, unknown>;
    } = {},
  ): Promise<Nl2GateQueryResponse | null> {
    const normalizedQuery = queryText.trim();
    if (!normalizedQuery) {
      setNlQueryError("请输入检测问题。");
      return null;
    }
    setNlQueryLoading(true);
    setNlQueryError("");
    try {
      const response = await queryNl2Gate(normalizedQuery, {
        mode: options.mode,
        execute: options.execute,
        context: options.context,
        conversationId: nlConversationId || undefined,
      });
      setNlQueryResult(response);
      const responseConversationId = response.structured.conversation?.conversationId ?? "";
      if (!responseConversationId) {
        setNlConversationId("");
      } else if (response.success && response.structured.conversation?.pendingIntent === null) {
        setNlConversationId("");
      } else {
        setNlConversationId(responseConversationId);
      }
      setSpuSelectorResult({
        intent: response.structured.intent ?? response.command?.intent ?? "gate.preview",
        selectedSpuId: response.structured.target.spuId,
        rankedCandidates: response.structured.spuCandidates,
      });
      if (response.structured.target.spuId) {
        setSelectedSpuId(response.structured.target.spuId);
        setActiveGuideSpuId(response.structured.target.spuId);
      }
      if (!response.success) {
        setNlQueryError(response.error || response.answer);
      }
      return response;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setNlQueryError(message);
      return null;
    } finally {
      setNlQueryLoading(false);
    }
  }

  async function handleRunNl2GateQuery(): Promise<void> {
    await runNl2GateQueryEntry(nlQuery);
  }

  async function refreshDashboard(): Promise<void> {
    const data = await guarded(() => getDashboard());
    if (data) {
      setDashboard(data);
    }
  }

  async function handleRetryPlatformApiHealth(): Promise<void> {
    const data = await guarded(() => getDashboard());
    if (!data) {
      return;
    }
    setDashboard(data);
    setPlatformApiUnavailableMessage("");
    setInfo("平台 API 已恢复连接。");
  }

  async function refreshRuleStoreVersionOptions(): Promise<void> {
    const data = await guarded(() => listRuleStoreNormdocs());
    if (!data) {
      return;
    }
    const publishedOnly = (Array.isArray(data.items) ? data.items : []).filter((item) => {
      const status = String(item.status ?? "").trim().toLowerCase();
      return status === "published" || item.published === true;
    });
    setRuleStoreVersionOptions(publishedOnly);
    setRuleStorePackageOptions([]);
    setSelectedRuleStorePackageId("");
    setRuleStorePackageRules([]);
    setSelectedRuleStoreNormdocDetail(null);
  }

  async function hydrateRuleStorePackageForNormdoc(normdocId: string, optionKey: string): Promise<void> {
    const normalizedNormdocId = normdocId.trim();
    if (!normalizedNormdocId) {
      setRuleStorePackageOptions([]);
      setSelectedRuleStorePackageId("");
      setRuleStorePackageRules([]);
      setSelectedRuleStoreNormdocDetail(null);
      return;
    }
    setRuleStorePackageLoading(true);
    try {
      const detailResponse = await getRuleStoreNormdocDetail(normalizedNormdocId);
      setSelectedRuleStoreNormdocDetail(detailResponse);
      const packageResponse = await listRuleStorePackages({ normdocId: normalizedNormdocId });
      const sortedPackages = [...packageResponse.items].sort((a, b) => b.version.localeCompare(a.version, "en"));
      setRuleStorePackageOptions(sortedPackages);
      const preferredPackage = sortedPackages[0] ?? null;
      setSelectedRuleStorePackageId(preferredPackage?.packageId ?? "");
      if (!preferredPackage) {
        setRuleStorePackageRules([]);
        setRuleStoreVersionOptions((prev) =>
          prev.map((item) => (
            item.key === optionKey
              ? {
                  ...item,
                  packageId: undefined,
                  availableItemCount: 0,
                  spuIds: [],
                  sampleSpuId: "",
                  sampleSpuKey: "",
                }
              : item
          )),
        );
        return;
      }
      const ruleResponse = await listRuleStorePackageRules(preferredPackage.packageId);
      setRuleStorePackageRules(ruleResponse.items);
      const enabledRuleIds = ruleResponse.items
        .filter((item) => item.enabled)
        .map((item) => item.ruleId)
        .filter(Boolean);
      const sampleSpuId = enabledRuleIds[0] ?? "";
      setRuleStoreVersionOptions((prev) =>
        prev.map((item) => (
          item.key === optionKey
              ? {
                ...item,
                packageId: preferredPackage.packageId,
                availableItemCount: enabledRuleIds.length,
                spuIds: enabledRuleIds,
                sampleSpuId,
                sampleSpuKey: deriveSpuKeyFromSpuId(sampleSpuId),
                updatedAt: preferredPackage.version || item.updatedAt,
              }
            : item
        )),
      );
    } finally {
      setRuleStorePackageLoading(false);
    }
  }

  async function refreshRegistry(): Promise<void> {
    const data = await guarded(() => getNormRegistry());
    if (data) {
      setRegistry(data.items);
      setImportedBundles((prev) =>
        prev.map((item) => ({
          ...item,
          registered: data.items.some((spu) => spu.spuId === item.specId),
        })),
      );
      const exists = data.items.some((item) => item.spuId === selectedSpuId);
      if (!exists) {
        const preferred = TEMPLATE_SPU_IDS.find((spuId) => data.items.some((item) => item.spuId === spuId));
        setSelectedSpuId(preferred ?? data.items[0]?.spuId ?? "");
      }
      await refreshComponentCatalogs();
    }
    await refreshRuleStoreVersionOptions();
  }

  async function refreshContainerState(containerId: string): Promise<{
    container: SpaceContainer;
    nodes: ExecutionNode[];
    runtimeScheduler: RuntimeContainerModelResponse["scheduler"] | null;
    projectScheduler: RuntimeProjectExecuteResponse | null;
  } | null> {
    const data = await guarded(() => getContainer(containerId));
    if (!data) {
      return null;
    }
    let runtimeSchedulerSnapshot: RuntimeContainerModelResponse["scheduler"] | null = null;
    let projectSchedulerSnapshot: RuntimeProjectExecuteResponse | null = null;
    setSchedulerApiWarning("");
    setContainer(data.container);
    setNodes(data.nodes);
    if (data.container.lifecycleState === "ARCHIVED") {
      const proofResp = await guarded(() => getContainerProof(containerId));
      if (proofResp) {
        setProof(proofResp.proof);
      }
    } else {
      setProof(null);
    }
    const audit = await guarded(() => getContainerAudit(containerId));
    if (audit) {
      setAuditEvents(audit.items);
    }
    try {
      const runtimeModel = await getRuntimeContainerModel(containerId);
      runtimeSchedulerSnapshot = runtimeModel.scheduler;
      setRuntimeScheduler(runtimeModel.scheduler);
    } catch (reason) {
      runtimeSchedulerSnapshot = null;
      setRuntimeScheduler(null);
      const message = reason instanceof Error ? reason.message : String(reason);
      setSchedulerApiWarning(`单验收单元运行时调度接口异常：${message}`);
    }
    try {
      const project = await projectExecute();
      projectSchedulerSnapshot = project;
      setProjectScheduler(project);
    } catch (reason) {
      projectSchedulerSnapshot = null;
      setProjectScheduler(null);
      const message = reason instanceof Error ? reason.message : String(reason);
      setSchedulerApiWarning((prev) => `${prev ? `${prev} | ` : ""}项目级运行时调度接口异常：${message}`);
    }
    return {
      container: data.container,
      nodes: data.nodes,
      runtimeScheduler: runtimeSchedulerSnapshot,
      projectScheduler: projectSchedulerSnapshot,
    };
  }

  useEffect(() => {
    void (async () => {
      await refreshDashboard();
      await refreshRegistry();
      await refreshLayerPegLedger();
      if (launchParams?.spuId) {
        setSelectedSpuId(launchParams.spuId);
        setActiveGuideSpuId(launchParams.spuId);
      }
      if (launchParams?.containerId) {
        await refreshContainerState(launchParams.containerId);
        setInfo(`已自动载入验收单元：${launchParams.containerId}`);
      }
      if (launchParams?.source === "normref-bot") {
        setGuideMessage("已从 bot.normref 自动进入执行界面，请检查输入后执行。");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedCatalogId) {
      setCatalogComponents([]);
      return;
    }
    void refreshCatalogComponents(selectedCatalogId);
  }, [selectedCatalogId]);

  useEffect(() => {
    void refreshComponentCatalogs();
  }, [catalogScope]);

  useEffect(() => {
    if (!selectedSpu) {
      return;
    }
    setLatestGateProofFragment(null);
    setLatestGateStatePatch(null);
    setBatchEvaluateResult(null);
    setFormValues(buildInitialFormValues(selectedSpu));
    setBatchRows([createFormPegBatchRow(selectedSpu, 0)]);
  }, [selectedSpu]);

  useEffect(() => {
    if (!selectedSpu) {
      setDraftHydratedKey("");
      return;
    }
    setDraftHydratedKey("");
    const draft = readFormPegDraft(formPegDraftStorageKey);
    if (!draft) {
      setOfflineDraftSavedAt("");
      setDraftHydratedKey(formPegDraftStorageKey);
      return;
    }
    setFormValues(sanitizeDraftFormValues(selectedSpu, draft.formValues));
    const draftRows = sanitizeDraftBatchRows(selectedSpu, draft.batchRows);
    setBatchRows(draftRows.length > 0 ? draftRows : [createFormPegBatchRow(selectedSpu, 0)]);
    setOfflineDraftSavedAt(typeof draft.savedAt === "string" ? draft.savedAt : "");
    setDraftHydratedKey(formPegDraftStorageKey);
  }, [formPegDraftStorageKey, selectedSpu]);

  useEffect(() => {
    if (!selectedSpu || draftHydratedKey !== formPegDraftStorageKey) {
      return;
    }
    const payload: FormPegDraftPayload = {
      version: 1,
      savedAt: new Date().toISOString(),
      formValues: sanitizeDraftFormValues(selectedSpu, formValues),
      batchRows: batchRows.map((row) => ({
        rowId: row.rowId,
        pointLabel: row.pointLabel,
        values: sanitizeDraftFormValues(selectedSpu, row.values),
      })),
    };
    writeToStorage(formPegDraftStorageKey, JSON.stringify(payload));
    setOfflineDraftSavedAt(payload.savedAt);
  }, [batchRows, draftHydratedKey, formPegDraftStorageKey, formValues, selectedSpu]);

  useEffect(() => {
    if (selectedSpuAttempts.length === 0) {
      setSelectedNodeId("");
      return;
    }
    const stillValid = selectedSpuAttempts.some((node) => node.nodeId === selectedNodeId);
    if (!stillValid) {
      setSelectedNodeId(selectedSpuAttempts[0].nodeId);
    }
  }, [selectedNodeId, selectedSpuAttempts]);

  useEffect(() => {
    void refreshSpuSelectorCandidates(true);
  }, [registry, container?.containerId, container?.projectId, selectedNodeId, selectedSpuId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncModuleFromLocation = () => {
      const rawModule = readModuleFromLocation(window.location);
      const normalizedModule = resolveVisibleModule(rawModule, showTechnicalDetails);
      const rawDebugTopic = readDebugTopicFromPathname(window.location.pathname);
      const normalizedDebugTopic: DebugTopic =
        normalizedModule === "debug" && showTechnicalDetails ? rawDebugTopic : "overview";
      setActiveModule((prev) => (prev === normalizedModule ? prev : normalizedModule));
      setActiveDebugTopic((prev) => (prev === normalizedDebugTopic ? prev : normalizedDebugTopic));
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetUrl = toModuleSubPathUrl(
        normalizedModule,
        normalizedModule === "debug" && normalizedDebugTopic === DEBUG_TOPIC_NL2GATE ? DEBUG_TOPIC_NL2GATE : null,
        window.location,
      );
      if (targetUrl !== currentUrl) {
        writeModuleSubPathToLocation(
          normalizedModule,
          normalizedModule === "debug" && normalizedDebugTopic === DEBUG_TOPIC_NL2GATE ? DEBUG_TOPIC_NL2GATE : null,
          true,
        );
      }
    };

    syncModuleFromLocation();

    const handlePopState = () => {
      syncModuleFromLocation();
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [showTechnicalDetails]);

  useEffect(() => {
    writeToStorage(PRODUCT_TECHNICAL_DETAILS_STORAGE_KEY, showTechnicalDetails ? "1" : "0");
  }, [showTechnicalDetails]);

  function handleOpenNl2GateTopic(): void {
    if (!showTechnicalDetails) {
      setShowTechnicalDetails(true);
    }
    setActiveModule("debug");
    setActiveDebugTopic(DEBUG_TOPIC_NL2GATE);
    writeModuleSubPathToLocation("debug", DEBUG_TOPIC_NL2GATE);
  }

  function handleOpenDebugOverview(): void {
    setActiveModule("debug");
    setActiveDebugTopic("overview");
    writeModuleSubPathToLocation("debug", null);
  }

  async function handleImportSlot(): Promise<void> {
    const response = await guarded(() => importSlot({ ...FIXED_SLOT_PAYLOAD }));
    if (!response) {
      return;
    }
    setSlot(response.slot);
    setInfo(`空间槽已就绪：${response.slot.geo.station}`);
  }

  function applyGateExecutionPatch(response: GateEvaluateResponse): void {
    setLatestGateProofFragment(response.proofFragment ?? null);
    setLatestGateStatePatch(response.statePatch ?? null);
    setLatestExecutionEvidence(response.evidence ?? null);
    const responseRuleId = String(response.rule_id ?? "").trim();
    const responseRuleVersion = String(response.rule_version ?? "").trim();
    if (responseRuleId && responseRuleVersion) {
      setLatestExecutionRuleBinding({ ruleId: responseRuleId, ruleVersion: responseRuleVersion });
    }

    setNodes((prev) => {
      const exists = prev.some((item) => item.nodeId === response.node.nodeId);
      if (exists) {
        return prev.map((item) => (item.nodeId === response.node.nodeId ? response.node : item));
      }
      return [response.node, ...prev];
    });

    setContainer((prev) => {
      if (!prev || response.statePatch.containerId !== prev.containerId) {
        return prev;
      }
      return {
        ...prev,
        lifecycleState: response.statePatch.containerLifecycleState ?? prev.lifecycleState,
        overallStatus: response.statePatch.containerOverallStatus ?? prev.overallStatus,
      };
    });
  }

  async function ensureSlotReadyForExecution(): Promise<SpaceSlot | null> {
    if (slot) {
      return slot;
    }
    const slotResp = await guarded(() => importSlot({ ...FIXED_SLOT_PAYLOAD }));
    if (!slotResp) {
      return null;
    }
    setSlot(slotResp.slot);
    return slotResp.slot;
  }

  async function ensureExecutionContextForSpu(
    spuId: string,
    projectId?: string,
  ): Promise<{ container: SpaceContainer; nodes: ExecutionNode[] } | null> {
    let targetContainer = container;
    let createdContainer = false;
    const normalizedProjectId = String(projectId ?? "").trim();
    const containerEditable = Boolean(targetContainer && targetContainer.lifecycleState !== "ARCHIVED" && !targetContainer.locked);

    if (!containerEditable) {
      const slotReady = await ensureSlotReadyForExecution();
      if (!slotReady) {
        return null;
      }
      const created = await guarded(() =>
        createContainer({
          containerId: generateContainerId(),
          projectId: normalizedProjectId || undefined,
          geoSlotRef: slotReady.slotId,
          inspector: "did:peg:ins_001",
          supervisor: "did:peg:sup_001",
          autoBindSpuIds: [spuId],
        }),
      );
      if (!created) {
        return null;
      }
      targetContainer = created.container;
      setContainer(created.container);
      setProof(null);
      createdContainer = true;
    } else if (targetContainer && !targetContainer.specBindings.some((item) => item.spuId === spuId)) {
      const bindResp = await guarded(() =>
        bindSpu(targetContainer!.containerId, {
          spuId,
          projectId: normalizedProjectId || undefined,
        }),
      );
      if (!bindResp) {
        return null;
      }
      targetContainer = bindResp.container;
    }

    if (!targetContainer) {
      return null;
    }

    const refreshed = await refreshContainerState(targetContainer.containerId);
    if (!refreshed) {
      return null;
    }

    if (createdContainer) {
      await refreshDashboard();
    }

    syncCurrentExecutionPanel(spuId, refreshed.nodes);
    return refreshed;
  }

  async function refreshProjectEffectiveVersion(projectId: string, spuKey: string): Promise<void> {
    const normalizedProjectId = projectId.trim();
    const normalizedSpuKey = spuKey.trim();
    if (!normalizedProjectId || !normalizedSpuKey) {
      setProjectEffectiveVersion(null);
      return;
    }
    setProjectEffectiveLoading(true);
    setVersionControlError("");
    try {
      const response = await getProjectEffectiveVersion(normalizedProjectId, normalizedSpuKey);
      setProjectEffectiveVersion(response.item);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setProjectEffectiveVersion(null);
      setVersionControlError(`读取生效版本失败：${message}`);
    } finally {
      setProjectEffectiveLoading(false);
    }
  }

  function handleSelectRuleStoreVersion(optionKey: string): void {
    setSelectedRuleStoreVersionKey(optionKey);
    setBuilderError("");
    setPegBotError("");
    setVersionControlError("");
    setCurrentStep("executor");
  }

  async function handleEnterDetectionFlowFromRuleStore(preferredSpuId?: string): Promise<void> {
    if (!selectedRuleStoreVersion) {
      setBuilderError("请先选择规范版本。");
      return;
    }
    const preferred = String(preferredSpuId ?? "").trim();
    const targetSpuId = preferred && selectedRuleStoreVersion.spuIds.includes(preferred)
      ? preferred
      : selectedRuleStoreVersion.sampleSpuId;
    const targetSpuKey = selectedRuleStoreSpuKey || deriveSpuKeyFromSpuId(targetSpuId);
    const bindingConflict = container?.specBindings.find((item) => {
      const bindingSpuKey = String(item.spuKey || deriveSpuKeyFromSpuId(item.spuId)).trim();
      return bindingSpuKey && bindingSpuKey === targetSpuKey && item.spuId !== targetSpuId;
    }) ?? null;
    if (bindingConflict) {
      const conflictVersion = bindingConflict.version ? formatSpecVersionLabel(bindingConflict.version) : "其他版本";
      setBuilderError(`当前检测任务已绑定该检测项的${conflictVersion}，请先新建检测任务后再切换版本。`);
      return;
    }
    const targetSpu = registry.find((item) => item.spuId === targetSpuId) ?? null;
    if (!targetSpu) {
      setBuilderError("所选规范版本无可用检测项，请刷新后重试。");
      return;
    }

    setBuilderSubmitting(true);
    setBuilderError("");
    setBuilderMessage("");
    try {
      const projectId = normalizedVersionControlProjectId;
      setSelectedSpuId(targetSpuId);
      setActiveGuideSpuId(targetSpuId);
      const executionContext = await ensureExecutionContextForSpu(targetSpuId, projectId);
      if (!executionContext) {
        return;
      }
      setCurrentStep("executor");
      const effectiveSourceLabel = formatVersionSourceLabel(projectEffectiveVersion?.source);
      setBuilderMessage(
        `已选择规范版本：${selectedRuleStoreVersion.standardCode} ${selectedRuleStoreVersion.version}（项目 ${projectId}，生效来源：${effectiveSourceLabel}）`,
      );
      setInfo(`已进入检测流程：${formatRuleDisplayName(targetSpu, targetSpuId)}`);
      setTimeout(() => {
        executionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } finally {
      setBuilderSubmitting(false);
    }
  }

  async function handleRunPegBotDetection(): Promise<void> {
    if (!selectedRuleStoreVersion) {
      setPegBotError("请先选择规范版本，再使用 PegBot 执行检测。");
      return;
    }
    setPegBotError("");
    setBuilderMessage("");
    setPegBotStructuredOutput(null);
    setPegBotExecutorRequest(null);
    setPegBotExecutionResult(null);
    setPegBotPrefillSnapshot([]);
    const response = await runNl2GateQueryEntry(nlQuery, {
      mode: "evaluate",
      execute: false,
      context: {
        projectId: normalizedVersionControlProjectId,
        standard_code: selectedRuleStoreVersion.standardCode,
        rule_version: selectedRuleStoreVersion.version,
        normdoc_id: selectedRuleStoreVersion.normdocId || selectedRuleStoreVersion.id || selectedRuleStoreVersion.key,
        package_id: selectedRuleStorePackage?.packageId ?? selectedRuleStoreVersion.packageId,
      },
    });
    if (!response) {
      return;
    }
    if (!response.success) {
      setPegBotError(response.error || response.answer || "当前规范库未包含该检测项");
      return;
    }
    const targetSpuId =
      pickPegBotTargetSpuId(selectedRuleStoreVersion, response)
      ?? selectedSpuId
      ?? selectedRuleStoreVersion.sampleSpuId;
    const targetSpu = registry.find((item) => item.spuId === targetSpuId) ?? null;
    if (!targetSpu) {
      setPegBotError("目标检测项不存在，请刷新后重试。");
      return;
    }

    const metric = response.structured.target.metric ?? inferMetricFromQuery(nlQuery);
    const structuredInputs = response.structured.inputs as Record<string, unknown>;
    const metricValueFromQuery = parseMetricValueFromQuery(nlQuery, metric);
    const structuredOutput: PegBotStructuredOutput = {
      intent: toPegBotIntent(metric),
      form_type: toPegBotFormType(metric),
      params: {
        location: response.structured.target.stake ?? "",
      },
    };
    if (metric === "compaction") {
      structuredOutput.params.compactionDegree =
        metricValueFromQuery ?? readNumericValue(structuredInputs, ["compactionDegree", "compactiondegree"]);
    } else if (metric === "thickness") {
      structuredOutput.params.measuredThickness =
        metricValueFromQuery ?? readNumericValue(structuredInputs, ["measuredThickness", "thickness"]);
    } else if (metric === "deflection") {
      structuredOutput.params.measuredDeflection =
        metricValueFromQuery ?? readNumericValue(structuredInputs, ["measuredDeflection", "deflectionValue", "deflection"]);
    }
    setPegBotStructuredOutput(structuredOutput);

    const prefillValues: Record<string, string> = {};
    const prefillSnapshot: Array<{ field: string; value: string }> = [];
    if (metric === "compaction" && typeof structuredOutput.params.compactionDegree === "number") {
      const fieldName = resolveInputFieldByAliases(targetSpu, ["compactionDegree", "compaction_degree"], "compaction");
      if (fieldName) {
        prefillValues[fieldName] = String(structuredOutput.params.compactionDegree);
        prefillSnapshot.push({ field: fieldName, value: String(structuredOutput.params.compactionDegree) });
      }
    }
    if (metric === "thickness" && typeof structuredOutput.params.measuredThickness === "number") {
      const fieldName = resolveInputFieldByAliases(targetSpu, ["measuredThickness", "thickness"], "thickness");
      if (fieldName) {
        prefillValues[fieldName] = String(structuredOutput.params.measuredThickness);
        prefillSnapshot.push({ field: fieldName, value: String(structuredOutput.params.measuredThickness) });
      }
    }
    if (metric === "deflection" && typeof structuredOutput.params.measuredDeflection === "number") {
      const fieldName = resolveInputFieldByAliases(targetSpu, ["measuredDeflection", "deflectionValue", "deflection"], "deflection");
      if (fieldName) {
        prefillValues[fieldName] = String(structuredOutput.params.measuredDeflection);
        prefillSnapshot.push({ field: fieldName, value: String(structuredOutput.params.measuredDeflection) });
      }
    }
    if (Object.keys(prefillValues).length === 0) {
      if (response.structured.missingResponse?.suggestedQuestions.length) {
        setPegBotError(`信息不足：${response.structured.missingResponse.suggestedQuestions[0]}`);
      } else {
        setPegBotError("已识别自然语言，但未找到可回填字段，请检查当前检测项输入项。");
      }
      return;
    }
    setPegBotPrefillSnapshot(prefillSnapshot);

    const executorInputs: Record<string, unknown> = {};
    for (const [key, textValue] of Object.entries(prefillValues)) {
      const numeric = Number(textValue);
      executorInputs[key] = Number.isFinite(numeric) ? numeric : textValue;
    }
    const executorRequest: PegBotExecutorRequest = {
      rule_id: targetSpuId,
      inputs: executorInputs,
    };
    setPegBotExecutorRequest(executorRequest);

    const targetSpuKey = selectedRuleStoreSpuKey || deriveSpuKeyFromSpuId(targetSpuId);
    const bindingConflict = container?.specBindings.find((item) => {
      const bindingSpuKey = String(item.spuKey || deriveSpuKeyFromSpuId(item.spuId)).trim();
      return bindingSpuKey && bindingSpuKey === targetSpuKey && item.spuId !== targetSpuId;
    }) ?? null;
    if (bindingConflict) {
      const conflictVersion = bindingConflict.version ? formatSpecVersionLabel(bindingConflict.version) : "其他版本";
      setPegBotError(`当前检测任务已绑定该检测项的${conflictVersion}，请先新建检测任务后再切换版本。`);
      return;
    }

    const projectId = normalizedVersionControlProjectId;
    setSelectedSpuId(targetSpuId);
    setActiveGuideSpuId(targetSpuId);
    const executionContext = await ensureExecutionContextForSpu(targetSpuId, projectId);
    if (!executionContext) {
      return;
    }
    setPegBotError("");
    setFormValues((prev) => ({ ...prev, ...prefillValues }));
    setNlQueryError("");
    setCurrentStep("executor");
    setBuilderMessage("PegBot 已完成表单快捷回填，请在核心操作区确认参数后点击“执行检测”。");
    setInfo(`已回填 ${prefillSnapshot.map((item) => `${item.field}=${item.value}`).join("，")}。`);
    setTimeout(() => {
      executionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function handleToggleSpuEnabled(spuId: string, enabled: boolean): Promise<void> {
    const targetSpu = registry.find((item) => item.spuId === spuId) ?? null;
    if (!targetSpu) {
      setError("检测项不存在，请刷新后重试。");
      return;
    }

    if (!enabled) {
      const isBound = container?.specBindings.some((item) => item.spuId === spuId) ?? false;
      if (container && isBound) {
        const response = await guarded(() => unbindSpu(container.containerId, { spuId }));
        if (!response) {
          return;
        }
        setContainer(response.container);
        await refreshContainerState(response.container.containerId);
      }
      if (selectedNode?.spuId === spuId) {
        setSelectedNodeId("");
      }
      if (selectedSpuId === spuId) {
        const nextSpuId = selectedRuleStoreItems.find((item) => item.spuId !== spuId)?.spuId ?? "";
        setSelectedSpuId(nextSpuId);
        setActiveGuideSpuId(nextSpuId);
      } else if (activeGuideSpuId === spuId) {
        setActiveGuideSpuId("");
      }
      setInfo(`检测项已取消：${resolveRuleNameForUi(targetSpu, targetSpu.spuId)}`);
      if (!isBound) {
        return;
      }
      return;
    }

    setSelectedSpuId(spuId);
    setActiveGuideSpuId(spuId);
    const executionContext = await ensureExecutionContextForSpu(spuId, normalizedVersionControlProjectId);
    if (!executionContext) {
      return;
    }
    setInfo(`检测项已纳入本次检测：${formatRuleDisplayName(targetSpu, targetSpu.spuId)}`);
  }

  async function handleCreateContainer(): Promise<void> {
    if (!slot) {
      setError("请先导入空间槽。");
      return;
    }
    if (!hasAllTemplateSpus) {
      setError("请先导入三件套 specbundle。");
      return;
    }
    const response = await guarded(() =>
      createContainer({
        containerId: generateContainerId(),
        geoSlotRef: slot.slotId,
        inspector: "did:peg:ins_001",
        supervisor: "did:peg:sup_001",
        autoBindSpuIds: TEMPLATE_SPU_IDS,
      }),
    );
    if (!response) {
      return;
    }
    setContainer(response.container);
    setSelectedSpuId(response.container.specBindings[0]?.spuId ?? TEMPLATE_SPU_IDS[0]);
    setProof(null);
    setInfo(`验收单元已创建：${response.container.containerId}`);
    await refreshContainerState(response.container.containerId);
    await refreshDashboard();
  }

  async function handleStartDemoMode(): Promise<void> {
    setDemoRunning(true);
    setError("");
    setInfo("");
    setBuilderError("");
    setBuilderMessage("");
    setCurrentStep("spec-import");
    setGuideMessage("Step 1/3 选择规范版本：正在读取 Rule Store 已发布规则。");

    try {
      let demoSpuId = DEMO_COMPACTION_SPU_ID;
      let demoSpuDefinition = registry.find((item) => item.spuId === demoSpuId) ?? null;
      if (!demoSpuDefinition) {
        const firstPublishedSpuId = ruleStoreVersionOptions[0]?.sampleSpuId ?? "";
        demoSpuId = firstPublishedSpuId || demoSpuId;
        demoSpuDefinition = registry.find((item) => item.spuId === demoSpuId) ?? null;
      }
      if (!demoSpuDefinition) {
        throw new Error("未找到 Rule Store 可执行规则。请先在规范构建工作台生成并发布 NormDoc。");
      }
      const demoRuleStoreVersion = selectedRuleStoreVersion
        ?? ruleStoreVersionOptions.find((item) => item.spuIds.includes(demoSpuId))
        ?? null;
      if (!demoRuleStoreVersion) {
        throw new Error("请先选择规范版本并应用后再执行检测。");
      }
      if (selectedRuleStoreVersionKey !== demoRuleStoreVersion.key) {
        setSelectedRuleStoreVersionKey(demoRuleStoreVersion.key);
      }
      setBuilderMessage("已从 Rule Store 读取发布规则。");

      setCurrentStep("executor");
      setGuideMessage("Step 2/3 执行准备：正在自动创建验收单元并绑定检测规则。");

      const slotReady = await ensureSlotReadyForExecution();
      if (!slotReady) {
        return;
      }
      const created = await guarded(() =>
        createContainer({
          containerId: generateContainerId(),
          geoSlotRef: slotReady.slotId,
          inspector: "did:peg:ins_001",
          supervisor: "did:peg:sup_001",
          autoBindSpuIds: [demoSpuId],
        }),
      );
      if (!created) {
        return;
      }

      let demoContainer = created.container;
      setContainer(created.container);
      setProof(null);
      setSelectedSpuId(demoSpuId);
      setActiveGuideSpuId(demoSpuId);

      const refreshedAfterCreate = await refreshContainerState(demoContainer.containerId);
      if (!refreshedAfterCreate) {
        return;
      }
      demoContainer = refreshedAfterCreate.container;
      syncCurrentExecutionPanel(demoSpuId, refreshedAfterCreate.nodes);

      if (!demoContainer.specBindings.some((item) => item.spuId === demoSpuId)) {
        const bindResp = await guarded(() => bindSpu(demoContainer.containerId, { spuId: demoSpuId }));
        if (!bindResp) {
          return;
        }
        const refreshedAfterBind = await refreshContainerState(demoContainer.containerId);
        if (!refreshedAfterBind) {
          return;
        }
        demoContainer = refreshedAfterBind.container;
        syncCurrentExecutionPanel(demoSpuId, refreshedAfterBind.nodes);
      }

      setCurrentStep("executor");
      setGuideMessage("Step 2/3 执行检测：正在自动填充样例并执行判定逻辑。");

      const sampleConfig = SAMPLE_CASES_BY_SPU[demoSpuId]?.pass;
      if (!sampleConfig) {
        throw new Error(`当前规范未配置通过样例：${formatRuleDisplayName(demoSpuDefinition, demoSpuId)}`);
      }
      const demoInputs: Record<string, unknown> = {};
      const demoFormValues: Record<string, string> = {};
      for (const field of demoSpuDefinition.data.inputs) {
        if (!Object.prototype.hasOwnProperty.call(sampleConfig, field.name)) {
          continue;
        }
        const value = sampleConfig[field.name];
        demoInputs[field.name] = value;
        demoFormValues[field.name] = String(value);
      }
      if (Object.keys(demoInputs).length === 0) {
        throw new Error("样例数据与规范输入字段不匹配，无法自动执行。");
      }
      setFormValues((prev) => ({ ...prev, ...demoFormValues }));

      const gateResp = await guarded(() =>
        runExecutor({
          rule_id: demoSpuId,
          rule_version: String(demoRuleStoreVersion.version || "").trim() || String(demoSpuDefinition.meta.version || "").trim(),
          inputs: demoInputs,
          context: buildExecutorRunContext({
            point: slotReady.geo.station,
            containerId: demoContainer.containerId,
            source: "one-click-demo",
            module: "executor",
            normdocId: String(demoRuleStoreVersion.id || demoRuleStoreVersion.key || "").trim(),
            standardCode: normalizeStandardCodeLabel(demoRuleStoreVersion.standardCode) || demoRuleStoreVersion.standardCode,
          }),
        }),
      );
      if (!gateResp) {
        return;
      }
      applyGateExecutionPatch(gateResp);
      setSelectedNodeId(gateResp.node.nodeId);

      for (const role of gateResp.node.requiredSignatures ?? []) {
        const signResp = await guarded(() => signNode(gateResp.node.nodeId, role));
        if (!signResp) {
          return;
        }
      }

      const finalized = await guarded(() => finalizeNode(gateResp.node.nodeId));
      if (!finalized) {
        return;
      }

      const refreshedAfterFinalize = await refreshContainerState(demoContainer.containerId);
      if (!refreshedAfterFinalize) {
        return;
      }
      demoContainer = refreshedAfterFinalize.container;

      setCurrentStep("runtime");
      setGuideMessage("Step 3/3 验收报告：正在生成并加载验收结果。");

      if (demoContainer.lifecycleState !== "ARCHIVED") {
        const archived = await guarded(() => archiveContainer(demoContainer.containerId));
        if (!archived) {
          return;
        }
        setProof(archived.proof);
      }

      await refreshContainerState(demoContainer.containerId);
      await refreshDashboard();
      await refreshLayerPegLedger();
      setGuideMessage("路基压实度验收闭环已完成：Rule Store 选版、执行检测、验收报告全部自动跑通。");
      setInfo("一键演示完成");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setGuideMessage("一键演示中断，请按提示检查后重试。");
    } finally {
      setDemoRunning(false);
    }
  }

  async function handleGoToNextCheckpoint(): Promise<void> {
    const nextCheckpointId = (projectDecision.nextContainer ?? "").trim();
    if (!nextCheckpointId) {
      setError("当前没有可前往的检测点。");
      return;
    }
    setCurrentStep("executor");
    if (container?.containerId === nextCheckpointId) {
      setInfo(`已位于下一个检测点：${nextCheckpointId}`);
      return;
    }
    const refreshed = await refreshContainerState(nextCheckpointId);
    if (refreshed) {
      setInfo(`已前往下一个检测点：${nextCheckpointId}`);
      return;
    }
    setError("");
    setInfo(`已定位下一个检测点：${nextCheckpointId}，请先创建或加载该检测点的验收单元。`);
  }

  async function handleGenerateAcceptanceReport(): Promise<void> {
    setCurrentStep("runtime");
    if (canArchive && !isArchived) {
      await handleArchiveContainer();
      return;
    }
    if (!proof) {
      setError("验收报告必须绑定 Proof：当前未读取到 Proof，请先完成检测并生成 Proof。");
      return;
    }
    const proofId = readProofStringField(proof, ["proofId", "proof_id"]);
    if (!proofId) {
      setError("验收报告必须绑定 Proof：当前 Proof ID 缺失，无法生成可追溯验收凭证。");
      return;
    }
    if (isArchived) {
      setInfo("当前项目已完成，可直接查看验收报告。");
      return;
    }
    setInfo("当前项目已完成，可生成验收报告。");
  }

  function syncCurrentExecutionPanel(nextSpuId: string | null, runtimeNodes: ExecutionNode[]): void {
    if (!nextSpuId) {
      return;
    }
    const nextSpu = registry.find((item) => item.spuId === nextSpuId);
    if (!nextSpu) {
      return;
    }

    const switched = nextSpuId !== selectedSpuId;
    setSelectedSpuId(nextSpuId);
    setActiveGuideSpuId(nextSpuId);

    const latestNode = runtimeNodes
      .filter((item) => item.spuId === nextSpuId)
      .sort((a, b) => b.attemptIndex - a.attemptIndex)[0] ?? null;
    setSelectedNodeId(latestNode?.nodeId ?? "");

    if (switched) {
      const nextFormValues: Record<string, string> = {};
      for (const field of nextSpu.data.inputs) {
        nextFormValues[field.name] = "";
      }
      setFormValues(nextFormValues);
    }
  }

  function requireExecutionRuleBinding(): ExecutionRuleAuditBinding | null {
    if (!currentExecutionRuleBinding) {
      setError("请先选择并绑定规范版本（rule_id + version）后再执行检测。");
      return null;
    }
    return currentExecutionRuleBinding;
  }

  function buildExecutorRunContext(options?: {
    point?: string;
    containerId?: string;
    source?: string;
    module?: string;
    normdocId?: string;
    standardCode?: string;
  }): {
    project_id: string;
    point: string;
    user_id: string;
    [key: string]: unknown;
  } {
    const projectId = String(container?.projectId ?? normalizedVersionControlProjectId ?? "").trim()
      || DEFAULT_RULE_VERSION_PROJECT_ID;
    const point = String(options?.point ?? slot?.geo.station ?? container?.containerId ?? "").trim()
      || "K19+070";
    const userId = String(container?.tripBinding?.inspector ?? "did:peg:ins_001").trim() || "did:peg:ins_001";
    const context: {
      project_id: string;
      point: string;
      user_id: string;
      [key: string]: unknown;
    } = {
      project_id: projectId,
      point,
      user_id: userId,
      source: options?.source ?? "executor-ui",
      module: options?.module ?? currentWorkflowModule,
    };
    const preferredContainerId = String(options?.containerId ?? container?.containerId ?? "").trim();
    if (preferredContainerId) {
      context.container_id = preferredContainerId;
    }
    if (options?.normdocId) {
      context.normdoc_id = options.normdocId;
    }
    if (options?.standardCode) {
      context.standard_code = options.standardCode;
    }
    return context;
  }

  async function handleSubmitNode(): Promise<void> {
    if (!selectedSpu || !container) {
      setError("请先创建验收单元并选择检测规则。");
      return;
    }
    const ruleBinding = requireExecutionRuleBinding();
    if (!ruleBinding) {
      return;
    }
    if (!formPegPreview || !formPegPreview.ready) {
      const missing = formPegPreview?.missingFields ?? [];
      const issue = formPegPreview?.validationIssues?.[0]?.message ?? formPegPreview?.message ?? "";
      const detail = missing.length > 0 ? `缺失输入: ${missing.join(", ")}` : issue || "当前表单尚未通过输入校验";
      setError(detail);
      return;
    }
    const payload = formPegPreview.normalizedInputs;

    const response = await guarded(() =>
      runExecutor({
        rule_id: ruleBinding.ruleId,
        rule_version: ruleBinding.ruleVersion,
        inputs: payload,
        context: buildExecutorRunContext({
          containerId: container.containerId,
          source: "executor-ui",
          module: currentWorkflowModule,
          normdocId: ruleBinding.normdocId,
          standardCode: ruleBinding.standardLabel,
        }),
      }),
    );
    if (!response) {
      const refreshed = await refreshContainerState(container.containerId);
      const recommendedSpuId = refreshed?.runtimeScheduler?.decision.nextTask ?? null;
      if (recommendedSpuId && recommendedSpuId !== selectedSpuId) {
        syncCurrentExecutionPanel(recommendedSpuId, refreshed?.nodes ?? nodes);
        setInfo(`当前检测项暂不可执行，已切换到可执行项：${schedulerTaskLabel(recommendedSpuId, registry)}。`);
      }
      return;
    }

    applyGateExecutionPatch(response);
    setSelectedNodeId(response.node.nodeId);
    await refreshContainerState(response.statePatch.containerId ?? container.containerId);
    await refreshLayerPegLedger();
    const proofId = response.proof?.proofId ?? "";
    const fragmentProofId = String(response.proofFragment?.proof_id ?? "").trim();
    const resolvedProofId = proofId || fragmentProofId;
    const proofHash = response.proof?.hash ?? "";
    const proofSummary = proofId || proofHash ? ` 验收结果: ${proofId || "-"} / ${proofHash || "-"}` : "";
    const proofAuditSummary = resolvedProofId ? ` Proof ID: ${resolvedProofId}` : "";
    const stateSummary = ` 状态回写: node=${response.statePatch.nodeStatus}, 验收单元=${response.statePatch.containerLifecycleState ?? "-"}`;
    setInfo(
      response.status === "PASS"
        ? `判定逻辑已通过，已生成验收结果并回写状态。${proofSummary}${proofAuditSummary}${stateSummary}`
        : `判定逻辑未通过，已生成验收结果并回写状态，请修正输入后复检。${proofSummary}${proofAuditSummary}${stateSummary}`,
    );
  }

  function handleBatchRowValueChange(rowId: string, fieldName: string, value: string): void {
    setBatchRows((prev) =>
      prev.map((row) => (
        row.rowId === rowId
          ? {
              ...row,
              values: { ...row.values, [fieldName]: value },
              status: "IDLE",
              message: undefined,
              proofId: undefined,
              proofHash: undefined,
            }
          : row
      )),
    );
  }

  function handleBatchRowPointLabelChange(rowId: string, value: string): void {
    setBatchRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, pointLabel: value } : row)));
  }

  function handleAddBatchRow(): void {
    if (!selectedSpu) {
      return;
    }
    setBatchRows((prev) => [...prev, createFormPegBatchRow(selectedSpu, prev.length)]);
  }

  function handleCopyCurrentFormToBatch(): void {
    if (!selectedSpu) {
      return;
    }
    setBatchRows((prev) => [
      ...prev,
      {
        ...createFormPegBatchRow(selectedSpu, prev.length),
        values: sanitizeDraftFormValues(selectedSpu, formValues),
      },
    ]);
  }

  function handleApplyBatchRowToMainForm(rowId: string): void {
    const row = batchRows.find((item) => item.rowId === rowId);
    if (!row || !selectedSpu) {
      return;
    }
    setFormValues(sanitizeDraftFormValues(selectedSpu, row.values));
    setInfo(`已回填到上方表单：${row.pointLabel || row.rowId}。`);
    setTimeout(() => {
      executionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function handleCopyPreviousBatchRow(rowId: string): void {
    setBatchRows((prev) => {
      const targetIndex = prev.findIndex((row) => row.rowId === rowId);
      if (targetIndex <= 0) {
        return prev;
      }
      const previousRow = prev[targetIndex - 1];
      return prev.map((row, index) => (
        index === targetIndex
          ? {
              ...row,
              values: { ...previousRow.values },
              status: "IDLE",
              message: undefined,
              proofId: undefined,
              proofHash: undefined,
            }
          : row
      ));
    });
    setInfo("已复制上一行输入，可直接批量执行或按需微调。");
  }

  function handleRemoveBatchRow(rowId: string): void {
    if (!selectedSpu) {
      return;
    }
    setBatchRows((prev) => {
      const next = prev.filter((row) => row.rowId !== rowId);
      return next.length > 0 ? next : [createFormPegBatchRow(selectedSpu, 0)];
    });
  }

  function handleClearOfflineDraft(): void {
    if (!selectedSpu) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      try {
        window.localStorage.removeItem(formPegDraftStorageKey);
      } catch {
        // Ignore storage clear failures and keep runtime state.
      }
    }
    setFormValues(buildInitialFormValues(selectedSpu));
    setBatchRows([createFormPegBatchRow(selectedSpu, 0)]);
    setOfflineDraftSavedAt("");
    setBatchEvaluateResult(null);
    setInfo("已清除离线草稿缓存。");
  }

  async function handleSubmitBatchRows(): Promise<void> {
    if (!selectedSpu || !container) {
      setError("请先创建验收单元并选择检测规则。");
      return;
    }
    const ruleBinding = requireExecutionRuleBinding();
    if (!ruleBinding) {
      return;
    }
    if (batchRows.length === 0) {
      setError("请先添加至少一行批量数据。");
      return;
    }

    const validItems: Array<{ rowId: string; pointLabel: string; inputs: Record<string, unknown> }> = [];
    const rowUpdates = new Map<string, Pick<FormPegBatchRow, "status" | "message" | "proofId" | "proofHash">>();

    for (const row of batchRows) {
      const preview = buildFormPegPreview(selectedSpu, row.values);
      if (!preview.ready) {
        const missingText = preview.missingFields.length > 0 ? `缺失: ${preview.missingFields.join(", ")}` : "";
        const issueText = preview.validationIssues[0]?.message ?? preview.message ?? "输入无效";
        rowUpdates.set(row.rowId, {
          status: "INVALID",
          message: missingText || issueText,
          proofId: undefined,
          proofHash: undefined,
        });
        continue;
      }
      validItems.push({
        rowId: row.rowId,
        pointLabel: row.pointLabel,
        inputs: preview.normalizedInputs,
      });
      rowUpdates.set(row.rowId, {
        status: "PENDING",
        message: "进行中",
        proofId: undefined,
        proofHash: undefined,
      });
    }

    setBatchRows((prev) =>
      prev.map((row) => {
        const next = rowUpdates.get(row.rowId);
        return next
          ? {
              ...row,
              status: next.status,
              message: next.message,
              proofId: next.proofId,
              proofHash: next.proofHash,
            }
          : row;
      }),
    );

    if (validItems.length === 0) {
      setError("批量数据未通过校验，请先修正缺失项或输入格式。");
      return;
    }

    const response = await guarded(() =>
      evaluateGateBatch({
        items: validItems.map((item) => ({
          itemId: item.rowId,
          rule_id: ruleBinding.ruleId,
          rule_version: ruleBinding.ruleVersion,
          containerId: container.containerId,
          inputs: item.inputs,
          context: {
            source: "formpeg-batch",
            module: currentWorkflowModule,
            pointLabel: item.pointLabel,
            normdoc_id: ruleBinding.normdocId,
            standard_code: ruleBinding.standardLabel,
          },
        })),
        executionOptions: {
          concurrency: Math.min(6, validItems.length),
          timeoutMs: 15_000,
          maxRetries: 1,
        },
      }),
    );
    if (!response) {
      return;
    }

    setBatchEvaluateResult(response);
    const itemById = new Map(response.items.map((item) => [item.itemId, item]));
    const proofById = new Map(response.summary.proofReferences.map((item) => [item.itemId, item]));
    setBatchRows((prev) =>
      prev.map((row) => {
        const item = itemById.get(row.rowId);
        if (!item) {
          return row;
        }
        const proofRef = proofById.get(row.rowId);
        if (item.status === "PASS") {
          return {
            ...row,
            status: "PASS",
            message: item.response?.explanation ?? "判定逻辑通过",
            proofId: proofRef?.proofId ?? undefined,
            proofHash: proofRef?.proofHash ?? undefined,
          };
        }
        if (item.status === "FAIL") {
          return {
            ...row,
            status: "FAIL",
            message: item.response?.explanation ?? "判定逻辑未通过",
            proofId: proofRef?.proofId ?? undefined,
            proofHash: proofRef?.proofHash ?? undefined,
          };
        }
        if (item.status === "BLOCKED") {
          return {
            ...row,
            status: "BLOCKED",
            message: item.error?.message ?? "依赖阻塞",
            proofId: undefined,
            proofHash: undefined,
          };
        }
        return {
          ...row,
          status: "ERROR",
          message: item.error?.message ?? "批量执行异常",
          proofId: undefined,
          proofHash: undefined,
        };
      }),
    );

    await refreshContainerState(container.containerId);
    await refreshLayerPegLedger();
    setInfo(
      `批量执行完成：总计 ${response.summary.total}，已完成 ${response.summary.passed}，进行中 ${response.summary.failed}，不可执行（依赖未完成） ${response.summary.blocked}。`,
    );
  }

  async function finalizeNodeAndAdvance(nodeId: string): Promise<void> {
    const response = await guarded(() => finalizeNode(nodeId));
    if (!response) {
      return;
    }
    if (!container) {
      return;
    }
    const refreshed = await refreshContainerState(container.containerId);
    if (!refreshed) {
      return;
    }
    const nextSpuId = refreshed.runtimeScheduler?.decision.nextTask ?? null;
    if (nextSpuId) {
      syncCurrentExecutionPanel(nextSpuId, refreshed.nodes);
    }
    const runtimeAction = refreshed.runtimeScheduler?.decision.action ?? null;
    if (runtimeAction === "ARCHIVE_READY") {
      setInfo("当前验收单元已满足归档条件，可直接生成总体验收结果。");
    } else if (runtimeAction === "RETRY_FAILED" && nextSpuId) {
      setInfo(`当前检测规则未通过，请复检：${schedulerTaskLabel(nextSpuId, registry)}。`);
    } else if (runtimeAction === "EXECUTE" && nextSpuId && nextSpuId !== selectedSpuId) {
      setInfo(`当前检测规则已完成，已切换下一工序：${schedulerTaskLabel(nextSpuId, registry)}。`);
    } else {
      setInfo("节点已完成并回写运行时状态。");
    }
    await refreshLayerPegLedger();
  }

  async function handleRunCurrentTask(): Promise<void> {
    if (!selectedSpu || !container) {
      setError("请先创建验收单元并选择检测规则。");
      return;
    }
    const ruleBinding = requireExecutionRuleBinding();
    if (!ruleBinding) {
      return;
    }
    const refreshed = await refreshContainerState(container.containerId);
    const runtimeDecision = refreshed?.runtimeScheduler?.decision ?? runtimeScheduler?.decision ?? null;
    const runtimeNodes = refreshed?.nodes ?? nodes;
    const runtimeDetail = resolveSchedulerDetailBySpuIds(
      runtimeDecision?.details,
      [ruleBinding.ruleId, selectedSpu.spuId, selectedBinding?.spuId],
    );
    const runtimeCanExecute = runtimeDetail
      ? runtimeDetail.status === "ready" || runtimeDetail.status === "failed"
      : selectedCanExecute;
    if (!runtimeCanExecute) {
      const recommendedSpuId = runtimeDecision?.nextTask ?? null;
      const blocker = runtimeDetail?.blockedBy ? schedulerTaskLabel(runtimeDetail.blockedBy, registry) : "";
      if (recommendedSpuId && recommendedSpuId !== selectedSpuId) {
        syncCurrentExecutionPanel(recommendedSpuId, runtimeNodes);
        setError(
          `当前检测项不可执行（依赖未完成）${blocker ? `，需先完成：${blocker}` : ""}。已自动切换到可执行项：${schedulerTaskLabel(recommendedSpuId, registry)}。`,
        );
        return;
      }
      const statusLabel = runtimeDetail ? schedulerDetailStatusLabel(runtimeDetail.status) : normalizeNormExecutionStatusLabel(selectedNormStatus);
      setError(`当前检测规则状态为 ${statusLabel}，请先完成前置工序或复检失败项。`);
      return;
    }

    const runtimeTaskAttempts = runtimeNodes
      .filter((item) => item.spuId === ruleBinding.ruleId || isWorkflowSpuEquivalent(item.spuId, ruleBinding.ruleId))
      .sort((a, b) => b.attemptIndex - a.attemptIndex);
    const activeNode = runtimeTaskAttempts.find((item) => !isFinalNodeStatus(item.status)) ?? runtimeTaskAttempts[0] ?? null;
    if (activeNode && selectedNodeId !== activeNode.nodeId) {
      setSelectedNodeId(activeNode.nodeId);
    }
    if (!activeNode || activeNode.status === "DRAFT" || activeNode.status === "RUNNING") {
      await handleSubmitNode();
      return;
    }
    if (isFinalNodeStatus(activeNode.status)) {
      setInfo("当前检测已完成，请进入下一步。");
      return;
    }
    if (activeNode.status === "SIGNING") {
      const rolesToSign = (activeNode.requiredSignatures ?? []).filter((role) => !activeNode.signedBy.includes(role));
      for (const role of rolesToSign) {
        const signResp = await guarded(() => signNode(activeNode.nodeId, role));
        if (!signResp) {
          return;
        }
      }
      await finalizeNodeAndAdvance(activeNode.nodeId);
      return;
    }
    if (activeNode.status === "FAIL") {
      await finalizeNodeAndAdvance(activeNode.nodeId);
      return;
    }

    await handleSubmitNode();
  }

  async function handleArchiveContainer(): Promise<void> {
    if (!container) {
      return;
    }
    const response = await guarded(() => archiveContainer(container.containerId));
    if (!response) {
      return;
    }
    setProof(response.proof);
    await refreshContainerState(container.containerId);
    await refreshDashboard();
    await refreshLayerPegLedger();
  }

  async function exportSelectedSpu(format: "markdown" | "json" | "specbundle"): Promise<void> {
    if (!selectedSpu) {
      return;
    }
    try {
      const output = await exportSpuArtifacts(selectedSpu);
      const fileStem = formatRuleFileStem(selectedSpu, selectedSpu.spuId);
      if (format === "markdown") {
        triggerDownload(`${fileStem}.md`, output.markdown, "text/markdown;charset=utf-8");
        return;
      }
      if (format === "json") {
        triggerDownload(`${fileStem}.json`, `${JSON.stringify(output.json, null, 2)}\n`, "application/json;charset=utf-8");
        return;
      }
      triggerDownload(`${fileStem}.specbundle`, output.bundleBlob, "application/zip");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
    }
  }

  function exportProof(format: "markdown" | "json"): void {
    if (!proof) {
      return;
    }
    if (format === "json") {
      triggerDownload(`${proof.containerId}-proof.json`, JSON.stringify(proof, null, 2), "application/json;charset=utf-8");
      return;
    }
    triggerDownload(`${proof.containerId}-proof.md`, proofToMarkdown(proof), "text/markdown;charset=utf-8");
  }

  const liveGate = formPegPreview?.ready ? formPegPreview.gate : null;
  const liveOutputs = formPegPreview?.ready ? formPegPreview.outputs : selectedNode?.outputs ?? {};
  const thresholdCards = liveGate?.results ?? selectedNode?.gate.results ?? [];
  const liveGatePassed = formPegPreview?.ready ? formPegPreview.gate.passed : (selectedNode?.gate.passed ?? null);
  const formPegMissingFields = formPegPreview?.missingFields ?? [];
  const formPegValidationIssues = formPegPreview?.validationIssues ?? [];
  const resolvedActiveModule = resolveVisibleModule(activeModule, showTechnicalDetails);
  const currentWorkflowModule = getWorkflowModule(currentStep);
  const selectedModuleMeta = getModuleConfig(resolvedActiveModule);
  const activeModuleSections = getModuleSections(resolvedActiveModule);
  const nl2GateWorkbenchUrl = getNl2GateWorkbenchUrl();
  const showSpecbot = resolvedActiveModule === "builder";
  const showRuleStore = resolvedActiveModule === "runtime";
  const showExecutor = resolvedActiveModule === "executor";
  const showSpecReview = showExecutor;
  const showRuntime = showExecutor;
  useEffect(() => {
    if (showExecutor && showTechnicalDetails) {
      setShowTechnicalDetails(false);
    }
  }, [showExecutor, showTechnicalDetails]);
  const showDebug = resolvedActiveModule === "debug" && showTechnicalDetails;
  const showDebugNl2Gate = showDebug && activeDebugTopic === DEBUG_TOPIC_NL2GATE;
  const showDebugOverview = showDebug && !showDebugNl2Gate;
  const executionState: ExecutionState = useMemo(
    () => ({
      hasSpec: Boolean(selectedRuleStoreVersion),
      hasContainer: Boolean(container),
      hasBoundSPU: Boolean(container?.specBindings.some((item) => item.spuId === selectedSpuId)),
      hasExecuted: nodes.some((item) => item.status !== "DRAFT"),
      allPassed: requiredSpuIds.length > 0 && passedCount === requiredSpuIds.length,
    }),
    [container, nodes, passedCount, requiredSpuIds.length, selectedRuleStoreVersion, selectedSpuId],
  );
  const hasSelectedInspectionItem = Boolean(currentExecutionRuleBinding);
  const hasRunningExecution = loading
    || selectedNormStatus === "running"
    || nodes.some((item) => item.status === "RUNNING" || item.status === "SIGNING");
  const hasCompletedExecution = nodes.some((item) =>
    isFinalNodeStatus(item.status) || item.status === "PASS" || item.status === "FAIL");
  const hasGeneratedAcceptanceReport = isArchived
    || Boolean(proof?.archivedAt ?? proof?.timestamps?.archivedAt ?? proof?.timestamps?.finalizedAt);
  const whitePageClosure = useMemo<{
    status: WhitePageClosureStatus;
    reason: string;
    nextActionLabel: string;
    nextAction: () => void;
    nextActionDisabled: boolean;
  }>(() => {
    if (!executionState.hasSpec) {
      return {
        status: "未选择规范",
        reason: "请先从 Rule Store 选择发布规范版本。",
        nextActionLabel: "选择规范版本",
        nextAction: () => setCurrentStep("spec-import"),
        nextActionDisabled: false,
      };
    }
    if (!hasSelectedInspectionItem) {
      return {
        status: "已选择规范",
        reason: "规范版本已选择，请选择本次检测项。",
        nextActionLabel: "选择检测项",
        nextAction: () => setCurrentStep("executor"),
        nextActionDisabled: false,
      };
    }
    if (hasGeneratedAcceptanceReport) {
      return {
        status: "已生成报告",
        reason: "验收报告已生成，可直接查看。",
        nextActionLabel: "查看验收报告",
        nextAction: () => setCurrentStep("runtime"),
        nextActionDisabled: false,
      };
    }
    if (hasRunningExecution) {
      return {
        status: "检测中",
        reason: "检测任务正在执行或签字处理中，请等待完成。",
        nextActionLabel: "刷新检测状态",
        nextAction: () => {
          if (container?.containerId) {
            void refreshContainerState(container.containerId);
            return;
          }
          setCurrentStep("executor");
        },
        nextActionDisabled: loading,
      };
    }
    if (hasCompletedExecution) {
      return {
        status: "检测完成",
        reason: "检测已完成，可生成验收报告。",
        nextActionLabel: "生成验收报告",
        nextAction: () => {
          void handleGenerateAcceptanceReport();
        },
        nextActionDisabled: loading,
      };
    }
    return {
      status: "已选择检测项",
      reason: "检测项已选择，等待发起检测执行。",
      nextActionLabel: "开始检测",
      nextAction: () => setCurrentStep("executor"),
      nextActionDisabled: false,
    };
  }, [
    container?.containerId,
    executionState.hasSpec,
    hasCompletedExecution,
    hasGeneratedAcceptanceReport,
    hasRunningExecution,
    hasSelectedInspectionItem,
    loading,
    proof?.archivedAt,
    proof?.timestamps?.archivedAt,
    proof?.timestamps?.finalizedAt,
    selectedNormStatus,
  ]);
  const topStatusText = sanitizeUiText(whitePageClosure.status);
  const topReasonText = sanitizeUiText(whitePageClosure.reason);
  const topActionLabel = sanitizeUiText(whitePageClosure.nextActionLabel);
  const suggestedNextCheckpoint = (projectDecision.nextContainer ?? "").trim();
  const hasSuggestedNextCheckpoint = suggestedNextCheckpoint.length > 0;
  const isProjectReadyForReport = executionState.allPassed && !hasSuggestedNextCheckpoint;
  const nextStepCurrentStatus = `👉 ${whitePageClosure.status}`;
  const nextStepSuggestion = `👉 ${whitePageClosure.reason}`;
  const safeGuideMessage = sanitizeUiText(guideMessage);
  const safeBuilderMessage = sanitizeUiText(builderMessage);
  const safeBuilderError = sanitizeUiText(builderError);
  const safePegBotError = sanitizeUiText(pegBotError);
  const safeVersionControlError = sanitizeUiText(versionControlError);
  const safeProjectContextError = sanitizeUiText(projectContextError);
  const safeInfo = sanitizeUiText(info);
  const safeError = sanitizeUiText(error);
  const safeNextStepCurrentStatus = sanitizeUiText(nextStepCurrentStatus);
  const safeNextStepSuggestion = sanitizeUiText(nextStepSuggestion);
  const currentRuleName = resolveRuleNameForUi(selectedSpu, selectedSpuId);
  const currentRuleClause = resolveRuleClauseForUi(selectedSpu, selectedSpuId);
  const latestProofId = String(latestGateProofFragment?.proof_id ?? "").trim() || "-";
  const latestRuleVersion = String(latestGateProofFragment?.rule_version ?? "").trim()
    || latestExecutionRuleBinding?.ruleVersion
    || currentExecutionRuleBinding?.ruleVersion
    || "-";
  const runtimeProofId = readProofStringField(proof, ["proofId", "proof_id"]);
  const runtimeRuleVersion = readProofStringField(proof, ["rule_version", "matchedSpecVersion"])
    || latestRuleVersion
    || "-";
  const runtimeNormdocId = readProofStringField(proof, ["normdoc_id"])
    || currentExecutionRuleBinding?.normdocId
    || selectedRuleStoreNormdocId
    || "-";
  const runtimeOperatorId = readProofStringField(proof, ["operator_id"])
    || String(container?.tripBinding?.inspector ?? "").trim()
    || "-";
  const runtimeProofTimestamp = readProofStringField(proof, ["timestamp"])
    || proof?.archivedAt
    || proof?.timestamps?.archivedAt
    || proof?.timestamps?.finalizedAt
    || selectedNode?.updatedAt
    || "";
  const runtimeRuleSource = (() => {
    const technicalDetails = toRecord(proof?.technicalDetails);
    const source = String(
      technicalDetails?.rule_source
      ?? technicalDetails?.ruleSource
      ?? "",
    ).trim();
    if (source) {
      return source;
    }
    return "Rule Store";
  })();
  const runtimeRuleVersionDisplay = runtimeRuleVersion === "-" ? "-" : formatSpecVersionLabel(runtimeRuleVersion);
  const runtimeProofBound = Boolean(proof && runtimeProofId);
  const currentRuleEvidence = useMemo(() => {
    const currentBindingRuleId = String(currentExecutionRuleBinding?.ruleId ?? "").trim();
    const currentBindingRuleVersion = String(currentExecutionRuleBinding?.ruleVersion ?? "").trim();
    const latestBindingRuleId = String(latestExecutionRuleBinding?.ruleId ?? "").trim();
    const latestBindingRuleVersion = String(latestExecutionRuleBinding?.ruleVersion ?? "").trim();
    const latestEvidenceMatchesCurrentBinding = Boolean(
      latestExecutionEvidence
      && currentBindingRuleId
      && currentBindingRuleVersion
      && latestBindingRuleId === currentBindingRuleId
      && latestBindingRuleVersion === currentBindingRuleVersion,
    );
    if (latestEvidenceMatchesCurrentBinding) {
      const standardCode = String(latestExecutionEvidence?.standard_code ?? "").trim() || "-";
      const clauseNo = String(latestExecutionEvidence?.clause_no ?? "").trim() || "-";
      const clauseTitle = String(latestExecutionEvidence?.clause_title ?? "").trim() || "-";
      const clauseContent = String(latestExecutionEvidence?.clause_content ?? "").trim();
      const clauseId = String(latestExecutionEvidence?.clause_id ?? "").trim();
      return { standardCode, clauseNo, clauseTitle, clauseContent, clauseId };
    }
    const standardCode = currentExecutionRuleBinding?.standardLabel
      || normalizeStandardCodeLabel(selectedRuleStoreVersion?.standardCode ?? "")
      || String(selectedRuleStoreVersion?.standardCode ?? "").trim()
      || "-";
    const candidateRuleIds = [
      currentExecutionRuleBinding?.ruleId,
      selectedBinding?.spuId,
      selectedSpuId,
    ]
      .map((item) => String(item ?? "").trim())
      .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
    const matchedRule = (() => {
      if (ruleStorePackageRules.length === 0 || candidateRuleIds.length === 0) {
        return null;
      }
      for (const candidate of candidateRuleIds) {
        const direct = ruleStorePackageRules.find((item) => item.ruleId === candidate);
        if (direct) {
          return direct;
        }
      }
      for (const candidate of candidateRuleIds) {
        const equivalent = ruleStorePackageRules.find((item) => isWorkflowSpuEquivalent(item.ruleId, candidate));
        if (equivalent) {
          return equivalent;
        }
      }
      const candidateSpuKeys = new Set(candidateRuleIds.map((item) => deriveSpuKeyFromSpuId(item)));
      return ruleStorePackageRules.find((item) => candidateSpuKeys.has(deriveSpuKeyFromSpuId(item.ruleId))) ?? null;
    })();
    const clauseNo = String(matchedRule?.clause ?? currentRuleClause ?? "").trim() || "-";
    const clauseTitle = String(matchedRule?.itemName ?? currentRuleName ?? "").trim() || "-";
    const clauseContent = String(matchedRule?.sourceText ?? "").trim();
    const clauseId = String(matchedRule?.clauseId ?? matchedRule?.clauseNo ?? clauseNo).trim();
    return { standardCode, clauseNo, clauseTitle, clauseContent, clauseId };
  }, [
    currentExecutionRuleBinding?.ruleId,
    currentExecutionRuleBinding?.ruleVersion,
    currentExecutionRuleBinding?.standardLabel,
    currentRuleClause,
    currentRuleName,
    latestExecutionEvidence,
    latestExecutionRuleBinding?.ruleId,
    latestExecutionRuleBinding?.ruleVersion,
    ruleStorePackageRules,
    selectedBinding?.spuId,
    selectedRuleStoreVersion?.standardCode,
    selectedSpuId,
  ]);
  const executionDecisionBasis = (() => {
    const standardLabel = String(currentRuleEvidence.standardCode ?? "").trim();
    const clause = String(currentRuleEvidence.clauseNo ?? "").trim();
    if (standardLabel && clause && clause !== "-") {
      return `${standardLabel} ${clause}`;
    }
    if (standardLabel) {
      return standardLabel;
    }
    return "-";
  })();
  useEffect(() => {
    if (!currentExecutionRuleBinding || currentRuleEvidence.clauseNo === "-") {
      setIsClauseSourceDialogOpen(false);
    }
  }, [currentExecutionRuleBinding, currentRuleEvidence.clauseNo]);
  const currentClauseTokenSet = useMemo(() => {
    const tokens = new Set<string>();
    const clauseId = String(currentRuleEvidence.clauseId ?? "").trim();
    const clauseNo = String(currentRuleEvidence.clauseNo ?? "").trim();
    const normalizedClauseNo = normalizeClauseNoToken(clauseNo);
    if (clauseId) {
      tokens.add(clauseId);
    }
    if (clauseNo && clauseNo !== "-") {
      tokens.add(clauseNo);
    }
    if (normalizedClauseNo) {
      tokens.add(normalizedClauseNo);
    }
    return tokens;
  }, [currentRuleEvidence.clauseId, currentRuleEvidence.clauseNo]);
  const clauseBoundRules = useMemo(() => {
    if (currentClauseTokenSet.size === 0) {
      return [] as RuleStorePackageRuleItem[];
    }
    return ruleStorePackageRules.filter((item) => {
      const tokens = new Set<string>();
      const clause = String(item.clause ?? "").trim();
      const clauseNo = String(item.clauseNo ?? "").trim();
      const clauseId = String(item.clauseId ?? "").trim();
      const normalizedClause = normalizeClauseNoToken(clause);
      const normalizedClauseNo = normalizeClauseNoToken(clauseNo);
      const normalizedClauseId = normalizeClauseNoToken(clauseId);
      if (clause) {
        tokens.add(clause);
      }
      if (clauseNo) {
        tokens.add(clauseNo);
      }
      if (clauseId) {
        tokens.add(clauseId);
      }
      if (normalizedClause) {
        tokens.add(normalizedClause);
      }
      if (normalizedClauseNo) {
        tokens.add(normalizedClauseNo);
      }
      if (normalizedClauseId) {
        tokens.add(normalizedClauseId);
      }
      for (const entry of item.clauseIds) {
        const text = String(entry ?? "").trim();
        if (!text) {
          continue;
        }
        tokens.add(text);
        const normalizedText = normalizeClauseNoToken(text);
        if (normalizedText) {
          tokens.add(normalizedText);
        }
      }
      for (const token of tokens) {
        if (currentClauseTokenSet.has(token)) {
          return true;
        }
      }
      return false;
    });
  }, [currentClauseTokenSet, ruleStorePackageRules]);
  const localClauseNeighbors = useMemo(() => {
    const clausesById = new Map<string, ClauseSearchItem>();
    const pushClause = (item: ClauseSearchItem) => {
      const key = item.clauseId || item.clauseNo;
      if (!key) {
        return;
      }
      const existing = clausesById.get(key);
      if (!existing) {
        clausesById.set(key, item);
        return;
      }
      const hasContent = item.content.length > 0;
      const existingHasContent = existing.content.length > 0;
      if (hasContent && !existingHasContent) {
        clausesById.set(key, item);
      }
    };
    for (const item of ruleStorePackageRules) {
      const clauseId = String(item.clauseId ?? item.clauseNo ?? item.clause ?? "").trim();
      const clauseNo = String(item.clauseNo ?? item.clause ?? item.clauseId ?? "").trim();
      if (!clauseId && !clauseNo) {
        continue;
      }
      pushClause({
        clauseId: clauseId || clauseNo,
        clauseNo: clauseNo || clauseId,
        title: String(item.itemName ?? "").trim(),
        content: String(item.sourceText ?? "").trim(),
        explanation: "",
        riskNote: "",
        relatedTerms: [],
        generatedByAi: false,
        markedReviewed: false,
        explanationNotice: "",
        standardCode: String(currentRuleEvidence.standardCode ?? "").trim(),
        normdocId: String(item.normdocId ?? "").trim(),
        version: String(item.ruleVersion ?? item.version ?? "").trim(),
        keywords: [],
        page: null,
        score: 0,
      });
    }
    const currentClauseNo = String(currentRuleEvidence.clauseNo ?? "").trim();
    const currentClauseId = String(currentRuleEvidence.clauseId ?? "").trim();
    if ((currentClauseNo && currentClauseNo !== "-") || currentClauseId) {
      pushClause({
        clauseId: currentClauseId || currentClauseNo,
        clauseNo: currentClauseNo || currentClauseId,
        title: String(currentRuleEvidence.clauseTitle ?? "").trim(),
        content: String(currentRuleEvidence.clauseContent ?? "").trim(),
        explanation: "",
        riskNote: "",
        relatedTerms: [],
        generatedByAi: false,
        markedReviewed: false,
        explanationNotice: "",
        standardCode: String(currentRuleEvidence.standardCode ?? "").trim(),
        normdocId: String(currentExecutionRuleBinding?.normdocId ?? selectedRuleStoreNormdocId ?? "").trim(),
        version: String(currentExecutionRuleBinding?.ruleVersion ?? selectedRuleStoreVersion?.version ?? "").trim(),
        keywords: [],
        page: null,
        score: 0,
      });
    }
    const ordered = Array.from(clausesById.values())
      .filter((item) => item.clauseNo || item.clauseId)
      .sort((left, right) => compareClauseNo(left.clauseNo, right.clauseNo));
    if (ordered.length === 0) {
      return { current: null, previous: null, next: null };
    }
    const normalizedCurrentClauseNo = normalizeClauseNoToken(currentClauseNo);
    const index = ordered.findIndex((item) => {
      const normalizedItemClauseNo = normalizeClauseNoToken(item.clauseNo);
      if (currentClauseId && (item.clauseId === currentClauseId || item.clauseNo === currentClauseId)) {
        return true;
      }
      if (normalizedCurrentClauseNo && normalizedItemClauseNo === normalizedCurrentClauseNo) {
        return true;
      }
      return false;
    });
    if (index < 0) {
      return { current: null, previous: null, next: null };
    }
    return {
      current: ordered[index] ?? null,
      previous: index > 0 ? ordered[index - 1] : null,
      next: index < ordered.length - 1 ? ordered[index + 1] : null,
    };
  }, [
    currentExecutionRuleBinding?.normdocId,
    currentExecutionRuleBinding?.ruleVersion,
    currentRuleEvidence.clauseContent,
    currentRuleEvidence.clauseId,
    currentRuleEvidence.clauseNo,
    currentRuleEvidence.clauseTitle,
    currentRuleEvidence.standardCode,
    ruleStorePackageRules,
    selectedRuleStoreNormdocId,
    selectedRuleStoreVersion?.version,
  ]);
  useEffect(() => {
    if (!isClauseSourceDialogOpen) {
      setClauseDialogLoading(false);
      setClauseDialogError("");
      setClauseDialogClause(null);
      setClauseDialogNeighbors(null);
      return;
    }
    const clauseNoToken = normalizeClauseNoToken(currentRuleEvidence.clauseNo);
    const clauseId = String(currentRuleEvidence.clauseId ?? "").trim();
    const targetQuery = clauseNoToken || clauseId;
    if (!targetQuery || targetQuery === "-") {
      setClauseDialogLoading(false);
      setClauseDialogError("");
      setClauseDialogClause(null);
      setClauseDialogNeighbors(null);
      return;
    }
    const standardCode = String(currentRuleEvidence.standardCode ?? "").trim();
    const version = String(currentExecutionRuleBinding?.ruleVersion ?? selectedRuleStoreVersion?.version ?? "").trim();
    const normdocId = String(currentExecutionRuleBinding?.normdocId ?? selectedRuleStoreNormdocId ?? "").trim();
    let canceled = false;
    const loadClauseDialog = async () => {
      setClauseDialogLoading(true);
      setClauseDialogError("");
      try {
        const searched = await searchClauses({
          q: targetQuery,
          standardCode: standardCode && standardCode !== "-" ? standardCode : undefined,
          version: version && version !== "-" ? version : undefined,
          limit: 20,
        });
        if (canceled) {
          return;
        }
        const normalizedClauseNo = normalizeClauseNoToken(currentRuleEvidence.clauseNo);
        const matched = searched.results.find((item) => {
          const itemClauseId = String(item.clauseId ?? "").trim();
          const itemClauseNo = String(item.clauseNo ?? "").trim();
          if (clauseId && (itemClauseId === clauseId || itemClauseNo === clauseId)) {
            return true;
          }
          if (normalizedClauseNo && normalizeClauseNoToken(itemClauseNo) === normalizedClauseNo) {
            return true;
          }
          return false;
        }) ?? searched.results[0] ?? null;
        setClauseDialogClause(matched);
        const neighborTarget = String(matched?.clauseId ?? clauseId ?? targetQuery).trim();
        if (!neighborTarget) {
          setClauseDialogNeighbors(null);
          return;
        }
        try {
          const neighbors = await getClauseNeighbors(neighborTarget, {
            normdocId: normdocId || undefined,
            version: version && version !== "-" ? version : undefined,
          });
          if (!canceled) {
            setClauseDialogNeighbors(neighbors);
          }
        } catch {
          if (!canceled) {
            setClauseDialogNeighbors(null);
            setClauseDialogError("未获取到相邻条款，已显示当前条款及本地上下文。");
          }
        }
      } catch {
        if (!canceled) {
          setClauseDialogClause(null);
          setClauseDialogNeighbors(null);
          setClauseDialogError("未获取到条款解释数据，已使用规则绑定信息展示。");
        }
      } finally {
        if (!canceled) {
          setClauseDialogLoading(false);
        }
      }
    };
    void loadClauseDialog();
    return () => {
      canceled = true;
    };
  }, [
    currentExecutionRuleBinding?.normdocId,
    currentExecutionRuleBinding?.ruleVersion,
    currentRuleEvidence.clauseId,
    currentRuleEvidence.clauseNo,
    currentRuleEvidence.standardCode,
    isClauseSourceDialogOpen,
    selectedRuleStoreNormdocId,
    selectedRuleStoreVersion?.version,
  ]);
  const clauseDialogCurrent = clauseDialogNeighbors?.current ?? clauseDialogClause ?? localClauseNeighbors.current;
  const clauseDialogPrevious = clauseDialogNeighbors?.previous ?? localClauseNeighbors.previous;
  const clauseDialogNext = clauseDialogNeighbors?.next ?? localClauseNeighbors.next;
  const clauseDialogExplanation = String(clauseDialogCurrent?.explanation ?? "").trim();
  const clauseDialogRiskNote = String(clauseDialogCurrent?.riskNote ?? "").trim();
  const clauseDialogExplanationNotice = String(clauseDialogCurrent?.explanationNotice ?? "").trim() || "辅助说明，不作为判定依据";
  const clauseDialogRelatedTerms = Array.isArray(clauseDialogCurrent?.relatedTerms)
    ? clauseDialogCurrent.relatedTerms.filter((item) => String(item ?? "").trim().length > 0)
    : [];
  const currentTaskDisplay = currentRuleClause ? `${currentRuleName} - 条款 ${currentRuleClause}` : currentRuleName;
  const completionCardVisible = executionState.allPassed;
  const completionTaskName = currentRuleName === "路基压实度" ? "路基压实度（土质）" : currentRuleName;
  const completionCheckpoint = slot?.geo.station ?? "K19+070";
  const runtimeCheckpoint = slot?.geo.station ?? "K19+070";
  const runtimeItemName = completionTaskName;
  const runtimeOverallStatus = proof?.overallStatus ?? container?.overallStatus ?? "PASS";
  const runtimePassed = runtimeOverallStatus !== "FAIL";
  const runtimeResultLabel = runtimePassed ? "合格" : "不合格";
  const runtimeResultCode = runtimePassed ? "PASS" : "FAIL";
  const runtimeResultTime = formatDisplayTime(
    proof?.archivedAt
      ?? proof?.timestamps?.archivedAt
      ?? proof?.timestamps?.finalizedAt
      ?? selectedNode?.updatedAt
      ?? new Date().toISOString(),
  );
  const runtimeReportFields: Array<{ label: string; value: string }> = [
    { label: "检测点", value: runtimeCheckpoint },
    { label: "检测项", value: sanitizeUiText(runtimeItemName) },
    { label: "判定结果", value: `${runtimeResultLabel}（${runtimeResultCode}）` },
    { label: "规则来源", value: `${runtimeRuleSource} / NormDoc ${runtimeNormdocId}` },
    { label: "规则版本", value: runtimeRuleVersionDisplay },
    { label: "Proof ID", value: runtimeProofId || "-" },
    { label: "执行时间", value: formatDisplayTime(runtimeProofTimestamp) || runtimeResultTime },
    { label: "操作人", value: runtimeOperatorId },
  ];
  const otherPendingBindings = templateBindings.filter((item) => item.spuId !== selectedSpuId && item.normStatus !== "pass");
  const otherPendingCount = otherPendingBindings.length;
  const currentTaskNode = useMemo(() => {
    const latestNode = selectedSpuAttempts[0] ?? null;
    if (!latestNode) {
      return null;
    }
    return selectedSpuAttempts.find((item) => !isFinalNodeStatus(item.status)) ?? latestNode;
  }, [selectedSpuAttempts]);
  const currentTaskSignedRoles = currentTaskNode?.signedBy ?? [];
  const pendingSignRoles = currentTaskNode?.status === "SIGNING"
    ? (currentTaskNode.requiredSignatures ?? []).filter((role) => !currentTaskSignedRoles.includes(role))
    : [];
  const requiredRoles = currentTaskNode?.requiredSignatures ?? selectedSpu?.proof.requiredSignatures ?? [];
  const signedBySet = new Set(currentTaskNode?.signedBy ?? []);
  const currentTaskPrimaryLabel = (() => {
    if (currentTaskNode && isFinalNodeStatus(currentTaskNode.status)) {
      return "当前检测已完成";
    }
    if (currentTaskNode?.status === "SIGNING") {
      return pendingSignRoles.length > 0 ? "完成检测签字并执行检测" : "执行检测";
    }
    if (currentTaskNode?.status === "FAIL") {
      return "执行检测";
    }
    return "执行检测";
  })();
  const currentTaskPrimaryDisabled = loading
    || !selectedSpu
    || !container
    || !currentExecutionRuleBinding
    || !selectedCanExecute
    || (currentTaskNode ? isFinalNodeStatus(currentTaskNode.status) : false);

  return (
    <main className="min-h-screen bg-slate-100 p-[15px] text-slate-900">
      <div className="w-full space-y-4">
        <header className="rounded-xl bg-slate-900 p-5 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-bold">规范执行演示系统</h1>
              <p className="mt-1 text-sm text-slate-300">验收闭环：选择 Rule Store 版本 → 执行检测 → 输出验收报告</p>
            </div>
            <button
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              type="button"
              disabled={loading || builderSubmitting || demoRunning}
              onClick={() => void handleStartDemoMode()}
            >
              {demoRunning ? "闭环演示执行中..." : "一键闭环演示"}
            </button>
          </div>
        </header>

        {platformApiUnavailableMessage ? (
          <section className="rounded border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <h2 className="text-base font-semibold">❌ 系统未启动</h2>
            <p className="mt-1">原因：平台 API 未连接</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span>👉 操作：</span>
              <button
                className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                type="button"
                disabled={loading}
                onClick={() => setShowApiStartCommand((prev) => !prev)}
              >
                启动服务（显示命令）
              </button>
              <button
                className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                type="button"
                disabled={loading}
                onClick={() => void handleRetryPlatformApiHealth()}
              >
                重试连接
              </button>
            </div>
            {showApiStartCommand ? (
              <div className="mt-3 rounded border border-rose-200 bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-800">在项目根目录执行：</p>
                <pre className="mt-1 overflow-auto rounded bg-slate-900 p-2 text-slate-100">npm --prefix apps/executable-spec-web run api:dev</pre>
              </div>
            ) : null}
          </section>
        ) : null}

        {guideMessage ? (
          <section className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{safeGuideMessage}</section>
        ) : (
          <section className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-700">
            当前演示流程：选择 Rule Store 版本 → 执行检测 → 验收报告
          </section>
        )}

        <WorkflowContainer currentStep={currentStep} setCurrentStep={setCurrentStep} />

        {!showExecutor ? (
          <TechDetailCollapse
            expanded={showTechnicalDetails}
            onToggle={() => setShowTechnicalDetails((prev) => !prev)}
          >
          <section className="rounded border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-800">平台技术配置</h3>
            <p className="mt-1 text-xs text-slate-600">当前平台 API: {getPlatformApiBase()}（默认 {API_BASE}）</p>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
              <input
                className="rounded border border-slate-300 px-3 py-2 text-sm"
                value={platformApiBaseInput}
                onChange={(event) => setPlatformApiBaseInput(event.target.value)}
                placeholder="http://localhost:8790"
              />
              <button
                className="rounded bg-slate-700 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-600 disabled:opacity-60"
                type="button"
                disabled={loading}
                onClick={() => void handleApplyPlatformApiBase()}
              >
                应用并刷新平台接口
              </button>
            </div>
          </section>

        {showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">执行端技术视图</h2>
            <p className="mt-1 text-sm text-slate-600">
              当前可见模块：{selectedModuleMeta.title}（{selectedModuleMeta.description}）。白色页面仅保留执行能力，不提供规则生成/修改/发布入口。
            </p>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-700">当前模块边界（页面清单）</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {activeModuleSections.map((item) => (
                  <span key={item.id} className="rounded bg-white px-2 py-1 text-xs text-slate-700" title={item.description}>
                    {item.title}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {showDebugNl2Gate ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">NL2Gate 专题子路由（/debug/nl2gate）</h2>
                <p className="mt-1 text-sm text-slate-600">
                  该视图作为 debug 子路由承载规则数字化专题入口，避免与主执行链路混排。
                </p>
              </div>
              <button
                className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={handleOpenDebugOverview}
              >
                返回 Debug 总览
              </button>
            </div>
            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
              <iframe
                title="nl2gate-workbench"
                className="h-[900px] w-full rounded border border-slate-200 bg-white"
                src={nl2GateWorkbenchUrl}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              若 iframe 无法加载，可直接打开独立专题页：
              <a className="ml-1 underline" href={nl2GateWorkbenchUrl} target="_blank" rel="noreferrer noopener">
                {nl2GateWorkbenchUrl}
              </a>
            </p>
          </section>
        ) : null}

        {showDebugOverview ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">NormRef API 矩阵联调</h2>
          <p className="mt-1 text-sm text-slate-600">
            在当前页面直接联调：/api/v1/gate | path | state | proof | mapping | image | voice | spec | form | report
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">NormRef API Base</span>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={normrefApiBaseInput}
                onChange={(event) => setNormrefApiBaseInput(event.target.value)}
                placeholder="http://127.0.0.1:8000"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Bearer Token（可选）</span>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={normrefToken}
                onChange={(event) => setNormrefToken(event.target.value)}
                placeholder="留空表示不带 Authorization"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded bg-slate-200 px-3 py-2 text-sm text-slate-800"
              type="button"
              onClick={() => {
                setNormrefResponseMap({});
                setNormrefError("");
              }}
            >
              清空联调结果
            </button>
          </div>

          <details className="mt-3 rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">查看联调请求体与单接口按钮</summary>
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/gate/evaluate</p>
                  <textarea
                    className="mt-2 h-36 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefGatePayloadText}
                    onChange={(event) => setNormrefGatePayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefGateEvaluate)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /gate/evaluate"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/path/execute</p>
                  <textarea
                    className="mt-2 h-32 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefPathPayloadText}
                    onChange={(event) => setNormrefPathPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefPathExecute)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /path/execute"}
                  </button>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/state/transition</p>
                  <textarea
                    className="mt-2 h-32 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefStatePayloadText}
                    onChange={(event) => setNormrefStatePayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefStateTransition)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /state/transition"}
                  </button>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/proof/verify</p>
                  <textarea
                    className="mt-2 h-32 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefProofPayloadText}
                    onChange={(event) => setNormrefProofPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefProofVerify)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /proof/verify"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/mapping/resolve</p>
                  <textarea
                    className="mt-2 h-32 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefMappingPayloadText}
                    onChange={(event) => setNormrefMappingPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefMappingResolve)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /mapping/resolve"}
                  </button>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/spec/validate</p>
                  <textarea
                    className="mt-2 h-32 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefSpecPayloadText}
                    onChange={(event) => setNormrefSpecPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefSpecValidate)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /spec/validate"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/image/recognize</p>
                  <textarea
                    className="mt-2 h-24 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefImagePayloadText}
                    onChange={(event) => setNormrefImagePayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefImageRecognize)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /image/recognize"}
                  </button>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/voice/transcribe</p>
                  <textarea
                    className="mt-2 h-24 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefVoicePayloadText}
                    onChange={(event) => setNormrefVoicePayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefVoiceTranscribe)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /voice/transcribe"}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/form/render</p>
                  <textarea
                    className="mt-2 h-24 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefFormPayloadText}
                    onChange={(event) => setNormrefFormPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefFormRender)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /form/render"}
                  </button>
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">POST /api/v1/report/generate</p>
                  <textarea
                    className="mt-2 h-24 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                    value={normrefReportPayloadText}
                    onChange={(event) => setNormrefReportPayloadText(event.target.value)}
                  />
                  <button
                    className="mt-2 rounded bg-slate-800 px-3 py-2 text-xs text-white disabled:opacity-60"
                    type="button"
                    disabled={normrefLoading}
                    onClick={() => void runNormrefAction(requestNormrefReportGenerate)}
                  >
                    {normrefLoading ? "请求中..." : "调用 /report/generate"}
                  </button>
                </div>
              </div>
            </div>
          </details>

          {normrefError ? <div className="mt-3 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{normrefError}</div> : null}
          {Object.entries(normrefResponseMap).length > 0 ? (
            <div className="mt-3 space-y-2">
              {Object.entries(normrefResponseMap).map(([key, payload]) => (
                <details key={key} className="rounded border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">{key}</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          ) : null}
          </section>
          ) : null}
          </TechDetailCollapse>
        ) : null}

        {(showSpecbot || showRuleStore || showSpecReview || showExecutor || showRuntime) ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">状态：</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">👉 {topStatusText}</p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">说明：</p>
                <p className="mt-1 text-sm text-slate-700">👉 {topReasonText}</p>
              </div>
              <button
                className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                disabled={whitePageClosure.nextActionDisabled}
                onClick={whitePageClosure.nextAction}
              >
                👉 [{topActionLabel}]
              </button>
            </div>
          </section>
        ) : null}

        {(showSpecbot || showRuleStore || showSpecReview || showExecutor || showRuntime) ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">规范来源说明</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">当前使用规范</p>
                <p className="mt-1 font-semibold text-slate-900">当前规范：{currentNormSourceSummary.currentSpec}</p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">来源</p>
                <p className="mt-1 text-slate-900">{currentNormSourceSummary.source}</p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">是否项目定制</p>
                <p className="mt-1 text-slate-900">{currentNormSourceSummary.projectCustomized}</p>
              </div>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">更新时间</p>
                <p className="mt-1 text-slate-900">{currentNormSourceSummary.updatedAt}</p>
              </div>
            </div>
          </section>
        ) : null}

        {showRuleStore ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">规则单一来源</h2>
            <p className="mt-1 text-sm text-slate-700">正式规则仅来自 NormDoc 发布后的 Rule Store，当前页面仅用于读取并执行规则。</p>
            <p className="mt-1 text-xs text-slate-500">数据流：规范构建工作台 → NormDoc → Rule Store → 执行引擎 → 验收系统</p>
          </section>
        ) : null}

        {(showRuleStore || showExecutor) ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">选择规范版本（Rule Store）</h2>
            <p className="mt-1 text-sm text-slate-600">白色页面只读取 Rule Store：先读取 `/api/rule-store/normdocs`，选择后再读取 `/api/rule-store/packages`。</p>

            {builderMessage ? <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{safeBuilderMessage}</p> : null}
            {builderError ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{safeBuilderError}</p> : null}
            {versionControlError ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{safeVersionControlError}</p> : null}

            <div className="mt-4 overflow-x-auto rounded border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">NormDoc ID</th>
                    <th className="px-3 py-2">标准编号</th>
                    <th className="px-3 py-2">标准名称</th>
                    <th className="px-3 py-2">版本号</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">bundle_hash</th>
                    <th className="px-3 py-2">rule_count</th>
                    <th className="px-3 py-2">component_count</th>
                    <th className="px-3 py-2">发布时间</th>
                    <th className="px-3 py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {ruleStoreVersionOptions.length === 0 ? (
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500" colSpan={10}>Rule Store 暂无可用规则，请先在规范构建工作台发布 NormDoc。</td>
                    </tr>
                  ) : (
                    ruleStoreVersionOptions.map((item) => (
                      <tr key={item.key} className={`border-t border-slate-100 ${selectedRuleStoreVersionKey === item.key ? "bg-blue-50" : ""}`}>
                        <td className="px-3 py-2">{item.normdocId || "-"}</td>
                        <td className="px-3 py-2">{item.standardCode}</td>
                        <td className="px-3 py-2">{item.standardName || item.name || "-"}</td>
                        <td className="px-3 py-2">{item.version}</td>
                        <td className="px-3 py-2">{item.status === "published" ? "已发布" : (item.status || "-")}</td>
                        <td className="px-3 py-2">{item.bundleHash || "-"}</td>
                        <td className="px-3 py-2">{item.ruleCount ?? item.availableItemCount}</td>
                        <td className="px-3 py-2">{item.componentCount ?? "-"}</td>
                        <td className="px-3 py-2">{item.publishedAt || "-"}</td>
                        <td className="px-3 py-2">
                          <label className="inline-flex cursor-pointer items-center gap-2">
                            <input
                              className="h-4 w-4"
                              type="radio"
                              name="rule-store-version"
                              checked={selectedRuleStoreVersionKey === item.key}
                              onChange={() => handleSelectRuleStoreVersion(item.key)}
                            />
                            <span className="text-xs text-slate-700">选择</span>
                          </label>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {selectedRuleStoreNormdocDetail ? (
              <div className="mt-4 space-y-3 rounded border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-semibold text-slate-800">NormDoc 详情预览</h3>
                <details className="rounded border border-slate-200 bg-white p-2" open>
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">1. spec.md 预览</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{selectedRuleStoreNormdocDetail.previews.specMd || "-"}</pre>
                </details>
                <details className="rounded border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">2. spec.json 预览</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(selectedRuleStoreNormdocDetail.previews.specJson ?? {}, null, 2)}</pre>
                </details>
                <details className="rounded border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">3. SpecIR YAML 预览</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{selectedRuleStoreNormdocDetail.previews.specirYaml || "-"}</pre>
                </details>
                <details className="rounded border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">4. 规则列表</summary>
                  <div className="mt-2 max-h-56 overflow-auto text-xs text-slate-700">
                    {selectedRuleStoreNormdocDetail.rules.map((rule) => (
                      <p key={rule.ruleId}>{rule.ruleId} | clause: {rule.clauseId || "-"} | {rule.condition || "-"}</p>
                    ))}
                  </div>
                </details>
                <details className="rounded border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">5. 构件列表</summary>
                  <div className="mt-2 max-h-56 overflow-auto text-xs text-slate-700">
                    {selectedRuleStoreNormdocDetail.components.map((component) => (
                      <p key={component.componentId}>{component.componentId} | clauses: {component.boundClauseIds.join(", ") || "-"}</p>
                    ))}
                  </div>
                </details>
                <details className="rounded border border-slate-200 bg-white p-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">6. 原文条款引用</summary>
                  <p className="mt-2 text-xs text-slate-700">{selectedRuleStoreNormdocDetail.sourceClauses.join(", ") || "-"}</p>
                </details>
              </div>
            ) : null}
            {selectedRuleStorePackage ? (
              <p className="mt-2 text-xs text-slate-500">
                已加载规则包：{selectedRuleStorePackage.name || selectedRuleStorePackage.packageId}（{selectedRuleStorePackage.version}）
              </p>
            ) : selectedRuleStoreVersionKey ? (
              <p className="mt-2 text-xs text-slate-500">{ruleStorePackageLoading ? "规则包加载中..." : "当前规范暂无可用规则包。"}</p>
            ) : null}
            <p className="mt-4 text-xs text-slate-600">选择版本后将自动进入 Step 2 检测项选择。</p>
          </section>
        ) : null}

        {showExecutor ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">项目执行配置（LayerPeg）</h2>
            <p className="mt-1 text-sm text-slate-600">用于验证可执行构件链路：Scope 选择、人员绑定、仪器绑定，以及 `selection_source / resolved_scope` 回显。</p>
            {safeProjectContextError ? (
              <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{safeProjectContextError}</p>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-slate-600">project_id</span>
                <input
                  className="w-full rounded border border-slate-300 px-3 py-2"
                  value={versionControlProjectId}
                  onChange={(event) => setVersionControlProjectId(event.target.value)}
                  placeholder="dajin-2024"
                />
              </label>
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-slate-500">selected_specs（来自 Rule Store）</p>
                <p className="mt-1 text-slate-800">{resolveProjectSelectedSpecs().join(", ") || "请先选择规范版本"}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                disabled={projectContextLoading}
                onClick={() => void handleCreateOrUpdateProjectContext()}
              >
                {projectContextLoading ? "提交中..." : "创建/更新项目配置"}
              </button>
              <button
                className="rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                type="button"
                disabled={projectContextLoading}
                onClick={() => void handleLoadProjectContext()}
              >
                {projectContextLoading ? "加载中..." : "加载项目配置"}
              </button>
            </div>
            <details
              className="mt-3 rounded border border-slate-200 bg-slate-50 p-3"
              open={projectConfigAdvancedOpen}
              onToggle={(event) => setProjectConfigAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                高级 JSON 配置（Scope / Role / Instrument）
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <label className="text-sm lg:col-span-1">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">scope_filters（JSON）</span>
                  <textarea
                    className="h-40 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                    value={projectScopeFiltersText}
                    onChange={(event) => setProjectScopeFiltersText(event.target.value)}
                  />
                </label>
                <label className="text-sm lg:col-span-1">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">role_bindings（JSON 数组）</span>
                  <textarea
                    className="h-40 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                    value={projectRoleBindingsText}
                    onChange={(event) => setProjectRoleBindingsText(event.target.value)}
                  />
                </label>
                <label className="text-sm lg:col-span-1">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">instrument_bindings（JSON 数组）</span>
                  <textarea
                    className="h-40 w-full rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                    value={projectInstrumentBindingsText}
                    onChange={(event) => setProjectInstrumentBindingsText(event.target.value)}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                  type="button"
                  disabled={projectContextLoading}
                  onClick={() => void handleSaveProjectRoleBindings()}
                >
                  {projectContextLoading ? "保存中..." : "保存 Role Bindings"}
                </button>
                <button
                  className="rounded bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 disabled:opacity-60"
                  type="button"
                  disabled={projectContextLoading}
                  onClick={() => void handleSaveProjectInstrumentBindings()}
                >
                  {projectContextLoading ? "保存中..." : "保存 Instrument Bindings"}
                </button>
              </div>
            </details>
            {projectContextInfo ? (
              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <p><strong>selection_source：</strong>{projectContextInfo.selection_source || "unknown"}</p>
                <p><strong>resolved_scope.categories：</strong>{projectContextInfo.resolved_scope?.category_ids?.join(", ") || "（无）"}</p>
                <p><strong>resolved_scope.work_items：</strong>{projectContextInfo.resolved_scope?.work_item_ids?.join(", ") || "（无）"}</p>
                <p>
                  <strong>resolved_scope.counts：</strong>
                  {projectContextInfo.resolved_scope?.counts
                    ? `categories=${projectContextInfo.resolved_scope.counts.categories}, work_items=${projectContextInfo.resolved_scope.counts.work_items}, measured_items=${projectContextInfo.resolved_scope.counts.measured_items}, specs=${projectContextInfo.resolved_scope.counts.specs}`
                    : "（无）"}
                </p>
                <p><strong>role_bindings：</strong>{Array.isArray(projectContextInfo.role_bindings) ? projectContextInfo.role_bindings.length : 0}</p>
                <p><strong>instrument_bindings：</strong>{Array.isArray(projectContextInfo.instrument_bindings) ? projectContextInfo.instrument_bindings.length : 0}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {showExecutor ? (
          <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">自然语言快捷输入（PegBot）</h2>
            <p className="mt-1 text-sm text-slate-600">自然语言作为表单快捷输入：PegBot 解析后自动回填表单，用户可修改，再走标准执行流程。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                type="button"
                onClick={() => setNlQuery("K19+070 压实度 94.5% 是否合格？")}
              >
                K19+070 压实度 94.5% 是否合格？
              </button>
              <button
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700"
                type="button"
                onClick={() => setNlQuery("这个点能过吗？")}
              >
                这个点能过吗？
              </button>
            </div>
            <textarea
              className="mt-3 min-h-24 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="请输入自然语言检测问题"
              value={nlQuery}
              onChange={(event) => setNlQuery(event.target.value)}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                className="rounded bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                type="button"
                disabled={nlQueryLoading || builderSubmitting || !selectedRuleStoreVersion}
                onClick={() => void handleRunPegBotDetection()}
              >
                {nlQueryLoading ? "解析中..." : "自动填充表单"}
              </button>
              {!selectedRuleStoreVersion ? (
                <span className="text-xs text-amber-700">请先选择规范版本。</span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">回填后请在下方核心操作区点击“执行检测”。</p>
            {safePegBotError ? (
              <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{safePegBotError}</p>
            ) : null}
            {nlQueryError ? (
              <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{sanitizeUiText(nlQueryError)}</p>
            ) : null}
            {nlQueryResult ? (
              <div className="mt-3 space-y-3 text-sm">
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <p><strong>识别结果：</strong>{sanitizeUiText(nlQueryResult.answer || "-")}</p>
                  <p><strong>检测状态：</strong>{normalizePegBotExecutionLabel(pegBotExecutionResult?.status, nlQueryResult.success)}</p>
                  <p><strong>检测项：</strong>{nlQueryResult.structured.target.spuId ?? "待确认"}</p>
                  {pegBotPrefillSnapshot.length > 0 ? (
                    <p><strong>已回填字段：</strong>{pegBotPrefillSnapshot.map((item) => `${item.field}=${item.value}`).join("，")}</p>
                  ) : null}
                </div>
                {pegBotExecutionResult ? (
                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <p><strong>判定结果：</strong>{pegBotExecutionResult.status}</p>
                    <p><strong>使用规则版本：</strong>{formatSpecVersionLabel(pegBotExecutionResult.ruleVersion)}</p>
                    <p><strong>执行编号：</strong>{pegBotExecutionResult.executionId || "-"}</p>
                    <p><strong>验收结果：</strong>{pegBotExecutionResult.proofId || "-"} / {pegBotExecutionResult.proofHash || "-"}</p>
                    <p><strong>规则路径：</strong>{pegBotExecutionResult.proofPath.join(" | ")}</p>
                  </div>
                ) : null}
                {(pegBotStructuredOutput || pegBotExecutorRequest) ? (
                  <details className="rounded border border-slate-200 bg-slate-50 p-3">
                    <summary className="cursor-pointer font-semibold text-slate-700">查看 PegBot 调试详情</summary>
                    {pegBotStructuredOutput ? (
                      <div className="mt-3">
                        <p className="font-semibold text-slate-700">NL2Gate 结构化输出</p>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                          {JSON.stringify(pegBotStructuredOutput, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                    {pegBotExecutorRequest ? (
                      <div className="mt-3">
                        <p className="font-semibold text-slate-700">执行引擎请求</p>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                          {JSON.stringify(pegBotExecutorRequest, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </details>
                ) : null}
                {nlQueryResult.structured.missingResponse?.suggestedQuestions.length ? (
                  <p><strong>建议补充：</strong>{nlQueryResult.structured.missingResponse.suggestedQuestions.join(" ")}</p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {showSpecReview ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Step 2：选择可执行 Component</h2>
            <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">仅进行执行范围选择：Run 端不修改规则阈值、表达式与规则 JSON。</p>
              <p className="mt-1 text-xs text-blue-700">数据来源：<code>GET /api/rule-store/packages/&lt;package_id&gt;/rules</code></p>
            </div>
            <div className="mt-3 max-h-72 overflow-auto rounded border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Component</th>
                    <th className="px-3 py-2">条款号</th>
                    <th className="px-3 py-2">是否必检</th>
                    <th className="px-3 py-2">是否启用</th>
                    <th className="px-3 py-2">本次执行</th>
                  </tr>
                </thead>
                <tbody>
                  {!selectedRuleStoreVersion ? (
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>请先在上方选择规范版本。</td>
                    </tr>
                  ) : ruleStorePackageLoading ? (
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>规则包读取中...</td>
                    </tr>
                  ) : ruleStorePackageRules.length === 0 ? (
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-500" colSpan={5}>当前规范版本暂无可执行检测项。</td>
                    </tr>
                  ) : (
                    ruleStorePackageRules.map((item) => {
                      const itemSpuKey = deriveSpuKeyFromSpuId(item.ruleId);
                      const isBound = container?.specBindings.some((binding) => {
                        if (binding.spuId === item.ruleId) {
                          return true;
                        }
                        const bindingSpuKey = String(binding.spuKey || deriveSpuKeyFromSpuId(binding.spuId)).trim();
                        return (bindingSpuKey.length > 0 && bindingSpuKey === itemSpuKey)
                          || isWorkflowSpuEquivalent(binding.spuId, item.ruleId);
                      }) ?? false;
                      const existsInRegistry = registry.some((registryItem) => registryItem.spuId === item.ruleId);
                      const canToggle = existsInRegistry && (item.enabled || isBound);
                      return (
                        <tr key={item.ruleId} className={`border-t border-slate-100 ${selectedSpuId === item.ruleId ? "bg-blue-50" : ""}`}>
                          <td className="px-3 py-2">{item.itemName || "未命名检测项"}</td>
                          <td className="px-3 py-2">{item.clause || "-"}</td>
                          <td className="px-3 py-2">{item.required ? "是" : "否"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${item.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                              {item.enabled ? "是" : "否"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <input
                                className="h-4 w-4"
                                type="checkbox"
                                checked={isBound}
                                disabled={loading || !canToggle}
                                onChange={(event) => void handleToggleSpuEnabled(item.ruleId, event.target.checked)}
                              />
                              <span className="text-xs font-semibold text-slate-700">
                                {isBound ? "已纳入" : "未纳入"}
                              </span>
                            </label>
                            {!item.enabled ? <p className="mt-1 text-xs text-amber-700">规则未启用，仅可取消已选项</p> : null}
                            {!existsInRegistry ? <p className="mt-1 text-xs text-amber-700">执行器尚未加载该检测项</p> : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Norm Version Compare</h2>
            <p className="text-sm text-slate-500">支持 v1 vs v2（spec_id）与 old spec vs new spec（JSON），并返回结构化 diff 与 impact preview。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">
                old_spec_id
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={normCompareOldSpecId}
                  onChange={(event) => setNormCompareOldSpecId(event.target.value)}
                />
              </label>
              <label className="text-sm">
                new_spec_id
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  value={normCompareNewSpecId}
                  onChange={(event) => setNormCompareNewSpecId(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60"
                type="button"
                disabled={normCompareLoading}
                onClick={() => void runNormVersionCompareBySpecId()}
              >
                {normCompareLoading ? "对比中..." : "v1 vs v2（spec_id）"}
              </button>
              <button
                className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60"
                type="button"
                disabled={normCompareLoading}
                onClick={() => void runNormVersionCompareByRawSpec()}
              >
                {normCompareLoading ? "对比中..." : "old spec vs new spec（JSON）"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">
                old_spec（JSON）
                <textarea
                  className="mt-1 h-48 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs"
                  value={normCompareOldSpecText}
                  onChange={(event) => setNormCompareOldSpecText(event.target.value)}
                />
              </label>
              <label className="text-sm">
                new_spec（JSON）
                <textarea
                  className="mt-1 h-48 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs"
                  value={normCompareNewSpecText}
                  onChange={(event) => setNormCompareNewSpecText(event.target.value)}
                />
              </label>
            </div>
            {normCompareError ? <p className="mt-2 text-sm text-rose-700">{normCompareError}</p> : null}
            {normCompareResult ? (
              <details className="mt-3 rounded border border-slate-200 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">diff_report.json 结果预览</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(normCompareResult, null, 2)}
                </pre>
              </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Impact Graph</h2>
            <p className="text-sm text-slate-500">Rule Impact Analysis：向上追溯来源规范，向下传播受影响业务与技术对象。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <label className="text-sm">
                specir_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleImpactSpecirId} onChange={(e) => setRuleImpactSpecirId(e.target.value)} />
              </label>
              <label className="text-sm">
                rule_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleImpactRuleId} onChange={(e) => setRuleImpactRuleId(e.target.value)} />
              </label>
              <label className="text-sm">
                gate_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleImpactGateId} onChange={(e) => setRuleImpactGateId(e.target.value)} />
              </label>
              <label className="text-sm">
                slotKey
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleImpactSlotKey} onChange={(e) => setRuleImpactSlotKey(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={ruleImpactLoading} onClick={() => void runRuleImpactAnalysis()}>
                {ruleImpactLoading ? "分析中..." : "执行 Rule Impact Analysis"}
              </button>
            </div>
            {ruleImpactError ? <p className="mt-2 text-sm text-rose-700">{ruleImpactError}</p> : null}
            {ruleImpactResult ? (
              <div className="mt-3 space-y-3">
                <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  修改这个规则会影响哪些表单：{
                    Array.isArray((ruleImpactResult.impact_summary as Record<string, unknown>)?.form_code && ((ruleImpactResult.impact_summary as Record<string, unknown>).form_code as Record<string, unknown>)?.affected_forms)
                      ? ((((ruleImpactResult.impact_summary as Record<string, unknown>).form_code as Record<string, unknown>).affected_forms as unknown[]) .map((item) => String(item)).join(", ") || "无")
                      : "无"
                  }
                </p>
                <details className="rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">impact_graph.json 结果预览</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleImpactResult, null, 2)}</pre>
                </details>
              </div>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Golden Regression Dashboard</h2>
            <p className="text-sm text-slate-500">每个 form_code 维护 baseline rulepack/runtime/publish；新版本发布前自动对比 baseline。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">
                form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={goldenFormCode} onChange={(e) => setGoldenFormCode(e.target.value)} />
              </label>
              <div className="mt-6 flex gap-2">
                <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={goldenLoading} onClick={() => void loadGoldenBaselineSchema()}>
                  baseline schema
                </button>
                <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={goldenLoading} onClick={() => void saveGoldenBaseline()}>
                  保存 baseline
                </button>
                <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={goldenLoading} onClick={() => void runGoldenRegression()}>
                  执行回归
                </button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">baseline rulepack
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={goldenBaselineRulepackText} onChange={(e) => setGoldenBaselineRulepackText(e.target.value)} />
              </label>
              <label className="text-sm">baseline runtime result
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={goldenBaselineRuntimeText} onChange={(e) => setGoldenBaselineRuntimeText(e.target.value)} />
              </label>
              <label className="text-sm">baseline publish result
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={goldenBaselinePublishText} onChange={(e) => setGoldenBaselinePublishText(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 block text-sm">candidate rulepack
              <textarea className="mt-1 h-44 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={goldenCandidateRulepackText} onChange={(e) => setGoldenCandidateRulepackText(e.target.value)} />
            </label>
            {goldenError ? <p className="mt-2 text-sm text-rose-700">{goldenError}</p> : null}
            {goldenBaselineSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">baseline schema</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(goldenBaselineSchema, null, 2)}</pre>
              </details>
            ) : null}
            {goldenReport ? (
              <>
                <p className={`mt-3 rounded border px-3 py-2 text-sm ${((goldenReport?.gate as Record<string, unknown> | undefined)?.blocked ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800")}`}>
                  发布门禁：{((goldenReport?.gate as Record<string, unknown> | undefined)?.blocked ? "golden regression fail（阻断发布）" : "golden regression pass")}
                </p>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">golden_diff_report.json</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(goldenReport, null, 2)}</pre>
                </details>
              </>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Rule Test Center</h2>
            <p className="text-sm text-slate-500">Rule/Gate/Executor 自动测试，支持 sandbox case 自动生成，并输出 test_report.json。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleTestFormCode} onChange={(e) => setRuleTestFormCode(e.target.value)} />
              </label>
              <label className="text-sm">pass_rate_threshold
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={ruleTestThreshold} onChange={(e) => setRuleTestThreshold(e.target.value)} />
              </label>
              <div className="mt-6">
                <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={ruleTestLoading} onClick={() => void runRuleTesting()}>
                  {ruleTestLoading ? "测试中..." : "执行 Rule Test"}
                </button>
              </div>
            </div>
            <label className="mt-3 block text-sm">rulepack（JSON）
              <textarea className="mt-1 h-52 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={ruleTestRulepackText} onChange={(e) => setRuleTestRulepackText(e.target.value)} />
            </label>
            {ruleTestError ? <p className="mt-2 text-sm text-rose-700">{ruleTestError}</p> : null}
            {ruleTestReport ? (
              <>
                <p className={`mt-3 rounded border px-3 py-2 text-sm ${(((ruleTestReport.summary as Record<string, unknown> | undefined)?.publish_gate as Record<string, unknown> | undefined)?.blocked ? "border-rose-300 bg-rose-50 text-rose-800" : "border-emerald-300 bg-emerald-50 text-emerald-800")}`}>
                  发布门禁：{(((ruleTestReport.summary as Record<string, unknown> | undefined)?.publish_gate as Record<string, unknown> | undefined)?.blocked ? "test pass rate < threshold（禁止发布）" : "通过")}
                </p>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">test_report.json</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleTestReport, null, 2)}</pre>
                </details>
              </>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Runtime Metrics Dashboard</h2>
            <p className="text-sm text-slate-500">运行可观测：记录 executor/rule hit/gate pass|fail/runtime error/missing slot/invalid input，并输出 runtime_metrics.json。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={runtimeMetricsFormCode} onChange={(e) => setRuntimeMetricsFormCode(e.target.value)} />
              </label>
              <label className="text-sm">rulepack_version
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={runtimeMetricsRulepackVersion} onChange={(e) => setRuntimeMetricsRulepackVersion(e.target.value)} />
              </label>
              <label className="text-sm">project_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={runtimeMetricsProjectId} onChange={(e) => setRuntimeMetricsProjectId(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={runtimeMetricsLoading} onClick={() => void loadRuntimeObservabilitySchema()}>
                observability schema
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={runtimeMetricsLoading} onClick={() => void loadRuntimeMetrics()}>
                刷新 Runtime Metrics
              </button>
            </div>
            {runtimeMetricsError ? <p className="mt-2 text-sm text-rose-700">{runtimeMetricsError}</p> : null}
            {runtimeMetrics ? (
              <>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <p><strong>pass rate：</strong>{String(((runtimeMetrics.summary as Record<string, unknown> | undefined)?.pass_rate ?? 0))}</p>
                  <p><strong>fail rate：</strong>{String(((runtimeMetrics.summary as Record<string, unknown> | undefined)?.fail_rate ?? 0))}</p>
                  <p><strong>slot missing rate：</strong>{String(((runtimeMetrics.summary as Record<string, unknown> | undefined)?.slot_missing_rate ?? 0))}</p>
                  <p><strong>unresolved rate：</strong>{String(((runtimeMetrics.summary as Record<string, unknown> | undefined)?.unresolved_rate ?? 0))}</p>
                  <p><strong>executor latency(avg ms)：</strong>{String((((runtimeMetrics.summary as Record<string, unknown> | undefined)?.executor_latency as Record<string, unknown> | undefined)?.avg_ms ?? 0))}</p>
                </div>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Top failing rules</summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(runtimeMetrics.top_failing_rules ?? [], null, 2)}</pre>
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">runtime_metrics.json</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(runtimeMetrics, null, 2)}</pre>
                </details>
              </>
            ) : null}
            {runtimeObservabilitySchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">observability schema</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(runtimeObservabilitySchema, null, 2)}</pre>
              </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Rule Heatmap Dashboard</h2>
            <p className="text-sm text-slate-500">识别高风险、高频规则，支持 standard/form_code/project 聚合。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">standard
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={heatmapStandard} onChange={(e) => setHeatmapStandard(e.target.value)} />
              </label>
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={heatmapFormCode} onChange={(e) => setHeatmapFormCode(e.target.value)} />
              </label>
              <label className="text-sm">project
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={heatmapProject} onChange={(e) => setHeatmapProject(e.target.value)} />
              </label>
            </div>
            <div className="mt-3">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={ruleHeatmapLoading} onClick={() => void loadRuleHeatmap()}>
                {ruleHeatmapLoading ? "聚合中..." : "刷新 Rule Heatmap"}
              </button>
            </div>
            {ruleHeatmapError ? <p className="mt-2 text-sm text-rose-700">{ruleHeatmapError}</p> : null}
            {ruleHeatmap ? (
              <>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Top risky rules</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleHeatmap.top_risky_rules ?? [], null, 2)}</pre>
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Most failing gates</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleHeatmap.most_failing_gates ?? [], null, 2)}</pre>
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">Most overridden rules</summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleHeatmap.most_overridden_rules ?? [], null, 2)}</pre>
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">heatmap metrics</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(ruleHeatmap, null, 2)}</pre>
                </details>
              </>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">AI Suggested Fix</h2>
            <p className="text-sm text-slate-500">AI 自动建议修复 unresolved Rule，所有 patch 必须进入 review queue。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiRepairFormCode} onChange={(e) => setAiRepairFormCode(e.target.value)} />
              </label>
              <label className="text-sm">unresolved reason
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiRepairUnresolvedReason} onChange={(e) => setAiRepairUnresolvedReason(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 block text-sm">source clause
              <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiRepairSourceClause} onChange={(e) => setAiRepairSourceClause(e.target.value)} />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">SpecIR（JSON）
                <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiRepairSpecirText} onChange={(e) => setAiRepairSpecirText(e.target.value)} />
              </label>
              <label className="text-sm">nearby resolved rules（JSON 数组）
                <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiRepairNearbyRulesText} onChange={(e) => setAiRepairNearbyRulesText(e.target.value)} />
              </label>
              <label className="text-sm">slot registry（JSON 数组）
                <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiRepairSlotRegistryText} onChange={(e) => setAiRepairSlotRegistryText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiRepairLoading} onClick={() => void loadAIRepairSchemaAndQueue()}>
                加载 schema/queue
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiRepairLoading} onClick={() => void runAIRepairSuggest()}>
                生成 AI 建议
              </button>
            </div>
            {aiRepairError ? <p className="mt-2 text-sm text-rose-700">{aiRepairError}</p> : null}
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">review queue patch_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiRepairSelectedPatchId} onChange={(e) => setAiRepairSelectedPatchId(e.target.value)} />
              </label>
              <div className="mt-6 flex gap-2">
                <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiRepairLoading || !aiRepairSelectedPatchId.trim()} onClick={() => void runAIRepairAction("accept_patch")}>
                  accept patch
                </button>
                <button className="rounded bg-rose-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiRepairLoading || !aiRepairSelectedPatchId.trim()} onClick={() => void runAIRepairAction("reject_suggestion")}>
                  reject suggestion
                </button>
              </div>
            </div>
            <label className="mt-3 block text-sm">manual edit（JSON）
              <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiRepairManualEditText} onChange={(e) => setAiRepairManualEditText(e.target.value)} />
            </label>
            <button className="mt-2 rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiRepairLoading || !aiRepairSelectedPatchId.trim()} onClick={() => void runAIRepairAction("manual_edit")}>
              manual edit
            </button>
            {aiRepairSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">ai repair schema</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiRepairSchema, null, 2)}</pre>
              </details>
            ) : null}
            {aiRepairSuggestResult ? (
              <details className="mt-2 rounded border border-slate-200 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">suggestion + patch workflow</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiRepairSuggestResult, null, 2)}</pre>
              </details>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">review queue</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiRepairQueue, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Conflict Resolution Center</h2>
            <p className="text-sm text-slate-500">多规范融合：国标/行标/地标/企业标准，优先级 enterprise &gt; local &gt; industry &gt; national。</p>
            <label className="mt-2 block text-sm">standards（JSON 数组）
              <textarea className="mt-1 h-52 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={fusionStandardsText} onChange={(e) => setFusionStandardsText(e.target.value)} />
            </label>
            <div className="mt-3">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={fusionLoading} onClick={() => void runFusionManifest()}>
                {fusionLoading ? "融合中..." : "执行 Multi-Standard Fusion"}
              </button>
            </div>
            {fusionError ? <p className="mt-2 text-sm text-rose-700">{fusionError}</p> : null}
            {fusionResult ? (
              <>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">冲突解释（semantic/threshold/duplicate）</summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify((fusionResult.conflict_resolver ?? {}), null, 2)}</pre>
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">fusion_manifest.json</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(fusionResult, null, 2)}</pre>
                </details>
              </>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Knowledge Graph Explorer</h2>
            <p className="text-sm text-slate-500">支持 graph query、impact traversal、semantic search、slotKey usage 查询。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={kgLoading} onClick={() => void runKnowledgeGraphBuild()}>
                {kgLoading ? "处理中..." : "构建知识图谱"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">graph query - node_type
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={kgNodeType} onChange={(e) => setKgNodeType(e.target.value)} placeholder="Rule / Slot / SpecIR ..." />
              </label>
              <label className="text-sm">graph query - keyword
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={kgKeyword} onChange={(e) => setKgKeyword(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={kgLoading} onClick={() => void runKnowledgeGraphQuery()}>graph query</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">impact traversal - start_node_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={kgStartNodeId} onChange={(e) => setKgStartNodeId(e.target.value)} />
              </label>
              <label className="text-sm">semantic search
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={kgSemanticQuery} onChange={(e) => setKgSemanticQuery(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={kgLoading} onClick={() => void runKnowledgeGraphTraverse()}>impact traversal</button>
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={kgLoading} onClick={() => void runKnowledgeGraphSemanticSearch()}>semantic search</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">slotKey usage query
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={kgSlotKey} onChange={(e) => setKgSlotKey(e.target.value)} />
              </label>
              <div className="mt-6">
                <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={kgLoading} onClick={() => void runKnowledgeGraphSlotUsage()}>
                  查询“某个 slotKey 被哪些规范使用”
                </button>
              </div>
            </div>
            {kgError ? <p className="mt-2 text-sm text-rose-700">{kgError}</p> : null}
            {kgSlotUsageResult ? (
              <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                {String((kgSlotUsageResult.explanation as string | undefined) || "")}
              </p>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">knowledge_graph.json</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(kgGraph, null, 2)}</pre>
            </details>
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">graph query result</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(kgQueryResult, null, 2)}</pre>
            </details>
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">impact traversal result</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(kgTraverseResult, null, 2)}</pre>
            </details>
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">semantic search result</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(kgSemanticResult, null, 2)}</pre>
            </details>
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">slotKey usage result</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(kgSlotUsageResult, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Semantic Explainability</h2>
            <p className="text-sm text-slate-500">从规范文本直接提取 Semantic SpecIR，并解释 AI 为什么生成这个 SpecIR。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">clause text
                <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={semanticClauseText} onChange={(e) => setSemanticClauseText(e.target.value)} />
              </label>
              <label className="text-sm">table cell
                <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={semanticTableCellText} onChange={(e) => setSemanticTableCellText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">formula
                <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={semanticFormulaText} onChange={(e) => setSemanticFormulaText(e.target.value)} />
              </label>
              <label className="text-sm">note
                <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={semanticNoteText} onChange={(e) => setSemanticNoteText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={semanticLoading} onClick={() => void loadSemanticSchema()}>
                semantic parser schema
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={semanticLoading} onClick={() => void runSemanticParse()}>
                解析 Semantic SpecIR
              </button>
            </div>
            {semanticError ? <p className="mt-2 text-sm text-rose-700">{semanticError}</p> : null}
            {semanticParseResult ? (
              <p className="mt-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                AI 为什么生成这个 SpecIR：{String(((semanticParseResult.reasoning as Record<string, unknown> | undefined)?.why_this_specir ?? ""))}
              </p>
            ) : null}
            {semanticSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">semantic parser schema</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(semanticSchema, null, 2)}</pre>
              </details>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Semantic SpecIR / reasoning / evidence / confidence</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(semanticParseResult, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Slot Recommendation Panel</h2>
            <p className="text-sm text-slate-500">AI 自动识别并推荐 slotKey；confidence &gt;= 0.92 自动绑定，否则进入人工复核队列。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={slotRecFormCode} onChange={(e) => setSlotRecFormCode(e.target.value)} />
              </label>
              <label className="text-sm lg:col-span-2">semantic_type
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={slotRecSemanticType} onChange={(e) => setSlotRecSemanticType(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 block text-sm">clause
              <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={slotRecClause} onChange={(e) => setSlotRecClause(e.target.value)} />
            </label>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">nearby slots
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={slotRecNearbySlotsText} onChange={(e) => setSlotRecNearbySlotsText(e.target.value)} />
              </label>
              <label className="text-sm">historical mappings
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={slotRecHistoricalMappingsText} onChange={(e) => setSlotRecHistoricalMappingsText(e.target.value)} />
              </label>
              <label className="text-sm">blueprint context
                <textarea className="mt-1 h-40 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={slotRecBlueprintContextText} onChange={(e) => setSlotRecBlueprintContextText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={slotRecLoading} onClick={() => void runSlotRecommendation()}>
                {slotRecLoading ? "推荐中..." : "执行 Slot 推荐"}
              </button>
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={slotRecLoading} onClick={() => void loadSlotRecommendationQueue()}>
                刷新 human review queue
              </button>
            </div>
            {slotRecError ? <p className="mt-2 text-sm text-rose-700">{slotRecError}</p> : null}
            {slotRecResult ? (
              <>
                <p className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  auto bind: {Array.isArray(slotRecResult.auto_bound) ? slotRecResult.auto_bound.length : 0} | human review: {Array.isArray(slotRecResult.human_review_queue) ? slotRecResult.human_review_queue.length : 0}
                </p>
                <details className="mt-2 rounded border border-slate-200 p-3" open>
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">slot recommendation engine 输出</summary>
                  <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(slotRecResult, null, 2)}</pre>
                </details>
              </>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">human review queue</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(slotRecQueueItems, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Constraint Tree</h2>
            <p className="text-sm text-slate-500">AI 理解工况条件、适用范围、特殊例外、前置条件和联合条件，并输出 constraint_reasoning。</p>
            <label className="mt-3 block text-sm">clause
              <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={constraintClauseText} onChange={(e) => setConstraintClauseText(e.target.value)} />
            </label>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={constraintLoading} onClick={() => void loadConstraintSchema()}>
                condition schema
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={constraintLoading} onClick={() => void runConstraintReasoner()}>
                运行 Constraint Reasoner
              </button>
            </div>
            {constraintError ? <p className="mt-2 text-sm text-rose-700">{constraintError}</p> : null}
            {constraintResult ? (
              <details className="mt-2 rounded border border-slate-200 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">constraint + constraint_reasoning</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(constraintResult, null, 2)}</pre>
              </details>
            ) : null}
            {constraintSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">condition schema</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(constraintSchema, null, 2)}</pre>
              </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Formula Explainability</h2>
            <p className="text-sm text-slate-500">自动识别公式、变量、输入输出、单位，并生成 AST、slot dependency 与 runtime formula executor。</p>
            <label className="mt-3 block text-sm">clause
              <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={formulaClauseText} onChange={(e) => setFormulaClauseText(e.target.value)} />
            </label>
            <label className="mt-3 block text-sm">formula
              <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 font-mono text-sm" value={formulaText} onChange={(e) => setFormulaText(e.target.value)} />
            </label>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={formulaLoading} onClick={() => void loadFormulaSchema()}>
                formula parser / AST schema
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={formulaLoading} onClick={() => void runFormulaIntelligence()}>
                解析并生成 runtime executor
              </button>
            </div>
            {formulaError ? <p className="mt-2 text-sm text-rose-700">{formulaError}</p> : null}
            {formulaSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">formula parser / AST schema / runtime integration</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(formulaSchema, null, 2)}</pre>
              </details>
            ) : null}
            {formulaResult ? (
              <details className="mt-2 rounded border border-slate-200 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">formula_latex / formula_ast / inputs / output / unit_mapping</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(formulaResult, null, 2)}</pre>
              </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Layout Semantic Viewer</h2>
            <p className="text-sm text-slate-500">Multi-Modal Document AI：理解布局、表格、图示与公式，输出 layout_semantic_ir（保留 bbox 与 evidence span）。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <label className="text-sm">document_type
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={layoutDocType} onChange={(e) => setLayoutDocType(e.target.value as "pdf" | "word" | "scanned_image" | "screenshot")}>
                  <option value="pdf">PDF</option>
                  <option value="word">Word</option>
                  <option value="scanned_image">Scanned image</option>
                  <option value="screenshot">Screenshot</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block text-sm">content text
              <textarea className="mt-1 h-44 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={layoutContentText} onChange={(e) => setLayoutContentText(e.target.value)} />
            </label>
            <div className="mt-3 flex gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={layoutLoading} onClick={() => void loadLayoutSemanticSchema()}>
                layout schema
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={layoutLoading} onClick={() => void runLayoutSemanticAnalyze()}>
                分析 layout semantic ir
              </button>
            </div>
            {layoutError ? <p className="mt-2 text-sm text-rose-700">{layoutError}</p> : null}
            {layoutSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">layout schema</summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(layoutSchema, null, 2)}</pre>
              </details>
            ) : null}
            {layoutResult ? (
              <details className="mt-2 rounded border border-slate-200 p-3" open>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">layout_semantic_ir / OCR fusion strategy / semantic layout engine</summary>
                <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(layoutResult, null, 2)}</pre>
              </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Review Queue 2.0</h2>
            <p className="text-sm text-slate-500">confidence governance：&gt;=0.92 自动通过，0.75~0.92 需复核，&lt;0.75 阻断；队列按 confidence + impact score 排序。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-4">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={hitl2FormCode} onChange={(e) => setHitl2FormCode(e.target.value)} />
              </label>
              <label className="text-sm">confidence
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={hitl2Confidence} onChange={(e) => setHitl2Confidence(e.target.value)} />
              </label>
              <label className="text-sm">impact_score
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={hitl2ImpactScore} onChange={(e) => setHitl2ImpactScore(e.target.value)} />
              </label>
              <label className="text-sm">reviewer
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={hitl2Reviewer} onChange={(e) => setHitl2Reviewer(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 block text-sm">candidate（JSON）
              <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={hitl2CandidateText} onChange={(e) => setHitl2CandidateText(e.target.value)} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={hitl2Loading} onClick={() => void loadHITL2GovernanceAndQueue()}>
                刷新 governance / queue
              </button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={hitl2Loading} onClick={() => void enqueueHITL2ReviewCandidate()}>
                enqueue candidate
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">patch_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={hitl2PatchId} onChange={(e) => setHitl2PatchId(e.target.value)} />
              </label>
              <label className="text-sm">edit payload（JSON）
                <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={hitl2EditPayloadText} onChange={(e) => setHitl2EditPayloadText(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={hitl2Loading || !hitl2PatchId.trim()} onClick={() => void runHITL2ReviewerAction("accept")}>accept</button>
              <button className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={hitl2Loading || !hitl2PatchId.trim()} onClick={() => void runHITL2ReviewerAction("edit")}>edit</button>
              <button className="rounded bg-rose-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={hitl2Loading || !hitl2PatchId.trim()} onClick={() => void runHITL2ReviewerAction("reject")}>reject</button>
            </div>
            {hitl2Error ? <p className="mt-2 text-sm text-rose-700">{hitl2Error}</p> : null}
            {hitl2Governance ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">confidence governance</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(hitl2Governance, null, 2)}</pre>
              </details>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">review queue（confidence + impact score）</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(hitl2QueueItems, null, 2)}</pre>
            </details>
            <details className="mt-2 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">AI learning loop</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(hitl2LearningLoop, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">AI Patch Center</h2>
            <p className="text-sm text-slate-500">AI 自动修复 unresolved SpecIR/Rule，patch 具备 versioned / reviewable / revertable。</p>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">form_code
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiPatchFormCode} onChange={(e) => setAiPatchFormCode(e.target.value)} />
              </label>
              <label className="text-sm">unresolved reason
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiPatchReason} onChange={(e) => setAiPatchReason(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">nearby rules
                <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiPatchNearbyRulesText} onChange={(e) => setAiPatchNearbyRulesText(e.target.value)} />
              </label>
              <label className="text-sm">slot graph
                <textarea className="mt-1 h-28 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiPatchSlotGraphText} onChange={(e) => setAiPatchSlotGraphText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">historical fixes
                <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiPatchHistoricalFixesText} onChange={(e) => setAiPatchHistoricalFixesText(e.target.value)} />
              </label>
              <label className="text-sm">semantic context
                <textarea className="mt-1 h-24 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiPatchSemanticContextText} onChange={(e) => setAiPatchSemanticContextText(e.target.value)} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading} onClick={() => void loadAIPatchCenter()}>加载 patch schema / list</button>
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading} onClick={() => void runSuggestAIPatch()}>生成 suggested patch</button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="text-sm">selected patch_id
                <input className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm" value={aiPatchSelectedId} onChange={(e) => setAiPatchSelectedId(e.target.value)} />
              </label>
              <label className="text-sm">edit payload
                <textarea className="mt-1 h-20 w-full rounded border border-slate-300 px-2 py-2 font-mono text-xs" value={aiPatchEditPayloadText} onChange={(e) => setAiPatchEditPayloadText(e.target.value)} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading || !aiPatchSelectedId.trim()} onClick={() => void runAIPatchReview("accept")}>accept</button>
              <button className="rounded bg-amber-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading || !aiPatchSelectedId.trim()} onClick={() => void runAIPatchReview("edit")}>edit</button>
              <button className="rounded bg-rose-700 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading || !aiPatchSelectedId.trim()} onClick={() => void runAIPatchReview("reject")}>reject</button>
              <button className="rounded bg-slate-600 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={aiPatchLoading || !aiPatchSelectedId.trim()} onClick={() => void runAIPatchRevert()}>revert</button>
            </div>
            {aiPatchError ? <p className="mt-2 text-sm text-rose-700">{aiPatchError}</p> : null}
            {aiPatchSchema ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">patch schema</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiPatchSchema, null, 2)}</pre>
              </details>
            ) : null}
            {aiPatchSuggestResult ? (
              <details className="mt-2 rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">suggestion + patch review workflow + revert strategy</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiPatchSuggestResult, null, 2)}</pre>
              </details>
            ) : null}
            <details className="mt-2 rounded border border-slate-200 p-3" open>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">versioned patches</summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(aiPatchListItems, null, 2)}</pre>
            </details>
          </section>
        ) : null}

        {showExecutor && showTechnicalDetails ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <article className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">当前检测点</h2>
            <p className="mt-1 text-sm text-slate-500">当前检测点：K19+070（实际路基检测位置）</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded bg-blue-600 px-3 py-2 text-white" type="button" disabled={loading} onClick={() => void handleImportSlot()}>
                导入 / 读取 K19+070
              </button>
            </div>
            <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
              <p><strong>桩号:</strong> {slot?.geo.station ?? "K19+070"}</p>
              <p><strong>坐标:</strong> {slot ? `${slot.geo.x}, ${slot.geo.y}` : "-"}</p>
              <p><strong>高程:</strong> {slot?.geo.elevation ?? "-"}</p>
              <p><strong>线路:</strong> {slot?.geo.alignment ?? "-"}</p>
            </div>
          </article>

          <article className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">当前验收单元</h2>
            <p className="mt-1 text-sm text-slate-500">当前验收单元：该桩号的验收执行单元</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60"
                type="button"
                disabled={loading || !slot || !hasAllTemplateSpus}
                onClick={() => void handleCreateContainer()}
              >
                创建新验收单元并绑定三件套检测规则
              </button>
              {container ? (
                <button className="rounded bg-slate-200 px-3 py-2 text-slate-800" type="button" onClick={() => void refreshContainerState(container.containerId)}>
                  刷新验收单元
                </button>
              ) : null}
            </div>
            <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
              <p><strong>验收单元状态:</strong> {normalizeLifecycleLabel(container?.lifecycleState)}</p>
              <p><strong>绑定检测规则数:</strong> {container?.specBindings.length ?? 0}</p>
              <p><strong>是否可归档:</strong> {isArchived ? "已归档" : canArchive ? "是" : "否"}</p>
            </div>
          </article>
          </section>
        ) : null}

        {showExecutor && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">验收进度</h2>
          <div className="mt-2 flex flex-wrap items-center gap-6 text-sm">
            <p className="font-semibold">验收进度：{passedCount} / {requiredSpuIds.length} 检测规则已通过</p>
            <p>当前阶段：{normalizeLifecycleLabel(container?.lifecycleState ?? "DRAFT")}</p>
            <p>验收单元聚合状态：{sanitizeUiText(String(container?.overallStatus ?? "-"))}</p>
          </div>
          </section>
        ) : null}

        {showExecutor && !completionCardVisible ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">👉 当前任务</h2>
            <p className="mt-2 text-base font-semibold text-slate-900">👉 当前检测：{sanitizeUiText(currentTaskDisplay)}</p>
            <p className="mt-1 text-sm text-slate-600">当前状态：{normalizeNormExecutionStatusLabel(selectedNormStatus)}</p>
          </section>
        ) : null}

        {showExecutor && completionCardVisible ? (
          <section className="rounded-xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 p-5 shadow-md">
            <h2 className="text-2xl font-bold text-emerald-900">✅ 检测已完成</h2>
            <div className="mt-3 space-y-1 text-sm text-emerald-900">
              <p>* 当前检测项：{sanitizeUiText(completionTaskName)}</p>
              <p>* 检测结果：合格</p>
              <p>* 当前检测点：{completionCheckpoint} 已完成</p>
            </div>
            <button
              className="mt-4 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              type="button"
              disabled={loading}
              onClick={() => void handleGenerateAcceptanceReport()}
            >
              👉 生成验收报告
            </button>
          </section>
        ) : null}

        {showExecutor && !completionCardVisible ? (
          <section
          ref={(el) => {
            executionSectionRef.current = el;
          }}
          className="rounded-xl bg-white p-4 shadow-sm"
        >
          <h2 className="text-lg font-semibold">👉 核心操作区</h2>
          <p className="text-sm text-slate-500">表单填写 → 自动计算与判定 → 检测签字（验收签字） → 完成当前检测</p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-60"
              type="button"
              disabled={currentTaskPrimaryDisabled}
              onClick={() => void handleRunCurrentTask()}
            >
              {currentTaskPrimaryLabel}
            </button>
            {pendingSignRoles.length > 0 ? (
              <p className="text-xs text-slate-600">待检测签字角色：{pendingSignRoles.map((role) => roleLabel(role)).join("、")}</p>
            ) : null}
          </div>
          {!currentExecutionRuleBinding ? (
            <p className="mt-2 text-xs text-amber-700">请先选择并绑定规范版本（rule_id + version）后再执行检测。</p>
          ) : null}
          {selectedNormStatus === "blocked" ? <p className="mt-2 text-sm text-amber-700">当前检测不可执行（依赖未完成）：请先完成前置工序。</p> : null}
          {currentExecutionRuleBinding ? (
            <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p><strong>依据：</strong>{sanitizeUiText(executionDecisionBasis)}</p>
              <p><strong>规则版本：</strong>{formatSpecVersionLabel(latestRuleVersion)}</p>
              <p><strong>Proof ID：</strong>{latestProofId}</p>
              <div className="mt-3 rounded border border-emerald-300 bg-white/80 p-3 text-slate-800">
                <p className="font-semibold text-emerald-900">规范依据</p>
                <p className="mt-1"><strong>标准编号：</strong>{currentRuleEvidence.standardCode}</p>
                <p><strong>条款号：</strong>{currentRuleEvidence.clauseNo}</p>
                <p><strong>条款标题：</strong>{currentRuleEvidence.clauseTitle}</p>
                <p><strong>条款ID：</strong>{currentRuleEvidence.clauseId || "-"}</p>
                <div className="mt-2">
                  <button
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                    disabled={currentRuleEvidence.clauseNo === "-"}
                    onClick={() => setIsClauseSourceDialogOpen(true)}
                  >
                    查看条款原文
                  </button>
                  {!currentRuleEvidence.clauseContent ? (
                    <p className="mt-1 text-xs text-amber-700">当前规则暂无可展示的条款原文。</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {showTechnicalDetails && latestGateStatePatch ? (
            <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">本次 Gate 回写</p>
              <p className="mt-1">node: {latestGateStatePatch.nodeId} / {latestGateStatePatch.nodeStatus}</p>
              <p>container: {latestGateStatePatch.containerId ?? "-"} / {latestGateStatePatch.containerLifecycleState ?? "-"}</p>
              <p>overall: {latestGateStatePatch.containerOverallStatus ?? "-"}</p>
              <details className="mt-2 rounded border border-blue-200 bg-white p-2 text-xs">
                <summary className="cursor-pointer font-medium text-blue-700">查看 Proof Fragment</summary>
                <pre className="mt-2 max-h-52 overflow-auto rounded bg-slate-900 p-2 text-slate-100">
                  {JSON.stringify(latestGateProofFragment, null, 2)}
                </pre>
              </details>
            </div>
          ) : null}

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <article className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold">1. FormPeg 自动表单</p>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {formPegSchema?.fields.map((field) => (
                  <label key={field.name} className="text-sm">
                    <span className="mb-1 block">
                      {field.label}（{field.name}）
                      {field.required ? <span className="ml-1 text-rose-600">*</span> : null}
                    </span>
                    <p className="mb-1 text-xs text-slate-500">
                      {field.unit ? `单位: ${field.unit}` : "单位: -"}
                      {field.range.min !== null || field.range.max !== null
                        ? ` | 范围: ${field.range.min ?? "-"} ~ ${field.range.max ?? "-"}`
                        : ""}
                    </p>
                    {field.type === "boolean" ? (
                      <select
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        value={formValues[field.name] ?? ""}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      >
                        <option value="">请选择</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        className="w-full rounded border border-slate-300 px-2 py-1"
                        type="text"
                        value={formValues[field.name] ?? ""}
                        placeholder={field.unit ? `示例: 12 ${field.unit}` : "请输入"}
                        onChange={(event) => setFormValues((prev) => ({ ...prev, [field.name]: event.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              {showTechnicalDetails ? (
                <div className="mt-3 rounded bg-slate-50 p-2 text-xs text-slate-700">
                  <p>离线草稿缓存：{offlineDraftSavedAt || "未缓存"}</p>
                  <p>缓存键：{formPegDraftStorageKey}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button className="rounded bg-slate-200 px-2 py-1" type="button" disabled={!selectedSpu} onClick={() => handleCopyCurrentFormToBatch()}>
                      当前表单加入批量
                    </button>
                    <button className="rounded bg-slate-200 px-2 py-1" type="button" disabled={!selectedSpu} onClick={() => handleClearOfflineDraft()}>
                      清除离线草稿
                    </button>
                  </div>
                </div>
              ) : null}
              {formPegMissingFields.length > 0 ? (
                <p className="mt-2 text-xs text-amber-700">缺失必填项：{formPegMissingFields.join(", ")}</p>
              ) : null}
              {formPegValidationIssues.length > 0 ? (
                <div className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-700">
                  {formPegValidationIssues.slice(0, 3).map((issue, index) => (
                    <p key={`${issue.field}-${index}`}>{issue.field}: {issue.message}</p>
                  ))}
                </div>
              ) : null}
              {formPegPreview?.ready && formPegPreview.normalization?.conversions.length ? (
                <div className="mt-2 rounded bg-emerald-50 p-2 text-xs text-emerald-700">
                  {formPegPreview.normalization.conversions.map((item) => (
                    <p key={`${item.field}-${item.fromUnit}-${item.toUnit}`}>
                      单位自动换算：{item.field} {item.originalValue} {item.fromUnit} {"->"} {item.normalizedValue} {item.toUnit}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>

            <article className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold">2. 自动计算 + 实时判定</p>
              <div className="mt-2 text-sm">
                <p>检测结果：</p>
                <div className="mt-1 rounded bg-slate-50 p-2">
                  {Object.keys(liveOutputs).length > 0 ? (
                    Object.entries(liveOutputs).map(([key, value]) => (
                      <p key={key}>
                        {key}: <span className="font-medium">{String(value)}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">尚无检测输出</p>
                  )}
                </div>
                <div className="mt-2 rounded bg-slate-50 p-2 text-xs text-slate-700">
                  <p>当前位置：{slot?.geo.station ?? "K19+070"}</p>
                  <p>验收单元状态：{normalizeLifecycleLabel(container?.lifecycleState)}</p>
                  <p>实时预判：{formPegPreview?.ready ? "进行中" : "未开始"}</p>
                </div>
                <p className="mt-2">
                  判定结论：
                  <span className={liveGatePassed ? "ml-1 font-semibold text-emerald-700" : "ml-1 font-semibold text-rose-700"}>
                    {liveGatePassed === null ? "未开始" : liveGatePassed ? "已完成" : "进行中"}
                  </span>
                </p>
                <div className="mt-1 space-y-1 rounded bg-slate-50 p-2 text-xs">
                  {thresholdCards.length > 0 ? (
                    thresholdCards.map((item) => (
                      <p key={item.ruleId}>
                        {item.field} {item.operator} {String(item.threshold)}，当前值 {String(item.actual)}
                      </p>
                    ))
                  ) : (
                    <p className="text-slate-500">尚未执行规则判定</p>
                  )}
                </div>
              </div>
            </article>

            <article className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold">3. 检测签字（验收签字）</p>
              <div className="mt-2 space-y-1 text-sm">
                <p>需要检测签字角色：</p>
                {requiredRoles.length === 0 ? <p className="text-slate-500">暂无检测签字要求</p> : null}
                {requiredRoles.map((role) => (
                  <p key={role}>
                    {roleLabel(role)}：
                    <span className={signedBySet.has(role) ? "ml-1 text-emerald-700" : "ml-1 text-amber-700"}>
                      {signedBySet.has(role) ? "已签字" : "未签字"}
                    </span>
                  </p>
                ))}
                <p className="pt-2 text-xs text-slate-500">完成检测签字（验收签字）后，点击上方主按钮即可完成当前检测。</p>
              </div>
            </article>
          </div>

          <article className="mt-4 rounded border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">👉 多点检测（批量执行）</p>
                <p className="mt-1 text-xs text-slate-500">适用于同一检测项在多个点位批量录入并统一判定</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded bg-slate-200 px-3 py-1 text-sm" type="button" disabled={!selectedSpu} onClick={() => handleAddBatchRow()}>
                  添加批量行
                </button>
                <button
                  className="rounded bg-blue-600 px-3 py-1 text-sm font-semibold text-white"
                  type="button"
                  disabled={!selectedSpu || !container || batchRows.length === 0}
                  onClick={() => void handleSubmitBatchRows()}
                >
                  👉 批量执行检测
                </button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">点位</th>
                    {formPegSchema?.fields.map((field) => (
                      <th key={`batch-header-${field.name}`} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">
                        {field.label}
                      </th>
                    ))}
                    <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">状态</th>
                    <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, rowIndex) => (
                    <tr key={row.rowId}>
                      <td className="border border-slate-200 px-2 py-1">
                        <input
                          className="w-24 rounded border border-slate-300 px-2 py-1"
                          value={row.pointLabel}
                          onChange={(event) => handleBatchRowPointLabelChange(row.rowId, event.target.value)}
                        />
                      </td>
                      {formPegSchema?.fields.map((field) => (
                        <td key={`${row.rowId}-${field.name}`} className="border border-slate-200 px-2 py-1">
                          <input
                            className="w-28 rounded border border-slate-300 px-2 py-1"
                            value={row.values[field.name] ?? ""}
                            placeholder={field.unit ?? ""}
                            onChange={(event) => handleBatchRowValueChange(row.rowId, field.name, event.target.value)}
                          />
                        </td>
                      ))}
                      <td className="border border-slate-200 px-2 py-1">
                        <p>{normalizeBatchRowStatusLabel(row.status)}</p>
                        {row.message ? <p className="text-slate-500">{row.message}</p> : null}
                        {row.proofId || row.proofHash ? (
                          <p className="text-slate-500">验收结果: {row.proofId ?? "-"} / {row.proofHash ?? "-"}</p>
                        ) : null}
                      </td>
                      <td className="border border-slate-200 px-2 py-1">
                        <div className="flex flex-col gap-1">
                          <button className="rounded bg-slate-200 px-2 py-1" type="button" onClick={() => handleApplyBatchRowToMainForm(row.rowId)}>
                            回填主表单
                          </button>
                          <button
                            className="rounded bg-slate-200 px-2 py-1 disabled:opacity-50"
                            type="button"
                            disabled={rowIndex === 0}
                            onClick={() => handleCopyPreviousBatchRow(row.rowId)}
                          >
                            一键复制上一行
                          </button>
                          <button className="rounded bg-slate-200 px-2 py-1" type="button" onClick={() => handleRemoveBatchRow(row.rowId)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {batchEvaluateResult ? (
              <p className="mt-2 text-xs text-slate-600">
                最近批量结果：总计={batchEvaluateResult.summary.total}，已完成={batchEvaluateResult.summary.passed}，进行中={batchEvaluateResult.summary.failed}，不可执行（依赖未完成）={batchEvaluateResult.summary.blocked}
              </p>
            ) : null}
          </article>

          {showTechnicalDetails ? (
          <details className="mt-4 rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">查看技术细节（JSON）</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-slate-700">节点 JSON</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(selectedNode ?? null, null, 2)}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">执行结果 JSON</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(selectedNode?.outputs ?? {}, null, 2)}</pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Proof JSON</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(selectedNode?.proof ?? null, null, 2)}</pre>
              </div>
            </div>
          </details>
          ) : null}
          </section>
        ) : null}

        {showExecutor && !completionCardVisible ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">其他待检测项（{otherPendingCount}项）</summary>
              <div className="mt-3 space-y-2 text-sm">
                {otherPendingBindings.length === 0 ? <p className="text-slate-500">当前无其他待检测项。</p> : null}
                {otherPendingBindings.map(({ spuId, definition, normStatus }) => {
                  const clause = resolveRuleClauseForUi(definition, spuId);
                  return (
                    <div key={`other-${spuId}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                      <p className="font-medium">{formatRuleDisplayName(definition, spuId)}</p>
                      <p className="text-xs text-slate-600">{clause ? `条款 ${clause}` : "条款 -"}</p>
                      <p className={`text-xs font-semibold ${normExecutionStatusColorClass(normStatus)}`}>{normalizeNormExecutionStatusLabel(normStatus)}</p>
                    </div>
                  );
                })}
              </div>
            </details>
          </section>
        ) : null}

        {showExecutor && !completionCardVisible ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">👉 下一步操作</h2>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm">
                <p className="font-semibold">当前状态：</p>
                <p className="mt-1">{safeNextStepCurrentStatus}</p>
                <p className="mt-3 font-semibold">建议操作：</p>
                <p className="mt-1">{safeNextStepSuggestion}</p>
              </div>
              <button
                className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-60"
                type="button"
                disabled={loading || (!isProjectReadyForReport && !hasSuggestedNextCheckpoint)}
                onClick={() => void (isProjectReadyForReport ? handleGenerateAcceptanceReport() : handleGoToNextCheckpoint())}
              >
                {isProjectReadyForReport ? "生成验收报告" : "前往下一个检测点"}
              </button>
            </div>
            {schedulerApiWarning ? (
              <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                下一步操作提示暂不可用，请稍后刷新。
              </p>
            ) : null}
          </section>
        ) : null}

        {showExecutor && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">复检记录</h2>
            <p className="text-sm text-slate-500">每个检测项按时间线展示复检历史，点击条目可展开查看输入参数与判定过程。</p>
            <div className="mt-3 space-y-3">
              {templateBindings.map(({ spuId, definition, attempts }) => (
                <div key={`timeline-${spuId}`} className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-semibold">{formatRuleDisplayName(definition, spuId)}</p>
                  <div className="mt-3 border-l border-slate-200 pl-4">
                    {attempts.length === 0 ? <p className="text-slate-500">暂无执行</p> : null}
                    {attempts.map((node) => {
                      const normalized = normalizeNodeStatusForDisplay(node.status);
                      const timelineStatus = normalized === "PASS" ? "PASS" : normalized === "FAIL" ? "FAIL" : normalized === "RUNNING" ? "RUNNING" : "DRAFT";
                      const passOrFailLabel = timelineStatus === "PASS" ? "通过" : timelineStatus === "FAIL" ? "未通过" : timelineStatus === "RUNNING" ? "进行中" : "未开始";
                      const resultCode = timelineStatus === "PASS" || timelineStatus === "FAIL" ? timelineStatus : "进行中";
                      const statusTextColor = timelineStatus === "PASS" ? "text-emerald-700" : timelineStatus === "FAIL" ? "text-rose-700" : "text-slate-600";
                      const dotColorClass = timelineStatus === "PASS" ? "bg-emerald-500" : timelineStatus === "FAIL" ? "bg-rose-500" : "bg-slate-400";
                      return (
                        <div key={node.nodeId} className="relative pb-3 last:pb-0">
                          <span className={`absolute -left-[22px] top-4 h-3 w-3 rounded-full ${dotColorClass}`} />
                          <details className="rounded border border-slate-200 bg-slate-50 p-2">
                            <summary className="cursor-pointer list-none" onClick={() => setSelectedNodeId(node.nodeId)}>
                              <div className="text-xs">
                                <p className="font-semibold text-slate-900">
                                  ● 第{node.attemptIndex}次检测（<span className={statusTextColor}>{passOrFailLabel}</span>）
                                </p>
                                <p className="mt-1 text-slate-600">时间：{formatTimelineTime(node.updatedAt || node.createdAt)}</p>
                                <p>
                                  结果：<span className={`font-semibold ${statusTextColor}`}>{resultCode}</span>
                                </p>
                              </div>
                            </summary>
                            <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 text-xs">
                              <div>
                                <p className="font-semibold text-slate-700">输入参数</p>
                                {Object.keys(node.inputs ?? {}).length > 0 ? (
                                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-900 p-2 text-slate-100">
                                    {JSON.stringify(node.inputs, null, 2)}
                                  </pre>
                                ) : (
                                  <p className="mt-1 text-slate-500">暂无输入参数</p>
                                )}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-700">判定过程</p>
                                {node.gate.results.length > 0 ? (
                                  <div className="mt-1 space-y-1">
                                    {node.gate.results.map((ruleResult, index) => (
                                      <p key={`${node.nodeId}-${ruleResult.ruleId}-${index}`} className={ruleResult.passed ? "text-emerald-700" : "text-rose-700"}>
                                        规则{index + 1}：{ruleResult.field} {ruleResult.operator} {String(ruleResult.threshold)}，实际值 {String(ruleResult.actual)}，结果 {ruleResult.passed ? "PASS" : "FAIL"}
                                      </p>
                                    ))}
                                  </div>
                                ) : node.trace.length > 0 ? (
                                  <div className="mt-1 space-y-1">
                                    {node.trace.map((traceItem, index) => (
                                      <p key={`${node.nodeId}-trace-${index}`} className="text-slate-700">
                                        步骤{traceItem.stepIndex ?? index + 1}：{traceItem.formula} = {String(traceItem.result)}
                                      </p>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-1 text-slate-500">暂无判定过程</p>
                                )}
                              </div>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {showTechnicalDetails ? (
            <details className="mt-4 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">查看技术细节（审计日志）</summary>
              <div className="mt-2 max-h-64 space-y-2 overflow-auto text-xs">
                {auditEvents.map((event, index) => (
                  <div key={`${event.timestamp}-${index}`} className="rounded bg-slate-50 p-2">
                    <p>{event.timestamp}</p>
                    <p className="font-semibold">{event.eventType}</p>
                    {event.actor ? <p>actor: {event.actor}</p> : null}
                    <pre className="overflow-auto">{JSON.stringify(event.payload, null, 2)}</pre>
                  </div>
                ))}
              </div>
            </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
            <div className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-6 text-center">
              <p className="text-3xl font-bold text-emerald-900">✅ 本检测点验收完成（{runtimeResultCode}）</p>
            </div>

            <div className="mt-4 rounded border border-slate-200 p-4">
              <h2 className="text-lg font-semibold">验收报告（Proof 绑定）</h2>
              <p className="mt-1 text-sm text-slate-600">
                {runtimeProofBound
                  ? "当前报告已绑定 Proof，可作为可追溯验收凭证。"
                  : "当前报告未绑定 Proof，不能作为正式验收凭证。"}
              </p>
              {!runtimeProofBound ? (
                <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  缺少 Proof 绑定，请先完成检测并生成 Proof 后再查看验收报告。
                </p>
              ) : null}
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                {runtimeReportFields.map((field) => (
                  <p key={field.label}><strong>{field.label}：</strong>{field.value}</p>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60"
                type="button"
                disabled={!container || !runtimeProofBound}
                onClick={() => void handleGenerateAcceptanceReport()}
              >
                👉 查看验收报告
              </button>
              <button
                className="rounded bg-slate-200 px-3 py-2 text-slate-800 disabled:opacity-60"
                type="button"
                disabled={!proof || !runtimeProofBound}
                onClick={() => exportProof("json")}
              >
                👉 下载 Proof（JSON）
              </button>
            </div>

            {showTechnicalDetails ? (
            <details className="mt-4 rounded border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">查看技术细节（验收状态与结果）</summary>
              <div className="mt-2 rounded border border-slate-200 p-3 text-sm">
                <p><strong>验收单元状态:</strong> {normalizeLifecycleLabel(container?.lifecycleState)}</p>
                <p><strong>可归档:</strong> {isArchived ? "已归档（不可重复归档）" : canArchive ? "是" : "否"}</p>
                <p><strong>聚合结果:</strong> {sanitizeUiText(String(container?.overallStatus ?? "-"))}</p>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-sm font-semibold">验收结果（JSON）</p>
                <pre className="max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(proof, null, 2)}</pre>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-sm font-semibold">当前 Node JSON</p>
                <pre className="max-h-64 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{JSON.stringify(selectedNode, null, 2)}</pre>
              </div>
            </details>
            ) : null}
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">LayerPeg 文档</h2>
          <p className="text-sm text-slate-500">可按规范 / 节点 / 容器 Proof 拉取 LayerPeg Header/Gate/Body/Proof/State 一体化文档。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={layerPegLoading || !selectedSpuId} onClick={() => void handleLoadLayerPegSpec()}>
              读取规范文档
            </button>
            <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={layerPegLoading || !selectedNodeId} onClick={() => void handleLoadLayerPegNode()}>
              读取节点文档
            </button>
            <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={layerPegLoading || !container?.containerId} onClick={() => void handleLoadLayerPegContainerProof()}>
              读取容器 Proof 文档
            </button>
            <button className="rounded bg-slate-200 px-3 py-2 text-slate-800 disabled:opacity-60" type="button" disabled={layerPegLoading} onClick={() => void refreshLayerPegLedger()}>
              刷新 LayerPeg 文档账本
            </button>
          </div>
          {layerPegLoading ? <p className="mt-2 text-sm text-blue-700">LayerPeg 文档读取中...</p> : null}
          {layerPegError ? <p className="mt-2 text-sm text-rose-700">{layerPegError}</p> : null}
          <div className="mt-3 rounded border border-slate-200 p-3">
            <p className="text-sm font-semibold">LayerPeg 文档账本索引</p>
            {layerPegLedgerItems.length === 0 ? <p className="mt-1 text-xs text-slate-500">暂无记录</p> : null}
            <div className="mt-2 max-h-40 space-y-2 overflow-auto text-xs">
              {layerPegLedgerItems.map((item) => (
                <button
                  key={item.usi}
                  type="button"
                  className="block w-full rounded bg-slate-50 px-2 py-1 text-left hover:bg-slate-100"
                  onClick={() => void handleLoadLayerPegFromLedger(item.usi)}
                >
                  <p>{item.docType} | {item.sourceRef}</p>
                  <p className="text-slate-500">{item.usi}</p>
                </button>
              ))}
            </div>
          </div>
          <details className="mt-3 rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              查看 LayerPeg 文档 JSON {layerPegDocumentLabel ? `（${layerPegDocumentLabel}）` : ""}
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
              {JSON.stringify(layerPegDocument, null, 2)}
            </pre>
          </details>
          </section>
        ) : null}

        {showRuntime && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">构件目录</h2>
          <p className="text-sm text-slate-500">构件目录在白色页面仅提供只读浏览与检索；发布与变更操作仅允许在深色构建页面执行。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={catalogLoading} onClick={() => void refreshComponentCatalogs()}>
              刷新资产目录
            </button>
            <select
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={catalogScope}
              onChange={(event) => setCatalogScope(event.target.value as "internal" | "public" | "all")}
            >
              <option value="internal">internal catalog</option>
              <option value="public">market/public catalog</option>
              <option value="all">all</option>
            </select>
            <input
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={catalogSearchQuery}
              onChange={(event) => setCatalogSearchQuery(event.target.value)}
              placeholder="搜索资产标题/tag/norm/itemId"
            />
            <button
              className="rounded bg-slate-700 px-3 py-2 text-white disabled:opacity-60"
              type="button"
              disabled={catalogLoading}
              onClick={() => void handleSearchCatalogAssets()}
            >
              搜索资产
            </button>
            <select
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={selectedCatalogId}
              onChange={(event) => setSelectedCatalogId(event.target.value)}
            >
              <option value="">请选择目录</option>
              {componentCatalogs.map((item) => (
                <option key={item.catalogId} value={item.catalogId}>
                  {item.catalogName}（{item.componentCount}）
                </option>
              ))}
            </select>
          </div>
          {catalogLoading ? <p className="mt-2 text-sm text-blue-700">目录加载中...</p> : null}
          {catalogError ? <p className="mt-2 text-sm text-rose-700">{catalogError}</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold">目录列表</p>
              <div className="mt-2 max-h-52 space-y-2 overflow-auto text-xs">
                {componentCatalogs.map((item) => (
                  <div key={item.catalogId} className="rounded bg-slate-50 p-2">
                    <p>{item.catalogName}</p>
                    <p className="text-slate-500">norm: {item.norm}</p>
                    <p className="text-slate-500">keys: {item.spuKeyCount} | latest: {item.latestVersionCount}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3">
              <p className="text-sm font-semibold">市场上架摘要（public + published）</p>
              <div className="mt-2 max-h-52 space-y-2 overflow-auto text-xs">
                {componentCatalogMarket.map((item) => (
                  <div key={item.listingId} className="rounded bg-slate-50 p-2">
                    <p>{item.catalogName}</p>
                    <p className="text-slate-500">{item.industryTag} | 组件 {item.componentCount}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 rounded border border-slate-200 p-3">
            <p className="text-sm font-semibold">资产对象（{catalogScope}）</p>
            <div className="mt-2 max-h-56 space-y-2 overflow-auto text-xs">
              {catalogAssets.length === 0 ? (
                <p className="text-slate-500">暂无资产。</p>
              ) : (
                catalogAssets.map((item) => (
                  <div key={item.itemId} className="rounded bg-slate-50 p-2">
                    <p>{item.title}</p>
                    <p className="text-slate-500">{item.itemId} | {item.type} | {item.normSource} | {item.version}</p>
                    <p className="text-slate-500">owner: {item.owner} | visibility: {item.visibility} | status: {item.status}</p>
                    <p className="text-slate-500">tags: {item.tags.join(", ") || "-"}</p>
                  </div>
                ))
              )}
            </div>
          </div>
          <details className="mt-3 rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              查看当前目录构件明细 {selectedCatalogId ? `（${selectedCatalogId}）` : ""}
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
              {JSON.stringify(catalogComponents, null, 2)}
            </pre>
          </details>
          </section>
        ) : null}

        {showExecutor && showTechnicalDetails ? (
          <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">NL2Gate 受控入口</h2>
          <p className="text-sm text-slate-500">自然语言只被翻译为受控的 Gate 执行命令，不绕过规范构件。</p>
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              className="min-h-24 rounded border border-slate-300 px-3 py-2 text-sm"
              value={nlQuery}
              onChange={(event) => setNlQuery(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button className="rounded bg-slate-900 px-3 py-2 text-white disabled:opacity-60" type="button" disabled={nlQueryLoading} onClick={() => void handleRunNl2GateQuery()}>
                执行 NL2Gate 查询
              </button>
            </div>
          </div>
          {nlQueryLoading ? <p className="mt-2 text-sm text-blue-700">执行中...</p> : null}
          {nlQueryError ? <p className="mt-2 text-sm text-rose-700">{nlQueryError}</p> : null}
          <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
            <p><strong>回答：</strong>{nlQueryResult?.answer ?? "-"}</p>
            <p><strong>状态：</strong>{sanitizeUiText(String(nlQueryResult?.execution?.status ?? (nlQueryResult?.success === false ? "ERROR" : "-")))}</p>
            <p><strong>会话：</strong>{nlConversationId || "-"}</p>
            {nlQueryResult?.structured.missingResponse?.suggestedQuestions.length ? (
              <p><strong>补问建议：</strong>{nlQueryResult.structured.missingResponse.suggestedQuestions.join(" ")}</p>
            ) : null}
          </div>
          <details className="mt-3 rounded border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">查看 NL2Gate 结构化结果 JSON</summary>
            <pre className="mt-2 max-h-80 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
              {JSON.stringify(nlQueryResult, null, 2)}
            </pre>
          </details>
          </section>
        ) : null}

        {info ? <section className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{safeInfo}</section> : null}
        {error ? <section className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{safeError}</section> : null}
      </div>
      {isClauseSourceDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="规范条款原文"
          onClick={() => setIsClauseSourceDialogOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <p className="text-base font-semibold text-slate-900">规范依据：条款原文</p>
                <p className="text-xs text-slate-500">{currentRuleEvidence.standardCode} / 条款 {currentRuleEvidence.clauseNo}</p>
              </div>
              <button
                className="rounded bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                type="button"
                onClick={() => setIsClauseSourceDialogOpen(false)}
              >
                关闭
              </button>
            </div>
            <div className="max-h-[calc(88vh-72px)] space-y-4 overflow-auto px-4 py-3 text-sm text-slate-800">
              <div className="rounded border border-slate-200 bg-slate-50/70 p-3">
                <p><strong>标准编号：</strong>{clauseDialogCurrent?.standardCode || currentRuleEvidence.standardCode}</p>
                <p><strong>条款号：</strong>{clauseDialogCurrent?.clauseNo || currentRuleEvidence.clauseNo}</p>
                <p><strong>条款标题：</strong>{clauseDialogCurrent?.title || currentRuleEvidence.clauseTitle}</p>
                <p><strong>条款ID：</strong>{clauseDialogCurrent?.clauseId || currentRuleEvidence.clauseId || "-"}</p>
                {clauseDialogLoading ? <p className="mt-2 text-xs text-blue-700">正在加载条款解释与上下文...</p> : null}
                {clauseDialogError ? <p className="mt-2 text-xs text-amber-700">{clauseDialogError}</p> : null}
              </div>

              <section className="rounded border border-slate-300 bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">1. 条款原文（只读，不可编辑）</p>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900">
                  {clauseDialogCurrent?.content || currentRuleEvidence.clauseContent || "当前条款暂无原文内容。"}
                </pre>
              </section>

              <section className="rounded border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">2. 通俗解释</p>
                <p className="mt-1 rounded bg-white/80 px-2 py-1 text-xs text-sky-800">{clauseDialogExplanationNotice}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                  {clauseDialogExplanation || "当前条款暂无辅助解释。"}
                </p>
                {clauseDialogRiskNote ? (
                  <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    风险提示：{clauseDialogRiskNote}
                  </p>
                ) : null}
              </section>

              <section className="rounded border border-teal-200 bg-teal-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-900">3. 关联术语</p>
                {clauseDialogRelatedTerms.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">暂无关联术语。</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {clauseDialogRelatedTerms.map((term) => (
                      <span key={term} className="rounded-full border border-teal-300 bg-white px-2 py-0.5 text-xs text-teal-900">
                        {term}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded border border-violet-200 bg-violet-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-900">4. 相邻条款</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {[
                    { label: "上一条", item: clauseDialogPrevious },
                    { label: "当前条", item: clauseDialogCurrent },
                    { label: "下一条", item: clauseDialogNext },
                  ].map(({ label, item }) => (
                    <article key={label} className="rounded border border-violet-200 bg-white p-2 text-xs text-slate-700">
                      <p className="font-semibold text-violet-900">{label}</p>
                      <p className="mt-1"><strong>条款号：</strong>{item?.clauseNo || "-"}</p>
                      <p><strong>标题：</strong>{item?.title || "-"}</p>
                      <p className="mt-1 text-slate-500">{item ? buildClausePreview(item.content) : "无"}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="rounded border border-emerald-200 bg-emerald-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">5. 对应检测规则</p>
                {clauseBoundRules.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">当前条款暂无已绑定检测规则。</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {clauseBoundRules.map((item) => (
                      <div key={`${item.ruleId}::${item.ruleVersion}`} className="rounded border border-emerald-200 bg-white p-2 text-xs text-slate-700">
                        <p><strong>规则ID：</strong>{item.ruleId}</p>
                        <p><strong>规则版本：</strong>{formatSpecVersionLabel(item.ruleVersion || item.version)}</p>
                        <p><strong>规则名称：</strong>{item.itemName || "-"}</p>
                        <p><strong>绑定条款：</strong>{item.clauseNo || item.clause || item.clauseId}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
