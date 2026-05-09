import { spuCatalogMap } from "../data/spu-catalog.ts";
import { invokeSpuMcpTool } from "./spu-mcp-tools.ts";

import type { GateEvaluation, Proof } from "../spu-types.ts";
import type { SpuNodeExecutionView, ValidateSpuDirectInput } from "./spu-mcp-tools.ts";

export type ParsedWorkItem = "subgrade";

export type ParsedWorkItemIntent = {
  workItem: ParsedWorkItem;
  stake?: string;
};

export type WorkItemSpuResult = {
  spuId: string;
  measuredItem: string;
  status: "PASS" | "FAIL";
  outputs?: Record<string, number>;
  gate?: GateEvaluation;
  proof?: Proof;
};

export type WorkItemAggregateResult = {
  overallStatus: "PASS" | "FAIL";
  details: WorkItemSpuResult[];
};

export type WorkItemQueryResult = {
  query: string;
  workItem: ParsedWorkItem;
  stake?: string;
  spuResults: WorkItemSpuResult[];
  overallStatus: "PASS" | "FAIL";
  answer: string;
};

const CJK_SUBGRADE = "\u8DEF\u57FA";
const CJK_CURRENT_POINT = "\u8BE5\u70B9\u4F4D";
const CJK_WORKITEM_LABEL: Record<ParsedWorkItem, string> = {
  subgrade: "\u8DEF\u57FA",
};

const STAKE_PATTERN = /(K\d+\+\d+(?:\.\d+)?)/i;

const WORKITEM_TO_SPU_IDS: Record<ParsedWorkItem, string[]> = {
  subgrade: [
    "highway.subgrade.compaction.4.2.1.soil@v1",
    "highway.subgrade.thickness.4.2.3@v1",
    "highway.subgrade.deflection.4.2.2@v1",
  ],
};

const DEFAULT_FORM_DATA_BY_SPU: Record<string, Record<string, number>> = {
  "highway.subgrade.compaction.4.2.1.soil@v1": {
    massHoleSand: 1980,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  },
  "highway.subgrade.thickness.4.2.3@v1": {
    measuredThickness: 210,
    designThickness: 200,
  },
  "highway.subgrade.deflection.4.2.2@v1": {
    measuredDeflection: 18,
    maxAllowedDeflection: 20,
    // Compatibility for existing deflection SPU input key.
    allowableDeflection: 20,
  },
};

const FALLBACK_MEASURED_ITEM_BY_SPU: Record<string, string> = {
  "highway.subgrade.compaction.4.2.1.soil@v1": "\u538B\u5B9E\u5EA6",
  "highway.subgrade.thickness.4.2.3@v1": "\u539A\u5EA6",
  "highway.subgrade.deflection.4.2.2@v1": "\u5F2F\u6C89",
};

function cloneGate(gate: GateEvaluation | undefined): GateEvaluation | undefined {
  if (!gate) {
    return undefined;
  }
  return {
    ...gate,
    results: gate.results.map((item) => ({ ...item })),
  };
}

function cloneProof(proof: Proof | undefined): Proof | undefined {
  if (!proof) {
    return undefined;
  }
  return {
    ...proof,
    result: { ...proof.result },
    calculationTrace: proof.calculationTrace.map((trace) => ({
      ...trace,
      inputs: { ...trace.inputs },
    })),
    gateDecisions: proof.gateDecisions.map((item) => ({ ...item })),
    requiredSignatures: [...proof.requiredSignatures],
    pendingSignatures: [...proof.pendingSignatures],
    signedBy: proof.signedBy ? [...proof.signedBy] : undefined,
    inputs: proof.inputs ? { ...proof.inputs } : undefined,
    outputs: proof.outputs ? { ...proof.outputs } : undefined,
    trace: proof.trace ? proof.trace.map((item) => ({ ...item })) : undefined,
    gate: cloneGate(proof.gate),
  };
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function getMeasuredItemLabel(spuId: string): string {
  const fromCatalog = spuCatalogMap[spuId]?.measuredItem;
  if (typeof fromCatalog === "string" && fromCatalog.trim()) {
    return fromCatalog;
  }
  return FALLBACK_MEASURED_ITEM_BY_SPU[spuId] ?? spuId;
}

function normalizeSpuResult(result: SpuNodeExecutionView): WorkItemSpuResult {
  const status = result.resultStatus ?? result.proof?.result.status;
  if (!status) {
    throw new Error(`MCP result does not include PASS/FAIL: ${result.spuId}`);
  }

  return {
    spuId: result.spuId,
    measuredItem: getMeasuredItemLabel(result.spuId),
    status,
    outputs: result.outputs ? { ...result.outputs } : undefined,
    gate: cloneGate(result.gate),
    proof: cloneProof(result.proof),
  };
}

function resolveWorkItem(normalized: string): ParsedWorkItem | null {
  const lower = normalized.toLowerCase();
  if (normalized.includes(CJK_SUBGRADE) || lower.includes("subgrade")) {
    return "subgrade";
  }
  return null;
}

function getFailureReason(detail: WorkItemSpuResult): string {
  const failedRule = detail.gate?.results.find((item) => !item.passed) ?? detail.gate?.results[0];
  if (!failedRule) {
    return `${detail.measuredItem}\u4E0D\u8FBE\u6807`;
  }
  return `${detail.measuredItem}\u4E0D\u8FBE\u6807\uFF08${formatNumber(failedRule.actual)} ${failedRule.operator} ${formatNumber(failedRule.expected)} \u672A\u6EE1\u8DB3\uFF09`;
}

export function parseWorkItemIntent(text: string): ParsedWorkItemIntent {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("query text is required");
  }

  const workItem = resolveWorkItem(normalized);
  if (!workItem) {
    throw new Error(`unsupported workItem in query: ${text}`);
  }

  const stake = normalized.match(STAKE_PATTERN)?.[1];
  return {
    workItem,
    stake,
  };
}

export function mapWorkItemToSpuList(workItem: ParsedWorkItem): string[] {
  return [...WORKITEM_TO_SPU_IDS[workItem]];
}

export function buildDefaultFormData(spuId: string): Record<string, number> {
  const template = DEFAULT_FORM_DATA_BY_SPU[spuId];
  if (!template) {
    throw new Error(`unsupported SPU for default formData: ${spuId}`);
  }
  return { ...template };
}

export function aggregateResult(results: WorkItemSpuResult[]): WorkItemAggregateResult {
  return {
    overallStatus: results.some((item) => item.status === "FAIL") ? "FAIL" : "PASS",
    details: results.map((item) => ({
      ...item,
      outputs: item.outputs ? { ...item.outputs } : undefined,
      gate: cloneGate(item.gate),
      proof: cloneProof(item.proof),
    })),
  };
}

export function generateWorkItemAnswer(intent: ParsedWorkItemIntent, aggregate: WorkItemAggregateResult): string {
  const stakePrefix = intent.stake ?? CJK_CURRENT_POINT;
  const workItemLabel = CJK_WORKITEM_LABEL[intent.workItem];
  const names = aggregate.details.map((item) => item.measuredItem).join("\u3001");

  if (aggregate.overallStatus === "PASS") {
    return `${stakePrefix}${workItemLabel}\u68C0\u6D4B\u9879\uFF08${names}\uFF09\u5747\u6EE1\u8DB3\u89C4\u8303\u8981\u6C42\uFF0C\u5224\u5B9A\u8BE5${workItemLabel}\u5408\u683C\u3002`;
  }

  const failures = aggregate.details
    .filter((item) => item.status === "FAIL")
    .map((item) => getFailureReason(item))
    .join("\uFF1B");
  return `${stakePrefix}${workItemLabel}\u5B58\u5728\u4E0D\u5408\u683C\u9879\uFF1A${failures}\uFF0C\u5224\u5B9A\u8BE5${workItemLabel}\u4E0D\u5408\u683C\u3002`;
}

export function handleWorkItemQuery(text: string): WorkItemQueryResult {
  const parsed = parseWorkItemIntent(text);
  const spuIds = mapWorkItemToSpuList(parsed.workItem);
  const spuResults: WorkItemSpuResult[] = [];

  for (const spuId of spuIds) {
    const formData = buildDefaultFormData(spuId);
    const mcpResult = invokeSpuMcpTool("validate_spu_direct", {
      spuId,
      formData,
      context: parsed.stake ? { stake: parsed.stake } : undefined,
    } satisfies ValidateSpuDirectInput) as SpuNodeExecutionView;
    spuResults.push(normalizeSpuResult(mcpResult));
  }

  const aggregate = aggregateResult(spuResults);
  return {
    query: text,
    workItem: parsed.workItem,
    stake: parsed.stake,
    spuResults: aggregate.details,
    overallStatus: aggregate.overallStatus,
    answer: generateWorkItemAnswer(parsed, aggregate),
  };
}
