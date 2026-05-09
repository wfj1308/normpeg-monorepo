import type { AnchorReceipt } from "../platform/proof/anchor-service.ts";
import type { AuditEvent, ContainerProof, ExecutionNode, GateResult, RuleDefinition, SPUDefinition, SpaceContainer } from "../platform/types.ts";
import type {
  LayerPegDependencyNode,
  LayerPegDocument,
  LayerPegExecutionPathStep,
  LayerPegGateDecision,
  LayerPegNormRef,
  LayerPegStateStatus,
} from "./document.ts";

interface LayerPegBuildContext {
  ownerDid?: string | null;
  projectRef?: string | null;
  rootRef?: string | null;
  normRef?: LayerPegNormRef | null;
}

interface BuildFromSpuOptions extends LayerPegBuildContext {
  usi?: string;
  docVersion?: string;
  dependsOn?: string[];
}

interface BuildFromNodeOptions extends LayerPegBuildContext {
  usi?: string;
  spu?: SPUDefinition | null;
  container?: SpaceContainer | null;
  auditTrail?: AuditEvent[];
  anchorReceipt?: AnchorReceipt | null;
}

interface BuildFromContainerProofOptions extends LayerPegBuildContext {
  usi?: string;
  container?: SpaceContainer | null;
  auditTrail?: AuditEvent[];
  anchorReceipt?: AnchorReceipt | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildSpecUsi(spuId: string): string {
  return `v://spec/${encodeURIComponent(spuId)}`;
}

function buildExecutionUsi(node: ExecutionNode): string {
  return `v://execution/${encodeURIComponent(node.nodeId)}`;
}

function buildContainerProofUsi(containerId: string): string {
  return `v://proof/container/${encodeURIComponent(containerId)}`;
}

function inferNormRefFromSpu(spu?: SPUDefinition | null): LayerPegNormRef | null {
  if (!spu) {
    return null;
  }
  return {
    norm: spu.meta.norm,
    clause: spu.meta.clause,
    version: spu.meta.version,
    normRefId: `${spu.meta.norm}:${spu.meta.clause}`,
  };
}

function mapNodeStatus(status: ExecutionNode["status"]): LayerPegStateStatus {
  if (status === "DRAFT") return "DRAFT";
  if (status === "RUNNING") return "COMPUTED";
  if (status === "PASS") return "VALIDATED";
  if (status === "FAIL") return "REJECTED";
  if (status === "SIGNING") return "SIGNING";
  if (status === "FINAL_PASS") return "QUALIFIED";
  return "REJECTED";
}

function mapContainerLifecycleState(
  lifecycleState: SpaceContainer["lifecycleState"],
  overallStatus: SpaceContainer["overallStatus"],
): LayerPegStateStatus {
  if (lifecycleState === "ARCHIVED") {
    return "ARCHIVED";
  }
  if (lifecycleState === "VERIFIED") {
    return overallStatus === "PASS" ? "QUALIFIED" : "REJECTED";
  }
  if (lifecycleState === "RUNNING") {
    return "RUNNING";
  }
  return "DRAFT";
}

function gateDecisionFromGateResult(gate: GateResult): LayerPegGateDecision {
  return gate.passed ? "pass" : "block";
}

function summarizeGate(gate: GateResult): { ruleTotal: number; passed: number; failed: number } {
  const ruleTotal = gate.results.length;
  const passed = gate.results.filter((item) => item.passed).length;
  return {
    ruleTotal,
    passed,
    failed: ruleTotal - passed,
  };
}

function toDependencyGraph(spuId: string, dependsOn: string[]): LayerPegDependencyNode[] {
  return [
    {
      nodeId: spuId,
      dependsOn: [...dependsOn],
    },
  ];
}

function toRuleCondition(rule: RuleDefinition): string {
  const threshold = rule.threshold ?? rule.value ?? "";
  return `${rule.field} ${rule.operator} ${String(threshold)}`.trim();
}

function ensureIsoTimestamp(value?: string): string {
  if (!value || Number.isNaN(Date.parse(value))) {
    return nowIso();
  }
  return value;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) {
      continue;
    }
    seen.add(item);
    next.push(item);
  }
  return next;
}

function buildAuditHistory(auditTrail: AuditEvent[] | undefined): LayerPegDocument["state"]["history"] {
  if (!auditTrail || auditTrail.length === 0) {
    return [];
  }
  return auditTrail
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map((event, index) => ({
      from: index === 0 ? undefined : "UNKNOWN",
      to: "UNKNOWN",
      at: ensureIsoTimestamp(event.timestamp),
      by: event.actor,
      reason: event.eventType,
    }));
}

export function buildLayerPegDocumentFromSpu(
  spu: SPUDefinition,
  options: BuildFromSpuOptions = {},
): LayerPegDocument {
  const createdAt = nowIso();
  const usi = options.usi ?? buildSpecUsi(spu.spuId);
  const normRef = options.normRef ?? inferNormRefFromSpu(spu);
  const dependsOn = options.dependsOn ?? [];
  const entryConditions = dedupeStrings([
    ...spu.rules.map((rule) => toRuleCondition(rule)),
    ...dependsOn.map((item) => `depends_on:${item}`),
  ]);
  const executionPath: LayerPegExecutionPathStep[] = spu.path.map((step) => ({
    step: step.step,
    expression: step.formula,
  }));

  return {
    header: {
      usi,
      docType: "spec",
      version: options.docVersion ?? spu.meta.version,
      ownerDid: options.ownerDid ?? null,
      createdAt,
      rootRef: options.rootRef ?? null,
      projectRef: options.projectRef ?? null,
      normRef,
    },
    gate: {
      decision: "pending",
      decisionReason: "spec_definition_ready",
      policyRef: normRef?.normRefId ?? null,
      entryConditions,
      executionPath,
      dependencyGraph: toDependencyGraph(spu.spuId, dependsOn),
      evaluation: {
        ruleTotal: spu.rules.length,
        passed: 0,
        failed: 0,
      },
    },
    body: {
      payloadType: "spu_definition",
      inputDto: Object.fromEntries(spu.data.inputs.map((item) => [item.name, item.type])),
      outputDto: Object.fromEntries(spu.data.outputs.map((item) => [item.name, item.unit ?? "unknown"])),
      data: {
        spuId: spu.spuId,
        meta: { ...spu.meta },
        forms: spu.forms ? [...spu.forms] : [],
      },
      tables: [],
      formulas: spu.path.map((step) => step.formula),
    },
    proof: {
      proofHash: null,
      payloadHash: null,
      merkleRoot: null,
      signatures: spu.proof.requiredSignatures.map((signer) => ({
        signer,
        source: "human",
      })),
      anchors: [],
      evidence: [],
    },
    state: {
      current: "DRAFT",
      stateMachine: "layerpeg_spec_lifecycle@v1",
      pendingActions: ["review", "register"],
      transitionRules: ["DRAFT->VALIDATED", "VALIDATED->QUALIFIED", "VALIDATED->REJECTED", "QUALIFIED->ARCHIVED"],
      history: [
        {
          to: "DRAFT",
          at: createdAt,
          by: options.ownerDid ?? "did:system:local",
          reason: "spec_created",
        },
      ],
    },
  };
}

export function buildLayerPegDocumentFromExecutionNode(
  node: ExecutionNode,
  options: BuildFromNodeOptions = {},
): LayerPegDocument {
  const usi = options.usi ?? buildExecutionUsi(node);
  const spu = options.spu ?? null;
  const normRef = options.normRef ?? inferNormRefFromSpu(spu);
  const gateDecision = gateDecisionFromGateResult(node.gate);
  const gateSummary = summarizeGate(node.gate);
  const containerVAddress = options.container?.vAddress ?? null;
  const createdAt = ensureIsoTimestamp(node.createdAt);
  const anchorFromExtensions =
    node.proof?.extensions && typeof node.proof.extensions === "object"
      ? ((node.proof.extensions as Record<string, unknown>).anchorReceipt as Record<string, unknown> | undefined)
      : undefined;
  const extensionAnchorId = typeof anchorFromExtensions?.anchorId === "string" ? anchorFromExtensions.anchorId : undefined;
  const extensionAnchorHash = typeof anchorFromExtensions?.hash === "string" ? anchorFromExtensions.hash : undefined;
  const extensionAnchoredAt = typeof anchorFromExtensions?.anchoredAt === "string" ? anchorFromExtensions.anchoredAt : undefined;
  const anchorReceipt = options.anchorReceipt
    ? {
        anchorId: options.anchorReceipt.anchorId,
        hash: options.anchorReceipt.hash,
        anchoredAt: options.anchorReceipt.anchoredAt,
      }
    : extensionAnchorHash
      ? {
          anchorId: extensionAnchorId,
          hash: extensionAnchorHash,
          anchoredAt: extensionAnchoredAt,
        }
      : null;
  const proofHash =
    typeof node.proof?.extensions?.proof_hash === "string"
      ? (node.proof.extensions?.proof_hash as string)
      : null;
  const merkleRoot =
    typeof node.proof?.extensions?.merkle_root === "string"
      ? (node.proof.extensions?.merkle_root as string)
      : null;
  const executionPath: LayerPegExecutionPathStep[] = node.trace.map((item) => ({
    step: item.step,
    expression: item.formula,
    result: item.result,
  }));

  return {
    header: {
      usi,
      docType: "execution",
      version: "execution-node@v1",
      ownerDid: options.ownerDid ?? null,
      createdAt,
      rootRef: options.rootRef ?? null,
      projectRef: options.projectRef ?? containerVAddress,
      normRef,
    },
    gate: {
      decision: gateDecision,
      decisionReason: gateDecision === "pass" ? "all_rules_passed" : "rule_violation_detected",
      policyRef: normRef?.normRefId ?? null,
      entryConditions: node.gate.results.map((item) => `${item.ruleId}: ${item.field} ${item.operator} ${String(item.threshold)}`),
      executionPath,
      dependencyGraph: toDependencyGraph(node.spuId, []),
      evaluation: gateSummary,
    },
    body: {
      payloadType: "execution_node",
      inputDto: { ...node.inputs },
      outputDto: { ...node.outputs },
      data: {
        nodeId: node.nodeId,
        spuId: node.spuId,
        attemptIndex: node.attemptIndex,
        gate: { ...node.gate },
      },
      tables: [],
      formulas: node.trace.map((item) => item.formula),
    },
    proof: {
      proofHash,
      payloadHash:
        typeof node.proof?.extensions?.payload_hash === "string"
          ? (node.proof.extensions?.payload_hash as string)
          : null,
      merkleRoot,
      signatures: node.signedBy.map((signer) => ({
        signer,
        source: "human",
      })),
      anchors: anchorReceipt
        ? [
            {
              anchorId: anchorReceipt.anchorId,
              target: "mock_anchor_service",
              ref: anchorReceipt.hash,
              anchoredAt: anchorReceipt.anchoredAt,
            },
          ]
        : [],
      evidence: [
        {
          gate: node.gate,
          traceLength: node.trace.length,
        },
      ],
    },
    state: {
      current: mapNodeStatus(node.status),
      stateMachine: "execution_node_state_machine@v1",
      pendingActions: node.requiredSignatures.filter((role) => !node.signedBy.includes(role)).map((role) => `sign:${role}`),
      transitionRules: ["DRAFT->COMPUTED", "COMPUTED->VALIDATED", "VALIDATED->QUALIFIED", "VALIDATED->REJECTED"],
      history: buildAuditHistory(options.auditTrail),
    },
  };
}

export function buildLayerPegDocumentFromContainerProof(
  proof: ContainerProof,
  options: BuildFromContainerProofOptions = {},
): LayerPegDocument {
  const usi = options.usi ?? buildContainerProofUsi(proof.containerId);
  const createdAt = ensureIsoTimestamp(proof.archivedAt);
  const containerState = options.container
    ? mapContainerLifecycleState(options.container.lifecycleState, options.container.overallStatus)
    : proof.overallStatus === "PASS"
      ? ("QUALIFIED" as const)
      : ("REJECTED" as const);
  const decision: LayerPegGateDecision = proof.overallStatus === "PASS" ? "pass" : "block";
  const anchorFromExtensions =
    proof.extensions && typeof proof.extensions === "object"
      ? ((proof.extensions as Record<string, unknown>).anchorReceipt as Record<string, unknown> | undefined)
      : undefined;
  const anchorId = typeof anchorFromExtensions?.anchorId === "string" ? anchorFromExtensions.anchorId : undefined;
  const anchorHash = typeof anchorFromExtensions?.hash === "string" ? anchorFromExtensions.hash : undefined;
  const anchoredAt = typeof anchorFromExtensions?.anchoredAt === "string" ? anchorFromExtensions.anchoredAt : undefined;
  const resolvedAnchor = options.anchorReceipt
    ? {
        anchorId: options.anchorReceipt.anchorId,
        hash: options.anchorReceipt.hash,
        anchoredAt: options.anchorReceipt.anchoredAt,
      }
    : anchorHash
      ? { anchorId, hash: anchorHash, anchoredAt }
      : null;

  const signatureItems =
    proof.signatures.length > 0
      ? proof.signatures.map((item) => item.signer || item.role || "unknown")
      : (proof.legacySignatures ?? []);

  return {
    header: {
      usi,
      docType: "proof",
      version: proof.schemaVersion,
      ownerDid: options.ownerDid ?? null,
      createdAt,
      rootRef: options.rootRef ?? null,
      projectRef: options.projectRef ?? options.container?.vAddress ?? null,
      normRef: options.normRef ?? null,
    },
    gate: {
      decision,
      decisionReason: proof.overallStatus === "PASS" ? "container_all_required_specs_passed" : "container_has_failed_specs",
      policyRef: null,
      entryConditions: proof.specResults.map((item) => `${item.spuId}:${item.status}`),
      executionPath: proof.specResults.map((item) => ({
        step: item.spuId,
        result: item.status,
      })),
      dependencyGraph: proof.specResults.map((item) => ({
        nodeId: item.spuId,
        dependsOn: [],
      })),
      evaluation: {
        ruleTotal: proof.specResults.length,
        passed: proof.specResults.filter((item) => item.status === "PASS").length,
        failed: proof.specResults.filter((item) => item.status !== "PASS").length,
      },
    },
    body: {
      payloadType: "container_proof",
      inputDto: {},
      outputDto: {},
      data: {
        containerId: proof.containerId,
        geoSlotRef: proof.geoSlotRef,
        specResults: proof.specResults,
      },
      tables: proof.specResults.map((item) => ({
        spuId: item.spuId,
        status: item.status,
        attempts: item.attempts,
      })),
      formulas: [],
    },
    proof: {
      proofHash: proof.hash ?? null,
      payloadHash: null,
      merkleRoot: null,
      signatures: signatureItems.map((signer) => ({
        signer,
        source: "human",
      })),
      anchors: resolvedAnchor
        ? [
            {
              anchorId: resolvedAnchor.anchorId,
              target: "mock_anchor_service",
              ref: resolvedAnchor.hash,
              anchoredAt: resolvedAnchor.anchoredAt,
            },
          ]
        : [],
      evidence: proof.auditTrail.map((event) => ({
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.timestamp,
      })),
    },
    state: {
      current: containerState,
      stateMachine: "container_lifecycle_state_machine@v1",
      pendingActions: containerState === "ARCHIVED" ? [] : ["archive"],
      transitionRules: ["DRAFT->RUNNING", "RUNNING->QUALIFIED", "RUNNING->REJECTED", "QUALIFIED->ARCHIVED"],
      history: buildAuditHistory(options.auditTrail ?? proof.auditTrail),
    },
  };
}
