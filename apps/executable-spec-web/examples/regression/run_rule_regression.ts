import path from "node:path";

import type { RuleConfig } from "../../src/spec-compiler/calibration/rule_config.ts";
import { cloneRuleConfig, defaultRuleConfig } from "../../src/spec-compiler/calibration/rule_config.ts";
import { detectDecisionShift } from "../../src/spec-compiler/regression/decision_shift_detector.ts";
import { loadRegressionCasesFromDir, loadRuleConfigFromFile } from "../../src/spec-compiler/regression/regression_case.ts";
import { runRegressionSuite } from "../../src/spec-compiler/regression/regression_suite.ts";

type Scenario = "default" | "ocr_noisy_high" | "inputs_high";

function parseScenario(argv: string[]): Scenario {
  const raw = argv.find((arg) => arg.startsWith("--scenario="))?.split("=")[1]?.trim();
  if (raw === "ocr_noisy_high" || raw === "inputs_high") {
    return raw;
  }
  return "default";
}

function withScenario(base: RuleConfig, scenario: Scenario): RuleConfig {
  const next = cloneRuleConfig(base);

  if (scenario === "ocr_noisy_high") {
    next.risk.mediumRiskWarnings = next.risk.mediumRiskWarnings.filter((item) => item !== "OCR_TEXT_NOISY");
    if (!next.risk.highRiskWarnings.includes("OCR_TEXT_NOISY")) {
      next.risk.highRiskWarnings.push("OCR_TEXT_NOISY");
    }
  }

  if (scenario === "inputs_high") {
    next.risk.mediumRiskWarnings = next.risk.mediumRiskWarnings.filter((item) => item !== "INPUTS_INFERRED");
    if (!next.risk.highRiskWarnings.includes("INPUTS_INFERRED")) {
      next.risk.highRiskWarnings.push("INPUTS_INFERRED");
    }
  }

  return next;
}

function printSuiteResult(prefix: string, suite: ReturnType<typeof runRegressionSuite>): void {
  console.log(prefix);
  console.log(`- total: ${suite.total}`);
  console.log(`- passed: ${suite.passed}`);
  console.log(`- failed: ${suite.failed}`);
  if (suite.failed > 0) {
    console.log("");
    console.log("Failed case:");
    for (const item of suite.results.filter((entry) => !entry.passed)) {
      console.log(`- ${item.caseId}`);
      console.log(`  expected: ${item.expectedStatus}`);
      console.log(`  actual: ${item.actualStatus}`);
      for (const detail of item.details) {
        console.log(`  detail: ${detail}`);
      }
    }
  }
}

export function runRuleRegression(): void {
  const root = process.cwd();
  const scenario = parseScenario(process.argv.slice(2));
  const configPath = path.resolve(root, "config/pre_register_rule_config.json");
  const casesDir = path.resolve(root, "apps/executable-spec-web/examples/regression");

  const fileConfig = loadRuleConfigFromFile(configPath);
  const scenarioConfig = withScenario(fileConfig, scenario);
  const cases = loadRegressionCasesFromDir(casesDir);

  const baselineSuite = runRegressionSuite(cases, defaultRuleConfig);
  const currentSuite = runRegressionSuite(cases, scenarioConfig);
  const shifts = detectDecisionShift(baselineSuite, currentSuite);

  printSuiteResult("Regression Suite Result", currentSuite);
  if (shifts.length > 0) {
    console.log("");
    console.log("Decision Shift Alerts:");
    for (const item of shifts) {
      console.log(`- ${item}`);
    }
  }
  console.log("");
  console.log(`scenario: ${scenario}`);
}

runRuleRegression();
