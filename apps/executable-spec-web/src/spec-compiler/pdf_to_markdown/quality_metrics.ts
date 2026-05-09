import type { ExtractionQualityMetrics, ExtractedSpecFields, PDFDraftWarning } from "./types.ts";

export function buildExtractionQualityMetrics(
  extracted: ExtractedSpecFields,
  warnings: PDFDraftWarning[],
): ExtractionQualityMetrics {
  const formulasFromCandidates = extracted.formulaCandidates.filter((item) => item.completeness === "full").length;
  const formulasFull = formulasFromCandidates > 0 ? formulasFromCandidates : extracted.calculations.length;
  const formulasFromPartialCandidates = extracted.formulaCandidates.filter((item) => item.completeness === "partial").length;
  const formulasPartial =
    formulasFromPartialCandidates > 0
      ? formulasFromPartialCandidates
      : warnings.some((item) => item.code === "FORMULA_PARTIAL")
      ? 1
      : 0;
  return {
    clauseConfidence: extracted.clauseConfidence,
    formulasFull,
    formulasPartial,
    inputCount: extracted.inputs.length,
    ruleCount: extracted.rules.length,
    warningsCount: warnings.length,
  };
}
