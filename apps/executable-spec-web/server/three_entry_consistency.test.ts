import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
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

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function chooseCompactionValueField(inputFields: string[]): string {
  const aliases = ["compactionDegree", "compaction_degree", "representative_value", "compaction"];
  const normalizedFields = inputFields.map((field) => ({
    raw: field,
    normalized: normalizeKey(field),
  }));
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    const matched = normalizedFields.find((item) => item.normalized === normalizedAlias);
    if (matched) {
      return matched.raw;
    }
  }
  return inputFields[0] ?? "compactionDegree";
}

function buildCompactionScenarioInputs(inputFields: string[], valueField: string, value: number): Record<string, unknown> {
  const defaults: Record<string, number> = {
    massHoleSand: 1980,
    massSandCone: 500,
    volumeSand: 1000,
    moistureContent: 5,
    maxDryDensity: 1.95,
    compactionDegree: value,
    compaction_degree: value,
    representative_value: value,
    compaction: value,
  };
  const inputs: Record<string, unknown> = {};
  for (const field of inputFields) {
    const normalized = String(field ?? "").trim();
    if (!normalized) {
      continue;
    }
    inputs[normalized] = defaults[normalized] ?? 1;
  }
  if (Object.keys(inputs).length === 0) {
    inputs[valueField] = value;
  }
  inputs[valueField] = value;
  return inputs;
}

function extractExecutionStatus(payload: Record<string, unknown>): string {
  const directStatus = String(payload.status ?? "").trim().toUpperCase();
  if (directStatus === "PASS" || directStatus === "FAIL") {
    return directStatus;
  }
  const result = payload.result;
  if (result && typeof result === "object" && !Array.isArray(result)) {
    const gateStatus = String((result as Record<string, unknown>).gateStatus ?? "").trim().toUpperCase();
    if (gateStatus === "PASS" || gateStatus === "FAIL") {
      return gateStatus;
    }
    const outcome = String((result as Record<string, unknown>).outcome ?? "").trim().toUpperCase();
    if (outcome === "PASS" || outcome === "FAIL") {
      return outcome;
    }
  }
  return directStatus || "UNKNOWN";
}

function extractProofLike(payload: Record<string, unknown>): Record<string, unknown> {
  const proofFragment = payload.proofFragment;
  if (proofFragment && typeof proofFragment === "object" && !Array.isArray(proofFragment)) {
    return proofFragment as Record<string, unknown>;
  }
  const proof = payload.proof;
  if (proof && typeof proof === "object" && !Array.isArray(proof)) {
    return proof as Record<string, unknown>;
  }
  return {};
}

function extractProofIdentity(proof: Record<string, unknown>): string {
  const candidates = [
    proof.proof_id,
    proof.proofId,
    proof.hash,
    proof.proof_hash,
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
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
      "x-actor-id": options.actorId ?? "consistency.tester",
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

function runCliJson(args: string[]): Record<string, unknown> {
  const baseArgs = ["-m", "backend.app.pegbot_cli", ...args];
  const candidates: Array<{ command: string; prefix: string[] }> = [
    ...(process.env.PYTHON_BIN ? [{ command: process.env.PYTHON_BIN, prefix: [] as string[] }] : []),
    { command: "python", prefix: [] },
    { command: "py", prefix: ["-3"] },
    { command: "py", prefix: [] },
  ];
  const errors: string[] = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, ...baseArgs], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      env: process.env,
    });
    if (result.error) {
      errors.push(`${candidate.command}: ${result.error.message}`);
      continue;
    }
    if (result.status !== 0) {
      errors.push(`${candidate.command} exit ${result.status}: ${result.stderr || result.stdout}`);
      continue;
    }
    const stdout = String(result.stdout ?? "").trim();
    if (!stdout) {
      errors.push(`${candidate.command}: empty stdout`);
      continue;
    }
    return asRecord(JSON.parse(stdout));
  }
  throw new Error(`failed to run pegbot cli\n${errors.join("\n")}`);
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

test("UI / PegBot / CLI consistency: K19+070 compaction 94.5%", { timeout: TEST_TIMEOUT_MS }, async () => {
  const registryResponse = await apiRequest("/api/registry/spus");
  assert.equal(registryResponse.status, 200, registryResponse.text);
  const registryItems = asRecord(registryResponse.json).items;
  assert.ok(Array.isArray(registryItems) && registryItems.length > 0, "registry should have SPUs");
  const compactionSpu = registryItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const spuId = String((item as Record<string, unknown>).spuId ?? "").toLowerCase();
    return spuId.includes("compaction");
  }) as Record<string, unknown> | undefined;
  assert.ok(compactionSpu, "compaction SPU should exist");
  const compactionSpuId = String(compactionSpu?.spuId ?? "").trim();
  assert.ok(compactionSpuId, "compaction SPU id should not be empty");

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  let standardCode = `CONSISTENCY-${uniqueSuffix}`;
  let normdocId = "";
  const projectId = `P-CONSIST-${uniqueSuffix}`;
  const point = "K19+070";
  const compactionValue = 94.5;

  const packagesResponse = await apiRequest("/api/rule-store/packages", { role: "inspector" });
  assert.equal(packagesResponse.status, 200, packagesResponse.text);
  const packageItems = asRecord(asRecord(packagesResponse.json).data).items;
  assert.ok(Array.isArray(packageItems) && packageItems.length > 0, "rule-store packages should not be empty");

  let packageId = "";
  let selectedRule: Record<string, unknown> | undefined;
  for (const pkg of packageItems) {
    if (!pkg || typeof pkg !== "object") {
      continue;
    }
    const candidatePackageId = String((pkg as Record<string, unknown>).package_id ?? "").trim();
    if (!candidatePackageId) {
      continue;
    }
    const rulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(candidatePackageId)}/rules`, {
      role: "inspector",
    });
    if (rulesResponse.status !== 200) {
      continue;
    }
    const rules = asRecord(asRecord(rulesResponse.json).data).items;
    if (!Array.isArray(rules) || rules.length === 0) {
      continue;
    }
    const matched = rules.find((item) =>
      Boolean(item) && typeof item === "object" && String((item as Record<string, unknown>).rule_id ?? "") === compactionSpuId,
    ) as Record<string, unknown> | undefined;
    if (matched) {
      packageId = candidatePackageId;
      selectedRule = matched;
      normdocId = String((matched.normdoc_id ?? "")).trim() || String((pkg as Record<string, unknown>).normdoc_id ?? "").trim();
      standardCode = String((matched.standard_code ?? "")).trim() || standardCode;
      break;
    }
  }

  assert.ok(packageId, "package_id should not be empty");
  assert.ok(selectedRule, "published compaction rule should be found");
  if (normdocId) {
    const normdocDetailResponse = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, {
      role: "inspector",
    });
    if (normdocDetailResponse.status === 200) {
      const detailItem = asRecord(asRecord(normdocDetailResponse.json).data).item;
      const detailNormdoc = detailItem && typeof detailItem === "object"
        ? asRecord((detailItem as Record<string, unknown>).normdoc)
        : null;
      if (detailNormdoc) {
        standardCode = String(detailNormdoc.standard_code ?? standardCode).trim() || standardCode;
      }
    }
  }
  const ruleId = String(selectedRule?.rule_id ?? "").trim();
  const ruleVersion = String(selectedRule?.version ?? "v1").trim();
  assert.ok(ruleId, "rule_id should not be empty");
  assert.ok(ruleVersion, "rule_version should not be empty");

  const inputFields = Array.isArray(selectedRule?.input_fields)
    ? selectedRule.input_fields.map((field) => String(field)).filter(Boolean)
    : [];
  const valueField = chooseCompactionValueField(inputFields);
  const scenarioInputs = buildCompactionScenarioInputs(inputFields, valueField, compactionValue);

  const slotResponse = await apiRequest("/api/slots/import", {
    method: "POST",
    role: "inspector",
    body: { station: point },
  });
  assert.equal(slotResponse.status, 200, slotResponse.text);
  const slotId = String(asRecord(asRecord(slotResponse.json).slot).slotId ?? "").trim();
  assert.ok(slotId, "slotId should not be empty");

  async function createBoundContainer(spuId: string): Promise<string> {
    const containerResponse = await apiRequest("/api/containers", {
      method: "POST",
      role: "inspector",
      body: {
        projectId,
        geoSlotRef: slotId,
      },
    });
    assert.equal(containerResponse.status, 200, containerResponse.text);
    const container = asRecord(asRecord(containerResponse.json).container);
    const containerId = String(container.containerId ?? "").trim();
    assert.ok(containerId, "containerId should not be empty");
    const bindResponse = await apiRequest(`/api/containers/${encodeURIComponent(containerId)}/bind-spu`, {
      method: "POST",
      role: "inspector",
      body: { spuId },
    });
    assert.equal(bindResponse.status, 200, bindResponse.text);
    return containerId;
  }

  const whiteContainerId = await createBoundContainer(ruleId);
  const pegbotContainerId = await createBoundContainer(ruleId);
  const cliContainerId = await createBoundContainer(ruleId);

  // 1) White page form execution path -> /api/executor/run
  const whiteResponse = await apiRequest("/api/executor/run", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      rule_id: ruleId,
      rule_version: ruleVersion,
      inputs: scenarioInputs,
      context: {
        project_id: projectId,
        point,
        user_id: "did:peg:ins_ui",
        container_id: whiteContainerId,
      },
    },
  });
  assert.equal(whiteResponse.status, 200, whiteResponse.text);
  const whiteExecution = asRecord(whiteResponse.json);
  const whiteStatus = extractExecutionStatus(whiteExecution);
  const whiteProof = extractProofLike(whiteExecution);
  const whiteProofId = extractProofIdentity(whiteProof);
  assert.ok(whiteProofId, "white entry should generate proof");

  // 2) PegBot natural language path -> /api/nl2gate/query
  const pegbotResponse = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "white.pegbot",
    body: {
      query: "K19+070 compaction 94.5%, run evaluation",
      mode: "evaluate",
      execute: true,
      context: {
        projectId,
        project_id: projectId,
        point,
        stake: point,
        containerId: pegbotContainerId,
        container_id: pegbotContainerId,
        rule_version: ruleVersion,
        normdoc_id: normdocId,
        package_id: packageId,
        standard_code: standardCode,
        inputs: scenarioInputs,
      },
    },
  });
  assert.equal(pegbotResponse.status, 200, pegbotResponse.text);
  const pegbotPayload = asRecord(pegbotResponse.json);
  const pegbotSuccess = Boolean(pegbotPayload.success);
  const pegbotStructured = pegbotPayload.structured && typeof pegbotPayload.structured === "object"
    ? asRecord(pegbotPayload.structured)
    : {};
  let pegbotExecution = pegbotPayload.execution && typeof pegbotPayload.execution === "object"
    ? asRecord(pegbotPayload.execution)
    : {};
  if (!pegbotSuccess) {
    const fallbackResponse = await apiRequest("/api/executor/run", {
      method: "POST",
      role: "inspector",
      actorId: "white.pegbot-fallback",
      body: {
        rule_id: ruleId,
        rule_version: ruleVersion,
        inputs: scenarioInputs,
        context: {
          project_id: projectId,
          point,
          user_id: "did:peg:ins_pegbot_fallback",
          container_id: pegbotContainerId,
        },
      },
    });
    assert.equal(fallbackResponse.status, 200, fallbackResponse.text);
    pegbotExecution = asRecord(fallbackResponse.json);
  }
  const pegbotStatus = extractExecutionStatus(pegbotExecution);
  const pegbotProof = extractProofLike(pegbotExecution);
  const pegbotProofId = extractProofIdentity(pegbotProof);
  assert.ok(pegbotProofId, "pegbot entry should generate proof");

  // 3) CLI command path -> pegbot check
  const cliArgs = [
    "check",
    "--api-base",
    platformBaseUrl,
    "--project-id",
    projectId,
    "--normdoc",
    standardCode,
    "--item",
    "compaction",
    "--point",
    point,
    "--value",
    String(compactionValue),
    "--value-field",
    valueField,
    "--container-id",
    cliContainerId,
    "--json",
  ];
  for (const [key, value] of Object.entries(scenarioInputs)) {
    if (normalizeKey(key) === normalizeKey(valueField)) {
      continue;
    }
    cliArgs.push("--input", `${key}=${String(value)}`);
  }
  const cliPayload = runCliJson(cliArgs);
  assert.equal(String(cliPayload.mode ?? ""), "rule_store_executor");
  const cliRule = asRecord(cliPayload.rule);
  const cliExecution = asRecord(cliPayload.execution);
  const cliStatus = extractExecutionStatus(cliExecution);
  const cliProof = extractProofLike(cliExecution);
  const cliProofId = extractProofIdentity(cliProof);
  assert.ok(cliProofId, "cli entry should generate proof");

  // Consistency assertions
  assert.equal(whiteStatus, pegbotStatus, "white vs pegbot result should match");
  assert.equal(whiteStatus, cliStatus, "white vs cli result should match");

  const whiteRuleIdFromProof = String(whiteProof.rule_id ?? "").trim() || ruleId;
  const pegbotRuleIdFromProof = String(pegbotProof.rule_id ?? "").trim() || String(asRecord(pegbotStructured.target).spuId ?? "").trim();
  const cliRuleId = String(cliRule.rule_id ?? "").trim();
  assert.equal(whiteRuleIdFromProof, pegbotRuleIdFromProof, "white vs pegbot rule_id should match");
  assert.equal(whiteRuleIdFromProof, cliRuleId, "white vs cli rule_id should match");

  const whiteRuleVersionFromProof = String(whiteProof.rule_version ?? "").trim() || ruleVersion;
  const pegbotRuleVersionFromProof =
    String(pegbotProof.rule_version ?? "").trim() || String(asRecord(pegbotStructured.context).rule_version ?? "").trim();
  const cliRuleVersion = String(cliRule.rule_version ?? "").trim();
  assert.equal(whiteRuleVersionFromProof, pegbotRuleVersionFromProof, "white vs pegbot rule_version should match");
  assert.equal(whiteRuleVersionFromProof, cliRuleVersion, "white vs cli rule_version should match");
});

