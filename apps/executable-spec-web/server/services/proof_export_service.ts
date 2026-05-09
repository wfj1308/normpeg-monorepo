import type { LayerPegDocType } from "../../src/layerpeg/document.ts";
import { sha256Json } from "../../src/platform/proof/hash.ts";
import { computeFinalProofHash, readProofAnchorReference, readProofHash } from "../../src/platform/proof/proof-chain.ts";
import type {
  ContainerProof,
  FinalProof,
  ProofFragment,
  UnifiedProofCore,
} from "../../src/platform/types.ts";

export interface ProofLayerPegRef {
  role: "spec" | "execution" | "proof";
  usi: string;
  docType: LayerPegDocType;
  sourceRef: string;
  documentApiPath: string;
}

export interface ProofExecutionSummary {
  executionId: string | null;
  nodeId: string | null;
  containerId: string | null;
  spuId: string;
  projectId: string | null;
  stake: string | null;
  summaryText: string;
}

export interface ProofResultSummary {
  status: UnifiedProofCore["status"];
  passed: boolean;
  gateDecision: "pass" | "block" | "pending";
  ruleTotal: number;
  passedRules: number;
  failedRules: number;
  failedRuleIds: string[];
}

export interface ProofNormReference {
  spuId: string;
  title: string | null;
  norm: string | null;
  clause: string | null;
  version: string | null;
}

export interface ProofAcceptanceArchiveInfo {
  archived: boolean;
  archivedAt: string | null;
}

export interface ProofAcceptanceIntegrity {
  hashAlgorithm: "sha256";
  proofId: string | null;
  proofHash: string;
  exportHash: string;
  anchorRef: string | null;
  anchorProvider: string | null;
}

export interface ProofAcceptanceCertificate {
  certificateId: string;
  projectId: string | null;
  stake: string | null;
  containerId: string | null;
  executionId: string | null;
  spuId: string;
  inputData: Record<string, unknown>;
  decisionResult: ProofResultSummary;
  normReferences: ProofNormReference[];
  signatures: UnifiedProofCore["signatures"];
  archive: ProofAcceptanceArchiveInfo;
  integrity: ProofAcceptanceIntegrity;
}

export interface ProofPdfReadyPayload {
  templateId: "proof-audit-pdf@v1";
  generatedAt: string;
  title: string;
  executionSummary: ProofExecutionSummary;
  matchedSpecVersion: string;
  result: ProofResultSummary;
  acceptanceCertificate: ProofAcceptanceCertificate;
  signatures: UnifiedProofCore["signatures"];
  timestamps: UnifiedProofCore["timestamps"];
  linkedLayerPegDocumentRefs: ProofLayerPegRef[];
}

export interface ProofAuditExportJson {
  schemaVersion: "proof-audit-export@v1";
  generatedAt: string;
  sourceKind: "proofFragment" | "nodeFinalProof" | "containerFinalProof";
  executionSummary: ProofExecutionSummary;
  matchedSpecVersion: string;
  result: ProofResultSummary;
  acceptanceCertificate: ProofAcceptanceCertificate;
  integrity: ProofAcceptanceIntegrity;
  signatures: UnifiedProofCore["signatures"];
  timestamps: UnifiedProofCore["timestamps"];
  linkedLayerPegDocumentRefs: ProofLayerPegRef[];
  evidenceChain: {
    proof_id: string | null;
    normdoc_id: string | null;
    bundle_hash: string | null;
    component_id: string | null;
    rule_id: string | null;
    clause_id: string | null;
    clause_content: string | null;
  };
  sourceProof: Record<string, unknown>;
}

export interface ProofAuditExportPackage {
  jsonExport: ProofAuditExportJson;
  markdownSummary: string;
  pdfReadyPayload: ProofPdfReadyPayload;
}

export interface BuildProofAuditExportInput {
  proof: ProofFragment | ContainerProof | (UnifiedProofCore & Record<string, unknown>);
  executionSummary: ProofExecutionSummary;
  linkedLayerPegDocumentRefs: ProofLayerPegRef[];
  normReferences?: ProofNormReference[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeSourceKind(proof: BuildProofAuditExportInput["proof"]): ProofAuditExportJson["sourceKind"] {
  if (proof.kind === "proofFragment") {
    return "proofFragment";
  }
  if (proof.kind === "finalProof" && proof.archiveStatus === "ARCHIVED") {
    return "containerFinalProof";
  }
  return "nodeFinalProof";
}

function buildResultSummary(proof: BuildProofAuditExportInput["proof"]): ProofResultSummary {
  const failedRuleIds = proof.matchedRules.filter((item) => !item.passed).map((item) => item.ruleId);
  const passedRules = proof.matchedRules.filter((item) => item.passed).length;
  const failedRules = proof.matchedRules.length - passedRules;
  const gateDecision: ProofResultSummary["gateDecision"] =
    proof.status === "PASS" ? "pass"
      : proof.status === "PENDING" ? "pending"
      : "block";
  return {
    status: proof.status,
    passed: proof.status === "PASS",
    gateDecision,
    ruleTotal: proof.matchedRules.length,
    passedRules,
    failedRules,
    failedRuleIds,
  };
}

function formatSignatureValue(
  signatures: UnifiedProofCore["signatures"],
): string {
  if (signatures.length === 0) {
    return "none";
  }
  return signatures
    .map((item) => `${item.role}:${item.status}${item.signer ? `(${item.signer})` : ""}`)
    .join(", ");
}

function normalizeNormReferences(
  input: BuildProofAuditExportInput,
): ProofNormReference[] {
  const fromInput = (input.normReferences ?? [])
    .map((item) => ({
      spuId: String(item.spuId ?? "").trim(),
      title: item.title ? String(item.title).trim() : null,
      norm: item.norm ? String(item.norm).trim() : null,
      clause: item.clause ? String(item.clause).trim() : null,
      version: item.version ? String(item.version).trim() : null,
    }))
    .filter((item) => item.spuId.length > 0);
  if (fromInput.length > 0) {
    const deduped = new Map<string, ProofNormReference>();
    for (const item of fromInput) {
      const key = `${item.spuId}::${item.norm ?? "-"}::${item.clause ?? "-"}::${item.version ?? "-"}`;
      if (!deduped.has(key)) {
        deduped.set(key, item);
      }
    }
    return Array.from(deduped.values());
  }

  return [{
    spuId: input.executionSummary.spuId,
    title: null,
    norm: null,
    clause: null,
    version: input.proof.matchedSpecVersion,
  }];
}

function isFinalProof(proof: BuildProofAuditExportInput["proof"]): proof is FinalProof {
  return proof.kind === "finalProof";
}

function resolveProofIdentity(proof: BuildProofAuditExportInput["proof"]): {
  proofId: string | null;
  proofHash: string;
  anchorRef: string | null;
  anchorProvider: string | null;
} {
  if (!isFinalProof(proof)) {
    return {
      proofId: null,
      proofHash: sha256Json(proof),
      anchorRef: null,
      anchorProvider: null,
    };
  }

  const proofHash = readProofHash(proof) ?? computeFinalProofHash(proof);
  const anchor = readProofAnchorReference(proof);
  return {
    proofId: typeof proof.proofId === "string" && proof.proofId.trim() ? proof.proofId.trim() : null,
    proofHash,
    anchorRef: anchor?.anchorRef ?? null,
    anchorProvider: anchor?.providerName ?? null,
  };
}

function resolveArchiveInfo(proof: BuildProofAuditExportInput["proof"]): ProofAcceptanceArchiveInfo {
  if (proof.archiveStatus === "ARCHIVED") {
    return {
      archived: true,
      archivedAt: proof.timestamps.archivedAt ?? null,
    };
  }
  return {
    archived: false,
    archivedAt: null,
  };
}

function buildMarkdownSummary(params: {
  jsonExport: ProofAuditExportJson;
}): string {
  const payload = params.jsonExport;
  const result = payload.result;
  const refs = payload.linkedLayerPegDocumentRefs
    .map((item) => `- ${item.role}: ${item.usi} (${item.docType})`)
    .join("\n") || "- none";
  const failedRuleLine = result.failedRuleIds.length > 0 ? result.failedRuleIds.join(", ") : "none";
  const normLines = payload.acceptanceCertificate.normReferences
    .map((item) => `- ${item.spuId}: ${item.norm ?? "-"} / clause ${item.clause ?? "-"} / version ${item.version ?? "-"}`)
    .join("\n") || "- none";

  return `# Proof Acceptance Certificate

## Acceptance Scope
- projectId: \`${payload.acceptanceCertificate.projectId ?? "-"}\`
- stake: \`${payload.acceptanceCertificate.stake ?? "-"}\`
- containerId: \`${payload.acceptanceCertificate.containerId ?? "-"}\`
- executionId: \`${payload.acceptanceCertificate.executionId ?? "-"}\`
- spuId: \`${payload.acceptanceCertificate.spuId}\`

## Decision Result
- status: ${result.status}
- gateDecision: ${result.gateDecision}
- passed: ${result.passed ? "yes" : "no"}
- ruleTotal: ${result.ruleTotal}
- passedRules: ${result.passedRules}
- failedRules: ${result.failedRules}
- failedRuleIds: ${failedRuleLine}

## Norm Reference
${normLines}

## Signatures
- signatures: ${formatSignatureValue(payload.signatures)}

## Timestamps
- createdAt: ${payload.timestamps.createdAt}
- evaluatedAt: ${payload.timestamps.evaluatedAt ?? "-"}
- finalizedAt: ${payload.timestamps.finalizedAt ?? "-"}
- archivedAt: ${payload.timestamps.archivedAt ?? "-"}

## Integrity
- proofId: \`${payload.integrity.proofId ?? "-"}\`
- proofHash(${payload.integrity.hashAlgorithm}): \`${payload.integrity.proofHash}\`
- exportHash(${payload.integrity.hashAlgorithm}): \`${payload.integrity.exportHash}\`
- anchorProvider: \`${payload.integrity.anchorProvider ?? "-"}\`
- anchorRef: \`${payload.integrity.anchorRef ?? "-"}\`

## Linked LayerPeg Documents
${refs}
`;
}

function readEvidenceChain(proof: BuildProofAuditExportInput["proof"]): ProofAuditExportJson["evidenceChain"] {
  const raw = proof as Record<string, unknown>;
  return {
    proof_id: typeof raw.proof_id === "string" ? raw.proof_id : null,
    normdoc_id: typeof raw.normdoc_id === "string" ? raw.normdoc_id : null,
    bundle_hash: typeof raw.bundle_hash === "string" ? raw.bundle_hash : null,
    component_id: typeof raw.component_id === "string" ? raw.component_id : null,
    rule_id: typeof raw.rule_id === "string" ? raw.rule_id : null,
    clause_id: typeof raw.clause_id === "string" ? raw.clause_id : null,
    clause_content: typeof raw.clause_content === "string" ? raw.clause_content : null,
  };
}

export function buildProofAuditExportPackage(input: BuildProofAuditExportInput): ProofAuditExportPackage {
  const generatedAt = nowIso();
  const result = buildResultSummary(input.proof);
  const normReferences = normalizeNormReferences(input);
  const identity = resolveProofIdentity(input.proof);
  const archive = resolveArchiveInfo(input.proof);

  const integrityWithoutExportHash: Omit<ProofAcceptanceIntegrity, "exportHash"> = {
    hashAlgorithm: "sha256",
    proofId: identity.proofId,
    proofHash: identity.proofHash,
    anchorRef: identity.anchorRef,
    anchorProvider: identity.anchorProvider,
  };

  const acceptanceWithoutIntegrity = {
    certificateId: identity.proofId ?? `acceptance_${identity.proofHash.slice(0, 16)}`,
    projectId: input.executionSummary.projectId,
    stake: input.executionSummary.stake,
    containerId: input.executionSummary.containerId,
    executionId: input.executionSummary.executionId,
    spuId: input.executionSummary.spuId,
    inputData: { ...input.proof.inputSnapshot },
    decisionResult: result,
    normReferences,
    signatures: [...input.proof.signatures],
    archive,
  };

  const exportHash = sha256Json({
    schemaVersion: "proof-audit-export@v1",
    generatedAt,
    sourceKind: normalizeSourceKind(input.proof),
    executionSummary: input.executionSummary,
    matchedSpecVersion: input.proof.matchedSpecVersion,
    result,
    acceptanceCertificate: acceptanceWithoutIntegrity,
    integrity: integrityWithoutExportHash,
    signatures: input.proof.signatures,
    timestamps: input.proof.timestamps,
    linkedLayerPegDocumentRefs: input.linkedLayerPegDocumentRefs,
    evidenceChain: readEvidenceChain(input.proof),
    sourceProof: input.proof,
  });

  const integrity: ProofAcceptanceIntegrity = {
    ...integrityWithoutExportHash,
    exportHash,
  };

  const acceptanceCertificate: ProofAcceptanceCertificate = {
    ...acceptanceWithoutIntegrity,
    integrity,
  };

  const jsonExport: ProofAuditExportJson = {
    schemaVersion: "proof-audit-export@v1",
    generatedAt,
    sourceKind: normalizeSourceKind(input.proof),
    executionSummary: input.executionSummary,
    matchedSpecVersion: input.proof.matchedSpecVersion,
    result,
    acceptanceCertificate,
    integrity,
    signatures: [...input.proof.signatures],
    timestamps: { ...input.proof.timestamps },
    linkedLayerPegDocumentRefs: [...input.linkedLayerPegDocumentRefs],
    evidenceChain: readEvidenceChain(input.proof),
    sourceProof: { ...(input.proof as Record<string, unknown>) },
  };

  const markdownSummary = buildMarkdownSummary({ jsonExport });

  const pdfReadyPayload: ProofPdfReadyPayload = {
    templateId: "proof-audit-pdf@v1",
    generatedAt,
    title: `Proof Acceptance - ${input.executionSummary.executionId ?? input.executionSummary.spuId}`,
    executionSummary: input.executionSummary,
    matchedSpecVersion: input.proof.matchedSpecVersion,
    result,
    acceptanceCertificate,
    signatures: [...input.proof.signatures],
    timestamps: { ...input.proof.timestamps },
    linkedLayerPegDocumentRefs: [...input.linkedLayerPegDocumentRefs],
  };

  return {
    jsonExport,
    markdownSummary,
    pdfReadyPayload,
  };
}
