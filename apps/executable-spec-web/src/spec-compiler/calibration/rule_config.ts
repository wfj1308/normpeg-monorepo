import { DRAFT_SECTION_ORDER, type DraftSectionName } from "../review/markdown_section_parser.ts";

export interface RiskRuleConfig {
  highRiskWarnings: string[];
  mediumRiskWarnings: string[];
  lowRiskWarnings: string[];
}

export type DiffSectionKey =
  | "title"
  | "source"
  | "clause"
  | "version"
  | "category"
  | "subject"
  | "inputs"
  | "outputs"
  | "calc_path"
  | "rules"
  | "signatures"
  | "depends_on";

export interface DiffRuleConfig {
  highRiskSections: DiffSectionKey[];
  mediumRiskSections: DiffSectionKey[];
  lowRiskSections: DiffSectionKey[];
}

export type ClauseSectionKey = "source" | "clause" | "calc_path" | "rules" | "depends_on" | "inputs" | "outputs" | "signatures";

export interface ClauseRuleConfig {
  requiredHighRiskSections: ClauseSectionKey[];
  optionalMediumRiskSections: ClauseSectionKey[];
}

export interface PreRegisterGateConfig {
  blockOnHighWarning: boolean;
  blockOnUnconfirmedHighClause: boolean;
  warnOnHighRiskDiff: boolean;
  warnOnMediumClausePending: boolean;
}

export interface RuleConfig {
  risk: RiskRuleConfig;
  diff: DiffRuleConfig;
  clause: ClauseRuleConfig;
  gate: PreRegisterGateConfig;
}

export type RuleConfigInput = Partial<{
  risk: Partial<RiskRuleConfig>;
  diff: Partial<DiffRuleConfig>;
  clause: Partial<ClauseRuleConfig>;
  gate: Partial<PreRegisterGateConfig>;
}>;

const SECTION_INDEX_TO_KEY: DiffSectionKey[] = [
  "title",
  "source",
  "clause",
  "version",
  "category",
  "subject",
  "inputs",
  "outputs",
  "calc_path",
  "rules",
  "signatures",
  "depends_on",
];

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  risk: {
    highRiskWarnings: [
      "CLAUSE_AMBIGUOUS",
      "FORMULA_PARTIAL",
      "MANUAL_REVIEW_REQUIRED",
      "OCR_CLAUSE_LOW_CONFIDENCE",
      "OCR_FORMULA_LOW_CONFIDENCE",
    ],
    mediumRiskWarnings: ["INPUTS_INFERRED", "RULES_INFERRED", "OCR_TEXT_NOISY", "OCR_TABLE_LOW_CONFIDENCE"],
    lowRiskWarnings: ["OCR_USED"],
  },
  diff: {
    highRiskSections: ["source", "clause", "calc_path", "rules", "depends_on"],
    mediumRiskSections: ["inputs", "outputs", "signatures"],
    lowRiskSections: ["title", "version", "category", "subject"],
  },
  clause: {
    requiredHighRiskSections: ["source", "clause", "calc_path", "rules", "depends_on"],
    optionalMediumRiskSections: ["inputs", "outputs", "signatures"],
  },
  gate: {
    blockOnHighWarning: true,
    blockOnUnconfirmedHighClause: true,
    warnOnHighRiskDiff: true,
    warnOnMediumClausePending: true,
  },
};

export const defaultRuleConfig: RuleConfig = cloneRuleConfig(DEFAULT_RULE_CONFIG);

let activeRuleConfig: RuleConfig = cloneRuleConfig(DEFAULT_RULE_CONFIG);

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

export function cloneRuleConfig(config: RuleConfig): RuleConfig {
  return {
    risk: {
      highRiskWarnings: [...config.risk.highRiskWarnings],
      mediumRiskWarnings: [...config.risk.mediumRiskWarnings],
      lowRiskWarnings: [...config.risk.lowRiskWarnings],
    },
    diff: {
      highRiskSections: [...config.diff.highRiskSections],
      mediumRiskSections: [...config.diff.mediumRiskSections],
      lowRiskSections: [...config.diff.lowRiskSections],
    },
    clause: {
      requiredHighRiskSections: [...config.clause.requiredHighRiskSections],
      optionalMediumRiskSections: [...config.clause.optionalMediumRiskSections],
    },
    gate: { ...config.gate },
  };
}

function normalizeConfig(config: RuleConfig): RuleConfig {
  return {
    risk: {
      highRiskWarnings: unique(config.risk.highRiskWarnings),
      mediumRiskWarnings: unique(config.risk.mediumRiskWarnings),
      lowRiskWarnings: unique(config.risk.lowRiskWarnings),
    },
    diff: {
      highRiskSections: unique(config.diff.highRiskSections) as DiffSectionKey[],
      mediumRiskSections: unique(config.diff.mediumRiskSections) as DiffSectionKey[],
      lowRiskSections: unique(config.diff.lowRiskSections) as DiffSectionKey[],
    },
    clause: {
      requiredHighRiskSections: unique(config.clause.requiredHighRiskSections) as ClauseSectionKey[],
      optionalMediumRiskSections: unique(config.clause.optionalMediumRiskSections) as ClauseSectionKey[],
    },
    gate: { ...config.gate },
  };
}

function mergeRuleConfig(base: RuleConfig, input: RuleConfigInput): RuleConfig {
  return normalizeConfig({
    risk: {
      highRiskWarnings: [...(input.risk?.highRiskWarnings ?? base.risk.highRiskWarnings)],
      mediumRiskWarnings: [...(input.risk?.mediumRiskWarnings ?? base.risk.mediumRiskWarnings)],
      lowRiskWarnings: [...(input.risk?.lowRiskWarnings ?? base.risk.lowRiskWarnings)],
    },
    diff: {
      highRiskSections: [...(input.diff?.highRiskSections ?? base.diff.highRiskSections)],
      mediumRiskSections: [...(input.diff?.mediumRiskSections ?? base.diff.mediumRiskSections)],
      lowRiskSections: [...(input.diff?.lowRiskSections ?? base.diff.lowRiskSections)],
    },
    clause: {
      requiredHighRiskSections: [...(input.clause?.requiredHighRiskSections ?? base.clause.requiredHighRiskSections)],
      optionalMediumRiskSections: [...(input.clause?.optionalMediumRiskSections ?? base.clause.optionalMediumRiskSections)],
    },
    gate: {
      blockOnHighWarning: input.gate?.blockOnHighWarning ?? base.gate.blockOnHighWarning,
      blockOnUnconfirmedHighClause: input.gate?.blockOnUnconfirmedHighClause ?? base.gate.blockOnUnconfirmedHighClause,
      warnOnHighRiskDiff: input.gate?.warnOnHighRiskDiff ?? base.gate.warnOnHighRiskDiff,
      warnOnMediumClausePending: input.gate?.warnOnMediumClausePending ?? base.gate.warnOnMediumClausePending,
    },
  });
}

export function getActiveRuleConfig(): RuleConfig {
  return cloneRuleConfig(activeRuleConfig);
}

export function setRuleConfig(config: RuleConfig): RuleConfig {
  activeRuleConfig = normalizeConfig(cloneRuleConfig(config));
  return getActiveRuleConfig();
}

export function resetRuleConfig(): RuleConfig {
  activeRuleConfig = cloneRuleConfig(DEFAULT_RULE_CONFIG);
  return getActiveRuleConfig();
}

export function applyRuleConfig(config: RuleConfigInput): RuleConfig {
  activeRuleConfig = mergeRuleConfig(activeRuleConfig, config);
  return getActiveRuleConfig();
}

export function resolveWarningRiskLevel(code: string, config: RuleConfig = activeRuleConfig): "high" | "medium" | "low" | "unknown" {
  if (config.risk.highRiskWarnings.includes(code)) {
    return "high";
  }
  if (config.risk.mediumRiskWarnings.includes(code)) {
    return "medium";
  }
  if (config.risk.lowRiskWarnings.includes(code)) {
    return "low";
  }
  return "unknown";
}

export function resolveDiffSectionKey(sectionName: DraftSectionName): DiffSectionKey {
  const index = DRAFT_SECTION_ORDER.indexOf(sectionName);
  if (index < 0) {
    return "title";
  }
  return SECTION_INDEX_TO_KEY[index] ?? "title";
}

export function resolveDiffRiskLevelFromSectionKey(
  sectionKey: DiffSectionKey,
  config: RuleConfig = activeRuleConfig,
): "high" | "medium" | "low" {
  if (config.diff.highRiskSections.includes(sectionKey)) {
    return "high";
  }
  if (config.diff.mediumRiskSections.includes(sectionKey)) {
    return "medium";
  }
  return "low";
}

export function resolveClauseSectionKeyFromItemId(itemId: string): ClauseSectionKey | null {
  if (itemId === "clause_source") {
    return "source";
  }
  if (itemId === "clause_number") {
    return "clause";
  }
  if (itemId === "calc_path") {
    return "calc_path";
  }
  if (itemId === "decision_rules") {
    return "rules";
  }
  if (itemId === "depends_on") {
    return "depends_on";
  }
  if (itemId === "input_params") {
    return "inputs";
  }
  if (itemId === "output_params") {
    return "outputs";
  }
  if (itemId === "signature_requirements") {
    return "signatures";
  }
  return null;
}
