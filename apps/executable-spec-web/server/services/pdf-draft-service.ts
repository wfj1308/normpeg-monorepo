import { pdfToDraftMarkdown, type PDFToDraftOptions } from "../../src/spec-compiler/pdf_to_markdown/index.ts";

export function generateDraftMarkdownFromPDF(pdfBuffer: Buffer, options: PDFToDraftOptions = {}) {
  return pdfToDraftMarkdown(pdfBuffer, options);
}
