import { randomUUID } from "node:crypto";

import { nodeDataStore, type NodeDataMetric } from "../../src/data/node-data-store.ts";
import type { RuleResult, SPUDefinition, SpuClassification } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { selectSpuCandidates, type SpuSelectorCandidate } from "./spu_selector_service.ts";

export type Nl2GateQueryErrorCode =
  | "MISSING_QUERY"
  | "UNSUPPORTED_METRIC"
  | "MISSING_STAKE"
  | "DATA_NOT_FOUND"
  | "INVALID_DATA"
  | "SPU_NOT_FOUND"
  | "EXECUTION_ERROR"
  | "MISSING_REQUIRED_FIELDS";

export type Nl2GateIntent = "gate.preview" | "gate.evaluate";
export type Nl2GateMode = "preview" | "evaluate";
export type Nl2GateMatchSource = "registry" | "rule_store";

export interface ParsedNl2GateQuery {
  metric: NodeDataMetric;
  stake: string;
}

export interface Nl2GateMissingItem {
  field: string;
  reason: string;
  required: true;
  expected?: string;
}

export interface Nl2GateStructuredTarget {
  metric: NodeDataMetric | null;
  stake: string | null;
  spuId: string | null;
  containerId: string | null;
  nodeId: string | null;
}

export interface Nl2GateMissingParameterResponse {
  missingFields: Nl2GateMissingItem[];
  suggestedQuestions: string[];
  partialContext: {
    intent: Nl2GateIntent | null;
    target: Nl2GateStructuredTarget;
    collectedInputs: Record<string, number>;
    context: Record<string, unknown>;
  };
}

export interface Nl2GateConversationState {
  conversationId: string;
  pendingIntent: Nl2GateIntent | null;
  pendingSpu: string | null;
  collectedInputs: Record<string, number>;
}

interface Nl2GateConversationRecord extends Nl2GateConversationState {
  target: Nl2GateStructuredTarget;
  context: Record<string, unknown>;
}

export interface Nl2GateCommand {
  action: "validate_spu_direct";
  intent: Nl2GateIntent;
  endpoint: "/api/gate/preview" | "/api/gate/evaluate";
  spuId: string;
  stake: string;
  formData: Record<string, number>;
  context: Record<string, unknown>;
}

export interface Nl2GateExecutionResult {
  status: "PASS" | "FAIL";
  executionId: string;
  outputs: Record<string, unknown>;
  gate: {
    passed: boolean;
    results: RuleResult[];
  };
  proofHash?: string | null;
  intent: Nl2GateIntent;
  endpoint: "/api/gate/preview" | "/api/gate/evaluate";
}

export interface Nl2GateSpuCandidate {
  rank: number;
  spuId: string;
  spuKey: string;
  score: number;
  matchReasons: string[];
  requiredMissingInputs: string[];
}

export interface Nl2GateStructuredResult {
  intent: Nl2GateIntent | null;
  target: Nl2GateStructuredTarget;
  inputs: Record<string, number>;
  context: Record<string, unknown>;
  spuCandidates: Nl2GateSpuCandidate[];
  missing: Nl2GateMissingItem[];
  missingResponse: Nl2GateMissingParameterResponse | null;
  conversation: Nl2GateConversationState | null;
  command: Nl2GateCommand | null;
  execution: Nl2GateExecutionResult | null;
}

export interface Nl2GateQueryOptions {
  mode?: Nl2GateMode;
  context?: Record<string, unknown>;
  conversationId?: string;
  execute?: boolean;
  matchSource?: Nl2GateMatchSource;
}

export interface Nl2GateQueryResult {
  success: boolean;
  query: string;
  parsed?: ParsedNl2GateQuery;
  command?: Nl2GateCommand | null;
  execution?: Nl2GateExecutionResult | null;
  answer: string;
  structured: Nl2GateStructuredResult;
  errorCode?: Nl2GateQueryErrorCode;
  error?: string;
}

const METRIC_PATTERNS: Array<{ metric: NodeDataMetric; patterns: RegExp[] }> = [
  { metric: "compaction", patterns: [/\u538b\u5b9e\u5ea6/i, /compaction/i] },
  { metric: "thickness", patterns: [/\u539a\u5ea6/i, /thickness/i] },
  { metric: "deflection", patterns: [/\u5f2f\u6c89/i, /deflection/i] },
];

const PREVIEW_PATTERNS = [/preview/i, /\u9884\u6f14/i, /\u9884\u89c8/i, /\u8bd5\u7b97/i];
const EVALUATE_PATTERNS = [/evaluate/i, /\u6267\u884c/i, /\u6b63\u5f0f/i, /\u63d0\u4ea4/i];

const STAKE_PATTERN = /(K\d+\+\d+(?:\.\d+)?)/i;
const SPU_ID_PATTERN = /([a-z0-9._-]+@v\d+(?:\.\d+)*)/i;

const INPUT_ALIAS_MAP: Record<string, string[]> = {
  compactiondegree: ["compactiondegree", "compaction_degree", "representative_value", "compaction", "\u538b\u5b9e\u5ea6"],
  compaction_degree: ["compaction_degree", "compactiondegree", "representative_value", "compaction", "\u538b\u5b9e\u5ea6"],
  representativevalue: ["representativevalue", "representative_value", "compactiondegree", "compaction_degree", "\u4ee3\u8868\u503c"],
  representative_value: ["representative_value", "representativevalue", "compactiondegree", "compaction_degree", "\u4ee3\u8868\u503c"],
  massholesand: ["massholesand", "holesandmass", "\u704c\u5165\u7802\u8d28\u91cf"],
  masssandcone: ["masssandcone", "conesandmass", "\u9525\u4f53\u7802\u8d28\u91cf"],
  volumesand: ["volumesand", "sandvolume", "\u6807\u5b9a\u4f53\u79ef"],
  moisturecontent: ["moisturecontent", "watercontent", "\u542b\u6c34\u7387"],
  maxdrydensity: ["maxdrydensity", "maximumdrydensity", "\u6700\u5927\u5e72\u5bc6\u5ea6"],
  measuredthickness: ["measuredthickness", "thickness", "\u5b9e\u6d4b\u539a\u5ea6"],
  designthickness: ["designthickness", "targetthickness", "\u8bbe\u8ba1\u539a\u5ea6"],
  measureddeflection: ["measureddeflection", "deflectionvalue", "deflection", "\u5b9e\u6d4b\u5f2f\u6c89"],
  deflectionvalue: ["deflectionvalue", "measureddeflection", "deflection", "\u5b9e\u6d4b\u5f2f\u6c89"],
  maxalloweddeflection: ["maxalloweddeflection", "allowabledeflection", "maxdeflection", "\u5141\u8bb8\u6700\u5927\u5f2f\u6c89"],
  allowabledeflection: ["allowabledeflection", "maxalloweddeflection", "maxdeflection", "\u5141\u8bb8\u6700\u5927\u5f2f\u6c89"],
};

const METRIC_SELECTOR_HINTS: Record<
  NodeDataMetric,
  { clause: string; measuredItem: string; classification: SpuClassification }
> = {
  compaction: {
    clause: "4.2.1",
    measuredItem: "\u538b\u5b9e\u5ea6",
    classification: "measurement",
  },
  thickness: {
    clause: "4.2.3",
    measuredItem: "\u539a\u5ea6",
    classification: "measurement",
  },
  deflection: {
    clause: "4.2.2",
    measuredItem: "\u5f2f\u6c89",
    classification: "measurement",
  },
};

const conversationStore = new Map<string, Nl2GateConversationRecord>();

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeConversationId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeContext(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return { ...(input as Record<string, unknown>) };
}

function readContextRecord(context: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = context[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readContextString(context: Record<string, unknown>, key: string): string | null {
  const value = context[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveMetricFromContext(context: Record<string, unknown>): NodeDataMetric | null {
  const directMetric = readContextString(context, "metric");
  if (directMetric) {
    const parsed = resolveMetric(directMetric);
    if (parsed) {
      return parsed;
    }
  }
  const measuredItem = readContextString(context, "measuredItem");
  if (measuredItem) {
    const parsed = resolveMetric(measuredItem);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function resolveIntent(query: string, mode?: Nl2GateMode): Nl2GateIntent {
  if (mode === "evaluate") {
    return "gate.evaluate";
  }
  if (mode === "preview") {
    return "gate.preview";
  }
  if (EVALUATE_PATTERNS.some((pattern) => pattern.test(query))) {
    return "gate.evaluate";
  }
  if (PREVIEW_PATTERNS.some((pattern) => pattern.test(query))) {
    return "gate.preview";
  }
  return "gate.preview";
}

function hasIntentHint(query: string): boolean {
  return EVALUATE_PATTERNS.some((pattern) => pattern.test(query)) || PREVIEW_PATTERNS.some((pattern) => pattern.test(query));
}

function mergeNumericRecords(
  ...sources: Array<Record<string, number> | null | undefined>
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const source of sources) {
    if (!source) {
      continue;
    }
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        next[key] = value;
      }
    }
  }
  return next;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalClassification(value: unknown): SpuClassification | null {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === "measurement" || normalized === "validation" || normalized === "compliance") {
    return normalized;
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function parseClauseHint(query: string): string | null {
  const matched = query.match(/(\d+(?:\.\d+){1,3})/);
  if (!matched?.[1]) {
    return null;
  }
  return matched[1];
}

function toNl2GateCandidates(candidates: SpuSelectorCandidate[]): Nl2GateSpuCandidate[] {
  return candidates.map((item) => ({
    rank: item.rank,
    spuId: item.spuId,
    spuKey: item.spuKey,
    score: item.score,
    matchReasons: [...item.matchReasons],
    requiredMissingInputs: [...item.requiredMissingInputs],
  }));
}

function extractInputsFromQuery(query: string): Record<string, number> {
  const source = String(query ?? "");
  const extracted: Record<string, number> = {};
  if (!source) {
    return extracted;
  }
  for (const [canonicalField, aliases] of Object.entries(INPUT_ALIAS_MAP)) {
    for (const alias of aliases) {
      const pattern = new RegExp(
        `${escapeRegExp(alias)}\\s*(?:=|:|\\uFF1A|\\u4E3A|\\u662F)?\\s*(-?\\d+(?:\\.\\d+)?)`,
        "gi",
      );
      for (const matched of source.matchAll(pattern)) {
        const value = Number(matched[1]);
        if (Number.isFinite(value)) {
          extracted[canonicalField] = value;
        }
      }
    }
  }
  return extracted;
}

function resolveMetricDataFromContext(context: Record<string, unknown>): Record<string, number> | null {
  const inputPayload = readContextRecord(context, "inputs") ?? readContextRecord(context, "formData");
  if (!inputPayload) {
    return null;
  }
  const entries = Object.entries(inputPayload).filter(([, value]) => typeof value === "number" && Number.isFinite(value));
  if (entries.length === 0) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function resolveMetric(text: string): NodeDataMetric | null {
  for (const item of METRIC_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(text))) {
      return item.metric;
    }
  }
  return null;
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

function resolveSpuForMetric(metric: NodeDataMetric, registry: SPUDefinition[]): SPUDefinition | null {
  const matched = registry.filter((item) => {
    const spuId = item.spuId.toLowerCase();
    const measured = (item.meta.measuredItem ?? "").toLowerCase();
    if (metric === "compaction") {
      return spuId.includes("compaction") || measured.includes("\u538b\u5b9e");
    }
    if (metric === "thickness") {
      return spuId.includes("thickness") || measured.includes("\u539a\u5ea6");
    }
    return spuId.includes("deflection") || measured.includes("\u5f2f\u6c89");
  });
  if (matched.length === 0) {
    return null;
  }
  return [...matched].sort((left, right) => {
    const byVersion = versionWeight(right.spuId) - versionWeight(left.spuId);
    if (byVersion !== 0) {
      return byVersion;
    }
    return right.spuId.localeCompare(left.spuId, "en");
  })[0];
}

function resolveInputValue(inputName: string, metricData: Record<string, number>): number | undefined {
  const normalizedInput = normalizeKey(inputName);
  const aliases = INPUT_ALIAS_MAP[normalizedInput] ?? [normalizedInput];
  for (const [key, value] of Object.entries(metricData)) {
    const normalizedKey = normalizeKey(key);
    if (aliases.includes(normalizedKey) && typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function endpointForIntent(intent: Nl2GateIntent): "/api/gate/preview" | "/api/gate/evaluate" {
  return intent === "gate.evaluate" ? "/api/gate/evaluate" : "/api/gate/preview";
}

function formatAnswer(
  metric: NodeDataMetric,
  stake: string,
  intent: Nl2GateIntent,
  execution: Nl2GateExecutionResult,
): string {
  const label = metric === "compaction" ? "\u538b\u5b9e\u5ea6" : metric === "thickness" ? "\u539a\u5ea6" : "\u5f2f\u6c89";
  const actionLabel = intent === "gate.evaluate" ? "Gate\u6267\u884c" : "Gate\u9884\u6f14";
  const first = execution.gate.results[0];
  if (!first) {
    return `${stake} ${label}\u5df2\u5b8c\u6210${actionLabel}\uff1a${execution.status}\u3002`;
  }
  if (execution.status === "PASS") {
    return `${stake} ${label}${actionLabel}\u901a\u8fc7\uff08${first.field} ${first.operator} ${String(first.threshold)}\uff0c\u5b9e\u9645 ${String(first.actual)}\uff09\u3002`;
  }
  return `${stake} ${label}${actionLabel}\u672a\u901a\u8fc7\uff08${first.field} ${first.operator} ${String(first.threshold)}\uff0c\u5b9e\u9645 ${String(first.actual)}\uff09\u3002`;
}

function inferErrorCode(missing: Nl2GateMissingItem[]): Nl2GateQueryErrorCode {
  if (missing.some((item) => item.field === "query")) {
    return "MISSING_QUERY";
  }
  if (missing.some((item) => item.field === "target.metric")) {
    return "UNSUPPORTED_METRIC";
  }
  if (missing.some((item) => item.field === "target.stake")) {
    return "MISSING_STAKE";
  }
  if (missing.some((item) => item.reason === "spu_not_found")) {
    return "SPU_NOT_FOUND";
  }
  if (missing.some((item) => item.reason === "data_not_found")) {
    return "DATA_NOT_FOUND";
  }
  if (missing.some((item) => item.field.startsWith("inputs."))) {
    return "INVALID_DATA";
  }
  return "MISSING_REQUIRED_FIELDS";
}

function buildMissing(field: string, reason: string, expected?: string): Nl2GateMissingItem {
  return {
    field,
    reason,
    required: true,
    expected,
  };
}

function buildFormData(
  spu: SPUDefinition,
  metricData: Record<string, number>,
): { formData: Record<string, number>; missing: Nl2GateMissingItem[] } {
  const formData: Record<string, number> = {};
  const missing: Nl2GateMissingItem[] = [];

  for (const input of spu.data.inputs) {
    const value = resolveInputValue(input.name, metricData);
    if (typeof value === "number" && Number.isFinite(value)) {
      formData[input.name] = value;
    } else {
      missing.push(buildMissing(`inputs.${input.name}`, "input_value_missing", input.type));
    }
  }

  return {
    formData,
    missing,
  };
}

function dedupeMissing(items: Nl2GateMissingItem[]): Nl2GateMissingItem[] {
  const seen = new Set<string>();
  const next: Nl2GateMissingItem[] = [];
  for (const item of items) {
    const key = `${item.field}::${item.reason}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(item);
  }
  return next;
}

function buildSuggestedQuestions(
  missing: Nl2GateMissingItem[],
  target: Nl2GateStructuredTarget,
  spu: SPUDefinition | null,
): string[] {
  const questions: string[] = [];
  const seen = new Set<string>();
  for (const item of missing) {
    let question = "";
    if (item.field === "target.metric") {
      question = "\u8bf7\u786e\u8ba4\u68c0\u6d4b\u6307\u6807\uff1a\u538b\u5b9e\u5ea6\u3001\u539a\u5ea6\uff0c\u6216\u5f2f\u6c89\u3002";
    } else if (item.field === "target.stake") {
      question = "\u8bf7\u63d0\u4f9b\u6869\u53f7\uff08\u4f8b\u5982 K15+200\uff09\u3002";
    } else if (item.field === "target.spuId") {
      question = item.expected
        ? `\u8bf7\u786e\u8ba4\u53ef\u6267\u884c SPU\uff08\u4f8b\u5982 ${item.expected}\uff09\u3002`
        : "\u8bf7\u786e\u8ba4\u53ef\u6267\u884c SPU \u7f16\u53f7\u3002";
    } else if (item.field.startsWith("inputs.")) {
      const inputName = item.field.slice("inputs.".length);
      question = `\u8bf7\u63d0\u4f9b ${inputName} \u7684\u6570\u503c${item.expected ? `\uff08${item.expected}\uff09` : ""}\u3002`;
    } else if (item.field === "inputs" && target.spuId && spu) {
      const fields = spu.data.inputs.map((input) => input.name).join(", ");
      question = `\u672a\u627e\u5230\u6869\u53f7\u5bf9\u5e94\u6570\u636e\uff0c\u8bf7\u8865\u5145\u8f93\u5165\uff1a${fields}\u3002`;
    } else if (item.field === "inputs") {
      question = "\u8bf7\u8865\u5145\u672c\u6b21 Gate \u6267\u884c\u6240\u9700\u8f93\u5165\u53c2\u6570\u3002";
    }
    if (!question || seen.has(question)) {
      continue;
    }
    seen.add(question);
    questions.push(question);
  }
  return questions;
}

function cloneTarget(target: Nl2GateStructuredTarget): Nl2GateStructuredTarget {
  return {
    metric: target.metric,
    stake: target.stake,
    spuId: target.spuId,
    containerId: target.containerId,
    nodeId: target.nodeId,
  };
}

function readConversation(conversationId: string | null): Nl2GateConversationRecord | null {
  if (!conversationId) {
    return null;
  }
  const found = conversationStore.get(conversationId);
  if (!found) {
    return null;
  }
  return {
    conversationId: found.conversationId,
    pendingIntent: found.pendingIntent,
    pendingSpu: found.pendingSpu,
    collectedInputs: { ...found.collectedInputs },
    target: cloneTarget(found.target),
    context: { ...found.context },
  };
}

function writeConversation(record: Nl2GateConversationRecord): void {
  conversationStore.set(record.conversationId, {
    conversationId: record.conversationId,
    pendingIntent: record.pendingIntent,
    pendingSpu: record.pendingSpu,
    collectedInputs: { ...record.collectedInputs },
    target: cloneTarget(record.target),
    context: { ...record.context },
  });
}

export function queryNl2Gate(
  service: PlatformService,
  query: string,
  options: Nl2GateQueryOptions = {},
): Nl2GateQueryResult {
  const normalizedQuery = String(query ?? "").trim();
  const context = normalizeContext(options.context);
  const inputConversationId =
    normalizeConversationId(options.conversationId) ?? normalizeConversationId(context.conversationId);
  const existingConversation = readConversation(inputConversationId);
  const mergedContext = {
    ...(existingConversation?.context ?? {}),
    ...context,
  };
  const matchSource: Nl2GateMatchSource = options.matchSource === "rule_store" ? "rule_store" : "registry";

  let intent = resolveIntent(normalizedQuery, options.mode);
  const shouldExecute = options.execute !== false;
  if (!options.mode && existingConversation?.pendingIntent && !hasIntentHint(normalizedQuery)) {
    intent = existingConversation.pendingIntent;
  }
  const endpoint = endpointForIntent(intent);

  const metric =
    resolveMetric(normalizedQuery)
    ?? resolveMetricFromContext(mergedContext)
    ?? existingConversation?.target.metric
    ?? null;
  const stakeFromQuery = normalizedQuery.match(STAKE_PATTERN)?.[1] ?? "";
  const stake = stakeFromQuery || readContextString(mergedContext, "stake") || existingConversation?.target.stake || null;

  const target: Nl2GateStructuredTarget = {
    metric,
    stake,
    spuId: null,
    containerId: readContextString(mergedContext, "containerId") ?? existingConversation?.target.containerId ?? null,
    nodeId: readContextString(mergedContext, "nodeId") ?? existingConversation?.target.nodeId ?? null,
  };

  const missing: Nl2GateMissingItem[] = [];

  if (!normalizedQuery && !existingConversation) {
    missing.push(buildMissing("query", "query_required", "string"));
  }
  if (!metric) {
    missing.push(buildMissing("target.metric", "unsupported_metric", "compaction|thickness|deflection"));
  }
  if (!stake) {
    missing.push(buildMissing("target.stake", "stake_not_found", "K15+200"));
  }

  const queryInputs = extractInputsFromQuery(normalizedQuery);
  const contextInputs = resolveMetricDataFromContext(mergedContext);
  const carriedInputs = existingConversation?.collectedInputs ?? null;

  let metricData: Record<string, number> | null = null;
  if (stake && metric) {
    const dataByStake = nodeDataStore[stake]?.[metric] ?? null;
    const mergedInputs = mergeNumericRecords(dataByStake, carriedInputs, contextInputs, queryInputs);
    metricData = Object.keys(mergedInputs).length > 0 ? mergedInputs : null;
    if (!metricData) {
      missing.push(buildMissing("inputs", "data_not_found", `context.inputs|${stake}.${metric}`));
    }
  } else {
    const mergedInputs = mergeNumericRecords(carriedInputs, contextInputs, queryInputs);
    metricData = Object.keys(mergedInputs).length > 0 ? mergedInputs : null;
  }

  const registry = service.getRegistry();
  const explicitSpuId =
    readContextString(mergedContext, "spuId") ||
    normalizedQuery.match(SPU_ID_PATTERN)?.[1] ||
    existingConversation?.pendingSpu ||
    null;

  const metricSelectorHints = metric ? METRIC_SELECTOR_HINTS[metric] : null;
  const queryClauseHint = parseClauseHint(normalizedQuery);
  const clauseHint = normalizeOptionalString(mergedContext.clause) ?? queryClauseHint ?? metricSelectorHints?.clause ?? null;
  const categoryHint = normalizeOptionalString(mergedContext.category) ?? null;
  const domainHint = normalizeOptionalString(mergedContext.domain) ?? null;
  const classificationHint =
    normalizeOptionalClassification(mergedContext.classification) ?? metricSelectorHints?.classification ?? null;
  const measuredItemHint = normalizeOptionalString(mergedContext.measuredItem) ?? metricSelectorHints?.measuredItem ?? null;
  const projectIdFromContext = readContextString(mergedContext, "projectId");
  const boundSpuIds = normalizeStringArray((mergedContext as Record<string, unknown>).boundSpuIds);
  const nodeSpuId = readContextString(mergedContext, "nodeSpuId");
  const nodeType = readContextString(mergedContext, "nodeType");
  const selectorInputSnapshot: Record<string, unknown> = {
    ...(metricData ?? {}),
  };
  const containerFromTarget = target.containerId ? service.getContainer(target.containerId) : null;
  const containerBoundSpuIds = containerFromTarget?.specBindings.map((item) => item.spuId) ?? [];
  const containerCurrentSpuId = containerFromTarget?.runtime.currentSpuId ?? null;
  const selectorProjectId = projectIdFromContext ?? containerFromTarget?.projectId ?? null;
  let spuCandidates: Nl2GateSpuCandidate[] = [];
  let resolvedSpu: SPUDefinition | null = null;
  if (matchSource === "registry") {
    const selectorResult = selectSpuCandidates(service, {
      intent,
      projectContext: {
        projectId: selectorProjectId,
        preferredCategory: categoryHint,
        preferredClause: clauseHint,
        preferredDomain: domainHint,
        preferredClassification: classificationHint,
      },
      containerMetadata: {
        containerId: target.containerId,
        projectId: selectorProjectId,
        boundSpuIds: Array.from(new Set([...boundSpuIds, ...containerBoundSpuIds])),
        currentSpuId: containerCurrentSpuId,
        nodeType,
      },
      nodeMetadata: {
        nodeId: target.nodeId,
        spuId: nodeSpuId,
        nodeType,
      },
      hints: {
        spuId: explicitSpuId,
        category: categoryHint,
        clause: clauseHint,
        measuredItem: measuredItemHint,
        domain: domainHint,
        classification: classificationHint,
      },
      inputs: selectorInputSnapshot,
      limit: 5,
    });
    spuCandidates = toNl2GateCandidates(selectorResult.rankedCandidates);
    if (explicitSpuId) {
      resolvedSpu = registry.find((item) => item.spuId === explicitSpuId) ?? null;
      if (!resolvedSpu) {
        missing.push(buildMissing("target.spuId", "spu_not_found", explicitSpuId));
      }
    } else {
      const selectorSpuId = selectorResult.selectedSpuId;
      if (selectorSpuId) {
        resolvedSpu = registry.find((item) => item.spuId === selectorSpuId) ?? null;
      }
      if (!resolvedSpu && metric) {
        resolvedSpu = resolveSpuForMetric(metric, registry);
      }
      if (!resolvedSpu && (metric || clauseHint || categoryHint || domainHint || classificationHint || selectorProjectId)) {
        missing.push(buildMissing("target.spuId", "spu_not_found", "selector_candidate"));
      }
    }
  } else {
    target.spuId = explicitSpuId ?? null;
  }

  if (resolvedSpu) {
    target.spuId = resolvedSpu.spuId;
  }

  let formData: Record<string, number> = {};
  if (matchSource === "registry" && resolvedSpu) {
    const mapped = buildFormData(resolvedSpu, metricData ?? {});
    formData = mapped.formData;
    missing.push(...mapped.missing);
  } else if (matchSource === "rule_store" && metricData) {
    formData = { ...metricData };
  }

  const dedupedMissing = dedupeMissing(missing);

  const parsed: ParsedNl2GateQuery | undefined = metric && stake
    ? {
        metric,
        stake,
      }
    : undefined;

  if (dedupedMissing.length > 0) {
    const conversationId = inputConversationId ?? existingConversation?.conversationId ?? randomUUID();
    const collectedInputs = mergeNumericRecords(existingConversation?.collectedInputs, formData);
    const conversationState: Nl2GateConversationState = {
      conversationId,
      pendingIntent: intent,
      pendingSpu: resolvedSpu?.spuId ?? existingConversation?.pendingSpu ?? explicitSpuId ?? null,
      collectedInputs,
    };
    const persistedTarget: Nl2GateStructuredTarget = {
      ...cloneTarget(target),
      spuId: conversationState.pendingSpu,
    };
    writeConversation({
      ...conversationState,
      target: persistedTarget,
      context: mergedContext,
    });

    const suggestedQuestions = buildSuggestedQuestions(dedupedMissing, persistedTarget, resolvedSpu);
    const missingResponse: Nl2GateMissingParameterResponse = {
      missingFields: dedupedMissing,
      suggestedQuestions,
      partialContext: {
        intent,
        target: persistedTarget,
        collectedInputs,
        context: mergedContext,
      },
    };

    const errorCode = inferErrorCode(dedupedMissing);
    const baseAnswer = `\u7f3a\u5c11\u5fc5\u8981\u53c2\u6570\uff1a${dedupedMissing.map((item) => item.field).join("\uff0c")}\u3002`;
    const answer = suggestedQuestions.length > 0 ? `${baseAnswer} ${suggestedQuestions[0]}` : baseAnswer;
    return {
      success: false,
      query,
      parsed,
      command: null,
      execution: null,
      answer,
      structured: {
        intent,
        target: persistedTarget,
        inputs: collectedInputs,
        context: mergedContext,
        spuCandidates,
        missing: dedupedMissing,
        missingResponse,
        conversation: conversationState,
        command: null,
        execution: null,
      },
      errorCode,
      error: answer,
    };
  }

  const activeConversationId = inputConversationId ?? existingConversation?.conversationId ?? null;
  if (matchSource === "rule_store") {
    if (activeConversationId) {
      conversationStore.delete(activeConversationId);
    }
    const actionLabel = intent === "gate.evaluate" ? "执行检测" : "预演检测";
    const answer = shouldExecute
      ? "已完成结构化解析，正在等待规则库映射后执行。"
      : `已完成结构化解析，可继续${actionLabel}。`;
    return {
      success: true,
      query,
      parsed,
      command: null,
      execution: null,
      answer,
      structured: {
        intent,
        target,
        inputs: formData,
        context: mergedContext,
        spuCandidates,
        missing: [],
        missingResponse: null,
        conversation: null,
        command: null,
        execution: null,
      },
    };
  }
  const command: Nl2GateCommand = {
    action: "validate_spu_direct",
    intent,
    endpoint,
    spuId: resolvedSpu!.spuId,
    stake: stake!,
    formData,
    context: mergedContext,
  };

  if (!shouldExecute) {
    if (activeConversationId) {
      conversationStore.delete(activeConversationId);
    }
    const actionLabel = intent === "gate.evaluate" ? "执行检测" : "预演检测";
    const answer = `已完成结构化解析，可继续${actionLabel}。`;
    return {
      success: true,
      query,
      parsed,
      command,
      execution: null,
      answer,
      structured: {
        intent,
        target,
        inputs: formData,
        context: mergedContext,
        spuCandidates,
        missing: [],
        missingResponse: null,
        conversation: null,
        command,
        execution: null,
      },
    };
  }

  try {
    const shouldAutoSign = intent === "gate.evaluate";
    const node = service.evaluateSpuDirect({
      spuId: resolvedSpu!.spuId,
      inputs: formData,
      containerRef: target.containerId ?? `nl2gate:${stake!}`,
      autoSign: shouldAutoSign,
    });

    const execution: Nl2GateExecutionResult = {
      status: node.gate.passed ? "PASS" : "FAIL",
      executionId: node.nodeId,
      outputs: { ...node.outputs },
      gate: {
        passed: node.gate.passed,
        results: node.gate.results.map((item) => ({ ...item })),
      },
      proofHash:
        typeof node.proof?.extensions?.proof_hash === "string"
          ? String(node.proof?.extensions?.proof_hash)
          : null,
      intent,
      endpoint,
    };

    if (activeConversationId) {
      conversationStore.delete(activeConversationId);
    }

    const conversationState = activeConversationId
      ? {
          conversationId: activeConversationId,
          pendingIntent: null,
          pendingSpu: null,
          collectedInputs: { ...formData },
        }
      : null;

    return {
      success: true,
      query,
      parsed,
      command,
      execution,
      answer: formatAnswer(metric!, stake!, intent, execution),
      structured: {
        intent,
        target,
        inputs: formData,
        context: mergedContext,
        spuCandidates,
        missing: [],
        missingResponse: null,
        conversation: conversationState,
        command,
        execution,
      },
    };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    const answer = `Gate \u6267\u884c\u5931\u8d25\uff1a${message}`;
    return {
      success: false,
      query,
      parsed,
      command,
      execution: null,
      answer,
      structured: {
        intent,
        target,
        inputs: formData,
        context: mergedContext,
        spuCandidates,
        missing: [],
        missingResponse: null,
        conversation: null,
        command,
        execution: null,
      },
      errorCode: "EXECUTION_ERROR",
      error: message,
    };
  }
}
