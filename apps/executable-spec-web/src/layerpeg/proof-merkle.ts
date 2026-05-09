export type ProofRecord = {
  proof_hash: string;
  parent_hash: string;
  merkle_root: string;
  timestamp: string;
  payload_hash: string;
};

export type MerklePathItem = {
  sibling_hash: string;
  direction: "left" | "right";
};

export type MerkleTree = {
  leaves: string[];
  levels: string[][];
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);

  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function normalizeLeaf(leaf: string | ProofRecord): string {
  return typeof leaf === "string" ? leaf : leaf.proof_hash;
}

export async function hash(data: unknown): Promise<string> {
  const text = stableStringify(data);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new Error("Web Crypto API is unavailable in current runtime.");
  }

  const bytes = new TextEncoder().encode(text);
  const digest = await cryptoApi.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildMerkleTree(proofs: Array<string | ProofRecord>): Promise<MerkleTree> {
  const leaves = proofs.map((proof) => normalizeLeaf(proof).trim()).filter((item) => item.length > 0);
  if (leaves.length === 0) {
    return { leaves: [], levels: [[]] };
  }

  const levels: string[][] = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let index = 0; index < currentLevel.length; index += 2) {
      const left = currentLevel[index];
      const right = currentLevel[index + 1] ?? left;
      nextLevel.push(await hash(`${left}:${right}`));
    }
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return { leaves, levels };
}

export function getRoot(tree: MerkleTree): string {
  const topLevel = tree.levels[tree.levels.length - 1] ?? [];
  return topLevel[0] ?? "";
}

export function generateProofPath(tree: MerkleTree, leaf: string | ProofRecord): MerklePathItem[] {
  const targetLeaf = normalizeLeaf(leaf);
  let leafIndex = tree.leaves.findIndex((item) => item === targetLeaf);
  if (leafIndex < 0) {
    throw new Error(`leaf not found in merkle tree: ${targetLeaf}`);
  }

  const path: MerklePathItem[] = [];
  for (let levelIndex = 0; levelIndex < tree.levels.length - 1; levelIndex += 1) {
    const level = tree.levels[levelIndex];
    const isRightNode = leafIndex % 2 === 1;
    const siblingIndex = isRightNode ? leafIndex - 1 : leafIndex + 1;
    const siblingHash = level[siblingIndex] ?? level[leafIndex];

    path.push({
      sibling_hash: siblingHash,
      direction: isRightNode ? "left" : "right",
    });

    leafIndex = Math.floor(leafIndex / 2);
  }

  return path;
}

export async function verifyProof(
  leaf: string | ProofRecord,
  path: MerklePathItem[],
  root: string,
): Promise<boolean> {
  const targetLeaf = normalizeLeaf(leaf);
  let cursor = targetLeaf;

  for (const step of path) {
    cursor =
      step.direction === "left"
        ? await hash(`${step.sibling_hash}:${cursor}`)
        : await hash(`${cursor}:${step.sibling_hash}`);
  }

  return cursor === root;
}

export async function createProofRecord(payload: unknown, parentHash = ""): Promise<ProofRecord> {
  const timestamp = new Date().toISOString();
  const payloadHash = await hash(payload);
  const proofHash = await hash({ parent_hash: parentHash, payload_hash: payloadHash, timestamp });
  return {
    proof_hash: proofHash,
    parent_hash: parentHash,
    merkle_root: "",
    timestamp,
    payload_hash: payloadHash,
  };
}

export class MerkleProofChain {
  private tree: MerkleTree = { leaves: [], levels: [[]] };

  async buildMerkleTree(proofs: Array<string | ProofRecord>): Promise<MerkleTree> {
    this.tree = await buildMerkleTree(proofs);
    return this.tree;
  }

  getRoot(): string {
    return getRoot(this.tree);
  }

  generateProofPath(leaf: string | ProofRecord): MerklePathItem[] {
    return generateProofPath(this.tree, leaf);
  }

  async verifyProof(leaf: string | ProofRecord, path: MerklePathItem[], root = this.getRoot()): Promise<boolean> {
    return verifyProof(leaf, path, root);
  }
}
