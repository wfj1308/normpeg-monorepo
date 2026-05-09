import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import { selectSpuCandidates } from "./spu_selector_service.ts";

function buildSpu(params: {
  spuId: string;
  category: string;
  clause: string;
  measuredItem: string;
  version: string;
}): SPUDefinition {
  return {
    spuId: params.spuId,
    meta: {
      name: params.spuId,
      norm: "TEST-NORM",
      clause: params.clause,
      version: params.version,
      category: params.category,
      measuredItem: params.measuredItem,
    },
    data: {
      inputs: [
        { name: "inputA", type: "number", label: "inputA" },
        { name: "inputB", type: "number", label: "inputB" },
      ],
      outputs: [{ name: "result", label: "result" }],
    },
    path: [{ step: "s1", formula: "result = inputA" }],
    rules: [{ ruleId: "R1", field: "result", operator: ">=", threshold: 1, message: "ok" }],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

test("selectSpuCandidates: project-bound should rank first", () => {
  const service = new PlatformService();
  const spuV1 = buildSpu({
    spuId: "demo.selector.compaction@v1",
    category: "subgrade",
    clause: "4.2.1",
    measuredItem: "compaction",
    version: "v1",
  });
  const spuV2 = buildSpu({
    spuId: "demo.selector.compaction@v2",
    category: "subgrade",
    clause: "4.2.1",
    measuredItem: "compaction",
    version: "v2",
  });
  service.publishSpuVersion(spuV1);
  service.publishSpuVersion(spuV2);
  service.bindProjectSpuVersion({
    projectId: "project-alpha",
    spuKey: "demo.selector.compaction",
    selector: { version: "v1" },
  });

  const result = selectSpuCandidates(service, {
    intent: "gate.evaluate",
    projectContext: {
      projectId: "project-alpha",
      preferredCategory: "subgrade",
      preferredClause: "4.2.1",
    },
    hints: {
      category: "subgrade",
      clause: "4.2.1",
      measuredItem: "compaction",
    },
  });

  assert.equal(result.selectedSpuId, "demo.selector.compaction@v1");
  assert.equal(result.rankedCandidates[0]?.spuId, "demo.selector.compaction@v1");
  assert.equal(result.rankedCandidates[0]?.matchReasons.some((reason) => reason.includes("project-bound active")), true);
});

test("selectSpuCandidates: exact category should outrank non-exact category", () => {
  const service = new PlatformService();
  const categoryMatch = buildSpu({
    spuId: "demo.selector.catmatch@v1",
    category: "subgrade",
    clause: "9.9.9",
    measuredItem: "custom",
    version: "v1",
  });
  const categoryMiss = buildSpu({
    spuId: "demo.selector.catmiss@v1",
    category: "bridge",
    clause: "9.9.9",
    measuredItem: "custom",
    version: "v1",
  });
  service.publishSpuVersion(categoryMatch);
  service.publishSpuVersion(categoryMiss);

  const result = selectSpuCandidates(service, {
    intent: "gate.preview",
    hints: {
      category: "subgrade",
    },
  });

  const matched = result.rankedCandidates.find((item) => item.spuId === "demo.selector.catmatch@v1");
  const missed = result.rankedCandidates.find((item) => item.spuId === "demo.selector.catmiss@v1");
  assert.ok(matched);
  assert.ok(missed);
  assert.ok((matched?.score ?? 0) > (missed?.score ?? 0));
});

test("selectSpuCandidates: exact clause should outrank non-exact clause", () => {
  const service = new PlatformService();
  const clauseMatch = buildSpu({
    spuId: "demo.selector.clausematch@v1",
    category: "subgrade",
    clause: "4.2.1",
    measuredItem: "custom",
    version: "v1",
  });
  const clauseMiss = buildSpu({
    spuId: "demo.selector.clausemiss@v1",
    category: "subgrade",
    clause: "8.8.8",
    measuredItem: "custom",
    version: "v1",
  });
  service.publishSpuVersion(clauseMatch);
  service.publishSpuVersion(clauseMiss);

  const result = selectSpuCandidates(service, {
    intent: "gate.preview",
    hints: {
      category: "subgrade",
      clause: "4.2.1",
    },
  });

  const matched = result.rankedCandidates.find((item) => item.spuId === "demo.selector.clausematch@v1");
  const missed = result.rankedCandidates.find((item) => item.spuId === "demo.selector.clausemiss@v1");
  assert.ok(matched);
  assert.ok(missed);
  assert.ok((matched?.score ?? 0) > (missed?.score ?? 0));
});

test("selectSpuCandidates: should return required missing inputs per candidate", () => {
  const service = new PlatformService();
  const spu = buildSpu({
    spuId: "demo.selector.inputs@v1",
    category: "subgrade",
    clause: "4.2.1",
    measuredItem: "custom",
    version: "v1",
  });
  service.publishSpuVersion(spu);

  const result = selectSpuCandidates(service, {
    intent: "gate.evaluate",
    hints: {
      spuId: "demo.selector.inputs@v1",
    },
    inputs: {
      inputA: 123,
    },
  });

  const first = result.rankedCandidates[0];
  assert.equal(first?.spuId, "demo.selector.inputs@v1");
  assert.deepEqual(first?.requiredMissingInputs, ["inputB"]);
});

