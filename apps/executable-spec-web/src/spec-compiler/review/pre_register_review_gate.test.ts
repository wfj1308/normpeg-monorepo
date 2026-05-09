import assert from "node:assert/strict";
import test from "node:test";

import { buildPreRegisterDecision, detectHighRiskDiff } from "./pre_register_review_gate.ts";
import type { ClauseReviewItem } from "./clause_review.ts";

const BASE_MARKDOWN = `# 路基压实度（土质）

规范来源：JTG F80/1-2017
条款号：4.2.1
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积

## 输出参数
- wetDensity
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. compactionDegree = wetDensity * 100

## 判定规则
- compactionDegree >= 93 | 压实度必须 ≥ 93%

## 签字要求
- lab
- supervision
`;

function buildClauseItems(confirmed: boolean): ClauseReviewItem[] {
  return [
    {
      id: "clause_source",
      title: "规范来源与条款号已核对",
      message: "核对条款号",
      riskLevel: "high",
      required: true,
      confirmed,
    },
    {
      id: "formula_steps",
      title: "计算步骤与公式已核对",
      message: "核对公式",
      riskLevel: "high",
      required: true,
      confirmed,
    },
    {
      id: "rules_threshold",
      title: "判定规则阈值已核对",
      message: "核对阈值",
      riskLevel: "high",
      required: true,
      confirmed,
    },
  ];
}

test("场景1：blocking（高风险 warning + 高风险条款未确认）", () => {
  const decision = buildPreRegisterDecision({
    warnings: [
      { code: "CLAUSE_AMBIGUOUS", message: "条款号识别不稳定" },
      { code: "FORMULA_PARTIAL", message: "公式抽取不完整" },
    ],
    originalDraftMarkdown: BASE_MARKDOWN,
    editedMarkdown: BASE_MARKDOWN,
    clauseReviewItems: buildClauseItems(false),
  });

  assert.equal(decision.status, "blocked");
  assert.equal(decision.canRegister, false);
  assert.ok(decision.blockingReasons.length > 0);
});

test("场景2：warning（中风险 warning + 高风险 diff + required 已确认）", () => {
  const edited = BASE_MARKDOWN.replace(">= 93", ">= 95").replace("≥ 93%", "≥ 95%");
  const decision = buildPreRegisterDecision({
    warnings: [
      { code: "INPUTS_INFERRED", message: "输入参数来自推断" },
      { code: "RULES_INFERRED", message: "判定规则来自推断" },
    ],
    originalDraftMarkdown: BASE_MARKDOWN,
    editedMarkdown: edited,
    clauseReviewItems: buildClauseItems(true),
  });

  assert.equal(decision.status, "warning");
  assert.equal(decision.canRegister, true);
  assert.ok(decision.warningReasons.length > 0);
  assert.equal(decision.summary.diffHigh > 0, true);
  assert.equal(detectHighRiskDiff(BASE_MARKDOWN, edited), true);
});

test("场景3：ready（无 blocking，required 已确认，无高风险 diff）", () => {
  const decision = buildPreRegisterDecision({
    warnings: [{ code: "OCR_USED", message: "使用 OCR" }],
    originalDraftMarkdown: BASE_MARKDOWN,
    editedMarkdown: BASE_MARKDOWN,
    clauseReviewItems: buildClauseItems(true),
  });

  assert.equal(decision.status, "ready");
  assert.equal(decision.canRegister, true);
  assert.equal(decision.blockingReasons.length, 0);
  assert.equal(decision.warningReasons.length, 0);
});
