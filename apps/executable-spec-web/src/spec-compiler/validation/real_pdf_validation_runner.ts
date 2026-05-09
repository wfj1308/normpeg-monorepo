import fs from "node:fs";
import path from "node:path";

import { PlatformService } from "../../platform/workflow/platform-service.ts";
import type { RuleConfig } from "../calibration/rule_config.ts";
import { pdfToDraftMarkdown, type PDFToDraftOptions } from "../pdf_to_markdown/index.ts";
import { compileMarkdownToJSON } from "../json_compiler.ts";
import { lintMarkdownSpec } from "../markdown_linter.ts";
import { parseMarkdownSpec } from "../markdown_parser.ts";
import { registerSPU } from "../register_markdown.ts";
import {
  buildClauseReviewItems,
  buildPreRegisterReview,
  type ClauseReviewItem,
  type ClauseReviewResult,
  type DraftDiffReviewResult,
  type ExtractionWarning,
  type PreRegisterDecision,
  type RiskReviewResult,
} from "../review/index.ts";

export interface RealPdfValidationResult {
  fileName: string;
  extraction: {
    rawTextLength: number;
    ocrUsed: boolean;
    warnings: ExtractionWarning[];
  };
  draft: {
    originalDraftMarkdown: string;
    editedMarkdown: string;
  };
  riskReview: RiskReviewResult;
  diffReview: DraftDiffReviewResult;
  clauseReview: ClauseReviewResult;
  preRegisterDecision: PreRegisterDecision;
  lint: {
    valid: boolean;
    errors: Array<{ code: string; section: string; message: string; line?: number }>;
    warnings: Array<{ code: string; section: string; message: string; line?: number }>;
  };
  compile?: {
    success: boolean;
    spuId?: string;
    error?: string;
  };
  register?: {
    success: boolean;
    blocked?: boolean;
    error?: string;
  };
}

export interface RealPdfValidationOptions {
  editedMarkdown?: string;
  reviewedWarnings?: ExtractionWarning[];
  clauseReviewItems?: ClauseReviewItem[];
  ruleConfig?: RuleConfig;
  confirmClauseMode?: "none" | "high_required" | "all";
  confirmWarning?: boolean;
  pdfToDraftOptions?: PDFToDraftOptions;
  service?: PlatformService;
}

export interface RealPdfValidationCaseInput {
  file: string | Buffer | Uint8Array | ArrayBuffer;
  fileName?: string;
  options?: RealPdfValidationOptions;
}

function cloneClauseItems(items: ClauseReviewItem[]): ClauseReviewItem[] {
  return items.map((item) => ({ ...item }));
}

function applyClauseConfirmMode(items: ClauseReviewItem[], mode: RealPdfValidationOptions["confirmClauseMode"]): ClauseReviewItem[] {
  if (mode === "all") {
    return items.map((item) => ({ ...item, confirmed: true }));
  }
  if (mode === "high_required") {
    return items.map((item) => {
      if (item.required && item.riskLevel === "high") {
        return { ...item, confirmed: true };
      }
      return item;
    });
  }
  return items;
}

function resolveFileInput(input: string | Buffer | Uint8Array | ArrayBuffer, fileName?: string): { buffer: Buffer; fileName: string } {
  if (typeof input === "string") {
    const absolutePath = path.resolve(input);
    return {
      buffer: fs.readFileSync(absolutePath),
      fileName: fileName ?? path.basename(absolutePath),
    };
  }
  let buffer: Buffer;
  if (Buffer.isBuffer(input)) {
    buffer = input;
  } else if (input instanceof Uint8Array) {
    buffer = Buffer.from(input);
  } else {
    buffer = Buffer.from(new Uint8Array(input));
  }
  return {
    buffer,
    fileName: fileName ?? "sample.pdf",
  };
}

export async function validateRealPdfSample(
  file: string | Buffer | Uint8Array | ArrayBuffer,
  options: RealPdfValidationOptions = {},
): Promise<RealPdfValidationResult> {
  const resolved = resolveFileInput(file);
  const parsed = pdfToDraftMarkdown(resolved.buffer, options.pdfToDraftOptions ?? {});
  const originalDraftMarkdown = parsed.draftMarkdown;
  const editedMarkdown = options.editedMarkdown ?? originalDraftMarkdown;
  const effectiveWarnings = options.reviewedWarnings ?? (parsed.warnings as ExtractionWarning[]);

  const clauseSeed = options.clauseReviewItems
    ? cloneClauseItems(options.clauseReviewItems)
    : buildClauseReviewItems(editedMarkdown, options.ruleConfig);
  const clauseReviewItems = applyClauseConfirmMode(clauseSeed, options.confirmClauseMode ?? "none");

  const review = buildPreRegisterReview({
    warnings: effectiveWarnings,
    originalDraftMarkdown,
    editedMarkdown,
    clauseReviewItems,
  }, options.ruleConfig);

  const lintResult = lintMarkdownSpec(editedMarkdown);
  const output: RealPdfValidationResult = {
    fileName: resolved.fileName,
    extraction: {
      rawTextLength: parsed.rawText.length,
      ocrUsed: parsed.ocrUsed,
      warnings: effectiveWarnings,
    },
    draft: {
      originalDraftMarkdown,
      editedMarkdown,
    },
    riskReview: review.riskReview,
    diffReview: review.diffReview,
    clauseReview: review.clauseReview,
    preRegisterDecision: review.finalDecision,
    lint: {
      valid: lintResult.valid,
      errors: lintResult.errors,
      warnings: lintResult.warnings,
    },
  };

  if (!review.finalDecision.canRegister) {
    output.register = {
      success: false,
      blocked: true,
      error: "PRE_REGISTER_BLOCKED",
    };
    return output;
  }

  if (!lintResult.valid) {
    output.register = {
      success: false,
      blocked: false,
      error: "LINT_FAILED",
    };
    return output;
  }

  try {
    const parsedMarkdown = parseMarkdownSpec(editedMarkdown);
    const compiled = compileMarkdownToJSON(parsedMarkdown);
    output.compile = {
      success: true,
      spuId: compiled.spuId,
    };

    if (review.finalDecision.status === "warning" && options.confirmWarning === false) {
      output.register = {
        success: false,
        blocked: false,
        error: "WARNING_NOT_CONFIRMED",
      };
      return output;
    }

    const service = options.service ?? new PlatformService();
    const registered = registerSPU(service, compiled);
    if (!registered.success) {
      output.register = {
        success: false,
        blocked: false,
        error: registered.error,
      };
      return output;
    }
    output.register = {
      success: true,
    };
    return output;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    output.compile = {
      success: false,
      error: message,
    };
    output.register = {
      success: false,
      blocked: false,
      error: "COMPILE_FAILED",
    };
    return output;
  }
}

export async function validateRealPdfSamples(
  cases: RealPdfValidationCaseInput[],
): Promise<RealPdfValidationResult[]> {
  const results: RealPdfValidationResult[] = [];
  for (const item of cases) {
    const resolved = resolveFileInput(item.file, item.fileName);
    const result = await validateRealPdfSample(resolved.buffer, item.options ?? {});
    results.push({
      ...result,
      fileName: item.fileName ?? resolved.fileName,
    });
  }
  return results;
}
