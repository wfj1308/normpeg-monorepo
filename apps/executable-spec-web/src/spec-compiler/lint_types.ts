export type SpecLintErrorCode =
  | "MISSING_TITLE"
  | "MISSING_META"
  | "MISSING_SECTION"
  | "INVALID_INPUT_FORMAT"
  | "INVALID_OUTPUT"
  | "INVALID_CALCULATION"
  | "INVALID_RULE"
  | "INVALID_OPERATOR"
  | "INVALID_SIGNATURE"
  | "INVALID_DEPENDS"
  | "DUPLICATE_FIELD";

export type SpecLintWarningCode = "MISSING_DEPENDS" | "CALC_OUTPUT_NOT_DECLARED";

export interface SpecLintIssue<TCode extends string = string> {
  code: TCode;
  section: string;
  message: string;
  line?: number;
}

export interface SpecLintResult {
  valid: boolean;
  errors: SpecLintIssue<SpecLintErrorCode>[];
  warnings: SpecLintIssue<SpecLintWarningCode>[];
}

export interface LintSectionLine {
  content: string;
  line: number;
}

export type LintSectionKey =
  | "inputs"
  | "outputs"
  | "calculations"
  | "rules"
  | "signatures"
  | "dependsOn";

export interface ParsedLintBlocks {
  title: string;
  titleLine: number | null;
  metaLines: LintSectionLine[];
  sectionLines: Record<LintSectionKey, LintSectionLine[]>;
  sectionPresence: Record<LintSectionKey, boolean>;
}
