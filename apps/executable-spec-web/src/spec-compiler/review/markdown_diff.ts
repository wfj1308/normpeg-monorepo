import { DRAFT_SECTION_ORDER, splitMarkdownIntoSections, type DraftSectionName } from "./markdown_section_parser.ts";
import { buildSectionRiskMessage, classifySectionRisk, type DraftDiffRiskLevel } from "./risk_classifier.ts";

export type DraftLineDiffType = "added" | "removed" | "modified";
export type DraftSectionChangeType = "added" | "removed" | "modified";

export interface DraftLineDiff {
  type: DraftLineDiffType;
  oldLine?: string;
  newLine?: string;
}

export interface DraftSectionDiff {
  section: DraftSectionName;
  changeType: DraftSectionChangeType;
  riskLevel: DraftDiffRiskLevel;
  message: string;
}

interface DiffOp {
  type: "equal" | "added" | "removed";
  line: string;
}

function normalizeLines(markdown: string): string[] {
  return markdown
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
}

function buildLcsOps(original: string[], edited: string[]): DiffOp[] {
  const n = original.length;
  const m = edited.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (original[i] === edited[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (original[i] === edited[j]) {
      ops.push({ type: "equal", line: original[i] ?? "" });
      i += 1;
      j += 1;
    } else if (dp[i + 1]?.[j] >= dp[i]?.[j + 1]) {
      ops.push({ type: "removed", line: original[i] ?? "" });
      i += 1;
    } else {
      ops.push({ type: "added", line: edited[j] ?? "" });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "removed", line: original[i] ?? "" });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "added", line: edited[j] ?? "" });
    j += 1;
  }

  return ops;
}

export function diffMarkdownLines(original: string, edited: string): DraftLineDiff[] {
  const originalLines = normalizeLines(original);
  const editedLines = normalizeLines(edited);
  const ops = buildLcsOps(originalLines, editedLines);

  const lineDiffs: DraftLineDiff[] = [];
  let cursor = 0;
  while (cursor < ops.length) {
    const op = ops[cursor];
    if (!op || op.type === "equal") {
      cursor += 1;
      continue;
    }

    if (op.type === "removed" && ops[cursor + 1]?.type === "added") {
      lineDiffs.push({
        type: "modified",
        oldLine: op.line,
        newLine: ops[cursor + 1]?.line,
      });
      cursor += 2;
      continue;
    }

    if (op.type === "added") {
      lineDiffs.push({
        type: "added",
        newLine: op.line,
      });
      cursor += 1;
      continue;
    }

    lineDiffs.push({
      type: "removed",
      oldLine: op.line,
    });
    cursor += 1;
  }

  return lineDiffs;
}

function normalizeSectionContent(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

function hasThresholdChange(section: DraftSectionName, originalText: string, editedText: string): boolean {
  if (section !== "判定规则") {
    return false;
  }
  const oldNumbers = originalText.match(/\d+(?:\.\d+)?/g) ?? [];
  const newNumbers = editedText.match(/\d+(?:\.\d+)?/g) ?? [];
  return oldNumbers.join(",") !== newNumbers.join(",");
}

export function diffMarkdownSections(original: string, edited: string): DraftSectionDiff[] {
  const originalSections = splitMarkdownIntoSections(original);
  const editedSections = splitMarkdownIntoSections(edited);

  const sectionDiffs: DraftSectionDiff[] = [];
  for (const sectionName of DRAFT_SECTION_ORDER) {
    const oldText = normalizeSectionContent(originalSections[sectionName]);
    const newText = normalizeSectionContent(editedSections[sectionName]);
    if (oldText === newText) {
      continue;
    }

    const changeType: DraftSectionChangeType = !oldText && newText
      ? "added"
      : oldText && !newText
      ? "removed"
      : "modified";
    const riskLevel = classifySectionRisk(sectionName);
    const message = hasThresholdChange(sectionName, oldText, newText)
      ? "判定阈值发生变化，请重点确认"
      : buildSectionRiskMessage(sectionName, changeType, riskLevel);

    sectionDiffs.push({
      section: sectionName,
      changeType,
      riskLevel,
      message,
    });
  }

  return sectionDiffs;
}
