import assert from "node:assert/strict";
import test from "node:test";

import { ApprovalFlowError, ApprovalFlowService } from "./approval_flow_service.ts";

test("approval workflow: draft -> submitted -> in_review -> approved -> published -> deprecated", () => {
  const service = new ApprovalFlowService();
  const draft = service.createCandidate({
    title: "subgrade compaction v2",
    summary: "raise threshold",
    content: { threshold: 95 },
    assetType: "spu",
    assetRef: "spu:demo.compaction@v2",
    actorId: "builder-1",
  });
  assert.equal(draft.status, "draft");
  assert.equal(draft.assetType, "spu");

  const submitted = service.submitCandidate(draft.candidateId, {
    actorId: "builder-1",
    note: "ready for review",
  });
  assert.equal(submitted.status, "submitted");

  const inReview = service.moveToReview(draft.candidateId, {
    actorId: "expert-1",
    note: "assigned reviewer",
  });
  assert.equal(inReview.status, "in_review");

  const approved = service.decideCandidate(draft.candidateId, {
    actorId: "expert-1",
    decision: "approve",
    note: "approved for publish",
  });
  assert.equal(approved.status, "approved");

  const published = service.publishCandidate(draft.candidateId, {
    actorId: "admin-1",
    publishedRef: "spu:demo.compaction@v2",
  });
  assert.equal(published.status, "published");
  assert.equal(published.publishedRef, "spu:demo.compaction@v2");

  const deprecated = service.deprecateCandidate(draft.candidateId, {
    actorId: "admin-1",
    note: "superseded by v3",
  });
  assert.equal(deprecated.status, "deprecated");
  assert.equal(deprecated.events.length, 6);
  assert.equal(deprecated.events[0]?.action, "create_draft");
  assert.equal(deprecated.events[1]?.action, "submit");
  assert.equal(deprecated.events[2]?.action, "start_review");
  assert.equal(deprecated.events[3]?.action, "approve");
  assert.equal(deprecated.events[4]?.action, "publish");
  assert.equal(deprecated.events[5]?.action, "deprecate");
});

test("approval workflow: should support template/specbundle and keep traceability", () => {
  const service = new ApprovalFlowService();
  const templateDraft = service.createCandidate({
    title: "template:subgrade-core",
    assetType: "template",
    actorId: "builder-2",
  });
  const bundleDraft = service.createCandidate({
    title: "specbundle:subgrade-pack",
    assetType: "specbundle",
    actorId: "builder-2",
  });

  assert.equal(templateDraft.assetType, "template");
  assert.equal(bundleDraft.assetType, "specbundle");

  service.submitCandidate(templateDraft.candidateId, { actorId: "builder-2" });
  service.moveToReview(templateDraft.candidateId, { actorId: "expert-2" });
  service.decideCandidate(templateDraft.candidateId, { actorId: "expert-2", decision: "approve" });
  const templatePublished = service.publishCandidate(templateDraft.candidateId, {
    actorId: "admin-2",
    publishedRef: "template:subgrade-core@v1",
  });
  assert.equal(templatePublished.status, "published");
  assert.equal(templatePublished.events.length, 5);

  const templateOnly = service.listCandidates({ assetType: "template" });
  assert.equal(templateOnly.length, 1);
  assert.equal(templateOnly[0]?.candidateId, templateDraft.candidateId);
});

test("approval workflow: rejected item can resubmit, but cannot publish before approval", () => {
  const service = new ApprovalFlowService();
  const draft = service.createCandidate({
    title: "spu:demo.fail",
    assetType: "spu",
    actorId: "builder-3",
  });
  service.submitCandidate(draft.candidateId, { actorId: "builder-3" });
  service.moveToReview(draft.candidateId, { actorId: "expert-3" });
  service.decideCandidate(draft.candidateId, { actorId: "expert-3", decision: "reject", note: "formula mismatch" });

  assert.throws(
    () =>
      service.publishCandidate(draft.candidateId, {
        actorId: "admin-3",
      }),
    (error) => {
      assert.ok(error instanceof ApprovalFlowError);
      assert.equal(error.code, "APPROVAL_INVALID_STATE");
      return true;
    },
  );

  const resubmitted = service.submitCandidate(draft.candidateId, {
    actorId: "builder-3",
    note: "fixed and resubmitted",
  });
  assert.equal(resubmitted.status, "submitted");
});
