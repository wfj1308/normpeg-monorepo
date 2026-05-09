import type { PlatformService } from "../platform/workflow/platform-service.ts";
import type { SPUDefinition } from "../platform/types.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import yaml from "js-yaml";
import { compileSpec, type CompileSpecFailure, type CompileSpecOutput, type CompileSpecSuccess } from "./compile_spec.ts";
import type { CompiledMarkdownSpecJSON, ParsedMarkdownSpec } from "./schemas.ts";

export interface RegisterSpuSuccess {
  success: true;
  spuId: string;
  registeredAt: string;
  item: SPUDefinition;
}

export interface RegisterSpuConflict {
  success: false;
  error: "SPU_ALREADY_EXISTS";
  spuId: string;
}

export type RegisterSpuResult = RegisterSpuSuccess | RegisterSpuConflict;

export interface UnifiedSpecBuildArtifacts {
  lintResult: CompileSpecOutput["lintResult"];
  compileResult: CompileSpecOutput["compileResult"];
  spu: CompiledMarkdownSpecJSON | null;
  specbundle: CompileSpecOutput["specbundle"];
}

export interface RegisterMarkdownLintFailure extends UnifiedSpecBuildArtifacts {
  success: false;
  stage: "lint";
  lint: CompileSpecOutput["lintResult"];
  compileArtifact: CompileSpecFailure;
}

export interface RegisterMarkdownCompileFailure extends UnifiedSpecBuildArtifacts {
  success: false;
  stage: "compile";
  lint: CompileSpecOutput["lintResult"];
  error: string;
  compileArtifact: CompileSpecFailure;
}

export interface RegisterMarkdownConflict extends UnifiedSpecBuildArtifacts {
  success: false;
  stage: "register";
  error: "SPU_ALREADY_EXISTS";
  spuId: string;
  lint: CompileSpecOutput["lintResult"];
  parsed: ParsedMarkdownSpec;
  json: CompiledMarkdownSpecJSON;
  compileArtifact: CompileSpecSuccess;
}

export interface RegisterMarkdownSuccess extends UnifiedSpecBuildArtifacts {
  success: true;
  stage: "registered";
  spuId: string;
  lint: CompileSpecOutput["lintResult"];
  parsed: ParsedMarkdownSpec;
  json: CompiledMarkdownSpecJSON;
  registered: RegisterSpuSuccess;
  compileArtifact: CompileSpecSuccess;
}

export type RegisterMarkdownResult =
  | RegisterMarkdownLintFailure
  | RegisterMarkdownCompileFailure
  | RegisterMarkdownConflict
  | RegisterMarkdownSuccess;

export interface RegisterMarkdownOptions {
  proofExtensions?:
    | Record<string, unknown>
    | ((ctx: { source: "template" | "pdf" | "markdown"; spuId: string }) => Record<string, unknown>);
}

function nowIso(): string {
  return new Date().toISOString();
}

function sha256Buffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const SPECIR_SCHEMA_PATH = resolve(currentDir, "../../../../docs/normref/schema/specir.schema.yaml");
const SPECIR_PLACEHOLDER_CLAUSE_TEXT = /^(Clause\s+\S+\s+from\s+\S+|.*对应条款.*)$/i;

type SpecIrSchemaSnapshot = {
  rootRequired: string[];
  clauseRequired: string[];
  componentRequired: string[];
  ruleRequired: string[];
};

let loadedSchemaSnapshot: SpecIrSchemaSnapshot | null = null;

function loadSpecIrSchemaSnapshot(): SpecIrSchemaSnapshot {
  if (loadedSchemaSnapshot) {
    return loadedSchemaSnapshot;
  }
  const schemaText = readFileSync(SPECIR_SCHEMA_PATH, "utf8");
  const schema = yaml.load(schemaText);
  if (!isRecord(schema)) {
    throw new Error(`invalid specir schema at ${SPECIR_SCHEMA_PATH}`);
  }
  const defs = isRecord(schema.$defs) ? schema.$defs : {};
  const clauseDef = isRecord(defs.clause) ? defs.clause : {};
  const componentDef = isRecord(defs.component) ? defs.component : {};
  const ruleDef = isRecord(defs.rule) ? defs.rule : {};
  const asStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  loadedSchemaSnapshot = {
    rootRequired: asStringArray(schema.required),
    clauseRequired: asStringArray(clauseDef.required),
    componentRequired: asStringArray(componentDef.required),
    ruleRequired: asStringArray(ruleDef.required),
  };
  return loadedSchemaSnapshot;
}

function validateSpecIrShape(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { valid: false, errors: ["specir root must be object"] };
  }
  const schema = loadSpecIrSchemaSnapshot();
  const requiredRoot = schema.rootRequired;
  for (const key of requiredRoot) {
    if (!(key in input)) {
      errors.push(`missing root field: ${key}`);
    }
  }
  const clauses = Array.isArray(input.clauses) ? input.clauses : [];
  if (clauses.length === 0) {
    errors.push("clauses must be non-empty array");
  }
  for (const [index, clause] of clauses.entries()) {
    if (!isRecord(clause)) {
      errors.push(`clauses[${index}] must be object`);
      continue;
    }
    for (const field of schema.clauseRequired) {
      if (field === "page" || field === "level") {
        const value = clause[field];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
          errors.push(`clauses[${index}].${field} must be positive number`);
        }
        continue;
      }
      if (field === "parent_clause_id") {
        const value = clause[field];
        const ok = value === null || (typeof value === "string" && value.trim().length > 0);
        if (!ok) {
          errors.push(`clauses[${index}].parent_clause_id must be string or null`);
        }
        continue;
      }
      if (!requiredString(clause[field])) {
        errors.push(`clauses[${index}].${field} is required`);
      }
    }
    const originalText = String(clause.original_text ?? "").trim();
    if (SPECIR_PLACEHOLDER_CLAUSE_TEXT.test(originalText)) {
      errors.push(`clauses[${index}].original_text must be real clause text, placeholder is forbidden`);
    }
  }
  const components = Array.isArray(input.components) ? input.components : [];
  if (components.length === 0) {
    errors.push("components must be non-empty array");
  }
  for (const [index, component] of components.entries()) {
    if (!isRecord(component)) {
      errors.push(`components[${index}] must be object`);
      continue;
    }
    for (const field of schema.componentRequired) {
      if (field === "bound_clause_ids") {
        const bound = component.bound_clause_ids;
        const ok = Array.isArray(bound) && bound.map((item) => String(item ?? "").trim()).filter(Boolean).length > 0;
        if (!ok) {
          errors.push(`components[${index}].bound_clause_ids is required`);
        }
        continue;
      }
      if (!requiredString(component[field])) {
        errors.push(`components[${index}].${field} is required`);
      }
    }
  }
  const rules = Array.isArray(input.rules) ? input.rules : [];
  if (rules.length === 0) {
    errors.push("rules must be non-empty array");
  }
  for (const [index, rule] of rules.entries()) {
    if (!isRecord(rule)) {
      errors.push(`rules[${index}] must be object`);
      continue;
    }
    for (const field of schema.ruleRequired) {
      if (!(field in rule)) {
        errors.push(`rules[${index}].${field} is required`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function parseSpecIrValidationFromBundle(base64: string): Promise<{
  valid: boolean;
  errors: string[];
  hasSpecIr: boolean;
}> {
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  const file = zip.file("specir.yaml");
  if (!file) {
    return { valid: false, errors: ["specir.yaml missing in specbundle"], hasSpecIr: false };
  }
  const text = await file.async("text");
  const parsed = yaml.load(text);
  const shape = validateSpecIrShape(parsed);
  return { valid: shape.valid, errors: shape.errors, hasSpecIr: true };
}

function hasSpu(service: PlatformService, spuId: string): boolean {
  return service.getRegistry().some((item) => item.spuId === spuId);
}

export function registerSPU(service: PlatformService, json: CompiledMarkdownSpecJSON): RegisterSpuResult {
  if (hasSpu(service, json.spuId)) {
    return {
      success: false,
      error: "SPU_ALREADY_EXISTS",
      spuId: json.spuId,
    };
  }

  const item = service.importSpuDefinition(JSON.stringify(json), "compiled");
  return {
    success: true,
    spuId: item.spuId,
    registeredAt: nowIso(),
    item,
  };
}

function annotateRegisteredSpecBundle(
  item: SPUDefinition,
  artifact: CompileSpecSuccess,
  specIrValidation: { valid: boolean; errors: string[]; hasSpecIr: boolean },
): void {
  const bundle = artifact.specbundle;
  const base64 = String(bundle?.base64 ?? "").trim();
  if (!base64) {
    return;
  }
  const fileName = String(bundle.fileName ?? "").trim();
  const bundleHash = sha256Buffer(Buffer.from(base64, "base64"));
  const currentMetaExtensions =
    item.meta.extensions && typeof item.meta.extensions === "object" && !Array.isArray(item.meta.extensions)
      ? item.meta.extensions as Record<string, unknown>
      : {};
  item.meta.extensions = {
    ...currentMetaExtensions,
    specbundle_complete: true,
    specbundle_file_name: fileName || undefined,
    specbundle_hash: bundleHash,
    specbundle_path: fileName ? `/exports/specbundle/${fileName}` : undefined,
    specir_path: fileName ? `specbundle://${fileName}/specir.yaml` : undefined,
    spec_md_path: fileName ? `specbundle://${fileName}/spec.md` : undefined,
    spec_json_path: fileName ? `specbundle://${fileName}/spec.json` : undefined,
    source_pdf: "pdf-to-draft",
    specir_schema_valid: specIrValidation.valid,
    specir_schema_errors: specIrValidation.errors,
    specir_in_bundle: specIrValidation.hasSpecIr,
  };
}

export function registerCompiledSpec(service: PlatformService, artifact: CompileSpecSuccess): RegisterSpuResult {
  return registerSPU(service, artifact.spu);
}

function toUnifiedSpecBuildArtifacts(compileArtifact: CompileSpecOutput): UnifiedSpecBuildArtifacts {
  return {
    lintResult: compileArtifact.lintResult,
    compileResult: compileArtifact.compileResult,
    spu: compileArtifact.spu,
    specbundle: compileArtifact.specbundle,
  };
}

function toCompileErrorMessage(result: CompileSpecFailure): string {
  if (result.compileResult.stage === "lint") {
    return "LINT_FAILED";
  }
  return result.compileResult.error;
}

export async function registerMarkdownSpec(
  service: PlatformService,
  markdown: string,
  source: "template" | "pdf" | "markdown" = "markdown",
  options: RegisterMarkdownOptions = {},
): Promise<RegisterMarkdownResult> {
  const compileArtifact = await compileSpec(markdown, {
    source,
    proofExtensions: options.proofExtensions,
  });
  const lint = compileArtifact.lintResult;
  const unifiedArtifacts = toUnifiedSpecBuildArtifacts(compileArtifact);

  if (!compileArtifact.success && compileArtifact.compileResult.stage === "lint") {
    return {
      success: false,
      stage: "lint",
      lint,
      compileArtifact,
      ...unifiedArtifacts,
    };
  }

  if (!compileArtifact.success) {
    return {
      success: false,
      stage: "compile",
      lint,
      error: toCompileErrorMessage(compileArtifact),
      compileArtifact,
      ...unifiedArtifacts,
    };
  }

  const parsed = compileArtifact.parsed;
  const json = compileArtifact.spu;
  const specIrValidation = await parseSpecIrValidationFromBundle(compileArtifact.specbundle.base64);
  if (!specIrValidation.valid) {
    return {
      success: false,
      stage: "compile",
      lint,
      error: `SPECIR_SCHEMA_INVALID: ${specIrValidation.errors.join("; ")}`,
      compileArtifact,
      ...unifiedArtifacts,
    };
  }
  const registered = registerCompiledSpec(service, compileArtifact);
  if (!registered.success) {
    return {
      success: false,
      stage: "register",
      error: registered.error,
      spuId: registered.spuId,
      lint,
      parsed,
      json,
      compileArtifact,
      ...unifiedArtifacts,
    };
  }
  annotateRegisteredSpecBundle(registered.item, compileArtifact, specIrValidation);

  return {
    success: true,
    stage: "registered",
    spuId: registered.spuId,
    lint,
    parsed,
    json,
    registered,
    compileArtifact,
    ...unifiedArtifacts,
  };
}
