import { deriveSpuKey } from "./spu_key.ts";

interface SpuLike {
  spuId: string;
}

function versionWeight(spuId: string): number {
  const matched = spuId.match(/@v(\d+(?:\.\d+)*)$/i);
  if (matched?.[1]) {
    const parts = matched[1].split(".").map((part) => Number(part));
    let weight = 0;
    for (let index = 0; index < parts.length; index += 1) {
      const value = Number.isFinite(parts[index]) ? parts[index] : 0;
      weight += value * Math.pow(1000, parts.length - index - 1);
    }
    return weight;
  }
  const fallback = spuId.match(/\d+/g);
  if (!fallback || fallback.length === 0) {
    return -1;
  }
  return Number(fallback.join(""));
}

export function findLatestSpuVersion<T extends SpuLike>(spus: T[], spuKey: string): T | null {
  const matched = spus.filter((item) => deriveSpuKey(item.spuId) === spuKey);
  if (matched.length === 0) {
    return null;
  }
  return [...matched].sort((left, right) => {
    const byVersion = versionWeight(right.spuId) - versionWeight(left.spuId);
    if (byVersion !== 0) {
      return byVersion;
    }
    return right.spuId.localeCompare(left.spuId);
  })[0];
}
