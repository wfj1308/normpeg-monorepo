import assert from "node:assert/strict";
import test from "node:test";

import { runSubgradeDemo } from "./subgrade-demo.ts";

test("subgrade K19+070 demo reaches ARCHIVED and generates proof", () => {
  const result = runSubgradeDemo();
  assert.ok(result.container);
  assert.equal(result.container?.lifecycleState, "VERIFIED");
  assert.equal(result.container?.overallStatus, "PASS");
  assert.equal(result.proof.kind, "finalProof");
  assert.equal(result.proof.archiveStatus, "ARCHIVED");
  assert.equal(result.proof.overallStatus, "PASS");
  assert.equal(result.proof.status, "PASS");
  assert.equal(result.proof.specResults.length, 3);
  assert.ok(result.proof.proofId);
  assert.ok(result.proof.hash);
});
