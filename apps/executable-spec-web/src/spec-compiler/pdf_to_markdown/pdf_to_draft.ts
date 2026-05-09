import { buildDraftMarkdown } from "./markdown_draft_builder.ts";
import { extractSpecFields } from "./field_extractor.ts";
import { buildExtractionQualityMetrics } from "./quality_metrics.ts";
import { extractTextFromPDF, extractTextPagesFromPDF } from "./pdf_text_extractor.ts";
import { extractTextWithOCR, normalizeOCRText, shouldUseOCR } from "./ocr_support.ts";
import type { PDFDraftWarning, PDFDraftWarningCode, PDFToDraftOptions, PDFToDraftResult } from "./types.ts";

function pushWarning(warnings: PDFDraftWarning[], code: PDFDraftWarningCode, message: string): void {
  if (warnings.some((item) => item.code === code)) {
    return;
  }
  warnings.push({ code, message });
}

function mergeTextsByPage(
  originalPages: string[],
  ocrPages: Array<{ pageIndex: number; text: string }>,
): string[] {
  const merged = originalPages.slice();
  const ocrMap = new Map<number, string>();
  for (const page of ocrPages) {
    ocrMap.set(page.pageIndex, page.text);
  }
  for (let pageIndex = 0; pageIndex < merged.length; pageIndex += 1) {
    const ocrText = ocrMap.get(pageIndex);
    if (ocrText && ocrText.trim().length > 0) {
      merged[pageIndex] = ocrText;
    }
  }
  return merged;
}

export function pdfToDraftMarkdown(
  file: Buffer | Uint8Array | ArrayBuffer,
  options: PDFToDraftOptions = {},
): PDFToDraftResult {
  const preWarnings: PDFDraftWarning[] = [];

  const pageTexts = extractTextPagesFromPDF(file);
  const ocrCandidatePageIndexes: number[] = [];
  pageTexts.forEach((pageText, pageIndex) => {
    if (shouldUseOCR(pageText)) {
      ocrCandidatePageIndexes.push(pageIndex);
    }
  });

  let ocrUsed = false;
  let mergedPageTexts = pageTexts.slice();
  let ocrNoisy = false;

  if (ocrCandidatePageIndexes.length > 0) {
    const ocrResult = extractTextWithOCR(file, ocrCandidatePageIndexes);
    ocrUsed = true;
    mergedPageTexts = mergeTextsByPage(
      pageTexts,
      ocrResult.pageResults.map((item) => ({ pageIndex: item.pageIndex, text: item.text })),
    );

    pushWarning(preWarnings, "OCR_USED", "检测到扫描版或低质量文本页，已自动启用 OCR。");

    ocrNoisy = ocrResult.noisyPageIndexes.length > 0 || ocrResult.failedPageIndexes.length > 0;
    if (ocrNoisy) {
      pushWarning(
        preWarnings,
        "OCR_TEXT_NOISY",
        "OCR 结果存在噪声或失败页面，请重点校对条款号、公式和表格字段。",
      );
    }
  }

  let rawText = mergedPageTexts
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .join("\n\n")
    .trim();

  if (!rawText) {
    try {
      rawText = extractTextFromPDF(file);
    } catch {
      rawText = "规范文本提取失败，需人工补录条款号、公式、参数和判定规则。";
      pushWarning(
        preWarnings,
        "OCR_TEXT_NOISY",
        "文本抽取与 OCR 均未得到稳定结果，请手动补录关键字段后再注册。",
      );
    }
  }

  if (ocrUsed) {
    rawText = normalizeOCRText(rawText);
  }

  const { extracted, warnings } = extractSpecFields(rawText, options);
  const finalWarnings = [...warnings, ...preWarnings];

  if (ocrUsed && warnings.some((item) => item.code === "CLAUSE_AMBIGUOUS")) {
    pushWarning(finalWarnings, "OCR_CLAUSE_LOW_CONFIDENCE", "OCR 条款号识别置信度较低，请人工核对条款号。");
  }
  if (ocrUsed && warnings.some((item) => item.code === "FORMULA_PARTIAL")) {
    pushWarning(finalWarnings, "OCR_FORMULA_LOW_CONFIDENCE", "OCR 公式识别不完整，请人工核对计算步骤。");
  }
  if (
    ocrUsed &&
    warnings.some((item) => item.code === "TABLE_PARSE_PARTIAL" || item.code === "INPUTS_INFERRED" || item.code === "RULES_INFERRED")
  ) {
    pushWarning(finalWarnings, "OCR_TABLE_LOW_CONFIDENCE", "OCR 表格识别置信度较低，请人工核对输入参数与判定规则。");
  }
  if (ocrUsed && ocrNoisy) {
    pushWarning(finalWarnings, "OCR_TEXT_NOISY", "OCR 文本噪声较高，建议人工逐段校对。");
  }

  const draftMarkdown = buildDraftMarkdown(extracted);
  const metrics = buildExtractionQualityMetrics(extracted, finalWarnings);
  return {
    success: true,
    rawText,
    draftMarkdown,
    extracted,
    warnings: finalWarnings,
    ocrUsed,
    metrics,
  };
}
