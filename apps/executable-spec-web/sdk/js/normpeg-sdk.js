/**
 * Minimal JS SDK for NormPeg public API v1.
 * Supported high-level actions:
 * - register spec (markdown or SPU definition)
 * - execute
 * - query proof
 */

const DEFAULT_BASE_URL = "http://localhost:8790";

function trimTrailingSlash(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function normalizeBaseUrl(baseUrl) {
  const normalized = trimTrailingSlash(baseUrl);
  return normalized || DEFAULT_BASE_URL;
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${path}`);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "undefined" || value === null) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export class NormPegApiError extends Error {
  /**
   * @param {{
   *   message: string;
   *   code?: string | null;
   *   status?: number | null;
   *   requestId?: string | null;
   *   details?: unknown;
   * }} params
   */
  constructor(params) {
    super(params.message);
    this.name = "NormPegApiError";
    this.code = params.code ?? null;
    this.status = typeof params.status === "number" ? params.status : null;
    this.requestId = params.requestId ?? null;
    this.details = typeof params.details === "undefined" ? null : params.details;
  }
}

export class NormPegClient {
  /**
   * @param {{
   *   baseUrl?: string;
   *   role?: "admin" | "builder" | "expert" | "inspector" | "supervisor";
   *   actorId?: string;
   *   tenantId?: string;
   *   fetchImpl?: typeof fetch;
   * }} options
   */
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.role = options.role ?? "admin";
    this.actorId = options.actorId ?? "sdk-client";
    this.tenantId = options.tenantId ?? "default";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("fetch implementation is required (Node.js 18+ or provide fetchImpl)");
    }
  }

  /**
   * @param {{
   *   method: "GET" | "POST";
   *   path: string;
   *   query?: Record<string, unknown>;
   *   body?: unknown;
   *   headers?: Record<string, string>;
   * }} params
   */
  async request(params) {
    const url = buildUrl(this.baseUrl, params.path, params.query);
    const headers = {
      "Content-Type": "application/json",
      "x-user-role": this.role,
      "x-actor-id": this.actorId,
      "x-tenant-id": this.tenantId,
      ...(params.headers ?? {}),
    };
    const response = await this.fetchImpl(url, {
      method: params.method,
      headers,
      body: typeof params.body === "undefined" ? undefined : JSON.stringify(params.body),
    });
    const raw = await response.text();
    let payload = null;
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new NormPegApiError({
          message: `non-JSON response from server: ${raw.slice(0, 300)}`,
          status: response.status,
        });
      }
    }

    if (!payload || typeof payload !== "object") {
      throw new NormPegApiError({
        message: "empty or invalid response payload",
        status: response.status,
      });
    }

    const envelope = /** @type {any} */ (payload);
    const requestId = envelope?.meta?.requestId ?? null;
    if (!response.ok || envelope.ok === false) {
      const errorMessage = envelope?.error?.message || `${response.status} ${response.statusText}`;
      throw new NormPegApiError({
        message: errorMessage,
        code: envelope?.error?.code ?? null,
        status: response.status,
        requestId,
        details: envelope?.error?.details,
      });
    }

    return {
      data: envelope.data,
      meta: envelope.meta ?? null,
    };
  }

  /**
   * Register spec from markdown.
   * Corresponds to POST /api/public/v1/specs/register-markdown
   */
  async registerSpecMarkdown(markdown, options = {}) {
    const payload = {
      markdown,
      ...options,
    };
    const response = await this.request({
      method: "POST",
      path: "/api/public/v1/specs/register-markdown",
      body: payload,
    });
    return response.data;
  }

  /**
   * Publish SPU definition directly.
   * Corresponds to POST /api/public/v1/spus/publish
   */
  async publishSpu(definition) {
    const response = await this.request({
      method: "POST",
      path: "/api/public/v1/spus/publish",
      body: { definition },
    });
    return response.data;
  }

  /**
   * Unified register entry.
   * - if input has `markdown`, uses register-markdown
   * - if input has `definition`, uses spu publish
   */
  async registerSpec(input) {
    if (input && typeof input === "object" && typeof input.markdown === "string") {
      return this.registerSpecMarkdown(input.markdown, input.options ?? {});
    }
    if (input && typeof input === "object" && input.definition) {
      return this.publishSpu(input.definition);
    }
    throw new Error("registerSpec requires { markdown } or { definition }");
  }

  /**
   * Execute gate evaluation.
   * Corresponds to POST /api/public/v1/executions/evaluate
   */
  async execute(payload) {
    const response = await this.request({
      method: "POST",
      path: "/api/public/v1/executions/evaluate",
      body: payload,
    });
    return response.data;
  }

  /**
   * Query archived container proof.
   * Corresponds to GET /api/public/v1/proofs/:containerId
   */
  async queryProof(containerId) {
    const safeId = encodeURIComponent(String(containerId ?? "").trim());
    if (!safeId) {
      throw new Error("containerId is required");
    }
    const response = await this.request({
      method: "GET",
      path: `/api/public/v1/proofs/${safeId}`,
    });
    return response.data;
  }
}

