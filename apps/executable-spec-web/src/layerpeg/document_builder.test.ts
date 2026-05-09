import assert from "node:assert/strict";
import test from "node:test";

import type { ContainerProof, ExecutionNode, SPUDefinition } from "../platform/types.ts";
import {
  buildLayerPegDocumentFromContainerProof,
  buildLayerPegDocumentFromExecutionNode,
  buildLayerPegDocumentFromSpu,
} from "./document_builder.ts";

function buildSpu(): SPUDefinition {
  return {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    meta: {
      name: "路基压实度",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version: "v1",
      category: "subgrade",
      measuredItem: "compaction",
    },
    forms: [{ formCode: "FORM_A", role: "lab", required: true }],
    data: {
      inputs: [{ name: "dryDensity", type: "number", unit: "g/cm3", label: "干密度" }],
      outputs: [{ name: "compactionDegree", label: "压实度", unit: "%" }],
    },
    path: [{ step: "step_1", formula: "compactionDegree = (dryDensity / maxDryDensity) * 100" }],
    rules: [{ field: "compactionDegree", operator: ">=", value: 93, message: "压实度不得低于 93%" }],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab", "supervision"],
    },
    sourceType: "compiled",
  };
}

function buildExecutionNode(): ExecutionNode {
  return {
    nodeId: "node_1",
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    containerRef: "container_1",
    attemptIndex: 1,
    status: "FINAL_PASS",
    inputs: { dryDensity: 1.86, maxDryDensity: 1.95 },
    outputs: { compactionDegree: 95.38 },
    trace: [
      {
        step: "step_1",
        formula: "compactionDegree = (dryDensity / maxDryDensity) * 100",
        context: { dryDensity: 1.86, maxDryDensity: 1.95 },
        result: 95.38,
      },
    ],
    gate: {
      passed: true,
      results: [
        {
          ruleId: "RULE-001",
          field: "compactionDegree",
          operator: ">=",
          threshold: 93,
          actual: 95.38,
          passed: true,
          message: "PASS",
        },
      ],
    },
    requiredSignatures: ["lab", "supervision"],
    signedBy: ["lab", "supervision"],
    createdAt: "2026-04-23T08:00:00.000Z",
    updatedAt: "2026-04-23T08:10:00.000Z",
  };
}

function buildContainerProof(): ContainerProof {
  const archivedAt = "2026-04-23T08:20:00.000Z";
  return {
    kind: "finalProof",
    proofId: "proof_abc123",
    executionId: "archive_container_1_001",
    spuId: "container:aggregate",
    nodeId: null,
    containerId: "container_1",
    inputSnapshot: { nodeCount: 1 },
    resultSnapshot: { overallStatus: "PASS", passedNodeCount: 1, failedNodeCount: 0 },
    matchedSpecVersion: "aggregate@v1",
    matchedRules: [],
    status: "PASS",
    signatures: [
      {
        role: "did:person:lab-001",
        signer: "did:person:lab-001",
        status: "SIGNED",
        signedAt: archivedAt,
      },
    ],
    timestamps: {
      createdAt: archivedAt,
      evaluatedAt: archivedAt,
      finalizedAt: archivedAt,
      archivedAt,
    },
    archiveStatus: "ARCHIVED",
    geoSlotRef: "v://space/slot/K19+070",
    overallStatus: "PASS",
    specResults: [
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        status: "PASS",
        finalNodeId: "node_1",
        attempts: 1,
      },
    ],
    legacySignatures: ["did:person:lab-001"],
    auditTrail: [
      {
        eventId: "ev_1",
        entityType: "container",
        entityId: "container_1",
        eventType: "CONTAINER_ARCHIVED",
        payload: {},
        timestamp: "2026-04-23T08:20:00.000Z",
      },
    ],
    hash: "abc123",
    archivedAt,
    schemaVersion: "proof.final@v1",
  };
}

test("buildLayerPegDocumentFromSpu should output five-layer spec doc", () => {
  const doc = buildLayerPegDocumentFromSpu(buildSpu(), { ownerDid: "did:person:owner-001" });

  assert.equal(doc.header.docType, "spec");
  assert.equal(doc.header.ownerDid, "did:person:owner-001");
  assert.equal(doc.gate.decision, "pending");
  assert.equal(doc.body.payloadType, "spu_definition");
  assert.equal(doc.proof.signatures.length, 2);
  assert.equal(doc.state.current, "DRAFT");
});

test("buildLayerPegDocumentFromExecutionNode should output execution doc", () => {
  const doc = buildLayerPegDocumentFromExecutionNode(buildExecutionNode(), {
    ownerDid: "did:person:lab-001",
    projectRef: "v://project/P1",
  });

  assert.equal(doc.header.docType, "execution");
  assert.equal(doc.gate.decision, "pass");
  assert.equal(doc.gate.evaluation.passed, 1);
  assert.equal(doc.body.payloadType, "execution_node");
  assert.equal(doc.state.current, "QUALIFIED");
});

test("buildLayerPegDocumentFromContainerProof should output proof doc", () => {
  const doc = buildLayerPegDocumentFromContainerProof(buildContainerProof(), {
    ownerDid: "did:person:qa-admin",
  });

  assert.equal(doc.header.docType, "proof");
  assert.equal(doc.gate.decision, "pass");
  assert.equal(doc.body.payloadType, "container_proof");
  assert.equal(doc.proof.proofHash, "abc123");
  assert.equal(doc.state.current, "QUALIFIED");
});
