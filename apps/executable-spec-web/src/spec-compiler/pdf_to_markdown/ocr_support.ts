import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPdfPageCount } from "./pdf_text_extractor.ts";

export interface OCRProvider {
  recognize(image: Buffer): string;
}

export interface OCRPageResult {
  pageIndex: number;
  text: string;
  success: boolean;
  noisy: boolean;
  error?: string;
}

export interface OCRExtractionResult {
  pageResults: OCRPageResult[];
  text: string;
  usedPageIndexes: number[];
  failedPageIndexes: number[];
  noisyPageIndexes: number[];
}

class TesseractOCRProvider implements OCRProvider {
  recognize(image: Buffer): string {
    const workDir = mkdtempSync(join(tmpdir(), "normpeg-ocr-image-"));
    const imagePath = join(workDir, "page.png");
    try {
      writeFileSync(imagePath, image);
      const output = execFileSync(
        "tesseract",
        [imagePath, "stdout", "-l", "chi_sim+eng", "--psm", "6"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
      return String(output ?? "");
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}

let runtimeOCRProvider: OCRProvider = new TesseractOCRProvider();
let runtimePageImageExtractor: ((file: Buffer | Uint8Array | ArrayBuffer, pageIndex: number) => Buffer) | null = null;

function toBuffer(file: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(file)) {
    return file;
  }
  if (file instanceof Uint8Array) {
    return Buffer.from(file);
  }
  return Buffer.from(file);
}

function validCharacterRatio(text: string): number {
  if (!text) {
    return 0;
  }
  const validChars = text.match(/[A-Za-z0-9\u4E00-\u9FFF，。；：、（）()%+\-*/=<>\[\]\s]/g) ?? [];
  return validChars.length / Math.max(text.length, 1);
}

function isLikelyNoisyText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (trimmed.length < 25) {
    return true;
  }
  if (validCharacterRatio(trimmed) < 0.58) {
    return true;
  }
  if ((trimmed.match(/[�]/g) ?? []).length >= 2) {
    return true;
  }
  return false;
}

export function shouldUseOCR(pageText: string): boolean {
  const normalized = pageText.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return true;
  }
  const ratio = validCharacterRatio(normalized);
  if (ratio < 0.62) {
    return true;
  }
  const alphaNumOrCn = normalized.match(/[A-Za-z0-9\u4E00-\u9FFF]/g)?.length ?? 0;
  const hasStructuredSpecKeywords = /(条款|压实度|厚度|弯沉|规范|公式|检测|签字|JTG|GB)/i.test(normalized);
  if (normalized.length < 50) {
    if (ratio >= 0.85 && alphaNumOrCn >= 12 && hasStructuredSpecKeywords) {
      return false;
    }
    return true;
  }
  if (alphaNumOrCn < 24 && !hasStructuredSpecKeywords) {
    return true;
  }
  return false;
}

function defaultExtractPageImage(file: Buffer | Uint8Array | ArrayBuffer, pageIndex: number): Buffer {
  const page = pageIndex + 1;
  const workDir = mkdtempSync(join(tmpdir(), "normpeg-ocr-pdf-"));
  const pdfPath = join(workDir, "input.pdf");
  const outputPrefix = join(workDir, `page_${page}`);
  const outputImagePath = `${outputPrefix}.png`;
  try {
    writeFileSync(pdfPath, toBuffer(file));
    execFileSync(
      "pdftoppm",
      ["-f", String(page), "-l", String(page), "-singlefile", "-png", pdfPath, outputPrefix],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    return readFileSync(outputImagePath);
  } finally {
    try {
      unlinkSync(outputImagePath);
    } catch {
      // Ignore.
    }
    rmSync(workDir, { recursive: true, force: true });
  }
}

export function extractPageImage(file: Buffer | Uint8Array | ArrayBuffer, pageIndex: number): Buffer {
  if (runtimePageImageExtractor) {
    return runtimePageImageExtractor(file, pageIndex);
  }
  return defaultExtractPageImage(file, pageIndex);
}

export function runOCROnImage(image: Buffer): string {
  return runtimeOCRProvider.recognize(image);
}

export function normalizeOCRText(raw: string): string {
  const normalized = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[×xX]/g, "*")
    .replace(/％/g, "%")
    .replace(/（/g, "(")
    .replace(/）/g, ")");

  const contextFixed = normalized
    .replace(/(?<=\d)O(?=\d)/g, "0")
    .replace(/(?<=\d)[lI](?=\d)/g, "1")
    .replace(/(?<=\d)[o](?=\d)/g, "0");

  const lines = contextFixed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^第?\s*\d+\s*页(?:\s*\/\s*\d+)?$/i.test(line))
    .filter((line) => !/^page\s*\d+(?:\s*of\s*\d+)?$/i.test(line))
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^www\./i.test(line));

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractTextWithOCR(
  file: Buffer | Uint8Array | ArrayBuffer,
  pageIndexes?: number[],
): OCRExtractionResult {
  const totalPages = getPdfPageCount(file);
  const targets = (pageIndexes && pageIndexes.length > 0)
    ? Array.from(new Set(pageIndexes)).filter((pageIndex) => pageIndex >= 0 && pageIndex < totalPages)
    : Array.from({ length: totalPages }, (_unused, index) => index);

  const pageResults: OCRPageResult[] = [];
  for (const pageIndex of targets) {
    try {
      const image = extractPageImage(file, pageIndex);
      const rawText = runOCROnImage(image);
      const text = normalizeOCRText(rawText);
      pageResults.push({
        pageIndex,
        text,
        success: true,
        noisy: isLikelyNoisyText(text),
      });
    } catch (reason) {
      pageResults.push({
        pageIndex,
        text: "",
        success: false,
        noisy: true,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    }
  }

  const usedPageIndexes = pageResults.filter((item) => item.success && item.text.length > 0).map((item) => item.pageIndex);
  const failedPageIndexes = pageResults.filter((item) => !item.success).map((item) => item.pageIndex);
  const noisyPageIndexes = pageResults.filter((item) => item.noisy).map((item) => item.pageIndex);

  return {
    pageResults,
    text: pageResults.map((item) => item.text).filter((item) => item.length > 0).join("\n\n"),
    usedPageIndexes,
    failedPageIndexes,
    noisyPageIndexes,
  };
}

export function setOCRProvider(provider: OCRProvider): void {
  runtimeOCRProvider = provider;
}

export function setPageImageExtractorForTesting(
  extractor: ((file: Buffer | Uint8Array | ArrayBuffer, pageIndex: number) => Buffer) | null,
): void {
  runtimePageImageExtractor = extractor;
}

export function resetOCRRuntimeForTesting(): void {
  runtimeOCRProvider = new TesseractOCRProvider();
  runtimePageImageExtractor = null;
}
