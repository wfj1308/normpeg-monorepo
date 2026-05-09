import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { cloneRuleConfig, defaultRuleConfig } from "../calibration/rule_config.ts";
import { detectDecisionShift } from "./decision_shift_detector.ts";
import { loadRegressionCasesFromDir, loadRuleConfigFromFile } from "./regression_case.ts";
import { runRegressionSuite } from "./regression_suite.ts";

const ROOT = process.cwd();
const CASES_DIR = path.resolve(ROOT, "apps/executable-spec-web/examples/regression");
const CONFIG_PATH = path.resolve(ROOT, "config/pre_register_rule_config.json");

test("runRegressionSuite: 默认规则配置下 3/3 通过", () => {
  const cases = loadRegressionCasesFromDir(CASES_DIR);
  const config = loadRuleConfigFromFile(CONFIG_PATH);
  const suite = runRegressionSuite(cases, config);
  assert.equal(suite.total, 3);
  assert.equal(suite.failed, 0);
});

test("runRegressionSuite + detectDecisionShift: OCR_TEXT_NOISY 提升为 high 后触发样本漂移", () => {
  const cases = loadRegressionCasesFromDir(CASES_DIR);
  const baseline = runRegressionSuite(cases, loadRuleConfigFromFile(CONFIG_PATH));

  const changed = cloneRuleConfig(defaultRuleConfig);
  changed.risk.mediumRiskWarnings = changed.risk.mediumRiskWarnings.filter((item) => item !== "OCR_TEXT_NOISY");
  changed.risk.highRiskWarnings.push("OCR_TEXT_NOISY");
  const suite = runRegressionSuite(cases, changed);

  assert.equal(suite.failed >= 1, true);
  const alerts = detectDecisionShift(baseline, suite);
  assert.equal(alerts.some((item) => item.includes("warning -> blocked")), true);
});
