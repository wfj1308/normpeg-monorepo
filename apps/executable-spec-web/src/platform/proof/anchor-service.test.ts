import assert from "node:assert/strict";
import test from "node:test";

import { IpfsHttpAnchorProvider, type IpfsAnchorTransport, MockAnchorProvider } from "./anchor-service.ts";

test("MockAnchorProvider: submit/verify/status should be traceable", () => {
  const provider = new MockAnchorProvider("mock_test_provider");
  const submitted = provider.submit({
    proofId: "proof_demo_001",
    hash: "hash_demo_001",
  });

  assert.equal(submitted.providerName, "mock_test_provider");
  assert.equal(submitted.status, "ANCHORED");
  assert.equal(submitted.anchorRef.startsWith("mock://mock_test_provider/"), true);

  const verified = provider.verify(submitted.anchorRef);
  assert.equal(verified.status, "ANCHORED");
  assert.equal(verified.hash, "hash_demo_001");
  assert.equal(verified.providerName, "mock_test_provider");

  const status = provider.status();
  assert.equal(status.providerName, "mock_test_provider");
  assert.equal(status.state, "ready");
  assert.equal(status.submittedCount, 1);
  assert.equal(status.verifiedCount, 1);
});

test("MockAnchorProvider: unknown anchorRef should return NOT_FOUND", () => {
  const provider = new MockAnchorProvider("mock_not_found_provider");
  const result = provider.verify("mock://mock_not_found_provider/missing");
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(result.hash, null);
  assert.equal(result.anchoredAt, null);
});

class FakeIpfsTransport implements IpfsAnchorTransport {
  private readonly found = new Set<string>();

  addJson(params: {
    apiBaseUrl: string;
    payload: string;
    authToken?: string | null;
    pin?: boolean;
  }): { cid: string; size?: string; raw?: unknown } {
    const cid = `bafytest${params.payload.length}`;
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

test("IpfsHttpAnchorProvider: submit/verify should return ipfs anchor ref", () => {
  const provider = new IpfsHttpAnchorProvider({
    providerName: "ipfs_test_provider",
    apiBaseUrl: "http://127.0.0.1:5001",
    transport: new FakeIpfsTransport(),
  });
  const submitted = provider.submit({
    proofId: "proof_demo_002",
    hash: "hash_demo_002",
  });

  assert.equal(submitted.providerName, "ipfs_test_provider");
  assert.equal(submitted.status, "ANCHORED");
  assert.equal(submitted.anchorRef.startsWith("ipfs://bafytest"), true);

  const verified = provider.verify(submitted.anchorRef);
  assert.equal(verified.status, "ANCHORED");
  assert.equal(verified.hash, "hash_demo_002");
  assert.equal(verified.providerName, "ipfs_test_provider");

  const status = provider.status();
  assert.equal(status.providerName, "ipfs_test_provider");
  assert.equal(status.state, "ready");
  assert.equal(status.submittedCount, 1);
  assert.equal(status.verifiedCount, 1);
});

test("IpfsHttpAnchorProvider: unknown cid should return NOT_FOUND", () => {
  const provider = new IpfsHttpAnchorProvider({
    providerName: "ipfs_not_found_provider",
    transport: new FakeIpfsTransport(),
  });
  const result = provider.verify("ipfs://bafyunknowncid");
  assert.equal(result.status, "NOT_FOUND");
  assert.equal(result.hash, null);
  assert.equal(result.anchoredAt, null);
});
