import type { ExecutionLog, ExecutionLogSink } from "../../src/platform/runtime/execution-log.ts";

const PROOF_CHECKPOINT_NAMES = new Set([
  "proof_fragment_built",
  "proof_finalized",
  "proof_aggregated",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMetric(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(2));
}

function normalizePositiveInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(Number(value))));
}

interface MetricCounters {
  totalExecutions: number;
  completedExecutions: number;
  successfulExecutions: number;
  latencyCount: number;
  latencyTotalMs: number;
  gateEvaluatedExecutions: number;
  gatePassedExecutions: number;
  proofExpectedExecutions: number;
  proofGeneratedExecutions: number;
}

export interface SystemMetricSnapshot {
  totalExecutions: number;
  completedExecutions: number;
  executionSuccessRate: number;
  avgLatencyMs: number;
  gatePassRate: number;
  proofGenerationRate: number;
}

export interface SystemMetricTrendPoint extends SystemMetricSnapshot {
  bucketStart: string;
  bucketEnd: string;
}

export interface SystemMetricAlert {
  code:
    | "SUCCESS_RATE_DROP"
    | "LATENCY_SPIKE"
    | "GATE_PASS_RATE_DROP"
    | "PROOF_RATE_DROP";
  severity: "warning" | "critical";
  message: string;
  latestValue: number;
  baselineValue: number;
}

export interface SystemMetricsDashboard {
  window: {
    from: string;
    to: string;
    windowMinutes: number;
    bucketMinutes: number;
    totalBuckets: number;
  };
  summary: SystemMetricSnapshot;
  trend: SystemMetricTrendPoint[];
  alerts: SystemMetricAlert[];
  updatedAt: string;
}

function hasSuccessfulProof(log: ExecutionLog): boolean {
  return log.timing.checkpoints.some((item) => PROOF_CHECKPOINT_NAMES.has(item.name));
}

function buildCounters(logs: ExecutionLog[]): MetricCounters {
  const counters: MetricCounters = {
    totalExecutions: logs.length,
    completedExecutions: 0,
    successfulExecutions: 0,
    latencyCount: 0,
    latencyTotalMs: 0,
    gateEvaluatedExecutions: 0,
    gatePassedExecutions: 0,
    proofExpectedExecutions: 0,
    proofGeneratedExecutions: 0,
  };

  for (const log of logs) {
    const ended = typeof log.timing.endedAt === "string" && log.timing.endedAt.trim().length > 0;
    if (ended) {
      counters.completedExecutions += 1;
      if (!log.errorInfo) {
        counters.successfulExecutions += 1;
      }
      if (typeof log.timing.durationMs === "number" && Number.isFinite(log.timing.durationMs)) {
        counters.latencyCount += 1;
        counters.latencyTotalMs += Math.max(0, log.timing.durationMs);
      }
    }

    const gate = log.gateDecisionSummary;
    if (gate && gate.status !== "PENDING") {
      counters.gateEvaluatedExecutions += 1;
      if (gate.status === "PASS") {
        counters.gatePassedExecutions += 1;
      }
      counters.proofExpectedExecutions += 1;
      if (hasSuccessfulProof(log)) {
        counters.proofGeneratedExecutions += 1;
      }
    }
  }

  return counters;
}

function toSnapshot(logs: ExecutionLog[]): SystemMetricSnapshot {
  const counters = buildCounters(logs);
  const executionSuccessRate =
    counters.completedExecutions > 0
      ? (counters.successfulExecutions / counters.completedExecutions) * 100
      : 0;
  const avgLatencyMs =
    counters.latencyCount > 0
      ? counters.latencyTotalMs / counters.latencyCount
      : 0;
  const gatePassRate =
    counters.gateEvaluatedExecutions > 0
      ? (counters.gatePassedExecutions / counters.gateEvaluatedExecutions) * 100
      : 0;
  const proofGenerationRate =
    counters.proofExpectedExecutions > 0
      ? (counters.proofGeneratedExecutions / counters.proofExpectedExecutions) * 100
      : 0;

  return {
    totalExecutions: counters.totalExecutions,
    completedExecutions: counters.completedExecutions,
    executionSuccessRate: roundMetric(executionSuccessRate),
    avgLatencyMs: roundMetric(avgLatencyMs),
    gatePassRate: roundMetric(gatePassRate),
    proofGenerationRate: roundMetric(proofGenerationRate),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildAlerts(trend: SystemMetricTrendPoint[]): SystemMetricAlert[] {
  const nonEmpty = trend.filter((item) => item.totalExecutions > 0);
  if (nonEmpty.length < 2) {
    return [];
  }
  const latest = nonEmpty[nonEmpty.length - 1];
  const baselinePoints = nonEmpty.slice(0, -1);
  const baseline = {
    executionSuccessRate: average(baselinePoints.map((item) => item.executionSuccessRate)),
    avgLatencyMs: average(baselinePoints.map((item) => item.avgLatencyMs).filter((item) => item > 0)),
    gatePassRate: average(baselinePoints.map((item) => item.gatePassRate)),
    proofGenerationRate: average(baselinePoints.map((item) => item.proofGenerationRate)),
  };

  const alerts: SystemMetricAlert[] = [];
  if (baseline.executionSuccessRate > 0 && latest.executionSuccessRate <= baseline.executionSuccessRate - 15) {
    alerts.push({
      code: "SUCCESS_RATE_DROP",
      severity: latest.executionSuccessRate < 70 ? "critical" : "warning",
      message: "Execution success rate dropped compared with historical baseline.",
      latestValue: latest.executionSuccessRate,
      baselineValue: roundMetric(baseline.executionSuccessRate),
    });
  }
  if (baseline.avgLatencyMs > 0 && latest.avgLatencyMs >= baseline.avgLatencyMs * 1.8) {
    alerts.push({
      code: "LATENCY_SPIKE",
      severity: latest.avgLatencyMs >= baseline.avgLatencyMs * 2.5 ? "critical" : "warning",
      message: "Average latency is significantly higher than baseline.",
      latestValue: latest.avgLatencyMs,
      baselineValue: roundMetric(baseline.avgLatencyMs),
    });
  }
  if (baseline.gatePassRate > 0 && latest.gatePassRate <= baseline.gatePassRate - 15) {
    alerts.push({
      code: "GATE_PASS_RATE_DROP",
      severity: latest.gatePassRate < 70 ? "critical" : "warning",
      message: "Gate pass rate dropped compared with historical baseline.",
      latestValue: latest.gatePassRate,
      baselineValue: roundMetric(baseline.gatePassRate),
    });
  }
  if (baseline.proofGenerationRate > 0 && latest.proofGenerationRate <= baseline.proofGenerationRate - 15) {
    alerts.push({
      code: "PROOF_RATE_DROP",
      severity: latest.proofGenerationRate < 70 ? "critical" : "warning",
      message: "Proof generation rate dropped compared with historical baseline.",
      latestValue: latest.proofGenerationRate,
      baselineValue: roundMetric(baseline.proofGenerationRate),
    });
  }
  return alerts;
}

export class CompositeExecutionLogSink implements ExecutionLogSink {
  private readonly sinks: ExecutionLogSink[];

  constructor(sinks: ExecutionLogSink[]) {
    this.sinks = sinks.slice();
  }

  persist(log: ExecutionLog): void {
    for (const sink of this.sinks) {
      sink.persist(log);
    }
  }
}

export class ObservabilityMetricsCollector implements ExecutionLogSink {
  private readonly logs = new Map<string, ExecutionLog>();
  private updatedAt = nowIso();

  persist(log: ExecutionLog): void {
    this.logs.set(log.executionId, structuredClone(log));
    this.updatedAt = nowIso();
  }

  listLogs(): ExecutionLog[] {
    return Array.from(this.logs.values())
      .sort((a, b) => b.timing.startedAt.localeCompare(a.timing.startedAt))
      .map((item) => structuredClone(item));
  }

  snapshot(params?: {
    windowMinutes?: number;
    bucketMinutes?: number;
    now?: string;
  }): SystemMetricsDashboard {
    const nowTs = toTimestamp(params?.now) ?? Date.now();
    const windowMinutes = normalizePositiveInt(params?.windowMinutes, 60, 5, 24 * 60);
    const bucketMinutes = normalizePositiveInt(params?.bucketMinutes, 5, 1, 120);
    const windowStartTs = nowTs - (windowMinutes * 60 * 1000);
    const bucketMs = bucketMinutes * 60 * 1000;
    const bucketCount = Math.max(1, Math.ceil((nowTs - windowStartTs) / bucketMs));

    const allLogs = this.listLogs();
    const windowLogs = allLogs.filter((item) => {
      const startedAt = toTimestamp(item.timing.startedAt);
      if (startedAt === null) {
        return false;
      }
      return startedAt >= windowStartTs && startedAt <= nowTs;
    });

    const trend: SystemMetricTrendPoint[] = [];
    for (let index = 0; index < bucketCount; index += 1) {
      const bucketStartTs = windowStartTs + (index * bucketMs);
      const bucketEndTs = Math.min(nowTs, bucketStartTs + bucketMs);
      const bucketLogs = windowLogs.filter((item) => {
        const startedAt = toTimestamp(item.timing.startedAt);
        if (startedAt === null) {
          return false;
        }
        if (index === bucketCount - 1) {
          return startedAt >= bucketStartTs && startedAt <= bucketEndTs;
        }
        return startedAt >= bucketStartTs && startedAt < bucketEndTs;
      });
      trend.push({
        bucketStart: new Date(bucketStartTs).toISOString(),
        bucketEnd: new Date(bucketEndTs).toISOString(),
        ...toSnapshot(bucketLogs),
      });
    }

    return {
      window: {
        from: new Date(windowStartTs).toISOString(),
        to: new Date(nowTs).toISOString(),
        windowMinutes,
        bucketMinutes,
        totalBuckets: trend.length,
      },
      summary: toSnapshot(windowLogs),
      trend,
      alerts: buildAlerts(trend),
      updatedAt: this.updatedAt,
    };
  }
}
