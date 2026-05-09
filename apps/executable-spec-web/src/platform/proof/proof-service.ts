import { sha256Json } from "./hash.ts";
import {
  buildProofVuri,
  readProjectIdFromVuri,
  resolveProjectIdForVuri,
} from "../vuri/vuri.ts";
import type {
  AuditEvent,
  ContainerProof,
  ExecutionNode,
  GateResult,
  NodeProof,
  ProofFragment,
  ProofRuleMatch,
  ProofSignature,
  SPUDefinition,
  SpaceContainer,
} from "../types.ts";

function nowIso(): string {
  return new Date().toISOString();
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeOptionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

const DEFAULT_EXECUTOR_VERSION = "executor@v1";

function toDecisionTrace(matches: ProofRuleMatch[]): Array<Record<string, unknown>> {
  return matches.map((item) => ({
    rule_id: item.ruleId,
    condition: String(item.condition ?? "").trim(),
    passed: item.passed,
    actual: item.actual,
    expected: item.expected,
    message: item.message,
  }));
}

function toProofRuleMatches(gate: GateResult): ProofRuleMatch[] {
  return gate.results.map((item) => ({
    ruleId: item.ruleId,
    condition: `${item.field} ${item.operator} ${String(item.threshold)}`,
    passed: item.passed,
    severity: item.passed ? "info" : "blocking",
    message: item.message,
    actual: item.actual,
    expected: item.threshold,
  }));
}

function normalizeGateDecision(gate: GateResult): "PASS" | "BLOCK" | "OVERRIDE" {
  if (gate.decision === "PASS" || gate.decision === "BLOCK" || gate.decision === "OVERRIDE") {
    return gate.decision;
  }
  return gate.passed ? "PASS" : "BLOCK";
}

function signatureList(requiredRoles: string[], signedBy: string[]): ProofSignature[] {
  return requiredRoles.map((role) => ({
    role,
    signer: signedBy.includes(role) ? role : null,
    signature: null,
    status: signedBy.includes(role) ? "SIGNED" : "PENDING",
    signedAt: signedBy.includes(role) ? nowIso() : null,
  }));
}

function normalizedProofStatusFromNode(node: ExecutionNode): "PASS" | "FAIL" {
  return node.status === "FINAL_PASS" ? "PASS" : "FAIL";
}

function buildProofId(hash: string): string {
  return `proof_${hash.slice(0, 20)}`;
}

export function buildProofFragment(params: {
  executionId: string | null;
  spuId: string;
  nodeId: string | null;
  containerId: string | null;
  inputSnapshot: Record<string, unknown>;
  resultSnapshot: Record<string, unknown>;
  matchedSpecVersion: string;
  matchedRules: ProofRuleMatch[];
  status: "PASS" | "FAIL" | "BLOCK" | "PENDING";
  requiredSignatures: string[];
  ruleBinding?: {
    ruleId?: string | null;
    ruleVersion?: string | null;
    normdocId?: string | null;
    packageId?: string | null;
    bundleHash?: string | null;
    componentId?: string | null;
    clauseId?: string | null;
    clauseContent?: string | null;
  };
  executorVersion?: string | null;
  operatorId?: string | null;
}): ProofFragment {
  const evaluatedAt = nowIso();
  const inputsHash = sha256Json(params.inputSnapshot);
  const decisionTrace = toDecisionTrace(params.matchedRules);
  const executorVersion = normalizeOptionalText(params.executorVersion) ?? DEFAULT_EXECUTOR_VERSION;
  const operatorId = normalizeOptionalText(params.operatorId);
  const normalizedInputs = { ...params.inputSnapshot };
  const fragmentHash = sha256Json({
    executionId: params.executionId,
    spuId: params.spuId,
    nodeId: params.nodeId,
    containerId: params.containerId,
    inputsHash,
    result: params.status,
    matchedSpecVersion: params.matchedSpecVersion,
    decisionTrace,
    ruleBinding: params.ruleBinding ?? null,
    executorVersion,
    operatorId,
    evaluatedAt,
  });
  const proofId = buildProofId(fragmentHash);
  const ruleId = normalizeOptionalText(params.ruleBinding?.ruleId) ?? params.spuId;
  const ruleVersion = normalizeOptionalText(params.ruleBinding?.ruleVersion) ?? params.matchedSpecVersion;
  const normdocId = normalizeOptionalText(params.ruleBinding?.normdocId);
  const packageId = normalizeOptionalText(params.ruleBinding?.packageId);
  const bundleHash = normalizeOptionalText(params.ruleBinding?.bundleHash);
  const componentId = normalizeOptionalText(params.ruleBinding?.componentId) ?? params.spuId;
  const clauseId = normalizeOptionalText(params.ruleBinding?.clauseId);
  const clauseContent = normalizeOptionalText(params.ruleBinding?.clauseContent);
  return {
    kind: "proofFragment",
    executionId: params.executionId,
    spuId: params.spuId,
    nodeId: params.nodeId,
    containerId: params.containerId,
    inputSnapshot: normalizedInputs,
    resultSnapshot: { ...params.resultSnapshot },
    matchedSpecVersion: params.matchedSpecVersion,
    matchedRules: [...params.matchedRules],
    status: params.status,
    signatures: signatureList(params.requiredSignatures, []),
    timestamps: {
      createdAt: evaluatedAt,
      evaluatedAt,
      finalizedAt: null,
      archivedAt: null,
    },
    archiveStatus: "NOT_ARCHIVED",
    proof_id: proofId,
    execution_id: params.executionId,
    rule_id: ruleId,
    rule_version: ruleVersion,
    normdoc_id: normdocId,
    package_id: packageId,
    inputs: normalizedInputs,
    inputs_hash: inputsHash,
    result: params.status,
    decision_trace: decisionTrace,
    executor_version: executorVersion,
    timestamp: evaluatedAt,
    operator_id: operatorId,
    bundle_hash: bundleHash,
    component_id: componentId,
    clause_id: clauseId,
    ...(clauseContent ? { clause_content: clauseContent } : {}),
    path_result: { ...params.resultSnapshot },
    gate_result: params.status,
    state_before: "RUNNING",
    state_after: params.status,
    operator: operatorId,
    evidence_chain: {
      normdoc_id: normdocId,
      bundle_hash: bundleHash,
      component_id: componentId,
      rule_id: ruleId,
      clause_id: clauseId,
      ...(clauseContent ? { clause_content: clauseContent } : {}),
    },
  };
}

export function buildNodeFinalProof(params: {
  node: ExecutionNode;
  spu: SPUDefinition;
  executorVersion?: string | null;
  operatorId?: string | null;
}): NodeProof {
  const status: "PASS" | "FAIL" = params.node.gate.passed ? "PASS" : "FAIL";
  const resultField = params.spu.proof.resultField;
  const resultValue = params.node.outputs[resultField];
  const matchedRules = toProofRuleMatches(params.node.gate);
  const finalizedAt = nowIso();
  const normalizedInputs = { ...params.node.inputs };
  const inputsHash = sha256Json(normalizedInputs);
  const decisionTrace = toDecisionTrace(matchedRules);
  const executorVersion = normalizeOptionalText(params.executorVersion) ?? DEFAULT_EXECUTOR_VERSION;
  const operatorId = normalizeOptionalText(params.operatorId) ?? normalizeOptionalText(params.node.signedBy[0]);
  const metaExtensions = toRecord(params.spu.meta.extensions);
  const normdocId = normalizeOptionalText(metaExtensions?.normdoc_id)
    ?? normalizeOptionalText(metaExtensions?.normdocId);
  const packageId = normalizeOptionalText(metaExtensions?.package_id)
    ?? normalizeOptionalText(metaExtensions?.packageId);
  const bundleHash = normalizeOptionalText(metaExtensions?.bundle_hash)
    ?? normalizeOptionalText(metaExtensions?.bundleHash);
  const componentId = normalizeOptionalText(metaExtensions?.component_id)
    ?? normalizeOptionalText(metaExtensions?.componentId)
    ?? params.node.spuId;
  const clauseId = normalizeOptionalText(metaExtensions?.clause_id)
    ?? normalizeOptionalText(metaExtensions?.clauseId);
  const clauseContent = normalizeOptionalText(metaExtensions?.clause_content)
    ?? normalizeOptionalText(metaExtensions?.clauseContent);

  const basePayload = {
    kind: "finalProof" as const,
    executionId: params.node.nodeId,
    spuId: params.node.spuId,
    nodeId: params.node.nodeId,
    containerId: params.node.containerRef ?? null,
    inputSnapshot: normalizedInputs,
    resultSnapshot: {
      outputs: { ...params.node.outputs },
      gatePassed: params.node.gate.passed,
      resultField,
      resultValue,
    },
    matchedSpecVersion: params.spu.meta.version,
    matchedRules,
    status,
    signatures: signatureList(params.node.requiredSignatures, params.node.signedBy),
    timestamps: {
      createdAt: params.node.createdAt,
      evaluatedAt: params.node.updatedAt,
      finalizedAt,
      archivedAt: null,
    },
    archiveStatus: "NOT_ARCHIVED" as const,
    proof_id: null as string | null,
    execution_id: params.node.nodeId,
    rule_id: params.node.spuId,
    rule_version: params.spu.meta.version,
    normdoc_id: normdocId,
    package_id: packageId,
    inputs: normalizedInputs,
    inputs_hash: inputsHash,
    result: status,
    decision_trace: decisionTrace,
    executor_version: executorVersion,
    timestamp: finalizedAt,
    operator_id: operatorId,
    bundle_hash: bundleHash,
    component_id: componentId,
    clause_id: clauseId,
    ...(clauseContent ? { clause_content: clauseContent } : {}),
    path_result: {
      outputs: { ...params.node.outputs },
      trace: [...params.node.trace],
    },
    gate_result: status,
    state_before: "SIGNING",
    state_after: status,
    operator: operatorId,
    evidence_chain: {
      normdoc_id: normdocId,
      bundle_hash: bundleHash,
      component_id: componentId,
      rule_id: params.node.spuId,
      clause_id: clauseId,
      ...(clauseContent ? { clause_content: clauseContent } : {}),
    },
  };

  const hash = sha256Json({
    kind: basePayload.kind,
    executionId: basePayload.executionId,
    spuId: basePayload.spuId,
    nodeId: basePayload.nodeId,
    containerId: basePayload.containerId,
    inputSnapshot: basePayload.inputSnapshot,
    resultSnapshot: basePayload.resultSnapshot,
    matchedSpecVersion: basePayload.matchedSpecVersion,
    matchedRules: basePayload.matchedRules,
    status: basePayload.status,
    signatures: basePayload.signatures,
    timestamps: basePayload.timestamps,
    archiveStatus: basePayload.archiveStatus,
  });
  const proofId = buildProofId(hash);
  const proofProjectId = readProjectIdFromVuri(params.node.vuri) ?? resolveProjectIdForVuri(null);
  const proofVuri = buildProofVuri({
    projectId: proofProjectId,
    proofId,
  });
  return {
    ...basePayload,
    proofId,
    vuri: proofVuri,
    hash,
    proofHash: hash,
    schemaVersion: params.spu.proof.schemaVersion ?? "proof.final@v1",
    technicalDetails: {
      inputSnapshot: { ...params.node.inputs },
      inputValidation: params.node.inputValidation
        ? {
            validatedAt: params.node.inputValidation.validatedAt,
            normalizedInputs: { ...params.node.inputValidation.normalizedInputs },
            conversions: [...params.node.inputValidation.conversions],
            rangeChecks: [...params.node.inputValidation.rangeChecks],
          }
        : null,
      calculationChain: [...params.node.trace],
      gateDecision: {
        decision: normalizeGateDecision(params.node.gate),
        passed: params.node.gate.passed,
        override: params.node.gate.override ?? null,
      },
      decisionBasis: {
        matchedRules: matchedRules.map((item) => ({ ...item })),
        failedRules: matchedRules.filter((item) => !item.passed).map((item) => item.ruleId),
      },
      trace: [...params.node.trace],
      gate: { ...params.node.gate },
    },
    resultField,
    resultValue,
    trace: [...params.node.trace],
    gate: params.node.gate,
    generatedAt: nowIso(),
    extensions: {
      ...(params.spu.proof.extensions ? { ...params.spu.proof.extensions } : {}),
      proof_hash: hash,
      payload_hash: hash,
      execution_id: params.node.nodeId,
    },
    proof_id: proofId,
  };
}

export function aggregateContainerFinalProof(params: {
  container: SpaceContainer;
  latestNodesBySpu: ExecutionNode[];
  attemptsBySpu: Record<string, ExecutionNode[]>;
  auditTrail: AuditEvent[];
  executionId?: string;
  executorVersion?: string | null;
  operatorId?: string | null;
}): ContainerProof {
  if (params.latestNodesBySpu.length === 0) {
    throw new Error("aggregateContainerFinalProof requires at least one node");
  }
  const nonPassNode = params.latestNodesBySpu.find((node) => node.status !== "FINAL_PASS");
  if (nonPassNode) {
    throw new Error(`aggregateContainerFinalProof requires all latest nodes FINAL_PASS: ${nonPassNode.nodeId}`);
  }
  const normalizedStatus = (status: ExecutionNode["status"]): "PASS" | "FAIL" => (status === "FINAL_PASS" ? "PASS" : "FAIL");
  const specResults = params.latestNodesBySpu.map((node) => ({
    spuId: node.spuId,
    status: normalizedStatus(node.status),
    finalNodeId: node.nodeId,
    attempts: params.attemptsBySpu[node.spuId]?.length ?? 1,
    value:
      node.proof && node.proof.resultField
        ? {
            resultField: node.proof.resultField,
            resultValue: node.proof.resultValue,
          }
        : undefined,
  }));

  const matchedRules = params.latestNodesBySpu.flatMap((node) => {
    if (node.proof?.matchedRules?.length) {
      return node.proof.matchedRules;
    }
    return toProofRuleMatches(node.gate);
  });

  const roleSignatures = Array.from(new Set(params.latestNodesBySpu.flatMap((node) => node.signedBy)));
  const boundSignatures = [params.container.tripBinding.inspector, params.container.tripBinding.supervisor].filter(
    (item): item is string => Boolean(item),
  );
  const signatureActors = boundSignatures.length > 0 ? boundSignatures : roleSignatures;
  const signatures: ProofSignature[] = signatureActors.map((actor) => ({
    role: actor,
    signer: actor,
    signature: null,
    status: "SIGNED",
    signedAt: nowIso(),
  }));

  const overallStatus = params.container.overallStatus === "PENDING" ? "FAIL" : params.container.overallStatus;
  const archivedAt = nowIso();
  const executionId = params.executionId ?? `archive_${params.container.containerId}_${Date.now()}`;
  const aggregatedInputs = {
    nodeCount: params.latestNodesBySpu.length,
    geoSlotRef: params.container.geoSlotRef,
  };
  const inputsHash = sha256Json(aggregatedInputs);
  const decisionTrace = toDecisionTrace(matchedRules);
  const executorVersion = normalizeOptionalText(params.executorVersion) ?? DEFAULT_EXECUTOR_VERSION;
  const operatorId = normalizeOptionalText(params.operatorId)
    ?? normalizeOptionalText(params.container.tripBinding.inspector)
    ?? normalizeOptionalText(params.container.tripBinding.supervisor)
    ?? normalizeOptionalText(signatureActors[0]);

  const corePayload = {
    kind: "finalProof" as const,
    executionId,
    spuId: "container:aggregate" as const,
    nodeId: null,
    containerId: params.container.containerId,
    inputSnapshot: aggregatedInputs,
    resultSnapshot: {
      overallStatus,
      passedNodeCount: specResults.filter((item) => item.status === "PASS").length,
      failedNodeCount: specResults.filter((item) => item.status !== "PASS").length,
      specResults: structuredClone(specResults),
    },
    matchedSpecVersion: "aggregate@v1",
    matchedRules,
    status: overallStatus,
    signatures,
    timestamps: {
      createdAt: archivedAt,
      evaluatedAt: archivedAt,
      finalizedAt: archivedAt,
      archivedAt,
    },
    archiveStatus: "ARCHIVED" as const,
    proof_id: null as string | null,
    execution_id: executionId,
    rule_id: "container:aggregate",
    rule_version: "aggregate@v1",
    normdoc_id: null as string | null,
    package_id: null as string | null,
    inputs: aggregatedInputs,
    inputs_hash: inputsHash,
    result: overallStatus,
    decision_trace: decisionTrace,
    executor_version: executorVersion,
    timestamp: archivedAt,
    operator_id: operatorId,
  };

  const hash = sha256Json({
    kind: corePayload.kind,
    executionId: corePayload.executionId,
    spuId: corePayload.spuId,
    nodeId: corePayload.nodeId,
    containerId: corePayload.containerId,
    inputSnapshot: corePayload.inputSnapshot,
    resultSnapshot: corePayload.resultSnapshot,
    matchedSpecVersion: corePayload.matchedSpecVersion,
    matchedRules: corePayload.matchedRules,
    status: corePayload.status,
    signatures: corePayload.signatures,
    timestamps: corePayload.timestamps,
    archiveStatus: corePayload.archiveStatus,
  });
  const proofId = buildProofId(hash);
  const proofVuri = buildProofVuri({
    projectId: params.container.projectId ?? null,
    proofId,
  });

  return {
    ...corePayload,
    proofId,
    vuri: proofVuri,
    hash,
    proofHash: hash,
    schemaVersion: "proof.final@v1",
    technicalDetails: {
      auditTrailCount: params.auditTrail.length,
      latestNodeIds: params.latestNodesBySpu.map((item) => item.nodeId),
      calculationChainByNode: params.latestNodesBySpu.map((item) => ({
        nodeId: item.nodeId,
        trace: [...item.trace],
      })),
      decisionBasisByNode: params.latestNodesBySpu.map((item) => ({
        nodeId: item.nodeId,
        gateDecision: normalizeGateDecision(item.gate),
        failedRules: item.gate.results.filter((rule) => !rule.passed).map((rule) => rule.ruleId),
      })),
    },
    // Compatibility fields for existing UI/export/document builder.
    geoSlotRef: params.container.geoSlotRef,
    overallStatus,
    specResults,
    legacySignatures: signatureActors,
    auditTrail: [...params.auditTrail],
    archivedAt,
    extensions: {},
    proof_id: proofId,
  };
}

// Backward compatible export name.
export function buildContainerProof(params: {
  container: SpaceContainer;
  latestNodesBySpu: ExecutionNode[];
  attemptsBySpu: Record<string, ExecutionNode[]>;
  auditTrail: AuditEvent[];
  executionId?: string;
}): ContainerProof {
  return aggregateContainerFinalProof(params);
}
