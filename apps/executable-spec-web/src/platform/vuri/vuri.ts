export const DEFAULT_VURI_PROJECT_ID = "project-unscoped";

type KnownQueryKey = "version" | "layer" | "time";
const KNOWN_QUERY_KEYS: KnownQueryKey[] = ["version", "layer", "time"];

export type VuriTargetKind = "project_root" | "stake" | "container" | "node" | "proof" | "unknown";

export interface ParsedVuriQuery {
  version: string | null;
  layer: string | null;
  time: string | null;
  extra: Record<string, string>;
}

export interface ParsedVuri {
  raw: string;
  projectId: string;
  pathSegments: string[];
  targetKind: VuriTargetKind;
  stakeRange: string | null;
  containerId: string | null;
  nodePath: string | null;
  proofId: string | null;
  query: ParsedVuriQuery;
}

export interface VuriValidationResult {
  valid: boolean;
  errors: string[];
  parsed: ParsedVuri | null;
  normalized: string | null;
}

export interface VuriBuildQuery {
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%2B/g, "+");
}

function decodeSegment(segment: string): string {
  return decodeURIComponent(segment);
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitPathText(value: string): string[] {
  return value
    .split("/")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeProjectIdRaw(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized) {
    throw new Error("project-id is required");
  }
  if (normalized.includes("?") || normalized.includes("#") || normalized.includes("/")) {
    throw new Error("project-id cannot contain '/', '?' or '#'");
  }
  return normalized;
}

function normalizeTimeValue(time: VuriBuildQuery["time"]): string | null {
  if (time === null || typeof time === "undefined") {
    return null;
  }
  if (time instanceof Date) {
    return Number.isNaN(time.getTime()) ? null : time.toISOString();
  }
  if (typeof time === "number") {
    if (!Number.isFinite(time)) {
      return null;
    }
    return String(Math.trunc(time));
  }
  const normalized = trimOrNull(time);
  return normalized;
}

function normalizeQuery(input: ParsedVuriQuery): string {
  const params: Array<[string, string]> = [];
  if (input.version) {
    params.push(["version", input.version]);
  }
  if (input.layer) {
    params.push(["layer", input.layer]);
  }
  if (input.time) {
    params.push(["time", input.time]);
  }
  const extraEntries = Object.entries(input.extra).sort((a, b) => a[0].localeCompare(b[0], "en"));
  for (const [key, value] of extraEntries) {
    const normalizedKey = trimOrNull(key);
    const normalizedValue = trimOrNull(value);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    if (KNOWN_QUERY_KEYS.includes(normalizedKey as KnownQueryKey)) {
      continue;
    }
    params.push([normalizedKey, normalizedValue]);
  }
  if (params.length === 0) {
    return "";
  }
  const query = new URLSearchParams(params);
  return `?${query.toString()}`;
}

function classifyTarget(pathSegments: string[]): Omit<ParsedVuri, "raw" | "projectId" | "query"> {
  if (pathSegments.length === 0) {
    return {
      pathSegments,
      targetKind: "project_root",
      stakeRange: null,
      containerId: null,
      nodePath: null,
      proofId: null,
    };
  }
  const [head, ...rest] = pathSegments;
  const normalizedHead = head.toLowerCase();
  if (normalizedHead === "stake" && rest.length > 0) {
    return {
      pathSegments,
      targetKind: "stake",
      stakeRange: rest.join("/"),
      containerId: null,
      nodePath: null,
      proofId: null,
    };
  }
  if (normalizedHead === "container" && rest.length > 0) {
    return {
      pathSegments,
      targetKind: "container",
      stakeRange: null,
      containerId: rest.join("/"),
      nodePath: null,
      proofId: null,
    };
  }
  if (normalizedHead === "node" && rest.length > 0) {
    return {
      pathSegments,
      targetKind: "node",
      stakeRange: null,
      containerId: null,
      nodePath: rest.join("/"),
      proofId: null,
    };
  }
  if (normalizedHead === "proof" && rest.length > 0) {
    return {
      pathSegments,
      targetKind: "proof",
      stakeRange: null,
      containerId: null,
      nodePath: null,
      proofId: rest.join("/"),
    };
  }
  return {
    pathSegments,
    targetKind: "unknown",
    stakeRange: null,
    containerId: null,
    nodePath: null,
    proofId: null,
  };
}

export function resolveProjectIdForVuri(projectId: string | null | undefined): string {
  const normalized = trimOrNull(projectId ?? null);
  return normalized ?? DEFAULT_VURI_PROJECT_ID;
}

export function parseVuri(vuri: string): ParsedVuri {
  const raw = String(vuri ?? "").trim();
  if (!raw.startsWith("v://")) {
    throw new Error("vuri must start with 'v://'");
  }
  const withoutScheme = raw.slice(4);
  const [rawPath, rawQuery = ""] = withoutScheme.split("?", 2);
  const pathSegments = rawPath
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeSegment(segment).trim())
    .filter((segment) => segment.length > 0);
  if (pathSegments.length === 0) {
    throw new Error("vuri must include project-id");
  }
  const projectId = normalizeProjectIdRaw(pathSegments[0]);
  const parsedParams = new URLSearchParams(rawQuery);
  const query: ParsedVuriQuery = {
    version: trimOrNull(parsedParams.get("version")),
    layer: trimOrNull(parsedParams.get("layer")),
    time: trimOrNull(parsedParams.get("time")),
    extra: {},
  };
  for (const [key, value] of parsedParams.entries()) {
    if (KNOWN_QUERY_KEYS.includes(key as KnownQueryKey)) {
      continue;
    }
    const normalizedKey = trimOrNull(key);
    const normalizedValue = trimOrNull(value);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    query.extra[normalizedKey] = normalizedValue;
  }
  const target = classifyTarget(pathSegments.slice(1));
  return {
    raw,
    projectId,
    ...target,
    query,
  };
}

export function normalizeVuri(vuri: string): string {
  const parsed = parseVuri(vuri);
  const path: string[] = [parsed.projectId];
  if (parsed.targetKind === "project_root") {
    // Keep project root only.
  } else if (parsed.targetKind === "stake" && parsed.stakeRange) {
    path.push("stake", ...splitPathText(parsed.stakeRange));
  } else if (parsed.targetKind === "container" && parsed.containerId) {
    path.push("container", ...splitPathText(parsed.containerId));
  } else if (parsed.targetKind === "node" && parsed.nodePath) {
    path.push("node", ...splitPathText(parsed.nodePath));
  } else if (parsed.targetKind === "proof" && parsed.proofId) {
    path.push("proof", ...splitPathText(parsed.proofId));
  } else {
    path.push(...parsed.pathSegments);
  }
  const encodedPath = path.map((segment) => encodeSegment(segment)).join("/");
  return `v://${encodedPath}${normalizeQuery(parsed.query)}`;
}

function isValidTimeValue(time: string): boolean {
  if (/^-?\d+$/.test(time)) {
    return true;
  }
  return !Number.isNaN(Date.parse(time));
}

export function validateVuri(vuri: string): VuriValidationResult {
  try {
    const parsed = parseVuri(vuri);
    const errors: string[] = [];
    if (parsed.targetKind === "unknown") {
      errors.push("unsupported vuri target path");
    }
    if (parsed.query.time && !isValidTimeValue(parsed.query.time)) {
      errors.push("query 'time' must be unix timestamp or ISO datetime");
    }
    const normalized = errors.length === 0 ? normalizeVuri(vuri) : null;
    return {
      valid: errors.length === 0,
      errors,
      parsed,
      normalized,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      parsed: null,
      normalized: null,
    };
  }
}

function buildVuriWithTarget(
  projectId: string | null | undefined,
  targetSegments: string[],
  query: VuriBuildQuery = {},
): string {
  const normalizedProjectId = normalizeProjectIdRaw(resolveProjectIdForVuri(projectId));
  const path = [normalizedProjectId, ...targetSegments];
  const normalizedQuery: ParsedVuriQuery = {
    version: trimOrNull(query.version ?? null),
    layer: trimOrNull(query.layer ?? null),
    time: normalizeTimeValue(query.time),
    extra: {},
  };
  const encodedPath = path.map((segment) => encodeSegment(segment)).join("/");
  return `v://${encodedPath}${normalizeQuery(normalizedQuery)}`;
}

export function buildProjectRootVuri(params: {
  projectId: string | null | undefined;
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}): string {
  return buildVuriWithTarget(params.projectId, [], params);
}

export function buildStakeVuri(params: {
  projectId: string | null | undefined;
  stakeRange: string;
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}): string {
  const stakeRange = trimOrNull(params.stakeRange);
  if (!stakeRange) {
    throw new Error("stakeRange is required");
  }
  return buildVuriWithTarget(params.projectId, ["stake", ...splitPathText(stakeRange)], params);
}

export function buildContainerVuri(params: {
  projectId: string | null | undefined;
  containerId: string;
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}): string {
  const containerId = trimOrNull(params.containerId);
  if (!containerId) {
    throw new Error("containerId is required");
  }
  return buildVuriWithTarget(params.projectId, ["container", ...splitPathText(containerId)], params);
}

export function buildNodeVuri(params: {
  projectId: string | null | undefined;
  nodeId?: string | null;
  containerId?: string | null;
  nodePath?: string | null;
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}): string {
  const rawNodePath = trimOrNull(params.nodePath ?? null);
  const rawNodeId = trimOrNull(params.nodeId ?? null);
  const rawContainerId = trimOrNull(params.containerId ?? null);
  const nodePath = rawNodePath ?? [rawContainerId, rawNodeId].filter((item): item is string => Boolean(item)).join("/");
  if (!nodePath) {
    throw new Error("nodePath or nodeId is required");
  }
  return buildVuriWithTarget(params.projectId, ["node", ...splitPathText(nodePath)], params);
}

export function buildProofVuri(params: {
  projectId: string | null | undefined;
  proofId: string;
  version?: string | null;
  layer?: string | null;
  time?: string | number | Date | null;
}): string {
  const proofId = trimOrNull(params.proofId);
  if (!proofId) {
    throw new Error("proofId is required");
  }
  return buildVuriWithTarget(params.projectId, ["proof", ...splitPathText(proofId)], params);
}

export function readProjectIdFromVuri(vuri: string | null | undefined): string | null {
  const normalized = trimOrNull(vuri ?? null);
  if (!normalized) {
    return null;
  }
  try {
    return parseVuri(normalized).projectId;
  } catch {
    return null;
  }
}
