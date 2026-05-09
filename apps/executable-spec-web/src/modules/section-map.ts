import type { AppModule } from "./module-config.ts";
import { BUILDER_SECTIONS, type ModuleSectionMeta } from "./builder/sections.ts";
import { EXECUTOR_SECTIONS } from "./executor/sections.ts";
import { RUNTIME_SECTIONS } from "./runtime/sections.ts";
import { DEBUG_SECTIONS } from "./debug/sections.ts";

export type ModuleSectionMap = Record<AppModule, ModuleSectionMeta[]>;

export const MODULE_SECTION_MAP: ModuleSectionMap = {
  builder: BUILDER_SECTIONS,
  executor: EXECUTOR_SECTIONS,
  runtime: RUNTIME_SECTIONS,
  debug: DEBUG_SECTIONS,
};

export function getModuleSections(module: AppModule): ModuleSectionMeta[] {
  return MODULE_SECTION_MAP[module];
}
