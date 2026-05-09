import assert from "node:assert/strict";
import test from "node:test";

import type { ExecutionLog } from "../../src/platform/runtime/execution-log.ts";
import { ObservabilityMetricsCollector } from "./observability_metrics_service.ts";

function buildExecutionLog(params: {
  executionId: string;
  startedAt: string;
  durationMs: number;
  gateStatus?: "PASS" | "FAIL" | "BLOCK";
  proofGenerated?: boolean;
  errorMessage?: string;
}): ExecutionLog {
  const endedAt = new Date(Date.parse(params.startedAt) + params.durationMs).toISOString();
  return {
    executionId: params.executionId,
    requestSummary: {
      source: "test",
      intent: "gate.evaluate",
      containerId: "container_test",
      nodeId: params.executionId,
      spuId: "test.spu@v1",
      inputKeys: ["value"],
      inputCount: 1,
    },
    matchedSpu: {
      spuId: "test.spu@v1",
      version: "v1",
      norm: "TEST",
      clause: "1.0.0",
    },
    stateTransitions: [],
    gateDecisionSummary: params.gateStatus
      ? {
          status: params.gateStatus,
          passed: params.gateStatus === "PASS",
          totalRules: 1,
          passedRules: params.gateStatus === "PASS" ? 1 : 0,
          failedRules: params.gateStatus === "PASS" ? 0 : 1,
          failedRuleIds: params.gateStatus === "PASS" ? [] : ["RULE-1"],
        }
      : null,
    timing: {
      startedAt: params.startedAt,
      endedAt,
      durationMs: params.durationMs,
      checkpoints: params.proofGenerated
        ? [{ name: "proof_fragment_built", at: endedAt, elapsedMs: params.durationMs }]
        : [],
    },
    errorInfo: params.errorMessage
      ? {
          stage: "rule",
          code: "ERR_TEST",
          message: params.errorMessage,
          stack: null,
        }
      : null,
    debugTrace: {
      pathSteps: [],
      inputOutputSnapshots: [],
      warnings: [],
    },
  };
}

test("ObservabilityMetricsCollector: computes summary metrics", () => {
  const collector = new ObservabilityMetricsCollector();
  collector.persist(buildExecutionLog({
    executionId: "exec_1",
    startedAt: "2026-04-24T09:10:00.000Z",
    durationMs: 100,
    gateStatus: "PASS",
    proofGenerated: true,
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_2",
    startedAt: "2026-04-24T09:20:00.000Z",
    durationMs: 200,
    gateStatus: "FAIL",
    proofGenerated: false,
    errorMessage: "gate failed",
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_3",
    startedAt: "2026-04-24T09:25:00.000Z",
    durationMs: 300,
    errorMessage: "runtime error",
  }));

  const snapshot = collector.snapshot({
    now: "2026-04-24T09:30:00.000Z",
    windowMinutes: 30,
    bucketMinutes: 10,
  });

  assert.equal(snapshot.summary.totalExecutions, 3);
  assert.equal(snapshot.summary.completedExecutions, 3);
  assert.equal(snapshot.summary.executionSuccessRate, 33.33);
  assert.equal(snapshot.summary.avgLatencyMs, 200);
  assert.equal(snapshot.summary.gatePassRate, 50);
  assert.equal(snapshot.summary.proofGenerationRate, 50);
});

test("ObservabilityMetricsCollector: provides trend and anomaly alerts", () => {
  const collector = new ObservabilityMetricsCollector();
  collector.persist(buildExecutionLog({
    executionId: "exec_base_1",
    startedAt: "2026-04-24T09:42:00.000Z",
    durationMs: 90,
    gateStatus: "PASS",
    proofGenerated: true,
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_base_2",
    startedAt: "2026-04-24T09:46:00.000Z",
    durationMs: 95,
    gateStatus: "PASS",
    proofGenerated: true,
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_base_3",
    startedAt: "2026-04-24T09:51:00.000Z",
    durationMs: 105,
    gateStatus: "PASS",
    proofGenerated: true,
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_drop_1",
    startedAt: "2026-04-24T09:56:00.000Z",
    durationMs: 260,
    gateStatus: "FAIL",
    proofGenerated: false,
    errorMessage: "gate fail",
  }));
  collector.persist(buildExecutionLog({
    executionId: "exec_drop_2",
    startedAt: "2026-04-24T09:57:00.000Z",
    durationMs: 280,
    gateStatus: "FAIL",
    proofGenerated: false,
    errorMessage: "gate fail",
  }));

  const snapshot = collector.snapshot({
    now: "2026-04-24T10:00:00.000Z",
    windowMinutes: 20,
    bucketMinutes: 5,
  });

  assert.equal(snapshot.trend.length, 4);
  assert.equal(snapshot.trend[snapshot.trend.length - 1]?.executionSuccessRate, 0);
  assert.equal(snapshot.trend[snapshot.trend.length - 1]?.proofGenerationRate, 0);
  assert.equal(snapshot.alerts.some((item) => item.code === "SUCCESS_RATE_DROP"), true);
  assert.equal(snapshot.alerts.some((item) => item.code === "LATENCY_SPIKE"), true);
  assert.equal(snapshot.alerts.some((item) => item.code === "PROOF_RATE_DROP"), true);
});
