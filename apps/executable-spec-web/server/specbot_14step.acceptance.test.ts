import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import JSZip from "jszip";

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

type StepResult = {
  step: number;
  name: string;
  passed: boolean;
  detail: string;
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
      "x-actor-id": options.actorId ?? "specbot.14step.tester",
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
  return { status: response.status, json, text };
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
  platformServer.stdout.on("data", (chunk) => platformLogs.push(String(chunk)));
  platformServer.stderr.on("data", (chunk) => platformLogs.push(String(chunk)));
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

test("SpecBot 14-step acceptance chain", { timeout: TEST_TIMEOUT_MS }, async () => {
  const results: StepResult[] = [];
  const push = (step: number, name: string, passed: boolean, detail: string) => {
    results.push({ step, name, passed, detail });
  };

  const standardCode = "JTG-F80-1-2017";
  const version = "v1";
  let normdocId = `${standardCode}@@${version}`;
  const point = "K19+070";
  const projectId = `P-SPECBOT-${Date.now()}`;

  const pseudoPdfBase64 = Buffer.from([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Page /Parent 1 0 R /Contents 3 0 R >>",
    "endobj",
    "3 0 obj",
    "stream",
    "(JTG F80/1-2017 4.2.1 压实度，代表值>=95%)",
    "endstream",
    "endobj",
    "%%EOF",
  ].join("\n"), "utf8").toString("base64");

  let draftMarkdown = "";
  let specbundleBase64 = "";
  let spuId = "";
  let packageId = "";
  let ruleId = "";
  let ruleVersion = "";
  let proof: Record<string, unknown> = {};
  let bundleFileName = "";

  // 1. 上传 PDF
  const step1 = await apiRequest("/api/spec/pdf-to-draft", {
    method: "POST",
    role: "builder",
    actorId: "specbot.builder",
    body: {
      pdfBase64: pseudoPdfBase64,
      fileName: "JTG-F80-1-2017.pdf",
      options: { standardCode, defaultVersion: version },
    },
  });
  if (step1.status === 200 && step1.json) {
    const payload = asRecord(step1.json);
    draftMarkdown = String(payload.draftMarkdown ?? "").trim();
    push(1, "上传 JTG F80/1-2017 PDF", draftMarkdown.length > 0, `status=${step1.status}`);
  } else {
    push(1, "上传 JTG F80/1-2017 PDF", false, `status=${step1.status}`);
  }

  const registryResp = await apiRequest("/api/registry/spus");
  if (registryResp.status === 200 && registryResp.json) {
    const items = asRecord(registryResp.json).items;
    if (Array.isArray(items)) {
      const compaction = items.find((item) => String(asRecord(item).spuId ?? "").toLowerCase().includes("compaction"));
      if (compaction) {
        spuId = String(asRecord(compaction).spuId ?? "").trim();
      }
    }
  }

  // 2-7 通过 register-markdown 产出 specbundle 并校验文件
  const stepBundle = await apiRequest("/api/spec/register-markdown", {
    method: "POST",
    role: "admin",
    actorId: "specbot.register",
    body: {
      markdown: draftMarkdown,
      source: "pdf",
      originalDraftMarkdown: draftMarkdown,
      editedMarkdown: draftMarkdown,
      clauseReviewItems: [],
      riskWarnings: [],
    },
  });
  if (stepBundle.status === 200 && stepBundle.json) {
    const payload = asRecord(stepBundle.json);
    const compileArtifact = asRecord(payload.compileArtifact ?? {});
    const specbundle = asRecord(payload.specbundle ?? compileArtifact.specbundle ?? {});
    specbundleBase64 = String(specbundle.base64 ?? "").trim();
    spuId = String(payload.spuId ?? "").trim();
  }

  if (specbundleBase64) {
    const zip = await JSZip.loadAsync(Buffer.from(specbundleBase64, "base64"));
    const names = Object.keys(zip.files);
    bundleFileName = String(asRecord(asRecord(stepBundle.json ?? {}).specbundle ?? {}).fileName ?? "").trim();
    const hasSpecIr = names.includes("specir.yaml");
    const hasSpecMd = names.includes("spec.md");
    const hasSpecJson = names.includes("spec.json");
    const hasReadme = names.includes("README.txt");
    const hasHashManifest = names.includes("hash_manifest.json");

    push(2, "生成 SpecIR YAML", hasSpecIr, `files=${names.join(", ")}`);
    push(3, "生成 spec.md", hasSpecMd, `files=${names.join(", ")}`);
    push(4, "生成 spec.json", hasSpecJson, `files=${names.join(", ")}`);
    push(5, "生成 README.txt", hasReadme, `files=${names.join(", ")}`);
    push(6, "生成 hash_manifest.json", hasHashManifest, `files=${names.join(", ")}`);
    const step7Passed = Buffer.from(specbundleBase64, "base64").length > 0
      && (!bundleFileName || bundleFileName.endsWith(".specbundle"));
    push(7, "打包 JTG-F80-1-2017@v1.specbundle", step7Passed, `fileName=${bundleFileName || "-"}`);
  } else {
    push(2, "生成 SpecIR YAML", false, "specbundle missing");
    push(3, "生成 spec.md", false, "specbundle missing");
    push(4, "生成 spec.json", false, "specbundle missing");
    push(5, "生成 README.txt", false, "specbundle missing");
    push(6, "生成 hash_manifest.json", false, "specbundle missing");
    push(7, "打包 JTG-F80-1-2017@v1.specbundle", false, "specbundle missing");
  }

  // 8. 发布为 NormDoc
  const draftNormdocsResp = await apiRequest("/api/rule-store/normdocs", {
    role: "inspector",
    actorId: "white.executor",
  });
  if (draftNormdocsResp.status === 200 && draftNormdocsResp.json) {
    const items = asRecord(asRecord(draftNormdocsResp.json).data).items;
    if (Array.isArray(items)) {
      let matched = items.find((item) => {
        const row = asRecord(item);
        const rowSpuIds = Array.isArray(row.spuIds) ? row.spuIds.map((entry) => String(entry ?? "").trim()) : [];
        return spuId ? rowSpuIds.includes(spuId) : false;
      });
      if (!matched) {
        matched = items.find((item) => {
          const row = asRecord(item);
          const rowCode = String(row.standard_code ?? row.standardCode ?? "").trim();
          const rowVersion = String(row.version ?? "").trim();
          return rowCode === "JTG F80/1-2017" && rowVersion === version;
        });
      }
      if (!matched && items.length > 0) {
        matched = items[0];
      }
      if (matched) {
        normdocId = String(asRecord(matched).normdoc_id ?? normdocId).trim() || normdocId;
      }
    }
  }

  const publishResp = await apiRequest("/api/rule-store/publish", {
    method: "POST",
    role: "admin",
    actorId: "specbot.publisher",
    body: {
      normdoc_id: normdocId,
      standard_code: standardCode,
      name: "公路工程质量检验评定标准（土建工程）",
      version,
      signed_by: "specbot.expert",
      created_by: "specbot.builder",
    },
  });
  push(8, "发布为 NormDoc", publishResp.status === 200, `status=${publishResp.status}`);
  if (publishResp.status === 200 && publishResp.json) {
    const item = asRecord(asRecord(asRecord(publishResp.json).data).item);
    packageId = String(asRecord(item.rule_package).package_id ?? "").trim();
  }

  // 9. Rule Store 中显示 NormDoc
  const normdocsResp = await apiRequest("/api/rule-store/normdocs", { role: "inspector", actorId: "white.executor" });
  let foundNormdoc = false;
  if (normdocsResp.status === 200 && normdocsResp.json) {
    const items = asRecord(asRecord(normdocsResp.json).data).items;
    if (Array.isArray(items)) {
      foundNormdoc = items.some((item) => String(asRecord(item).normdoc_id ?? "").trim() === normdocId);
    }
  }
  push(9, "Rule Store 中显示 NormDoc", foundNormdoc, `status=${normdocsResp.status}`);

  // 10. Executor 选择该 NormDoc（读取规则包）
  const pkgResp = await apiRequest(`/api/rule-store/packages?normdoc_id=${encodeURIComponent(normdocId)}`, { role: "inspector", actorId: "white.executor" });
  let selectedNormdoc = false;
  if (pkgResp.status === 200 && pkgResp.json) {
    const items = asRecord(asRecord(pkgResp.json).data).items;
    if (Array.isArray(items) && items.length > 0) {
      selectedNormdoc = true;
      packageId = String(asRecord(items[0]).package_id ?? packageId).trim();
    }
  }
  push(10, "Executor 选择该 NormDoc", selectedNormdoc, `package_id=${packageId || "-"}`);

  // 11. 执行压实度 Component（取规则并执行）
  let executed = false;
  const rulesResp = packageId
    ? await apiRequest(`/api/rule-store/packages/${encodeURIComponent(packageId)}/rules`, { role: "inspector", actorId: "white.executor" })
    : null;
  if (rulesResp && rulesResp.status === 200 && rulesResp.json) {
    const items = asRecord(asRecord(rulesResp.json).data).items;
    if (Array.isArray(items) && items.length > 0) {
      const firstRule = asRecord(items[0]);
      ruleId = String(firstRule.rule_id ?? "").trim();
      ruleVersion = String(firstRule.rule_version ?? firstRule.version ?? version).trim() || version;
      const inputFields = Array.isArray(firstRule.input_fields)
        ? firstRule.input_fields.map((entry) => String(entry ?? "").trim()).filter(Boolean)
        : ["compactionDegree"];
      const inputs: Record<string, unknown> = {};
      for (const field of inputFields) {
        inputs[field] = field.toLowerCase().includes("compaction") ? 95 : 1;
      }
      if (Object.keys(inputs).length === 0) {
        inputs.compactionDegree = 95;
      }
      const runResp = await apiRequest("/api/executor/run", {
        method: "POST",
        role: "inspector",
        actorId: "white.executor",
        body: {
          rule_id: ruleId,
          rule_version: ruleVersion,
          inputs,
          context: {
            project_id: projectId,
            point,
            user_id: "inspector-1",
          },
        },
      });
      executed = runResp.status === 200 && Boolean(runResp.json);
      if (executed) {
        const runPayload = asRecord(runResp.json);
        proof = asRecord(runPayload.proofFragment ?? runPayload.proof ?? {});
        const status = String(runPayload.status ?? asRecord(runPayload.result ?? {}).gateStatus ?? "").trim().toUpperCase();
        push(11, "执行压实度 Component", true, `rule=${ruleId}@${ruleVersion}`);
        push(12, "输出 PASS / FAIL", status === "PASS" || status === "FAIL", `status=${status || "-"}`);
        push(13, "生成 Proof", Object.keys(proof).length > 0, `proof_id=${String(proof.proof_id ?? proof.proofId ?? "-")}`);
      } else {
        push(11, "执行压实度 Component", false, `status=${runResp.status}`);
        push(12, "输出 PASS / FAIL", false, `status=${runResp.status}`);
        push(13, "生成 Proof", false, `status=${runResp.status}`);
      }
    }
  }
  if (!executed) {
    if (!results.some((item) => item.step === 11)) {
      push(11, "执行压实度 Component", false, "no runnable rule");
    }
    if (!results.some((item) => item.step === 12)) {
      push(12, "输出 PASS / FAIL", false, "execution not completed");
    }
    if (!results.some((item) => item.step === 13)) {
      push(13, "生成 Proof", false, "execution not completed");
    }
  }

  // 14. Proof 可追溯字段检查
  const hasNormdocId = String(proof.normdoc_id ?? "").trim().length > 0;
  const hasBundleHash = String(proof.bundle_hash ?? "").trim().length > 0;
  const hasRuleId = String(proof.rule_id ?? "").trim().length > 0;
  const hasClauseId = String(proof.clause_id ?? "").trim().length > 0;
  const hasClauseText = String(proof.clause_content ?? "").trim().length > 0
    || String(asRecord(proof.evidence_chain ?? {}).clause_content ?? "").trim().length > 0;
  push(
    14,
    "Proof 追溯链（NormDoc ID / bundle_hash / rule_id / clause_id / 原文条款）",
    hasNormdocId && hasBundleHash && hasRuleId && hasClauseId && hasClauseText,
    JSON.stringify({
      normdoc_id: proof.normdoc_id ?? null,
      bundle_hash: proof.bundle_hash ?? null,
      rule_id: proof.rule_id ?? null,
      clause_id: proof.clause_id ?? null,
      clause_content: proof.clause_content ?? asRecord(proof.evidence_chain ?? {}).clause_content ?? null,
    }),
  );

  const failed = results.filter((item) => !item.passed);
  if (failed.length > 0) {
    const report = results
      .sort((a, b) => a.step - b.step)
      .map((item) => `${item.step}. ${item.name}: ${item.passed ? "PASS" : "FAIL"} (${item.detail})`)
      .join("\n");
    assert.fail(`SpecBot 14-step acceptance failed:\n${report}`);
  }

  assert.equal(results.length, 14, "should record exactly 14 acceptance steps");
});
