import {
  getActiveRuleConfig,
  resolveWarningRiskLevel,
  type RuleConfig,
} from "../calibration/rule_config.ts";

export interface ExtractionWarning {
  code: string;
  message: string;
  section?: string;
}

export type RiskSource = "warning" | "diff" | "manual";
export type RiskLevel = "high" | "medium" | "low";
export type RiskCategory = "clause" | "formula" | "input" | "rule" | "ocr" | "table" | "manual_review";

export interface RiskItem {
  id: string;
  source: RiskSource;
  code: string;
  title: string;
  message: string;
  riskLevel: RiskLevel;
  category: RiskCategory;
  requiresConfirmation: boolean;
  blocksRegister: boolean;
  section?: string;
}

interface RiskMappingRule {
  title: string;
  category: RiskCategory;
}

const WARNING_META_MAP: Record<string, RiskMappingRule> = {
  CLAUSE_AMBIGUOUS: { title: "条款号识别不稳定", category: "clause" },
  FORMULA_PARTIAL: { title: "公式抽取不完整", category: "formula" },
  MANUAL_REVIEW_REQUIRED: { title: "需人工复核", category: "manual_review" },
  OCR_CLAUSE_LOW_CONFIDENCE: { title: "OCR 条款号识别置信度低", category: "clause" },
  OCR_FORMULA_LOW_CONFIDENCE: { title: "OCR 公式识别置信度低", category: "formula" },
  INPUTS_INFERRED: { title: "输入参数来自推断", category: "input" },
  RULES_INFERRED: { title: "判定规则来自推断", category: "rule" },
  OCR_TABLE_LOW_CONFIDENCE: { title: "OCR 表格识别置信度低", category: "table" },
  OCR_TEXT_NOISY: { title: "OCR 文本噪声较高", category: "ocr" },
  OCR_USED: { title: "已启用 OCR", category: "ocr" },
};

function toRiskLevel(code: string, config: RuleConfig): RiskLevel {
  const level = resolveWarningRiskLevel(code, config);
  if (level === "high" || level === "medium" || level === "low") {
    return level;
  }
  return "medium";
}

function buildFallbackRule(code: string): RiskMappingRule {
  return {
    title: `未分类风险 ${code}`,
    category: "manual_review",
  };
}

export function isHighRiskWarning(code: string, config: RuleConfig = getActiveRuleConfig()): boolean {
  return resolveWarningRiskLevel(code, config) === "high";
}

export function isMediumRiskWarning(code: string, config: RuleConfig = getActiveRuleConfig()): boolean {
  return resolveWarningRiskLevel(code, config) === "medium";
}

export function isLowRiskWarning(code: string, config: RuleConfig = getActiveRuleConfig()): boolean {
  return resolveWarningRiskLevel(code, config) === "low";
}

export function mapWarningToRiskItem(warning: ExtractionWarning, config: RuleConfig = getActiveRuleConfig()): RiskItem {
  const meta = WARNING_META_MAP[warning.code] ?? buildFallbackRule(warning.code);
  const riskLevel = toRiskLevel(warning.code, config);
  return {
    id: `risk_${warning.code}_${Math.random().toString(36).slice(2, 8)}`,
    source: "warning",
    code: warning.code,
    title: meta.title,
    message: warning.message,
    riskLevel,
    category: meta.category,
    requiresConfirmation: riskLevel !== "low",
    blocksRegister: riskLevel === "high",
    section: warning.section,
  };
}

export function buildRiskItemsFromWarnings(warnings: ExtractionWarning[], config: RuleConfig = getActiveRuleConfig()): RiskItem[] {
  return warnings.map((warning, index) => {
    const item = mapWarningToRiskItem(warning, config);
    return {
      ...item,
      id: `risk_${index + 1}_${warning.code}`,
    };
  });
}
