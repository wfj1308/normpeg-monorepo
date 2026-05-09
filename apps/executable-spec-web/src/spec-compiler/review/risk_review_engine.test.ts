import assert from "node:assert/strict";
import test from "node:test";

import { buildRiskReviewResult } from "./risk_review_engine.ts";
import { mapWarningToRiskItem, summarizeRiskItems } from "./index.ts";

test("mapWarningToRiskItem: CLAUSE_AMBIGUOUS -> 高风险阻断", () => {
  const item = mapWarningToRiskItem({
    code: "CLAUSE_AMBIGUOUS",
    message: "条款识别不稳定",
    section: "条款号",
  });
  assert.equal(item.riskLevel, "high");
  assert.equal(item.category, "clause");
  assert.equal(item.requiresConfirmation, true);
  assert.equal(item.blocksRegister, true);
  assert.equal(item.section, "条款号");
});

test("场景1：仅 OCR_USED -> low risk, canRegister = true", () => {
  const result = buildRiskReviewResult([
    {
      code: "OCR_USED",
      message: "检测到 OCR",
    },
  ]);

  assert.equal(result.summary.high, 0);
  assert.equal(result.summary.medium, 0);
  assert.equal(result.summary.low, 1);
  assert.equal(result.summary.blocking, 0);
  assert.equal(result.canRegister, true);
});

test("场景2：INPUTS_INFERRED + RULES_INFERRED -> medium risk, 需人工确认, 可注册", () => {
  const result = buildRiskReviewResult([
    {
      code: "INPUTS_INFERRED",
      message: "输入参数来自推断",
      section: "输入参数",
    },
    {
      code: "RULES_INFERRED",
      message: "判定规则来自推断",
      section: "判定规则",
    },
  ]);

  assert.equal(result.summary.high, 0);
  assert.equal(result.summary.medium, 2);
  assert.equal(result.summary.low, 0);
  assert.equal(result.summary.blocking, 0);
  assert.ok(result.summary.confirmRequired > 0);
  assert.equal(result.canRegister, true);
});

test("场景3：CLAUSE_AMBIGUOUS + FORMULA_PARTIAL -> high risk, 阻断注册", () => {
  const result = buildRiskReviewResult([
    {
      code: "CLAUSE_AMBIGUOUS",
      message: "条款不稳定",
    },
    {
      code: "FORMULA_PARTIAL",
      message: "公式缺损",
    },
  ]);

  assert.equal(result.summary.high, 2);
  assert.equal(result.summary.blocking, 2);
  assert.equal(result.canRegister, false);
  assert.match(result.reviewMessage, /暂不允许注册/);
});

test("summarizeRiskItems: 统计 high/medium/low + 阻断 + 确认项", () => {
  const items = [
    mapWarningToRiskItem({ code: "CLAUSE_AMBIGUOUS", message: "a" }),
    mapWarningToRiskItem({ code: "INPUTS_INFERRED", message: "b" }),
    mapWarningToRiskItem({ code: "OCR_USED", message: "c" }),
  ];
  const summary = summarizeRiskItems(items);

  assert.deepEqual(summary, {
    high: 1,
    medium: 1,
    low: 1,
    blocking: 1,
    confirmRequired: 2,
  });
});
