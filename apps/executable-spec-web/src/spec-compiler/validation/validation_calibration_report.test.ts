import assert from "node:assert/strict";
import test from "node:test";

import { buildValidationCalibrationReport } from "./validation_calibration_report.ts";
import type { RealPdfValidationResult } from "./real_pdf_validation_runner.ts";

function mockResult(
  status: "blocked" | "warning" | "ready",
  warningCodes: string[],
  blockingReasons: string[],
  warningReasons: string[],
): RealPdfValidationResult {
  return {
    fileName: `${status}.pdf`,
    extraction: {
      rawTextLength: 100,
      ocrUsed: true,
      warnings: warningCodes.map((code) => ({ code, message: code })),
    },
    draft: {
      originalDraftMarkdown: "",
      editedMarkdown: "",
    },
    riskReview: {
      items: [],
      summary: { high: 0, medium: 0, low: 0, blocking: 0, confirmRequired: 0 },
      canRegister: status !== "blocked",
      reviewMessage: "",
    },
    diffReview: {
      hasChanges: false,
      summary: { added: 0, removed: 0, modified: 0 },
      sectionChanges: [],
      lineDiffs: [],
    },
    clauseReview: {
      items: [],
      summary: {
        requiredTotal: 0,
        requiredConfirmed: 0,
        highRequiredUnconfirmed: 0,
        mediumUnconfirmed: 0,
        lowUnconfirmed: 0,
      },
      allRequiredConfirmed: true,
    },
    preRegisterDecision: {
      status,
      canRegister: status !== "blocked",
      blockingReasons,
      warningReasons,
      summary: { riskHigh: 0, riskMedium: 0, diffHigh: 0, clausePending: 0 },
    },
    lint: { valid: true, errors: [], warnings: [] },
  };
}

test("buildValidationCalibrationReport: 统计三态与常见原因", () => {
  const report = buildValidationCalibrationReport([
    mockResult("blocked", ["FORMULA_PARTIAL", "OCR_TEXT_NOISY"], ["公式不完整"], []),
    mockResult("warning", ["INPUTS_INFERRED", "OCR_TEXT_NOISY"], [], ["输入推断"]),
    mockResult("ready", ["OCR_USED"], [], []),
  ]);

  assert.equal(report.total, 3);
  assert.equal(report.blocked, 1);
  assert.equal(report.warning, 1);
  assert.equal(report.ready, 1);
  assert.ok(report.commonBlockingReasons.some((item) => item.includes("公式不完整")));
  assert.ok(report.commonWarningReasons.some((item) => item.includes("输入推断")));
  assert.ok(report.ruleAdjustmentSuggestions.length > 0);
});
