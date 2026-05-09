import assert from "node:assert/strict";
import test from "node:test";

import { aggregateContainerFinalProof, buildNodeFinalProof, buildProofFragment } from "./proof-service.ts";
import { computeFinalProofHash, readProofHash } from "./proof-chain.ts";
import type { ExecutionNode, SPUDefinition, SpaceContainer } from "../types.ts";

function buildSpu(): SPUDefinition {
  return {
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    meta: {
      name: "压实度",
      norm: "JTG F80/1-2017",
      clause: "4.2.1",
      version: "v1",
    },
    data: {
      inputs: [{ name: "compactionDegree", type: "number", label: "压实度" }],
      outputs: [{ name: "compactionDegree" }],
    },
    path: [],
    rules: [
      {
        ruleId: "R1",
        field: "compactionDegree",
        operator: ">=",
        threshold: 95,
        message: "压实度需>=95",
      },
    ],
    proof: {
      resultField: "compactionDegree",
      requiredSignatures: ["lab", "supervision"],
      schemaVersion: "proof.final@v1",
    },
  };
}

function buildFinalPassNode(overrides: Partial<ExecutionNode> = {}): ExecutionNode {
  const base: ExecutionNode = {
    nodeId: "node_1",
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    containerRef: "container_1",
    vuri: "v://project-proof/node/container_1/node_1",
    attemptIndex: 1,
    status: "FINAL_PASS",
    inputs: { compactionDegree: 96.2 },
    outputs: { compactionDegree: 96.2 },
    trace: [],
    gate: {
      passed: true,
      results: [
        {
          ruleId: "R1",
          field: "compactionDegree",
          operator: ">=",
          threshold: 95,
          actual: 96.2,
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
  return { ...base, ...overrides };
}

function buildContainer(): SpaceContainer {
  return {
    containerId: "container_1",
    projectId: "project-proof",
    vAddress: "v://space/container/container_1",
    vuri: "v://project-proof/container/container_1",
    geoSlotRef: "v://space/slot/K19+070",
    lifecycleState: "VERIFIED",
    locked: false,
    runtime: {
      currentSpuId: null,
      currentNodeId: null,
      phase: "completed",
    },
    tripBinding: {
      inspector: "lab_user",
      supervisor: "supervisor_user",
    },
    specBindings: [
      {
        spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
        status: "PASS",
        latestNodeId: "node_1",
        historyNodeIds: ["node_1"],
      },
    ],
    overallStatus: "PASS",
  };
}

test("buildProofFragment outputs unified fragment fields", () => {
  const fragment = buildProofFragment({
    executionId: "exec_1",
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    nodeId: "node_1",
    containerId: "container_1",
    inputSnapshot: { compactionDegree: 94.2 },
    resultSnapshot: { gatePassed: false },
    matchedSpecVersion: "v1",
    matchedRules: [],
    status: "BLOCK",
    requiredSignatures: ["lab", "supervision"],
    operatorId: "did:peg:ins_001",
    executorVersion: "executor@audit-test",
  });

  assert.equal(fragment.kind, "proofFragment");
  assert.equal(fragment.archiveStatus, "NOT_ARCHIVED");
  assert.equal(fragment.status, "BLOCK");
  assert.equal(fragment.signatures.length, 2);
  assert.deepEqual(fragment.inputs, { compactionDegree: 94.2 });
  assert.equal(fragment.executor_version, "executor@audit-test");
  assert.equal(fragment.operator_id, "did:peg:ins_001");
});

test("buildNodeFinalProof outputs unified final proof for node", () => {
  const proof = buildNodeFinalProof({
    node: buildFinalPassNode(),
    spu: buildSpu(),
  });

  assert.equal(proof.kind, "finalProof");
  assert.equal(proof.status, "PASS");
  assert.equal(proof.archiveStatus, "NOT_ARCHIVED");
  assert.equal(proof.executionId, "node_1");
  assert.equal(proof.resultField, "compactionDegree");
  assert.ok(proof.proofId);
  assert.ok(proof.hash);
  assert.equal(proof.hash, computeFinalProofHash(proof));
  assert.equal(readProofHash(proof), proof.hash);
  assert.equal(proof.proofHash, proof.hash);
  assert.ok(proof.vuri?.startsWith("v://project-proof/proof/"));
  assert.deepEqual(proof.inputs, { compactionDegree: 96.2 });
  assert.equal(proof.executor_version, "executor@v1");
  assert.equal(proof.operator_id, "lab");
});

test("aggregateContainerFinalProof builds container-level final proof", () => {
  const node = buildFinalPassNode();
  const nodeProof = buildNodeFinalProof({ node, spu: buildSpu() });
  const nodeWithProof: ExecutionNode = {
    ...node,
    proof: nodeProof,
  };
  const proof = aggregateContainerFinalProof({
    container: buildContainer(),
    latestNodesBySpu: [nodeWithProof],
    attemptsBySpu: {
      "highway.subgrade.compaction.4.2.1.soil@v1": [nodeWithProof],
    },
    auditTrail: [],
  });

  assert.equal(proof.kind, "finalProof");
  assert.equal(proof.archiveStatus, "ARCHIVED");
  assert.equal(proof.status, "PASS");
  assert.equal(proof.specResults.length, 1);
  assert.ok(proof.proofId);
  assert.ok(proof.hash);
  assert.ok(proof.vuri?.startsWith("v://project-proof/proof/"));
  assert.deepEqual(proof.inputs, {
    nodeCount: 1,
    geoSlotRef: "v://space/slot/K19+070",
  });
  assert.equal(proof.executor_version, "executor@v1");
  assert.equal(proof.operator_id, "lab_user");
});

test("proof fragment and final proof share unified core fields", () => {
  const fragment = buildProofFragment({
    executionId: "exec_2",
    spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
    nodeId: "node_2",
    containerId: "container_1",
    inputSnapshot: { compactionDegree: 95.1 },
    resultSnapshot: { gatePassed: true },
    matchedSpecVersion: "v1",
    matchedRules: [],
    status: "PASS",
    requiredSignatures: ["lab"],
  });
  const node = buildFinalPassNode({ nodeId: "node_2" });
  const nodeProof = buildNodeFinalProof({ node, spu: buildSpu() });

  const requiredCoreKeys = [
    "executionId",
    "spuId",
    "nodeId",
    "containerId",
    "inputSnapshot",
    "resultSnapshot",
    "matchedSpecVersion",
    "matchedRules",
    "status",
    "signatures",
    "timestamps",
    "archiveStatus",
  ] as const;

  for (const key of requiredCoreKeys) {
    assert.ok(key in fragment);
    assert.ok(key in nodeProof);
  }
  assert.equal(fragment.kind, "proofFragment");
  assert.equal(nodeProof.kind, "finalProof");
});

test("aggregateContainerFinalProof rejects when any latest node is not FINAL_PASS", () => {
  const failedNode = buildFinalPassNode({
    nodeId: "node_failed",
    status: "FINAL_FAIL",
    gate: {
      passed: false,
      results: [
        {
          ruleId: "R1",
          field: "compactionDegree",
          operator: ">=",
          threshold: 95,
          actual: 90,
          passed: false,
          message: "FAIL",
        },
      ],
    },
  });
  assert.throws(
    () =>
      aggregateContainerFinalProof({
        container: buildContainer(),
        latestNodesBySpu: [failedNode],
        attemptsBySpu: {
          "highway.subgrade.compaction.4.2.1.soil@v1": [failedNode],
        },
        auditTrail: [],
      }),
    /requires all latest nodes FINAL_PASS/,
  );
});
