import { sha256Json } from "./hash.ts";
import type { FinalProof, ProofAnchorReference, ProofChainDependencyRef, ProofChainLink } from "../types.ts";

interface FinalProofHashPayload {
  kind: FinalProof["kind"];
  executionId: FinalProof["executionId"];
  spuId: FinalProof["spuId"];
  nodeId: FinalProof["nodeId"];
  containerId: FinalProof["containerId"];
  inputSnapshot: FinalProof["inputSnapshot"];
  resultSnapshot: FinalProof["resultSnapshot"];
  matchedSpecVersion: FinalProof["matchedSpecVersion"];
  matchedRules: FinalProof["matchedRules"];
  status: FinalProof["status"];
  signatures: FinalProof["signatures"];
  timestamps: FinalProof["timestamps"];
  archiveStatus: FinalProof["archiveStatus"];
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeProofChainDependencyRef(value: unknown): ProofChainDependencyRef | null {
  const record = readObject(value);
  if (!record) {
    return null;
  }
  if (typeof record.proofId !== "string" || !record.proofId.trim()) {
    return null;
  }
  if (typeof record.proofHash !== "string" || !record.proofHash.trim()) {
    return null;
  }
  const source = String(record.source ?? "").trim().toLowerCase();
  if (source !== "node" && source !== "container") {
    return null;
  }
  const timestamp = typeof record.timestamp === "string" && record.timestamp.trim()
    ? record.timestamp.trim()
    : new Date().toISOString();
  return {
    proofId: record.proofId.trim(),
    proofHash: record.proofHash.trim(),
    source,
    nodeId: typeof record.nodeId === "string" && record.nodeId.trim() ? record.nodeId.trim() : null,
    containerId: typeof record.containerId === "string" && record.containerId.trim() ? record.containerId.trim() : null,
    timestamp,
  };
}

function normalizeProofChainLink(value: unknown): ProofChainLink | null {
  const record = readObject(value);
  if (!record) {
    return null;
  }
  if (typeof record.chainId !== "string" || !record.chainId.trim()) {
    return null;
  }
  const rawIndex = Number(record.index);
  const index = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : 0;
  const previousProofId = typeof record.previousProofId === "string" && record.previousProofId.trim()
    ? record.previousProofId.trim()
    : null;
  const previousProofHash = typeof record.previousProofHash === "string" && record.previousProofHash.trim()
    ? record.previousProofHash.trim()
    : null;
  const linkedAt = typeof record.linkedAt === "string" && record.linkedAt.trim()
    ? record.linkedAt.trim()
    : new Date().toISOString();
  const dependencies = Array.isArray(record.dependencies)
    ? record.dependencies
      .map((item) => normalizeProofChainDependencyRef(item))
      .filter((item): item is ProofChainDependencyRef => Boolean(item))
    : [];

  return {
    chainId: record.chainId.trim(),
    index,
    previousProofId,
    previousProofHash,
    linkedAt,
    dependencies,
  };
}

function normalizeProofAnchorReference(value: unknown): ProofAnchorReference | null {
  const record = readObject(value);
  if (!record) {
    return null;
  }
  const anchorRef = typeof record.anchorRef === "string" && record.anchorRef.trim()
    ? record.anchorRef.trim()
    : typeof record.anchorId === "string" && record.anchorId.trim()
      ? record.anchorId.trim()
      : "";
  if (!anchorRef) {
    return null;
  }
  const providerName = typeof record.providerName === "string" && record.providerName.trim()
    ? record.providerName.trim()
    : "unknown";
  const statusValue = String(record.status ?? "").trim().toUpperCase();
  const status: ProofAnchorReference["status"] =
    statusValue === "NOT_FOUND"
      ? "NOT_FOUND"
      : statusValue === "MISMATCH"
        ? "MISMATCH"
        : "ANCHORED";
  return {
    providerName,
    anchorRef,
    hash: typeof record.hash === "string" && record.hash.trim() ? record.hash.trim() : null,
    anchoredAt: typeof record.anchoredAt === "string" && record.anchoredAt.trim() ? record.anchoredAt.trim() : null,
    status,
  };
}

export function buildFinalProofHashPayload(proof: FinalProof): FinalProofHashPayload {
  return {
    kind: proof.kind,
    executionId: proof.executionId,
    spuId: proof.spuId,
    nodeId: proof.nodeId,
    containerId: proof.containerId,
    inputSnapshot: proof.inputSnapshot,
    resultSnapshot: proof.resultSnapshot,
    matchedSpecVersion: proof.matchedSpecVersion,
    matchedRules: proof.matchedRules,
    status: proof.status,
    signatures: proof.signatures,
    timestamps: proof.timestamps,
    archiveStatus: proof.archiveStatus,
  };
}

export function computeFinalProofHash(proof: FinalProof): string {
  return sha256Json(buildFinalProofHashPayload(proof));
}

export function readProofHash(proof: FinalProof): string | null {
  if (typeof proof.hash === "string" && proof.hash.trim()) {
    return proof.hash.trim();
  }
  if (typeof proof.proofHash === "string" && proof.proofHash.trim()) {
    return proof.proofHash.trim();
  }
  const extensions = readObject(proof.extensions);
  if (!extensions) {
    return null;
  }
  const extensionHash =
    (typeof extensions.proof_hash === "string" && extensions.proof_hash.trim())
      ? extensions.proof_hash.trim()
      : (typeof extensions.payload_hash === "string" && extensions.payload_hash.trim())
        ? extensions.payload_hash.trim()
        : null;
  return extensionHash;
}

export function readProofChainLink(proof: FinalProof): ProofChainLink | null {
  const fromProof = normalizeProofChainLink(proof.proofChain);
  if (fromProof) {
    return fromProof;
  }
  const extensions = readObject(proof.extensions);
  if (!extensions) {
    return null;
  }
  return normalizeProofChainLink(extensions.proofChain ?? extensions.proof_chain);
}

export function readProofAnchorReference(proof: FinalProof): ProofAnchorReference | null {
  const fromProof = normalizeProofAnchorReference(proof.anchorReference);
  if (fromProof) {
    return fromProof;
  }
  const extensions = readObject(proof.extensions);
  if (!extensions) {
    return null;
  }
  return normalizeProofAnchorReference(extensions.anchorReference ?? extensions.anchorReceipt);
}

