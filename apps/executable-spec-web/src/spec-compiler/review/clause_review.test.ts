import assert from "node:assert/strict";
import test from "node:test";

import { buildClauseReviewItems, computeClauseReviewStatus } from "./clause_review.ts";

const SAMPLE_MARKDOWN = `# 路基压实度（土质）
规范来源：JTG F80/1-2017
条款号：4.2.1
版本：v1
分类：subgrade
检测项：compaction

## 输入参数
- massHoleSand | number | g | 灌入砂质量
- volumeSand | number | cm3 | 标定体积

## 输出参数
- compactionDegree

## 计算步骤
1. wetDensity = massHoleSand / volumeSand
2. compactionDegree = wetDensity * 100

## 判定规则
- compactionDegree >= 93 | 压实度必须 >= 93%

## 签字要求
- lab
- supervision

## 依赖
- none
`;

test("buildClauseReviewItems: 生成高风险 required + 中风险建议项", () => {
  const items = buildClauseReviewItems(SAMPLE_MARKDOWN);
  assert.equal(items.filter((item) => item.riskLevel === "high" && item.required).length, 5);
  assert.equal(items.filter((item) => item.riskLevel === "medium").length, 3);
});

test("computeClauseReviewStatus: 高风险未确认会被统计", () => {
  const items = buildClauseReviewItems(SAMPLE_MARKDOWN);
  items[0]!.confirmed = true;
  items[1]!.confirmed = true;

  const status = computeClauseReviewStatus(items);
  assert.equal(status.summary.requiredTotal, 5);
  assert.equal(status.summary.requiredConfirmed, 2);
  assert.equal(status.summary.highRequiredUnconfirmed, 3);
  assert.equal(status.allRequiredConfirmed, false);
});
