import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { nodeDataStore } from "./data/node-data-store.ts";
import { SPULoader } from "./spu-loader.ts";
import { generateAnswer, handleUserQuery, mapToSpu, parseIntent } from "./mcp/spu-nl-dispatch.ts";

const currentDir = dirname(fileURLToPath(import.meta.url));

const COMPACTION_QUERY = "K15+200\u538B\u5B9E\u5EA6\u5408\u683C\u5417\uFF1F";
const COMPACTION_QUERY_FAIL = "K15+300\u538B\u5B9E\u5EA6\u5408\u683C\u5417\uFF1F";
const THICKNESS_MISSING_QUERY = "K15+300\u539A\u5EA6\u5408\u683C\u5417\uFF1F";
const MISSING_STAKE_QUERY = "\u538B\u5B9E\u5EA6\u5408\u683C\u5417\uFF1F";

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

test("parseIntent extracts metric and stake from natural language", () => {
  const parsed = parseIntent(COMPACTION_QUERY);
  assert.deepEqual(parsed, {
    metric: "compaction",
    stake: "K15+200",
  });
});

test("mapToSpu resolves the expected SPU id", () => {
  assert.equal(mapToSpu("compaction"), "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(mapToSpu("thickness"), "highway.subgrade.thickness.4.2.3@v1");
  assert.equal(mapToSpu("deflection"), "highway.subgrade.deflection.4.2.2@v1");
});

test("handleUserQuery fetches real node data and returns PASS for K15+200 compaction", () => {
  const result = handleUserQuery(COMPACTION_QUERY);

  assert.equal(result.query, COMPACTION_QUERY);
  assert.deepEqual(result.parsed, {
    metric: "compaction",
    stake: "K15+200",
  });
  assert.equal(result.spuId, "highway.subgrade.compaction.4.2.1.soil@v1");
  assert.equal(result.error, undefined);
  assert.equal(result.result?.status, "PASS");
  assert.ok((result.result?.outputs?.compactionDegree ?? 0) >= 93);
  assert.ok(result.answer.includes("\u5224\u5B9A\u5408\u683C"));
});

test("handleUserQuery returns FAIL for K15+300 compaction based on store data", () => {
  const result = handleUserQuery(COMPACTION_QUERY_FAIL);
  assert.equal(result.result?.status, "FAIL");
  assert.ok((result.result?.outputs?.compactionDegree ?? 100) < 93);
  assert.ok(result.answer.includes("\u5224\u5B9A\u4E0D\u5408\u683C"));
});

test("handleUserQuery returns DATA_NOT_FOUND when stake has no metric data", () => {
  const result = handleUserQuery(THICKNESS_MISSING_QUERY);
  assert.equal(result.error, "DATA_NOT_FOUND");
  assert.equal(result.result, undefined);
  assert.ok(result.answer.includes("K15+300"));
  assert.ok(result.answer.includes("\u6682\u65E0\u539A\u5EA6\u68C0\u6D4B\u6570\u636E"));
});

test("handleUserQuery returns MISSING_STAKE when stake is not provided", () => {
  const result = handleUserQuery(MISSING_STAKE_QUERY);
  assert.equal(result.error, "MISSING_STAKE");
  assert.equal(result.result, undefined);
  assert.equal(result.answer, "\u672A\u63D0\u4F9B\u6869\u53F7\uFF0C\u65E0\u6CD5\u67E5\u8BE2");
});

test("handleUserQuery returns INVALID_DATA when store record misses required fields", () => {
  nodeDataStore["K15+500"] = {
    compaction: {
      massHoleSand: 1880,
      volumeSand: 1000,
      moistureContent: 5,
      // maxDryDensity intentionally missing
    } as Record<string, number>,
  };

  const result = handleUserQuery("K15+500\u538B\u5B9E\u5EA6\u5408\u683C\u5417\uFF1F");
  assert.equal(result.error, "INVALID_DATA");
  assert.equal(result.result, undefined);
  assert.ok(result.answer.includes("K15+500"));
  assert.ok(result.answer.includes("\u68C0\u6D4B\u6570\u636E\u4E0D\u5B8C\u6574"));

  delete nodeDataStore["K15+500"];
});

test("generateAnswer must still follow runtime status", () => {
  const passAnswer = generateAnswer({
    metric: "thickness",
    stake: "K10+020",
    result: {
      status: "PASS",
      outputs: { thicknessValue: 210 },
      gate: {
        passed: true,
        results: [
          {
            ruleId: "RULE-THICKNESS-001",
            passed: true,
            actual: 210,
            expected: 180,
            field: "thicknessValue",
            operator: ">=",
            message: "ok",
          },
        ],
      },
    },
  });
  const failAnswer = generateAnswer({
    metric: "thickness",
    stake: "K10+020",
    result: {
      status: "FAIL",
      outputs: { thicknessValue: 170 },
      gate: {
        passed: false,
        results: [
          {
            ruleId: "RULE-THICKNESS-001",
            passed: false,
            actual: 170,
            expected: 180,
            field: "thicknessValue",
            operator: ">=",
            message: "not ok",
          },
        ],
      },
    },
  });

  assert.ok(passAnswer.includes("\u5224\u5B9A\u5408\u683C"));
  assert.ok(failAnswer.includes("\u5224\u5B9A\u4E0D\u5408\u683C"));
});
