import assert from "node:assert/strict";
import test from "node:test";

import { IpfsHttpAnchorProvider, type IpfsAnchorTransport } from "../proof/anchor-service.ts";
import type { ContainerProof, NodeProof, SPUDefinition } from "../types.ts";
import { PlatformService } from "./platform-service.ts";

function buildAnchorDemoSpu(spuId: string): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Anchor Demo SPU",
      norm: "ANCHOR-NORM",
      clause: "A-1",
      version: "v1",
      category: "anchor",
      measuredItem: "demo",
    },
    data: {
      inputs: [
        { name: "value", type: "number", label: "Value" },
        { name: "threshold", type: "number", label: "Threshold" },
      ],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [
      {
        ruleId: "RULE-ANCHOR-1",
        field: "result",
        operator: ">=",
        threshold: { inputRef: "threshold" },
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

function createContainerWithSingleSpu(service: PlatformService, spuId: string, station: string): string {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 88.8,
    y: 66.6,
    elevation: 10.1,
    alignment: "A-ANCHOR",
    sourceFile: "anchor-provider-test.csv",
  });
  return service.createContainer({
    geoSlotRef: slot.slotId,
    autoBindSpuIds: [spuId],
  }).containerId;
}

function readAnchorReceipt(
  proof: NodeProof | ContainerProof | undefined,
): { anchorRef: string | null; providerName: string | null; status: string | null } | null {
  if (!proof?.extensions || typeof proof.extensions !== "object") {
    return null;
  }
  const raw = (proof.extensions as Record<string, unknown>).anchorReceipt;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  return {
    anchorRef:
      typeof entry.anchorRef === "string"
        ? entry.anchorRef
        : typeof entry.anchorId === "string"
          ? entry.anchorId
          : null,
    providerName: typeof entry.providerName === "string" ? entry.providerName : null,
    status: typeof entry.status === "string" ? entry.status : null,
  };
}

function executePassAndFinalize(
  service: PlatformService,
  containerId: string,
  spuId: string,
  finalizeOptions?: Parameters<PlatformService["finalizeNode"]>[1],
) {
  const node = service.createNode({
    containerId,
    spuId,
  });
  service.submitNode(node.nodeId, {
    value: 96,
    threshold: 90,
  });
  return service.finalizeNode(node.nodeId, finalizeOptions);
}

test("anchor provider: finalizeNode keeps main flow unchanged when anchor step is disabled", () => {
  const service = new PlatformService();
  const spuId = "demo.anchor.flow.disabled@v1";
  service.publishSpuVersion(buildAnchorDemoSpu(spuId));
  const containerId = createContainerWithSingleSpu(service, spuId, "K40+001");

  const finalized = executePassAndFinalize(service, containerId, spuId);
  assert.equal(finalized.status, "FINAL_PASS");
  assert.equal(readAnchorReceipt(finalized.proof), null);
});

test("anchor provider: finalizeNode can optionally anchor proof and verify anchorRef", () => {
  const service = new PlatformService();
  const spuId = "demo.anchor.flow.enabled@v1";
  service.publishSpuVersion(buildAnchorDemoSpu(spuId));
  const containerId = createContainerWithSingleSpu(service, spuId, "K40+002");

  const finalized = executePassAndFinalize(service, containerId, spuId, {
    anchor: { enabled: true },
  });
  const receipt = readAnchorReceipt(finalized.proof);
  assert.ok(receipt);
  assert.equal(receipt?.providerName, "mock_anchor_provider");
  assert.equal(receipt?.status, "ANCHORED");
  assert.ok(receipt?.anchorRef);

  const verifyResult = service.verifyAnchor(String(receipt?.anchorRef));
  assert.equal(verifyResult.status, "ANCHORED");

  const statuses = service.listAnchorProviderStatuses();
  assert.equal(statuses.length >= 1, true);
  assert.equal(statuses[0]?.providerName, "mock_anchor_provider");
  assert.equal((statuses[0]?.submittedCount ?? 0) >= 1, true);
});

test("anchor provider: archiveContainer can optionally anchor aggregated proof", () => {
  const service = new PlatformService();
  const spuId = "demo.anchor.archive@v1";
  service.publishSpuVersion(buildAnchorDemoSpu(spuId));
  const containerId = createContainerWithSingleSpu(service, spuId, "K40+003");

  executePassAndFinalize(service, containerId, spuId);
  const archived = service.archiveContainer(containerId, {
    anchor: { enabled: true, providerName: "mock_anchor_provider" },
  });
  assert.equal(archived.status, "PASS");
  const receipt = readAnchorReceipt(archived);
  assert.ok(receipt);
  assert.equal(receipt?.status, "ANCHORED");

  const stored = service.getProof(containerId);
  assert.ok(stored);
  assert.equal(readAnchorReceipt(stored ?? undefined)?.status, "ANCHORED");
});

class FakeIpfsTransport implements IpfsAnchorTransport {
  private readonly found = new Set<string>();

  addJson(params: {
    apiBaseUrl: string;
    payload: string;
    authToken?: string | null;
    pin?: boolean;
  }): { cid: string; size?: string; raw?: unknown } {
    const cid = `bafyanchor${params.payload.length}`;
    this.found.add(cid);
    return {
      cid,
      size: String(params.payload.length),
      raw: { ok: true },
    };
  }

  statCid(params: {
    apiBaseUrl: string;
    cid: string;
    authToken?: string | null;
  }): { found: boolean; raw?: unknown } {
    return {
      found: this.found.has(params.cid),
      raw: { ok: this.found.has(params.cid) },
    };
  }
}

test("anchor provider: ipfs provider can anchor proof and keep flow unchanged", () => {
  const service = new PlatformService({
    anchorProviders: [
      new IpfsHttpAnchorProvider({
        providerName: "ipfs_test_provider",
        transport: new FakeIpfsTransport(),
      }),
    ],
  });
  const spuId = "demo.anchor.ipfs@v1";
  service.publishSpuVersion(buildAnchorDemoSpu(spuId));
  const containerId = createContainerWithSingleSpu(service, spuId, "K40+004");

  const finalized = executePassAndFinalize(service, containerId, spuId, {
    anchor: { enabled: true, providerName: "ipfs_test_provider" },
  });
  assert.equal(finalized.status, "FINAL_PASS");
  const receipt = readAnchorReceipt(finalized.proof);
  assert.ok(receipt?.anchorRef?.startsWith("ipfs://bafyanchor"));

  const verifyResult = service.verifyAnchor(String(receipt?.anchorRef), "ipfs_test_provider");
  assert.equal(verifyResult.status, "ANCHORED");
  assert.equal(verifyResult.hash, finalized.proof?.hash ?? null);
});
