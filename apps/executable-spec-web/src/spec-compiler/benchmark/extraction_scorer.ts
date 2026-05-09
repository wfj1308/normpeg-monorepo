import type { ExtractionQualityMetrics } from "../pdf_to_markdown/types.ts";
import { formulaAliasMap } from "../pdf_to_markdown/formula_extractor.ts";
import type { ExtractionBenchmarkCase } from "./extraction_benchmark_case.ts";
import type { ExtractionRunResult } from "./extraction_benchmark_runner.ts";

export interface ExtractionBenchmarkMetrics {
  clauseMatched: boolean;
  clauseConfidence: "high" | "medium" | "low";
  formulasExpected: number;
  formulasFullMatched: number;
  formulasPartialMatched: number;
  inputsExpected: number;
  inputsMatched: number;
  rulesExpected: number;
  rulesMatched: number;
  warningsCount: number;
  score: {
    clause: number;
    formula: number;
    tableInputs: number;
    rules: number;
    overall: number;
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeExpression(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "").replace(/%/g, "");
}

function canonicalVariableName(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }
  const aliasEntries = Object.entries(formulaAliasMap);
  for (const [term, alias] of aliasEntries) {
    if (normalized.includes(normalizeText(term))) {
      return normalizeText(alias);
    }
  }
  return normalized;
}

function normalizeNumericLike(value: string | number): string {
  if (typeof value === "number") {
    return String(value);
  }
  const raw = value.trim();
  const num = Number(raw);
  if (!Number.isNaN(num) && raw !== "") {
    return String(num);
  }
  return raw.toLowerCase();
}

function matchFormula(
  expected: NonNullable<ExtractionBenchmarkCase["expected"]["formulas"]>[number],
  actual: ExtractionRunResult["extracted"]["formulaCandidates"][number],
): "full" | "partial" | "none" {
  const expectedVar = canonicalVariableName(expected.leftVar);
  const actualVar = canonicalVariableName(actual.leftVar);
  const leftMatched = expectedVar && actualVar ? expectedVar === actualVar : normalizeText(expected.leftVar) === normalizeText(actual.leftVar);

  if (expected.completeness === "partial" && actual.completeness === "partial") {
    return leftMatched ? "partial" : "none";
  }
  if (expected.completeness === "full" && actual.completeness === "full") {
    const expectedExpression = normalizeExpression(expected.expression ?? "");
    const actualExpression = normalizeExpression(actual.expression ?? "");
    const expressionExactMatched = Boolean(expectedExpression) && expectedExpression === actualExpression;
    const expressionOverlapMatched =
      Boolean(expectedExpression) &&
      Boolean(actualExpression) &&
      (actualExpression.includes(expectedExpression) || expectedExpression.includes(actualExpression));

    if (!expectedExpression && leftMatched) {
      return "full";
    }
    if (leftMatched && expressionExactMatched) {
      return "full";
    }
    if ((leftMatched && expressionOverlapMatched) || (!leftMatched && expressionExactMatched)) {
      return "partial";
    }
  }
  return "none";
}

function calculateOverallScore(scores: Array<number>): number {
  if (scores.length === 0) {
    return 0;
  }
  const sum = scores.reduce((acc, item) => acc + item, 0);
  return Number((sum / scores.length).toFixed(4));
}

function toCaseInsensitiveSet(values: string[]): Set<string> {
  return new Set(values.map((item) => normalizeText(item)));
}

function scoreInputs(
  expected: NonNullable<ExtractionBenchmarkCase["expected"]["inputs"]>,
  actual: ExtractionRunResult["extracted"]["inputs"],
): number {
  if (expected.length === 0) {
    return 1;
  }
  const actualNames = toCaseInsensitiveSet(actual.map((item) => canonicalVariableName(item.name)));
  let matched = 0;
  for (const item of expected) {
    if (actualNames.has(canonicalVariableName(item.name))) {
      matched += 1;
    }
  }
  return Number((matched / expected.length).toFixed(4));
}

function scoreRules(
  expected: NonNullable<ExtractionBenchmarkCase["expected"]["rules"]>,
  actual: ExtractionRunResult["extracted"]["rules"],
): { matched: number; score: number } {
  if (expected.length === 0) {
    return { matched: 0, score: 1 };
  }
  let matched = 0;
  for (const rule of expected) {
    const found = actual.some(
      (item) =>
        canonicalVariableName(item.field) === canonicalVariableName(rule.field) &&
        item.operator === (rule.operator as any) &&
        normalizeNumericLike(item.value) === normalizeNumericLike(rule.value),
    );
    if (found) {
      matched += 1;
    }
  }
  return {
    matched,
    score: Number((matched / expected.length).toFixed(4)),
  };
}

export function scoreExtractionResult(
  caseItem: ExtractionBenchmarkCase,
  actualResult: ExtractionRunResult,
): ExtractionBenchmarkMetrics {
  const quality: ExtractionQualityMetrics = actualResult.metrics;

  const clauseExpected = caseItem.expected.primaryClause ?? null;
  const clauseMatched = clauseExpected ? normalizeText(clauseExpected) === normalizeText(actualResult.extracted.clause) : true;
  const clauseScore = clauseMatched ? 1 : 0;

  const expectedFormulas = caseItem.expected.formulas ?? [];
  let formulasFullMatched = 0;
  let formulasPartialMatched = 0;
  for (const expected of expectedFormulas) {
    const rankedMatches = actualResult.extracted.formulaCandidates
      .map((actual) => matchFormula(expected, actual))
      .sort((a, b) => (a === "full" ? 2 : a === "partial" ? 1 : 0) - (b === "full" ? 2 : b === "partial" ? 1 : 0));
    const best = rankedMatches[rankedMatches.length - 1];
    if (best === "full") {
      formulasFullMatched += 1;
    } else if (best === "partial") {
      formulasPartialMatched += 1;
    }
  }
  const formulasExpected = expectedFormulas.length;
  const formulaScore =
    formulasExpected === 0
      ? 1
      : Number(((formulasFullMatched + formulasPartialMatched * 0.5) / formulasExpected).toFixed(4));

  const expectedInputs = caseItem.expected.inputs ?? [];
  const inputsScore = scoreInputs(expectedInputs, actualResult.extracted.inputs);
  const inputsMatched =
    expectedInputs.length === 0 ? 0 : Math.round(inputsScore * expectedInputs.length);

  const expectedRules = caseItem.expected.rules ?? [];
  const ruleScored = scoreRules(expectedRules, actualResult.extracted.rules);

  const overall = calculateOverallScore([clauseScore, formulaScore, inputsScore, ruleScored.score]);

  return {
    clauseMatched,
    clauseConfidence: quality.clauseConfidence,
    formulasExpected,
    formulasFullMatched,
    formulasPartialMatched,
    inputsExpected: expectedInputs.length,
    inputsMatched,
    rulesExpected: expectedRules.length,
    rulesMatched: ruleScored.matched,
    warningsCount: quality.warningsCount,
    score: {
      clause: clauseScore,
      formula: formulaScore,
      tableInputs: inputsScore,
      rules: ruleScored.score,
      overall,
    },
  };
}
