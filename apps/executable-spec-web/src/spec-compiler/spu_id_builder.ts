import type { BuildSpuIdMeta, BuildSpuIdOptions } from "./schemas.ts";

function normalizeSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return normalized || fallback;
}

function normalizeClause(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z.]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!normalized) {
    throw new Error("条款号不能为空");
  }
  return normalized;
}

function normalizeVersion(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z._-]+/g, "")
    .replace(/^_+|_+$/g, "");
  if (!normalized) {
    throw new Error("版本不能为空");
  }
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

function detectSubtypeFromTitle(title: string): string | null {
  if (/土质/.test(title)) {
    return "soil";
  }
  return null;
}

export function buildSpuId(meta: BuildSpuIdMeta, title: string, options?: BuildSpuIdOptions): string {
  const domain = normalizeSegment(options?.domain ?? "highway", "highway");
  const category = normalizeSegment(meta.category ?? "general", "general");
  const measuredItem = normalizeSegment(meta.measuredItem ?? "metric", "metric");
  const clause = normalizeClause(meta.clause);
  const version = normalizeVersion(meta.version);

  const detectedSubtype = options?.subType ?? detectSubtypeFromTitle(title);
  const subtype = detectedSubtype ? `.${normalizeSegment(detectedSubtype, "")}` : "";

  return `${domain}.${category}.${measuredItem}.${clause}${subtype}@${version}`;
}
