function normalizeFullWidthDigits(text: string): string {
  return text.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function normalizeClauseLiteral(text: string): string {
  return text
    .replace(/第\s*([0-9]+(?:\s*[.．。]\s*[0-9A-Za-z]+){1,4}(?:\s*-\s*[0-9A-Za-z]+)?)\s*条/g, "$1")
    .replace(/条款号?\s*[:：]?\s*第?\s*/g, "条款号: ");
}

function fixCommonOcrMistakes(text: string): string {
  return text
    .replace(/(\d+\.\d+\.)[lI|]/g, "$11")
    .replace(/(\d+\.)[lI|](\.\d+)/g, "$11$2")
    .replace(/(\d)\s*[.．。]\s*([lI|])\b/g, "$1.1")
    .replace(/([0-9])\s*[.．。]\s*o\b/gi, "$1.0")
    .replace(/([0-9])\s*[.．。]\s*O\b/g, "$1.0");
}

export function normalizeClauseText(rawText: string): string {
  let normalized = rawText.replace(/\r\n?/g, "\n").replace(/\u3000/g, " ");
  normalized = normalizeFullWidthDigits(normalized);
  normalized = normalized.replace(/[．。｡]/g, ".");
  normalized = normalizeClauseLiteral(normalized);
  normalized = fixCommonOcrMistakes(normalized);
  normalized = normalized.replace(/[ \t]{2,}/g, " ");
  normalized = normalized.replace(/[ ]+\n/g, "\n");
  return normalized.trim();
}
