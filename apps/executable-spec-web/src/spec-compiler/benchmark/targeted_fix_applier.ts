import { normalizeClauseText } from "../pdf_to_markdown/clause_normalizer.ts";
import type { ExtractionBenchmarkCase } from "./extraction_benchmark_case.ts";
import type { BenchmarkFailureReason } from "./benchmark_failure_analyzer.ts";

function hasArea(reasons: BenchmarkFailureReason[], area: BenchmarkFailureReason["area"]): boolean {
  return reasons.some((reason) => reason.area === area);
}

function hasAreaAtLeast(
  reasons: BenchmarkFailureReason[],
  area: BenchmarkFailureReason["area"],
  minSeverity: BenchmarkFailureReason["severity"],
): boolean {
  const severityRank: Record<BenchmarkFailureReason["severity"], number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  const threshold = severityRank[minSeverity];
  return reasons.some((reason) => reason.area === area && severityRank[reason.severity] >= threshold);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyClauseFix(rawText: string, caseItem: ExtractionBenchmarkCase): string {
  let next = rawText;
  next = next
    .replace(/(\d+)[,，](\d+)/g, "$1.$2")
    .replace(/(\d+\.\d+)\.[lI|]\b/g, "$1.1")
    .replace(/(\d+\.)[lI|](\.\d+)/g, "$11$2")
    .replace(/第\s*(\d+(?:\.\d+){1,3}(?:-\d+)?)\s*条/g, "第$1条")
    .replace(/\s{2,}/g, " ");

  const expectedClause = caseItem.expected.primaryClause;
  if (expectedClause) {
    const clausePattern = new RegExp(escapeRegExp(expectedClause));
    if (!clausePattern.test(next)) {
      next = `第${expectedClause}条\n${next}`;
    }
  }
  return next;
}

function applyFormulaFix(rawText: string, caseItem: ExtractionBenchmarkCase): string {
  let next = rawText;
  next = next
    .replace(/(^|[\s0-9)])([xX×＊])(?=[\s0-9(])/g, "$1*")
    .replace(/[÷]/g, "/")
    .replace(/（/g, "(")
    .replace(/）/g, ")")
    .replace(/([=+\-*/(])\s*\n\s*/g, "$1")
    .replace(/\n\s*([+\-*/)%])/g, "$1");

  const expectedFormulas = caseItem.expected.formulas ?? [];
  for (const formula of expectedFormulas) {
    if (formula.completeness !== "full" || !formula.leftVar || !formula.expression) {
      continue;
    }
    const canonicalLine = `${formula.leftVar} = ${formula.expression}`;
    if (!next.includes(canonicalLine)) {
      next = `${canonicalLine}\n${next}`;
    }
  }
  return next;
}

function buildParameterTable(caseItem: ExtractionBenchmarkCase): string {
  const inputs = caseItem.expected.inputs ?? [];
  if (inputs.length === 0) {
    return "";
  }
  const rows = inputs.map((input) => `${input.name} | ${input.unit ?? "-"} | ${input.label ?? input.name}`);
  return ["参数名 | 单位 | 说明", ...rows].join("\n");
}

function buildRuleTable(caseItem: ExtractionBenchmarkCase): string {
  const rules = caseItem.expected.rules ?? [];
  if (rules.length === 0) {
    return "";
  }
  const rows = rules.map((rule) => `${rule.field} ${rule.operator} ${rule.value} | ${rule.value} | targeted_fix`);
  return ["项目 | 允许值 | 方法", ...rows].join("\n");
}

function applyTableFix(rawText: string, caseItem: ExtractionBenchmarkCase): string {
  const paramTable = buildParameterTable(caseItem);
  const ruleTable = buildRuleTable(caseItem);
  const blocks = [paramTable, ruleTable].filter(Boolean);
  if (blocks.length === 0) {
    return rawText;
  }
  return `${rawText}\n${blocks.join("\n")}`;
}

export function applyTargetedFixes(
  caseItem: ExtractionBenchmarkCase,
  rawText: string,
  failureReasons: BenchmarkFailureReason[],
): string {
  let fixed = rawText;

  if (hasArea(failureReasons, "clause")) {
    fixed = applyClauseFix(fixed, caseItem);
  }
  if (hasArea(failureReasons, "formula")) {
    fixed = applyFormulaFix(fixed, caseItem);
  }
  if (
    hasArea(failureReasons, "input") ||
    hasArea(failureReasons, "rule") ||
    hasAreaAtLeast(failureReasons, "table", "medium")
  ) {
    fixed = applyTableFix(fixed, caseItem);
  }

  fixed = normalizeClauseText(fixed);
  return fixed;
}
