export interface PDFToDraftOptions {
  standardCode?: string;
  defaultCategory?: string;
  defaultVersion?: string;
}

export type PDFDraftWarningCode =
  | "CLAUSE_AMBIGUOUS"
  | "FORMULA_PARTIAL"
  | "TABLE_PARSE_PARTIAL"
  | "INPUTS_INFERRED"
  | "RULES_INFERRED"
  | "MANUAL_REVIEW_REQUIRED"
  | "OCR_USED"
  | "OCR_TEXT_NOISY"
  | "OCR_CLAUSE_LOW_CONFIDENCE"
  | "OCR_FORMULA_LOW_CONFIDENCE"
  | "OCR_TABLE_LOW_CONFIDENCE";

export interface PDFDraftWarning {
  code: PDFDraftWarningCode;
  message: string;
}

export interface ClauseCandidate {
  clause: string;
  index: number;
}

export type ClauseConfidence = "high" | "medium" | "low";

export interface ClauseExtractionResult {
  primaryClause: string | null;
  candidates: ClauseCandidate[];
  confidence: ClauseConfidence;
}

export interface FormulaCandidate {
  originalText: string;
  leftVar: string | null;
  expression: string | null;
  completeness: "full" | "partial";
  index: number;
}

export interface ExtractedTableBlock {
  type: "parameter_table" | "rule_table" | "responsibility_table" | "unknown_table" | "generic_table";
  headers: string[];
  rows: string[][];
  startIndex: number;
}

export interface ExtractedInputField {
  name: string;
  type: "number" | "string" | "boolean";
  unit: string;
  label: string;
}

export interface ExtractedRule {
  field: string;
  operator: ">=" | "<=" | ">" | "<" | "==" | "!=";
  value: number | string;
  message: string;
}

export interface ExtractedSpecFields {
  title: string;
  norm: string;
  clause: string;
  clauseConfidence: ClauseConfidence;
  clauseCandidates: ClauseCandidate[];
  version: string;
  category: string;
  measuredItem: string;
  inputs: ExtractedInputField[];
  outputs: string[];
  calculations: string[];
  formulaCandidates: FormulaCandidate[];
  tableBlocks: ExtractedTableBlock[];
  rules: ExtractedRule[];
  signatures: string[];
  dependsOn: string[];
}

export interface ExtractionQualityMetrics {
  clauseConfidence: ClauseConfidence;
  formulasFull: number;
  formulasPartial: number;
  inputCount: number;
  ruleCount: number;
  warningsCount: number;
}

export interface PDFToDraftResult {
  success: true;
  rawText: string;
  draftMarkdown: string;
  extracted: ExtractedSpecFields;
  warnings: PDFDraftWarning[];
  ocrUsed: boolean;
  metrics: ExtractionQualityMetrics;
}
