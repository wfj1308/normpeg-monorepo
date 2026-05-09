import type { ModuleSectionMeta } from "../builder/sections.ts";

export const RUNTIME_SECTIONS: ModuleSectionMeta[] = [
  {
    id: "slot-context",
    title: "Slot Context",
    description: "Load and display geo slot context.",
    source: "src/SPUApp.tsx#slot-context",
  },
  {
    id: "container-lifecycle",
    title: "Container Lifecycle",
    description: "Create container, monitor lifecycle and progress.",
    source: "src/SPUApp.tsx#container",
  },
  {
    id: "scheduler",
    title: "Scheduler Recommendation",
    description: "Single-container and project-level scheduling views.",
    source: "src/SPUApp.tsx#scheduler",
  },
  {
    id: "archive-proof",
    title: "Archive and Proof",
    description: "Archive qualified container and export proof artifacts.",
    source: "src/SPUApp.tsx#archive-proof",
  },
  {
    id: "layerpeg-ledger",
    title: "LayerPeg Ledger",
    description: "Read spec/node/proof LayerPeg documents and ledger index.",
    source: "src/SPUApp.tsx#layerpeg",
  },
  {
    id: "component-catalog",
    title: "Component Catalog",
    description: "View runtime catalogs and marketplace listings.",
    source: "src/SPUApp.tsx#component-catalog",
  },
];
