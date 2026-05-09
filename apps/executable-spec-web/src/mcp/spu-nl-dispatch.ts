import { fetchNodeInputData, type NodeInputDataError } from "./node-input-data.ts";
import { invokeSpuMcpTool } from "./spu-mcp-tools.ts";

import type { GateEvaluation, Proof } from "../spu-types.ts";
import type { SpuNodeExecutionView, ValidateSpuDirectInput } from "./spu-mcp-tools.ts";

export type ParsedMetric = "compaction" | "thickness" | "deflection";

export type ParsedIntent = {
  metric: ParsedMetric;
  stake: string;
};

export type QueryExecutionResult = {
  status: "PASS" | "FAIL";
  outputs?: Record<string, number>;
  gate?: GateEvaluation;
  proof?: Proof;
};

export type QueryErrorCode = NodeInputDataError;

export type UserQueryResult = {
  query: string;
  parsed?: ParsedIntent;
  spuId?: string;
  result?: QueryExecutionResult;
  answer: string;
  error?: QueryErrorCode;
};

const STAKE_PATTERN = /(K\d+\+\d+(?:\.\d+)?)/i;

const CJK_COMPACTION = "\u538B\u5B9E\u5EA6";
const CJK_THICKNESS = "\u539A\u5EA6";
const CJK_DEFLECTION = "\u5F2F\u6C89";
const CJK_STAKE_REQUIRED = "\u672A\u63D0\u4F9B\u6869\u53F7\uFF0C\u65E0\u6CD5\u67E5\u8BE2";

const SPU_ID_BY_METRIC: Record<ParsedMetric, string> = {
  compaction: "highway.subgrade.compaction.4.2.1.soil@v1",
  thickness: "highway.subgrade.thickness.4.2.3@v1",
  deflection: "highway.subgrade.deflection.4.2.2@v1",
};

const METRIC_LABEL_CN: Record<ParsedMetric, string> = {
  compaction: CJK_COMPACTION,
  thickness: CJK_THICKNESS,
  deflection: CJK_DEFLECTION,
};

const RESULT_FIELD_BY_METRIC: Record<ParsedMetric, string> = {
  compaction: "compactionDegree",
  thickness: "thicknessValue",
  deflection: "deflectionValue",
};

const RESULT_UNIT_BY_METRIC: Record<ParsedMetric, string | ""> = {
  compaction: "%",
  thickness: "mm",
  deflection: "",
};

function includesAny(text: string, aliases: string[]): boolean {
  return aliases.some((alias) => text.includes(alias));
}

function resolveMetric(normalized: string): ParsedMetric | null {
  const lower = normalized.toLowerCase();

  if (includesAny(normalized, [CJK_COMPACTION]) || includesAny(lower, ["compaction"])) {
    return "compaction";
  }
  if (includesAny(normalized, [CJK_THICKNESS]) || includesAny(lower, ["thickness"])) {
    return "thickness";
  }
  if (includesAny(normalized, [CJK_DEFLECTION]) || includesAny(lower, ["deflection"])) {
    return "deflection";
  }
  return null;
}

export function parseIntent(text: string): ParsedIntent {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("query text is required");
  }

  const metric = resolveMetric(normalized);
  if (!metric) {
    throw new Error(`unsupported metric in query: ${text}`);
  }

  const stake = normalized.match(STAKE_PATTERN)?.[1];
  if (!stake) {
    throw new Error(CJK_STAKE_REQUIRED);
  }

  return {
    metric,
    stake,
  };
}

export function mapToSpu(metric: ParsedMetric): string {
  return SPU_ID_BY_METRIC[metric];
}

function normalizeValidateResult(result: SpuNodeExecutionView): QueryExecutionResult {
  const status = result.resultStatus ?? result.proof?.result.status;
  if (!status) {
    throw new Error(`MCP result does not include PASS/FAIL: ${result.spuId}`);
  }

  return {
    status,
    outputs: result.outputs ? { ...result.outputs } : undefined,
    gate: result.gate
      ? {
          ...result.gate,
          results: result.gate.results.map((item) => ({ ...item })),
        }
      : undefined,
    proof: result.proof
      ? {
          ...result.proof,
          result: { ...result.proof.result },
          calculationTrace: result.proof.calculationTrace.map((trace) => ({
            ...trace,
            inputs: { ...trace.inputs },
          })),
          gateDecisions: result.proof.gateDecisions.map((item) => ({ ...item })),
          requiredSignatures: [...result.proof.requiredSignatures],
          pendingSignatures: [...result.proof.pendingSignatures],
          signedBy: result.proof.signedBy ? [...result.proof.signedBy] : undefined,
          inputs: result.proof.inputs ? { ...result.proof.inputs } : undefined,
          outputs: result.proof.outputs ? { ...result.proof.outputs } : undefined,
          trace: result.proof.trace ? result.proof.trace.map((item) => ({ ...item })) : undefined,
          gate: result.proof.gate
            ? {
                ...result.proof.gate,
                results: result.proof.gate.results.map((item) => ({ ...item })),
              }
            : undefined,
        }
      : undefined,
  };
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(4).replace(/\.?0+$/, "");
}

function pickAnswerValue(metric: ParsedMetric, result: QueryExecutionResult): number {
  const outputField = RESULT_FIELD_BY_METRIC[metric];
  const outputValue = result.outputs?.[outputField];
  if (typeof outputValue === "number" && Number.isFinite(outputValue)) {
    return outputValue;
  }
  if (typeof result.proof?.result.value === "number" && Number.isFinite(result.proof.result.value)) {
    return result.proof.result.value;
  }
  const firstActual = result.gate?.results[0]?.actual;
  if (typeof firstActual === "number" && Number.isFinite(firstActual)) {
    return firstActual;
  }
  return 0;
}

function buildThresholdPhrase(metric: ParsedMetric, result: QueryExecutionResult): string {
  const firstRule = result.gate?.results[0];
  if (!firstRule) {
    return "\u89C4\u8303\u9608\u503C";
  }
  const unit = RESULT_UNIT_BY_METRIC[metric];
  return `${firstRule.operator} ${formatNumber(firstRule.expected)}${unit}`;
}

function dataErrorMessage(input: { code: QueryErrorCode; stake: string; metric: ParsedMetric }): string {
  const label = METRIC_LABEL_CN[input.metric];
  if (input.code === "DATA_NOT_FOUND") {
    return `${input.stake}\u6682\u65E0${label}\u68C0\u6D4B\u6570\u636E`;
  }
  if (input.code === "INVALID_DATA") {
    return `${input.stake}${label}\u68C0\u6D4B\u6570\u636E\u4E0D\u5B8C\u6574\uFF0C\u65E0\u6CD5\u6267\u884C\u6821\u9A8C`;
  }
  return CJK_STAKE_REQUIRED;
}

export function generateAnswer(input: {
  metric: ParsedMetric;
  result: QueryExecutionResult;
  stake: string;
}): string {
  const label = METRIC_LABEL_CN[input.metric];
  const value = formatNumber(pickAnswerValue(input.metric, input.result));
  const unit = RESULT_UNIT_BY_METRIC[input.metric];
  const prefix = `${input.stake} `;

  // Final conclusion must come from MCP result.status only.
  if (input.result.status === "PASS") {
    return `${prefix}${label}\u4E3A${value}${unit}\uFF0C\u6EE1\u8DB3\u89C4\u8303\u8981\u6C42\uFF08${buildThresholdPhrase(input.metric, input.result)}\uFF09\uFF0C\u5224\u5B9A\u5408\u683C\u3002`;
  }
  return `${prefix}${label}\u4E3A${value}${unit}\uFF0C\u4E0D\u6EE1\u8DB3\u89C4\u8303\u8981\u6C42\uFF08${buildThresholdPhrase(input.metric, input.result)}\uFF09\uFF0C\u5224\u5B9A\u4E0D\u5408\u683C\u3002`;
}

export function handleUserQuery(text: string): UserQueryResult {
  let parsed: ParsedIntent;
  try {
    parsed = parseIntent(text);
  } catch (error) {
    if (error instanceof Error && error.message === CJK_STAKE_REQUIRED) {
      return {
        query: text,
        answer: CJK_STAKE_REQUIRED,
        error: "MISSING_STAKE",
      };
    }
    throw error;
  }

  const spuId = mapToSpu(parsed.metric);
  const lookup = fetchNodeInputData({
    spuId,
    stake: parsed.stake,
  });

  if ("error" in lookup) {
    return {
      query: text,
      parsed,
      spuId,
      error: lookup.error,
      answer: dataErrorMessage({
        code: lookup.error,
        stake: parsed.stake,
        metric: parsed.metric,
      }),
    };
  }

  const mcpResult = invokeSpuMcpTool("validate_spu_direct", {
    spuId,
    formData: lookup.formData,
    context: { stake: parsed.stake },
  } satisfies ValidateSpuDirectInput) as SpuNodeExecutionView;

  const result = normalizeValidateResult(mcpResult);
  return {
    query: text,
    parsed,
    spuId,
    result,
    answer: generateAnswer({
      metric: parsed.metric,
      stake: parsed.stake,
      result,
    }),
  };
}
