import assert from "node:assert/strict";
import test from "node:test";

import { extractClauseCandidates, findLikelyTitleIndex, selectPrimaryClause } from "./clause_extractor.ts";
import { normalizeClauseText } from "./clause_normalizer.ts";
import { extractSpecFields } from "./field_extractor.ts";
import { extractFormulaCandidates, standardizeFormulaCandidate } from "./formula_extractor.ts";
import { normalizeFormulaText } from "./formula_normalizer.ts";
import { buildDraftMarkdown } from "./markdown_draft_builder.ts";
import { normalizeOCRText, resetOCRRuntimeForTesting, setOCRProvider, setPageImageExtractorForTesting, shouldUseOCR } from "./ocr_support.ts";
import { pdfToDraftMarkdown } from "./pdf_to_draft.ts";
import { classifyTableBlock, extractTableLikeBlocks } from "./table_extractor.ts";
import { tableToInputs, tableToRules } from "./table_mapper.ts";

function buildSinglePagePdfWithText(content: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${content}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf, "utf8");
}

function buildSinglePageScanLikePdf(): Buffer {
  const stream = "q 100 0 0 100 0 0 cm /Im0 Do Q";
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream, "utf8")} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf, "utf8");
}

test("clause normalization + selection: supports 第4.2.1条 and OCR-like 4.2.l", () => {
  const text = "第4.2.1条 路基压实度\n4.2.l 路基压实度";
  const normalized = normalizeClauseText(text);
  assert.equal(normalized.includes("4.2.1"), true);
  const candidates = extractClauseCandidates(normalized);
  assert.equal(candidates.some((item) => item.clause === "4.2.1"), true);
  const selected = selectPrimaryClause(candidates, findLikelyTitleIndex(normalized));
  assert.equal(selected.primaryClause, "4.2.1");
  assert.equal(selected.confidence === "high" || selected.confidence === "medium", true);
});

test("formula normalization + extraction: full formula should be standardized", () => {
  const text = normalizeFormulaText("压实度 = 干密度 / 最大干密度 × 100%");
  const formulas = extractFormulaCandidates(text);
  assert.equal(formulas[0]?.leftVar, "compactionDegree");
  assert.equal(formulas[0]?.completeness, "full");
  assert.equal(formulas[0]?.expression?.includes("dryDensity"), true);

  const partial = standardizeFormulaCandidate({ originalText: "干密度按下式计算", index: 0 });
  assert.equal(partial.completeness, "partial");
});

test("table extraction + mapping: parameter/rule table can map into fields", () => {
  const text = `
参数名  单位  说明
灌入砂质量  g  试验输入项
标定体积  cm3  试验输入项
含水率  %  试验输入项

项目  允许值  方法
压实度 >= 93  现场检测
`;
  const blocks = extractTableLikeBlocks(text);
  assert.equal(blocks.length >= 2, true);
  const parameterBlock = blocks.find((block) => classifyTableBlock(block) === "parameter_table");
  const ruleBlock = blocks.find((block) => classifyTableBlock(block) === "rule_table");
  assert.ok(parameterBlock);
  assert.ok(ruleBlock);
  assert.equal(tableToInputs(parameterBlock!).length >= 2, true);
  assert.equal(tableToRules(ruleBlock!).length >= 1, true);
});

test("extractSpecFields integrates clause/formula/table and emits confidence", () => {
  const text = `
4.2.1 路基压实度
参数名  单位  说明
灌入砂质量  g  试验输入项
标定体积  cm3  试验输入项
压实度 = 干密度 / 最大干密度 × 100%
压实度 >= 93
`;
  const { extracted, warnings } = extractSpecFields(text, {
    standardCode: "JTG F80/1-2017",
    defaultCategory: "subgrade",
    defaultVersion: "v1",
  });
  assert.equal(extracted.clause.length > 0, true);
  assert.equal(extracted.formulaCandidates.length > 0, true);
  assert.equal(extracted.inputs.length >= 2, true);
  assert.equal(extracted.rules.length >= 1, true);
  assert.equal(["high", "medium", "low"].includes(extracted.clauseConfidence), true);
  assert.equal(warnings.length >= 0, true);
});

test("shouldUseOCR and normalizeOCRText still work", () => {
  assert.equal(shouldUseOCR("路基压实度 条款号4.2.1 压实度应不小于93%"), false);
  assert.equal(shouldUseOCR("xq@# $$"), true);
  const cleaned = normalizeOCRText("第 1 页\n压实度 = 干密度 × 1O0％\n");
  assert.equal(cleaned.includes("* 100%"), true);
});

test("pdfToDraftMarkdown returns metrics", () => {
  resetOCRRuntimeForTesting();
  const pdf = buildSinglePagePdfWithText("4.2.1 路基压实度 压实度 = 干密度 / 最大干密度 × 100%");
  const result = pdfToDraftMarkdown(pdf, {
    standardCode: "JTG F80/1-2017",
    defaultCategory: "subgrade",
    defaultVersion: "v1",
  });
  assert.equal(typeof result.metrics.inputCount, "number");
  assert.equal(typeof result.metrics.ruleCount, "number");
  assert.equal(result.metrics.warningsCount, result.warnings.length);
  assert.ok(result.draftMarkdown.includes("## 输入参数"));
});

test("scan-like PDF should enable OCR and keep metrics", () => {
  setPageImageExtractorForTesting((_file, _pageIndex) => Buffer.from("mock-image"));
  setOCRProvider({
    recognize: () => "4.2.1 路基压实度 压实度 = 干密度 / 最大干密度 × 100%",
  });
  const pdf = buildSinglePageScanLikePdf();
  const result = pdfToDraftMarkdown(pdf, {
    standardCode: "JTG F80/1-2017",
    defaultCategory: "subgrade",
    defaultVersion: "v1",
  });
  assert.equal(result.ocrUsed, true);
  assert.equal(result.warnings.some((item) => item.code === "OCR_USED"), true);
  assert.equal(result.metrics.clauseConfidence === "high" || result.metrics.clauseConfidence === "medium" || result.metrics.clauseConfidence === "low", true);
  resetOCRRuntimeForTesting();
});

test("buildDraftMarkdown keeps required scaffold", () => {
  const { extracted } = extractSpecFields("仅有少量描述", {
    defaultCategory: "subgrade",
    defaultVersion: "v1",
  });
  const draft = buildDraftMarkdown(extracted);
  assert.ok(draft.includes("## 输入参数"));
  assert.ok(draft.includes("## 判定规则"));
});
