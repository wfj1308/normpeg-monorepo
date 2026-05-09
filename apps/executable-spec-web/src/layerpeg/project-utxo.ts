export type UTXOType = "RoadSection" | "Bridge" | "ComponentExecution";

export type UTXOState = "DRAFT" | "COMPUTED" | "VALIDATED" | "QUALIFIED" | "REJECTED";

export interface UTXOOutput {
  utxo_id: string;
  v_address: string;
  type: UTXOType;
  state: UTXOState;
  payload: unknown;
  created_at: string;
  consumed: boolean;
}

export interface ProjectUTXO {
  id: string;
  genesis: string;
  current_state: string;
  unspent_outputs: Record<string, UTXOOutput>;
  branches: Record<string, Branch>;
  current_branch: string;
}

export interface Branch {
  branch_id: string;
  parent_branch?: string | null;
  created_at: string;
  reason: string;
  overrides: Record<string, unknown>;
  status: "ACTIVE" | "MERGED" | "ABANDONED";
  merge_info?: {
    merged_at: string;
    merged_by: string;
    decision: "ACCEPTED" | "REJECTED";
    target_branch?: string;
    applied_overrides?: Array<{
      target: string;
      old_value: unknown;
      new_value: unknown;
    }>;
  };
}

export interface VAddressParts {
  projectId: string;
  stake: string;
  version?: string;
  layer?: string;
  branch?: string;
  timestamp?: number;
}

function normalizeProjectIdRaw(projectId: string): string {
  const trimmed = projectId.trim();
  if (trimmed.length === 0) {
    throw new Error("projectId cannot be empty.");
  }
  return trimmed.startsWith("v://") ? trimmed.slice(4) : trimmed;
}

function normalizeProjectId(projectId: string): string {
  return `v://${normalizeProjectIdRaw(projectId)}`;
}

function cloneOutput(output: UTXOOutput): UTXOOutput {
  return {
    ...output,
    payload:
      output.payload !== null && typeof output.payload === "object"
        ? { ...(output.payload as Record<string, unknown>) }
        : output.payload,
  };
}

function parseUnixSeconds(value: string): number | undefined {
  if (!value || value.trim().length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error("timestamp must be an integer.");
  }
  return parsed;
}

function toUnixSeconds(iso: string): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor(parsed / 1000);
}

function resolveOutputVersion(output: UTXOOutput): string | undefined {
  try {
    const parsedAddress = parseVAddress(output.v_address);
    if (parsedAddress.version) return parsedAddress.version;
  } catch {
    // Ignore malformed historical entries and fallback to payload fields.
  }

  if (output.payload !== null && typeof output.payload === "object") {
    const payload = output.payload as Record<string, unknown>;
    const version = payload.version;
    if (typeof version === "string" && version.trim().length > 0) return version;
    const proofHash = payload.proof_hash;
    if (typeof proofHash === "string" && proofHash.trim().length > 0) return proofHash;
  }
  return undefined;
}

function resolveOutputTimestamp(output: UTXOOutput): number {
  try {
    const parsedAddress = parseVAddress(output.v_address);
    if (typeof parsedAddress.timestamp === "number") return parsedAddress.timestamp;
  } catch {
    // Ignore malformed historical entries and fallback to created_at.
  }
  return toUnixSeconds(output.created_at);
}

export function parseVAddress(v: string): VAddressParts {
  const text = v.trim();
  if (!text.startsWith("v://")) {
    throw new Error("v address must start with v://");
  }

  const withoutScheme = text.slice(4);
  const [pathPart, queryPart = ""] = withoutScheme.split("?", 2);
  const slashIndex = pathPart.indexOf("/");
  if (slashIndex <= 0 || slashIndex === pathPart.length - 1) {
    throw new Error("v address must include projectId and stake");
  }

  const projectId = pathPart.slice(0, slashIndex).trim();
  const stake = decodeURIComponent(pathPart.slice(slashIndex + 1)).trim();
  if (!projectId || !stake) {
    throw new Error("v address must include projectId and stake");
  }

  const params = new URLSearchParams(queryPart);
  const version = params.get("version")?.trim() || undefined;
  const layer = params.get("layer")?.trim() || undefined;
  const branchRaw = (text.includes("#") ? text.split("#")[1] : params.get("branch") || "")?.trim() || "";
  const branch = branchRaw ? decodeURIComponent(branchRaw) : undefined;
  const timestamp = parseUnixSeconds(params.get("time") ?? params.get("timestamp") ?? "");

  return {
    projectId,
    stake,
    version,
    layer,
    branch,
    timestamp,
  };
}

export function buildVAddress(input: {
  projectId: string;
  stake: string;
  version?: string;
  layer?: string;
  branch?: string;
  timestamp?: number;
}): string {
  const projectId = normalizeProjectIdRaw(input.projectId);
  const stake = input.stake.trim();
  if (!stake) {
    throw new Error("stake cannot be empty.");
  }

  const params = new URLSearchParams();
  if (input.version && input.version.trim().length > 0) params.set("version", input.version.trim());
  if (input.layer && input.layer.trim().length > 0) params.set("layer", input.layer.trim());
  if (typeof input.timestamp === "number") params.set("time", String(Math.trunc(input.timestamp)));

  const encodedStake = encodeURIComponent(stake).replace(/%2B/g, "+");
  const query = params.toString();
  const address = query.length > 0 ? `v://${projectId}/${encodedStake}?${query}` : `v://${projectId}/${encodedStake}`;
  if (input.branch && input.branch.trim().length > 0) {
    return `${address}#${encodeURIComponent(input.branch.trim())}`;
  }
  return address;
}

export function createProjectUTXO(projectId: string): ProjectUTXO {
  const now = new Date().toISOString();
  return {
    id: normalizeProjectId(projectId),
    genesis: now,
    current_state: "DRAFT",
    unspent_outputs: {},
    branches: {
      main: {
        branch_id: "main",
        parent_branch: null,
        created_at: now,
        reason: "genesis",
        overrides: {},
        status: "ACTIVE",
      },
    },
    current_branch: "main",
  };
}

export function addOutput(projectUTXO: ProjectUTXO, output: UTXOOutput): ProjectUTXO {
  if (projectUTXO.unspent_outputs[output.utxo_id]) {
    throw new Error(`UTXO already exists: ${output.utxo_id}`);
  }
  if (output.consumed) {
    throw new Error("Newly added output must be unconsumed.");
  }

  return {
    ...projectUTXO,
    current_state: output.state,
    unspent_outputs: {
      ...projectUTXO.unspent_outputs,
      [output.utxo_id]: cloneOutput({
        ...output,
        created_at: output.created_at || new Date().toISOString(),
        consumed: false,
      }),
    },
  };
}

export function consumeOutput(projectUTXO: ProjectUTXO, utxo_id: string): ProjectUTXO {
  const current = projectUTXO.unspent_outputs[utxo_id];
  if (!current) {
    throw new Error(`UTXO not found: ${utxo_id}`);
  }
  if (current.consumed) {
    throw new Error(`UTXO already consumed: ${utxo_id}`);
  }

  return {
    ...projectUTXO,
    unspent_outputs: {
      ...projectUTXO.unspent_outputs,
      [utxo_id]: cloneOutput({
        ...current,
        consumed: true,
      }),
    },
  };
}

export function getUnspentOutputs(projectUTXO: ProjectUTXO): UTXOOutput[] {
  return Object.values(projectUTXO.unspent_outputs).filter((output) => !output.consumed);
}

export function resolveVAddress(projectUTXO: ProjectUTXO, vAddress: string): UTXOOutput[] {
  const parsed = parseVAddress(vAddress);
  const projectId = normalizeProjectIdRaw(projectUTXO.id);
  if (projectId !== parsed.projectId) return [];

  let candidates = Object.values(projectUTXO.unspent_outputs).filter((output) => {
    try {
      const outputAddress = parseVAddress(output.v_address);
      if (outputAddress.stake !== parsed.stake) return false;
      if (parsed.layer && outputAddress.layer !== parsed.layer) return false;
      return true;
    } catch {
      return false;
    }
  });

  if (parsed.version) {
    candidates = candidates.filter((output) => resolveOutputVersion(output) === parsed.version);
  }

  if (typeof parsed.timestamp === "number") {
    const timestamp = parsed.timestamp;
    const history = candidates.filter((output) => resolveOutputTimestamp(output) <= timestamp);
    if (history.length === 0) return [];
    const latestTimestamp = Math.max(...history.map(resolveOutputTimestamp));
    return history.filter((output) => resolveOutputTimestamp(output) === latestTimestamp);
  }

  if (!parsed.version) {
    candidates = candidates.filter((output) => !output.consumed);
  }
  return candidates;
}

export function forkBranch(
  projectUTXO: ProjectUTXO,
  fromBranch: string,
  newBranchId: string,
  reason: string,
): ProjectUTXO {
  const source = fromBranch.trim() || "main";
  const nextBranchId = newBranchId.trim();
  if (!nextBranchId) throw new Error("newBranchId cannot be empty.");
  if (!projectUTXO.branches[source]) throw new Error(`parent branch not found: ${source}`);
  if (projectUTXO.branches[nextBranchId]) throw new Error(`branch already exists: ${nextBranchId}`);
  if (projectUTXO.branches[source].status !== "ACTIVE") throw new Error(`parent branch is not ACTIVE: ${source}`);

  return {
    ...projectUTXO,
    branches: {
      ...projectUTXO.branches,
      [nextBranchId]: {
        branch_id: nextBranchId,
        parent_branch: source,
        created_at: new Date().toISOString(),
        reason: reason.trim() || "fork",
        overrides: {},
        status: "ACTIVE",
      },
    },
  };
}

export function applyOverride(branch: Branch, targetPath: string, value: unknown): Branch {
  const target = targetPath.trim();
  if (!target) throw new Error("targetPath cannot be empty.");
  return {
    ...branch,
    overrides: {
      ...branch.overrides,
      [target]: value,
    },
  };
}

export function mergeBranch(
  projectUTXO: ProjectUTXO,
  branchId: string,
  options?: {
    targetBranch?: string;
    decision?: "ACCEPTED" | "REJECTED";
    operator?: string;
  },
): ProjectUTXO {
  const branchKey = branchId.trim();
  if (!branchKey || branchKey === "main") throw new Error("main branch cannot be merged.");
  const branch = projectUTXO.branches[branchKey];
  if (!branch) throw new Error(`branch not found: ${branchKey}`);
  if (branch.status !== "ACTIVE") throw new Error(`branch is not ACTIVE: ${branchKey}`);
  const targetBranch = options?.targetBranch?.trim() || "main";
  if (branchKey === targetBranch) throw new Error("source and target branch cannot be the same.");
  const target = projectUTXO.branches[targetBranch];
  if (!target) throw new Error(`target branch not found: ${targetBranch}`);
  if (target.status !== "ACTIVE") throw new Error(`target branch is not ACTIVE: ${targetBranch}`);

  const decision = options?.decision ?? "ACCEPTED";
  const mergedBy = options?.operator?.trim() || "did:system:local";
  const mergedAt = new Date().toISOString();
  const mergeInfo: NonNullable<Branch["merge_info"]> = {
    merged_at: mergedAt,
    merged_by: mergedBy,
    decision,
    target_branch: targetBranch,
  };

  let nextTarget = { ...target };
  let nextBranchStatus: Branch["status"] = "ABANDONED";
  if (decision === "ACCEPTED") {
    const applied: NonNullable<Branch["merge_info"]>["applied_overrides"] = [];
    const targetOverrides = { ...target.overrides };
    Object.entries(branch.overrides).forEach(([targetPath, nextValue]) => {
      const oldValue = targetOverrides[targetPath];
      targetOverrides[targetPath] = nextValue;
      applied.push({
        target: targetPath,
        old_value: oldValue,
        new_value: nextValue,
      });
    });
    nextTarget = {
      ...target,
      overrides: targetOverrides,
    };
    mergeInfo.applied_overrides = applied;
    nextBranchStatus = "MERGED";
  }

  return {
    ...projectUTXO,
    current_branch:
      projectUTXO.current_branch === branchKey ? (decision === "ACCEPTED" ? targetBranch : "main") : projectUTXO.current_branch,
    branches: {
      ...projectUTXO.branches,
      [targetBranch]: nextTarget,
      [branchKey]: {
        ...branch,
        status: nextBranchStatus,
        merge_info: mergeInfo,
      },
    },
  };
}

export function abandonBranch(projectUTXO: ProjectUTXO, branchId: string): ProjectUTXO {
  const branchKey = branchId.trim();
  if (!branchKey || branchKey === "main") throw new Error("main branch cannot be abandoned.");
  const branch = projectUTXO.branches[branchKey];
  if (!branch) throw new Error(`branch not found: ${branchKey}`);
  if (branch.status !== "ACTIVE") throw new Error(`branch is not ACTIVE: ${branchKey}`);

  return {
    ...projectUTXO,
    current_branch: projectUTXO.current_branch === branchKey ? "main" : projectUTXO.current_branch,
    branches: {
      ...projectUTXO.branches,
      [branchKey]: {
        ...branch,
        status: "ABANDONED",
      },
    },
  };
}

export function splitUTXO(projectUTXO: ProjectUTXO, originalRange: string, splits: string[]): ProjectUTXO {
  const original = originalRange.trim();
  const splitRanges = splits.map((item) => item.trim()).filter((item) => item.length > 0);
  if (!original) throw new Error("originalRange cannot be empty.");
  if (splitRanges.length < 2) throw new Error("splits must include at least 2 segments.");

  const originalLength = parseRangeLength(original);
  const splitLengthSum = splitRanges.reduce((sum, item) => sum + parseRangeLength(item), 0);
  if (Math.abs(originalLength - splitLengthSum) > 1e-6) {
    throw new Error("split conservation check failed.");
  }

  let nextState = { ...projectUTXO, unspent_outputs: { ...projectUTXO.unspent_outputs } };
  const parents = Object.values(projectUTXO.unspent_outputs).filter((output) => {
    try {
      return parseVAddress(output.v_address).stake === original && !output.consumed;
    } catch {
      return false;
    }
  });
  if (parents.length === 0) throw new Error(`no unspent UTXO found for range: ${original}`);

  for (const parent of parents) {
    nextState = consumeOutput(nextState, parent.utxo_id);
    const parentAddress = parseVAddress(parent.v_address);
    splitRanges.forEach((splitStake, index) => {
      nextState = addOutput(nextState, {
        ...parent,
        utxo_id: `${parent.utxo_id}_split_${index + 1}`,
        v_address: buildVAddress({
          projectId: parentAddress.projectId,
          stake: splitStake,
          version: parentAddress.version,
          layer: parentAddress.layer,
          timestamp: parentAddress.timestamp,
        }),
        payload:
          parent.payload !== null && typeof parent.payload === "object"
            ? {
                ...(parent.payload as Record<string, unknown>),
                inherited_from: parent.utxo_id,
                split_index: index + 1,
                split_total: splitRanges.length,
              }
            : parent.payload,
        consumed: false,
      });
    });
  }
  return nextState;
}

function resolveBranchOverrides(projectUTXO: ProjectUTXO, branchId: string): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  const chain: Branch[] = [];
  let cursor: string | undefined = branchId;
  const visited = new Set<string>();

  while (cursor) {
    if (visited.has(cursor)) throw new Error("branch parent cycle detected.");
    visited.add(cursor);
    const branch: Branch | undefined = projectUTXO.branches[cursor];
    if (!branch) throw new Error(`branch not found: ${cursor}`);
    chain.push(branch);
    cursor = branch.parent_branch ?? undefined;
  }

  chain.reverse().forEach((branch) => {
    Object.entries(branch.overrides).forEach(([target, value]) => {
      resolved[target] = value;
    });
  });
  return resolved;
}

function parseRangeLength(rangeText: string): number {
  const [startRaw, endRaw] = rangeText.split("-");
  if (!startRaw || !endRaw) throw new Error(`invalid range format: ${rangeText}`);
  const start = parseStakePoint(startRaw);
  const end = parseStakePoint(endRaw);
  if (end <= start) throw new Error(`range must increase: ${rangeText}`);
  return end - start;
}

function parseStakePoint(raw: string): number {
  const normalized = raw.trim().toUpperCase().replace(/^K/, "");
  if (normalized.includes("+")) {
    const [kmRaw, meterRaw] = normalized.split("+", 2);
    const km = Number.parseFloat(kmRaw);
    const meter = Number.parseFloat(meterRaw);
    if (Number.isNaN(km) || Number.isNaN(meter)) throw new Error(`invalid stake point: ${raw}`);
    return km * 1000 + meter;
  }
  const km = Number.parseFloat(normalized);
  if (Number.isNaN(km)) throw new Error(`invalid stake point: ${raw}`);
  return km * 1000;
}



