import { randomUUID } from "node:crypto";

import { RuleEngine } from "./rule-engine.ts";
import { buildInputValidationSnapshot, InputValidationError, validateAndNormalizeSpuInputs } from "./input-normalizer.ts";
import { buildNodeFinalProof } from "../proof/proof-service.ts";
import { transition } from "../state_machine/transitions.ts";
import type { CalculationTrace, ExecutionNode, GateDecision, GateResult, NodeProof, SPUDefinition } from "../types.ts";
import type { ExecutionLogService } from "./execution-log.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function emptyGate(): GateResult {
  return { passed: false, decision: "BLOCK", override: null, results: [] };
}

function roundResult(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(6));
  }
  return value;
}

function parseFormula(formula: string): { output: string; expression: string } {
  const index = formula.indexOf("=");
  if (index < 0) {
    throw new Error(`Invalid formula: ${formula}`);
  }
  const output = formula.slice(0, index).trim();
  const expression = formula.slice(index + 1).trim();
  if (!output || !expression) {
    throw new Error(`Invalid formula: ${formula}`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(output)) {
    throw new Error(`Invalid output field in formula: ${formula}`);
  }
  return { output, expression };
}

const RESERVED_IDENTIFIERS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
]);

function extractExpressionVariables(expression: string): string[] {
  const matched = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const unique = new Set<string>();
  for (const token of matched) {
    if (!RESERVED_IDENTIFIERS.has(token)) {
      unique.add(token);
    }
  }
  return [...unique];
}

function evaluateExpression(expression: string, context: Record<string, unknown>): unknown {
  const variables = extractExpressionVariables(expression);
  const keys: string[] = [];
  const values: unknown[] = [];

  for (const variable of variables) {
    if (variable === "Math") {
      keys.push("Math");
      values.push(Math);
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(context, variable)) {
      throw new Error(`Formula variable not found in context: ${variable}`);
    }
    keys.push(variable);
    values.push(context[variable]);
  }

  const evaluator = new Function(...keys, '"use strict"; return (' + expression + ");");
  return evaluator(...values);
}

function parseGateOverride(raw: unknown): { approvedBy: string; reason: string } | null {
  if (raw === null || typeof raw === "undefined") {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("__gateOverride must be an object");
  }
  const approvedBy = String((raw as Record<string, unknown>).approvedBy ?? "").trim();
  const reason = String((raw as Record<string, unknown>).reason ?? "").trim();
  if (!approvedBy) {
    throw new Error("__gateOverride.approvedBy is required");
  }
  if (!reason) {
    throw new Error("__gateOverride.reason is required");
  }
  return { approvedBy, reason };
}

function applyGateDecisionOverride(gate: GateResult, overrideRaw: unknown): GateResult {
  const override = parseGateOverride(overrideRaw);
  if (!override) {
    return gate;
  }
  if (gate.decision === "PASS") {
    return gate;
  }
  return {
    ...gate,
    passed: true,
    decision: "OVERRIDE",
    override: {
      approvedBy: override.approvedBy,
      reason: override.reason,
      at: nowIso(),
    },
  };
}

function nodeStatusFromGateDecision(decision: GateDecision): ExecutionNode["status"] {
  return decision === "BLOCK" ? "FAIL" : "PASS";
}

function assertNodeTransition(current: ExecutionNode["status"], target: ExecutionNode["status"]): void {
  transition("NODE", current, target);
}

export class ExecutionEngine {
  private executionLogs: ExecutionLogService | null = null;

  constructor(private readonly ruleEngine: RuleEngine = new RuleEngine()) {}

  setExecutionLogService(service: ExecutionLogService): void {
    this.executionLogs = service;
  }

  createNode(params: {
    spu: SPUDefinition;
    containerRef?: string;
    attemptIndex: number;
  }): ExecutionNode {
    const timestamp = nowIso();
    const node: ExecutionNode = {
      nodeId: `node_${randomUUID()}`,
      spuId: params.spu.spuId,
      containerRef: params.containerRef,
      attemptIndex: params.attemptIndex,
      status: "DRAFT",
      inputs: {},
      outputs: {},
      trace: [],
      gate: emptyGate(),
      proof: undefined,
      requiredSignatures: [...params.spu.proof.requiredSignatures],
      signedBy: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.executionLogs?.startExecution({
      executionId: node.nodeId,
      requestSummary: {
        source: "ExecutionEngine.createNode",
        containerId: params.containerRef ?? null,
        nodeId: node.nodeId,
        spuId: params.spu.spuId,
        inputKeys: [],
        inputCount: 0,
      },
      matchedSpu: {
        spuId: params.spu.spuId,
        version: params.spu.meta.version,
        norm: params.spu.meta.norm,
        clause: params.spu.meta.clause,
      },
      startedAt: timestamp,
    });
    this.executionLogs?.addStateTransition(node.nodeId, {
      scope: "NODE",
      from: null,
      to: node.status,
      reason: "node_created",
      at: timestamp,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "node_created", timestamp);
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "node_created",
      input: { ...node.inputs },
      output: { ...node.outputs },
      at: timestamp,
    });
    return node;
  }

  submitForm(node: ExecutionNode, inputs: Record<string, unknown>, spu: SPUDefinition): ExecutionNode {
    this.executionLogs?.startExecution({
      executionId: node.nodeId,
      requestSummary: {
        source: "ExecutionEngine.submitForm",
        containerId: node.containerRef ?? null,
        nodeId: node.nodeId,
        spuId: node.spuId,
        inputKeys: Object.keys(inputs),
        inputCount: Object.keys(inputs).length,
      },
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "form_submit_start");
    try {
      assertNodeTransition(node.status, "RUNNING");
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }

    let normalized;
    try {
      normalized = validateAndNormalizeSpuInputs(spu, inputs);
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: reason instanceof InputValidationError ? "input" : "unknown",
        reason,
      });
      throw reason;
    }

    const updatedAt = nowIso();
    const validationSnapshot = buildInputValidationSnapshot(normalized);
    const nextNode: ExecutionNode = {
      ...node,
      status: "RUNNING",
      inputs: { ...normalized.normalizedInputs },
      outputs: {},
      trace: [],
      gate: emptyGate(),
      inputValidation: validationSnapshot,
      proof: undefined,
      signedBy: [],
      updatedAt,
    };
    for (const conversion of validationSnapshot.conversions) {
      this.executionLogs?.addWarning(
        node.nodeId,
        `Input ${conversion.field} unit normalized: ${conversion.fromUnit} -> ${conversion.toUnit}`,
      );
    }
    this.executionLogs?.addStateTransition(node.nodeId, {
      scope: "NODE",
      from: node.status,
      to: nextNode.status,
      reason: "form_submitted",
      at: updatedAt,
    });
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "after_form_submit",
      input: { ...nextNode.inputs },
      output: { ...nextNode.outputs },
      at: updatedAt,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "form_submitted", updatedAt);
    return nextNode;
  }

  executePath(node: ExecutionNode, spu: SPUDefinition): ExecutionNode {
    const context: Record<string, unknown> = { ...node.inputs };
    const outputs: Record<string, unknown> = {};
    const trace: CalculationTrace[] = [];

    this.executionLogs?.setMatchedSpu(node.nodeId, {
      spuId: spu.spuId,
      version: spu.meta.version,
      norm: spu.meta.norm,
      clause: spu.meta.clause,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "path_execute_start");
    try {
      for (let index = 0; index < spu.path.length; index += 1) {
        const step = spu.path[index];
        const { output, expression } = parseFormula(step.formula);
        const stepStartedAt = nowIso();
        const inputSnapshot = { ...context };
        const result = roundResult(evaluateExpression(expression, inputSnapshot));
        context[output] = result;
        outputs[output] = result;
        const stepCompletedAt = nowIso();
        trace.push({
          step: step.step,
          formula: step.formula,
          context: { ...context },
          result: result as number | string | boolean,
          stepIndex: index,
          inputSnapshot,
          outputField: output,
          startedAt: stepStartedAt,
          completedAt: stepCompletedAt,
        });
        this.executionLogs?.addPathStep(node.nodeId, {
          stepIndex: index,
          step: step.step,
          formula: step.formula,
          outputField: output,
          inputSnapshot,
          result,
          startedAt: stepStartedAt,
          completedAt: stepCompletedAt,
          at: stepCompletedAt,
        });
      }
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "input",
        reason,
      });
      throw reason;
    }

    const updatedAt = nowIso();
    const nextNode: ExecutionNode = {
      ...node,
      outputs,
      trace,
      updatedAt,
    };
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "after_path_execution",
      input: { ...nextNode.inputs },
      output: { ...nextNode.outputs },
      at: updatedAt,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "path_executed", updatedAt);
    return nextNode;
  }

  evaluateRules(node: ExecutionNode, spu: SPUDefinition): ExecutionNode {
    const evaluatedGate = this.ruleEngine.evaluate(spu.rules, node.inputs, node.outputs);
    const gate = applyGateDecisionOverride(evaluatedGate, node.inputs.__gateOverride);
    const decision = gate.decision ?? (gate.passed ? "PASS" : "BLOCK");
    const nextStatus = nodeStatusFromGateDecision(decision);
    try {
      assertNodeTransition(node.status, nextStatus);
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }

    const updatedAt = nowIso();
    const nextNode: ExecutionNode = {
      ...node,
      gate: {
        ...gate,
        decision,
      },
      status: nextStatus,
      updatedAt,
    };
    const failedRuleIds = gate.results.filter((item) => !item.passed).map((item) => item.ruleId);
    const summaryStatus = decision === "BLOCK" ? "FAIL" : "PASS";
    this.executionLogs?.setGateDecisionSummary(node.nodeId, {
      status: summaryStatus,
      decision,
      passed: decision !== "BLOCK",
      totalRules: gate.results.length,
      passedRules: gate.results.length - failedRuleIds.length,
      failedRules: failedRuleIds.length,
      failedRuleIds,
    });
    if (failedRuleIds.length > 0) {
      this.executionLogs?.addWarning(node.nodeId, `Failed rules: ${failedRuleIds.join(", ")}`);
    }
    if (decision === "OVERRIDE" && gate.override) {
      this.executionLogs?.addWarning(
        node.nodeId,
        `Gate overridden by ${gate.override.approvedBy}: ${gate.override.reason}`,
      );
    }
    this.executionLogs?.addStateTransition(node.nodeId, {
      scope: "NODE",
      from: node.status,
      to: nextStatus,
      reason: "gate_evaluated",
      at: updatedAt,
    });
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "after_gate_evaluation",
      input: { ...nextNode.inputs },
      output: {
        ...nextNode.outputs,
        gatePassed: decision !== "BLOCK",
        gateDecision: decision,
      },
      at: updatedAt,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "gate_evaluated", updatedAt);
    return nextNode;
  }

  sign(node: ExecutionNode, role: string): ExecutionNode {
    if (!node.requiredSignatures.includes(role)) {
      const reason = new Error(`Signature role is not in requiredSignatures: ${role}`);
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }
    const nextSigned = node.signedBy.includes(role) ? node.signedBy : [...node.signedBy, role];
    try {
      assertNodeTransition(node.status, "SIGNING");
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }
    const updatedAt = nowIso();
    const nextNode: ExecutionNode = {
      ...node,
      signedBy: nextSigned,
      status: "SIGNING",
      updatedAt,
    };
    this.executionLogs?.addStateTransition(node.nodeId, {
      scope: "NODE",
      from: node.status,
      to: "SIGNING",
      reason: `signed_by:${role}`,
      at: updatedAt,
    });
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "after_signature",
      input: { ...nextNode.inputs },
      output: {
        ...nextNode.outputs,
        signedBy: [...nextNode.signedBy],
      },
      at: updatedAt,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, `signature_${role}`, updatedAt);
    return nextNode;
  }

  finalize(node: ExecutionNode, spu: SPUDefinition): ExecutionNode {
    const pending = node.requiredSignatures.filter((role) => !node.signedBy.includes(role));
    if (node.gate.passed && pending.length > 0) {
      const reason = new Error(`Pending signatures remain: ${pending.join(", ")}`);
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }
    const finalStatus = node.gate.passed ? "FINAL_PASS" : "FINAL_FAIL";
    try {
      assertNodeTransition(node.status, finalStatus);
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "state",
        reason,
      });
      throw reason;
    }

    let proof: NodeProof;
    try {
      proof = buildNodeFinalProof({
        node,
        spu,
      });
    } catch (reason) {
      this.executionLogs?.captureError({
        executionId: node.nodeId,
        stage: "proof_generation",
        reason,
      });
      throw reason;
    }

    const updatedAt = nowIso();
    const nextNode: ExecutionNode = {
      ...node,
      status: finalStatus,
      proof,
      updatedAt,
    };
    this.executionLogs?.addStateTransition(node.nodeId, {
      scope: "NODE",
      from: node.status,
      to: finalStatus,
      reason: "node_finalized",
      at: updatedAt,
    });
    this.executionLogs?.addInputOutputSnapshot(node.nodeId, {
      label: "after_proof_finalized",
      input: { ...nextNode.inputs },
      output: {
        ...nextNode.outputs,
        proofHash:
          typeof proof.extensions?.proof_hash === "string"
            ? String(proof.extensions.proof_hash)
            : null,
        finalStatus,
      },
      at: updatedAt,
    });
    this.executionLogs?.markCheckpoint(node.nodeId, "proof_finalized", updatedAt);
    return nextNode;
  }
}
