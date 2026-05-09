import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const TEST_TIMEOUT_MS = 180_000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

let platformServer: ChildProcessWithoutNullStreams | null = null;
let platformBaseUrl = "";
const platformLogs: string[] = [];

type RequestOptions = {
  method?: "GET" | "POST";
  role?: "admin" | "builder" | "expert" | "inspector" | "supervisor";
  actorId?: string;
  body?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected object payload");
  }
  return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function detectMetricFromRule(item: Record<string, unknown>): "compaction" | "thickness" | "deflection" | null {
  const text = `${String(item.rule_id ?? "")} ${String(item.item_name ?? "")} ${String(item.source_text ?? "")}`.toLowerCase();
  if (text.includes("compaction") || text.includes("鍘嬪疄")) {
    return "compaction";
  }
  if (text.includes("thickness") || text.includes("鍘氬害")) {
    return "thickness";
  }
  if (text.includes("deflection") || text.includes("寮矇")) {
    return "deflection";
  }
  return null;
}

function buildInputsByRuleItems(ruleItems: Record<string, unknown>[], forceOverallFail: boolean): Record<string, unknown> {
  const defaults: Record<string, number> = {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
    compactionDegree: 96,
    compaction_degree: 96,
    measuredThickness: 205,
    designThickness: 200,
    measuredDeflection: forceOverallFail ? 999 : 180,
    deflectionValue: forceOverallFail ? 999 : 180,
    maxAllowedDeflection: 200,
  };
  const inputs: Record<string, unknown> = {};
  for (const item of ruleItems) {
    const inputFields = Array.isArray(item.input_fields)
      ? item.input_fields.map((field) => String(field)).filter(Boolean)
      : [];
    for (const field of inputFields) {
      inputs[field] = defaults[field] ?? 1;
    }
  }
  if (Object.keys(inputs).length === 0) {
    return {
      ...defaults,
    };
  }
  return inputs;
}

async function selectPublishedAggregatePackage(requiredRuleIds: string[]): Promise<{
  packageId: string;
  normdocId: string;
  standardCode: string;
  rules: Record<string, unknown>[];
}> {
  const packagesResponse = await apiRequest("/api/rule-store/packages", { role: "inspector" });
  assert.equal(packagesResponse.status, 200, packagesResponse.text);
  const packageItems = asRecord(asRecord(packagesResponse.json).data).items;
  assert.ok(Array.isArray(packageItems) && packageItems.length > 0, "rule-store packages should not be empty");

  for (const pkg of packageItems) {
    if (!pkg || typeof pkg !== "object") {
      continue;
    }
    const packageId = String((pkg as Record<string, unknown>).package_id ?? "").trim();
    const normdocId = String((pkg as Record<string, unknown>).normdoc_id ?? "").trim();
    if (!packageId || !normdocId) {
      continue;
    }
    const rulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`, { role: "inspector" });
    if (rulesResponse.status !== 200) {
      continue;
    }
    const rulesRaw = asRecord(asRecord(rulesResponse.json).data).items;
    if (!Array.isArray(rulesRaw) || rulesRaw.length === 0) {
      continue;
    }
    const rules = rulesRaw.filter((item) => Boolean(item) && typeof item === "object").map((item) => asRecord(item));
    const ruleIds = rules.map((item) => String(item.rule_id ?? "").trim());
    const hasAllRequired = requiredRuleIds.every((ruleId) => ruleIds.includes(ruleId));
    if (!hasAllRequired) {
      continue;
    }
    const normdocDetailResponse = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, { role: "inspector" });
    if (normdocDetailResponse.status !== 200) {
      continue;
    }
    const normdoc = asRecord(asRecord(asRecord(normdocDetailResponse.json).data).item).normdoc as Record<string, unknown>;
    const standardCode = String(normdoc.standard_code ?? "").trim();
    return { packageId, normdocId, standardCode, rules };
  }
  throw new Error("failed to find published aggregate package for required SPUs");
}

async function allocatePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolvePort(port);
      });
    });
  });
}

async function waitForPlatformReady(baseUrl: string): Promise<void> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/dashboard`);
      if (response.ok) {
        return;
      }
      lastError = `dashboard status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveTick) => setTimeout(resolveTick, 150));
  }
  throw new Error(`platform-api not ready: ${lastError ?? "unknown error"}\n${platformLogs.join("")}`);
}

async function apiRequest(path: string, options: RequestOptions = {}): Promise<{
  status: number;
  json: unknown;
  text: string;
}> {
  const method = options.method ?? "GET";
  const response = await fetch(`${platformBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-user-role": options.role ?? "admin",
      "x-actor-id": options.actorId ?? "aggregate.tester",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json: unknown = null;
  if (text.trim()) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return {
    status: response.status,
    json,
    text,
  };
}

before(async () => {
  const port = await allocatePort();
  platformBaseUrl = `http://127.0.0.1:${port}`;
  platformServer = spawn(
    process.execPath,
    ["--experimental-transform-types", "apps/executable-spec-web/server/platform-api.ts"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PLATFORM_API_PORT: String(port),
        NORMPEG_HOST: "127.0.0.1",
        NORMPEG_PUBLIC_BASE_URL: platformBaseUrl,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  platformServer.stdout.on("data", (chunk) => {
    platformLogs.push(String(chunk));
  });
  platformServer.stderr.on("data", (chunk) => {
    platformLogs.push(String(chunk));
  });
  await waitForPlatformReady(platformBaseUrl);
});

after(async () => {
  if (!platformServer) {
    return;
  }
  const target = platformServer;
  platformServer = null;
  if (target.exitCode === null) {
    target.kill("SIGTERM");
  }
  await new Promise<void>((resolveDone) => {
    target.once("exit", () => resolveDone());
    setTimeout(() => resolveDone(), 2_000);
  });
});

test("aggregate run: INCOMPLETE when required item inputs are missing", { timeout: TEST_TIMEOUT_MS }, async () => {
  const registryResponse = await apiRequest("/api/registry/spus");
  assert.equal(registryResponse.status, 200, registryResponse.text);
  const registryItems = asRecord(registryResponse.json).items;
  assert.ok(Array.isArray(registryItems), "registry items should be array");
  const compactionSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("compaction"));
  const thicknessSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("thickness"));
  const deflectionSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("deflection"));
  assert.ok(compactionSpu && thicknessSpu && deflectionSpu, "compaction/thickness/deflection SPUs should exist");

  const compactionSpuId = String((compactionSpu as Record<string, unknown>).spuId ?? "").trim();
  const thicknessSpuId = String((thicknessSpu as Record<string, unknown>).spuId ?? "").trim();
  const deflectionSpuId = String((deflectionSpu as Record<string, unknown>).spuId ?? "").trim();
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const projectId = `P-AGG-${uniqueSuffix}`;
  const point = "K19+070";
  const selected = await selectPublishedAggregatePackage([compactionSpuId, thicknessSpuId, deflectionSpuId]);
  const packageId = selected.packageId;
  const normdocId = selected.normdocId;
  const standardCode = selected.standardCode;

  const aggregateResponse = await apiRequest("/api/executor/aggregate-run", {
    method: "POST",
    role: "inspector",
    actorId: "aggregate.executor",
    body: {
      query: "妫€鏌?K19+070 鏄惁婊¤冻璺熀楠屾敹瑕佹眰",
      context: {
        project_id: projectId,
        point,
        user_id: "did:peg:ins_agg",
        standard_code: standardCode,
        normdoc_id: normdocId,
        package_id: packageId,
      },
    },
  });
  assert.equal(aggregateResponse.status, 200, aggregateResponse.text);
  const aggregatePayload = asRecord(aggregateResponse.json);
  assert.equal(String(aggregatePayload.overall ?? ""), "INCOMPLETE");
  const itemResults = aggregatePayload.item_results;
  assert.ok(Array.isArray(itemResults), "item_results should be array");
  assert.equal(itemResults.length, 3);
  assert.equal(itemResults.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).status ?? "") === "INCOMPLETE";
  }), true);
  const proofRefs = aggregatePayload.proof_refs;
  assert.ok(Array.isArray(proofRefs), "proof_refs should be array");
  assert.equal(proofRefs.length, 0);
});

test("aggregate run + nl2gate: FAIL when any required item FAIL, with proof refs", { timeout: TEST_TIMEOUT_MS }, async () => {
  const registryResponse = await apiRequest("/api/registry/spus");
  assert.equal(registryResponse.status, 200, registryResponse.text);
  const registryItems = asRecord(registryResponse.json).items;
  assert.ok(Array.isArray(registryItems), "registry items should be array");
  const compactionSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("compaction"));
  const thicknessSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("thickness"));
  const deflectionSpu = registryItems.find((item) => normalizeText((item as Record<string, unknown>).spuId).includes("deflection"));
  assert.ok(compactionSpu && thicknessSpu && deflectionSpu, "compaction/thickness/deflection SPUs should exist");

  const compactionSpuId = String((compactionSpu as Record<string, unknown>).spuId ?? "").trim();
  const thicknessSpuId = String((thicknessSpu as Record<string, unknown>).spuId ?? "").trim();
  const deflectionSpuId = String((deflectionSpu as Record<string, unknown>).spuId ?? "").trim();
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const selected = await selectPublishedAggregatePackage([compactionSpuId, thicknessSpuId, deflectionSpuId]);
  const packageId = selected.packageId;
  const normdocId = selected.normdocId;
  const standardCode = selected.standardCode;
  const targetRules = selected.rules.filter((item) => detectMetricFromRule(item) !== null);
  assert.ok(targetRules.length >= 3, "aggregate package should include compaction/thickness/deflection rules");

  const projectId = `P-AGG-FAIL-${Date.now()}`;
  const point = "K19+070";
  const failingInputs = buildInputsByRuleItems(targetRules, true);

  const aggregateResponse = await apiRequest("/api/executor/aggregate-run", {
    method: "POST",
    role: "inspector",
    actorId: "aggregate.executor",
    body: {
      query: "妫€鏌?K19+070 鏄惁婊¤冻璺熀楠屾敹瑕佹眰",
      context: {
        project_id: projectId,
        point,
        user_id: "did:peg:ins_agg",
        standard_code: standardCode,
        normdoc_id: normdocId,
        package_id: packageId,
        inputs: failingInputs,
      },
    },
  });
  assert.equal(aggregateResponse.status, 200, aggregateResponse.text);
  const aggregatePayload = asRecord(aggregateResponse.json);
  assert.equal(String(aggregatePayload.overall ?? ""), "FAIL");
  const itemResults = aggregatePayload.item_results;
  assert.ok(Array.isArray(itemResults), "item_results should be array");
  assert.equal(itemResults.some((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).status ?? "") === "FAIL";
  }), true);
  const proofRefs = aggregatePayload.proof_refs;
  assert.ok(Array.isArray(proofRefs), "proof_refs should be array");
  assert.equal(proofRefs.length > 0, true, "proof refs should not be empty when execution happens");

  const nl2gateResponse = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "aggregate.pegbot",
    body: {
      query: "妫€鏌?K19+070 鏄惁婊¤冻璺熀楠屾敹瑕佹眰",
      mode: "evaluate",
      execute: true,
      context: {
        project_id: projectId,
        point,
        user_id: "did:peg:ins_agg",
        standard_code: standardCode,
        normdoc_id: normdocId,
        package_id: packageId,
        inputs: failingInputs,
      },
    },
  });
  assert.equal(nl2gateResponse.status, 200, nl2gateResponse.text);
  const nl2gatePayload = asRecord(nl2gateResponse.json);
  const aggregation = asRecord(nl2gatePayload.aggregation);
  assert.equal(String(aggregation.overall ?? ""), "FAIL");
  const execution = asRecord(nl2gatePayload.execution);
  const outputs = asRecord(execution.outputs);
  assert.equal(String(outputs.overall ?? ""), "FAIL");
});

