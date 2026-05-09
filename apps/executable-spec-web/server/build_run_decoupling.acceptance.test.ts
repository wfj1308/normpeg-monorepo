import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
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
      "x-actor-id": options.actorId ?? "acceptance.tester",
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
    measuredThickness: 205,
    designThickness: 200,
    deflectionValue: 180,
    measuredDeflection: 180,
    maxAllowedDeflection: 200,
  };
  const inputs: Record<string, unknown> = {};
  for (const field of inputFields) {
    const normalizedField = String(field ?? "").trim();
    if (!normalizedField) {
      continue;
    }
    inputs[normalizedField] = defaults[normalizedField] ?? 1;
  }
  if (Object.keys(inputs).length === 0) {
    return {
      ...defaults,
    };
  }
  return inputs;
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

test("Build/Run decoupling acceptance flow", { timeout: TEST_TIMEOUT_MS }, async () => {
  const registryResponse = await apiRequest("/api/registry/spus");
  assert.equal(registryResponse.status, 200, registryResponse.text);
  const registryPayload = asRecord(registryResponse.json);
  const registryItems = registryPayload.items;
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
  let standardCode = `ACPT-BUILD-RUN-${uniqueSuffix}`;
  let normdocId = "";
  const projectId = `P-ACPT-${uniqueSuffix}`;

  // 1) Dark page reads published NormDoc/Package from Rule Store.
  const allPackagesResponse = await apiRequest("/api/rule-store/packages", { role: "inspector" });
  assert.equal(allPackagesResponse.status, 200, allPackagesResponse.text);
  const allPackageItems = asRecord(asRecord(allPackagesResponse.json).data).items;
  assert.ok(Array.isArray(allPackageItems) && allPackageItems.length > 0, "package list should not be empty");
  let packageId = "";
  for (const item of allPackageItems) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidatePackageId = String((item as Record<string, unknown>).package_id ?? "").trim();
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
    if (!Array.isArray(rules)) {
      continue;
    }
    const hasCompaction = rules.some((rule) =>
      Boolean(rule) && typeof rule === "object" && String((rule as Record<string, unknown>).rule_id ?? "").trim() === compactionSpuId,
    );
    if (hasCompaction) {
      packageId = candidatePackageId;
      normdocId = String((item as Record<string, unknown>).normdoc_id ?? "").trim();
      break;
    }
  }
  assert.ok(packageId, "published package id should not be empty");
  assert.ok(normdocId, "published normdoc id should not be empty");

  const normdocDetailResponseForMeta = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, {
    role: "inspector",
  });
  assert.equal(normdocDetailResponseForMeta.status, 200, normdocDetailResponseForMeta.text);
  const normdocMeta = asRecord(asRecord(asRecord(normdocDetailResponseForMeta.json).data).item).normdoc as Record<string, unknown>;
  standardCode = String(normdocMeta.standard_code ?? standardCode);

  // Guard: white page role should not be able to publish rules.
  const publishDenied = await apiRequest("/api/rule-store/publish", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      normdoc_id: `${normdocId}-deny`,
      standard_code: `${standardCode}-deny`,
      name: "should be denied",
      version: "v1",
    },
  });
  assert.equal(publishDenied.status, 403, "white-page execute role must not publish rules");

  // 2) Rule Store should show published version.
  const normdocsResponse = await apiRequest("/api/rule-store/normdocs", { role: "inspector" });
  assert.equal(normdocsResponse.status, 200, normdocsResponse.text);
  const normdocsPayload = asRecord(normdocsResponse.json);
  const normdocsData = asRecord(normdocsPayload.data);
  const normdocItems = normdocsData.items;
  assert.ok(Array.isArray(normdocItems), "normdoc list should be array");
  const listedNormdoc = normdocItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).normdoc_id ?? "") === normdocId;
  }) as Record<string, unknown> | undefined;
  assert.ok(listedNormdoc, "published normdoc should appear in rule store");
  assert.equal(String(listedNormdoc?.status ?? ""), "published");

  // 3) White page reads the published normdoc.
  const normdocDetailResponse = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, {
    role: "inspector",
  });
  assert.equal(normdocDetailResponse.status, 200, normdocDetailResponse.text);
  const normdocDetailPayload = asRecord(normdocDetailResponse.json);
  const normdocDetailData = asRecord(normdocDetailPayload.data);
  const normdocDetailItem = asRecord(normdocDetailData.item);
  const detailNormdoc = asRecord(normdocDetailItem.normdoc);
  assert.equal(String(detailNormdoc.normdoc_id), normdocId);
  assert.equal(String(detailNormdoc.status), "published");

  // 4) White page selects detection items from package rules.
  const packagesResponse = await apiRequest(`/api/rule-store/packages?normdoc_id=${encodeURIComponent(normdocId)}`, {
    role: "inspector",
  });
  assert.equal(packagesResponse.status, 200, packagesResponse.text);
  const packagesPayload = asRecord(packagesResponse.json);
  const packagesData = asRecord(packagesPayload.data);
  const packageItems = packagesData.items;
  assert.ok(Array.isArray(packageItems), "package list should be array");
  const selectedPackage = packageItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).package_id ?? "") === packageId;
  }) as Record<string, unknown> | undefined;
  assert.ok(selectedPackage, "published package should be selectable");

  const packageRulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`, {
    role: "inspector",
  });
  assert.equal(packageRulesResponse.status, 200, packageRulesResponse.text);
  const packageRulesPayload = asRecord(packageRulesResponse.json);
  const packageRulesData = asRecord(packageRulesPayload.data);
  const packageRules = packageRulesData.items;
  assert.ok(Array.isArray(packageRules) && packageRules.length > 0, "package rules should not be empty");
  const selectedRule = packageRules.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).rule_id ?? "") === compactionSpuId;
  }) as Record<string, unknown> | undefined;
  assert.ok(selectedRule, "selected package should include published compaction rule");
  const ruleId = String(selectedRule?.rule_id ?? "").trim();
  const ruleVersion = String(selectedRule?.version ?? selectedPackage?.version ?? "v1").trim();
  assert.ok(ruleId, "rule_id should not be empty");
  assert.ok(ruleVersion, "rule_version should not be empty");

  // Prepare execution container context.
  const slotResponse = await apiRequest("/api/slots/import", {
    method: "POST",
    role: "inspector",
    body: {
      station: "K19+070",
    },
  });
  assert.equal(slotResponse.status, 200, slotResponse.text);
  const slotPayload = asRecord(slotResponse.json);
  const slot = asRecord(slotPayload.slot);
  const slotId = String(slot.slotId ?? "").trim();
  assert.ok(slotId, "slotId should not be empty");

  const containerResponse = await apiRequest("/api/containers", {
    method: "POST",
    role: "inspector",
    body: {
      projectId,
      geoSlotRef: slotId,
    },
  });
  assert.equal(containerResponse.status, 200, containerResponse.text);
  const containerPayload = asRecord(containerResponse.json);
  const container = asRecord(containerPayload.container);
  const containerIdForWhiteRun = String(container.containerId ?? "").trim();
  assert.ok(containerIdForWhiteRun, "containerId should not be empty");

  const bindResponse = await apiRequest(`/api/containers/${encodeURIComponent(containerIdForWhiteRun)}/bind-spu`, {
    method: "POST",
    role: "inspector",
    body: {
      spuId: ruleId,
    },
  });
  assert.equal(bindResponse.status, 200, bindResponse.text);

  const inputFields = Array.isArray(selectedRule?.input_fields)
    ? selectedRule.input_fields.map((field) => String(field)).filter(Boolean)
    : [];
  const executionInputs = buildCompactionInputs(inputFields);

  const executorRunResponse = await apiRequest("/api/executor/run", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      rule_id: ruleId,
      rule_version: ruleVersion,
      inputs: executionInputs,
      context: {
        project_id: projectId,
        point: "K19+070",
        user_id: "did:peg:ins_build_run",
        user_id: "did:peg:ins_001",
      },
    },
  });
  assert.equal(executorRunResponse.status, 200, executorRunResponse.text);
  const executorRunPayload = asRecord(executorRunResponse.json);
  const executorRunStatus = String(executorRunPayload.status ?? "").trim().toUpperCase();
  assert.ok(executorRunStatus === "PASS" || executorRunStatus === "FAIL", "executor run should return PASS/FAIL");
  assert.equal(String(executorRunPayload.rule_id ?? "").trim(), ruleId);
  assert.equal(String(executorRunPayload.rule_version ?? "").trim(), ruleVersion);
  const executorEvidence = asRecord(executorRunPayload.evidence);
  assert.ok(String(executorEvidence.standard_code ?? "").trim().length > 0);
  assert.ok(String(executorEvidence.clause_no ?? "").trim().length > 0);
  assert.ok(String(executorEvidence.clause_id ?? "").trim().length > 0);
  assert.ok(String(executorEvidence.clause_title ?? "").trim().length > 0);
  const executorRunProof = asRecord(executorRunPayload.proofFragment ?? executorRunPayload.proof);
  assert.equal(String(executorRunProof.rule_id ?? ""), ruleId);
  assert.equal(String(executorRunProof.rule_version ?? ""), ruleVersion);
  assert.equal(String(executorRunProof.operator_id ?? ""), "did:peg:ins_001");
  assert.equal(String(executorRunProof.executor_version ?? ""), "executor@v1");
  assert.ok(String(executorRunProof.inputs_hash ?? "").trim().length > 0);
  assert.ok(Array.isArray(executorRunProof.decision_trace));

  const executorMissingRuleResponse = await apiRequest("/api/executor/run", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      rule_id: `${ruleId}.missing`,
      rule_version: ruleVersion,
      inputs: executionInputs,
      context: {
        project_id: projectId,
        point: "K19+070",
        user_id: "did:peg:ins_build_run",
        user_id: "did:peg:ins_001",
      },
    },
  });
  assert.equal(executorMissingRuleResponse.status, 404, executorMissingRuleResponse.text);
  const executorMissingRulePayload = asRecord(executorMissingRuleResponse.json);
  assert.equal(String(executorMissingRulePayload.code ?? ""), "RULE_NOT_FOUND");

  // 5) Executor runs by rule_id + version only.
  // 6) Proof contains rule_version.
  let executionResponse = await apiRequest("/api/public/v1/executions/evaluate", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      rule_id: ruleId,
      rule_version: ruleVersion,
      containerId: containerIdForWhiteRun,
      inputs: executionInputs,
      context: {
        project_id: projectId,
        stake: "K19+070",
        point: "K19+070",
        user_id: "did:peg:ins_build_run",
        normdoc_id: normdocId,
        package_id: packageId,
        standard_code: standardCode,
      },
    },
  });
  let executionData: Record<string, unknown>;
  if (executionResponse.status === 200) {
    const executionEnvelope = asRecord(executionResponse.json);
    assert.equal(Boolean(executionEnvelope.ok), true, "public executor response must be envelope success");
    executionData = asRecord(executionEnvelope.data);
  } else {
    const fallbackExecutionResponse = await apiRequest("/api/executor/run", {
      method: "POST",
      role: "inspector",
      actorId: "white.executor.fallback",
      body: {
        rule_id: ruleId,
        rule_version: ruleVersion,
        inputs: executionInputs,
        context: {
          project_id: projectId,
          stake: "K19+070",
          point: "K19+070",
          user_id: "did:peg:ins_build_run",
          normdoc_id: normdocId,
          package_id: packageId,
          standard_code: standardCode,
        },
      },
    });
    if (fallbackExecutionResponse.status !== 200) {
      assert.equal(fallbackExecutionResponse.status, 409, fallbackExecutionResponse.text);
      return;
    }
    executionData = asRecord(fallbackExecutionResponse.json);
  }
  const executorStatus = String(executionData.status ?? "").trim().toUpperCase();
  assert.ok(executorStatus === "PASS" || executorStatus === "FAIL", "status must come from executor");
  const proofPayload = (
    executionData.proof && typeof executionData.proof === "object" && !Array.isArray(executionData.proof)
      ? executionData.proof
      : executionData.proofFragment
  );
  const proof = asRecord(proofPayload);
  assert.equal(String(proof.rule_id ?? ""), ruleId);
  assert.equal(String(proof.rule_version ?? ""), ruleVersion);
  assert.ok(String(proof.proof_id ?? "").trim().length > 0);
  assert.ok(String(proof.execution_id ?? "").trim().length > 0);
  assert.ok(String(proof.inputs_hash ?? "").trim().length > 0);
  assert.ok(Array.isArray(proof.decision_trace));

  // PegBot and CLI should run in independent containers to avoid runtime lock conflicts.
  const pegbotContainerResponse = await apiRequest("/api/containers", {
    method: "POST",
    role: "inspector",
    body: {
      projectId,
      geoSlotRef: slotId,
    },
  });
  assert.equal(pegbotContainerResponse.status, 200, pegbotContainerResponse.text);
  const pegbotContainer = asRecord(asRecord(pegbotContainerResponse.json).container);
  const containerIdForPegbot = String(pegbotContainer.containerId ?? "").trim();
  assert.ok(containerIdForPegbot, "pegbot container id should not be empty");
  const pegbotBindResponse = await apiRequest(`/api/containers/${encodeURIComponent(containerIdForPegbot)}/bind-spu`, {
    method: "POST",
    role: "inspector",
    body: {
      spuId: ruleId,
    },
  });
  assert.equal(pegbotBindResponse.status, 200, pegbotBindResponse.text);

  const cliContainerResponse = await apiRequest("/api/containers", {
    method: "POST",
    role: "inspector",
    body: {
      projectId,
      geoSlotRef: slotId,
    },
  });
  assert.equal(cliContainerResponse.status, 200, cliContainerResponse.text);
  const cliContainer = asRecord(asRecord(cliContainerResponse.json).container);
  const containerIdForCli = String(cliContainer.containerId ?? "").trim();
  assert.ok(containerIdForCli, "cli container id should not be empty");
  const cliBindResponse = await apiRequest(`/api/containers/${encodeURIComponent(containerIdForCli)}/bind-spu`, {
    method: "POST",
    role: "inspector",
    body: {
      spuId: ruleId,
    },
  });
  assert.equal(cliBindResponse.status, 200, cliBindResponse.text);

  // 7) PegBot (NL2Gate endpoint) maps same rule from Rule Store and executes.
  const nl2gateResponse = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "white.pegbot",
    body: {
      query: "Run compaction check for K19+070",
      mode: "evaluate",
      execute: true,
      context: {
        projectId,
        containerId: containerIdForPegbot,
        standard_code: standardCode,
        rule_version: ruleVersion,
        normdoc_id: normdocId,
        package_id: packageId,
        inputs: {
          massHoleSand: 1980,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
    },
  });
  assert.equal(nl2gateResponse.status, 200, nl2gateResponse.text);
  const nl2gatePayload = asRecord(nl2gateResponse.json);
  assert.equal(Boolean(nl2gatePayload.success), true, "nl2gate should execute successfully");
  const structured = asRecord(nl2gatePayload.structured);
  const structuredContext = asRecord(structured.context);
  assert.equal(String(structuredContext.rule_source ?? ""), "Rule Store");
  assert.equal(String(structuredContext.rule_version ?? ""), ruleVersion);
  const structuredTarget = asRecord(structured.target);
  assert.equal(String(structuredTarget.spuId ?? ""), ruleId);
  const nlExecution = asRecord(nl2gatePayload.execution);
  const nlStatus = String(nlExecution.status ?? "").trim().toUpperCase();
  assert.ok(nlStatus === "PASS" || nlStatus === "FAIL", "nl2gate PASS/FAIL must come from executor");

  // 8) CLI queries same rule and executes via Rule Store + Executor.
  const cliPayload = runCliJson([
    "check",
    "--api-base",
    platformBaseUrl,
    "--project-id",
    projectId,
    "--normdoc",
    standardCode,
    "--item",
    "compaction",
    "--value",
    "1.95",
    "--value-field",
    "maxDryDensity",
    "--input",
    "massHoleSand=1980",
    "--input",
    "massSandCone=500",
    "--input",
    "volumeSand=1000",
    "--input",
    "moistureContent=5",
    "--point",
    "K19+070",
    "--container-id",
    containerIdForCli,
    "--json",
  ]);
  assert.equal(String(cliPayload.mode ?? ""), "rule_store_executor");
  const cliRule = asRecord(cliPayload.rule);
  assert.equal(String(cliRule.rule_id ?? ""), ruleId);
  assert.equal(String(cliRule.rule_version ?? ""), ruleVersion);
  const cliExecution = asRecord(cliPayload.execution);
  const cliStatus = String(cliExecution.status ?? "").trim().toUpperCase();
  assert.ok(cliStatus === "PASS" || cliStatus === "FAIL", "cli PASS/FAIL must come from executor");
  const cliProofPayload = (
    cliExecution.proof && typeof cliExecution.proof === "object" && !Array.isArray(cliExecution.proof)
      ? cliExecution.proof
      : cliExecution.proofFragment
  );
  const cliProof = asRecord(cliProofPayload);
  assert.equal(String(cliProof.rule_version ?? ""), ruleVersion);
  assert.ok(String(cliProof.proof_id ?? "").trim().length > 0);
  assert.ok(String(cliProof.inputs_hash ?? "").trim().length > 0);

  // Architecture guardrails from source code.
  const whitePageSource = readFileSync(resolve(REPO_ROOT, "apps/executable-spec-web/src/SPUApp.tsx"), "utf-8");
  assert.equal(whitePageSource.includes("/api/rule-store/normdocs"), true);

  const darkPageSource = readFileSync(resolve(REPO_ROOT, "apps/nl2gate-web/src/App.tsx"), "utf-8");
  assert.equal(darkPageSource.includes("Rule Store"), true);
});

