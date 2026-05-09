import fs from "node:fs";
import path from "node:path";

import { evaluateGateRequest } from "../../server/services/gate_evaluate_service.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";

export type SpuRegressionCaseKind = "pass" | "fail" | "boundary";

export interface SpuRegressionOutputCheck {
  field: string;
  operator: "eq" | "gte" | "lte" | "approx";
  value: number;
  tolerance?: number;
}

export interface SpuRegressionExpected {
  status: "PASS" | "FAIL";
  result?: {
    outcome?: "PASS" | "FAIL" | "BLOCK";
    gateStatus?: "PASS" | "FAIL" | "BLOCK";
    passed?: boolean;
  };
  explanationIncludes?: string[];
  matchedRules?: Array<{
    ruleId: string;
    passed: boolean;
  }>;
  outputChecks?: SpuRegressionOutputCheck[];
}

export interface SpuRegressionCase {
  caseId: string;
  title?: string;
  inputs: Record<string, number>;
  expected: SpuRegressionExpected;
}

export interface SpuRegressionSuite {
  spuId: string;
  passCases: SpuRegressionCase[];
  failCases: SpuRegressionCase[];
  boundaryCases: SpuRegressionCase[];
}

export interface SpuRegressionCaseResult {
  spuId: string;
  caseId: string;
  kind: SpuRegressionCaseKind;
  title: string;
  passed: boolean;
  message: string;
  expectedStatus: "PASS" | "FAIL";
  actualStatus: "PASS" | "FAIL" | null;
  failedRuleIds: string[];
}

export interface SpuRegressionCoverage {
  registeredSpuIds: string[];
  suiteSpuIds: string[];
  missingSuiteSpuIds: string[];
  unknownSuiteSpuIds: string[];
}

export interface SpuRegressionSummary {
  total: number;
  passed: number;
  failed: number;
  byKind: Record<SpuRegressionCaseKind, { total: number; failed: number }>;
}

export interface SpuRegressionReport {
  coverage: SpuRegressionCoverage;
  summary: SpuRegressionSummary;
  caseResults: SpuRegressionCaseResult[];
}

function defaultCasesDir(): string {
  return path.resolve(process.cwd(), "tests/spu_regression/cases");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asCaseList(raw: unknown): SpuRegressionCase[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const cases: SpuRegressionCase[] = [];
  for (const item of raw) {
    const root = asRecord(item);
    const expectedRoot = asRecord(root.expected);
    const resultRoot = asRecord(expectedRoot.result);
    const inputs = asRecord(root.inputs);

    cases.push({
      caseId: String(root.caseId ?? "").trim(),
      title: typeof root.title === "string" ? root.title : undefined,
      inputs: Object.fromEntries(
        Object.entries(inputs).filter(([, value]) => typeof value === "number" && Number.isFinite(value)),
      ) as Record<string, number>,
      expected: {
        status: expectedRoot.status === "FAIL" ? "FAIL" : "PASS",
        result: {
          outcome:
            resultRoot.outcome === "FAIL"
              ? "FAIL"
              : resultRoot.outcome === "BLOCK"
                ? "BLOCK"
                : resultRoot.outcome === "PASS"
                  ? "PASS"
                  : undefined,
          gateStatus:
            resultRoot.gateStatus === "FAIL"
              ? "FAIL"
              : resultRoot.gateStatus === "BLOCK"
                ? "BLOCK"
                : resultRoot.gateStatus === "PASS"
                  ? "PASS"
                  : undefined,
          passed: typeof resultRoot.passed === "boolean" ? resultRoot.passed : undefined,
        },
        explanationIncludes: Array.isArray(expectedRoot.explanationIncludes)
          ? expectedRoot.explanationIncludes.map((value) => String(value))
          : [],
        matchedRules: Array.isArray(expectedRoot.matchedRules)
          ? expectedRoot.matchedRules.map((value) => {
              const rule = asRecord(value);
              return {
                ruleId: String(rule.ruleId ?? "").trim(),
                passed: Boolean(rule.passed),
              };
            })
          : [],
        outputChecks: Array.isArray(expectedRoot.outputChecks)
          ? expectedRoot.outputChecks.map((value) => {
              const check = asRecord(value);
              const operatorValue = String(check.operator ?? "").trim();
              const operator: SpuRegressionOutputCheck["operator"] =
                operatorValue === "eq" || operatorValue === "gte" || operatorValue === "lte" || operatorValue === "approx"
                  ? operatorValue
                  : "eq";
              return {
                field: String(check.field ?? "").trim(),
                operator,
                value: Number(check.value ?? NaN),
                tolerance:
                  typeof check.tolerance === "number" && Number.isFinite(check.tolerance) ? check.tolerance : undefined,
              };
            })
          : [],
      },
    });
  }
  return cases;
}

function parseSuite(raw: unknown): SpuRegressionSuite {
  const root = asRecord(raw);
  return {
    spuId: String(root.spuId ?? "").trim(),
    passCases: asCaseList(root.passCases),
    failCases: asCaseList(root.failCases),
    boundaryCases: asCaseList(root.boundaryCases),
  };
}

export function loadSpuRegressionSuites(casesDir: string = defaultCasesDir()): SpuRegressionSuite[] {
  if (!fs.existsSync(casesDir)) {
    return [];
  }
  const files = fs
    .readdirSync(casesDir)
    .filter((file) => file.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "en"));

  return files.map((file) => {
    const filePath = path.resolve(casesDir, file);
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return parseSuite(raw);
  });
}

function caseTitle(kind: SpuRegressionCaseKind, item: SpuRegressionCase): string {
  return item.title?.trim() || `${kind}:${item.caseId}`;
}

function ensureCaseShape(spuId: string, kind: SpuRegressionCaseKind, item: SpuRegressionCase): void {
  if (!item.caseId) {
    throw new Error(`${spuId} ${kind} has empty caseId`);
  }
  if (Object.keys(item.inputs).length === 0) {
    throw new Error(`${spuId} ${kind}/${item.caseId} has empty inputs`);
  }
  if (item.expected.status !== "PASS" && item.expected.status !== "FAIL") {
    throw new Error(`${spuId} ${kind}/${item.caseId} has invalid expected.status`);
  }
}

function createIsolatedContainer(service: PlatformService, spuId: string, seed: number): string {
  const station = `K98+${String(100 + seed).padStart(3, "0")}`;
  const slot = service.importSlot({
    station,
    chainage: 98100 + seed,
    x: 120 + seed * 0.01,
    y: 60 + seed * 0.01,
    elevation: 130 + seed * 0.01,
    alignment: "SPU-REGRESSION",
    sourceFile: "tests/spu_regression",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "regression-lab",
    supervisor: "regression-supervision",
    autoBindSpuIds: [spuId],
  });
  return container.containerId;
}

function formatFailedRules(responseRules: Array<{ ruleId: string; passed: boolean }>): string[] {
  return responseRules.filter((item) => !item.passed).map((item) => item.ruleId);
}

function assertOutputCheck(
  actualOutputs: Record<string, unknown>,
  check: SpuRegressionOutputCheck,
  ctx: string,
): void {
  const actual = actualOutputs[check.field];
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    throw new Error(`${ctx} output ${check.field} is not a finite number`);
  }
  if (!Number.isFinite(check.value)) {
    throw new Error(`${ctx} output check ${check.field} has invalid expected value`);
  }
  if (check.operator === "eq" && actual !== check.value) {
    throw new Error(`${ctx} output ${check.field} expected eq ${check.value}, got ${actual}`);
  }
  if (check.operator === "gte" && actual < check.value) {
    throw new Error(`${ctx} output ${check.field} expected gte ${check.value}, got ${actual}`);
  }
  if (check.operator === "lte" && actual > check.value) {
    throw new Error(`${ctx} output ${check.field} expected lte ${check.value}, got ${actual}`);
  }
  if (check.operator === "approx") {
    const tolerance = Number.isFinite(check.tolerance) ? Number(check.tolerance) : 1e-6;
    if (Math.abs(actual - check.value) > tolerance) {
      throw new Error(
        `${ctx} output ${check.field} expected approx ${check.value} ± ${tolerance}, got ${actual}`,
      );
    }
  }
}

function assertExpectedResponse(
  kind: SpuRegressionCaseKind,
  spuId: string,
  item: SpuRegressionCase,
  response: ReturnType<typeof evaluateGateRequest>,
): void {
  const ctx = `[${spuId}] ${kind}/${item.caseId}`;
  if (response.status !== item.expected.status) {
    throw new Error(`${ctx} expected status=${item.expected.status}, got ${response.status}`);
  }

  const expectedPassed = item.expected.result?.passed ?? (item.expected.status === "PASS");
  if (response.result.passed !== expectedPassed) {
    throw new Error(`${ctx} expected result.passed=${String(expectedPassed)}, got ${String(response.result.passed)}`);
  }

  const expectedOutcome = item.expected.result?.outcome ?? item.expected.status;
  if (response.result.outcome !== expectedOutcome) {
    throw new Error(`${ctx} expected outcome=${expectedOutcome}, got ${response.result.outcome}`);
  }

  const expectedGateStatus = item.expected.result?.gateStatus ?? item.expected.status;
  if (response.result.gateStatus !== expectedGateStatus) {
    throw new Error(`${ctx} expected gateStatus=${expectedGateStatus}, got ${response.result.gateStatus}`);
  }

  for (const keyword of item.expected.explanationIncludes ?? []) {
    if (!response.explanation.includes(keyword)) {
      throw new Error(`${ctx} explanation missing keyword: ${keyword}`);
    }
  }

  for (const expectedRule of item.expected.matchedRules ?? []) {
    const actualRule = response.matchedRules.find((itemRule) => itemRule.ruleId === expectedRule.ruleId);
    if (!actualRule) {
      throw new Error(`${ctx} expected matched rule not found: ${expectedRule.ruleId}`);
    }
    if (actualRule.passed !== expectedRule.passed) {
      throw new Error(
        `${ctx} expected rule ${expectedRule.ruleId} passed=${String(expectedRule.passed)}, got ${String(actualRule.passed)}`,
      );
    }
  }

  for (const outputCheck of item.expected.outputChecks ?? []) {
    assertOutputCheck(response.result.outputs, outputCheck, ctx);
  }
}

function runCaseList(
  service: PlatformService,
  spuId: string,
  kind: SpuRegressionCaseKind,
  list: SpuRegressionCase[],
  seedStart: number,
): { results: SpuRegressionCaseResult[]; nextSeed: number } {
  const results: SpuRegressionCaseResult[] = [];
  let seed = seedStart;

  for (const item of list) {
    let actualStatus: "PASS" | "FAIL" | null = null;
    let failedRuleIds: string[] = [];
    const title = caseTitle(kind, item);

    try {
      ensureCaseShape(spuId, kind, item);
      const containerId = createIsolatedContainer(service, spuId, seed);
      seed += 1;

      const response = evaluateGateRequest(service, {
        spuId,
        containerId,
        inputs: item.inputs,
      });
      actualStatus = response.status;
      failedRuleIds = formatFailedRules(response.matchedRules);
      assertExpectedResponse(kind, spuId, item, response);

      results.push({
        spuId,
        caseId: item.caseId,
        kind,
        title,
        passed: true,
        message: "ok",
        expectedStatus: item.expected.status,
        actualStatus,
        failedRuleIds,
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      results.push({
        spuId,
        caseId: item.caseId || "<missing-case-id>",
        kind,
        title,
        passed: false,
        message,
        expectedStatus: item.expected.status,
        actualStatus,
        failedRuleIds,
      });
    }
  }

  return {
    results,
    nextSeed: seed,
  };
}

function buildSummary(results: SpuRegressionCaseResult[]): SpuRegressionSummary {
  const byKind: Record<SpuRegressionCaseKind, { total: number; failed: number }> = {
    pass: { total: 0, failed: 0 },
    fail: { total: 0, failed: 0 },
    boundary: { total: 0, failed: 0 },
  };
  for (const result of results) {
    byKind[result.kind].total += 1;
    if (!result.passed) {
      byKind[result.kind].failed += 1;
    }
  }
  const total = results.length;
  const failed = results.filter((item) => !item.passed).length;
  return {
    total,
    passed: total - failed,
    failed,
    byKind,
  };
}

export function executeSpuRegressionSuites(
  options: {
    casesDir?: string;
    service?: PlatformService;
    suites?: SpuRegressionSuite[];
  } = {},
): SpuRegressionReport {
  const service = options.service ?? new PlatformService();
  const suites = options.suites ?? loadSpuRegressionSuites(options.casesDir);

  const registeredSpuIds = service.getRegistry().map((item) => item.spuId).sort((a, b) => a.localeCompare(b, "en"));
  const suiteSpuIds = suites.map((item) => item.spuId).sort((a, b) => a.localeCompare(b, "en"));
  const suiteSpuSet = new Set(suiteSpuIds);
  const registeredSpuSet = new Set(registeredSpuIds);

  const missingSuiteSpuIds = registeredSpuIds.filter((spuId) => !suiteSpuSet.has(spuId));
  const unknownSuiteSpuIds = suiteSpuIds.filter((spuId) => !registeredSpuSet.has(spuId));

  const caseResults: SpuRegressionCaseResult[] = [];
  let seed = 0;

  for (const suite of suites) {
    if (!suite.spuId) {
      caseResults.push({
        spuId: "<missing-spu-id>",
        caseId: "<suite>",
        kind: "boundary",
        title: "invalid suite",
        passed: false,
        message: "suite spuId is required",
        expectedStatus: "PASS",
        actualStatus: null,
        failedRuleIds: [],
      });
      continue;
    }

    if (!registeredSpuSet.has(suite.spuId)) {
      caseResults.push({
        spuId: suite.spuId,
        caseId: "<suite>",
        kind: "boundary",
        title: "unknown suite spu",
        passed: false,
        message: `suite spuId is not registered: ${suite.spuId}`,
        expectedStatus: "PASS",
        actualStatus: null,
        failedRuleIds: [],
      });
      continue;
    }

    if (suite.passCases.length === 0 || suite.failCases.length === 0 || suite.boundaryCases.length === 0) {
      caseResults.push({
        spuId: suite.spuId,
        caseId: "<suite>",
        kind: "boundary",
        title: "missing case category",
        passed: false,
        message: "suite must contain passCases/failCases/boundaryCases",
        expectedStatus: "PASS",
        actualStatus: null,
        failedRuleIds: [],
      });
    }

    const passRun = runCaseList(service, suite.spuId, "pass", suite.passCases, seed);
    seed = passRun.nextSeed;
    caseResults.push(...passRun.results);

    const failRun = runCaseList(service, suite.spuId, "fail", suite.failCases, seed);
    seed = failRun.nextSeed;
    caseResults.push(...failRun.results);

    const boundaryRun = runCaseList(service, suite.spuId, "boundary", suite.boundaryCases, seed);
    seed = boundaryRun.nextSeed;
    caseResults.push(...boundaryRun.results);
  }

  return {
    coverage: {
      registeredSpuIds,
      suiteSpuIds,
      missingSuiteSpuIds,
      unknownSuiteSpuIds,
    },
    summary: buildSummary(caseResults),
    caseResults,
  };
}

export function formatSpuRegressionFailures(report: SpuRegressionReport): string {
  const lines: string[] = [];

  if (report.coverage.missingSuiteSpuIds.length > 0) {
    lines.push(`Missing suites for registered SPUs: ${report.coverage.missingSuiteSpuIds.join(", ")}`);
  }
  if (report.coverage.unknownSuiteSpuIds.length > 0) {
    lines.push(`Unknown suite SPUs: ${report.coverage.unknownSuiteSpuIds.join(", ")}`);
  }

  for (const result of report.caseResults.filter((item) => !item.passed)) {
    const failedRules = result.failedRuleIds.length > 0 ? ` failedRules=${result.failedRuleIds.join("|")}` : "";
    lines.push(
      `[${result.spuId}] ${result.kind}/${result.caseId} expected=${result.expectedStatus} actual=${String(result.actualStatus)}${failedRules} :: ${result.message}`,
    );
  }

  return lines.join("\n");
}
