import type { ModuleSectionMeta } from "../builder/sections.ts";

export const EXECUTOR_SECTIONS: ModuleSectionMeta[] = [
  {
    id: "spu-selection",
    title: "SPU Selection and Binding",
    description: "Choose registered SPUs and bind to active container.",
    source: "src/SPUApp.tsx#spu-selection",
  },
  {
    id: "execution-cards",
    title: "Execution Cards",
    description: "View readiness of template SPUs and trigger execution.",
    source: "src/SPUApp.tsx#execution-cards",
  },
  {
    id: "current-execution",
    title: "Current Execution",
    description: "Input data, run gate evaluation, sign, and finalize.",
    source: "src/SPUApp.tsx#current-execution",
  },
  {
    id: "recheck-timeline",
    title: "Recheck Timeline",
    description: "Review attempt history and audit timeline by SPU.",
    source: "src/SPUApp.tsx#recheck",
  },
  {
    id: "nl2gate",
    title: "NL2Gate Controlled Entry",
    description: "Translate natural language into controlled gate commands.",
    source: "src/SPUApp.tsx#nl2gate",
  },
];
