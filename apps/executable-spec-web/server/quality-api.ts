import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { executeCompactionPath, evaluateCompactionGate } from "../src/quality-system/engine.ts";
import type { AuditRecord, CompactionInputs, Container, OverallStatus, Proof, SPUExecution, SPUExecutionStatus } from "../src/quality-system/models.ts";
import { loadAppConfig, redactAppConfig } from "./config/app-config.ts";

type CreateContainerRequest = {
  id?: string;
  slotRef: string;
  station?: string;
  coordinateX?: number;
  coordinateY?: number;
  spuIds?: string[];
};

type ExecuteSpuRequest = {
  containerId: string;
  spuId: string;
  inputs: CompactionInputs;
};

type SignSpuRequest = {
  containerId: string;
  spuId: string;
  attemptIndex?: number;
  role: string;
};

type ArchiveContainerRequest = {
  containerId: string;
};

const DEFAULT_SPU_IDS = [
  "highway.subgrade.compaction.soil@v1",
  "highway.subgrade.compaction.base@v1",
];
const REQUIRED_SIGNATURES = ["lab", "supervision"];
const { config: appConfig, warnings: appConfigWarnings } = loadAppConfig(process.env, {
  serviceName: "quality-api",
  defaultPort: 8787,
  portEnvKeys: ["QUALITY_API_PORT", "PORT"],
});
const PORT = appConfig.network.port;

const containerStore = new Map<string, Container>();

function nowIso(): string {
  return new Date().toISOString();
}

function withCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-tenant-id");
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  withCors(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch (error) {
        reject(new Error("请求体必须是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeContainerId(input?: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return `v://space/container/${randomUUID()}`;
  }
  if (raw.startsWith("v://space/container/")) {
    return raw;
  }
  return `v://space/container/${raw}`;
}

function isFinalStatus(status: SPUExecutionStatus): boolean {
  return status === "FINAL_PASS" || status === "FINAL_FAIL";
}

function getLatestAttempt(container: Container, spuId: string): SPUExecution | null {
  const attempts = container.spus.filter((item) => item.spuId === spuId);
  if (attempts.length === 0) {
    return null;
  }
  return attempts.reduce((latest, current) => (current.attemptIndex > latest.attemptIndex ? current : latest));
}

function getAttempt(container: Container, spuId: string, attemptIndex?: number): SPUExecution | null {
  if (typeof attemptIndex === "number" && Number.isInteger(attemptIndex) && attemptIndex > 0) {
    return container.spus.find((item) => item.spuId === spuId && item.attemptIndex === attemptIndex) ?? null;
  }
  return getLatestAttempt(container, spuId);
}

function pushAudit(
  container: Container,
  event: AuditRecord["event"],
  payload: Omit<AuditRecord, "event" | "containerId" | "timestamp">,
): void {
  container.auditTrail.push({
    event,
    containerId: container.id,
    timestamp: nowIso(),
    ...payload,
  });
  container.updatedAt = nowIso();
}

function transitionExecution(
  container: Container,
  execution: SPUExecution,
  event: AuditRecord["event"],
  toStatus: SPUExecutionStatus,
  payload: Omit<AuditRecord, "event" | "containerId" | "timestamp" | "spuId" | "attemptIndex" | "fromStatus" | "toStatus"> = {},
): void {
  const fromStatus = execution.status;
  execution.status = toStatus;
  execution.updatedAt = nowIso();
  pushAudit(container, event, {
    spuId: execution.spuId,
    attemptIndex: execution.attemptIndex,
    fromStatus,
    toStatus,
    ...payload,
  });
}

function recalcContainer(container: Container): void {
  if (container.status === "ARCHIVED") {
    return;
  }
  if (container.spus.length === 0) {
    container.status = "DRAFT";
    container.overallStatus = "PENDING";
    return;
  }

  const latestBySpu = container.spuCatalog.map((spuId) => getLatestAttempt(container, spuId));
  const hasAllStarted = latestBySpu.every(Boolean);
  const hasAnyFinalFail = latestBySpu.some((attempt) => attempt?.status === "FINAL_FAIL");
  const allFinalPass = hasAllStarted && latestBySpu.every((attempt) => attempt?.status === "FINAL_PASS");
  const allFinalized = hasAllStarted && latestBySpu.every((attempt) => attempt && isFinalStatus(attempt.status));

  let nextOverall: OverallStatus = "PENDING";
  if (hasAnyFinalFail) {
    nextOverall = "FAIL";
  } else if (allFinalPass) {
    nextOverall = "PASS";
  }

  container.overallStatus = nextOverall;
  container.status = allFinalized ? "VERIFIED" : "RUNNING";
  container.updatedAt = nowIso();
}

function createAttempt(container: Container, spuId: string): SPUExecution {
  const attempts = container.spus.filter((item) => item.spuId === spuId);
  const maxAttemptIndex = attempts.reduce((max, item) => Math.max(max, item.attemptIndex), 0);
  const attemptIndex = maxAttemptIndex + 1;
  const timestamp = nowIso();
  const execution: SPUExecution = {
    spuId,
    status: "DRAFT",
    attemptIndex,
    inputs: {},
    outputs: {},
    trace: [],
    gate: {
      passed: false,
      results: [],
    },
    requiredSignatures: [...REQUIRED_SIGNATURES],
    signedBy: [],
    pendingSignatures: [...REQUIRED_SIGNATURES],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  container.spus.push(execution);
  pushAudit(container, "createNode", {
    spuId,
    attemptIndex,
    fromStatus: undefined,
    toStatus: "DRAFT",
  });
  return execution;
}

function assertInputs(inputs: CompactionInputs): void {
  const fields: Array<keyof CompactionInputs> = [
    "massHoleSand",
    "massSandCone",
    "volumeSand",
    "moistureContent",
    "maxDryDensity",
  ];
  for (const field of fields) {
    const value = Number(inputs[field]);
    if (!Number.isFinite(value)) {
      throw new Error(`输入项 ${field} 必须是数字`);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    const child = (value as Record<string, unknown>)[key];
    if (child && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}

function buildProof(container: Container): Proof {
  const specResults = container.spuCatalog.map((spuId) => {
    const attempts = container.spus.filter((item) => item.spuId === spuId);
    const latest = getLatestAttempt(container, spuId);
    if (!latest || !isFinalStatus(latest.status)) {
      throw new Error(`SPU ${spuId} 尚未完成最终签名，不能归档`);
    }
    return {
      spuId,
      finalStatus: latest.status === "FINAL_PASS" ? "PASS" : "FAIL",
      attempts: attempts.length,
      latestAttemptIndex: latest.attemptIndex,
      latestOutputs: { ...latest.outputs },
      gate: latest.gate,
    };
  });

  const signatures = Array.from(
    new Set(
      container.spuCatalog
        .map((spuId) => getLatestAttempt(container, spuId))
        .flatMap((attempt) => attempt?.signedBy ?? []),
    ),
  );

  return {
    containerId: container.id,
    specResults,
    signatures,
    auditTrail: structuredClone(container.auditTrail),
    timestamp: nowIso(),
  };
}

function sanitizeContainer(container: Container): Container {
  return structuredClone(container);
}

function ensureContainer(containerId: string): Container {
  const container = containerStore.get(containerId);
  if (!container) {
    throw new Error(`容器不存在: ${containerId}`);
  }
  return container;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      withCors(res);
      res.statusCode = 204;
      res.end();
      return;
    }

    const reqUrl = new URL(req.url ?? "/", "http://localhost");
    const path = reqUrl.pathname;

    if (req.method === "POST" && path === "/container/create") {
      const body = await readJson<CreateContainerRequest>(req);
      if (!body.slotRef || !String(body.slotRef).trim()) {
        throw new Error("slotRef 必填");
      }

      const containerId = normalizeContainerId(body.id);
      if (containerStore.has(containerId)) {
        throw new Error(`容器已存在: ${containerId}`);
      }

      const timestamp = nowIso();
      const container: Container = {
        id: containerId,
        slotRef: String(body.slotRef).trim(),
        status: "DRAFT",
        spus: [],
        overallStatus: "PENDING",
        spuCatalog:
          Array.isArray(body.spuIds) && body.spuIds.length > 0
            ? Array.from(new Set(body.spuIds.map((item) => String(item).trim()).filter(Boolean)))
            : [...DEFAULT_SPU_IDS],
        proof: null,
        auditTrail: [],
        context: {
          station: String(body.station ?? "K19+070"),
          coordinateX: Number(body.coordinateX ?? 128.25),
          coordinateY: Number(body.coordinateY ?? 62.5),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      pushAudit(container, "createNode", {
        detail: "container created",
      });
      containerStore.set(containerId, container);
      writeJson(res, 200, {
        container: sanitizeContainer(container),
      });
      return;
    }

    if (req.method === "POST" && path === "/spu/execute") {
      const body = await readJson<ExecuteSpuRequest>(req);
      const container = ensureContainer(String(body.containerId ?? "").trim());
      if (container.status === "ARCHIVED") {
        throw new Error("容器已归档，禁止继续执行");
      }
      const spuId = String(body.spuId ?? "").trim();
      if (!spuId) {
        throw new Error("spuId 必填");
      }
      if (!container.spuCatalog.includes(spuId)) {
        container.spuCatalog.push(spuId);
      }
      assertInputs(body.inputs);

      const execution = createAttempt(container, spuId);
      execution.inputs = { ...body.inputs };
      transitionExecution(container, execution, "submitForm", "RUNNING", {
        detail: "表单已提交",
      });

      const pathResult = executeCompactionPath(body.inputs);
      execution.outputs = { ...pathResult.outputs };
      execution.trace = [...pathResult.trace];
      pushAudit(container, "executePath", {
        spuId,
        attemptIndex: execution.attemptIndex,
        fromStatus: execution.status,
        toStatus: execution.status,
        detail: "完成计算链",
      });

      execution.gate = evaluateCompactionGate(pathResult.outputs);
      transitionExecution(container, execution, "executeRules", execution.gate.passed ? "PASS" : "FAIL", {
        detail: execution.gate.results[0]?.message,
      });
      transitionExecution(container, execution, "executeRules", "SIGNING", {
        detail: "进入签名阶段",
      });

      recalcContainer(container);
      writeJson(res, 200, {
        execution,
        container: sanitizeContainer(container),
      });
      return;
    }

    if (req.method === "POST" && path === "/spu/sign") {
      const body = await readJson<SignSpuRequest>(req);
      const container = ensureContainer(String(body.containerId ?? "").trim());
      if (container.status === "ARCHIVED") {
        throw new Error("容器已归档，禁止签名");
      }
      const spuId = String(body.spuId ?? "").trim();
      const role = String(body.role ?? "").trim();
      if (!spuId || !role) {
        throw new Error("spuId 和 role 必填");
      }

      const execution = getAttempt(container, spuId, body.attemptIndex);
      if (!execution) {
        throw new Error("未找到对应 attempt");
      }
      if (execution.status !== "SIGNING" && !isFinalStatus(execution.status)) {
        throw new Error(`当前状态不可签名: ${execution.status}`);
      }
      if (!execution.requiredSignatures.includes(role)) {
        throw new Error(`签名角色不合法: ${role}`);
      }
      if (isFinalStatus(execution.status)) {
        writeJson(res, 200, {
          execution,
          container: sanitizeContainer(container),
        });
        return;
      }

      if (!execution.signedBy.includes(role)) {
        execution.signedBy = [...execution.signedBy, role];
      }
      execution.pendingSignatures = execution.requiredSignatures.filter((item) => !execution.signedBy.includes(item));
      execution.updatedAt = nowIso();
      pushAudit(container, "sign", {
        spuId,
        attemptIndex: execution.attemptIndex,
        actor: role,
        fromStatus: execution.status,
        toStatus: execution.status,
        detail: `${role} 已签名`,
      });

      if (execution.pendingSignatures.length === 0) {
        transitionExecution(container, execution, "finalize", execution.gate.passed ? "FINAL_PASS" : "FINAL_FAIL", {
          actor: role,
          detail: "签名完成并结束 attempt",
        });
      }
      recalcContainer(container);
      writeJson(res, 200, {
        execution,
        container: sanitizeContainer(container),
      });
      return;
    }

    if (req.method === "POST" && path === "/container/archive") {
      const body = await readJson<ArchiveContainerRequest>(req);
      const container = ensureContainer(String(body.containerId ?? "").trim());
      if (container.proof) {
        throw new Error("Proof 已生成，不可重复归档");
      }
      recalcContainer(container);
      if (container.status !== "VERIFIED") {
        throw new Error("容器未完成签名验证，暂不可归档");
      }
      pushAudit(container, "archive", {
        fromStatus: container.status,
        toStatus: "ARCHIVED",
      });
      container.status = "ARCHIVED";
      container.proof = deepFreeze(buildProof(container));
      container.updatedAt = nowIso();
      writeJson(res, 200, {
        proof: container.proof,
        container: sanitizeContainer(container),
      });
      return;
    }

    if (req.method === "GET" && path.startsWith("/container/")) {
      const containerId = decodeURIComponent(path.replace("/container/", ""));
      const container = ensureContainer(containerId);
      recalcContainer(container);
      writeJson(res, 200, {
        container: sanitizeContainer(container),
      });
      return;
    }

    writeJson(res, 404, { error: "Not Found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, 400, { error: message });
  }
});

server.listen(PORT, appConfig.network.host, () => {
  // eslint-disable-next-line no-console
  console.log(`quality-api listening on ${appConfig.network.host}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[config] ${JSON.stringify(redactAppConfig(appConfig))}`);
  for (const warning of appConfigWarnings) {
    // eslint-disable-next-line no-console
    console.warn(`[config warning] ${warning.code}: ${warning.message}`);
  }
});
