import { inflateRawSync, inflateSync } from "node:zlib";

interface ParsedPdfObject {
  id: number;
  body: string;
  index: number;
}

function toBuffer(file: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(file)) {
    return file;
  }
  if (file instanceof Uint8Array) {
    return Buffer.from(file);
  }
  return Buffer.from(file);
}

function decodePdfEscapedText(text: string): string {
  return text
    .replace(/\\([nrtbf\\()])/g, (_whole, ch: string) => {
      if (ch === "n") {
        return "\n";
      }
      if (ch === "r") {
        return "\r";
      }
      if (ch === "t") {
        return "\t";
      }
      if (ch === "b") {
        return "\b";
      }
      if (ch === "f") {
        return "\f";
      }
      return ch;
    })
    .replace(/\\([0-7]{1,3})/g, (_whole, oct: string) => String.fromCharCode(parseInt(oct, 8)));
}

function extractParenthesisStrings(text: string): string[] {
  const matches = text.match(/\((?:\\.|[^\\()])*\)/g) ?? [];
  return matches
    .map((item) => item.slice(1, -1))
    .map((item) => decodePdfEscapedText(item))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function tryInflate(content: Buffer): Buffer | null {
  if (content.length === 0) {
    return null;
  }
  try {
    return inflateSync(content);
  } catch {
    // Ignore.
  }
  try {
    return inflateRawSync(content);
  } catch {
    // Ignore.
  }
  return null;
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parsePdfObjects(source: string): ParsedPdfObject[] {
  const objects: ParsedPdfObject[] = [];
  const objectPattern = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj/g;
  let match = objectPattern.exec(source);
  while (match) {
    const id = Number(match[1]);
    const body = match[2] ?? "";
    if (Number.isFinite(id)) {
      objects.push({
        id,
        body,
        index: match.index,
      });
    }
    match = objectPattern.exec(source);
  }
  return objects;
}

function getLatestObjectMap(objects: ParsedPdfObject[]): Map<number, ParsedPdfObject> {
  const latestById = new Map<number, ParsedPdfObject>();
  for (const obj of objects) {
    latestById.set(obj.id, obj);
  }
  return latestById;
}

function isPageObject(body: string): boolean {
  return /\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body);
}

function extractContentObjectIds(pageBody: string): number[] {
  const result = new Set<number>();

  const arrayMatch = /\/Contents\s*\[([\s\S]*?)\]/.exec(pageBody);
  if (arrayMatch?.[1]) {
    const refPattern = /(\d+)\s+\d+\s+R/g;
    let refMatch = refPattern.exec(arrayMatch[1]);
    while (refMatch) {
      result.add(Number(refMatch[1]));
      refMatch = refPattern.exec(arrayMatch[1]);
    }
  }

  const singlePattern = /\/Contents\s+(\d+)\s+\d+\s+R/g;
  let singleMatch = singlePattern.exec(pageBody);
  while (singleMatch) {
    result.add(Number(singleMatch[1]));
    singleMatch = singlePattern.exec(pageBody);
  }

  return Array.from(result).filter((value) => Number.isFinite(value));
}

function extractTextFromObjectBody(body: string): string {
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const texts: string[] = [];
  let streamMatch = streamPattern.exec(body);
  while (streamMatch) {
    const raw = streamMatch[1] ?? "";
    const rawBuffer = Buffer.from(raw, "latin1");
    const inflated = tryInflate(rawBuffer);
    const decoded = (inflated ?? rawBuffer).toString("utf8");
    texts.push(...extractParenthesisStrings(decoded));
    streamMatch = streamPattern.exec(body);
  }
  return normalizeExtractedText(texts.join("\n"));
}

function collectStreamText(buffer: Buffer): string[] {
  const source = buffer.toString("latin1");
  const texts: string[] = [];
  const marker = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null = marker.exec(source);
  while (match) {
    const raw = match[1] ?? "";
    const rawBuffer = Buffer.from(raw, "latin1");
    const inflated = tryInflate(rawBuffer);
    const decoded = (inflated ?? rawBuffer).toString("utf8");
    texts.push(...extractParenthesisStrings(decoded));
    match = marker.exec(source);
  }
  return texts;
}

function estimatePageCountBySource(source: string): number {
  const matches = source.match(/\/Type\s*\/Page\b/g) ?? [];
  return Math.max(matches.length, 1);
}

function chunkTextsToPages(texts: string[], pageCount: number): string[] {
  if (pageCount <= 1) {
    return [normalizeExtractedText(texts.join("\n"))];
  }
  const pages: string[] = Array.from({ length: pageCount }, () => "");
  const chunkSize = Math.max(1, Math.ceil(texts.length / pageCount));
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const start = pageIndex * chunkSize;
    const end = start + chunkSize;
    pages[pageIndex] = normalizeExtractedText(texts.slice(start, end).join("\n"));
  }
  return pages;
}

export function getPdfPageCount(file: Buffer | Uint8Array | ArrayBuffer): number {
  const source = toBuffer(file).toString("latin1");
  return estimatePageCountBySource(source);
}

export function extractTextPagesFromPDF(file: Buffer | Uint8Array | ArrayBuffer): string[] {
  const buffer = toBuffer(file);
  if (buffer.length === 0) {
    throw new Error("PDF 文件为空");
  }

  const source = buffer.toString("latin1");
  const objects = parsePdfObjects(source);
  if (objects.length > 0) {
    const latestObjectMap = getLatestObjectMap(objects);
    const pageObjects = Array.from(latestObjectMap.values())
      .filter((item) => isPageObject(item.body))
      .sort((a, b) => a.index - b.index);

    if (pageObjects.length > 0) {
      const pages = pageObjects.map((pageObj) => {
        const contentIds = extractContentObjectIds(pageObj.body);
        const texts: string[] = [];
        for (const contentId of contentIds) {
          const contentObject = latestObjectMap.get(contentId);
          if (!contentObject) {
            continue;
          }
          const text = extractTextFromObjectBody(contentObject.body);
          if (text) {
            texts.push(text);
          }
        }
        return normalizeExtractedText(texts.join("\n"));
      });
      if (pages.length > 0) {
        return pages;
      }
    }
  }

  const streamTexts = collectStreamText(buffer);
  if (streamTexts.length > 0) {
    const pageCount = estimatePageCountBySource(source);
    return chunkTextsToPages(streamTexts, pageCount);
  }

  const fallback = buffer
    .toString("utf8")
    .replace(/[^\u0009\u000A\u000D\u0020-\u007E\u4E00-\u9FFF()【】《》：；，。+\-*/_=<>%]/g, " ")
    .replace(/[ \t]{2,}/g, " ");
  const normalizedFallback = normalizeExtractedText(fallback);
  if (!normalizedFallback) {
    throw new Error("无法从 PDF 提取文本（仅支持文本型 PDF 或可 OCR 的扫描 PDF）");
  }
  return [normalizedFallback];
}

export function extractTextFromPDF(file: Buffer | Uint8Array | ArrayBuffer): string {
  const pages = extractTextPagesFromPDF(file);
  const merged = normalizeExtractedText(pages.filter((item) => item.trim().length > 0).join("\n\n"));
  if (!merged) {
    throw new Error("无法从 PDF 提取文本（仅支持文本型 PDF 或可 OCR 的扫描 PDF）");
  }
  return merged;
}
