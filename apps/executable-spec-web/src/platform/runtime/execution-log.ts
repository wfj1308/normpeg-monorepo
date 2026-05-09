export type ExecutionFailureStage =
  | "input"
  | "rule"
  | "state"
  | "proof_generation"
  | "proof_aggregation"
  | "unknown";

export interface ExecutionRequestSummary {
  source: string;
  intent?: string;
  containerId?: string | null;
  nodeId?: string | null;
  spuId?: string | null;
  ruleId?: string | null;
  ruleVersion?: string | null;
  normdocId?: string | null;
  inputKeys: string[];
  inputCount: number;
}

export interface ExecutionMatchedSpu {
  spuId: string;
  version?: string;
  norm?: string;
  clause?: string;
}

export interface ExecutionStateTransition {
  scope: "NODE" | "CONTAINER";
  from: string | null;
  to: string;
  reason: string;
  at: string;
}

export interface ExecutionGateDecisionSummary {
  status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
  decision?: "PASS" | "BLOCK" | "OVERRIDE";
  passed: boolean;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  failedRuleIds: string[];
}

export interface ExecutionTimingCheckpoint {
  name: string;
  at: string;
  elapsedMs: number;
}

export interface ExecutionTiming {
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  checkpoints: ExecutionTimingCheckpoint[];
}

export interface ExecutionErrorInfo {
  stage: ExecutionFailureStage;
  code: string | null;
  message: string;
  stack: string | null;
}

export interface DebugTracePathStep {
  stepIndex?: number;
  step: string;
  formula: string;
  outputField?: string;
  inputSnapshot?: Record<string, unknown>;
  result: unknown;
  startedAt?: string;
  completedAt?: string;
  at: string;
}

export interface DebugTraceSnapshot {
  label: string;
  at: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface DebugTrace {
  pathSteps: DebugTracePathStep[];
  inputOutputSnapshots: DebugTraceSnapshot[];
  warnings: string[];
}

export interface ExecutionLog {
  executionId: string;
  requestSummary: ExecutionRequestSummary;
  matchedSpu: ExecutionMatchedSpu | null;
  stateTransitions: ExecutionStateTransition[];
  gateDecisionSummary: ExecutionGateDecisionSummary | null;
  timing: ExecutionTiming;
  errorInfo: ExecutionErrorInfo | null;
  debugTrace: DebugTrace;
}

export interface StartExecutionParams {
  executionId: string;
  requestSummary?: Partial<ExecutionRequestSummary>;
  matchedSpu?: ExecutionMatchedSpu | null;
  startedAt?: string;
}

export interface CaptureExecutionErrorParams {
  executionId: string;
  stage?: ExecutionFailureStage;
  reason: unknown;
}

export interface ExecutionLogSink {
  persist(log: ExecutionLog): void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function safeElapsedMs(startedAt: string, currentAt: string): number {
  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(currentAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return 0;
  }
  return Math.max(0, endMs - startMs);
}

function buildDefaultRequestSummary(executionId: string): ExecutionRequestSummary {
  return {
    source: "unknown",
    nodeId: executionId,
    inputKeys: [],
    inputCount: 0,
  };
}

function mergeRequestSummary(
  base: ExecutionRequestSummary,
  patch: Partial<ExecutionRequestSummary> | undefined,
): ExecutionRequestSummary {
  if (!patch) {
    return base;
  }
  const inputKeys =
    Array.isArray(patch.inputKeys) && patch.inputKeys.length > 0
      ? [...new Set(patch.inputKeys.map((item) => String(item).trim()).filter(Boolean))]
      : base.inputKeys;
  const inputCount = typeof patch.inputCount === "number" ? patch.inputCount : inputKeys.length;
  return {
    source: patch.source ?? base.source,
    intent: patch.intent ?? base.intent,
    containerId: patch.containerId ?? base.containerId,
    nodeId: patch.nodeId ?? base.nodeId,
    spuId: patch.spuId ?? base.spuId,
    ruleId: patch.ruleId ?? base.ruleId,
    ruleVersion: patch.ruleVersion ?? base.ruleVersion,
    normdocId: patch.normdocId ?? base.normdocId,
    inputKeys,
    inputCount,
  };
}

export function classifyExecutionFailureStage(reason: unknown): ExecutionFailureStage {
  const message = reason instanceof Error ? reason.message : String(reason);
  const lower = message.toLowerCase();

  if (
    lower.includes("input") ||
    lower.includes("invalid formula") ||
    lower.includes("is not defined") ||
    lower.includes("gates request invalid")
  ) {
    return "input";
  }
  if (
    lower.includes("rule") ||
    lower.includes("gate evaluation failed")
  ) {
    return "rule";
  }
  if (
    lower.includes("transition") ||
    lower.includes("dependency") ||
    lower.includes("pending signatures") ||
    lower.includes("spu is blocked")
  ) {
    return "state";
  }
  if (
    lower.includes("aggregatecontainerfinalproof") ||
    lower.includes("latest nodes") ||
    lower.includes("must be verified before archive")
  ) {
    return "proof_aggregation";
  }
  if (
    lower.includes("proof")
  ) {
    return "proof_generation";
  }
  return "unknown";
}

function errorCodeFromReason(reason: unknown): string | null {
  if (!reason || typeof reason !== "object") {
    return null;
  }
  const code = (reason as Record<string, unknown>).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

function errorStackFromReason(reason: unknown): string | null {
  if (!(reason instanceof Error)) {
    return null;
  }
  return typeof reason.stack === "string" && reason.stack.trim().length > 0 ? reason.stack : null;
}

function buildExecutionLog(params: StartExecutionParams): ExecutionLog {
  const startedAt = params.startedAt ?? nowIso();
  return {
    executionId: params.executionId,
    requestSummary: mergeRequestSummary(buildDefaultRequestSummary(params.executionId), params.requestSummary),
    matchedSpu: params.matchedSpu ?? null,
    stateTransitions: [],
    gateDecisionSummary: null,
    timing: {
      startedAt,
      endedAt: null,
      durationMs: null,
      checkpoints: [],
    },
    errorInfo: null,
    debugTrace: {
      pathSteps: [],
      inputOutputSnapshots: [],
      warnings: [],
    },
  };
}

export class ExecutionLogService {
  private readonly logs = new Map<string, ExecutionLog>();

  constructor(private readonly sink?: ExecutionLogSink) {}

  private flush(executionId: string): void {
    if (!this.sink) {
      return;
    }
    const log = this.logs.get(executionId);
    if (!log) {
      return;
    }
    this.sink.persist(deepClone(log));
  }

  private ensure(executionId: string): ExecutionLog {
    const existing = this.logs.get(executionId);
    if (existing) {
      return existing;
    }
    const created = buildExecutionLog({ executionId });
    this.logs.set(executionId, created);
    this.flush(executionId);
    return created;
  }

  startExecution(params: StartExecutionParams): ExecutionLog {
    const current = this.ensure(params.executionId);
    current.requestSummary = mergeRequestSummary(current.requestSummary, params.requestSummary);
    if (params.matchedSpu) {
      current.matchedSpu = { ...params.matchedSpu };
    }
    if (params.startedAt && params.startedAt.trim().length > 0) {
      current.timing.startedAt = params.startedAt;
    }
    this.flush(params.executionId);
    return deepClone(current);
  }

  setRequestSummary(executionId: string, requestSummary: Partial<ExecutionRequestSummary>): void {
    const current = this.ensure(executionId);
    current.requestSummary = mergeRequestSummary(current.requestSummary, requestSummary);
    this.flush(executionId);
  }

  setMatchedSpu(executionId: string, matchedSpu: ExecutionMatchedSpu | null): void {
    const current = this.ensure(executionId);
    current.matchedSpu = matchedSpu ? { ...matchedSpu } : null;
    this.flush(executionId);
  }

  addStateTransition(executionId: string, transition: Omit<ExecutionStateTransition, "at"> & { at?: string }): void {
    const current = this.ensure(executionId);
    current.stateTransitions.push({
      ...transition,
      at: transition.at ?? nowIso(),
    });
    this.flush(executionId);
  }

  setGateDecisionSummary(executionId: string, summary: ExecutionGateDecisionSummary): void {
    const current = this.ensure(executionId);
    current.gateDecisionSummary = {
      ...summary,
      failedRuleIds: [...summary.failedRuleIds],
    };
    this.flush(executionId);
  }

  addPathStep(
    executionId: string,
    step: Omit<DebugTracePathStep, "at"> & { at?: string },
  ): void {
    const current = this.ensure(executionId);
    current.debugTrace.pathSteps.push({
      ...step,
      inputSnapshot: step.inputSnapshot ? { ...step.inputSnapshot } : undefined,
      at: step.at ?? nowIso(),
    });
    this.flush(executionId);
  }

  addInputOutputSnapshot(
    executionId: string,
    snapshot: Omit<DebugTraceSnapshot, "at"> & { at?: string },
  ): void {
    const current = this.ensure(executionId);
    current.debugTrace.inputOutputSnapshots.push({
      ...snapshot,
      at: snapshot.at ?? nowIso(),
      input: { ...snapshot.input },
      output: { ...snapshot.output },
    });
    this.flush(executionId);
  }

  addWarning(executionId: string, warning: string): void {
    const current = this.ensure(executionId);
    const normalized = warning.trim();
    if (!normalized || current.debugTrace.warnings.includes(normalized)) {
      return;
    }
    current.debugTrace.warnings.push(normalized);
    this.flush(executionId);
  }

  markCheckpoint(executionId: string, name: string, at?: string): void {
    const current = this.ensure(executionId);
    const checkpointAt = at ?? nowIso();
    current.timing.checkpoints.push({
      name,
      at: checkpointAt,
      elapsedMs: safeElapsedMs(current.timing.startedAt, checkpointAt),
    });
    this.flush(executionId);
  }

  captureError(params: CaptureExecutionErrorParams): void {
    const current = this.ensure(params.executionId);
    const message = params.reason instanceof Error ? params.reason.message : String(params.reason);
    current.errorInfo = {
      stage: params.stage ?? classifyExecutionFailureStage(params.reason),
      code: errorCodeFromReason(params.reason),
      message,
      stack: errorStackFromReason(params.reason),
    };
    this.markCompleted(params.executionId);
    this.flush(params.executionId);
  }

  markCompleted(executionId: string, endedAt?: string): void {
    const current = this.ensure(executionId);
    const end = endedAt ?? nowIso();
    current.timing.endedAt = end;
    current.timing.durationMs = safeElapsedMs(current.timing.startedAt, end);
    this.flush(executionId);
  }

  getExecutionLog(executionId: string): ExecutionLog | null {
    const current = this.logs.get(executionId);
    return current ? deepClone(current) : null;
  }

  listExecutionLogs(): ExecutionLog[] {
    return Array.from(this.logs.values())
      .sort((a, b) => b.timing.startedAt.localeCompare(a.timing.startedAt))
      .map((item) => deepClone(item));
  }
}
