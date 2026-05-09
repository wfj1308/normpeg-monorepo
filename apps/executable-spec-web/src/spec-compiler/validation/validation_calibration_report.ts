import type { RealPdfValidationResult } from "./real_pdf_validation_runner.ts";

export interface ValidationCalibrationReport {
  total: number;
  blocked: number;
  warning: number;
  ready: number;
  commonBlockingReasons: string[];
  commonWarningReasons: string[];
  ruleAdjustmentSuggestions: string[];
}

function formatCommonReasons(counter: Map<string, number>, total: number): string[] {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => `${reason} (${count}/${total})`);
}

function countWarningsByCode(results: RealPdfValidationResult[]): Map<string, number> {
  const counter = new Map<string, number>();
  for (const result of results) {
    const seen = new Set<string>();
    for (const warning of result.extraction.warnings) {
      if (seen.has(warning.code)) {
        continue;
      }
      seen.add(warning.code);
      counter.set(warning.code, (counter.get(warning.code) ?? 0) + 1);
    }
  }
  return counter;
}

function buildSuggestions(results: RealPdfValidationResult[]): string[] {
  const suggestions: string[] = [];
  const total = results.length;
  if (total === 0) {
    return suggestions;
  }

  const warningCodeCounter = countWarningsByCode(results);
  const ocrNoisyCount = warningCodeCounter.get("OCR_TEXT_NOISY") ?? 0;
  const formulaPartialCount = warningCodeCounter.get("FORMULA_PARTIAL") ?? 0;
  const inputsInferredCount = warningCodeCounter.get("INPUTS_INFERRED") ?? 0;
  const rulesInferredCount = warningCodeCounter.get("RULES_INFERRED") ?? 0;

  if (ocrNoisyCount >= Math.ceil(total / 2)) {
    suggestions.push("OCR_TEXT_NOISY 出现频率高，建议保持为 medium，不直接 block。");
  }
  if (formulaPartialCount >= Math.ceil(total / 2)) {
    suggestions.push("FORMULA_PARTIAL 高频出现且会影响可编译性，建议保持 high。");
  }
  if (inputsInferredCount >= Math.ceil(total / 2) || rulesInferredCount >= Math.ceil(total / 2)) {
    suggestions.push("INPUTS_INFERRED / RULES_INFERRED 在样本中常见，建议保持 medium + 人工确认。");
  }

  const blocked = results.filter((item) => item.preRegisterDecision.status === "blocked").length;
  const warning = results.filter((item) => item.preRegisterDecision.status === "warning").length;
  if (blocked === total) {
    suggestions.push("全部样本均 blocked，建议复核 Clause required 是否过严或 OCR 前处理是否不足。");
  }
  if (warning === 0 && blocked === 0) {
    suggestions.push("全部样本均 ready，建议抽检是否存在漏报风险。");
  }

  if (suggestions.length === 0) {
    suggestions.push("当前规则在样本集上分层稳定，可继续扩大真实样本规模做二次校准。");
  }
  return suggestions;
}

export function buildValidationCalibrationReport(results: RealPdfValidationResult[]): ValidationCalibrationReport {
  const blocked = results.filter((item) => item.preRegisterDecision.status === "blocked").length;
  const warning = results.filter((item) => item.preRegisterDecision.status === "warning").length;
  const ready = results.filter((item) => item.preRegisterDecision.status === "ready").length;

  const blockingCounter = new Map<string, number>();
  const warningCounter = new Map<string, number>();

  for (const result of results) {
    const blockReasons = new Set(result.preRegisterDecision.blockingReasons);
    const warnReasons = new Set(result.preRegisterDecision.warningReasons);
    for (const reason of blockReasons) {
      blockingCounter.set(reason, (blockingCounter.get(reason) ?? 0) + 1);
    }
    for (const reason of warnReasons) {
      warningCounter.set(reason, (warningCounter.get(reason) ?? 0) + 1);
    }
  }

  return {
    total: results.length,
    blocked,
    warning,
    ready,
    commonBlockingReasons: formatCommonReasons(blockingCounter, results.length),
    commonWarningReasons: formatCommonReasons(warningCounter, results.length),
    ruleAdjustmentSuggestions: buildSuggestions(results),
  };
}
