import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { sha256Json } from "./hash.ts";

export interface AnchorReceipt {
  anchorId: string;
  anchorRef?: string;
  providerName?: string;
  hash: string;
  anchoredAt: string;
  status?: "ANCHORED" | "NOT_FOUND" | "MISMATCH";
}

export interface AnchorProviderStatus {
  providerName: string;
  state: "ready" | "degraded" | "offline";
  submittedCount: number;
  verifiedCount: number;
  message?: string;
}

export interface AnchorSubmitResult {
  providerName: string;
  anchorRef: string;
  hash: string;
  anchoredAt: string;
  status: "ANCHORED";
}

export interface AnchorVerifyResult {
  providerName: string;
  anchorRef: string;
  hash: string | null;
  anchoredAt: string | null;
  status: "ANCHORED" | "NOT_FOUND";
}

export interface AnchorProvider {
  providerName: string;
  submit(proof: Record<string, unknown>): AnchorSubmitResult;
  verify(anchorRef: string): AnchorVerifyResult;
  status(): AnchorProviderStatus;
}

export interface IpfsAddResult {
  cid: string;
  size?: string;
  raw?: unknown;
}

export interface IpfsStatResult {
  found: boolean;
  raw?: unknown;
}

export interface IpfsAnchorTransport {
  addJson(params: {
    apiBaseUrl: string;
    payload: string;
    authToken?: string | null;
    pin?: boolean;
  }): IpfsAddResult;
  statCid(params: {
    apiBaseUrl: string;
    cid: string;
    authToken?: string | null;
  }): IpfsStatResult;
}

export interface IpfsHttpAnchorProviderOptions {
  providerName?: string;
  apiBaseUrl?: string;
  authToken?: string | null;
  pin?: boolean;
  transport?: IpfsAnchorTransport;
}

interface MockAnchorRecord {
  anchorRef: string;
  hash: string;
  anchoredAt: string;
  submittedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeProofHash(proof: Record<string, unknown>): string {
  const maybeHash = proof.hash;
  if (typeof maybeHash === "string" && maybeHash.trim()) {
    return maybeHash.trim();
  }
  return sha256Json(proof);
}

function normalizeApiBaseUrl(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().replace(/\/+$/, "");
  return normalized || "http://127.0.0.1:5001";
}

function normalizeIpfsAnchorRef(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("ipfs://")) {
    return normalized;
  }
  if (normalized.startsWith("/ipfs/")) {
    const cid = normalized.slice("/ipfs/".length).split(/[/?#]/, 1)[0]?.trim() ?? "";
    return cid ? `ipfs://${cid}` : "";
  }
  return `ipfs://${normalized}`;
}

function extractCidFromAnchorRef(anchorRef: string): string | null {
  const normalized = anchorRef.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("ipfs://")) {
    const cid = normalized.slice("ipfs://".length).split(/[/?#]/, 1)[0]?.trim() ?? "";
    return cid || null;
  }
  if (normalized.startsWith("/ipfs/")) {
    const cid = normalized.slice("/ipfs/".length).split(/[/?#]/, 1)[0]?.trim() ?? "";
    return cid || null;
  }
  const plain = normalized.split(/[/?#]/, 1)[0]?.trim() ?? "";
  return plain || null;
}

function parseLastJsonLine(raw: string): Record<string, unknown> {
  const lines = raw
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{")) {
      continue;
    }
    const parsed = JSON.parse(line);
    const record = readObject(parsed);
    if (record) {
      return record;
    }
  }
  throw new Error("ipfs response missing JSON payload");
}

function runCurl(args: string[], input?: string): string {
  const result = spawnSync("curl", args, {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr || `curl exited with code ${String(result.status)}`);
  }
  return typeof result.stdout === "string" ? result.stdout : String(result.stdout ?? "");
}

export class CurlIpfsAnchorTransport implements IpfsAnchorTransport {
  addJson(params: {
    apiBaseUrl: string;
    payload: string;
    authToken?: string | null;
    pin?: boolean;
  }): IpfsAddResult {
    const base = normalizeApiBaseUrl(params.apiBaseUrl);
    const pin = params.pin !== false ? "true" : "false";
    const url = `${base}/api/v0/add?cid-version=1&pin=${pin}&wrap-with-directory=false`;
    const args = [
      "-sS",
      "--fail",
      "-X",
      "POST",
      url,
      "-H",
      "Expect:",
      "-F",
      "file=@-;filename=proof.json;type=application/json",
    ];
    const token = params.authToken?.trim();
    if (token) {
      args.push("-H", `Authorization: Bearer ${token}`);
    }
    const raw = runCurl(args, params.payload);
    const parsed = parseLastJsonLine(raw);
    const hash = typeof parsed.Hash === "string" ? parsed.Hash.trim() : "";
    if (!hash) {
      throw new Error("ipfs add response missing Hash");
    }
    return {
      cid: hash,
      size: typeof parsed.Size === "string" ? parsed.Size : undefined,
      raw: parsed,
    };
  }

  statCid(params: {
    apiBaseUrl: string;
    cid: string;
    authToken?: string | null;
  }): IpfsStatResult {
    const base = normalizeApiBaseUrl(params.apiBaseUrl);
    const url = `${base}/api/v0/block/stat?arg=${encodeURIComponent(params.cid)}`;
    const args = [
      "-sS",
      "--fail",
      "-X",
      "POST",
      url,
      "-H",
      "Expect:",
    ];
    const token = params.authToken?.trim();
    if (token) {
      args.push("-H", `Authorization: Bearer ${token}`);
    }
    const raw = runCurl(args);
    const parsed = parseLastJsonLine(raw);
    return {
      found: true,
      raw: parsed,
    };
  }
}

export class MockAnchorProvider implements AnchorProvider {
  readonly providerName: string;
  private readonly records = new Map<string, MockAnchorRecord>();
  private verifyCount = 0;

  constructor(providerName = "mock_anchor_provider") {
    this.providerName = providerName.trim() || "mock_anchor_provider";
  }

  submit(proof: Record<string, unknown>): AnchorSubmitResult {
    const hash = normalizeProofHash(proof);
    const anchoredAt = nowIso();
    const anchorRef = `mock://${this.providerName}/${randomUUID()}`;
    this.records.set(anchorRef, {
      anchorRef,
      hash,
      anchoredAt,
      submittedAt: nowIso(),
    });
    return {
      providerName: this.providerName,
      anchorRef,
      hash,
      anchoredAt,
      status: "ANCHORED",
    };
  }

  verify(anchorRef: string): AnchorVerifyResult {
    this.verifyCount += 1;
    const normalized = anchorRef.trim();
    const record = normalized ? this.records.get(normalized) : null;
    if (!record) {
      return {
        providerName: this.providerName,
        anchorRef: normalized,
        hash: null,
        anchoredAt: null,
        status: "NOT_FOUND",
      };
    }
    return {
      providerName: this.providerName,
      anchorRef: record.anchorRef,
      hash: record.hash,
      anchoredAt: record.anchoredAt,
      status: "ANCHORED",
    };
  }

  status(): AnchorProviderStatus {
    return {
      providerName: this.providerName,
      state: "ready",
      submittedCount: this.records.size,
      verifiedCount: this.verifyCount,
      message: "mock provider active",
    };
  }
}

interface IpfsAnchorRecord {
  anchorRef: string;
  cid: string;
  hash: string;
  anchoredAt: string;
}

export class IpfsHttpAnchorProvider implements AnchorProvider {
  readonly providerName: string;
  private readonly apiBaseUrl: string;
  private readonly authToken: string | null;
  private readonly pin: boolean;
  private readonly transport: IpfsAnchorTransport;
  private readonly records = new Map<string, IpfsAnchorRecord>();
  private submittedCount = 0;
  private verifyCount = 0;
  private lastError: string | null = null;

  constructor(options: IpfsHttpAnchorProviderOptions = {}) {
    this.providerName = options.providerName?.trim() || "ipfs_http_anchor_provider";
    this.apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
    this.authToken = options.authToken?.trim() || null;
    this.pin = options.pin !== false;
    this.transport = options.transport ?? new CurlIpfsAnchorTransport();
  }

  submit(proof: Record<string, unknown>): AnchorSubmitResult {
    const payload = JSON.stringify(proof);
    const hash = normalizeProofHash(proof);
    const added = this.transport.addJson({
      apiBaseUrl: this.apiBaseUrl,
      payload,
      authToken: this.authToken,
      pin: this.pin,
    });
    const anchorRef = normalizeIpfsAnchorRef(added.cid);
    if (!anchorRef) {
      throw new Error("ipfs add returned empty cid");
    }
    const anchoredAt = nowIso();
    this.records.set(anchorRef, {
      anchorRef,
      cid: added.cid,
      hash,
      anchoredAt,
    });
    this.submittedCount += 1;
    this.lastError = null;
    return {
      providerName: this.providerName,
      anchorRef,
      hash,
      anchoredAt,
      status: "ANCHORED",
    };
  }

  verify(anchorRef: string): AnchorVerifyResult {
    this.verifyCount += 1;
    const normalizedRef = normalizeIpfsAnchorRef(anchorRef);
    const cid = extractCidFromAnchorRef(normalizedRef);
    if (!cid) {
      return {
        providerName: this.providerName,
        anchorRef: normalizedRef || anchorRef.trim(),
        hash: null,
        anchoredAt: null,
        status: "NOT_FOUND",
      };
    }
    try {
      const stat = this.transport.statCid({
        apiBaseUrl: this.apiBaseUrl,
        cid,
        authToken: this.authToken,
      });
      if (!stat.found) {
        return {
          providerName: this.providerName,
          anchorRef: normalizedRef,
          hash: null,
          anchoredAt: null,
          status: "NOT_FOUND",
        };
      }
      const known = this.records.get(normalizedRef) ?? null;
      this.lastError = null;
      return {
        providerName: this.providerName,
        anchorRef: normalizedRef,
        hash: known?.hash ?? null,
        anchoredAt: known?.anchoredAt ?? null,
        status: "ANCHORED",
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return {
        providerName: this.providerName,
        anchorRef: normalizedRef,
        hash: null,
        anchoredAt: null,
        status: "NOT_FOUND",
      };
    }
  }

  status(): AnchorProviderStatus {
    return {
      providerName: this.providerName,
      state: this.lastError ? "degraded" : "ready",
      submittedCount: this.submittedCount,
      verifiedCount: this.verifyCount,
      message: this.lastError ?? `ipfs api: ${this.apiBaseUrl}`,
    };
  }
}

export class MockAnchorService {
  private readonly provider: MockAnchorProvider;
  private readonly receipts = new Map<string, AnchorReceipt>();

  constructor(providerName = "mock_anchor_provider") {
    this.provider = new MockAnchorProvider(providerName);
  }

  anchor(hash: string): AnchorReceipt {
    const submitted = this.provider.submit({ hash });
    const receipt: AnchorReceipt = {
      anchorId: submitted.anchorRef,
      anchorRef: submitted.anchorRef,
      providerName: submitted.providerName,
      hash: submitted.hash,
      anchoredAt: submitted.anchoredAt,
      status: submitted.status,
    };
    this.receipts.set(receipt.anchorId, receipt);
    return receipt;
  }

  get(anchorId: string): AnchorReceipt | null {
    return this.receipts.get(anchorId) ?? null;
  }

  getProvider(): AnchorProvider {
    return this.provider;
  }
}
