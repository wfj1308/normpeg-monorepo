import type { RuleConfig } from "../calibration/rule_config.ts";
import type { RegressionCase } from "./regression_case.ts";
import { runRegressionCase, type RegressionResult } from "./regression_runner.ts";

export interface RegressionSuiteResult {
  total: number;
  passed: number;
  failed: number;
  results: RegressionResult[];
}

export function runRegressionSuite(cases: RegressionCase[], ruleConfig: RuleConfig): RegressionSuiteResult {
  const results = cases.map((caseItem) => runRegressionCase(caseItem, ruleConfig));
  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}
