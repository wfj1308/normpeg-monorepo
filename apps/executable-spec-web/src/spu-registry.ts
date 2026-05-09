import { SPULoader } from "./spu-loader.ts";
import { SPU_EXAMPLES, findSPUExample } from "./spu-examples.ts";

import type { SPU } from "./spu-types.ts";

export type SpuRegistryItem = {
  spuId: string;
  norm: string;
  clause: string;
  name: string;
  version: string;
  category: string;
  workItem: string;
  measuredItem: string;
  sourceType: string;
  metricType: string;
  assetPath: string;
};

export type RuntimeSpuEntry = {
  spu: SPU;
  registryItem: SpuRegistryItem;
  samplePassInputs?: Record<string, number>;
  sampleFailInputs?: Record<string, number>;
};

const loader = new SPULoader();
const importedRuntimeEntries = new Map<string, RuntimeSpuEntry>();

export function getBuiltinRuntimeEntries(): RuntimeSpuEntry[] {
  return SPU_EXAMPLES.map((item) => ({
    spu: item.spu,
    registryItem: {
      spuId: item.spu.spuId,
      norm: item.spu.meta.norm,
      clause: item.spu.meta.clause,
      name: item.spu.meta.name,
      version: item.spu.meta.version,
      category: "",
      workItem: "",
      measuredItem: item.spu.meta.name,
      sourceType: "builtin",
      metricType: inferMetricType(item.spu.spuId),
      assetPath: "",
    },
    samplePassInputs: item.passInputs,
    sampleFailInputs: item.failInputs,
  }));
}

export function inferMetricType(spuId: string): string {
  if (spuId.includes(".compaction.")) {
    return "compaction";
  }
  if (spuId.includes(".thickness.")) {
    return "thickness";
  }
  if (spuId.includes(".deflection.")) {
    return "deflection";
  }
  if (spuId.includes(".flatness.")) {
    return "flatness";
  }
  if (spuId.includes(".pile.")) {
    return "pile";
  }
  return "";
}

export function hasRegisteredRuntimeSpu(spuId: string): boolean {
  return (
    importedRuntimeEntries.has(spuId) ||
    getBuiltinRuntimeEntries().some((item) => item.spu.spuId === spuId) ||
    SPULoader.getSPU(spuId) !== undefined
  );
}

export function registerImportedRuntimeEntry(entry: RuntimeSpuEntry): RuntimeSpuEntry {
  importedRuntimeEntries.set(entry.spu.spuId, entry);
  return entry;
}

export function getImportedRuntimeEntries(): RuntimeSpuEntry[] {
  return [...importedRuntimeEntries.values()];
}

export async function loadRuntimeSpuRegistry(): Promise<RuntimeSpuEntry[]> {
  try {
    const resp = await fetch("/api/v1/spu/registry");
    if (!resp.ok) {
      throw new Error(await readTextSafe(resp));
    }
    const payload = (await resp.json()) as { items?: SpuRegistryItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const remoteEntries = await Promise.all(
      items.map(async (item) => {
        const yamlResp = await fetch(`/api/v1/spu/assets/${encodeURIComponent(item.spuId)}`);
        if (!yamlResp.ok) {
          throw new Error(await readTextSafe(yamlResp));
        }
        const yamlText = await yamlResp.text();
        const spu = loader.load(yamlText);
        const example = findSPUExample(item.spuId);
        return {
          spu,
          registryItem: item,
          samplePassInputs: example?.passInputs,
          sampleFailInputs: example?.failInputs,
        } satisfies RuntimeSpuEntry;
      }),
    );
    return mergeRuntimeEntries(getBuiltinRuntimeEntries(), remoteEntries, getImportedRuntimeEntries());
  } catch {
    return mergeRuntimeEntries(getBuiltinRuntimeEntries(), getImportedRuntimeEntries());
  }
}

function mergeRuntimeEntries(...groups: RuntimeSpuEntry[][]): RuntimeSpuEntry[] {
  const merged = new Map<string, RuntimeSpuEntry>();

  for (const group of groups) {
    for (const entry of group) {
      merged.set(entry.spu.spuId, entry);
    }
  }

  return [...merged.values()];
}

async function readTextSafe(resp: Response): Promise<string> {
  try {
    return (await resp.text()).trim();
  } catch {
    return `${resp.status} ${resp.statusText}`.trim();
  }
}
