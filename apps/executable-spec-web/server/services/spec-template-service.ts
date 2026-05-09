import { createAndRegisterSpecFromTemplate as createAndRegisterFromTemplateCore } from "../../src/spec-compiler/templates/create_from_template.ts";
import { getBuiltInTemplates } from "../../src/spec-compiler/templates/builtins.ts";
import type { TemplateDerivationOptions, TemplateValues } from "../../src/spec-compiler/templates/types.ts";
import type { PlatformService } from "../../src/platform/workflow/platform-service.ts";

export function listSpecTemplates() {
  return getBuiltInTemplates();
}

export async function createAndRegisterSpecFromTemplate(
  service: PlatformService,
  templateId: string,
  values: TemplateValues,
  options?: TemplateDerivationOptions,
) {
  return createAndRegisterFromTemplateCore(service, templateId, values, options);
}
