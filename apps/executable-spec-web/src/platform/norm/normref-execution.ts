export interface NormRefSpecRule {
  spuId: string;
  order: number;
  dependsOn: string[];
  required: boolean;
}

export interface NormRef {
  normRefId: string;
  name: string;
  specs: NormRefSpecRule[];
}

export type NormExecutionStatus = "ready" | "blocked" | "running" | "pass" | "fail";
export type NormExecutionState = Record<string, NormExecutionStatus>;

function normalizeStatusValue(value: unknown): NormExecutionStatus | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (text === "pass" || text === "final_pass") {
    return "pass";
  }
  if (text === "fail" || text === "final_fail") {
    return "fail";
  }
  if (text === "running" || text === "signing" || text === "in_progress") {
    return "running";
  }
  if (text === "ready") {
    return "ready";
  }
  if (text === "blocked") {
    return "blocked";
  }
  return null;
}

function resolveResultStatus(raw: unknown): NormExecutionStatus | null {
  const direct = normalizeStatusValue(raw);
  if (direct) {
    return direct;
  }
  const record = raw as Record<string, unknown> | null;
  if (!record || Array.isArray(record)) {
    return null;
  }
  const candidates: unknown[] = [
    record.status,
    record.finalStatus,
    record.bindingStatus,
    record.nodeStatus,
    record.latestNodeStatus,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeStatusValue(candidate);
    if (normalized) {
      return normalized;
    }
  }
  if (typeof record.passed === "boolean") {
    return record.passed ? "pass" : "fail";
  }
  const gate = record.gate as Record<string, unknown> | undefined;
  if (gate && typeof gate.passed === "boolean") {
    return gate.passed ? "pass" : "fail";
  }
  return null;
}

function specsByOrder(normRef: NormRef): NormRefSpecRule[] {
  return [...normRef.specs].sort((a, b) => a.order - b.order);
}

export function buildNormExecutionState(
  normRef: NormRef,
  specResults: Record<string, any>,
): NormExecutionState {
  const executionState: NormExecutionState = {};
  const ruleMap = new Map(normRef.specs.map((item) => [item.spuId, item]));

  for (const rule of specsByOrder(normRef)) {
    const rawStatus = resolveResultStatus(specResults[rule.spuId]);
    if (rawStatus === "pass" || rawStatus === "fail" || rawStatus === "running") {
      executionState[rule.spuId] = rawStatus;
      continue;
    }

    const allDepsPassed = rule.dependsOn.every((depId) => {
      const depState = executionState[depId] ?? resolveResultStatus(specResults[depId]);
      if (!ruleMap.has(depId)) {
        return depState === "pass";
      }
      return depState === "pass";
    });
    executionState[rule.spuId] = allDepsPassed ? "ready" : "blocked";
  }

  return executionState;
}

export function canExecuteSpec(
  spuId: string,
  normRef: NormRef,
  executionState: NormExecutionState,
): boolean {
  const rule = normRef.specs.find((item) => item.spuId === spuId);
  if (!rule) {
    return false;
  }
  const status = executionState[spuId];
  if (status === "blocked" || status === "running" || status === "pass") {
    return false;
  }
  const depsReady = rule.dependsOn.every((depId) => executionState[depId] === "pass");
  if (!depsReady) {
    return false;
  }
  return status === "ready" || status === "fail";
}

export function canExecute(
  spuId: string,
  executionState: NormExecutionState,
): boolean {
  return executionState[spuId] === "ready";
}

export function getNextExecutableSpec(
  normRef: NormRef,
  executionState: NormExecutionState,
): string | null {
  for (const rule of specsByOrder(normRef)) {
    if (executionState[rule.spuId] === "ready") {
      return rule.spuId;
    }
  }
  return null;
}

export function canArchiveContainer(
  normRef: NormRef,
  executionState: NormExecutionState,
): boolean {
  return normRef.specs
    .filter((item) => item.required)
    .every((item) => executionState[item.spuId] === "pass");
}

export function autoAdvanceCurrentSpec(
  normRef: NormRef,
  executionState: NormExecutionState,
  currentSpuId: string | null,
): {
  nextSpuId: string | null;
  shouldArchive: boolean;
  message: string;
} {
  const currentStatus = currentSpuId ? executionState[currentSpuId] : undefined;
  if (currentSpuId && currentStatus === "fail") {
    return {
      nextSpuId: currentSpuId,
      shouldArchive: false,
      message: "current spec failed, recheck required",
    };
  }

  if (canArchiveContainer(normRef, executionState)) {
    return {
      nextSpuId: null,
      shouldArchive: true,
      message: "all required specs passed, ready to archive",
    };
  }

  const nextSpuId = getNextExecutableSpec(normRef, executionState);
  if (nextSpuId) {
    return {
      nextSpuId,
      shouldArchive: false,
      message: "current spec passed, switched to next spec",
    };
  }

  return {
    nextSpuId: currentSpuId,
    shouldArchive: false,
    message: "no executable spec",
  };
}
