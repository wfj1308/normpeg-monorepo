import assert from "node:assert/strict";
import test from "node:test";

import {
  ERROR_ILLEGAL_TRANSITION,
  ERROR_UNKNOWN_SCOPE,
  ERROR_UNKNOWN_STATUS,
  STATE_SCOPE_CONTAINER,
  STATE_SCOPE_NODE,
  StateTransitionError,
  allowedTargets,
  assertTransition,
  canTransition,
  normalizePageStatusText,
  normalizeState,
  toSchedulerTaskStatus,
  transition,
} from "./transitions.ts";

test("state machine: node happy path", () => {
  assert.equal(transition(STATE_SCOPE_NODE, "DRAFT", "READY"), "READY");
  assert.equal(transition(STATE_SCOPE_NODE, "READY", "RUNNING"), "RUNNING");
  assert.equal(transition(STATE_SCOPE_NODE, "RUNNING", "FINAL_PASS"), "PASSED");
  assert.equal(transition(STATE_SCOPE_NODE, "PASSED", "ARCHIVED"), "ARCHIVED");
});

test("state machine: container happy path", () => {
  assert.equal(transition(STATE_SCOPE_CONTAINER, "DRAFT", "RUNNING"), "RUNNING");
  assert.equal(transition(STATE_SCOPE_CONTAINER, "RUNNING", "VERIFIED"), "PASSED");
  assert.equal(transition(STATE_SCOPE_CONTAINER, "PASSED", "ARCHIVED"), "ARCHIVED");
});

test("state machine: illegal transition throws code", () => {
  assert.throws(
    () => transition(STATE_SCOPE_NODE, "READY", "PASSED"),
    (error: unknown) => {
      assert.ok(error instanceof StateTransitionError);
      assert.equal(error.code, ERROR_ILLEGAL_TRANSITION);
      assert.equal(error.current, "READY");
      assert.equal(error.target, "PASSED");
      return true;
    },
  );
});

test("state machine: unknown scope throws code", () => {
  assert.throws(
    () => transition("WORK_ITEM", "DRAFT", "READY"),
    (error: unknown) => {
      assert.ok(error instanceof StateTransitionError);
      assert.equal(error.code, ERROR_UNKNOWN_SCOPE);
      return true;
    },
  );
});

test("state machine: unknown status throws code", () => {
  assert.throws(
    () => normalizeState("NOT_A_REAL_STATUS"),
    (error: unknown) => {
      assert.ok(error instanceof StateTransitionError);
      assert.equal(error.code, ERROR_UNKNOWN_STATUS);
      return true;
    },
  );
});

test("state machine: page text mapping", () => {
  assert.equal(normalizePageStatusText("草稿"), "INIT");
  assert.equal(normalizePageStatusText("执行中"), "RUNNING");
  assert.equal(normalizePageStatusText("签名中"), "SIGNING");
  assert.equal(normalizePageStatusText("已归档"), "ARCHIVED");
});

test("state machine: allowedTargets/canTransition", () => {
  const targets = allowedTargets(STATE_SCOPE_CONTAINER, "VERIFIED");
  assert.ok(targets.includes("ARCHIVED"));
  assert.equal(canTransition(STATE_SCOPE_CONTAINER, "RUNNING", "PASSED"), true);
  assert.equal(canTransition(STATE_SCOPE_CONTAINER, "ARCHIVED", "RUNNING"), false);
  assert.equal(assertTransition(STATE_SCOPE_CONTAINER, "RUNNING", "FAILED"), "FAILED");
});

test("state machine: scheduler status mapping", () => {
  assert.equal(toSchedulerTaskStatus("INIT"), "ready");
  assert.equal(toSchedulerTaskStatus("BLOCKED"), "blocked");
  assert.equal(toSchedulerTaskStatus("SIGNING"), "running");
  assert.equal(toSchedulerTaskStatus("PASSED"), "pass");
  assert.equal(toSchedulerTaskStatus("FAILED"), "failed");
  assert.equal(toSchedulerTaskStatus("ARCHIVED"), "pass");
});
