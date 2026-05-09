import { buildExtractionQualityMetrics } from "../pdf_to_markdown/quality_metrics.ts";
import { extractSpecFields } from "../pdf_to_markdown/field_extractor.ts";
import type {
  ExtractionQualityMetrics,
  ExtractedSpecFields,
  PDFDraftWarning,
} from "../pdf_to_markdown/types.ts";
import type { ExtractionBenchmarkCase } from "./extraction_benchmark_case.ts";
import {
  scoreExtractionResult,
  type ExtractionBenchmarkMetrics,
} from "./extraction_scorer.ts";

export interface ExtractionRunResult {
  extracted: ExtractedSpecFields;
  warnings: PDFDraftWarning[];
  metrics: ExtractionQualityMetrics;
}

export interface ExtractionBenchmarkCaseResult {
  caseId: string;
  metrics: ExtractionBenchmarkMetrics;
}

export interface ExtractionBenchmarkResult {
  total: number;
  averageScore: number;
  cases: ExtractionBenchmarkCaseResult[];
}

export type ExtractionMode = "baseline" | "improved";
export type ExtractionBenchmarkExtractor = (rawText: string, caseItem: ExtractionBenchmarkCase) => ExtractionRunResult;

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u3000/g, " ").trim();
}

function baselineExtract(caseItem: ExtractionBenchmarkCase): ExtractionRunResult {
  const text = normalizeText(caseItem.rawText);
  const clauseMatch = text.match(/(\d+(?:\.\d+){1,3}(?:-\d+)?)/);
  const formulaLines = text
    .split(/\n|。|；|;/)
    .map((line) => line.trim())
    .filter((line) => line.includes("="));
  const formulaCandidates = formulaLines.map((line, index) => {
    const parts = line.split("=");
    const left = parts[0]?.trim() ?? null;
    const right = parts.slice(1).join("=").trim() || null;
    return {
      originalText: line,
      leftVar: left,
      expression: right,
      completeness: left && right ? ("full" as const) : ("partial" as const),
      index,
    };
  });

  const tableLines = text.split("\n").filter((line) => line.includes("|"));
  const inputRows = tableLines.filter((line) => /参数|输入/.test(line) || /\|/.test(line));
  const ruleRows = text.split(/\n|。/).filter((line) => /(>=|<=|>|<|不小于|不大于)/.test(line));

  const inputs = inputRows.slice(1).map((line, index) => {
    const cols = line.split("|").map((item) => item.trim());
    return {
      name: cols[0] || `input_${index + 1}`,
      type: "number" as const,
      unit: cols[1] || "-",
      label: cols[2] || cols[0] || `input_${index + 1}`,
    };
  });

  const rules = ruleRows
    .map((line) => {
      const match = /([A-Za-z_\u4e00-\u9fa5]{2,30})\s*(>=|<=|>|<)\s*([0-9]+(?:\.[0-9]+)?)/.exec(line);
      if (!match?.[1] || !match[2] || !match[3]) {
        return null;
      }
      return {
        field: match[1],
        operator: match[2] as any,
        value: Number(match[3]),
        message: line.trim(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const calculations = formulaCandidates
    .filter((item) => item.leftVar && item.expression)
    .map((item) => `${item.leftVar} = ${item.expression}`);

  const warnings: PDFDraftWarning[] = [];
  if (!clauseMatch) {
    warnings.push({ code: "CLAUSE_AMBIGUOUS", message: "Clause not found in baseline extraction" });
  }
  if (formulaCandidates.length === 0) {
    warnings.push({ code: "FORMULA_PARTIAL", message: "Formula not found in baseline extraction" });
  }
  if (inputs.length === 0) {
    warnings.push({ code: "INPUTS_INFERRED", message: "Inputs inferred by baseline defaults" });
  }
  if (rules.length === 0) {
    warnings.push({ code: "RULES_INFERRED", message: "Rules inferred by baseline defaults" });
  }

  const extracted: ExtractedSpecFields = {
    title: caseItem.caseId,
    norm: "UNKNOWN_STANDARD",
    clause: clauseMatch?.[1] ?? "4.2.1",
    clauseConfidence: clauseMatch?.[1] ? "medium" : "low",
    clauseCandidates: clauseMatch?.[1] ? [{ clause: clauseMatch[1], index: clauseMatch.index ?? 0 }] : [],
    version: "v1",
    category: caseItem.category === "other" ? "generic" : "subgrade",
    measuredItem: caseItem.category,
    inputs: inputs.length > 0 ? inputs : [{ name: "inputValue", type: "number", unit: "-", label: "default input" }],
    outputs: calculations
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1] ?? "")
      .filter(Boolean),
    calculations: calculations.length > 0 ? calculations : ["resultValue = inputValue"],
    formulaCandidates,
    tableBlocks: [],
    rules: rules.length > 0 ? rules : [{ field: "resultValue", operator: ">=", value: 0, message: "default baseline rule" }],
    signatures: ["lab", "supervision"],
    dependsOn: [],
  };
  const metrics = buildExtractionQualityMetrics(extracted, warnings);
  return { extracted, warnings, metrics };
}

function improvedExtract(caseItem: ExtractionBenchmarkCase): ExtractionRunResult {
  const { extracted, warnings } = extractSpecFields(caseItem.rawText, {
    standardCode: "JTG F80/1-2017",
    defaultCategory: caseItem.category === "other" ? "generic" : "subgrade",
    defaultVersion: "v1",
  });
  const metrics = buildExtractionQualityMetrics(extracted, warnings);
  return {
    extracted,
    warnings,
    metrics,
  };
}

function getExtractor(mode: ExtractionMode, override?: ExtractionBenchmarkExtractor): ExtractionBenchmarkExtractor {
  if (override) {
    return override;
  }
  return mode === "baseline"
    ? (rawText, caseItem) => baselineExtract({ ...caseItem, rawText })
    : (rawText, caseItem) => improvedExtract({ ...caseItem, rawText });
}

export function runExtractionOnCase(
  caseItem: ExtractionBenchmarkCase,
  extractor: ExtractionBenchmarkExtractor,
): ExtractionRunResult {
  return extractor(caseItem.rawText, caseItem);
}

export function runExtractionBenchmark(
  cases: ExtractionBenchmarkCase[],
  mode: ExtractionMode = "improved",
  extractor?: ExtractionBenchmarkExtractor,
): ExtractionBenchmarkResult {
  const runner = getExtractor(mode, extractor);
  const caseResults: ExtractionBenchmarkCaseResult[] = cases.map((caseItem) => {
    const actual = runExtractionOnCase(caseItem, runner);
    const metrics = scoreExtractionResult(caseItem, actual);
    return {
      caseId: caseItem.caseId,
      metrics,
    };
  });

  const averageScore =
    caseResults.length > 0
      ? Number(
          (
            caseResults.reduce((acc, item) => acc + item.metrics.score.overall, 0) / caseResults.length
          ).toFixed(4),
        )
      : 0;

  return {
    total: caseResults.length,
    averageScore,
    cases: caseResults,
  };
}
