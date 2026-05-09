import assert from "node:assert/strict";
import test from "node:test";

import { buildRuleConfigFromCalibrationWithNotes } from "./rule_config_builder.ts";
import { DEFAULT_RULE_CONFIG } from "./rule_config.ts";

test("buildRuleConfigFromCalibration: 根据报告放松部分规则并产出说明", () => {
  const report = {
    total: 3,
    blocked: 3,
    warning: 0,
    ready: 0,
    commonBlockingReasons: ["依赖（高风险条款未确认） (3/3)"],
    commonWarningReasons: [],
    ruleAdjustmentSuggestions: [
      "OCR_TEXT_NOISY 出现频率高，建议保持为 medium，不直接 block。",
      "FORMULA_PARTIAL 高频出现且会影响可编译性，建议保持 high。",
      "INPUTS_INFERRED / RULES_INFERRED 在样本中常见，建议保持 medium + 人工确认。",
    ],
  };

  const result = buildRuleConfigFromCalibrationWithNotes(report, DEFAULT_RULE_CONFIG);
  assert.equal(result.config.risk.mediumRiskWarnings.includes("OCR_TEXT_NOISY"), true);
  assert.equal(result.config.risk.highRiskWarnings.includes("FORMULA_PARTIAL"), true);
  assert.equal(result.config.clause.requiredHighRiskSections.includes("depends_on"), false);
  assert.equal(result.config.clause.optionalMediumRiskSections.includes("depends_on"), true);
  assert.ok(result.notes.length > 0);
});
