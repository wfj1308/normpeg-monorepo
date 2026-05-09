import assert from "node:assert/strict";
import test from "node:test";

import type { ContainerProof, ProofFragment } from "../../src/platform/types.ts";
import { buildProofAuditExportPackage } from "./proof_export_service.ts";

function buildSampleFragment(): ProofFragment {
  return {
    kind: "proofFragment",
    executionId: "node-1",
    spuId: "demo.spu@v1",
    nodeId: "node-1",
    containerId: "container-1",
    inputSnapshot: { value: 95 },
    resultSnapshot: { outputs: { result: 95 } },
    matchedSpecVersion: "v1",
    matchedRules: [
      {
        ruleId: "RULE-1",
        condition: "result >= 90",
        passed: true,
        severity: "info",
        message: "pass",
      },
    ],
    status: "PASS",
    signatures: [
      {
        role: "lab",
        status: "PENDING",
        signer: null,
        signature: null,
        signedAt: null,
      },
    ],
    timestamps: {
      createdAt: "2026-04-24T00:00:00.000Z",
      evaluatedAt: "2026-04-24T00:00:01.000Z",
      finalizedAt: null,
      archivedAt: null,
    },
    archiveStatus: "NOT_ARCHIVED",
  };
}

function buildSampleContainerProof(): ContainerProof {
  return {
    kind: "finalProof",
    proofId: "proof_123",
    executionId: "archive_container-1",
    spuId: "container:aggregate",
    nodeId: null,
    containerId: "container-1",
    inputSnapshot: { nodeCount: 1 },
    resultSnapshot: { overallStatus: "PASS" },
    matchedSpecVersion: "aggregate@v1",
    matchedRules: [
      {
        ruleId: "demo.spu@v1",
        passed: true,
      },
    ],
    status: "PASS",
    signatures: [
      {
        role: "supervisor",
        status: "SIGNED",
        signer: "supervisor-a",
        signature: null,
        signedAt: "2026-04-24T00:10:00.000Z",
      },
    ],
    timestamps: {
      createdAt: "2026-04-24T00:10:00.000Z",
      evaluatedAt: "2026-04-24T00:10:00.000Z",
      finalizedAt: "2026-04-24T00:10:00.000Z",
      archivedAt: "2026-04-24T00:10:00.000Z",
    },
    archiveStatus: "ARCHIVED",
    geoSlotRef: "v://space/slot/K30+010",
    overallStatus: "PASS",
    specResults: [
      {
        spuId: "demo.spu@v1",
        status: "PASS",
        finalNodeId: "node-1",
        attempts: 1,
      },
    ],
    auditTrail: [],
    archivedAt: "2026-04-24T00:10:00.000Z",
    schemaVersion: "proof.final@v1",
    hash: "hash-123",
  };
}

test("proof export: should build audit package for proof fragment", () => {
  const result = buildProofAuditExportPackage({
    proof: buildSampleFragment(),
    executionSummary: {
      executionId: "node-1",
      nodeId: "node-1",
      containerId: "container-1",
      spuId: "demo.spu@v1",
      projectId: "project-alpha",
      stake: "K30+010",
      summaryText: "Node node-1 for demo.spu@v1 is PASS",
    },
    linkedLayerPegDocumentRefs: [
      {
        role: "execution",
        usi: "usi-node-1",
        docType: "execution",
        sourceRef: "node:node-1",
        documentApiPath: "/api/layerpeg/documents/usi-node-1",
      },
    ],
  });

  assert.equal(result.jsonExport.schemaVersion, "proof-audit-export@v1");
  assert.equal(result.jsonExport.executionSummary.executionId, "node-1");
  assert.equal(result.jsonExport.matchedSpecVersion, "v1");
  assert.equal(result.jsonExport.result.status, "PASS");
  assert.equal(result.jsonExport.acceptanceCertificate.projectId, "project-alpha");
  assert.equal(result.jsonExport.acceptanceCertificate.stake, "K30+010");
  assert.equal(result.jsonExport.acceptanceCertificate.inputData.value, 95);
  assert.equal(result.jsonExport.acceptanceCertificate.normReferences[0]?.spuId, "demo.spu@v1");
  assert.equal(result.jsonExport.integrity.hashAlgorithm, "sha256");
  assert.equal(result.jsonExport.integrity.proofId, null);
  assert.equal(result.jsonExport.integrity.exportHash.length, 64);
  assert.equal(result.jsonExport.signatures.length, 1);
  assert.equal(result.jsonExport.timestamps.createdAt, "2026-04-24T00:00:00.000Z");
  assert.equal(result.jsonExport.linkedLayerPegDocumentRefs.length, 1);
  assert.equal(result.pdfReadyPayload.templateId, "proof-audit-pdf@v1");
  assert.equal(result.pdfReadyPayload.acceptanceCertificate.spuId, "demo.spu@v1");
  assert.equal(result.markdownSummary.includes("## Acceptance Scope"), true);
  assert.equal(result.markdownSummary.includes("## Integrity"), true);
});

test("proof export: should build audit package for container final proof", () => {
  const result = buildProofAuditExportPackage({
    proof: buildSampleContainerProof(),
    executionSummary: {
      executionId: "archive_container-1",
      nodeId: null,
      containerId: "container-1",
      spuId: "container:aggregate",
      projectId: "project-alpha",
      stake: "K30+010",
      summaryText: "Container container-1 archived with status PASS",
    },
    linkedLayerPegDocumentRefs: [
      {
        role: "proof",
        usi: "usi-proof-1",
        docType: "proof",
        sourceRef: "container_proof:container-1",
        documentApiPath: "/api/layerpeg/documents/usi-proof-1",
      },
    ],
  });

  assert.equal(result.jsonExport.sourceKind, "containerFinalProof");
  assert.equal(result.jsonExport.result.failedRules, 0);
  assert.equal(result.jsonExport.acceptanceCertificate.archive.archived, true);
  assert.equal(result.jsonExport.acceptanceCertificate.archive.archivedAt, "2026-04-24T00:10:00.000Z");
  assert.equal(result.jsonExport.acceptanceCertificate.normReferences[0]?.spuId, "container:aggregate");
  assert.equal(result.jsonExport.integrity.proofId, "proof_123");
  assert.equal(result.jsonExport.integrity.proofHash, "hash-123");
  assert.equal(result.jsonExport.signatures[0]?.status, "SIGNED");
  assert.equal(result.pdfReadyPayload.executionSummary.containerId, "container-1");
  assert.equal(result.markdownSummary.includes("## Linked LayerPeg Documents"), true);
});
