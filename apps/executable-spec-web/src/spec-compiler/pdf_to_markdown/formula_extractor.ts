import { normalizeFormulaText } from "./formula_normalizer.ts";
import type { FormulaCandidate } from "./types.ts";

export const formulaAliasMap: Record<string, string> = {
  压实度: "compactionDegree",
  干密度: "dryDensity",
  湿密度: "wetDensity",
  最大干密度: "maxDryDensity",
  含水率: "moistureContent",
  灌入砂质量: "massHoleSand",
  标定体积: "volumeSand",
  实测厚度: "measuredThickness",
  设计厚度: "designThickness",
  厚度偏差: "thicknessDeviation",
  厚度比: "thicknessRatio",
  实测弯沉: "measuredDeflection",
  允许最大弯沉: "maxAllowedDeflection",
  弯沉余量: "deflectionMargin",
};

const sortedAliasTerms = Object.keys(formulaAliasMap).sort((a, b) => b.length - a.length);

interface RawFormulaCandidate {
  originalText: string;
  index: number;
}

function normalizeFormulaIdentifier(value: string): string {
  const cleaned = value.trim().replace(/[()（）【】[\]]/g, "");
  for (const term of sortedAliasTerms) {
    if (cleaned.includes(term)) {
      return formulaAliasMap[term] ?? cleaned;
    }
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

function normalizeFormulaExpression(expression: string): string {
  let output = expression.trim();
  for (const term of sortedAliasTerms) {
    output = output.replace(new RegExp(term, "g"), formulaAliasMap[term] ?? term);
  }
  output = output.replace(/([0-9]+(?:\.[0-9]+)?)\s*%/g, "$1");
  output = output
    .replace(/[^\w\s+\-*/().%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output;
}

function dedupeRawCandidates(values: RawFormulaCandidate[]): RawFormulaCandidate[] {
  const seen = new Set<string>();
  return values
    .slice()
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      const key = `${item.index}:${item.originalText}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

export function extractFormulaCandidates(rawText: string): FormulaCandidate[] {
  const normalized = normalizeFormulaText(rawText);
  const candidates: RawFormulaCandidate[] = [];

  const equationPattern = /([^\n；;。]{1,80}?)\s*(?:=|＝)\s*([^\n；;。]{1,180})/g;
  let equation = equationPattern.exec(normalized);
  while (equation) {
    const left = (equation[1] ?? "").trim();
    const right = (equation[2] ?? "").trim();
    if (left && right) {
      candidates.push({
        originalText: `${left} = ${right}`,
        index: equation.index,
      });
    }
    equation = equationPattern.exec(normalized);
  }

  const textHintPattern = /([^\n；;。]{1,40})(?:按下式计算|按下列公式计算|计算公式如下|按公式计算)/g;
  let hint = textHintPattern.exec(normalized);
  while (hint) {
    const text = (hint[0] ?? "").trim();
    if (text) {
      candidates.push({
        originalText: text,
        index: hint.index,
      });
    }
    hint = textHintPattern.exec(normalized);
  }

  return dedupeRawCandidates(candidates).map((candidate) => standardizeFormulaCandidate(candidate));
}

export function standardizeFormulaCandidate(candidate: { originalText: string; index?: number }): FormulaCandidate {
  const normalized = normalizeFormulaText(candidate.originalText);
  const eqMatch = /^(.+?)\s*(?:=|＝)\s*(.+)$/.exec(normalized);

  if (!eqMatch?.[1] || !eqMatch[2]) {
    return {
      originalText: candidate.originalText,
      leftVar: null,
      expression: null,
      completeness: "partial",
      index: candidate.index ?? 0,
    };
  }

  const leftVar = normalizeFormulaIdentifier(eqMatch[1]);
  const expression = normalizeFormulaExpression(eqMatch[2]);
  const isExpressionValid = /[+\-*/()]|\w+\s*\/\s*\w+|\w+\s*\*\s*\w+/.test(expression) || /^\w+$/.test(expression);
  const completeness: FormulaCandidate["completeness"] =
    leftVar && expression && isExpressionValid ? "full" : "partial";

  return {
    originalText: candidate.originalText,
    leftVar: leftVar || null,
    expression: expression || null,
    completeness,
    index: candidate.index ?? 0,
  };
}
