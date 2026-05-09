import assert from "node:assert/strict";
import test from "node:test";

import { signNode } from "./spu-runtime.ts";
import {
  autoAdvance,
  buildWorkItemProof,
  createWorkItemInstance,
  executeWorkItemNode,
  setWorkItemWorkflowEnabled,
  syncWorkItemNode,
} from "./lib/workitem-runtime.ts";
import { getSPUExample } from "./spu-examples.ts";

const compactionId = "highway.subgrade.compaction.4.2.1.soil@v1";
const deflectionId = "highway.subgrade.deflection.4.2.2@v1";
const thicknessId = "highway.subgrade.thickness.4.2.3@v1";

test("createWorkItemInstance initializes workflow with unlocked first step", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");

  assert.equal(workItem.workItemId, "earthwork_subgrade");
  assert.equal(workItem.workflowEnabled, true);
  assert.equal(workItem.spuIds.length, 3);
  assert.equal(workItem.nodes[compactionId]?.status, "UNLOCKED");
  assert.equal(workItem.nodes[deflectionId]?.status, "LOCKED");
  assert.equal(workItem.nodes[deflectionId]?.blockedByFailure, false);
  assert.equal(workItem.nodes[thicknessId]?.status, "LOCKED");
  assert.equal(workItem.aggregateStatus, "READY");
  assert.deepEqual(workItem.summary, {
    total: 3,
    passed: 0,
    failed: 0,
    blocked: 0,
    pending: 3,
  });
});

test("executing compaction PASS unlocks deflection and auto-advance points to it", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");
  const compaction = getSPUExample(compactionId);

  const updated = executeWorkItemNode(workItem, compaction.spu.spuId, compaction.passInputs);

  assert.equal(updated.nodes[compactionId]?.status, "PASS");
  assert.equal(updated.nodes[deflectionId]?.status, "UNLOCKED");
  assert.equal(updated.nodes[deflectionId]?.isAutoUnlocked, true);
  assert.equal(updated.nodes[thicknessId]?.status, "LOCKED");
  assert.equal(updated.summary.total, 3);
  assert.equal(updated.summary.passed, 1);
  assert.equal(updated.summary.failed, 0);
  assert.equal(updated.summary.blocked, 0);
  assert.equal(updated.summary.pending, 2);
  assert.equal(updated.aggregateStatus, "IN_PROGRESS");
  assert.equal(autoAdvance(updated, compactionId), deflectionId);
  assert.ok(updated.proof);
  assert.equal(updated.proof?.nodeResults.length, 3);
});

test("locked workflow step cannot execute before dependencies pass", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");
  const deflection = getSPUExample(deflectionId);

  assert.throws(
    () => executeWorkItemNode(workItem, deflection.spu.spuId, deflection.passInputs),
    /locked by workflow dependencies/,
  );
});

test("compaction FAIL blocks deflection and thickness, and autoAdvance stops", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");
  const compaction = getSPUExample(compactionId);

  const failed = executeWorkItemNode(workItem, compaction.spu.spuId, compaction.failInputs);

  assert.equal(failed.nodes[compactionId]?.status, "FAIL");
  assert.equal(failed.nodes[deflectionId]?.status, "LOCKED");
  assert.equal(failed.nodes[deflectionId]?.blockedByFailure, true);
  assert.equal(failed.nodes[thicknessId]?.status, "LOCKED");
  assert.equal(failed.nodes[thicknessId]?.blockedByFailure, true);
  assert.equal(failed.summary.passed, 0);
  assert.equal(failed.summary.failed, 1);
  assert.equal(failed.summary.blocked, 2);
  assert.equal(failed.summary.pending, 0);
  assert.equal(failed.aggregateStatus, "FAIL");
  assert.equal(autoAdvance(failed, compactionId), compactionId);
});

test("compaction PASS then deflection FAIL blocks thickness", () => {
  const base = createWorkItemInstance("earthwork_subgrade");
  const compaction = getSPUExample(compactionId);
  const deflection = getSPUExample(deflectionId);

  const unlocked = executeWorkItemNode(base, compaction.spu.spuId, compaction.passInputs);
  const failed = executeWorkItemNode(unlocked, deflection.spu.spuId, deflection.failInputs);

  assert.equal(failed.nodes[compactionId]?.status, "PASS");
  assert.equal(failed.nodes[deflectionId]?.status, "FAIL");
  assert.equal(failed.nodes[thicknessId]?.status, "LOCKED");
  assert.equal(failed.nodes[thicknessId]?.blockedByFailure, true);
  assert.equal(failed.summary.passed, 1);
  assert.equal(failed.summary.failed, 1);
  assert.equal(failed.summary.blocked, 1);
  assert.equal(failed.summary.pending, 0);
  assert.equal(failed.aggregateStatus, "FAIL");
});

test("full workflow pass unlocks all steps and finishes as PASS", () => {
  const targets = [
    getSPUExample(compactionId),
    getSPUExample(deflectionId),
    getSPUExample(thicknessId),
  ];

  let current = createWorkItemInstance("earthwork_subgrade");
  for (const target of targets) {
    current = executeWorkItemNode(current, target.spu.spuId, target.passInputs);
  }

  const proof = buildWorkItemProof(current);

  assert.equal(current.nodes[compactionId]?.status, "PASS");
  assert.equal(current.nodes[deflectionId]?.status, "PASS");
  assert.equal(current.nodes[thicknessId]?.status, "PASS");
  assert.equal(current.aggregateStatus, "PASS");
  assert.equal(current.summary.passed, 3);
  assert.equal(current.summary.blocked, 0);
  assert.equal(current.summary.pending, 0);
  assert.equal(proof.aggregateStatus, "PASS");
  assert.equal(proof.nodeResults.length, 3);
});

test("signature sync preserves workflow pass state after final sign-off", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");
  const compaction = getSPUExample(compactionId);

  const executed = executeWorkItemNode(workItem, compaction.spu.spuId, compaction.passInputs);
  const signedLab = signNode(executed.nodes[compactionId], "lab");
  const syncedLab = syncWorkItemNode(executed, signedLab);
  const signedFinal = signNode(syncedLab.nodes[compactionId], "supervision");
  const finalWorkItem = syncWorkItemNode(syncedLab, signedFinal);

  assert.equal(finalWorkItem.nodes[compactionId]?.status, "PASS");
  assert.equal(finalWorkItem.nodes[deflectionId]?.status, "UNLOCKED");
  assert.equal(finalWorkItem.summary.passed, 1);
  assert.equal(finalWorkItem.summary.blocked, 0);
  assert.equal(finalWorkItem.aggregateStatus, "IN_PROGRESS");
});

test("workflow can be turned off to restore free execution mode", () => {
  const workItem = createWorkItemInstance("earthwork_subgrade");
  const workflowOff = setWorkItemWorkflowEnabled(workItem, false);
  const deflection = getSPUExample(deflectionId);

  assert.equal(workflowOff.workflowEnabled, false);
  assert.equal(workflowOff.nodes[compactionId]?.status, "READY");
  assert.equal(workflowOff.nodes[deflectionId]?.status, "READY");
  assert.equal(workflowOff.nodes[thicknessId]?.status, "READY");
  assert.equal(autoAdvance(workflowOff, compactionId), compactionId);

  const executed = executeWorkItemNode(workflowOff, deflection.spu.spuId, deflection.passInputs);

  assert.equal(executed.nodes[deflectionId]?.status, "PASS");
});
