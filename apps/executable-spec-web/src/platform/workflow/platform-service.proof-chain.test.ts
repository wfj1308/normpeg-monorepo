import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutionNode, SPUDefinition } from "../types.ts";
import { PlatformService } from "./platform-service.ts";

function buildProofChainSpu(spuId: string, threshold: number): SPUDefinition {
  return {
    spuId,
    meta: {
      name: `Proof Chain ${spuId}`,
      norm: "CHAIN-NORM",
      clause: "C-1",
      version: "v1",
      category: "chain",
      measuredItem: "value",
    },
    data: {
      inputs: [
        { name: "value", type: "number", label: "Value" },
      ],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-CHAIN-1",
        field: "result",
        operator: ">=",
        threshold,
        message: "result should pass threshold",
      },
    ],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

function createContainer(service: PlatformService, spuIds: string[], station: string): string {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 120,
    y: 35,
    elevation: 12.5,
    alignment: "A-CHAIN",
    sourceFile: "proof-chain-test.csv",
  });
  return service.createContainer({
    geoSlotRef: slot.slotId,
    autoBindSpuIds: spuIds,
  }).containerId;
}

test("proof chain: node and container proofs should form verifiable chain", () => {
  const service = new PlatformService();
  const spuA = "demo.chain.step_a@v1";
  const spuB = "demo.chain.step_b@v1";
  service.publishSpuVersion(buildProofChainSpu(spuA, 80));
  service.publishSpuVersion(buildProofChainSpu(spuB, 90));
  const containerId = createContainer(service, [spuA, spuB], "K50+001");

  const nodeA = service.createNode({ containerId, spuId: spuA });
  service.submitNode(nodeA.nodeId, { value: 95 });
  const finalizedA = service.finalizeNode(nodeA.nodeId);
  assert.equal(finalizedA.status, "FINAL_PASS");
  assert.ok(finalizedA.proof?.proofChain);
  assert.equal(finalizedA.proof?.proofChain?.previousProofId, null);

  const nodeB = service.createNode({ containerId, spuId: spuB });
  service.submitNode(nodeB.nodeId, { value: 96 });
  const finalizedB = service.finalizeNode(nodeB.nodeId);
  assert.equal(finalizedB.status, "FINAL_PASS");
  assert.equal(finalizedB.proof?.proofChain?.previousProofId, finalizedA.proof?.proofId ?? null);

  const archived = service.archiveContainer(containerId);
  assert.equal(archived.status, "PASS");
  assert.equal(archived.proofChain?.previousProofId, finalizedB.proof?.proofId ?? null);
  assert.equal((archived.proofChain?.dependencies.length ?? 0) >= 2, true);

  const nodeVerify = service.verifyProof({ nodeId: nodeB.nodeId });
  assert.equal(nodeVerify.verified, true);
  assert.equal(nodeVerify.hashMatched, true);
  assert.equal(nodeVerify.chainVerified, true);

  const containerVerify = service.verifyProof({ containerId });
  assert.equal(containerVerify.verified, true);
  assert.equal(containerVerify.hashMatched, true);
  assert.equal(containerVerify.chainVerified, true);
  assert.equal(containerVerify.lineage.length >= 3, true);
});

test("proof chain: verify should detect tampered proof payload", () => {
  const service = new PlatformService();
  const spuId = "demo.chain.tamper@v1";
  service.publishSpuVersion(buildProofChainSpu(spuId, 90));
  const containerId = createContainer(service, [spuId], "K50+002");

  const node = service.createNode({ containerId, spuId });
  service.submitNode(node.nodeId, { value: 96 });
  service.finalizeNode(node.nodeId);

  const mutableService = service as unknown as {
    state: {
      nodes: Record<string, ExecutionNode>;
    };
  };
  const stored = mutableService.state.nodes[node.nodeId];
  assert.ok(stored?.proof);
  stored.proof = {
    ...stored.proof!,
    resultSnapshot: {
      ...stored.proof!.resultSnapshot,
      tampered: true,
    },
  };

  const verified = service.verifyProof({ nodeId: node.nodeId });
  assert.equal(verified.verified, false);
  assert.equal(verified.hashMatched, false);
  assert.equal(verified.issues.includes("proof hash mismatch"), true);
});

