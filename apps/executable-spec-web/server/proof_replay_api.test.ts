import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const TEST_TIMEOUT_MS = 120_000;
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
      "x-actor-id": options.actorId ?? "proof.replay.tester",
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

function buildCompactionInputs(inputFields: string[]): Record<string, unknown> {
  const defaults: Record<string, number> = {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
    compactionDegree: 95,
  };
  const inputs: Record<string, unknown> = {};
  for (const field of inputFields) {
    const normalizedField = String(field ?? "").trim();
    if (!normalizedField) {
      continue;
    }
    inputs[normalizedField] = defaults[normalizedField] ?? 1;
  }
  if (Object.keys(inputs).length > 0) {
    return inputs;
  }
  return { ...defaults };
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

test("proof replay api: re-executes executor and compares replay result", { timeout: TEST_TIMEOUT_MS }, async () => {
  const registryResponse = await apiRequest("/api/registry/spus");
  assert.equal(registryResponse.status, 200, registryResponse.text);
  const registryItems = asRecord(registryResponse.json).items;
  assert.ok(Array.isArray(registryItems) && registryItems.length > 0, "registry should have SPUs");
  const compactionSpu = registryItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).spuId ?? "").toLowerCase().includes("compaction");
  }) as Record<string, unknown> | undefined;
  assert.ok(compactionSpu, "compaction SPU should exist");
  const compactionSpuId = String(compactionSpu?.spuId ?? "").trim();
  assert.ok(compactionSpuId, "compaction spuId should not be empty");

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  let standardCode = `ACPT-PROOF-REPLAY-${uniqueSuffix}`;
  let normdocId = "";
  const projectId = `P-REPLAY-${uniqueSuffix}`;
  const point = "K19+070";
  const operatorId = "did:peg:ins_replay";

  const packagesResponse = await apiRequest("/api/rule-store/packages", { role: "inspector" });
  assert.equal(packagesResponse.status, 200, packagesResponse.text);
  const packageItems = asRecord(asRecord(packagesResponse.json).data).items;
  assert.ok(Array.isArray(packageItems) && packageItems.length > 0, "rule-store packages should not be empty");

  let selectedRule: Record<string, unknown> | null = null;
  let ruleVersion = "";
  for (const pkg of packageItems) {
    if (!pkg || typeof pkg !== "object") {
      continue;
    }
    const packageId = String((pkg as Record<string, unknown>).package_id ?? "").trim();
    if (!packageId) {
      continue;
    }
    const packageRulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`, {
      role: "inspector",
    });
    if (packageRulesResponse.status !== 200) {
      continue;
    }
    const rules = asRecord(asRecord(packageRulesResponse.json).data).items;
    if (!Array.isArray(rules) || rules.length === 0) {
      continue;
    }
    const match = rules.find((item) =>
      Boolean(item) && typeof item === "object" && String((item as Record<string, unknown>).rule_id ?? "").trim() === compactionSpuId,
    ) as Record<string, unknown> | undefined;
    if (match) {
      selectedRule = match;
      normdocId = String(match.normdoc_id ?? "").trim() || String((pkg as Record<string, unknown>).normdoc_id ?? "").trim();
      standardCode = String(match.standard_code ?? "").trim() || standardCode;
      ruleVersion = String(match.version ?? "").trim();
      break;
    }
  }
  assert.ok(selectedRule, "published rule list should include compaction rule");
  const ruleId = String(selectedRule?.rule_id ?? "").trim();
  ruleVersion = ruleVersion || "v1";
  assert.ok(ruleId, "rule_id should not be empty");
  assert.ok(ruleVersion, "rule_version should not be empty");
  const inputFields = Array.isArray(selectedRule.input_fields)
    ? selectedRule.input_fields.map((field) => String(field)).filter(Boolean)
    : [];
  const inputs = buildCompactionInputs(inputFields);

  const executeResponse = await apiRequest("/api/executor/run", {
    method: "POST",
    role: "inspector",
    actorId: "replay.executor",
    body: {
      rule_id: ruleId,
      rule_version: ruleVersion,
      inputs,
      context: {
        project_id: projectId,
        point,
        user_id: operatorId,
      },
    },
  });
  assert.equal(executeResponse.status, 200, executeResponse.text);
  const executePayload = asRecord(executeResponse.json);
  const node = asRecord(executePayload.node);
  const nodeId = String(node.nodeId ?? "").trim();
  assert.ok(nodeId, "nodeId should not be empty");
  const requiredSignatures = Array.isArray(node.requiredSignatures)
    ? node.requiredSignatures.map((item) => String(item)).filter(Boolean)
    : [];

  for (const role of requiredSignatures) {
    const signResponse = await apiRequest(`/api/nodes/${encodeURIComponent(nodeId)}/sign`, {
      method: "POST",
      role: "inspector",
      actorId: "replay.signer",
      body: { role },
    });
    assert.equal(signResponse.status, 200, signResponse.text);
  }

  const finalizeResponse = await apiRequest(`/api/nodes/${encodeURIComponent(nodeId)}/finalize`, {
    method: "POST",
    role: "inspector",
    actorId: "replay.finalizer",
    body: {},
  });
  assert.equal(finalizeResponse.status, 200, finalizeResponse.text);
  const finalizedNode = asRecord(asRecord(finalizeResponse.json).node);
  const finalizedProof = asRecord(finalizedNode.proof);
  const proofId = String(finalizedProof.proofId ?? finalizedProof.proof_id ?? "").trim();
  assert.ok(proofId, "final proof_id should not be empty");

  const replayResponse = await apiRequest("/api/proof/replay", {
    method: "POST",
    role: "inspector",
    actorId: "replay.executor",
    body: { proof_id: proofId },
  });
  assert.equal(replayResponse.status, 200, replayResponse.text);
  const replayPayload = asRecord(replayResponse.json);
  assert.equal(typeof replayPayload.matched, "boolean");
  assert.equal(Boolean(replayPayload.matched), true);
  assert.equal(String(replayPayload.original_result ?? ""), String(replayPayload.replay_result ?? ""));
});

test("proof replay api: returns PROOF_NOT_FOUND for unknown proof_id", { timeout: TEST_TIMEOUT_MS }, async () => {
  const replayResponse = await apiRequest("/api/proof/replay", {
    method: "POST",
    role: "inspector",
    actorId: "replay.executor",
    body: { proof_id: "proof_missing_001" },
  });
  assert.equal(replayResponse.status, 404, replayResponse.text);
  const replayPayload = asRecord(replayResponse.json);
  assert.equal(String(replayPayload.code ?? ""), "PROOF_NOT_FOUND");
});

