import { randomUUID } from "node:crypto";
import {
  AsyncExecutionWorkerPool,
  WorkerPoolTaskExecutionError,
} from "./execution_worker_pool.ts";

import { buildProofFragment } from "../../src/platform/proof/proof-service.ts";
import { classifyExecutionFailureStage } from "../../src/platform/runtime/execution-log.ts";
import type { ExecutionNode, GateDecision, ProofFragment } from "../../src/platform/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";

export interface GateEvaluateRequestPayload {
  spuId?: string;
  containerId?: string;
  nodeId?: string;
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface GateEvaluateRuleMatch {
  ruleId: string;
  condition: string;
  passed: boolean;
  severity: "info" | "blocking";
  message: string;
  actual: unknown;
  expected: unknown;
}

export interface GateExecutionEvidence {
  standard_code: string;
  clause_no: string;
  clause_title: string;
  clause_id: string;
  clause_content?: string;
}

export interface GateEvaluateResponse {
  status: "PASS" | "FAIL";
  result_code: "PASS" | "FAIL";
  rule_id: string;
  rule_version: string;
  evidence: GateExecutionEvidence;
  gateDecision: GateDecision;
  result: {
    executionId: string;
    passed: boolean;
    outcome: "PASS" | "FAIL" | "BLOCK";
    gateStatus: "PASS" | "FAIL" | "BLOCK";
    gateDecision: GateDecision;
    outputs: Record<string, unknown>;
  };
  explanation: string;
  matchedRules: GateEvaluateRuleMatch[];
  statePatch: {
    nodeId: string;
    nodeStatus: ExecutionNode["status"];
    containerId: string | null;
    containerLifecycleState: string | null;
    containerOverallStatus: string | null;
  };
  proofFragment: ProofFragment;

  // Compatibility fields (legacy callers)
  node: ExecutionNode;
  executionId: string;
  spuId: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  trace: ExecutionNode["trace"];
  gateResults: ExecutionNode["gate"]["results"];
  proof: ExecutionNode["proof"] | null;
  calculation: ExecutionNode["trace"];
}

export interface GateBatchEvaluateItemPayload extends GateEvaluateRequestPayload {
  itemId?: string;
}

export interface GateBatchProofReference {
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
}

export interface GateBatchEvaluateItemResult {
  itemId: string;
  index: number;
  status: "PASS" | "FAIL" | "BLOCKED" | "ERROR";
  response?: GateEvaluateResponse;
  error?: {
    code: GateEvaluateError["code"];
    statusCode: number;
    message: string;
  };
}

export interface GateBatchEvaluateRequestPayload {
  items: GateBatchEvaluateItemPayload[];
}

export interface GateBatchEvaluateResponse {
  summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    proofReferences: GateBatchProofReference[];
  };
  items: GateBatchEvaluateItemResult[];
  performance?: GateBatchExecutionPerformanceMetrics;
}

export interface GateBatchExecutionOptions {
  concurrency?: number;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  runner?: (item: GateBatchEvaluateItemPayload, index: number) => GateEvaluateResponse | Promise<GateEvaluateResponse>;
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

export class GateEvaluateError extends Error {
  constructor(
    message: string,
    public readonly code: "GATE_REQUEST_INVALID" | "GATE_DEPENDENCY_UNMET" | "GATE_EXECUTION_FAILED",
    public readonly statusCode: number,
  ) {
    super(message);
  }
}

function normalizeGateDecision(node: ExecutionNode): GateDecision {
  if (node.gate.decision === "PASS" || node.gate.decision === "BLOCK" || node.gate.decision === "OVERRIDE") {
    return node.gate.decision;
  }
  return node.gate.passed ? "PASS" : "BLOCK";
}

function normalizeGateStatus(decision: GateDecision): "PASS" | "FAIL" {
  return decision === "BLOCK" ? "FAIL" : "PASS";
}

function buildGateExplanation(params: {
  decision: GateDecision;
  status: "PASS" | "FAIL";
  failedRuleIds: string[];
}): string {
  if (params.decision === "OVERRIDE") {
    return "Gate evaluation overridden by manual approval";
  }
  if (params.status === "PASS") {
    return "Gate evaluation passed";
  }
  if (params.failedRuleIds.length === 0) {
    return "Gate evaluation failed";
  }
  return `Gate evaluation failed: ${params.failedRuleIds.join(", ")}`;
}

function isDependencyError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("blocked by dependency") ||
    lower.includes("does not bind spu") ||
    lower.includes("only one running spu is allowed") ||
    lower.includes("container is archived and locked")
  );
}

function readContextText(
  context: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!context) {
    return null;
  }
  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function toGateError(reason: unknown): GateEvaluateError {
  if (reason instanceof GateEvaluateError) {
    return reason;
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  if (isDependencyError(message)) {
    return new GateEvaluateError(message, "GATE_DEPENDENCY_UNMET", 409);
  }
  return new GateEvaluateError(message, "GATE_EXECUTION_FAILED", 400);
}

function buildBatchItemId(index: number, input?: string): string {
  const trimmed = String(input ?? "").trim();
  if (trimmed) {
    return trimmed;
  }
  return `item_${index + 1}`;
}

function toProofReference(index: number, itemId: string, response: GateEvaluateResponse): GateBatchProofReference {
  const proof = response.proof;
  const proofId = proof?.kind === "finalProof" ? proof.proofId : null;
  const proofHash =
    proof && typeof proof.hash === "string"
      ? proof.hash
      : response.proofFragment && typeof (response.proofFragment as Record<string, unknown>).hash === "string"
        ? String((response.proofFragment as Record<string, unknown>).hash)
        : null;
  return {
    itemId,
    index,
    executionId: response.executionId,
    nodeId: response.node.nodeId,
    spuId: response.spuId,
    containerId: response.statePatch.containerId ?? null,
    proofFragmentKind: response.proofFragment.kind,
    proofFragmentStatus: response.proofFragment.status,
    proofId,
    proofHash,
  };
}

function normalizeConcurrency(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(32, Math.floor(Number(value))));
}

function normalizeRetry(value: number | undefined): number {
  if (!Number.isFinite(value) || Number(value) < 0) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.floor(Number(value))));
}

function normalizeTimeout(value: number | undefined): number | null {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(Number(value)));
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

export function evaluateGateBatchRequest(
  service: PlatformService,
  payload: GateBatchEvaluateRequestPayload,
): GateBatchEvaluateResponse {
  if (!payload || !Array.isArray(payload.items)) {
    throw new GateEvaluateError("items is required", "GATE_REQUEST_INVALID", 400);
  }
  if (payload.items.length === 0) {
    throw new GateEvaluateError("items must not be empty", "GATE_REQUEST_INVALID", 400);
  }

  const results: GateBatchEvaluateItemResult[] = [];
  const proofReferences: GateBatchProofReference[] = [];
  let passed = 0;
  let failed = 0;
  let blocked = 0;

  for (let index = 0; index < payload.items.length; index += 1) {
    const item = payload.items[index];
    const itemId = buildBatchItemId(index, item?.itemId);
    try {
      const response = evaluateGateRequest(service, item);
      const status: GateBatchEvaluateItemResult["status"] = response.status === "PASS" ? "PASS" : "FAIL";
      if (status === "PASS") {
        passed += 1;
      } else {
        failed += 1;
      }
      proofReferences.push(toProofReference(index, itemId, response));
      results.push({
        itemId,
        index,
        status,
        response,
      });
    } catch (reason) {
      const error = toGateError(reason);
      const status: GateBatchEvaluateItemResult["status"] =
        error.code === "GATE_DEPENDENCY_UNMET" ? "BLOCKED" : "ERROR";
      if (status === "BLOCKED") {
        blocked += 1;
      } else {
        failed += 1;
      }
      results.push({
        itemId,
        index,
        status,
        error: {
          code: error.code,
          statusCode: error.statusCode,
          message: error.message,
        },
      });
    }
  }

  return {
    summary: {
      total: payload.items.length,
      passed,
      failed,
      blocked,
      proofReferences,
    },
    items: results,
  };
}

export async function evaluateGateBatchRequestConcurrent(
  service: PlatformService,
  payload: GateBatchEvaluateRequestPayload,
  options: GateBatchExecutionOptions = {},
): Promise<GateBatchEvaluateResponse> {
  if (!payload || !Array.isArray(payload.items)) {
    throw new GateEvaluateError("items is required", "GATE_REQUEST_INVALID", 400);
  }
  if (payload.items.length === 0) {
    throw new GateEvaluateError("items must not be empty", "GATE_REQUEST_INVALID", 400);
  }

  const startedAtTs = Date.now();
  const startedAt = new Date(startedAtTs).toISOString();
  const concurrency = normalizeConcurrency(options.concurrency, Math.min(8, payload.items.length));
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const maxRetries = normalizeRetry(options.maxRetries);
  const retryDelayMs = Number.isFinite(options.retryDelayMs) && Number(options.retryDelayMs) > 0
    ? Math.max(0, Math.floor(Number(options.retryDelayMs)))
    : 0;
  const runner = options.runner ?? ((item: GateBatchEvaluateItemPayload) => evaluateGateRequest(service, item));

  const pool = new AsyncExecutionWorkerPool(concurrency);
  const results: GateBatchEvaluateItemResult[] = Array.from({ length: payload.items.length }).map((_, index) => ({
    itemId: buildBatchItemId(index),
    index,
    status: "ERROR",
  }));
  const proofReferencesByIndex: Array<GateBatchProofReference | null> = Array.from(
    { length: payload.items.length },
    () => null,
  );
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let timeoutCount = 0;
  let retryCount = 0;
  const taskLatencies: number[] = [];

  await Promise.all(payload.items.map(async (item, index) => {
    const itemId = buildBatchItemId(index, item?.itemId);
    try {
      const taskResult = await pool.execute(
        () => runner(item, index),
        {
          timeoutMs: timeoutMs ?? undefined,
          maxRetries,
          retryDelayMs,
          shouldRetry: (reason) => {
            const normalized = toGateError(reason instanceof WorkerPoolTaskExecutionError ? reason.causeError : reason);
            return normalized.code === "GATE_EXECUTION_FAILED";
          },
        },
      );
      taskLatencies.push(taskResult.latencyMs);
      retryCount += Math.max(0, taskResult.attempts - 1);
      const response = taskResult.value;
      const status: GateBatchEvaluateItemResult["status"] = response.status === "PASS" ? "PASS" : "FAIL";
      if (status === "PASS") {
        passed += 1;
      } else {
        failed += 1;
      }
      proofReferencesByIndex[index] = toProofReference(index, itemId, response);
      results[index] = {
        itemId,
        index,
        status,
        response,
      };
    } catch (reason) {
      const workerError = reason instanceof WorkerPoolTaskExecutionError ? reason : null;
      if (workerError) {
        taskLatencies.push(workerError.latencyMs);
        retryCount += Math.max(0, workerError.attempts - 1);
        if (workerError.timedOut) {
          timeoutCount += 1;
        }
      }
      const normalizedError = workerError && workerError.timedOut
        ? new GateEvaluateError(
            timeoutMs ? `gate evaluate timeout after ${timeoutMs}ms` : "gate evaluate timeout",
            "GATE_EXECUTION_FAILED",
            408,
          )
        : toGateError(workerError ? workerError.causeError : reason);
      const status: GateBatchEvaluateItemResult["status"] =
        normalizedError.code === "GATE_DEPENDENCY_UNMET" ? "BLOCKED" : "ERROR";
      if (status === "BLOCKED") {
        blocked += 1;
      } else {
        failed += 1;
      }
      results[index] = {
        itemId,
        index,
        status,
        error: {
          code: normalizedError.code,
          statusCode: normalizedError.statusCode,
          message: normalizedError.message,
        },
      };
    }
  }));

  const finishedAtTs = Date.now();
  const durationMs = Math.max(1, finishedAtTs - startedAtTs);
  const proofReferences = proofReferencesByIndex.filter((item): item is GateBatchProofReference => item !== null);
  const avgLatency = taskLatencies.length > 0
    ? taskLatencies.reduce((sum, value) => sum + value, 0) / taskLatencies.length
    : 0;
  const performance: GateBatchExecutionPerformanceMetrics = {
    workerPool: {
      poolSize: concurrency,
      peakQueueSize: pool.getStats().peakQueueSize,
      submittedTasks: pool.getStats().submittedTasks,
      completedTasks: pool.getStats().completedTasks,
    },
    timeoutMs,
    maxRetries,
    retryCount,
    timeoutCount,
    latency: {
      avgMs: Number(avgLatency.toFixed(2)),
      p95Ms: Number(percentile(taskLatencies, 0.95).toFixed(2)),
      maxMs: Number((taskLatencies.length > 0 ? Math.max(...taskLatencies) : 0).toFixed(2)),
    },
    throughput: {
      itemsPerSecond: Number((payload.items.length / (durationMs / 1000)).toFixed(2)),
    },
    failureRate: Number((((failed + blocked) / payload.items.length) * 100).toFixed(2)),
    startedAt,
    finishedAt: new Date(finishedAtTs).toISOString(),
    durationMs,
  };

  return {
    summary: {
      total: payload.items.length,
      passed,
      failed,
      blocked,
      proofReferences,
    },
    items: results,
    performance,
  };
}

export function evaluateGateRequest(
  service: PlatformService,
  payload: GateEvaluateRequestPayload,
): GateEvaluateResponse {
  const executionLogs = service.getExecutionLogService();
  const inputNodeId = String(payload.nodeId ?? "").trim();
  const inputSpuId = String(payload.spuId ?? "").trim();
  const inputContainerId = String(payload.containerId ?? "").trim();
  const fallbackExecutionId = `gate_request_${randomUUID()}`;
  let executionId = inputNodeId || fallbackExecutionId;
  let logNodeId: string | null = inputNodeId || null;
  let logContainerId: string | null = inputContainerId || null;
  let logSpuId: string | null = inputSpuId || null;
  const contextRecord = payload.context && typeof payload.context === "object" && !Array.isArray(payload.context)
    ? payload.context
    : undefined;
  const contextRuleId = readContextText(contextRecord, ["rule_id", "ruleId"]) ?? null;
  const contextRuleVersion = readContextText(contextRecord, ["rule_version", "ruleVersion"]) ?? null;
  const contextNormdocId = readContextText(contextRecord, ["normdoc_id", "normdocId"]) ?? null;
  const contextPackageId = readContextText(contextRecord, ["package_id", "packageId"]) ?? null;
  const contextStandardCode = readContextText(contextRecord, ["standard_code", "standardCode"]) ?? null;
  const contextClauseId = readContextText(contextRecord, ["clause_id", "clauseId"]) ?? null;
  const contextClauseNo = readContextText(contextRecord, ["clause_no", "clauseNo", "clause"]) ?? null;
  const contextClauseTitle = readContextText(contextRecord, ["clause_title", "clauseTitle"]) ?? null;
  const contextClauseContent = readContextText(contextRecord, ["clause_content", "clauseContent", "source_text", "sourceText"]) ?? null;
  const contextBundleHash = readContextText(contextRecord, ["bundle_hash", "bundleHash"]) ?? null;
  const contextComponentId = readContextText(contextRecord, ["component_id", "componentId"]) ?? null;
  const contextOperatorId = readContextText(contextRecord, ["operator_id", "operatorId", "user_id", "userId"]) ?? null;
  const contextExecutorVersion = readContextText(contextRecord, ["executor_version", "executorVersion"]) ?? null;
  let resolvedRuleId: string | null = contextRuleId;
  let resolvedRuleVersion: string | null = contextRuleVersion;
  let resolvedNormdocId: string | null = contextNormdocId;
  let resolvedPackageId: string | null = contextPackageId;
  let resolvedStandardCode: string | null = contextStandardCode;
  let resolvedClauseId: string | null = contextClauseId;
  let resolvedClauseNo: string | null = contextClauseNo;
  let resolvedClauseTitle: string | null = contextClauseTitle;
  let resolvedClauseContent: string | null = contextClauseContent;
  let resolvedBundleHash: string | null = contextBundleHash;
  let resolvedComponentId: string | null = contextComponentId;
  let resolvedOperatorId: string | null = contextOperatorId;
  let resolvedExecutorVersion: string | null = contextExecutorVersion;

  const hasInputsObject = payload.inputs && typeof payload.inputs === "object" && !Array.isArray(payload.inputs);
  if (!hasInputsObject) {
    const error = new GateEvaluateError("inputs is required", "GATE_REQUEST_INVALID", 400);
    executionLogs.startExecution({
      executionId,
      requestSummary: {
        source: "GateEvaluateService.evaluateGateRequest",
        intent: "gate.evaluate",
        containerId: inputContainerId || null,
        nodeId: inputNodeId || null,
        spuId: inputSpuId || null,
        ruleId: contextRuleId,
        ruleVersion: contextRuleVersion,
        normdocId: contextNormdocId,
        inputKeys: [],
        inputCount: 0,
      },
    });
    executionLogs.captureError({
      executionId,
      stage: "input",
      reason: error,
    });
    throw error;
  }

  const inputs = payload.inputs as Record<string, unknown>;
  let resolvedInputs: Record<string, unknown> = { ...inputs };

  if (!inputNodeId && (!inputSpuId || !inputContainerId)) {
    const error = new GateEvaluateError(
      "nodeId or (containerId + spuId) is required",
      "GATE_REQUEST_INVALID",
      400,
    );
    executionLogs.startExecution({
      executionId,
      requestSummary: {
        source: "GateEvaluateService.evaluateGateRequest",
        intent: "gate.evaluate",
        containerId: inputContainerId || null,
        nodeId: inputNodeId || null,
        spuId: inputSpuId || null,
        ruleId: contextRuleId,
        ruleVersion: contextRuleVersion,
        normdocId: contextNormdocId,
        inputKeys: Object.keys(inputs),
        inputCount: Object.keys(inputs).length,
      },
    });
    executionLogs.captureError({
      executionId,
      stage: "input",
      reason: error,
    });
    throw error;
  }

  try {
    let nodeId = inputNodeId;
    let resolvedProjectId: string | null = null;
    let appliedOverrideKeys: string[] = [];
    if (!nodeId) {
      const container = service.getContainer(inputContainerId);
      resolvedProjectId = container?.projectId?.trim() || null;
      const effectiveSpuId = service.resolveProjectExecutionSpuId(resolvedProjectId, inputSpuId);
      const resolvedInputPatch = service.resolveProjectExecutionInputs({
        projectId: resolvedProjectId,
        spuId: effectiveSpuId,
        inputs,
      });
      resolvedInputs = resolvedInputPatch.mergedInputs;
      appliedOverrideKeys = resolvedInputPatch.appliedOverrideKeys;
      logSpuId = effectiveSpuId;
      const createdNode = service.createNode({
        containerId: inputContainerId,
        spuId: effectiveSpuId,
      });
      nodeId = createdNode.nodeId;
      logContainerId = (createdNode.containerRef ?? inputContainerId) || null;
    } else {
      const currentNode = service.getNode(nodeId);
      const currentContainerId = currentNode?.containerRef ?? null;
      const container = currentContainerId ? service.getContainer(currentContainerId) : null;
      resolvedProjectId = container?.projectId?.trim() || null;
      const effectiveSpuId = (currentNode?.spuId ?? inputSpuId) || null;
      if (effectiveSpuId) {
        const resolvedInputPatch = service.resolveProjectExecutionInputs({
          projectId: resolvedProjectId,
          spuId: effectiveSpuId,
          inputs,
        });
        resolvedInputs = resolvedInputPatch.mergedInputs;
        appliedOverrideKeys = resolvedInputPatch.appliedOverrideKeys;
        logSpuId = effectiveSpuId;
      }
      if (currentContainerId) {
        logContainerId = currentContainerId;
      }
    }
    executionId = nodeId;
    logNodeId = nodeId;
    const resolvedSpu = logSpuId ? service.getRegistry().find((item) => item.spuId === logSpuId) ?? null : null;
    resolvedRuleId = contextRuleId ?? logSpuId;
    resolvedRuleVersion = contextRuleVersion ?? resolvedSpu?.meta.version ?? null;
    resolvedNormdocId = contextNormdocId
      ?? (resolvedSpu?.meta.norm && resolvedRuleVersion ? `${resolvedSpu.meta.norm}@@${resolvedRuleVersion}` : null);
    resolvedPackageId = contextPackageId ?? null;
    resolvedStandardCode = contextStandardCode ?? resolvedSpu?.meta.norm ?? null;
    resolvedClauseNo = contextClauseNo ?? resolvedSpu?.meta.clause ?? null;
    resolvedClauseId = contextClauseId ?? resolvedClauseNo ?? null;
    resolvedClauseTitle = contextClauseTitle ?? null;
    resolvedClauseContent = contextClauseContent ?? null;
    resolvedBundleHash = contextBundleHash
      ?? (resolvedSpu?.meta.extensions && typeof resolvedSpu.meta.extensions === "object"
        ? String((resolvedSpu.meta.extensions as Record<string, unknown>).bundle_hash ?? "").trim() || null
        : null);
    resolvedComponentId = contextComponentId
      ?? (resolvedSpu?.meta.extensions && typeof resolvedSpu.meta.extensions === "object"
        ? String((resolvedSpu.meta.extensions as Record<string, unknown>).component_id ?? "").trim() || null
        : null)
      ?? node.spuId;
    resolvedOperatorId = contextOperatorId;
    resolvedExecutorVersion = contextExecutorVersion;
    executionLogs.startExecution({
      executionId,
      requestSummary: {
        source: "GateEvaluateService.evaluateGateRequest",
        intent: "gate.evaluate",
        containerId: logContainerId,
        nodeId,
        spuId: logSpuId,
        ruleId: resolvedRuleId,
        ruleVersion: resolvedRuleVersion,
        normdocId: resolvedNormdocId,
        inputKeys: Object.keys(resolvedInputs),
        inputCount: Object.keys(resolvedInputs).length,
      },
    });
    executionLogs.markCheckpoint(executionId, "gate_request_received");
    if (resolvedProjectId) {
      executionLogs.markCheckpoint(executionId, "project_context_resolved");
      if (inputSpuId && logSpuId && inputSpuId !== logSpuId) {
        executionLogs.addWarning(
          executionId,
          `ProjectContext version override applied: requested ${inputSpuId}, effective ${logSpuId}`,
        );
      }
      if (appliedOverrideKeys.length > 0) {
        executionLogs.addWarning(
          executionId,
          `ProjectContext input overrides applied: ${appliedOverrideKeys.sort((a, b) => a.localeCompare(b, "en")).join(", ")}`,
        );
      }
    }

    const node = service.submitNode(nodeId, resolvedInputs);
    executionLogs.markCheckpoint(node.nodeId, "gate_submit_completed");

    const spu = resolvedSpu ?? service.getRegistry().find((item) => item.spuId === node.spuId);
    if (!spu) {
      throw new GateEvaluateError(`spu not found: ${node.spuId}`, "GATE_EXECUTION_FAILED", 400);
    }
    executionLogs.setMatchedSpu(node.nodeId, {
      spuId: spu.spuId,
      version: spu.meta.version,
      norm: spu.meta.norm,
      clause: spu.meta.clause,
    });

    const container = node.containerRef ? service.getContainer(node.containerRef) : null;
    const gateDecision = normalizeGateDecision(node);
    const status = normalizeGateStatus(gateDecision);
    const failedRuleIds = node.gate.results.filter((item) => !item.passed).map((item) => item.ruleId);
    const matchedRules: GateEvaluateRuleMatch[] = node.gate.results.map((item) => ({
      ruleId: item.ruleId,
      condition: `${item.field} ${item.operator} ${String(item.threshold)}`,
      passed: item.passed,
      severity: item.passed ? "info" : "blocking",
      message: item.message,
      actual: item.actual,
      expected: item.threshold,
    }));
    executionLogs.setGateDecisionSummary(node.nodeId, {
      status,
      decision: gateDecision,
      passed: gateDecision !== "BLOCK",
      totalRules: matchedRules.length,
      passedRules: matchedRules.filter((item) => item.passed).length,
      failedRules: matchedRules.filter((item) => !item.passed).length,
      failedRuleIds,
    });
    if (failedRuleIds.length > 0) {
      executionLogs.addWarning(node.nodeId, `Gate failed rules: ${failedRuleIds.join(", ")}`);
    }

    const proofFragment = buildProofFragment({
      executionId: node.nodeId,
      spuId: node.spuId,
      nodeId: node.nodeId,
      containerId: node.containerRef ?? null,
      inputSnapshot: node.inputs,
      resultSnapshot: {
        outputs: node.outputs,
        gate: node.gate,
      },
      matchedSpecVersion: spu.meta.version,
      matchedRules,
      status,
      requiredSignatures: node.requiredSignatures,
      ruleBinding: {
        ruleId: resolvedRuleId ?? node.spuId,
        ruleVersion: resolvedRuleVersion ?? spu.meta.version,
        normdocId: resolvedNormdocId,
        packageId: resolvedPackageId,
        bundleHash: resolvedBundleHash,
        componentId: resolvedComponentId,
        clauseId: resolvedClauseId,
        clauseContent: resolvedClauseContent,
      },
      operatorId: resolvedOperatorId,
      executorVersion: resolvedExecutorVersion,
    });
    executionLogs.markCheckpoint(node.nodeId, "proof_fragment_built");
    executionLogs.addInputOutputSnapshot(node.nodeId, {
      label: "gate_evaluate_response",
      input: { ...node.inputs },
      output: {
        ...node.outputs,
        status,
        nodeStatus: node.status,
      },
    });

    const responseRuleId = String(resolvedRuleId ?? node.spuId).trim() || node.spuId;
    const responseRuleVersion = String(resolvedRuleVersion ?? spu.meta.version).trim() || String(spu.meta.version ?? "").trim() || "v1";
    const evidenceClauseNo = String(resolvedClauseNo ?? "").trim();
    const evidenceClauseId = String(resolvedClauseId ?? "").trim() || evidenceClauseNo;
    const evidenceStandardCode = String(resolvedStandardCode ?? "").trim() || String(spu.meta.norm ?? "").trim();
    const evidenceClauseTitle = String(resolvedClauseTitle ?? "").trim() || String(spu.meta.name ?? "").trim() || responseRuleId;
    const evidenceClauseContent = String(resolvedClauseContent ?? "").trim();

    return {
      status,
      result_code: status,
      rule_id: responseRuleId,
      rule_version: responseRuleVersion,
      evidence: {
        standard_code: evidenceStandardCode,
        clause_no: evidenceClauseNo,
        clause_title: evidenceClauseTitle,
        clause_id: evidenceClauseId,
        ...(evidenceClauseContent ? { clause_content: evidenceClauseContent } : {}),
      },
      result: {
        executionId: node.nodeId,
        passed: gateDecision !== "BLOCK",
        outcome: gateDecision === "BLOCK" ? "FAIL" : "PASS",
        gateStatus: gateDecision === "BLOCK" ? "FAIL" : "PASS",
        gateDecision,
        outputs: node.outputs,
      },
      gateDecision,
      explanation: buildGateExplanation({
        decision: gateDecision,
        status,
        failedRuleIds,
      }),
      matchedRules,
      statePatch: {
        nodeId: node.nodeId,
        nodeStatus: node.status,
        containerId: container?.containerId ?? null,
        containerLifecycleState: container?.lifecycleState ?? null,
        containerOverallStatus: container?.overallStatus ?? null,
      },
      proofFragment,

      // Compatibility fields
      node,
      executionId: node.nodeId,
      spuId: node.spuId,
      inputs: node.inputs,
      outputs: node.outputs,
      trace: node.trace,
      gateResults: node.gate.results,
      proof: node.proof ?? null,
      calculation: node.trace,
    };
  } catch (reason) {
    executionLogs.startExecution({
      executionId,
      requestSummary: {
        source: "GateEvaluateService.evaluateGateRequest",
        intent: "gate.evaluate",
        containerId: logContainerId,
        nodeId: logNodeId,
        spuId: logSpuId,
        ruleId: resolvedRuleId,
        ruleVersion: resolvedRuleVersion,
        normdocId: resolvedNormdocId,
        inputKeys: Object.keys(resolvedInputs),
        inputCount: Object.keys(resolvedInputs).length,
      },
    });
    executionLogs.captureError({
      executionId,
      stage: classifyExecutionFailureStage(reason),
      reason,
    });
    throw toGateError(reason);
  }
}
