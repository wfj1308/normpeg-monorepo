export function deriveSpuKey(spuId: string): string {
  const normalized = (spuId ?? "").trim();
  if (!normalized) {
    return "";
  }
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex <= 0) {
    return normalized;
  }
  return normalized.slice(0, atIndex);
}
