import { createHash } from "node:crypto";

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableNormalize(item));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, item]) => [key, stableNormalize(item)]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function sha256Json(payload: unknown): string {
  const text = JSON.stringify(stableNormalize(payload));
  return createHash("sha256").update(text).digest("hex");
}
