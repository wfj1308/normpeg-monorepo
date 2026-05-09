import type { ExtractedTableBlock } from "./types.ts";

function normalizeTableText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u3000/g, " ").replace(/\t/g, "  ");
}

function splitColumns(line: string): string[] {
  if (line.includes("|") || line.includes("│")) {
    return line
      .split(/[|│]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return line
    .split(/\s{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPotentialTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.includes("|") || trimmed.includes("│")) {
    return true;
  }
  const columns = splitColumns(trimmed);
  if (columns.length >= 3) {
    return true;
  }
  if (columns.length >= 2 && /(>=|<=|>|<|≥|≤|不小于|不大于|\d+(\.\d+)?%?)/.test(trimmed)) {
    return true;
  }
  return false;
}

function looksLikeHeader(columns: string[]): boolean {
  const joined = columns.join(" ");
  return /参数|项目|名称|单位|说明|允许值|指标|频率|责任人|方法|字段/.test(joined);
}

function detectTypeByCorpus(corpus: string): ExtractedTableBlock["type"] {
  if (/参数|单位|说明|名称|字段|类型|输入/.test(corpus)) {
    return "parameter_table";
  }
  if (/允许值|判定|合格|应不|不小于|不大于|>=|<=|＞=|＜=/.test(corpus)) {
    return "rule_table";
  }
  if (/频率|责任|签字|角色/.test(corpus)) {
    return "responsibility_table";
  }
  return "unknown_table";
}

export function classifyTableBlock(block: Pick<ExtractedTableBlock, "headers" | "rows">): ExtractedTableBlock["type"] {
  const corpus = `${block.headers.join(" ")} ${block.rows.flat().join(" ")}`;
  return detectTypeByCorpus(corpus);
}

export function extractTableLikeBlocks(rawText: string): ExtractedTableBlock[] {
  const normalized = normalizeTableText(rawText);
  const lines = normalized.split("\n");
  const blocks: ExtractedTableBlock[] = [];

  let indexOffset = 0;
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (!isPotentialTableLine(line)) {
      indexOffset += line.length + 1;
      cursor += 1;
      continue;
    }

    const blockStart = indexOffset;
    const groupLines: string[] = [];
    while (cursor < lines.length && isPotentialTableLine(lines[cursor] ?? "")) {
      const current = (lines[cursor] ?? "").trim();
      if (current) {
        groupLines.push(current);
      }
      indexOffset += (lines[cursor] ?? "").length + 1;
      cursor += 1;
    }

    if (groupLines.length < 2) {
      continue;
    }

    const parsedRows = groupLines
      .map((row) => splitColumns(row))
      .filter((row) => row.length >= 2);

    if (parsedRows.length < 2) {
      continue;
    }

    let headers: string[] = [];
    let rows: string[][] = [];
    if (looksLikeHeader(parsedRows[0] ?? [])) {
      headers = parsedRows[0] ?? [];
      rows = parsedRows.slice(1);
    } else {
      const maxCols = Math.max(...parsedRows.map((row) => row.length));
      headers = Array.from({ length: maxCols }, (_unused, idx) => `col_${idx + 1}`);
      rows = parsedRows;
    }

    const type = classifyTableBlock({ headers, rows });
    blocks.push({
      type,
      headers,
      rows,
      startIndex: blockStart,
    });
  }

  return blocks;
}
