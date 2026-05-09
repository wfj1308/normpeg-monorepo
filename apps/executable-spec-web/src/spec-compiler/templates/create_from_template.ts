import type { PlatformService } from "../../platform/workflow/platform-service.ts";
import { registerMarkdownSpec, type RegisterMarkdownResult } from "../register_markdown.ts";
import type { CompileResult, CompiledSpecBundle } from "../compile_spec.ts";
import type { SpecLintResult } from "../lint_types.ts";
import type { CompiledMarkdownSpecJSON } from "../schemas.ts";
import { getBuiltInTemplates } from "./builtins.ts";
import { renderMarkdownFromTemplate } from "./renderer.ts";
import type {
  SpecMarkdownTemplate,
  TemplateDerivationOptions,
  TemplateDerivationOverrides,
  TemplateSpuRelation,
  TemplateValues,
} from "./types.ts";

export interface CreateAndRegisterSpecFromTemplateResult {
  template: SpecMarkdownTemplate;
  markdown: string;
  values: TemplateValues;
  relation: TemplateSpuRelation;
  registerResult: RegisterMarkdownResult;
  compileArtifact: RegisterMarkdownResult["compileArtifact"] | null;
  lintResult: SpecLintResult;
  compileResult: CompileResult;
  spu: CompiledMarkdownSpecJSON | null;
  specbundle: CompiledSpecBundle | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function findTemplate(templateId: string): SpecMarkdownTemplate {
  const template = getBuiltInTemplates().find((item) => item.templateId === templateId);
  if (!template) {
    throw new Error(`template not found: ${templateId}`);
  }
  return template;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveThresholdVariableKey(template: SpecMarkdownTemplate): string | null {
  const fromPlaceholders = template.rulePlaceholders.find((item) => item.placeholderType === "threshold");
  if (fromPlaceholders && template.variables.some((item) => item.key === fromPlaceholders.key)) {
    return fromPlaceholders.key;
  }
  const fallback = template.variables.find((item) => /threshold|thickness|maxalloweddeflection/i.test(item.key));
  return fallback?.key ?? null;
}

function applyTemplateOverrides(
  template: SpecMarkdownTemplate,
  values: TemplateValues,
  options?: TemplateDerivationOptions,
): {
  finalValues: TemplateValues;
  normalizedOverrides: TemplateDerivationOverrides;
} {
  const finalValues: TemplateValues = { ...values };
  const overridePayload = options?.overrides ?? {};
  const normalizedOverrides: TemplateDerivationOverrides = {};

  const overrideClause = normalizeOptionalString(overridePayload.clause);
  if (overrideClause) {
    finalValues.clause = overrideClause;
    normalizedOverrides.clause = overrideClause;
  }

  const overrideDescription = normalizeOptionalString(overridePayload.description);
  if (overrideDescription) {
    finalValues.description = overrideDescription;
    normalizedOverrides.description = overrideDescription;
  }

  const overrideThreshold = normalizeOptionalNumber(overridePayload.threshold);
  if (overrideThreshold !== null) {
    const thresholdKey = resolveThresholdVariableKey(template);
    if (thresholdKey) {
      finalValues[thresholdKey] = overrideThreshold;
      normalizedOverrides.threshold = overrideThreshold;
    }
  }

  return {
    finalValues,
    normalizedOverrides,
  };
}

function buildTemplateRelation(
  template: SpecMarkdownTemplate,
  options: TemplateDerivationOptions | undefined,
  overrides: TemplateDerivationOverrides,
  derivedSpuId: string | null,
): TemplateSpuRelation {
  return {
    templateId: template.templateId,
    baseType: template.baseType,
    inheritedFromSpuId: normalizeOptionalString(options?.inheritFromSpuId) ?? null,
    derivedSpuId,
    overrides,
    createdAt: nowIso(),
    reusableFieldKeys: template.reusableFields.map((item) => item.key),
    rulePlaceholderKeys: template.rulePlaceholders.map((item) => item.key),
    defaultProofRequirements: [...template.defaultProofRequirements],
  };
}

export async function createAndRegisterSpecFromTemplate(
  service: PlatformService,
  templateId: string,
  values: TemplateValues,
  options?: TemplateDerivationOptions,
): Promise<CreateAndRegisterSpecFromTemplateResult> {
  const template = findTemplate(templateId);
  const { finalValues, normalizedOverrides } = applyTemplateOverrides(template, values, options);
  const markdown = renderMarkdownFromTemplate(template, finalValues);

  const relationSeed = buildTemplateRelation(template, options, normalizedOverrides, null);
  const registerResult = await registerMarkdownSpec(service, markdown, "template", {
    proofExtensions: ({ spuId }) => ({
      templateInheritance: {
        ...relationSeed,
        derivedSpuId: spuId,
        values: { ...finalValues },
      },
    }),
  });
  const compileArtifact = "compileArtifact" in registerResult ? registerResult.compileArtifact : null;
  const derivedSpuId = registerResult.success
    ? registerResult.spuId
    : "spuId" in registerResult
      ? registerResult.spuId
      : null;
  const relation = buildTemplateRelation(template, options, normalizedOverrides, derivedSpuId);

  return {
    template,
    markdown,
    values: { ...finalValues },
    relation,
    registerResult,
    compileArtifact,
    lintResult: registerResult.lintResult,
    compileResult: registerResult.compileResult,
    spu: registerResult.spu,
    specbundle: registerResult.specbundle,
  };
}
