import fs from "node:fs";
import path from "node:path";

import { pdfToDraftMarkdown } from "../../src/spec-compiler/pdf_to_markdown/index.ts";
import type { PDFDraftWarning } from "../../src/spec-compiler/pdf_to_markdown/types.ts";

interface StoredValidationCase {
  case: string;
  machine: {
    fileName: string;
    extraction: {
      warnings: PDFDraftWarning[];
    };
    draft: {
      originalDraftMarkdown: string;
    };
  };
}

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

function extractClauseFromMarkdown(markdown: string): string | null {
  const match = markdown.match(/条款号[:：]\s*([^\n]+)/);
  return match?.[1]?.trim() ?? null;
}

function extractSectionBody(markdown: string, title: string): string[] {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = new RegExp(`##\\s*${escaped}\\n([\\s\\S]*?)(?:\\n##\\s|$)`, "m").exec(markdown)?.[1] ?? "";
  return section
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function countCalculationLines(markdown: string): number {
  return extractSectionBody(markdown, "计算步骤").filter((line) => /^\d+\./.test(line)).length;
}

function countInputLines(markdown: string): number {
  return extractSectionBody(markdown, "输入参数").filter((line) => line.startsWith("- ")).length;
}

function countRuleLines(markdown: string): number {
  return extractSectionBody(markdown, "判定规则").filter((line) => line.startsWith("- ")).length;
}

function beforeFormulasPartialByWarnings(warnings: PDFDraftWarning[]): number {
  return warnings.some((warning) => warning.code === "FORMULA_PARTIAL") ? 1 : 0;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const reportPath = path.resolve(root, "apps/executable-spec-web/examples/validation/real_pdf_validation_report.json");
  const report = JSON.parse(readUtf8(reportPath)) as { cases: StoredValidationCase[] };

  const caseMap: Record<string, string> = {
    compaction: "uploads/normref/20260415122744-c0a274e3-1_JTG_T_3610-2019____________.pdf",
    thickness: "translation-bot/runtime/uploads/5a53c366-68fc-49bf-bfe0-e083fa2ff6dc-JTG_5220_2020_.pdf",
    deflection: "translation-bot/runtime/uploads/e84a2a51-2f9f-46bb-be6a-154751bb548b-JTG_5220_2020_.pdf",
  };

  const summary: Array<{
    case: string;
    primaryClauseBefore: string | null;
    primaryClauseAfter: string | null;
    formulasFullBefore: number;
    formulasFullAfter: number;
    formulasPartialBefore: number;
    formulasPartialAfter: number;
    inputCountBefore: number;
    inputCountAfter: number;
    ruleCountBefore: number;
    ruleCountAfter: number;
    warningsBefore: number;
    warningsAfter: number;
  }> = [];

  for (const item of report.cases) {
    const pdfPath = caseMap[item.case];
    if (!pdfPath) {
      continue;
    }
    const buffer = fs.readFileSync(path.resolve(root, pdfPath));
    const after = pdfToDraftMarkdown(buffer, {
      standardCode: "JTG F80/1-2017",
      defaultCategory: "subgrade",
      defaultVersion: "v1",
    });

    const beforeMarkdown = item.machine.draft.originalDraftMarkdown;
    summary.push({
      case: item.case,
      primaryClauseBefore: extractClauseFromMarkdown(beforeMarkdown),
      primaryClauseAfter: after.extracted.clause,
      formulasFullBefore: countCalculationLines(beforeMarkdown),
      formulasFullAfter: after.metrics.formulasFull,
      formulasPartialBefore: beforeFormulasPartialByWarnings(item.machine.extraction.warnings),
      formulasPartialAfter: after.metrics.formulasPartial,
      inputCountBefore: countInputLines(beforeMarkdown),
      inputCountAfter: after.metrics.inputCount,
      ruleCountBefore: countRuleLines(beforeMarkdown),
      ruleCountAfter: after.metrics.ruleCount,
      warningsBefore: item.machine.extraction.warnings.length,
      warningsAfter: after.warnings.length,
    });
  }

  const outputPath = path.resolve(root, "apps/executable-spec-web/examples/validation/pdf_extraction_quality_compare.json");
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), samples: summary }, null, 2), "utf8");
  console.log(JSON.stringify({ outputPath, samples: summary }, null, 2));
}

void main();
