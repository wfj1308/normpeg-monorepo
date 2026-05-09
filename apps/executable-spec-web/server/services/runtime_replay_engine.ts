import { createHash, randomUUID } from "node:crypto";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { evaluateGateRequest, type GateEvaluateResponse } from "./gate_evaluate_service.ts";

export type ReplayMode = "what_if_simulation" | "upgrade_validation" | "rollback_validation";

export interface RuntimeReplayRequest {
  body_snapshot: Record<string, unknown>;
  old_rulepack: unknown;
  new_rulepack: unknown;
  replay_mode?: ReplayMode;
  context?: {
    project_id?: string;
    form_code?: string;
    operator_id?: string;
  };
}

export interface ReplayProof {
  kind: "replayProof";
  proof_id: string;
  replay_id: string;
  schema_version: "replay-proof@v1";
  replay_mode: ReplayMode;
  created_at: string;
  isolation: {
    strategy: "ephemeral_platform_service";
    polluted_runtime: false;
  };
  body_hash: string;
  old_rulepack: {
    spu_id: string;
    version: string;
    hash: string;
  };
  new_rulepack: {
    spu_id: string;
    version: string;
    hash: string;
  };
  old_result_hash: string;
  new_result_hash: string;
  diff_hash: string;
  signatures: Array<{
    signer: string;
    signature: string;
    algorithm: "sha256";
  }>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashJson(value: unknown): string {
  const text = JSON.stringify(value);
  return createHash("sha256").update(text).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asSpuDefinition(input: unknown): SPUDefinition | null {
  if (!isRecord(input)) return null;
  if (typeof input.spuId === "string" && Array.isArray(input.rules) && isRecord(input.meta) && isRecord(input.data)) {
    return input as unknown as SPUDefinition;
  }
  const candidates = [input.spu, input.spu_definition, input.definition, input.rulepack, input.specir];
  for (const item of candidates) {
    if (!isRecord(item)) continue;
    if (typeof item.spuId === "string" && Array.isArray(item.rules) && isRecord(item.meta) && isRecord(item.data)) {
      return item as unknown as SPUDefinition;
    }
  }
  return null;
}

function resolveRulepack(input: unknown, mainService: PlatformService, role: "old_rulepack" | "new_rulepack"): SPUDefinition {
  const inline = asSpuDefinition(input);
  if (inline) {
    return structuredClone(inline);
  }

  const bySpuId = String(input ?? "").trim();
  if (bySpuId) {
    const found = mainService.getRegistry().find((item) => item.spuId === bySpuId);
    if (found) {
      return structuredClone(found);
    }
  }

  throw new Error(`${role} must be a SPUDefinition object or existing spuId`);
}

function normalizeReplayMode(value: unknown): ReplayMode {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "upgrade_validation") return "upgrade_validation";
  if (text === "rollback_validation") return "rollback_validation";
  return "what_if_simulation";
}

function runIsolatedReplay(params: {
  definition: SPUDefinition;
  bodySnapshot: Record<string, unknown>;
  role: "old" | "new";
  context?: RuntimeReplayRequest["context"];
}): GateEvaluateResponse {
  const isolated = new PlatformService();
  isolated.publishSpuVersion(structuredClone(params.definition));

  const container = isolated.createContainer({
    vAddress: `v://replay/${params.role}/${randomUUID()}`,
    geoSlotRef: "replay-slot",
    projectId: params.context?.project_id ?? "replay-project",
    spuId: params.definition.spuId,
  });

  return evaluateGateRequest(isolated, {
    containerId: container.containerId,
    spuId: params.definition.spuId,
    inputs: { ...params.bodySnapshot },
    context: {
      replay: true,
      replay_role: params.role,
      rule_id: params.definition.spuId,
      rule_version: params.definition.meta.version,
      operator_id: params.context?.operator_id ?? "replay-engine",
    },
  });
}

function summarizeResult(result: GateEvaluateResponse) {
  return {
    status: result.status,
    gateDecision: result.gateDecision,
    outputs: result.outputs,
    matchedRules: result.matchedRules,
    explanation: result.explanation,
    rule_id: result.rule_id,
    rule_version: result.rule_version,
  };
}

function buildDiff(oldResult: GateEvaluateResponse, newResult: GateEvaluateResponse) {
  const oldRules = new Map(oldResult.matchedRules.map((item) => [item.ruleId, item]));
  const newRules = new Map(newResult.matchedRules.map((item) => [item.ruleId, item]));
  const allRuleIds = Array.from(new Set([...oldRules.keys(), ...newRules.keys()])).sort();

  const affectedGates: string[] = [];
  const gateDiffs = allRuleIds
    .map((ruleId) => {
      const left = oldRules.get(ruleId);
      const right = newRules.get(ruleId);
      const changed = !left || !right || left.passed !== right.passed || left.expected !== right.expected;
      if (changed) affectedGates.push(ruleId);
      return {
        rule_id: ruleId,
        old_passed: left?.passed ?? null,
        new_passed: right?.passed ?? null,
        changed,
      };
    })
    .filter((item) => item.changed);

  const outputDiffs: Array<{ key: string; old: unknown; new: unknown }> = [];
  const outputKeys = Array.from(new Set([...Object.keys(oldResult.outputs), ...Object.keys(newResult.outputs)])).sort();
  for (const key of outputKeys) {
    const left = oldResult.outputs[key];
    const right = newResult.outputs[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      outputDiffs.push({ key, old: left, new: right });
    }
  }

  const changedConclusions = [] as Array<{ conclusion_id: string; old_status: string; new_status: string; changed: boolean }>;
  const statusChanged = oldResult.status !== newResult.status;
  changedConclusions.push({
    conclusion_id: "conclusion:runtime:global",
    old_status: oldResult.status,
    new_status: newResult.status,
    changed: statusChanged,
  });

  return {
    status_changed: statusChanged,
    output_diffs: outputDiffs,
    gate_diffs: gateDiffs,
    explanation_changed: oldResult.explanation !== newResult.explanation,
    affected_gates: affectedGates,
    changed_conclusions: changedConclusions.filter((item) => item.changed),
  };
}

function buildReplayProof(params: {
  replayId: string;
  replayMode: ReplayMode;
  bodySnapshot: Record<string, unknown>;
  oldRulepack: SPUDefinition;
  newRulepack: SPUDefinition;
  oldResult: unknown;
  newResult: unknown;
  diff: unknown;
  operatorId: string;
}): ReplayProof {
  const createdAt = nowIso();
  const bodyHash = hashJson(params.bodySnapshot);
  const oldRulepackHash = hashJson(params.oldRulepack);
  const newRulepackHash = hashJson(params.newRulepack);
  const oldResultHash = hashJson(params.oldResult);
  const newResultHash = hashJson(params.newResult);
  const diffHash = hashJson(params.diff);
  const signature = createHash("sha256")
    .update([params.replayId, bodyHash, oldRulepackHash, newRulepackHash, oldResultHash, newResultHash, diffHash].join(":"))
    .digest("hex");

  return {
    kind: "replayProof",
    proof_id: `replay_proof_${randomUUID()}`,
    replay_id: params.replayId,
    schema_version: "replay-proof@v1",
    replay_mode: params.replayMode,
    created_at: createdAt,
    isolation: {
      strategy: "ephemeral_platform_service",
      polluted_runtime: false,
    },
    body_hash: bodyHash,
    old_rulepack: {
      spu_id: params.oldRulepack.spuId,
      version: String(params.oldRulepack.meta.version ?? "v1"),
      hash: oldRulepackHash,
    },
    new_rulepack: {
      spu_id: params.newRulepack.spuId,
      version: String(params.newRulepack.meta.version ?? "v1"),
      hash: newRulepackHash,
    },
    old_result_hash: oldResultHash,
    new_result_hash: newResultHash,
    diff_hash: diffHash,
    signatures: [
      {
        signer: params.operatorId,
        signature,
        algorithm: "sha256",
      },
    ],
  };
}

export function getRuntimeReplaySchema() {
  return {
    replay_engine: {
      isolation: "ephemeral_platform_service",
      supported_modes: ["what_if_simulation", "upgrade_validation", "rollback_validation"],
      no_historical_runtime_pollution: true,
    },
    replay_proof_schema: {
      kind: "replayProof",
      schema_version: "replay-proof@v1",
      required_fields: [
        "proof_id",
        "replay_id",
        "replay_mode",
        "body_hash",
        "old_rulepack",
        "new_rulepack",
        "old_result_hash",
        "new_result_hash",
        "diff_hash",
        "signatures",
      ],
    },
    version_isolation_strategy: {
      strategy: "run old/new in separate in-memory PlatformService instances",
      data_isolation: [
        "no reuse of runtime containers",
        "no writeback to live node/proof store",
        "use request-scoped replay IDs",
      ],
    },
  };
}

export function runRuntimeReplay(mainService: PlatformService, payload: RuntimeReplayRequest) {
  if (!isRecord(payload.body_snapshot)) {
    throw new Error("body_snapshot must be object");
  }

  const oldRulepack = resolveRulepack(payload.old_rulepack, mainService, "old_rulepack");
  const newRulepack = resolveRulepack(payload.new_rulepack, mainService, "new_rulepack");
  const replayMode = normalizeReplayMode(payload.replay_mode);
  const replayId = `replay_${randomUUID()}`;

  const oldRaw = runIsolatedReplay({
    definition: oldRulepack,
    bodySnapshot: payload.body_snapshot,
    role: "old",
    context: payload.context,
  });
  const newRaw = runIsolatedReplay({
    definition: newRulepack,
    bodySnapshot: payload.body_snapshot,
    role: "new",
    context: payload.context,
  });

  const oldResult = summarizeResult(oldRaw);
  const newResult = summarizeResult(newRaw);
  const diff = buildDiff(oldRaw, newRaw);
  const replayProof = buildReplayProof({
    replayId,
    replayMode,
    bodySnapshot: payload.body_snapshot,
    oldRulepack,
    newRulepack,
    oldResult,
    newResult,
    diff,
    operatorId: payload.context?.operator_id ?? "replay-engine",
  });

  return {
    replay_id: replayId,
    replay_mode: replayMode,
    old_result: oldResult,
    new_result: newResult,
    diff,
    affected_gates: diff.affected_gates,
    changed_conclusions: diff.changed_conclusions,
    replay_proof: replayProof,
    isolation: {
      polluted_runtime: false,
      strategy: "ephemeral_platform_service",
    },
  };
}
