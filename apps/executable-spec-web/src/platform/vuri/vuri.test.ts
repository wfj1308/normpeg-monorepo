import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContainerVuri,
  buildNodeVuri,
  buildProjectRootVuri,
  buildProofVuri,
  buildStakeVuri,
  normalizeVuri,
  parseVuri,
  validateVuri,
} from "./vuri.ts";

test("vuri: should build and parse project root", () => {
  const vuri = buildProjectRootVuri({
    projectId: "GXX-2024-XXX",
  });
  assert.equal(vuri, "v://GXX-2024-XXX");
  const parsed = parseVuri(vuri);
  assert.equal(parsed.projectId, "GXX-2024-XXX");
  assert.equal(parsed.targetKind, "project_root");
});

test("vuri: should build and parse stake/container/node/proof targets", () => {
  const stake = buildStakeVuri({
    projectId: "project-a",
    stakeRange: "K15+200-K15+260",
    version: "hash_1",
    layer: "subgrade",
    time: 1713196800,
  });
  assert.equal(stake, "v://project-a/stake/K15+200-K15+260?version=hash_1&layer=subgrade&time=1713196800");
  assert.equal(parseVuri(stake).targetKind, "stake");

  const container = buildContainerVuri({
    projectId: "project-a",
    containerId: "container_001",
  });
  assert.equal(container, "v://project-a/container/container_001");
  assert.equal(parseVuri(container).containerId, "container_001");

  const node = buildNodeVuri({
    projectId: "project-a",
    containerId: "container_001",
    nodeId: "node_abc",
  });
  assert.equal(node, "v://project-a/node/container_001/node_abc");
  assert.equal(parseVuri(node).nodePath, "container_001/node_abc");

  const proof = buildProofVuri({
    projectId: "project-a",
    proofId: "proof_123",
  });
  assert.equal(proof, "v://project-a/proof/proof_123");
  assert.equal(parseVuri(proof).proofId, "proof_123");
});

test("vuri: should normalize query order and path", () => {
  const normalized = normalizeVuri(" v://project-a/node/container_001/node_abc?time=2026-04-24T00:00:00.000Z&layer=l2&version=v3 ");
  assert.equal(normalized, "v://project-a/node/container_001/node_abc?version=v3&layer=l2&time=2026-04-24T00%3A00%3A00.000Z");
});

test("vuri: validator should reject unsupported target path and invalid time", () => {
  const unsupported = validateVuri("v://project-a/custom/path");
  assert.equal(unsupported.valid, false);
  assert.ok(unsupported.errors.some((item) => item.includes("unsupported")));

  const invalidTime = validateVuri("v://project-a/container/c1?time=not-a-time");
  assert.equal(invalidTime.valid, false);
  assert.ok(invalidTime.errors.some((item) => item.includes("time")));
});
