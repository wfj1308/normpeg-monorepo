import { SpecBotDualOutput } from "../specbot/core/dual-output.ts";

import { compileMarkdownToJSON } from "./json_compiler.ts";
import { lintMarkdownSpec } from "./markdown_linter.ts";
import { parseMarkdownSpec } from "./markdown_parser.ts";

import type { SPU } from "../spu-types.ts";
import type { SpecLintResult } from "./lint_types.ts";
import type { CompiledMarkdownSpecJSON, ParsedMarkdownSpec } from "./schemas.ts";

export type SpecCompileSource = "template" | "pdf" | "markdown";
export type SpecCompileFailureStage = "lint" | "compile" | "bundle";

export interface CompiledSpecBundle {
  fileName: string;
  byteLength: number;
  base64: string;
}

export interface CompileResultSuccess {
  success: true;
  stage: "completed";
  source: SpecCompileSource;
  compiledAt: string;
  spuId: string;
}

export interface CompileResultFailure {
  success: false;
  stage: SpecCompileFailureStage;
  source: SpecCompileSource;
  compiledAt: string;
  error: string;
}

export type CompileResult = CompileResultSuccess | CompileResultFailure;

export interface CompileSpecSuccess {
  success: true;
  source: SpecCompileSource;
  lintResult: SpecLintResult;
  compileResult: CompileResultSuccess;
  parsed: ParsedMarkdownSpec;
  spu: CompiledMarkdownSpecJSON;
  // Backward-compatible alias.
  spuSchema: CompiledMarkdownSpecJSON;
  specbundle: CompiledSpecBundle;
}

export interface CompileSpecFailure {
  success: false;
  source: SpecCompileSource;
  lintResult: SpecLintResult;
  compileResult: CompileResultFailure;
  parsed: ParsedMarkdownSpec | null;
  spu: null;
  // Backward-compatible alias.
  spuSchema: null;
  specbundle: null;
}

export type CompileSpecOutput = CompileSpecSuccess | CompileSpecFailure;

export interface CompileSpecOptions {
  source?: SpecCompileSource;
  proofExtensions?: Record<string, unknown> | ((ctx: { source: SpecCompileSource; spuId: string }) => Record<string, unknown>);
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSpuSchemaRuntimeShape(schema: CompiledMarkdownSpecJSON): SPU {
  const schemaMeta = schema.meta as Record<string, unknown>;
  return {
    spuId: schema.spuId,
    meta: {
      name: schema.meta.name,
      norm: schema.meta.norm,
      clause: schema.meta.clause,
      version: schema.meta.version,
      category: String(schemaMeta.category ?? ""),
      workItem: String(schemaMeta.workItem ?? ""),
      measuredItem: String(schemaMeta.measuredItem ?? ""),
    },
    forms: [],
    data: {
      inputs: schema.data.inputs.map((item) => ({
        name: item.name,
        type: item.type,
        label: item.label,
      })),
      outputs: schema.data.outputs.map((name) => ({ name })),
    },
    path: schema.path.map((item) => ({
      step: item.step,
      formula: item.formula,
    })),
    rules: schema.rules.map((item, index) => ({
      ruleId: `RULE-${String(index + 1).padStart(3, "0")}`,
      field: item.field,
      operator: item.operator,
      value: item.value,
      message: item.message,
    })),
    proof: {
      resultField: schema.proof.resultField,
      passMessage: "PASS",
      failMessage: "FAIL",
      requiredSignatures: [...schema.proof.requiredSignatures],
      schemaVersion: "node-proof@v1",
      extensions: schema.proof.extensions ? { ...schema.proof.extensions } : undefined,
    },
  };
}

function toBuffer(bundle: Uint8Array | Buffer): Buffer {
  return Buffer.isBuffer(bundle) ? bundle : Buffer.from(bundle);
}

function buildLintStageFailure(
  source: SpecCompileSource,
  lintResult: SpecLintResult,
  compiledAt: string,
): CompileSpecFailure {
  return {
    success: false,
    source,
    lintResult,
    compileResult: {
      success: false,
      stage: "lint",
      source,
      compiledAt,
      error: "LINT_FAILED",
    },
    parsed: null,
    spu: null,
    spuSchema: null,
    specbundle: null,
  };
}

function buildCompileFailure(
  source: SpecCompileSource,
  lintResult: SpecLintResult,
  compiledAt: string,
  stage: "compile" | "bundle",
  error: unknown,
  parsed: ParsedMarkdownSpec | null,
): CompileSpecFailure {
  return {
    success: false,
    source,
    lintResult,
    compileResult: {
      success: false,
      stage,
      source,
      compiledAt,
      error: error instanceof Error ? error.message : String(error),
    },
    parsed,
    spu: null,
    spuSchema: null,
    specbundle: null,
  };
}

export async function compileSpec(markdown: string, options: CompileSpecOptions = {}): Promise<CompileSpecOutput> {
  const source = options.source ?? "markdown";
  const compiledAt = nowIso();
  const lintResult = lintMarkdownSpec(markdown);
  if (!lintResult.valid) {
    return buildLintStageFailure(source, lintResult, compiledAt);
  }

  let parsed: ParsedMarkdownSpec;
  let spuSchema: CompiledMarkdownSpecJSON;
  try {
    parsed = parseMarkdownSpec(markdown);
    spuSchema = compileMarkdownToJSON(parsed);
    const resolvedProofExtensions = typeof options.proofExtensions === "function"
      ? options.proofExtensions({ source, spuId: spuSchema.spuId })
      : options.proofExtensions;
    if (resolvedProofExtensions && Object.keys(resolvedProofExtensions).length > 0) {
      const existing = spuSchema.proof.extensions;
      spuSchema.proof.extensions = {
        ...(existing && typeof existing === "object" ? existing : {}),
        ...resolvedProofExtensions,
      };
    }
  } catch (error) {
    return buildCompileFailure(source, lintResult, compiledAt, "compile", error, null);
  }

  try {
    const specBot = new SpecBotDualOutput();
    const output = await specBot.generate(toSpuSchemaRuntimeShape(spuSchema));
    const bundleBuffer = toBuffer(output.bundle);
    return {
      success: true,
      source,
      lintResult,
      compileResult: {
        success: true,
        stage: "completed",
        source,
        compiledAt,
        spuId: spuSchema.spuId,
      },
      parsed,
      spu: spuSchema,
      spuSchema,
      specbundle: {
        fileName: specBot.getBundleFileName(spuSchema.spuId),
        byteLength: bundleBuffer.byteLength,
        base64: bundleBuffer.toString("base64"),
      },
    };
  } catch (error) {
    return buildCompileFailure(source, lintResult, compiledAt, "bundle", error, parsed);
  }
}


