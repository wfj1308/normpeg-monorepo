import assert from "node:assert/strict";
import test from "node:test";

import type { SPUDefinition } from "../../src/platform/types.ts";
import { PlatformService } from "../../src/platform/workflow/platform-service.ts";
import {
  evaluateGateBatchRequest,
  evaluateGateBatchRequestConcurrent,
  evaluateGateRequest,
  GateEvaluateError,
  type GateEvaluateResponse,
} from "./gate_evaluate_service.ts";

const SPU_IDS = {
  compaction: "highway.subgrade.compaction.4.2.1@v1",
  thickness: "highway.subgrade.thickness.4.2.3@v1",
} as const;
const PROJECT_SPU_KEY = "demo.project.context.compaction";
const PROJECT_SPU_V1 = `${PROJECT_SPU_KEY}@v1`;
const PROJECT_SPU_V2 = `${PROJECT_SPU_KEY}@v2`;

function buildProjectSpu(spuId: string, version: string, threshold: number): SPUDefinition {
  return {
    spuId,
    meta: {
      name: "Project Context Demo",
      norm: "DEMO-NORM",
      clause: "9.1.1",
      version,
      measuredItem: "density",
    },
    data: {
      inputs: [{ name: "value", type: "number", label: "Value" }],
      outputs: [{ name: "result", label: "Result" }],
    },
    path: [{ step: "s1", formula: "result = value" }],
    rules: [{
      ruleId: "RULE-1",
      field: "result",
      operator: ">=",
      threshold,
      message: "result should pass",
    }],
    proof: {
      resultField: "result",
      requiredSignatures: [],
    },
    sourceType: "compiled",
  };
}

function createDemoContainer(service: PlatformService): string {
  const slot = service.importSlot({
    station: "K19+070",
    chainage: 19070,
    x: 128.25,
    y: 62.5,
    elevation: 135.4,
    alignment: "A1",
    sourceFile: "gate-evaluate-test.csv",
  });
  const container = service.createContainer({
    geoSlotRef: slot.slotId,
    inspector: "lab-a",
    supervisor: "sup-a",
    autoBindSpuIds: [SPU_IDS.compaction, SPU_IDS.thickness],
  });
  return container.containerId;
}

function createProjectContainer(service: PlatformService, projectId: string, station: string): string {
  const slot = service.importSlot({
    station,
    chainage: Number(station.replace("K", "").replace("+", "")),
    x: 200,
    y: 100,
    elevation: 20,
    sourceFile: "gate-evaluate-project-context-test.csv",
  });
  const container = service.createContainer({
    projectId,
    geoSlotRef: slot.slotId,
    autoBindSpuKeys: [PROJECT_SPU_KEY],
  });
  return container.containerId;
}

test("evaluateGateRequest: PASS response shape is stable", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);

  const response = evaluateGateRequest(service, {
    spuId: SPU_IDS.compaction,
    containerId,
    inputs: {
      massHoleSand: 1980,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
    context: {
      source: "unit-test",
      user_id: "did:peg:ins_unit",
      executor_version: "executor@v2-test",
    },
  });

  assert.equal(response.status, "PASS");
  assert.equal(response.result.passed, true);
  assert.equal(response.result.outcome, "PASS");
  assert.ok(response.result.executionId.length > 0);
  assert.equal(Array.isArray(response.matchedRules), true);
  assert.ok(response.statePatch.nodeId.length > 0);
  assert.equal(response.proofFragment.kind, "proofFragment");
  assert.equal(response.proofFragment.operator_id, "did:peg:ins_unit");
  assert.equal(response.proofFragment.executor_version, "executor@v2-test");
  assert.deepEqual(response.proofFragment.inputs, response.inputs);

  // Compatibility layer
  assert.equal(response.executionId, response.result.executionId);
  assert.equal(response.spuId, SPU_IDS.compaction);
  assert.equal(response.outputs, response.result.outputs);

  const executionLog = service.getExecutionLog(response.executionId);
  assert.ok(executionLog);
  assert.equal(executionLog.requestSummary.spuId, SPU_IDS.compaction);
  assert.equal(executionLog.gateDecisionSummary?.status, "PASS");
  assert.equal(executionLog.errorInfo, null);
});

test("evaluateGateRequest: FAIL response shape is stable", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);

  const response = evaluateGateRequest(service, {
    spuId: SPU_IDS.compaction,
    containerId,
    inputs: {
      massHoleSand: 1500,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
    },
  });

  assert.equal(response.status, "FAIL");
  assert.equal(response.result.passed, false);
  assert.equal(response.result.outcome, "FAIL");
  assert.equal(response.matchedRules.some((item) => !item.passed), true);
  assert.equal(response.proofFragment.status, "FAIL");
  assert.equal(response.proofFragment.executor_version, "executor@v1");
  assert.equal(response.proofFragment.operator_id, null);

  const executionLog = service.getExecutionLog(response.executionId);
  assert.ok(executionLog);
  assert.equal(executionLog.gateDecisionSummary?.status, "FAIL");
  assert.equal(executionLog.debugTrace.warnings.length > 0, true);
});

test("evaluateGateRequest: manual override converts BLOCK to OVERRIDE decision", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);

  const response = evaluateGateRequest(service, {
    spuId: SPU_IDS.compaction,
    containerId,
    inputs: {
      massHoleSand: 1500,
      massSandCone: 500,
      volumeSand: 1000,
      moistureContent: 5,
      maxDryDensity: 1.95,
      __gateOverride: {
        approvedBy: "qa-lead",
        reason: "manual review accepted",
      },
    },
  });

  assert.equal(response.status, "PASS");
  assert.equal(response.gateDecision, "OVERRIDE");
  assert.equal(response.result.gateDecision, "OVERRIDE");
  assert.equal(response.result.passed, true);
  assert.equal(response.matchedRules.some((item) => !item.passed), true);

  const executionLog = service.getExecutionLog(response.executionId);
  assert.ok(executionLog);
  assert.equal(executionLog.gateDecisionSummary?.decision, "OVERRIDE");
  assert.equal(executionLog.gateDecisionSummary?.status, "PASS");
});

test("evaluateGateRequest: missing params should throw GATE_REQUEST_INVALID", () => {
  const service = new PlatformService();

  assert.throws(
    () =>
      evaluateGateRequest(service, {
        spuId: SPU_IDS.compaction,
        containerId: "container_x",
      }),
    (error) => {
      assert.ok(error instanceof GateEvaluateError);
      assert.equal(error.code, "GATE_REQUEST_INVALID");
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});

test("evaluateGateRequest: dependency unmet should throw GATE_DEPENDENCY_UNMET", () => {
  const service = new PlatformService();
  const containerId = createDemoContainer(service);

  assert.throws(
    () =>
      evaluateGateRequest(service, {
        spuId: SPU_IDS.thickness,
        containerId,
        inputs: {
          measuredThickness: 205,
          designThickness: 200,
        },
      }),
    (error) => {
      assert.ok(error instanceof GateEvaluateError);
      assert.equal(error.code, "GATE_DEPENDENCY_UNMET");
      assert.equal(error.statusCode, 409);
      return true;
    },
  );

  const latest = service.listExecutionLogs()[0] ?? null;
  assert.ok(latest);
  assert.equal(latest.errorInfo?.stage, "state");
});

test("evaluateGateBatchRequest: mixed results should return aggregate summary and proof references", () => {
  const service = new PlatformService();
  const passContainerId = createDemoContainer(service);
  const failContainerId = createDemoContainer(service);
  const blockedContainerId = createDemoContainer(service);

  const response = evaluateGateBatchRequest(service, {
    items: [
      {
        itemId: "pass_case",
        spuId: SPU_IDS.compaction,
        containerId: passContainerId,
        inputs: {
          massHoleSand: 1980,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
      {
        itemId: "fail_case",
        spuId: SPU_IDS.compaction,
        containerId: failContainerId,
        inputs: {
          massHoleSand: 1500,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
      {
        itemId: "blocked_case",
        spuId: SPU_IDS.thickness,
        containerId: blockedContainerId,
        inputs: {
          measuredThickness: 205,
          designThickness: 200,
        },
      },
    ],
  });

  assert.equal(response.summary.total, 3);
  assert.equal(response.summary.passed, 1);
  assert.equal(response.summary.failed, 1);
  assert.equal(response.summary.blocked, 1);
  assert.equal(response.summary.proofReferences.length, 2);
  assert.equal(response.items[0]?.status, "PASS");
  assert.equal(response.items[1]?.status, "FAIL");
  assert.equal(response.items[2]?.status, "BLOCKED");
  assert.equal(response.items[2]?.error?.code, "GATE_DEPENDENCY_UNMET");
});

test("evaluateGateBatchRequest: partial failure should not block later items", () => {
  const service = new PlatformService();
  const invalidContainerId = createDemoContainer(service);
  const passContainerId = createDemoContainer(service);

  const response = evaluateGateBatchRequest(service, {
    items: [
      {
        itemId: "invalid_item",
        spuId: SPU_IDS.compaction,
        containerId: invalidContainerId,
      },
      {
        itemId: "pass_item",
        spuId: SPU_IDS.compaction,
        containerId: passContainerId,
        inputs: {
          massHoleSand: 1980,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
    ],
  });

  assert.equal(response.summary.total, 2);
  assert.equal(response.summary.passed, 1);
  assert.equal(response.summary.failed, 1);
  assert.equal(response.summary.blocked, 0);
  assert.equal(response.items[0]?.status, "ERROR");
  assert.equal(response.items[1]?.status, "PASS");
});

test("evaluateGateRequest: reads project context for effective version and overrides", () => {
  const service = new PlatformService();
  service.publishSpuVersion(buildProjectSpu(PROJECT_SPU_V1, "v1", 90));
  service.publishSpuVersion(buildProjectSpu(PROJECT_SPU_V2, "v2", 95));

  const projectAlpha = "project-alpha";
  const projectBeta = "project-beta";
  service.bindProjectSpuVersion({
    projectId: projectAlpha,
    spuKey: PROJECT_SPU_KEY,
    selector: { version: "v1" },
  });
  service.bindProjectSpuVersion({
    projectId: projectBeta,
    spuKey: PROJECT_SPU_KEY,
    selector: { version: "v2" },
  });
  service.upsertProjectContext({
    projectId: projectAlpha,
    overrides: {
      bySpuKey: {
        [PROJECT_SPU_KEY]: {
          value: 96,
        },
      },
    },
  });

  const alphaContainerId = createProjectContainer(service, projectAlpha, "K20+001");
  const betaContainerId = createProjectContainer(service, projectBeta, "K20+002");

  const alphaResponse = evaluateGateRequest(service, {
    spuId: PROJECT_SPU_V2,
    containerId: alphaContainerId,
    inputs: {
      value: 91,
    },
  });
  const betaResponse = evaluateGateRequest(service, {
    spuId: PROJECT_SPU_V1,
    containerId: betaContainerId,
    inputs: {
      value: 91,
    },
  });

  assert.equal(alphaResponse.status, "PASS");
  assert.equal(alphaResponse.node.spuId, PROJECT_SPU_V1);
  assert.equal(alphaResponse.outputs.result, 96);

  assert.equal(betaResponse.status, "FAIL");
  assert.equal(betaResponse.node.spuId, PROJECT_SPU_V2);

  const alphaExecutionLog = service.getExecutionLog(alphaResponse.executionId);
  assert.ok(alphaExecutionLog);
  assert.equal(
    alphaExecutionLog?.debugTrace.warnings.some((item) => item.includes("ProjectContext version override applied")),
    true,
  );
  assert.equal(
    alphaExecutionLog?.debugTrace.warnings.some((item) => item.includes("ProjectContext input overrides applied")),
    true,
  );
});

function createMockPassResponse(executionId: string): GateEvaluateResponse {
  const timestamp = new Date().toISOString();
  return {
    status: "PASS",
    result_code: "PASS",
    rule_id: "mock.spu@v1",
    rule_version: "v1",
    evidence: {
      standard_code: "JTG-F80-1-2017",
      clause_no: "4.2.1",
      clause_title: "路基压实度",
      clause_id: "4.2.1",
      clause_content: "条款原文",
    },
    gateDecision: "PASS",
    result: {
      executionId,
      passed: true,
      outcome: "PASS",
      gateStatus: "PASS",
      gateDecision: "PASS",
      outputs: {},
    },
    explanation: "mock pass",
    matchedRules: [],
    statePatch: {
      nodeId: executionId,
      nodeStatus: "FINAL_PASS",
      containerId: "container_mock",
      containerLifecycleState: "RUNNING",
      containerOverallStatus: "PENDING",
    },
    proofFragment: {
      kind: "proofFragment",
      executionId,
      spuId: "mock.spu@v1",
      nodeId: executionId,
      containerId: "container_mock",
      inputSnapshot: {},
      resultSnapshot: {},
      matchedSpecVersion: "v1",
      matchedRules: [],
      status: "PASS",
      signatures: [],
      timestamps: {
        createdAt: timestamp,
        evaluatedAt: timestamp,
        finalizedAt: null,
        archivedAt: null,
      },
      archiveStatus: "NOT_ARCHIVED",
    },
    node: {
      nodeId: executionId,
      spuId: "mock.spu@v1",
      containerRef: "container_mock",
      attemptIndex: 1,
      status: "FINAL_PASS",
      inputs: {},
      outputs: {},
      trace: [],
      gate: {
        passed: true,
        results: [],
      },
      proof: undefined,
      requiredSignatures: [],
      signedBy: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    executionId,
    spuId: "mock.spu@v1",
    inputs: {},
    outputs: {},
    trace: [],
    gateResults: [],
    proof: null,
    calculation: [],
  };
}

test("evaluateGateBatchRequestConcurrent: should process items concurrently and include metrics", async () => {
  const service = new PlatformService();
  const passContainerId1 = createDemoContainer(service);
  const passContainerId2 = createDemoContainer(service);

  const response = await evaluateGateBatchRequestConcurrent(service, {
    items: [
      {
        itemId: "pass_case_1",
        spuId: SPU_IDS.compaction,
        containerId: passContainerId1,
        inputs: {
          massHoleSand: 1980,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
      {
        itemId: "pass_case_2",
        spuId: SPU_IDS.compaction,
        containerId: passContainerId2,
        inputs: {
          massHoleSand: 1980,
          massSandCone: 500,
          volumeSand: 1000,
          moistureContent: 5,
          maxDryDensity: 1.95,
        },
      },
    ],
  }, {
    concurrency: 2,
    timeoutMs: 2000,
    maxRetries: 1,
  });

  assert.equal(response.summary.total, 2);
  assert.equal(response.summary.passed, 2);
  assert.ok(response.performance);
  assert.equal((response.performance?.workerPool.poolSize ?? 0) >= 1, true);
  assert.equal((response.performance?.throughput.itemsPerSecond ?? 0) > 0, true);
  assert.equal(response.performance?.latency.avgMs !== undefined, true);
});

test("evaluateGateBatchRequestConcurrent: higher concurrency should reduce wall-clock duration", async () => {
  const service = new PlatformService();
  const payload = {
    items: [
      { itemId: "perf_1" },
      { itemId: "perf_2" },
      { itemId: "perf_3" },
      { itemId: "perf_4" },
    ],
  };
  const delayedRunner = async (_item: unknown, index: number) => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return createMockPassResponse(`node_perf_${index}`);
  };

  const serialStart = Date.now();
  await evaluateGateBatchRequestConcurrent(service, payload, {
    concurrency: 1,
    runner: delayedRunner,
  });
  const serialDuration = Date.now() - serialStart;

  const concurrentStart = Date.now();
  await evaluateGateBatchRequestConcurrent(service, payload, {
    concurrency: 4,
    runner: delayedRunner,
  });
  const concurrentDuration = Date.now() - concurrentStart;

  assert.equal(concurrentDuration < serialDuration, true);
});

test("evaluateGateBatchRequestConcurrent: timeout and retry should be tracked", async () => {
  const service = new PlatformService();
  const response = await evaluateGateBatchRequestConcurrent(service, {
    items: [{ itemId: "slow_item" }],
  }, {
    concurrency: 1,
    timeoutMs: 20,
    maxRetries: 1,
    retryDelayMs: 1,
    runner: async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return createMockPassResponse("node_slow");
    },
  });

  assert.equal(response.summary.total, 1);
  assert.equal(response.summary.failed, 1);
  assert.equal(response.items[0]?.status, "ERROR");
  assert.equal((response.performance?.timeoutCount ?? 0) >= 1, true);
  assert.equal((response.performance?.retryCount ?? 0) >= 1, true);
});

test("evaluateGateBatchRequestConcurrent: transient failure should succeed after retry", async () => {
  const service = new PlatformService();
  let attempt = 0;
  const response = await evaluateGateBatchRequestConcurrent(service, {
    items: [{ itemId: "retry_item" }],
  }, {
    concurrency: 1,
    maxRetries: 2,
    runner: () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("temporary gate failure");
      }
      return createMockPassResponse("node_retry");
    },
  });

  assert.equal(response.summary.total, 1);
  assert.equal(response.summary.passed, 1);
  assert.equal(response.items[0]?.status, "PASS");
  assert.equal((response.performance?.retryCount ?? 0) >= 1, true);
});
