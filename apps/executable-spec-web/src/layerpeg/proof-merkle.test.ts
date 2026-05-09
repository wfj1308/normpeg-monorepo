import assert from "node:assert/strict";
import test from "node:test";

import {
  MerkleProofChain,
  buildMerkleTree,
  createProofRecord,
  generateProofPath,
  getRoot,
  hash,
  verifyProof,
} from "./proof-merkle.ts";

test("hash should generate deterministic SHA-256 values", async () => {
  const first = await hash({ a: 1, b: [2, 3] });
  const second = await hash({ b: [2, 3], a: 1 });

  assert.equal(first, second);
  assert.equal(first.length, 64);
});

test("buildMerkleTree + getRoot should build a non-empty root", async () => {
  const proofs = [
    { proof_hash: await hash("leaf-1") },
    { proof_hash: await hash("leaf-2") },
    { proof_hash: await hash("leaf-3") },
  ];

  const tree = await buildMerkleTree(proofs);
  const root = getRoot(tree);

  assert.equal(tree.leaves.length, 3);
  assert.equal(root.length, 64);
});

test("generateProofPath + verifyProof should verify leaf membership", async () => {
  const leafHashes = [await hash("A"), await hash("B"), await hash("C"), await hash("D")];
  const tree = await buildMerkleTree(leafHashes);
  const root = getRoot(tree);

  const leaf = leafHashes[2];
  const path = generateProofPath(tree, leaf);
  const verified = await verifyProof(leaf, path, root);

  assert.equal(path.length, 2);
  assert.equal(verified, true);
});

test("createProofRecord should build required proof fields", async () => {
  const proof = await createProofRecord({ execution_id: "e-1", result: "PASS" }, "parent-hash-0");

  assert.equal(typeof proof.proof_hash, "string");
  assert.equal(typeof proof.payload_hash, "string");
  assert.equal(proof.parent_hash, "parent-hash-0");
  assert.equal(proof.merkle_root, "");
  assert.equal(proof.proof_hash.length, 64);
  assert.equal(proof.payload_hash.length, 64);
});

test("MerkleProofChain should support getRoot/generateProofPath/verifyProof API", async () => {
  const chain = new MerkleProofChain();
  const leaves = [await hash("m-1"), await hash("m-2"), await hash("m-3")];
  await chain.buildMerkleTree(leaves);
  const root = chain.getRoot();
  const path = chain.generateProofPath(leaves[0]);
  const verified = await chain.verifyProof(leaves[0], path, root);

  assert.equal(root.length, 64);
  assert.equal(path.length, 2);
  assert.equal(verified, true);
});
