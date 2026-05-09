import fs from "node:fs";
import path from "node:path";

import type {
  ClauseSectionKey,
  DiffSectionKey,
  RuleConfig,
} from "../calibration/rule_config.ts";
import { defaultRuleConfig } from "../calibration/rule_config.ts";
import type { ClauseReviewItem } from "../review/clause_review.ts";
import type { ExtractionWarning } from "../review/warning_risk_mapper.ts";

export interface RegressionCase {
  caseId: string;
  fileName: string;
  warnings: ExtractionWarning[];
  originalDraftMarkdown: string;
  editedMarkdown: string;
  clauseReviewItems: ClauseReviewItem[];
  expectedDecision: {
    status: "blocked" | "warning" | "ready";
    blockingReasonsContains?: string[];
    warningReasonsContains?: string[];
  };
}

interface RawRuleConfig {
  risk: {
    highRiskWarnings: string[];
    mediumRiskWarnings: string[];
    lowRiskWarnings: string[];
  };
  diff: {
    highRiskSections: string[];
    mediumRiskSections: string[];
    lowRiskSections: string[];
  };
  clause: {
    requiredHighRiskSections: string[];
    optionalMediumRiskSections: string[];
  };
  gate: {
    blockOnHighWarning: boolean;
    blockOnUnconfirmedHighClause: boolean;
    warnOnHighRiskDiff: boolean;
    warnOnMediumClausePending: boolean;
  };
}

const DIFF_SECTION_NAME_MAP: Record<string, DiffSectionKey> = {
  "标题": "title",
  "规范来源": "source",
  "条款号": "clause",
  "版本": "version",
  "分类": "category",
  "检测项": "subject",
  "输入参数": "inputs",
  "输出参数": "outputs",
  "计算步骤": "calc_path",
  "判定规则": "rules",
  "签字要求": "signatures",
  "依赖": "depends_on",
  title: "title",
  source: "source",
  clause: "clause",
  version: "version",
  category: "category",
  subject: "subject",
  inputs: "inputs",
  outputs: "outputs",
  calc_path: "calc_path",
  rules: "rules",
  signatures: "signatures",
  depends_on: "depends_on",
};

const CLAUSE_SECTION_NAME_MAP: Record<string, ClauseSectionKey> = {
  "规范来源": "source",
  "条款号": "clause",
  "计算步骤": "calc_path",
  "判定规则": "rules",
  "依赖": "depends_on",
  "输入参数": "inputs",
  "输出参数": "outputs",
  "签字要求": "signatures",
  source: "source",
  clause: "clause",
  calc_path: "calc_path",
  rules: "rules",
  depends_on: "depends_on",
  inputs: "inputs",
  outputs: "outputs",
  signatures: "signatures",
};

function mapDiffSectionNames(values: string[]): DiffSectionKey[] {
  return values
    .map((value) => DIFF_SECTION_NAME_MAP[value.trim()])
    .filter((value): value is DiffSectionKey => Boolean(value));
}

function mapClauseSectionNames(values: string[]): ClauseSectionKey[] {
  return values
    .map((value) => CLAUSE_SECTION_NAME_MAP[value.trim()])
    .filter((value): value is ClauseSectionKey => Boolean(value));
}

export function loadRuleConfigFromFile(configPath: string): RuleConfig {
  const absolute = path.resolve(configPath);
  const raw = JSON.parse(fs.readFileSync(absolute, "utf8")) as RawRuleConfig;

  return {
    risk: {
      highRiskWarnings: [...raw.risk.highRiskWarnings],
      mediumRiskWarnings: [...raw.risk.mediumRiskWarnings],
      lowRiskWarnings: [...raw.risk.lowRiskWarnings],
    },
    diff: {
      highRiskSections: mapDiffSectionNames(raw.diff.highRiskSections),
      mediumRiskSections: mapDiffSectionNames(raw.diff.mediumRiskSections),
      lowRiskSections: mapDiffSectionNames(raw.diff.lowRiskSections),
    },
    clause: {
      requiredHighRiskSections: mapClauseSectionNames(raw.clause.requiredHighRiskSections),
      optionalMediumRiskSections: mapClauseSectionNames(raw.clause.optionalMediumRiskSections),
    },
    gate: {
      blockOnHighWarning: raw.gate.blockOnHighWarning,
      blockOnUnconfirmedHighClause: raw.gate.blockOnUnconfirmedHighClause,
      warnOnHighRiskDiff: raw.gate.warnOnHighRiskDiff,
      warnOnMediumClausePending: raw.gate.warnOnMediumClausePending,
    },
  };
}

export function loadRegressionCaseFromFile(filePath: string): RegressionCase {
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, "utf8")) as RegressionCase;
}

export function loadRegressionCasesFromDir(dirPath: string): RegressionCase[] {
  const absoluteDir = path.resolve(dirPath);
  const files = fs
    .readdirSync(absoluteDir)
    .filter((file) => file.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en"));
  return files.map((file) => loadRegressionCaseFromFile(path.join(absoluteDir, file)));
}

export const defaultRuleConfigFromCode = defaultRuleConfig;
