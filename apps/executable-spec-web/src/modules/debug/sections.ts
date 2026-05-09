import type { ModuleSectionMeta } from "../builder/sections.ts";

export const DEBUG_SECTIONS: ModuleSectionMeta[] = [
  {
    id: "normref-matrix",
    title: "NormRef API Matrix Debug",
    description: "Manual endpoint-by-endpoint integration debugging matrix.",
    source: "src/SPUApp.tsx#normref-debug",
  },
];
