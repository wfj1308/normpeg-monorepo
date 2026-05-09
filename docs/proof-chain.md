# Proof Chain

## Goal

Upgrade Proof from a standalone JSON artifact to a verifiable chain of evidence.

This iteration provides:
- deterministic proof hash
- chain-of-proofs linkage
- anchor reference binding
- verification API

## 1. Core Data Model

### Proof Hash

Final proofs (`NodeProof` / `ContainerProof`) now carry:
- `hash`
- `proofHash` (alias for external/audit readability)

Hash is computed from proof core fields only (execution snapshots, matched rules, signatures, timestamps, status), so chain/anchor metadata does not change the computed integrity hash.

### Chain of Proofs

Final proofs now support:
- `proofChain`
  - `chainId`
  - `index`
  - `previousProofId`
  - `previousProofHash`
  - `linkedAt`
  - `dependencies[]`

`dependencies[]` stores explicit upstream proof references (proofId/hash/source/node/container/timestamp).

### Anchor Reference

Final proofs now support:
- `anchorReference`
  - `providerName`
  - `anchorRef`
  - `hash`
  - `anchoredAt`
  - `status`

Anchor data is also mirrored in `extensions` for backward compatibility.

## 2. Hashing and Chain Build

### Deterministic Hash

`sha256Json` now hashes canonicalized JSON (sorted object keys), avoiding key-order drift.

### Proof -> Hash

Node/container final proof generation writes:
- `hash`
- `proofHash`
- extension fields (`proof_hash`, `payload_hash`)

### Chain Linking

- On `finalizeNode`:
  - attach node proof chain link
  - auto-reference previous proof in same container chain
- On `archiveContainer`:
  - attach aggregate proof chain link
  - include latest node proofs as dependency refs

## 3. Verify API

### Endpoint

`POST /api/proof/verify`

Request body (exactly one target required):
- `nodeId` or `containerId` or `proofId`
- optional `verifyAnchor`
- optional `providerName`

### Verification Includes

- hash integrity (`storedHash` vs recomputed hash)
- chain integrity
  - previous proof existence/hash match
  - dependency proof existence/hash match
- optional anchor verification
- lineage reconstruction for audit traceability

Response contains:
- `verified`
- `hashMatched`
- `chainVerified`
- `anchorVerified`
- `lineage[]`
- `issues[]`

## 4. Internal Implementation Notes

Key modules:
- `src/platform/proof/proof-chain.ts`
  - hash payload + recomputation
  - read hash/chain/anchor helpers
- `src/platform/workflow/platform-service.ts`
  - chain attach during finalize/archive
  - `verifyProof(...)` service API
- `server/platform-api.ts`
  - `/api/proof/verify` route
- `src/platform/api-client.ts`
  - `verifyProof(...)` client method

## 5. Backward Compatibility

- Existing proof/anchor flows remain valid.
- New fields are additive.
- Existing `extensions.anchorReceipt` is retained.

## 6. Acceptance Mapping

- Proof integrity is verifiable via deterministic hash recomputation.
- Chain traceability is verifiable via previous/dependency link checks and lineage output.
- Audit consumers can reconstruct proof history with proofId/hash lineage and anchor references.
