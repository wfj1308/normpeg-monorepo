import assert from "node:assert/strict";
import test from "node:test";

import type { ContainerProof, ExecutionNode, SPUDefinition } from "../platform/types.ts";
import {
  buildLayerPegDocumentIndex,
  layerPegFromContainerProof,
  layerPegFromNodeExecution,
  layerPegFromSpu,
  toLayerPegStandardOutput,
} from "./transformer.ts";

function buildSpu(): SPUDefinition {
  return {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    meta: {
      name: "subgrade compaction",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version: "v1",
    },
    data: {
      inputs: [{ name: "dryDensity", type: "number", label: "dryDensity" }],
      outputs: [{ name: "compactionDegree" }],
    },
    path: [{ step: "step_1", formula: "compactionDegree = (dryDensity / maxDryDensity) * 100" }],
    rules: [{ field: "compactionDegree", operator: ">=", value: 93, message: "pass rule" }],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab", "supervision"],
    },
  };
}

function buildNode(): ExecutionNode {
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
    signedBy: ["lab"],
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
        timestamp: archivedAt,
      },
    ],
    hash: "abc123",
    archivedAt,
    schemaVersion: "proof.final@v1",
  };
}

test("layerPeg transformer should convert spu/node/proof to five-layer docs", () => {
  const specDoc = layerPegFromSpu(buildSpu());
  const nodeDoc = layerPegFromNodeExecution(buildNode());
  const proofDoc = layerPegFromContainerProof(buildContainerProof());

  assert.equal(specDoc.header.docType, "spec");
  assert.equal(nodeDoc.header.docType, "execution");
  assert.equal(proofDoc.header.docType, "proof");
  assert.ok(specDoc.header.usi.startsWith("v://spec/"));
  assert.ok(nodeDoc.header.usi.startsWith("v://execution/"));
  assert.ok(proofDoc.header.usi.startsWith("v://proof/container/"));
});

test("layerPeg transformer should build stable document index list", () => {
  const specDoc = layerPegFromSpu(buildSpu());
  const nodeDoc = layerPegFromNodeExecution(buildNode());

  const index = buildLayerPegDocumentIndex([
    {
      usi: specDoc.header.usi,
      docType: specDoc.header.docType,
      sourceRef: "spec:highway.subgrade.compaction.4.2.1.soil@v1",
      updatedAt: "2026-04-23T09:00:00.000Z",
      document: specDoc,
    },
    {
      usi: nodeDoc.header.usi,
      docType: nodeDoc.header.docType,
      sourceRef: "node:node_1",
      updatedAt: "2026-04-23T09:00:01.000Z",
      document: nodeDoc,
    },
  ]);

  assert.equal(index.length, 2);
  assert.equal(index[0]?.version, specDoc.header.version);
  assert.equal(index[1]?.decision, nodeDoc.gate.decision);
  assert.equal(index[1]?.stateCurrent, nodeDoc.state.current);
  assert.equal(index[1]?.payloadType, nodeDoc.body.payloadType);
});

test("layerPeg transformer should wrap standard output envelope", () => {
  const doc = layerPegFromSpu(buildSpu());
  const output = toLayerPegStandardOutput(doc);

  assert.equal(output.format, "LayerPegDocument");
  assert.equal(output.schemaId, "layerpeg-document.schema.json");
  assert.equal(output.document.header.usi, doc.header.usi);
});
