import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { SPULoader } from "./spu-loader.ts";
import {
  aggregateResult,
  buildDefaultFormData,
  generateWorkItemAnswer,
  handleWorkItemQuery,
  mapWorkItemToSpuList,
  parseWorkItemIntent,
} from "./mcp/spu-workitem-dispatch.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const SUBGRADE_QUERY = "K15+200\u8DEF\u57FA\u5408\u683C\u5417\uFF1F";
const PASS_SUFFIX = "\u5224\u5B9A\u8BE5\u8DEF\u57FA\u5408\u683C";
const FAIL_SUFFIX = "\u5224\u5B9A\u8BE5\u8DEF\u57FA\u4E0D\u5408\u683C";

function ensureSpuLoaded(fileName: string) {
  const loader = new SPULoader();
  const yamlText = readFileSync(resolve(currentDir, fileName), "utf-8");
  loader.load(yamlText);
}

test.beforeEach(() => {
  ensureSpuLoaded("./subgrade.compaction.spu.yaml");
  ensureSpuLoaded("./subgrade-thickness.spu.yaml");
  ensureSpuLoaded("./subgrade-deflection.spu.yaml");
});

test("parseWorkItemIntent extracts subgrade and stake", () => {
  const parsed = parseWorkItemIntent(SUBGRADE_QUERY);
  assert.deepEqual(parsed, {
    workItem: "subgrade",
    stake: "K15+200",
  });
});

test("mapWorkItemToSpuList returns fixed subgrade SPU list", () => {
  assert.deepEqual(mapWorkItemToSpuList("subgrade"), [
    "highway.subgrade.compaction.4.2.1.soil@v1",
    "highway.subgrade.thickness.4.2.3@v1",
    "highway.subgrade.deflection.4.2.2@v1",
  ]);
});

test("buildDefaultFormData returns default test payloads", () => {
  assert.deepEqual(buildDefaultFormData("highway.subgrade.compaction.4.2.1.soil@v1"), {
    massHoleSand: 1980,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
  });
  assert.deepEqual(buildDefaultFormData("highway.subgrade.thickness.4.2.3@v1"), {
    measuredThickness: 210,
    designThickness: 200,
  });
  assert.deepEqual(buildDefaultFormData("highway.subgrade.deflection.4.2.2@v1"), {
    measuredDeflection: 18,
    maxAllowedDeflection: 20,
    allowableDeflection: 20,
  });
});

test("aggregateResult returns FAIL when any item fails", () => {
  const aggregate = aggregateResult([
    {
      spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
      measuredItem: "\u538B\u5B9E\u5EA6\uFF08\u571F\u8D28\uFF09",
      status: "PASS",
    },
    {
      spuId: "highway.subgrade.thickness.4.2.3@v1",
      measuredItem: "\u539A\u5EA6",
      status: "FAIL",
    },
  ]);

  assert.equal(aggregate.overallStatus, "FAIL");
  assert.equal(aggregate.details.length, 2);
});

test("handleWorkItemQuery executes all SPUs and returns PASS for default subgrade dataset", () => {
  const result = handleWorkItemQuery(SUBGRADE_QUERY);

  assert.equal(result.query, SUBGRADE_QUERY);
  assert.equal(result.workItem, "subgrade");
  assert.equal(result.stake, "K15+200");
  assert.equal(result.spuResults.length, 3);
  assert.deepEqual(
    result.spuResults.map((item) => item.spuId),
    [
      "highway.subgrade.compaction.4.2.1.soil@v1",
      "highway.subgrade.thickness.4.2.3@v1",
      "highway.subgrade.deflection.4.2.2@v1",
    ],
  );
  assert.ok(result.spuResults.every((item) => item.status === "PASS"));
  assert.equal(result.overallStatus, "PASS");
  assert.ok(result.answer.includes(PASS_SUFFIX));
});

test("generateWorkItemAnswer explains failed SPU items based on execution result", () => {
  const answer = generateWorkItemAnswer(
    {
      workItem: "subgrade",
      stake: "K15+200",
    },
    {
      overallStatus: "FAIL",
      details: [
        {
          spuId: "highway.subgrade.compaction.4.2.1.soil@v1",
          measuredItem: "\u538B\u5B9E\u5EA6\uFF08\u571F\u8D28\uFF09",
          status: "FAIL",
          gate: {
            passed: false,
            results: [
              {
                ruleId: "RULE-COMPACTION-001",
                passed: false,
                actual: 91.82,
                expected: 93,
                field: "compactionDegree",
                operator: ">=",
                message: "fail",
              },
            ],
          },
        },
        {
          spuId: "highway.subgrade.thickness.4.2.3@v1",
          measuredItem: "\u539A\u5EA6",
          status: "PASS",
        },
        {
          spuId: "highway.subgrade.deflection.4.2.2@v1",
          measuredItem: "\u5F2F\u6C89",
          status: "PASS",
        },
      ],
    },
  );

  assert.ok(answer.includes("K15+200"));
  assert.ok(answer.includes("\u538B\u5B9E\u5EA6\uFF08\u571F\u8D28\uFF09\u4E0D\u8FBE\u6807"));
  assert.ok(answer.includes(FAIL_SUFFIX));
});
