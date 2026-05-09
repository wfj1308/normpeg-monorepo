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
      "x-actor-id": options.actorId ?? "pegbot.multiturn.tester",
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

test("PegBot multi-turn: keep session, detect missing, auto execute after completion", { timeout: TEST_TIMEOUT_MS }, async () => {
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const standardCode = `PEG-MT-${unique}`;
  const version = "v1";
  const normdocId = `${standardCode}@@${version}`;
  const spuId = `demo.pegbot.compaction.multiturn.${unique}@${version}`;

  const publishSpuResponse = await apiRequest("/api/registry/spu-versions/publish", {
    method: "POST",
    role: "admin",
    actorId: "pegbot.publisher",
    body: {
      definition: {
        spuId,
        meta: {
          name: `PegBot MultiTurn ${unique}`,
          norm: standardCode,
          clause: "4.2.1",
          version,
          category: "路基",
          workItem: "土方",
          measuredItem: "压实度",
        },
        forms: [
          {
            formCode: `PEGBOT_MULTITURN_${unique}`,
            role: "lab",
            required: true,
            title: "PegBot MultiTurn",
          },
        ],
        data: {
          inputs: [
            { name: "compaction_degree", type: "number", label: "压实度", unit: "%" },
            { name: "maxDryDensity", type: "number", label: "阈值", unit: "%" },
          ],
          outputs: [{ name: "compactionScore", label: "压实度结果", unit: "%" }],
        },
        path: [{ step: "resolve_compaction", formula: "compactionScore = compaction_degree" }],
        rules: [
          {
            ruleId: `RULE-PEGBOT-MT-${unique}`,
            field: "compactionScore",
            operator: ">=",
            threshold: { inputRef: "maxDryDensity" },
            message: "压实度不达标",
          },
        ],
        proof: {
          resultField: "compactionScore",
          requiredSignatures: ["lab", "supervision"],
          schemaVersion: "node-proof@v1",
        },
        sourceType: "compiled",
      },
    },
  });
  assert.equal(publishSpuResponse.status, 200, publishSpuResponse.text);

  const publishRuleStoreResponse = await apiRequest("/api/rule-store/publish", {
    method: "POST",
    role: "admin",
    actorId: "pegbot.publisher",
    body: {
      normdoc_id: normdocId,
      standard_code: standardCode,
      name: `PegBot MultiTurn ${standardCode}`,
      version,
      signed_by: "expert.pegbot",
      created_by: "expert.pegbot",
    },
  });
  assert.equal(publishRuleStoreResponse.status, 200, publishRuleStoreResponse.text);
  const packageId = String(
    asRecord(asRecord(asRecord(publishRuleStoreResponse.json).data).item).rule_package
      ? asRecord(asRecord(asRecord(publishRuleStoreResponse.json).data).item.rule_package).package_id
      : "",
  ).trim();
  assert.ok(packageId, "package_id should not be empty");

  const contextBase = {
    project_id: `P-MT-${unique}`,
    user_id: "did:peg:ins_001",
    standard_code: standardCode,
    rule_version: version,
    normdoc_id: normdocId,
    package_id: packageId,
  };

  const firstTurn = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "pegbot.user",
    body: {
      query: "这个点能验收吗？",
      mode: "evaluate",
      execute: true,
      context: contextBase,
    },
  });
  assert.equal(firstTurn.status, 200, firstTurn.text);
  const firstPayload = asRecord(firstTurn.json);
  assert.equal(firstPayload.success, false);
  const firstStructured = asRecord(firstPayload.structured);
  const firstMissing = firstStructured.missing;
  assert.ok(Array.isArray(firstMissing), "first missing should be array");
  assert.equal(firstMissing.some((item) => asRecord(item).field === "target.metric"), true);
  assert.equal(firstMissing.some((item) => asRecord(item).field === "target.stake"), true);
  const conversationId = String(asRecord(firstStructured.conversation).conversationId ?? "").trim();
  assert.ok(conversationId, "conversationId should exist after first turn");

  const secondTurn = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "pegbot.user",
    body: {
      query: "K19+070，压实度94.5",
      mode: "evaluate",
      execute: true,
      conversationId,
      context: contextBase,
    },
  });
  assert.equal(secondTurn.status, 200, secondTurn.text);
  const secondPayload = asRecord(secondTurn.json);
  assert.equal(secondPayload.success, false);
  const secondStructured = asRecord(secondPayload.structured);
  const secondMissing = secondStructured.missing;
  assert.ok(Array.isArray(secondMissing), "second missing should be array");
  assert.equal(secondMissing.some((item) => String(asRecord(item).field ?? "") === "inputs.maxDryDensity"), true);
  const secondConversation = asRecord(secondStructured.conversation);
  assert.equal(String(secondConversation.conversationId ?? ""), conversationId);

  const thirdTurn = await apiRequest("/api/nl2gate/query", {
    method: "POST",
    role: "inspector",
    actorId: "pegbot.user",
    body: {
      query: "maxDryDensity=95",
      mode: "evaluate",
      execute: true,
      conversationId,
      context: contextBase,
    },
  });
  assert.equal(thirdTurn.status, 200, thirdTurn.text);
  const thirdPayload = asRecord(thirdTurn.json);
  assert.equal(thirdPayload.success, true, thirdTurn.text);
  const thirdExecution = asRecord(thirdPayload.execution);
  assert.ok(String(thirdExecution.executionId ?? "").trim(), "third turn should execute");
  assert.equal(String(thirdExecution.endpoint ?? ""), "/api/executor/run");
  const thirdStructured = asRecord(thirdPayload.structured);
  const thirdMissing = thirdStructured.missing;
  assert.ok(Array.isArray(thirdMissing), "third missing should be array");
  assert.equal(thirdMissing.length, 0);
  const thirdConversation = asRecord(thirdStructured.conversation);
  assert.equal(String(thirdConversation.conversationId ?? ""), conversationId);
  assert.equal(thirdConversation.pendingIntent, null);
  const command = asRecord(thirdPayload.command);
  const commandContext = asRecord(command.context);
  assert.equal(String(commandContext.rule_source ?? ""), "Rule Store");
});
