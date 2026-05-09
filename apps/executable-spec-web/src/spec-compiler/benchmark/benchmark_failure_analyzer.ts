import type { ExtractionBenchmarkCase } from "./extraction_benchmark_case.ts";
import type { ExtractionBenchmarkMetrics } from "./extraction_scorer.ts";

export interface BenchmarkFailureReason {
  caseId: string;
  area: "clause" | "formula" | "table" | "rule" | "input";
  severity: "high" | "medium" | "low";
  message: string;
}

export function analyzeBenchmarkFailures(
  caseItem: ExtractionBenchmarkCase,
  actualMetrics: ExtractionBenchmarkMetrics,
): BenchmarkFailureReason[] {
  const reasons: BenchmarkFailureReason[] = [];

  if (!actualMetrics.clauseMatched) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "clause",
      severity: "high",
      message: "条款号未命中，需增强 OCR 条款修正或标题附近候选优先策略。",
    });
  } else if (actualMetrics.clauseConfidence === "low") {
    reasons.push({
      caseId: caseItem.caseId,
      area: "clause",
      severity: "medium",
      message: "条款号已命中但置信度低，建议做标题锚点和候选去重增强。",
    });
  }

  if (actualMetrics.formulasExpected > 0 && actualMetrics.formulasFullMatched === 0) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "formula",
      severity: "high",
      message: "公式无法完整标准化，需做跨行合并和运算符规范化修复。",
    });
  } else if (actualMetrics.formulasExpected > actualMetrics.formulasFullMatched) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "formula",
      severity: "medium",
      message: "公式仅部分命中，建议补强 alias 映射或表达式切分。",
    });
  }

  if (actualMetrics.inputsExpected > 0) {
    const inputRatio = actualMetrics.inputsMatched / actualMetrics.inputsExpected;
    if (inputRatio <= 0.25) {
      reasons.push({
        caseId: caseItem.caseId,
        area: "input",
        severity: "high",
        message: "输入参数命中率过低，参数表抽取不完整。",
      });
    } else if (inputRatio <= 0.6) {
      reasons.push({
        caseId: caseItem.caseId,
        area: "input",
        severity: "medium",
        message: "输入参数命中率偏低，需补齐表头别名或断裂行。",
      });
    }
  }

  if (actualMetrics.rulesExpected > 0 && actualMetrics.rulesMatched === 0) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "rule",
      severity: "high",
      message: "判定规则未正确识别，需增强规则行解析。",
    });
  } else if (actualMetrics.rulesExpected > actualMetrics.rulesMatched) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "rule",
      severity: "medium",
      message: "判定规则部分缺失，建议增强 rule_table 分类与操作符识别。",
    });
  }

  if (actualMetrics.warningsCount >= 4) {
    reasons.push({
      caseId: caseItem.caseId,
      area: "table",
      severity: "low",
      message: "warning 数量偏高，建议优先修复表格结构化稳定性。",
    });
  }

  return reasons;
}

