import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePreRegisterGuard } from "./pre_register_guard.ts";

const BASE_MARKDOWN = `# 路基压实度（土质）
规范来源：JTG F80/1-2017
条款号：4.2.1
## 判定规则
- compactionDegree >= 93 | 压实度必须 ≥ 93%
`;

test("evaluatePreRegisterGuard: blocking 时阻断注册", () => {
  const result = evaluatePreRegisterGuard({
    warnings: [{ code: "CLAUSE_AMBIGUOUS", message: "条款号识别不稳定" }],
    originalDraftMarkdown: BASE_MARKDOWN,
    editedMarkdown: BASE_MARKDOWN,
    clauseReviewItems: [
      {
        id: "clause_source",
        title: "规范来源与条款号已核对",
        message: "请确认",
        riskLevel: "high",
        required: true,
        confirmed: false,
      },
    ],
  });

  assert.equal(result.blocked, true);
  if (result.blocked) {
    assert.equal(result.error, "PRE_REGISTER_BLOCKED");
    assert.ok(result.reasons.length > 0);
  }
});

test("evaluatePreRegisterGuard: warning 时允许继续", () => {
  const edited = BASE_MARKDOWN.replace(">= 93", ">= 95");
  const result = evaluatePreRegisterGuard({
    warnings: [{ code: "INPUTS_INFERRED", message: "输入参数来自推断" }],
    originalDraftMarkdown: BASE_MARKDOWN,
    editedMarkdown: edited,
    clauseReviewItems: [
      {
        id: "clause_source",
        title: "规范来源与条款号已核对",
        message: "请确认",
        riskLevel: "high",
        required: true,
        confirmed: true,
      },
    ],
  });

  assert.equal(result.blocked, false);
  assert.equal(result.preRegisterReview.finalDecision.status, "warning");
  assert.equal(result.preRegisterReview.finalDecision.canRegister, true);
});
