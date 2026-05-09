import assert from "node:assert/strict";
import test from "node:test";

import { evaluateRiskRegisterGuard } from "./risk_register_guard.ts";

test("evaluateRiskRegisterGuard: 有 blocking 风险时返回 RISK_REVIEW_BLOCKED", () => {
  const result = evaluateRiskRegisterGuard([
    {
      code: "FORMULA_PARTIAL",
      message: "公式不完整",
    },
  ]);

  assert.equal(result.blocked, true);
  if (result.blocked) {
    assert.equal(result.error, "RISK_REVIEW_BLOCKED");
    assert.equal(result.riskReview.canRegister, false);
  }
});

test("evaluateRiskRegisterGuard: 仅中低风险时允许继续", () => {
  const result = evaluateRiskRegisterGuard([
    {
      code: "INPUTS_INFERRED",
      message: "输入来自推断",
    },
    {
      code: "OCR_USED",
      message: "使用 OCR",
    },
  ]);

  assert.equal(result.blocked, false);
  assert.equal(result.riskReview.canRegister, true);
  assert.ok(result.riskReview.summary.confirmRequired > 0);
});
