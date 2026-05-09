import { extractClauseCandidates, findLikelyTitleIndex, selectPrimaryClause } from "./clause_extractor.ts";
import { normalizeClauseText } from "./clause_normalizer.ts";
import { extractFormulaCandidates } from "./formula_extractor.ts";
import { normalizeFormulaText } from "./formula_normalizer.ts";
import { extractTableLikeBlocks } from "./table_extractor.ts";
import { tableToInputs, tableToRules } from "./table_mapper.ts";
import type {
  ExtractedInputField,
  ExtractedRule,
  ExtractedSpecFields,
  ExtractedTableBlock,
  PDFDraftWarning,
  PDFDraftWarningCode,
  PDFToDraftOptions,
} from "./types.ts";

type SpecKind = "compaction" | "thickness" | "deflection" | "generic";
type InputSource = "table" | "text" | "default";
type RuleSource = "table" | "text" | "default";

interface FieldExtractResult {
  extracted: ExtractedSpecFields;
  warnings: PDFDraftWarning[];
}

const CN_TO_VAR: Array<[string, string]> = [
  ["压实度", "compactionDegree"],
  ["干密度", "dryDensity"],
  ["湿密度", "wetDensity"],
  ["灌入砂质量", "massHoleSand"],
  ["标定体积", "volumeSand"],
  ["含水率", "moistureContent"],
  ["最大干密度", "maxDryDensity"],
  ["实测厚度", "measuredThickness"],
  ["设计厚度", "designThickness"],
  ["厚度偏差", "thicknessDeviation"],
  ["厚度比", "thicknessRatio"],
  ["实测弯沉", "measuredDeflection"],
  ["允许最大弯沉", "maxAllowedDeflection"],
];

const INPUT_CATALOG: Record<SpecKind, Array<ExtractedInputField & { aliases: string[] }>> = {
  compaction: [
    { name: "massHoleSand", type: "number", unit: "g", label: "灌入砂质量", aliases: ["灌入砂质量", "massHoleSand"] },
    { name: "volumeSand", type: "number", unit: "cm3", label: "标定体积", aliases: ["标定体积", "volumeSand"] },
    { name: "moistureContent", type: "number", unit: "%", label: "含水率", aliases: ["含水率", "moistureContent"] },
    { name: "maxDryDensity", type: "number", unit: "g/cm3", label: "最大干密度", aliases: ["最大干密度", "maxDryDensity"] },
  ],
  thickness: [
    { name: "measuredThickness", type: "number", unit: "mm", label: "实测厚度", aliases: ["实测厚度", "measuredThickness"] },
    { name: "designThickness", type: "number", unit: "mm", label: "设计厚度", aliases: ["设计厚度", "designThickness"] },
  ],
  deflection: [
    { name: "measuredDeflection", type: "number", unit: "0.01mm", label: "实测弯沉", aliases: ["实测弯沉", "measuredDeflection"] },
    { name: "maxAllowedDeflection", type: "number", unit: "0.01mm", label: "允许最大弯沉", aliases: ["允许最大弯沉", "maxAllowedDeflection"] },
  ],
  generic: [{ name: "inputValue", type: "number", unit: "-", label: "待补充输入", aliases: ["inputValue"] }],
};

function pushWarning(warnings: PDFDraftWarning[], code: PDFDraftWarningCode, message: string): void {
  if (warnings.some((item) => item.code === code)) {
    return;
  }
  warnings.push({ code, message });
}

function normalizeText(rawText: string): string {
  return rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\u3000/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[ ]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function detectSpecKind(rawText: string): SpecKind {
  if (/压实度|灌入砂质量|干密度|湿密度|compaction/i.test(rawText)) {
    return "compaction";
  }
  if (/厚度|设计厚度|实测厚度|thickness/i.test(rawText)) {
    return "thickness";
  }
  if (/弯沉|deflection|maxAllowedDeflection|measuredDeflection/i.test(rawText)) {
    return "deflection";
  }
  return "generic";
}

function mapChineseNameToVar(text: string): string {
  const cleaned = text.trim().replace(/[，,。;；:：()（）【】[\]]/g, "");
  const mapped = CN_TO_VAR.find(([term]) => cleaned.includes(term));
  if (mapped?.[1]) {
    return mapped[1];
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
    return cleaned;
  }
  return (
    cleaned
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((part, index) => (index === 0 ? part.toLowerCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`))
      .join("")
      .replace(/^[^A-Za-z_]+/, "")
      .replace(/[^\w]/g, "") || "inputField"
  );
}

function extractTitle(rawText: string, kind: SpecKind): string {
  const lines = rawText.split("\n").map((item) => item.trim()).filter(Boolean);
  const clauseTitle = lines
    .map((line) => /^\d+(?:\.\d+){1,3}(?:-\d+)?\s+(.+)$/.exec(line)?.[1]?.trim())
    .find(Boolean);
  if (clauseTitle) {
    return clauseTitle;
  }
  const likely = lines.find((line) => /压实度|厚度|弯沉|compaction|thickness|deflection/i.test(line) && line.length <= 64);
  if (likely) {
    return likely;
  }
  if (kind === "compaction") {
    return "路基压实度（土质法）";
  }
  if (kind === "thickness") {
    return "路基厚度";
  }
  if (kind === "deflection") {
    return "路基弯沉";
  }
  return "规范草稿（需人工校对）";
}

function extractNorm(rawText: string, options: PDFToDraftOptions): string {
  if (options.standardCode?.trim()) {
    return options.standardCode.trim();
  }
  const match = rawText.match(/(JTG\s*[A-Z]?\s*\d+(?:\/\d+)?-\d{4}|GB\/?T?\s*\d+(?:\.\d+)?-\d{4})/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "UNKNOWN_STANDARD";
}

function looksLikeTableText(rawText: string): boolean {
  return rawText.split("\n").some((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return false;
    }
    if (trimmed.includes("|") || trimmed.includes("│")) {
      return true;
    }
    return trimmed.split(/\s{2,}/).length >= 3 && /参数|项目|单位|说明|允许值|指标/.test(trimmed);
  });
}

function inferDefaultCalculations(kind: SpecKind): string[] {
  if (kind === "compaction") {
    return [
      "wetDensity = massHoleSand / volumeSand",
      "dryDensity = wetDensity / (1 + moistureContent / 100)",
      "compactionDegree = (dryDensity / maxDryDensity) * 100",
    ];
  }
  if (kind === "thickness") {
    return [
      "thicknessDeviation = measuredThickness - designThickness",
      "thicknessRatio = (measuredThickness / designThickness) * 100",
    ];
  }
  if (kind === "deflection") {
    return ["deflectionMargin = maxAllowedDeflection - measuredDeflection"];
  }
  return ["resultValue = inputValue"];
}

function parseRuleByText(text: string): ExtractedRule | null {
  const normalized = text
    .replace(/[≥﹥]/g, ">=")
    .replace(/[≤﹤]/g, "<=")
    .replace(/[＝]/g, "==")
    .trim();
  const opRule = /([A-Za-z_][A-Za-z0-9_]*|[\u4e00-\u9fa5]{2,20})\s*(>=|<=|>|<|==|!=)\s*([0-9]+(?:\.[0-9]+)?)/.exec(normalized);
  if (!opRule?.[1] || !opRule[2] || !opRule[3]) {
    return null;
  }
  const value = Number(opRule[3]);
  return {
    field: mapChineseNameToVar(opRule[1]),
    operator: opRule[2] as ExtractedRule["operator"],
    value: Number.isNaN(value) ? opRule[3] : value,
    message: normalized,
  };
}

function inferDefaultRules(kind: SpecKind): ExtractedRule[] {
  if (kind === "compaction") {
    return [{ field: "compactionDegree", operator: ">=", value: 93, message: "压实度必须 >= 93%" }];
  }
  if (kind === "thickness") {
    return [{ field: "measuredThickness", operator: ">=", value: 200, message: "实测厚度不得小于设计值" }];
  }
  if (kind === "deflection") {
    return [{ field: "measuredDeflection", operator: "<=", value: 20, message: "弯沉值不得超过允许值" }];
  }
  return [{ field: "resultValue", operator: ">=", value: 0, message: "规则待人工补充" }];
}

function dedupeInputs(inputs: ExtractedInputField[]): ExtractedInputField[] {
  const seen = new Set<string>();
  return inputs.filter((item) => {
    if (seen.has(item.name)) {
      return false;
    }
    seen.add(item.name);
    return true;
  });
}

function dedupeRules(rules: ExtractedRule[]): ExtractedRule[] {
  const seen = new Set<string>();
  return rules.filter((item) => {
    const key = `${item.field}:${item.operator}:${String(item.value)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function extractInputsFromTablesAndText(
  rawText: string,
  tables: ExtractedTableBlock[],
): { inputs: ExtractedInputField[]; source: InputSource } {
  const fromTables = dedupeInputs(
    tables
      .filter((table) => table.type === "parameter_table")
      .flatMap((table) => tableToInputs(table)),
  );
  if (fromTables.length > 0) {
    return {
      inputs: fromTables,
      source: "table",
    };
  }

  const kind = detectSpecKind(rawText);
  const catalog = INPUT_CATALOG[kind] ?? INPUT_CATALOG.generic;
  const fromText = catalog
    .filter((item) => item.aliases.some((alias) => rawText.includes(alias)))
    .map(({ aliases, ...field }) => field);

  if (fromText.length > 0) {
    return {
      inputs: dedupeInputs(fromText),
      source: "text",
    };
  }

  return {
    inputs: catalog.map(({ aliases, ...field }) => field),
    source: "default",
  };
}

function extractRulesFromTextAndTables(
  rawText: string,
  tables: ExtractedTableBlock[],
): { rules: ExtractedRule[]; source: RuleSource } {
  const fromTables = dedupeRules(
    tables
      .filter((table) => table.type === "rule_table")
      .flatMap((table) => tableToRules(table)),
  );
  if (fromTables.length > 0) {
    return {
      rules: fromTables,
      source: "table",
    };
  }

  const fromText = dedupeRules(
    rawText
      .split(/\n|。|；|;/)
      .map((line) => parseRuleByText(line))
      .filter((item): item is ExtractedRule => Boolean(item)),
  );
  if (fromText.length > 0) {
    return {
      rules: fromText,
      source: "text",
    };
  }

  return {
    rules: inferDefaultRules(detectSpecKind(rawText)),
    source: "default",
  };
}

function buildCalculationsFromFormulaCandidates(
  formulaCandidates: ExtractedSpecFields["formulaCandidates"],
  kind: SpecKind,
): { calculations: string[]; formulasFull: number; formulasPartial: number } {
  const calculations = formulaCandidates
    .filter((item) => item.completeness === "full" && item.leftVar && item.expression)
    .map((item) => `${item.leftVar} = ${item.expression}`.replace(/\s+/g, " ").trim());
  const uniqueCalculations = Array.from(new Set(calculations));
  const formulasFull = formulaCandidates.filter((item) => item.completeness === "full").length;
  const formulasPartial = formulaCandidates.filter((item) => item.completeness === "partial").length;
  if (uniqueCalculations.length > 0) {
    return {
      calculations: uniqueCalculations,
      formulasFull,
      formulasPartial,
    };
  }
  return {
    calculations: inferDefaultCalculations(kind),
    formulasFull,
    formulasPartial,
  };
}

function extractOutputs(calculations: string[], rules: ExtractedRule[]): string[] {
  const fromCalculations = calculations
    .map((formula) => /^([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(formula)?.[1] ?? "")
    .filter(Boolean);
  const fromRules = rules.map((rule) => rule.field).filter(Boolean);
  const merged = Array.from(new Set([...fromCalculations, ...fromRules]));
  return merged.length > 0 ? merged : ["resultValue"];
}

function extractSignatures(rawText: string): string[] {
  const roles: string[] = [];
  if (/试验|lab/i.test(rawText)) {
    roles.push("lab");
  }
  if (/监理|supervision/i.test(rawText)) {
    roles.push("supervision");
  }
  if (/施工|constructor|contractor/i.test(rawText)) {
    roles.push("constructor");
  }
  if (roles.length === 0) {
    return ["lab", "supervision"];
  }
  if (!roles.includes("lab")) {
    roles.unshift("lab");
  }
  if (!roles.includes("supervision")) {
    roles.push("supervision");
  }
  return Array.from(new Set(roles));
}

export function extractSpecFields(rawText: string, options: PDFToDraftOptions = {}): FieldExtractResult {
  const warnings: PDFDraftWarning[] = [];
  const normalized = normalizeText(rawText);
  const kind = detectSpecKind(normalized);

  // 1. normalizeClauseText
  const clauseNormalizedText = normalizeClauseText(normalized);
  // 2. normalizeFormulaText
  const formulaNormalizedText = normalizeFormulaText(clauseNormalizedText);
  // 3. extractClauseCandidates
  const clauseCandidates = extractClauseCandidates(clauseNormalizedText);
  // 4. extractFormulaCandidates
  const formulaCandidates = extractFormulaCandidates(formulaNormalizedText);
  // 5. extractTableLikeBlocks
  const tableBlocks = extractTableLikeBlocks(formulaNormalizedText);
  // 6. selectPrimaryClause
  const clauseSelection = selectPrimaryClause(clauseCandidates, findLikelyTitleIndex(clauseNormalizedText));
  // 7. tableToInputs / tableToRules (inside helper functions)
  const inputResult = extractInputsFromTablesAndText(formulaNormalizedText, tableBlocks);
  const ruleResult = extractRulesFromTextAndTables(formulaNormalizedText, tableBlocks);
  // 8. build extracted result (below)

  const formulaBuild = buildCalculationsFromFormulaCandidates(formulaCandidates, kind);
  const calculations = formulaBuild.calculations;

  if (!clauseSelection.primaryClause || clauseSelection.confidence === "low") {
    pushWarning(warnings, "CLAUSE_AMBIGUOUS", "条款号识别置信度低，请人工校对。");
  } else if (clauseSelection.confidence === "medium" && clauseSelection.candidates.length > 1) {
    pushWarning(warnings, "CLAUSE_AMBIGUOUS", "检测到多个条款候选，已按标题附近优先选择。");
  }

  if (formulaBuild.formulasFull === 0 || formulaBuild.formulasPartial > 0) {
    pushWarning(warnings, "FORMULA_PARTIAL", "公式抽取存在缺失或片段，请人工校对计算步骤。");
  }

  if (looksLikeTableText(formulaNormalizedText) && tableBlocks.length === 0) {
    pushWarning(warnings, "TABLE_PARSE_PARTIAL", "疑似表格内容未稳定结构化，请人工校对。");
  }

  if (inputResult.source !== "table") {
    pushWarning(warnings, "INPUTS_INFERRED", "输入参数由文本推断或默认补齐，建议人工确认。");
  }
  if (ruleResult.source !== "table") {
    pushWarning(warnings, "RULES_INFERRED", "判定规则由文本推断或默认补齐，建议人工确认。");
  }

  if (warnings.length > 0) {
    pushWarning(warnings, "MANUAL_REVIEW_REQUIRED", "抽取结果存在不确定项，请在注册前进行人工复核。");
  }

  const extracted: ExtractedSpecFields = {
    title: extractTitle(formulaNormalizedText, kind),
    norm: extractNorm(formulaNormalizedText, options),
    clause: clauseSelection.primaryClause ?? "4.2.1",
    clauseConfidence: clauseSelection.confidence,
    clauseCandidates: clauseSelection.candidates,
    version: options.defaultVersion?.trim() || "v1",
    category: options.defaultCategory?.trim() || "subgrade",
    measuredItem: kind === "generic" ? "generic" : kind,
    inputs: inputResult.inputs,
    outputs: extractOutputs(calculations, ruleResult.rules),
    calculations,
    formulaCandidates,
    tableBlocks,
    rules: ruleResult.rules,
    signatures: extractSignatures(formulaNormalizedText),
    dependsOn: [],
  };

  return {
    extracted,
    warnings,
  };
}
