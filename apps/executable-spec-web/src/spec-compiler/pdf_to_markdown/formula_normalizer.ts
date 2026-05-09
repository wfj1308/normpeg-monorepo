function normalizeFormulaOperators(text: string): string {
  return text
    .replace(/[×＊xX]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/[％﹪]/g, "%");
}

function normalizeBrackets(text: string): string {
  return text
    .replace(/[（﹙]/g, "(")
    .replace(/[）﹚]/g, ")")
    .replace(/[【]/g, "[")
    .replace(/[】]/g, "]");
}

function mergeBrokenFormulaLines(text: string): string {
  return text
    .replace(/([A-Za-z_\u4e00-\u9fa5])\s*\n\s*([=+\-*/()0-9A-Za-z_\u4e00-\u9fa5])/g, "$1 $2")
    .replace(/([=+\-*/(])\s*\n\s*([0-9A-Za-z_\u4e00-\u9fa5])/g, "$1 $2")
    .replace(/([0-9A-Za-z_\u4e00-\u9fa5])\s*\n\s*([+\-*/)%])/g, "$1 $2");
}

export function normalizeFormulaText(rawText: string): string {
  let normalized = rawText.replace(/\r\n?/g, "\n").replace(/\u3000/g, " ");
  normalized = normalizeFormulaOperators(normalized);
  normalized = normalizeBrackets(normalized);
  normalized = mergeBrokenFormulaLines(normalized);
  normalized = normalized.replace(/[ \t]{2,}/g, " ");
  normalized = normalized.replace(/[ ]+\n/g, "\n");
  return normalized.trim();
}
