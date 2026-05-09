import yaml from "js-yaml";
import JSZip from "jszip";

import { registerImportedRuntimeEntry, hasRegisteredRuntimeSpu, inferMetricType, type RuntimeSpuEntry } from "../spu-registry.ts";
import { SPULoader } from "../spu-loader.ts";

import type { SPU } from "../spu-types.ts";

export type SpecBundleErrorCode = "INVALID_SPEC_BUNDLE" | "INVALID_SPEC_JSON" | "DUPLICATE_SPEC_ID";

export class SpecBundleError extends Error {
  readonly code: SpecBundleErrorCode;

  constructor(code: SpecBundleErrorCode, message?: string) {
    super(message ?? code);
    this.name = "SpecBundleError";
    this.code = code;
  }
}

export type SpecBundleJSON = Omit<SPU, "spuId"> & {
  specId: string;
  spuId?: string;
  format: "SPU-v1";
  generatedBy: string;
  generatedAt: string;
  markdownRef: string;
};

export type LoadedSpecBundleData = {
  markdown: string;
  json: SpecBundleJSON;
  readme: string;
};

type SpecBundleBlob = Blob & {
  name?: string;
};

const REQUIRED_BUNDLE_FILES = ["spec.md", "spec.json", "README.txt"] as const;

export async function loadSpecBundle(file: File): Promise<LoadedSpecBundleData>;
export async function loadSpecBundle(file: SpecBundleBlob): Promise<LoadedSpecBundleData>;
export async function loadSpecBundle(file: SpecBundleBlob): Promise<LoadedSpecBundleData> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const specMarkdownFile = zip.file("spec.md");
  const specJsonFile = zip.file("spec.json");
  const readmeFile = zip.file("README.txt");

  if (!specMarkdownFile || !specJsonFile || !readmeFile) {
    throw new SpecBundleError(
      "INVALID_SPEC_BUNDLE",
      `Bundle must contain ${REQUIRED_BUNDLE_FILES.join(", ")}`,
    );
  }

  const [markdown, jsonText, readme] = await Promise.all([
    specMarkdownFile.async("string"),
    specJsonFile.async("string"),
    readmeFile.async("string"),
  ]);

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    throw new SpecBundleError("INVALID_SPEC_JSON", "spec.json is not valid JSON");
  }

  if (!isSpecBundleJSON(parsedJson)) {
    throw new SpecBundleError("INVALID_SPEC_JSON", explainInvalidSpecJson(parsedJson));
  }

  const normalized = normalizeSpecBundleJSON(parsedJson);
  return {
    markdown,
    json: normalized,
    readme,
  };
}

export function registerBundleSpec(bundleData: LoadedSpecBundleData): RuntimeSpuEntry {
  const spu = toSpu(bundleData.json);
  if (hasRegisteredRuntimeSpu(spu.spuId)) {
    throw new SpecBundleError("DUPLICATE_SPEC_ID", `SPU already exists: ${spu.spuId}`);
  }

  let loadedSpu: SPU;
  try {
    const yamlText = yaml.dump(spu, {
      lineWidth: -1,
      noRefs: true,
      sortKeys: false,
    });
    loadedSpu = new SPULoader().load(yamlText);
  } catch (error) {
    throw new SpecBundleError(
      "INVALID_SPEC_JSON",
      error instanceof Error ? error.message : "spec.json cannot be converted into a valid SPU",
    );
  }

  return registerImportedRuntimeEntry({
    spu: loadedSpu,
    registryItem: {
      spuId: loadedSpu.spuId,
      norm: loadedSpu.meta.norm,
      clause: loadedSpu.meta.clause,
      name: loadedSpu.meta.name,
      version: loadedSpu.meta.version,
      category: "",
      workItem: "",
      measuredItem: loadedSpu.meta.name,
      sourceType: "specbundle",
      metricType: inferMetricType(loadedSpu.spuId),
      assetPath: "",
    },
  });
}

function toSpu(json: SpecBundleJSON): SPU {
  return {
    spuId: json.spuId ?? json.specId,
    meta: json.meta,
    forms: json.forms,
    data: json.data,
    path: json.path,
    rules: json.rules,
    proof: json.proof,
  };
}

function isSpecBundleJSON(value: unknown): value is SpecBundleJSON {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.specId === "string" &&
    (typeof value.spuId === "string" || typeof value.spuId === "undefined") &&
    typeof value.generatedBy === "string" &&
    typeof value.generatedAt === "string" &&
    typeof value.markdownRef === "string" &&
    isRecord(value.meta) &&
    Array.isArray(value.forms) &&
    isRecord(value.data) &&
    Array.isArray(value.path) &&
    Array.isArray(value.rules) &&
    isRecord(value.proof)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSpecBundleJSON(value: SpecBundleJSON): SpecBundleJSON {
  return {
    ...value,
    spuId: typeof value.spuId === "string" && value.spuId.trim().length > 0 ? value.spuId : value.specId,
  };
}

function explainInvalidSpecJson(value: unknown): string {
  if (!isRecord(value)) {
    return "spec.json must be a JSON object";
  }

  const missing: string[] = [];
  if (typeof value.specId !== "string") {
    missing.push("specId");
  }
  if (typeof value.generatedBy !== "string") {
    missing.push("generatedBy");
  }
  if (typeof value.generatedAt !== "string") {
    missing.push("generatedAt");
  }
  if (typeof value.markdownRef !== "string") {
    missing.push("markdownRef");
  }
  if (!isRecord(value.meta)) {
    missing.push("meta");
  }
  if (!Array.isArray(value.forms)) {
    missing.push("forms");
  }
  if (!isRecord(value.data)) {
    missing.push("data");
  }
  if (!Array.isArray(value.path)) {
    missing.push("path");
  }
  if (!Array.isArray(value.rules)) {
    missing.push("rules");
  }
  if (!isRecord(value.proof)) {
    missing.push("proof");
  }

  if (missing.length === 0) {
    return "spec.json schema mismatch";
  }
  return `spec.json is missing or invalid fields: ${missing.join(", ")}`;
}
