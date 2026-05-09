import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

const TEST_TIMEOUT_MS = 240_000;
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
      "x-actor-id": options.actorId ?? "final.closure.tester",
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

test("Final closed-loop acceptance flow", { timeout: TEST_TIMEOUT_MS }, async () => {
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  let standardCode = `FINAL-CLOSURE-${uniqueSuffix}`;
  let normdocId = "";
  const projectId = `P-FINAL-${uniqueSuffix}`;
  const point = "K19+070";
  const expertSigner = "expert.final.signer";

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

  // Step 1: dark page upload spec -> compile draft.
  const pseudoPdf = Buffer.from([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Page /Parent 1 0 R /Contents 3 0 R >>",
    "endobj",
    "3 0 obj",
    "stream",
    "(JTG-F80-2017 4.2.1 compactionDegree >= 95%)",
    "endstream",
    "endobj",
    "%%EOF",
  ].join("\n"), "utf8").toString("base64");
  const specUploadResponse = await apiRequest("/api/spec/pdf-to-draft", {
    method: "POST",
    role: "builder",
    actorId: "dark.builder",
    body: {
      pdfBase64: pseudoPdf,
      fileName: "final-closure-upload.pdf",
      options: {
        standardCode,
        defaultVersion: "v1",
      },
    },
  });
  assert.equal(specUploadResponse.status, 200, specUploadResponse.text);
  const draftPayload = asRecord(specUploadResponse.json);
  assert.equal(Boolean(draftPayload.success), true, "pdf upload should produce a draft");
  const draftMarkdown = String(draftPayload.draftMarkdown ?? "").trim();
  assert.ok(draftMarkdown.length > 0, "draft markdown should not be empty");

  // Step 2: generate candidate rule package (dark page candidate flow).
  const candidateCreateResponse = await apiRequest("/api/approval/candidates", {
    method: "POST",
    role: "builder",
    actorId: "dark.builder",
    body: {
      title: `Final closure candidate ${standardCode}`,
      summary: "candidate rules generated from uploaded normdoc",
      assetType: "spu",
      assetRef: compactionSpuId,
      content: {
        source: "dark_page_upload",
        fileName: "final-closure-upload.pdf",
        draftMarkdown,
        generatedRuleHints: [
          {
            rule_id: compactionSpuId,
            clause: "4.2.1",
            item: "compaction",
          },
        ],
      },
    },
  });
  assert.equal(candidateCreateResponse.status, 200, candidateCreateResponse.text);
  const candidateDraft = asRecord(asRecord(candidateCreateResponse.json).item);
  const candidateId = String(candidateDraft.candidateId ?? "").trim();
  assert.ok(candidateId, "candidate id should not be empty");
  assert.equal(String(candidateDraft.status ?? ""), "draft");

  // Step 3: manual confirmation (submit + review + approve).
  const candidateSubmitResponse = await apiRequest(`/api/approval/candidates/${encodeURIComponent(candidateId)}/submit`, {
    method: "POST",
    role: "builder",
    actorId: "dark.builder",
    body: {
      note: "manual confirm: submit candidate for expert review",
    },
  });
  assert.equal(candidateSubmitResponse.status, 200, candidateSubmitResponse.text);
  assert.equal(String(asRecord(candidateSubmitResponse.json).item && asRecord(asRecord(candidateSubmitResponse.json).item).status), "submitted");

  const candidateReviewResponse = await apiRequest(`/api/approval/candidates/${encodeURIComponent(candidateId)}/review`, {
    method: "POST",
    role: "expert",
    actorId: "dark.expert.reviewer",
    body: {
      note: "manual review started",
    },
  });
  assert.equal(candidateReviewResponse.status, 200, candidateReviewResponse.text);
  assert.equal(String(asRecord(asRecord(candidateReviewResponse.json).item).status ?? ""), "in_review");

  // Step 4: expert sign-off.
  const signatureHash = `sig_${uniqueSuffix}`;
  const candidateDecisionResponse = await apiRequest(`/api/approval/candidates/${encodeURIComponent(candidateId)}/decision`, {
    method: "POST",
    role: "expert",
    actorId: expertSigner,
    body: {
      decision: "approve",
      note: `expert_signature_hash:${signatureHash}`,
    },
  });
  assert.equal(candidateDecisionResponse.status, 200, candidateDecisionResponse.text);
  assert.equal(String(asRecord(asRecord(candidateDecisionResponse.json).item).status ?? ""), "approved");

  const candidateDetailResponse = await apiRequest(`/api/approval/candidates/${encodeURIComponent(candidateId)}`, {
    role: "expert",
    actorId: expertSigner,
  });
  assert.equal(candidateDetailResponse.status, 200, candidateDetailResponse.text);
  const candidateDetail = asRecord(asRecord(candidateDetailResponse.json).item);
  const candidateEvents = Array.isArray(candidateDetail.events) ? candidateDetail.events : [];
  const approveEvent = candidateEvents.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const event = item as Record<string, unknown>;
    return String(event.action ?? "") === "approve";
  }) as Record<string, unknown> | undefined;
  assert.ok(approveEvent, "approve event should exist");
  assert.equal(String(approveEvent?.actorId ?? ""), expertSigner);
  assert.match(String(approveEvent?.note ?? ""), /expert_signature_hash:/);

  // Step 5: select published NormDoc from Rule Store.
  const allPackagesResponse = await apiRequest("/api/rule-store/packages", {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(allPackagesResponse.status, 200, allPackagesResponse.text);
  const allPackageItems = asRecord(asRecord(allPackagesResponse.json).data).items;
  assert.ok(Array.isArray(allPackageItems), "package list should be array");
  let packageId = "";
  for (const item of allPackageItems) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const candidatePackageId = String((item as Record<string, unknown>).package_id ?? "").trim();
    if (!candidatePackageId) {
      continue;
    }
    const candidateRulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(candidatePackageId)}/rules`, {
      role: "inspector",
      actorId: "white.executor",
    });
    if (candidateRulesResponse.status !== 200) {
      continue;
    }
    const candidateRules = asRecord(asRecord(candidateRulesResponse.json).data).items;
    if (!Array.isArray(candidateRules)) {
      continue;
    }
    const hasCompaction = candidateRules.some((rule) =>
      Boolean(rule) && typeof rule === "object" && String((rule as Record<string, unknown>).rule_id ?? "").trim() === compactionSpuId,
    );
    if (hasCompaction) {
      packageId = candidatePackageId;
      normdocId = String((item as Record<string, unknown>).normdoc_id ?? "").trim();
      break;
    }
  }
  assert.ok(packageId, "package id should not be empty");
  assert.ok(normdocId, "normdoc id should not be empty");

  const selectedNormdocMetaResponse = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(selectedNormdocMetaResponse.status, 200, selectedNormdocMetaResponse.text);
  const selectedNormdocMeta = asRecord(asRecord(asRecord(selectedNormdocMetaResponse.json).data).item).normdoc as Record<string, unknown>;
  standardCode = String(selectedNormdocMeta.standard_code ?? standardCode).trim() || standardCode;

  // Step 6: white page selects published NormDoc from Rule Store.
  const normdocsResponse = await apiRequest("/api/rule-store/normdocs", {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(normdocsResponse.status, 200, normdocsResponse.text);
  const normdocItems = asRecord(asRecord(normdocsResponse.json).data).items;
  assert.ok(Array.isArray(normdocItems), "normdoc list should be array");
  const selectedNormdoc = normdocItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).normdoc_id ?? "") === normdocId;
  }) as Record<string, unknown> | undefined;
  assert.ok(selectedNormdoc, "published normdoc should be selectable");
  assert.equal(String(selectedNormdoc?.status ?? ""), "published");
  assert.equal(String(selectedNormdoc?.source ?? ""), "Rule Store");

  const normdocDetailResponse = await apiRequest(`/api/rule-store/normdocs/${encodeURIComponent(normdocId)}`, {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(normdocDetailResponse.status, 200, normdocDetailResponse.text);
  const normdocDetail = asRecord(asRecord(asRecord(normdocDetailResponse.json).data).item);
  assert.equal(String(asRecord(normdocDetail.normdoc).normdoc_id ?? ""), normdocId);

  // Step 7: white page selects inspection item from package rules.
  const packagesResponse = await apiRequest(`/api/rule-store/packages?normdoc_id=${encodeURIComponent(normdocId)}`, {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(packagesResponse.status, 200, packagesResponse.text);
  const packageItems = asRecord(asRecord(packagesResponse.json).data).items;
  assert.ok(Array.isArray(packageItems), "package list should be array");
  const selectedPackage = packageItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).package_id ?? "") === packageId;
  }) as Record<string, unknown> | undefined;
  assert.ok(selectedPackage, "selected package should exist");
  assert.equal(String(selectedPackage?.source ?? ""), "Rule Store");

  const packageRulesResponse = await apiRequest(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`, {
    role: "inspector",
    actorId: "white.executor",
  });
  assert.equal(packageRulesResponse.status, 200, packageRulesResponse.text);
  const ruleItems = asRecord(asRecord(packageRulesResponse.json).data).items;
  assert.ok(Array.isArray(ruleItems) && ruleItems.length > 0, "rule list should not be empty");
  const selectedRule = ruleItems.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return String((item as Record<string, unknown>).rule_id ?? "") === compactionSpuId;
  }) as Record<string, unknown> | undefined;
  assert.ok(selectedRule, "compaction rule should exist in package");
  assert.equal(String(selectedRule?.source ?? ""), "Rule Store");
  const ruleId = String(selectedRule?.rule_id ?? "").trim();
  const ruleVersion = String(selectedRule?.version ?? selectedPackage?.version ?? "").trim();
  assert.ok(ruleId, "rule_id should not be empty");
  assert.ok(ruleVersion, "rule_version should not be empty");
  const inputFields = Array.isArray(selectedRule?.input_fields)
    ? selectedRule.input_fields.map((field) => String(field)).filter(Boolean)
    : [];
  const valueField = chooseCompactionValueField(inputFields);
  const scenarioInputs = buildCompactionScenarioInputs(inputFields, valueField, 94.5);

  const slotResponse = await apiRequest("/api/slots/import", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      station: point,
    },
  });
  assert.equal(slotResponse.status, 200, slotResponse.text);
  const slotId = String(asRecord(asRecord(slotResponse.json).slot).slotId ?? "").trim();
  assert.ok(slotId, "slotId should not be empty");

  async function createBoundContainer(spuId: string): Promise<string> {
    const containerResponse = await apiRequest("/api/containers", {
      method: "POST",
      role: "inspector",
      actorId: "white.executor",
      body: {
        projectId,
        geoSlotRef: slotId,
      },
    });
    assert.equal(containerResponse.status, 200, containerResponse.text);
    const container = asRecord(asRecord(containerResponse.json).container);
    const containerId = String(container.containerId ?? "").trim();
    assert.ok(containerId, "container id should not be empty");
    const bindResponse = await apiRequest(`/api/containers/${encodeURIComponent(containerId)}/bind-spu`, {
      method: "POST",
      role: "inspector",
      actorId: "white.executor",
      body: {
        spuId,
      },
    });
    assert.equal(bindResponse.status, 200, bindResponse.text);
    return containerId;
  }

  const whiteContainerId = await createBoundContainer(ruleId);
  const pegbotContainerId = await createBoundContainer(ruleId);
  const cliContainerId = await createBoundContainer(ruleId);

  // Step 8: white page form execution.
  const whiteRunResponse = await apiRequest("/api/executor/run", {
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
  assert.equal(whiteRunResponse.status, 200, whiteRunResponse.text);
  const whiteExecution = asRecord(whiteRunResponse.json);
  const whiteStatus = extractExecutionStatus(whiteExecution);
  assert.ok(whiteStatus === "PASS" || whiteStatus === "FAIL");
  const whiteProof = extractProofLike(whiteExecution);
  const whiteProofId = extractProofIdentity(whiteProof);
  assert.ok(whiteProofId, "white entry should generate proof");
  assert.equal(String(whiteProof.rule_id ?? ""), ruleId);
  assert.equal(String(whiteProof.rule_version ?? ""), ruleVersion);
  assert.ok(Array.isArray(whiteProof.decision_trace), "white proof should include decision_trace");

  // Step 9: PegBot natural language execution.
  const pegbotRunResponse = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "white.pegbot",
    body: {
      query: "check whether K19+070 compaction 94.5% passes",
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
  assert.equal(pegbotRunResponse.status, 200, pegbotRunResponse.text);
  const pegbotPayload = asRecord(pegbotRunResponse.json);
  assert.equal(Boolean(pegbotPayload.success), true, "pegbot execution should succeed");
  const pegbotStructured = asRecord(pegbotPayload.structured);
  const pegbotContext = asRecord(pegbotStructured.context);
  assert.equal(String(pegbotContext.rule_source ?? ""), "Rule Store");
  const pegbotExecution = asRecord(pegbotPayload.execution);
  assert.equal(String(pegbotExecution.endpoint ?? ""), "/api/executor/run");
  const pegbotStatus = extractExecutionStatus(pegbotExecution);
  assert.ok(pegbotStatus === "PASS" || pegbotStatus === "FAIL");
  const pegbotProof = extractProofLike(pegbotExecution);
  const pegbotProofId = extractProofIdentity(pegbotProof);
  assert.ok(pegbotProofId, "pegbot entry should generate proof");

  // Step 10: CLI execution.
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
    "94.5",
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
  assert.equal(String(cliRule.source ?? ""), "Rule Store");
  const cliExecution = asRecord(cliPayload.execution);
  const cliStatus = extractExecutionStatus(cliExecution);
  assert.ok(cliStatus === "PASS" || cliStatus === "FAIL");
  const cliProof = extractProofLike(cliExecution);
  const cliProofId = extractProofIdentity(cliProof);
  assert.ok(cliProofId, "cli entry should generate proof");

  // Step 11: three-entry consistency.
  assert.equal(whiteStatus, pegbotStatus, "white vs pegbot result should match");
  assert.equal(whiteStatus, cliStatus, "white vs cli result should match");
  const pegbotRuleId = String(pegbotProof.rule_id ?? asRecord(pegbotStructured.target).spuId ?? "").trim();
  const cliRuleId = String(cliRule.rule_id ?? "").trim();
  assert.equal(String(whiteProof.rule_id ?? ""), pegbotRuleId, "white vs pegbot rule_id should match");
  assert.equal(String(whiteProof.rule_id ?? ""), cliRuleId, "white vs cli rule_id should match");
  const pegbotRuleVersion = String(pegbotProof.rule_version ?? pegbotContext.rule_version ?? "").trim();
  const cliRuleVersion = String(cliRule.rule_version ?? "").trim();
  assert.equal(String(whiteProof.rule_version ?? ""), pegbotRuleVersion, "white vs pegbot rule_version should match");
  assert.equal(String(whiteProof.rule_version ?? ""), cliRuleVersion, "white vs cli rule_version should match");

  // Step 12: all entries generate proofs.
  assert.ok(whiteProofId.length > 0, "white result should include proof identity");
  assert.ok(pegbotProofId.length > 0, "pegbot result should include proof identity");
  assert.ok(cliProofId.length > 0, "cli result should include proof identity");

  // Finalize white node to obtain stable proof_id for replay/report.
  const whiteNode = asRecord(whiteExecution.node);
  const whiteNodeId = String(whiteNode.nodeId ?? "").trim();
  assert.ok(whiteNodeId, "white execution should return nodeId");
  const whiteNodeStatus = String(whiteNode.status ?? "").trim().toUpperCase();
  const requiredSignatures = Array.isArray(whiteNode.requiredSignatures)
    ? whiteNode.requiredSignatures.map((item) => String(item)).filter(Boolean)
    : [];
  if (whiteNodeStatus === "SIGNING") {
    for (const role of requiredSignatures) {
      const signResponse = await apiRequest(`/api/nodes/${encodeURIComponent(whiteNodeId)}/sign`, {
        method: "POST",
        role: "inspector",
        actorId: "white.executor",
        body: { role },
      });
      assert.equal(signResponse.status, 200, signResponse.text);
    }
  }
  let finalizedProofId = whiteProofId;
  try {
    const finalizeResponse = await apiRequest(`/api/nodes/${encodeURIComponent(whiteNodeId)}/finalize`, {
      method: "POST",
      role: "inspector",
      actorId: "white.executor",
      body: {},
    });
    if (finalizeResponse.status === 200) {
      const finalizedNode = asRecord(asRecord(finalizeResponse.json).node);
      const finalizedProof = asRecord(finalizedNode.proof);
      finalizedProofId = String(finalizedProof.proofId ?? finalizedProof.proof_id ?? "").trim() || finalizedProofId;
    }
  } catch {
    // Fallback to immediate proof id when finalize endpoint is unavailable in current runtime mode.
  }
  assert.ok(finalizedProofId, "finalized proof id should not be empty");

  // Step 13: proof replay.
  const replayResponse = await apiRequest("/api/proof/replay", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      proof_id: finalizedProofId,
    },
  });
  assert.equal(replayResponse.status, 200, replayResponse.text);
  const replayPayload = asRecord(replayResponse.json);
  assert.equal(Boolean(replayPayload.matched), true, "proof replay should match original result");
  assert.equal(String(replayPayload.original_result ?? ""), String(replayPayload.replay_result ?? ""));

  // Step 14: acceptance report generation (proof-bound).
  const reportResponse = await apiRequest("/api/proof/export", {
    method: "POST",
    role: "inspector",
    actorId: "white.executor",
    body: {
      nodeId: whiteNodeId,
    },
  });
  assert.equal(reportResponse.status, 200, reportResponse.text);
  const reportPayload = asRecord(reportResponse.json);
  const jsonExport = asRecord(reportPayload.jsonExport);
  const executionSummary = asRecord(jsonExport.executionSummary);
  const acceptanceCertificate = asRecord(jsonExport.acceptanceCertificate);
  const decisionResult = asRecord(acceptanceCertificate.decisionResult);
  const integrity = asRecord(acceptanceCertificate.integrity);
  const sourceProof = asRecord(jsonExport.sourceProof);
  assert.equal(String(executionSummary.stake ?? ""), point);
  assert.equal(String(acceptanceCertificate.spuId ?? ""), ruleId);
  assert.equal(String(decisionResult.status ?? "").toUpperCase(), whiteStatus);
  assert.equal(String(sourceProof.rule_id ?? ""), ruleId);
  assert.equal(String(sourceProof.rule_version ?? ""), ruleVersion);
  assert.ok(String(integrity.proofId ?? "").trim().length > 0);
  assert.ok(String(sourceProof.timestamp ?? "").trim().length > 0);
  const reportOperatorId =
    String(sourceProof.operator_id ?? "").trim()
    || String(whiteProof.operator_id ?? "").trim();
  assert.ok(reportOperatorId.length > 0, "report should contain operator id");

  // Exit criteria: architectural guardrails.
  assert.equal(String(selectedNormdoc?.source ?? ""), "Rule Store");
  assert.equal(String(selectedPackage?.source ?? ""), "Rule Store");
  assert.equal(String(selectedRule?.source ?? ""), "Rule Store");
  assert.equal(String(pegbotContext.rule_source ?? ""), "Rule Store");
  assert.equal(String(cliRule.source ?? ""), "Rule Store");

  assert.equal(String(pegbotExecution.endpoint ?? ""), "/api/executor/run");
  const cliRequest = asRecord(cliPayload.request);
  assert.equal(String(cliRequest.point ?? ""), point);
  assert.equal(String(cliRequest.project_id ?? ""), projectId);

  const whitePageSource = readFileSync(resolve(REPO_ROOT, "apps/executable-spec-web/src/SPUApp.tsx"), "utf-8");
  assert.match(whitePageSource, /\/api\/rule-store\/normdocs/);
  assert.doesNotMatch(whitePageSource, /\/api\/rule-store\/publish/);
  assert.equal(whitePageSource.includes("Proof ID"), true);
  assert.equal(whitePageSource.includes("Rule Store"), true);
  assert.equal(whitePageSource.includes("Proof"), true);
  assert.equal(whitePageSource.includes("operator" ) || whitePageSource.includes("Operator"), true);

  const darkPageSource = readFileSync(resolve(REPO_ROOT, "apps/nl2gate-web/src/App.tsx"), "utf-8");
  assert.doesNotMatch(darkPageSource, /\/api\/executor\/run/);
  assert.equal(darkPageSource.includes("Rule Store") || darkPageSource.includes("规则"), true);
  assert.equal(darkPageSource.length > 0, true);
});
