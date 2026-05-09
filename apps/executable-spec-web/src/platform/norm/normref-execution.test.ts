import assert from "node:assert/strict";
import test from "node:test";

import {
  autoAdvanceCurrentSpec,
  buildNormExecutionState,
  canArchiveContainer,
  canExecute,
  canExecuteSpec,
  getNextExecutableSpec,
  type NormRef,
} from "./normref-execution.ts";

const SUBGRADE_NORMREF: NormRef = {
  normRefId: "normref.highway.subgrade.basic.v1",
  name: "路基基础验收顺序",
  specs: [
    {
      spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
      order: 1,
      dependsOn: [],
      required: true,
    },
    {
      spuId: "highway.subgrade.thickness@v1",
      order: 2,
      dependsOn: ["highway.subgrade.compaction.4.2.1.soil@v1"],
      required: true,
    },
    {
      spuId: "highway.subgrade.deflection@v1",
      order: 3,
      dependsOn: ["highway.subgrade.thickness@v1"],
      required: true,
    },
  ],
};

test("scenario A: initial state", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {});
  assert.equal(state["highway.subgrade.compaction.4.2.1.soil@v1"], "ready");
  assert.equal(state["highway.subgrade.thickness@v1"], "blocked");
  assert.equal(state["highway.subgrade.deflection@v1"], "blocked");
  assert.equal(getNextExecutableSpec(SUBGRADE_NORMREF, state), "highway.subgrade.compaction.4.2.1.soil@v1");
});

test("scenario B: compaction pass", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
  });
  assert.equal(state["highway.subgrade.compaction.4.2.1.soil@v1"], "pass");
  assert.equal(state["highway.subgrade.thickness@v1"], "ready");
  assert.equal(state["highway.subgrade.deflection@v1"], "blocked");
  assert.equal(canExecute("highway.subgrade.thickness@v1", state), true);
  assert.ok(canExecuteSpec("highway.subgrade.thickness@v1", SUBGRADE_NORMREF, state));
});

test("scenario C: thickness fail keeps deflection blocked", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
    "highway.subgrade.thickness@v1": { status: "FAIL" },
  });
  assert.equal(state["highway.subgrade.compaction.4.2.1.soil@v1"], "pass");
  assert.equal(state["highway.subgrade.thickness@v1"], "fail");
  assert.equal(state["highway.subgrade.deflection@v1"], "blocked");
  assert.ok(canExecuteSpec("highway.subgrade.thickness@v1", SUBGRADE_NORMREF, state));
  assert.equal(getNextExecutableSpec(SUBGRADE_NORMREF, state), null);
});

test("scenario D: all pass can archive", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
    "highway.subgrade.thickness@v1": { status: "PASS" },
    "highway.subgrade.deflection@v1": { status: "PASS" },
  });
  assert.equal(state["highway.subgrade.compaction.4.2.1.soil@v1"], "pass");
  assert.equal(state["highway.subgrade.thickness@v1"], "pass");
  assert.equal(state["highway.subgrade.deflection@v1"], "pass");
  assert.equal(canArchiveContainer(SUBGRADE_NORMREF, state), true);
});

test("scenario E: auto-advance moves to next ready task", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
  });
  const result = autoAdvanceCurrentSpec(SUBGRADE_NORMREF, state, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(result.nextSpuId, "highway.subgrade.thickness@v1");
  assert.equal(result.shouldArchive, false);
});

test("scenario F: auto-advance keeps current task on fail", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
    "highway.subgrade.thickness@v1": { status: "FAIL" },
  });
  const result = autoAdvanceCurrentSpec(SUBGRADE_NORMREF, state, "highway.subgrade.thickness@v1");
  assert.equal(result.nextSpuId, "highway.subgrade.thickness@v1");
  assert.equal(result.shouldArchive, false);
  assert.equal(result.message, "current spec failed, recheck required");
});

test("scenario G: auto-advance returns archive-ready when all required specs pass", () => {
  const state = buildNormExecutionState(SUBGRADE_NORMREF, {
    "highway.subgrade.compaction.4.2.1.soil@v1": { status: "PASS" },
    "highway.subgrade.thickness@v1": { status: "PASS" },
    "highway.subgrade.deflection@v1": { status: "PASS" },
  });
  const result = autoAdvanceCurrentSpec(SUBGRADE_NORMREF, state, "highway.subgrade.deflection@v1");
  assert.equal(result.nextSpuId, null);
  assert.equal(result.shouldArchive, true);
  assert.equal(result.message, "all required specs passed, ready to archive");
});
