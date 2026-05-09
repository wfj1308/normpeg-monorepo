export type CoreAssetSpec = {
  yamlFileName: string;
  generatedMarkdownFile: string;
  generatedJsonFile: string;
  passInputs: Record<string, number>;
  expectedStatus: "PASS" | "FAIL";
};

// Single source of truth for core SPU asset selection.
// Scripts and tests should consume this manifest instead of hard-coded filenames.
export const CORE_ASSET_SPECS: CoreAssetSpec[] = [
  {
    yamlFileName: "subgrade.compaction.spu.yaml",
    generatedMarkdownFile: "highway.subgrade.compaction.4.2.1.soil@v1.md",
    generatedJsonFile: "highway.subgrade.compaction.4.2.1.soil@v1.json",
    passInputs: {
      massHoleSand: 1980,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
    expectedStatus: "PASS",
  },
  {
    yamlFileName: "bridge.pile.strength.spu.yaml",
    generatedMarkdownFile: "highway.bridge.pile.strength.quality@v1.md",
    generatedJsonFile: "highway.bridge.pile.strength.quality@v1.json",
    passInputs: {
      measuredStrength: 42,
      designStrength: 40,
      pileLength: 18,
    },
    expectedStatus: "PASS",
  },
  {
    yamlFileName: "pavement.flatness.IRI.spu.yaml",
    generatedMarkdownFile: "highway.pavement.flatness.IRI@v1.md",
    generatedJsonFile: "highway.pavement.flatness.IRI@v1.json",
    passInputs: {
      iriMeasured: 7.2,
      iriLimit: 8,
    },
    expectedStatus: "PASS",
  },
];

// Legacy filenames kept for backward compatibility in local workflows.
// Do not introduce new references to these names.
export const LEGACY_CORE_ASSET_FILE_ALIASES: Record<string, string> = {
  "subgrade-compaction.spu.yaml": "subgrade.compaction.spu.yaml",
  "bridge-pile-strength.spu.yaml": "bridge.pile.strength.spu.yaml",
  "pavement-flatness.spu.yaml": "pavement.flatness.IRI.spu.yaml",
};
