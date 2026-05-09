export type UnifiedExecutionState =
  | "INIT"
  | "READY"
  | "RUNNING"
  | "BLOCKED"
  | "PASSED"
  | "FAILED"
  | "SIGNING"
  | "ARCHIVED";

export type StateScope = "NODE" | "CONTAINER";

export const STATE_SCOPE_NODE: StateScope = "NODE";
export const STATE_SCOPE_CONTAINER: StateScope = "CONTAINER";

export const ERROR_UNKNOWN_SCOPE = "SM_STATE_UNKNOWN_SCOPE";
export const ERROR_UNKNOWN_STATUS = "SM_STATE_UNKNOWN_STATUS";
export const ERROR_ILLEGAL_TRANSITION = "SM_STATE_ILLEGAL_TRANSITION";

export type StateTransitionErrorCode =
  | typeof ERROR_UNKNOWN_SCOPE
  | typeof ERROR_UNKNOWN_STATUS
  | typeof ERROR_ILLEGAL_TRANSITION;

export interface StateTransitionErrorPayload {
  code: StateTransitionErrorCode;
  message: string;
  scope?: string;
  current?: string;
  target?: string;
  allowed?: string[];
}

export class StateTransitionError extends Error {
  readonly code: StateTransitionErrorCode;
  readonly scope?: string;
  readonly current?: string;
  readonly target?: string;
  readonly allowed: string[];

  constructor(payload: StateTransitionErrorPayload) {
    super(payload.message);
    this.name = "StateTransitionError";
    this.code = payload.code;
    this.scope = payload.scope;
    this.current = payload.current;
    this.target = payload.target;
    this.allowed = [...(payload.allowed ?? [])];
  }

  asPayload(): StateTransitionErrorPayload {
    return {
      code: this.code,
      message: this.message,
      scope: this.scope,
      current: this.current,
      target: this.target,
      allowed: [...this.allowed],
    };
  }
}

const UNIFIED_STATES: readonly UnifiedExecutionState[] = [
  "INIT",
  "READY",
  "RUNNING",
  "BLOCKED",
  "PASSED",
  "FAILED",
  "SIGNING",
  "ARCHIVED",
] as const;

const LEGACY_STATE_ALIASES: Readonly<Record<string, UnifiedExecutionState>> = {
  INIT: "INIT",
  READY: "READY",
  RUNNING: "RUNNING",
  BLOCKED: "BLOCKED",
  PASSED: "PASSED",
  FAILED: "FAILED",
  SIGNING: "SIGNING",
  ARCHIVED: "ARCHIVED",
  DRAFT: "INIT",
  PENDING: "INIT",
  UNLOCKED: "READY",
  IN_PROGRESS: "RUNNING",
  COMPUTED: "RUNNING",
  GATED: "RUNNING",
  GATE_PASS: "SIGNING",
  GATE_FAIL: "FAILED",
  PASS: "PASSED",
  FINAL_PASS: "PASSED",
  QUALIFIED: "PASSED",
  VALIDATED: "PASSED",
  VERIFIED: "PASSED",
  COMPLETED: "PASSED",
  SUCCESS: "PASSED",
  OVERRIDDEN: "PASSED",
  FAIL: "FAILED",
  FINAL_FAIL: "FAILED",
  REJECTED: "FAILED",
  CRITICAL: "FAILED",
  ERROR: "FAILED",
  LOCKED: "BLOCKED",
};

export const PAGE_TEXT_STATE_MAP_ZH_CN: Readonly<Record<string, UnifiedExecutionState>> = {
  草稿: "INIT",
  就绪: "READY",
  可执行: "READY",
  执行中: "RUNNING",
  进行中: "RUNNING",
  阻塞: "BLOCKED",
  受阻: "BLOCKED",
  已阻断: "BLOCKED",
  通过: "PASSED",
  已完成: "PASSED",
  已验证: "PASSED",
  合格: "PASSED",
  不通过: "FAILED",
  未通过: "FAILED",
  已驳回: "FAILED",
  签名中: "SIGNING",
  已归档: "ARCHIVED",
};

const NODE_TRANSITIONS: Readonly<Record<UnifiedExecutionState, readonly UnifiedExecutionState[]>> = {
  INIT: ["READY", "RUNNING", "BLOCKED"],
  READY: ["RUNNING", "BLOCKED", "ARCHIVED"],
  RUNNING: ["PASSED", "FAILED", "BLOCKED", "SIGNING"],
  BLOCKED: ["READY", "RUNNING", "FAILED"],
  PASSED: ["SIGNING", "ARCHIVED"],
  FAILED: ["READY", "RUNNING", "SIGNING", "ARCHIVED"],
  SIGNING: ["PASSED", "FAILED", "ARCHIVED"],
  ARCHIVED: [],
};

const CONTAINER_TRANSITIONS: Readonly<Record<UnifiedExecutionState, readonly UnifiedExecutionState[]>> = {
  INIT: ["READY", "RUNNING", "BLOCKED"],
  READY: ["RUNNING", "BLOCKED", "ARCHIVED"],
  RUNNING: ["READY", "BLOCKED", "PASSED", "FAILED", "SIGNING"],
  BLOCKED: ["READY", "RUNNING", "FAILED"],
  PASSED: ["SIGNING", "ARCHIVED"],
  FAILED: ["READY", "RUNNING", "SIGNING", "ARCHIVED"],
  SIGNING: ["PASSED", "FAILED", "ARCHIVED"],
  ARCHIVED: [],
};

const TRANSITIONS_BY_SCOPE: Readonly<Record<StateScope, Readonly<Record<UnifiedExecutionState, readonly UnifiedExecutionState[]>>>> = {
  NODE: NODE_TRANSITIONS,
  CONTAINER: CONTAINER_TRANSITIONS,
};

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeScope(scope: string): StateScope {
  const token = normalizeToken(scope);
  if (token === STATE_SCOPE_NODE) {
    return STATE_SCOPE_NODE;
  }
  if (token === STATE_SCOPE_CONTAINER) {
    return STATE_SCOPE_CONTAINER;
  }
  throw new StateTransitionError({
    code: ERROR_UNKNOWN_SCOPE,
    message: `Unknown state machine scope: ${scope}`,
    scope,
  });
}

export function normalizeState(value: unknown, scope?: string): UnifiedExecutionState {
  if (typeof scope !== "undefined") {
    normalizeScope(scope);
  }
  const token = normalizeToken(value);
  const mapped = LEGACY_STATE_ALIASES[token];
  if (mapped) {
    return mapped;
  }
  throw new StateTransitionError({
    code: ERROR_UNKNOWN_STATUS,
    message: `Unknown status value: ${String(value)}`,
    scope,
    current: String(value ?? ""),
  });
}

export function normalizePageStatusText(value: unknown): UnifiedExecutionState {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new StateTransitionError({
      code: ERROR_UNKNOWN_STATUS,
      message: "Page status text is empty.",
      current: "",
    });
  }
  const mapped = PAGE_TEXT_STATE_MAP_ZH_CN[text];
  if (mapped) {
    return mapped;
  }
  return normalizeState(text);
}

export function allowedTargets(scope: string, currentState: unknown): UnifiedExecutionState[] {
  const normalizedScope = normalizeScope(scope);
  const normalizedCurrent = normalizeState(currentState, normalizedScope);
  return [...TRANSITIONS_BY_SCOPE[normalizedScope][normalizedCurrent]];
}

export function canTransition(scope: string, currentState: unknown, targetState: unknown): boolean {
  const normalizedScope = normalizeScope(scope);
  const normalizedCurrent = normalizeState(currentState, normalizedScope);
  const normalizedTarget = normalizeState(targetState, normalizedScope);
  if (normalizedCurrent === normalizedTarget) {
    return true;
  }
  return TRANSITIONS_BY_SCOPE[normalizedScope][normalizedCurrent].includes(normalizedTarget);
}

export function assertTransition(scope: string, currentState: unknown, targetState: unknown): UnifiedExecutionState {
  const normalizedScope = normalizeScope(scope);
  const normalizedCurrent = normalizeState(currentState, normalizedScope);
  const normalizedTarget = normalizeState(targetState, normalizedScope);
  if (normalizedCurrent === normalizedTarget) {
    return normalizedTarget;
  }
  const allowed = TRANSITIONS_BY_SCOPE[normalizedScope][normalizedCurrent];
  if (!allowed.includes(normalizedTarget)) {
    throw new StateTransitionError({
      code: ERROR_ILLEGAL_TRANSITION,
      message: `Illegal transition: ${normalizedScope} ${normalizedCurrent} -> ${normalizedTarget}`,
      scope: normalizedScope,
      current: normalizedCurrent,
      target: normalizedTarget,
      allowed: [...allowed],
    });
  }
  return normalizedTarget;
}

export function transition(scope: string, currentState: unknown, targetState: unknown): UnifiedExecutionState {
  return assertTransition(scope, currentState, targetState);
}

export function toSchedulerTaskStatus(state: UnifiedExecutionState): "ready" | "blocked" | "running" | "pass" | "failed" {
  if (state === "RUNNING" || state === "SIGNING") {
    return "running";
  }
  if (state === "BLOCKED") {
    return "blocked";
  }
  if (state === "PASSED" || state === "ARCHIVED") {
    return "pass";
  }
  if (state === "FAILED") {
    return "failed";
  }
  return "ready";
}

export function listUnifiedStates(): UnifiedExecutionState[] {
  return [...UNIFIED_STATES];
}
