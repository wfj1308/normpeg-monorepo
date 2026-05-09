import {
  getActiveRuleConfig,
  resolveClauseSectionKeyFromItemId,
  type ClauseSectionKey,
  type RuleConfig,
} from "../calibration/rule_config.ts";
import { DRAFT_SECTION_ORDER, splitMarkdownIntoSections } from "./markdown_section_parser.ts";

export type ClauseReviewRiskLevel = "high" | "medium" | "low";

export interface ClauseReviewItem {
  id: string;
  title: string;
  message: string;
  riskLevel: ClauseReviewRiskLevel;
  required: boolean;
  confirmed: boolean;
}

export interface ClauseReviewSummary {
  requiredTotal: number;
  requiredConfirmed: number;
  highRequiredUnconfirmed: number;
  mediumUnconfirmed: number;
  lowUnconfirmed: number;
}

export interface ClauseReviewResult {
  items: ClauseReviewItem[];
  summary: ClauseReviewSummary;
  allRequiredConfirmed: boolean;
}

interface ClauseTemplate {
  id: string;
  title: string;
  sectionKey: ClauseSectionKey;
  sectionIndex: number;
  okMessage: string;
  missingMessage: string;
}

const CLAUSE_TEMPLATES: ClauseTemplate[] = [
  {
    id: "clause_source",
    title: "规范来源",
    sectionKey: "source",
    sectionIndex: 1,
    okMessage: "请确认规范来源与原文一致。",
    missingMessage: "未识别到规范来源，请人工补全并确认。",
  },
  {
    id: "clause_number",
    title: "条款号",
    sectionKey: "clause",
    sectionIndex: 2,
    okMessage: "请确认条款号与原文一致。",
    missingMessage: "未识别到条款号，请人工补全并确认。",
  },
  {
    id: "calc_path",
    title: "计算步骤",
    sectionKey: "calc_path",
    sectionIndex: 8,
    okMessage: "请确认计算步骤、公式与单位正确。",
    missingMessage: "未识别到完整计算步骤，请人工补全并确认。",
  },
  {
    id: "decision_rules",
    title: "判定规则",
    sectionKey: "rules",
    sectionIndex: 9,
    okMessage: "请确认阈值与操作符和规范一致。",
    missingMessage: "未识别到稳定判定规则，请人工补全并确认。",
  },
  {
    id: "depends_on",
    title: "依赖",
    sectionKey: "depends_on",
    sectionIndex: 11,
    okMessage: "请确认依赖关系准确。",
    missingMessage: "依赖关系缺失，请人工确认是否为 none 或具体依赖。",
  },
  {
    id: "input_params",
    title: "输入参数",
    sectionKey: "inputs",
    sectionIndex: 6,
    okMessage: "建议确认输入参数名称、类型与单位。",
    missingMessage: "输入参数信息不完整，建议人工确认。",
  },
  {
    id: "output_params",
    title: "输出参数",
    sectionKey: "outputs",
    sectionIndex: 7,
    okMessage: "建议确认输出参数定义。",
    missingMessage: "输出参数信息不完整，建议人工确认。",
  },
  {
    id: "signature_requirements",
    title: "签字要求",
    sectionKey: "signatures",
    sectionIndex: 10,
    okMessage: "建议确认签字角色与职责边界。",
    missingMessage: "签字要求信息不完整，建议人工确认。",
  },
];

function getSectionContent(markdown: string, sectionIndex: number): string {
  const sectionName = DRAFT_SECTION_ORDER[sectionIndex];
  if (!sectionName) {
    return "";
  }
  const sections = splitMarkdownIntoSections(markdown);
  return (sections[sectionName] ?? []).join("\n").trim();
}

function resolveClauseItemRiskLevel(sectionKey: ClauseSectionKey, config: RuleConfig): ClauseReviewRiskLevel {
  if (config.clause.requiredHighRiskSections.includes(sectionKey)) {
    return "high";
  }
  if (config.clause.optionalMediumRiskSections.includes(sectionKey)) {
    return "medium";
  }
  return "low";
}

function isRequiredSection(sectionKey: ClauseSectionKey, config: RuleConfig): boolean {
  return config.clause.requiredHighRiskSections.includes(sectionKey);
}

export function buildClauseReviewItems(markdown: string, config: RuleConfig = getActiveRuleConfig()): ClauseReviewItem[] {
  return CLAUSE_TEMPLATES.map((template) => {
    const content = getSectionContent(markdown, template.sectionIndex);
    const riskLevel = resolveClauseItemRiskLevel(template.sectionKey, config);
    const required = isRequiredSection(template.sectionKey, config);

    return {
      id: template.id,
      title: template.title,
      message: content ? template.okMessage : template.missingMessage,
      riskLevel,
      required,
      confirmed: false,
    };
  });
}

export function createDefaultClauseReviewItems(config: RuleConfig = getActiveRuleConfig()): ClauseReviewItem[] {
  return buildClauseReviewItems("", config);
}

export function computeClauseReviewStatus(items: ClauseReviewItem[]): ClauseReviewResult {
  const summary = items.reduce<ClauseReviewSummary>(
    (acc, item) => {
      if (item.required) {
        acc.requiredTotal += 1;
        if (item.confirmed) {
          acc.requiredConfirmed += 1;
        }
      }
      if (!item.confirmed && item.required && item.riskLevel === "high") {
        acc.highRequiredUnconfirmed += 1;
      }
      if (!item.confirmed && item.riskLevel === "medium") {
        acc.mediumUnconfirmed += 1;
      }
      if (!item.confirmed && item.riskLevel === "low") {
        acc.lowUnconfirmed += 1;
      }
      return acc;
    },
    {
      requiredTotal: 0,
      requiredConfirmed: 0,
      highRequiredUnconfirmed: 0,
      mediumUnconfirmed: 0,
      lowUnconfirmed: 0,
    },
  );

  return {
    items,
    summary,
    allRequiredConfirmed: summary.requiredTotal === summary.requiredConfirmed,
  };
}

export function resolveClauseSectionByItem(itemId: string): ClauseSectionKey | null {
  return resolveClauseSectionKeyFromItemId(itemId);
}
