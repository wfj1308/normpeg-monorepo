import { SPULoader } from "./spu-loader.ts";

import type {
  ExecutionResult,
  GateEvaluation,
  GateResult,
  NodeSnapshot,
  PathStep,
  Proof,
  Rule,
  SPUNode,
} from "./spu-types.ts";

type RuntimeRecord = {
  node: SPUNode;
  submittedFormCode?: string;
  formData?: Record<string, number>;
  executionResult?: ExecutionResult;
  proof?: Proof;
  completedSignatures: string[];
};

const runtimeStore = new Map<string, RuntimeRecord>();

export type CreateNodeInput =
  | string
  | {
      spuId: string;
      containerId?: string | null;
      volumeRef?: string | null;
      nodeId?: string | null;
      attemptIndex?: number | null;
      createdAt?: string | null;
    };

type NormalizedCreateNodeInput = {
  spuId: string;
  containerId?: string;
  volumeRef?: string;
  nodeId?: string;
  attemptIndex?: number;
  createdAt?: string;
};

export function createNode(input: CreateNodeInput): SPUNode {
  const normalizedInput = normalizeCreateNodeInput(input);
  const spu = SPULoader.getSPU(normalizedInput.spuId);
  if (!spu) {
    throw new Error(`SPU not loaded: ${normalizedInput.spuId}`);
  }

  const node: SPUNode = {
    node_id: normalizedInput.nodeId,
    spuId: normalizedInput.spuId,
    container_ref: normalizedInput.containerId,
    volume_ref: normalizedInput.volumeRef,
    attempt_index: normalizedInput.attemptIndex,
    created_at: normalizedInput.createdAt ?? new Date().toISOString(),
    dependsOn: [],
    blockedByFailure: false,
    isAutoUnlocked: false,
    loadedForms: [...spu.forms],
    loadedPath: [...spu.path],
    loadedRules: [...spu.rules],
    status: "DRAFT",
  };

  runtimeStore.set(normalizedInput.spuId, {
    node,
    completedSignatures: [],
  });

  return node;
}

export function submitForm(node: SPUNode, inputs: Record<string, number>): SPUNode {
  const runtime = getRuntime(node.spuId);
  const submittedFormCode = runtime.node.loadedForms[0]?.formCode;
  if (!submittedFormCode) {
    throw new Error(`no form loaded for node: ${node.spuId}`);
  }

  runtime.completedSignatures = [];
  runtime.submittedFormCode = submittedFormCode;
  runtime.formData = { ...inputs };
  runtime.executionResult = undefined;
  runtime.proof = undefined;
  runtime.node = {
    ...runtime.node,
    execution_result: undefined,
    gate_result: undefined,
    proof: undefined,
    status: "FILLED",
  };

  return runtime.node;
}

export function executeNode(node: SPUNode): SPUNode {
  const runtime = getRuntime(node.spuId);
  if (!runtime.formData) {
    throw new Error(`form not submitted: ${node.spuId}`);
  }

  const pathResult = executePath(runtime.node.loadedPath, runtime.formData);
  runtime.node = {
    ...runtime.node,
    execution_result: pathResult.outputs,
    status: "COMPUTED",
  };

  const gateResult = executeRules(runtime.node.loadedRules, pathResult.outputs, runtime.formData);
  runtime.node = {
    ...runtime.node,
    gate_result: gateResult,
    status: "GATED",
  };

  const proof = buildProof(runtime.node, runtime.formData, pathResult.outputs, pathResult.trace, gateResult);
  runtime.proof = proof;
  runtime.node = {
    ...runtime.node,
    proof,
    status: "SIGNING",
  };
  runtime.executionResult = toExecutionResult(runtime.node, runtime.formData);

  return runtime.node;
}

export function signNode(node: SPUNode, role: string): SPUNode {
  const runtime = getRuntime(node.spuId);
  if (!runtime.proof) {
    throw new Error(`proof not ready: ${node.spuId}`);
  }
  if (!runtime.proof.requiredSignatures.includes(role)) {
    throw new Error(`signature role not required: ${role}`);
  }
  if (!runtime.completedSignatures.includes(role)) {
    runtime.completedSignatures = [...runtime.completedSignatures, role];
  }

  const pendingSignatures = runtime.proof.requiredSignatures.filter(
    (requiredRole) => !runtime.completedSignatures.includes(requiredRole),
  );

  const proof = {
    ...runtime.proof,
    pendingSignatures,
    signedBy: [...runtime.completedSignatures],
  };
  runtime.proof = proof;
  const finalStatus =
    pendingSignatures.length === 0 ? (proof.gate?.passed ? "FINAL_PASS" : "FINAL_FAIL") : "SIGNING";
  runtime.node = {
    ...runtime.node,
    proof,
    status: finalStatus,
  };
  if (runtime.executionResult) {
    runtime.executionResult = {
      ...runtime.executionResult,
      proof,
    };
  }

  return runtime.node;
}

export function getNodeSnapshot(spuId: string): NodeSnapshot {
  const runtime = getRuntime(spuId);
  return {
    node_id: runtime.node.node_id,
    spuId: runtime.node.spuId,
    container_ref: runtime.node.container_ref,
    volume_ref: runtime.node.volume_ref,
    attempt_index: runtime.node.attempt_index,
    created_at: runtime.node.created_at,
    loadedForms: [...runtime.node.loadedForms],
    loadedPath: [...runtime.node.loadedPath],
    loadedRules: [...runtime.node.loadedRules],
    status: runtime.node.status,
    submittedFormCode: runtime.submittedFormCode,
    formData: runtime.formData ? { ...runtime.formData } : undefined,
    executionResult: runtime.executionResult,
    proof: runtime.proof,
    completedSignatures: [...runtime.completedSignatures],
  };
}

function getRuntime(spuId: string): RuntimeRecord {
  const runtime = runtimeStore.get(spuId);
  if (!runtime) {
    throw new Error(`node not created: ${spuId}`);
  }
  return runtime;
}

function normalizeCreateNodeInput(input: CreateNodeInput): NormalizedCreateNodeInput {
  if (typeof input === "string") {
    const spuId = input.trim();
    if (!spuId) {
      throw new Error("spuId is required");
    }
    return { spuId };
  }

  const spuId = input.spuId.trim();
  if (!spuId) {
    throw new Error("spuId is required");
  }
  const rawContainerId = typeof input.containerId === "string" ? input.containerId.trim() : "";
  const rawVolumeRef = typeof input.volumeRef === "string" ? input.volumeRef.trim() : "";
  const rawNodeId = typeof input.nodeId === "string" ? input.nodeId.trim() : "";
  const rawAttemptIndex = Number(input.attemptIndex);
  const attemptIndex = Number.isInteger(rawAttemptIndex) && rawAttemptIndex > 0 ? rawAttemptIndex : undefined;
  const rawCreatedAt = typeof input.createdAt === "string" ? input.createdAt.trim() : "";
  return {
    spuId,
    containerId: rawContainerId || undefined,
    volumeRef: rawVolumeRef || undefined,
    nodeId: rawNodeId || undefined,
    attemptIndex,
    createdAt: rawCreatedAt || undefined,
  };
}

export function executePath(pathSteps: PathStep[], inputs: Record<string, number>) {
  const context: Record<string, number> = { ...inputs };
  const outputs: Record<string, number> = {};
  const trace: Array<{ step: string; formula: string; result: number }> = [];

  for (const step of pathSteps) {
    const [outputKey, expression] = parseFormula(step.formula);
    const evaluator = new Function(...Object.keys(context), `"use strict"; return (${expression});`);
    const rawResult = evaluator(...Object.values(context));
    if (typeof rawResult !== "number" || Number.isNaN(rawResult)) {
      throw new Error(`path result must be a number: ${step.formula}`);
    }
    const result = roundTo4(rawResult);
    context[outputKey] = result;
    outputs[outputKey] = result;
    trace.push({
      step: step.step,
      formula: step.formula,
      result,
    });
  }

  return { outputs, trace };
}

export function executeRules(
  rules: Rule[],
  outputs: Record<string, number>,
  inputs: Record<string, number> = {},
): GateEvaluation {
  const results = rules.map((rule) => {
    const actual = outputs[rule.field];
    if (typeof actual !== "number" || Number.isNaN(actual)) {
      throw new Error(`rule field is missing or invalid: ${rule.field}`);
    }
    const threshold = resolveRuleValue(rule.value, inputs);
    const passed = compare(actual, rule.operator, threshold);
    return {
      ruleId: rule.ruleId,
      passed,
      actual,
      expected: threshold,
      field: rule.field,
      operator: rule.operator,
      message: rule.message,
    };
  });

  return {
    passed: results.every((item) => item.passed),
    results,
  };
}

export function buildProof(
  node: SPUNode,
  inputs: Record<string, number>,
  outputs: Record<string, number>,
  trace: Array<{ step: string; formula: string; result: number }>,
  gateResult: GateEvaluation,
): Proof {
  const spu = getSPUForNode(node);
  const status: "FINAL_PASS" | "FINAL_FAIL" = gateResult.passed ? "FINAL_PASS" : "FINAL_FAIL";
  const requiredSignatures = [...spu.proof.requiredSignatures];
  const pendingSignatures = [...requiredSignatures];
  const resultField = spu.proof.resultField;
  const gateDecisions: GateResult[] = gateResult.results.map((item) => ({
    ruleId: item.ruleId,
    field: item.field,
    value: item.actual,
    threshold: item.expected,
    operator: item.operator,
    passed: item.passed,
    message: item.message,
  }));

  return {
    spuId: node.spuId,
    norm: spu.meta.norm,
    clause: spu.meta.clause,
    timestamp: new Date().toISOString(),
    result: {
      field: resultField,
      value: outputs[resultField],
      status: gateResult.passed ? "PASS" : "FAIL",
    },
    message: gateResult.passed ? spu.proof.passMessage : spu.proof.failMessage,
    calculationTrace: trace.map((item) => ({
      step: item.step,
      formula: item.formula,
      inputs: {},
      output: item.result,
    })),
    gateDecisions,
    requiredSignatures,
    pendingSignatures,
    signedBy: [],
    inputs: { ...inputs },
    outputs: { ...outputs },
    trace,
    gate: gateResult,
    status,
  };
}

export function submitNode(node: SPUNode, formData: Record<string, number>): SPUNode {
  const filledNode = submitForm(node, formData);
  return executeNode(filledNode);
}

function toExecutionResult(node: SPUNode, inputs: Record<string, number>): ExecutionResult {
  if (!node.execution_result || !node.gate_result || !node.proof) {
    throw new Error(`node execution not ready: ${node.spuId}`);
  }

  return {
    spuId: node.spuId,
    status: node.gate_result.passed ? "PASS" : "FAIL",
    inputs: { ...inputs },
    outputs: { ...node.execution_result },
    trace: (node.proof.trace ?? []).map((item) => ({
      step: item.step,
      formula: item.formula,
      inputs: {},
      output: item.result,
    })),
    gateResults: node.gate_result.results.map((item) => ({
      ruleId: item.ruleId,
      field: item.field,
      value: item.actual,
      threshold: item.expected,
      operator: item.operator,
      passed: item.passed,
      message: item.message,
    })),
    proof: node.proof,
  };
}

function parseFormula(formula: string): [string, string] {
  const parts = formula.split("=");
  if (parts.length !== 2) {
    throw new Error(`formula must match "output = expression": ${formula}`);
  }
  const outputKey = parts[0]?.trim();
  const expression = parts[1]?.trim();
  if (!outputKey || !expression) {
    throw new Error(`formula must match "output = expression": ${formula}`);
  }
  return [outputKey, expression];
}

function compare(left: number, operator: Rule["operator"], right: number): boolean {
  switch (operator) {
    case ">=":
      return left >= right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case "<":
      return left < right;
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      throw new Error(`unsupported operator: ${operator}`);
  }
}

function resolveRuleValue(value: Rule["value"], inputs: Record<string, number>): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.startsWith("**INPUT**:")) {
    const inputKey = value.slice("**INPUT**:".length);
    const threshold = inputs[inputKey];
    if (typeof threshold !== "number" || Number.isNaN(threshold)) {
      throw new Error(`rule threshold input is missing or invalid: ${inputKey}`);
    }
    return threshold;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`unsupported rule value: ${String(value)}`);
  }
  return parsed;
}

function roundTo4(value: number): number {
  return Number(value.toFixed(4));
}

function getSPUForNode(node: SPUNode) {
  const spu = SPULoader.getSPU(node.spuId);
  if (!spu) {
    throw new Error(`SPU not loaded: ${node.spuId}`);
  }
  return spu;
}
