import { randomUUID } from "node:crypto";

export type RuntimeAnomalyType =
  | "abnormal_sensor_spike"
  | "impossible_value"
  | "repeated_overrides"
  | "suspicious_proof_pattern"
  | "abnormal_gate_fail_burst";

export type RuntimeAnomalySeverity = "low" | "medium" | "high" | "critical";

interface RuntimeAnomalyInput {
  project_id: string;
  form_code?: string;
  sensor_data?: Array<Record<string, unknown>>;
  body_snapshot?: Record<string, unknown>;
  runtime_events?: Array<Record<string, unknown>>;
  proofs?: Array<Record<string, unknown>>;
  gate_results?: Array<Record<string, unknown>>;
}

interface RuntimeAnomalyItem {
  anomaly_id: string;
  created_at: string;
  project_id: string;
  form_code: string | null;
  anomaly_type: RuntimeAnomalyType;
  severity: RuntimeAnomalySeverity;
  affected_slots: string[];
  confidence: number;
  suggested_investigation: string[];
  evidence: Record<string, unknown>;
  blocks_auto_compliance: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function text(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function severityFromConfidence(c: number): RuntimeAnomalySeverity {
  if (c >= 0.9) return "critical";
  if (c >= 0.75) return "high";
  if (c >= 0.55) return "medium";
  return "low";
}

export class RuntimeAnomalyDetectionService {
  private readonly queue: RuntimeAnomalyItem[] = [];

  getSchema() {
    return {
      anomaly_schema: {
        anomaly_types: [
          "abnormal_sensor_spike",
          "impossible_value",
          "repeated_overrides",
          "suspicious_proof_pattern",
          "abnormal_gate_fail_burst",
        ],
        output_fields: ["anomaly_type", "severity", "affected_slots", "confidence", "suggested_investigation"],
      },
      detection_pipeline: [
        "ingest_runtime_signals",
        "run_multi_detector_rules",
        "score_confidence_and_severity",
        "push_to_runtime_risk_queue",
        "apply_auto_compliance_gate",
      ],
      page_plan: {
        title: "Runtime Anomaly Center",
        sections: ["anomaly schema", "detection pipeline", "runtime risk queue", "auto compliance block status"],
      },
    };
  }

  detect(input: RuntimeAnomalyInput) {
    const projectId = text(input.project_id) || "unknown_project";
    const formCode = text(input.form_code) || null;
    const anomalies: RuntimeAnomalyItem[] = [];

    const sensorData = Array.isArray(input.sensor_data) ? input.sensor_data : [];
    const runtimeEvents = Array.isArray(input.runtime_events) ? input.runtime_events : [];
    const proofs = Array.isArray(input.proofs) ? input.proofs : [];
    const gateResults = Array.isArray(input.gate_results) ? input.gate_results : [];
    const body = isRecord(input.body_snapshot) ? input.body_snapshot : {};

    // 1) abnormal sensor spikes
    const grouped = new Map<string, number[]>();
    for (const row of sensorData) {
      const slot = text(row.slotKey ?? row.slot_key ?? row.metric ?? "sensor_value") || "sensor_value";
      const v = num(row.value ?? row.reading ?? row.actual);
      if (v === null) continue;
      const arr = grouped.get(slot) ?? [];
      arr.push(v);
      grouped.set(slot, arr);
    }
    for (const [slot, vals] of grouped.entries()) {
      if (vals.length < 3) continue;
      const sigma = stdDev(vals);
      const span = Math.max(...vals) - Math.min(...vals);
      if (sigma > 8 || span > 25) {
        const confidence = Math.min(0.96, 0.55 + Math.min(0.4, sigma / 20 + span / 120));
        anomalies.push(this.newAnomaly({
          project_id: projectId,
          form_code: formCode,
          anomaly_type: "abnormal_sensor_spike",
          confidence,
          affected_slots: [slot],
          suggested_investigation: [
            "Check sensor calibration and timestamp synchronization",
            "Compare with manual/mobile/BIM sampled values",
          ],
          evidence: { sigma, span, sample_count: vals.length },
        }));
      }
    }

    // 2) impossible values
    const impossibleSlots: string[] = [];
    for (const [k, v] of Object.entries(body)) {
      const n = num(v);
      if (n === null) continue;
      const name = k.toLowerCase();
      const impossible =
        (name.includes("compaction") && (n < 0 || n > 120))
        || (name.includes("moisture") && (n < 0 || n > 60))
        || (name.includes("temperature") && (n < -80 || n > 120));
      if (impossible) impossibleSlots.push(k);
    }
    if (impossibleSlots.length > 0) {
      anomalies.push(this.newAnomaly({
        project_id: projectId,
        form_code: formCode,
        anomaly_type: "impossible_value",
        confidence: 0.95,
        affected_slots: impossibleSlots,
        suggested_investigation: [
          "Validate unit conversion and source mapping",
          "Block downstream gate/proof until corrected",
        ],
        evidence: { body_snapshot: body },
      }));
    }

    // 3) repeated overrides
    const overrideEvents = runtimeEvents.filter((e) => text(e.event_type).toLowerCase().includes("override"));
    if (overrideEvents.length >= 3) {
      const slots = Array.from(new Set(overrideEvents.map((e) => text(e.slotKey ?? e.slot_key)).filter(Boolean)));
      const confidence = Math.min(0.9, 0.55 + overrideEvents.length * 0.06);
      anomalies.push(this.newAnomaly({
        project_id: projectId,
        form_code: formCode,
        anomaly_type: "repeated_overrides",
        confidence,
        affected_slots: slots,
        suggested_investigation: [
          "Review override approvals and operator identities",
          "Run dependency and trust checks before further execution",
        ],
        evidence: { override_count: overrideEvents.length },
      }));
    }

    // 4) suspicious proof patterns
    const suspiciousProofs = proofs.filter((p) => {
      const sigs = Array.isArray(p.signatures) ? p.signatures : [];
      const decisionTrace = Array.isArray(p.decision_trace) ? p.decision_trace : [];
      const hasMissingSign = sigs.some((s) => isRecord(s) && text((s as Record<string, unknown>).status).toUpperCase() !== "SIGNED");
      return hasMissingSign || decisionTrace.length === 0 || !text(p.rule_id ?? p.ruleId);
    });
    if (suspiciousProofs.length > 0) {
      anomalies.push(this.newAnomaly({
        project_id: projectId,
        form_code: formCode,
        anomaly_type: "suspicious_proof_pattern",
        confidence: Math.min(0.92, 0.62 + suspiciousProofs.length * 0.08),
        affected_slots: [],
        suggested_investigation: [
          "Verify proof signature completeness and decision trace",
          "Re-generate proof from replay if necessary",
        ],
        evidence: { suspicious_proof_count: suspiciousProofs.length },
      }));
    }

    // 5) abnormal gate fail bursts
    const failedGates = gateResults.filter((g) => text(g.result ?? g.status).toUpperCase() === "FAIL");
    if (failedGates.length >= 3) {
      const slots = Array.from(new Set(failedGates.map((g) => text(g.slotKey ?? g.slot_key)).filter(Boolean)));
      const confidence = Math.min(0.94, 0.58 + failedGates.length * 0.07);
      anomalies.push(this.newAnomaly({
        project_id: projectId,
        form_code: formCode,
        anomaly_type: "abnormal_gate_fail_burst",
        confidence,
        affected_slots: slots,
        suggested_investigation: [
          "Run engineering reasoning and causal graph analysis",
          "Escalate to manual review before auto compliance",
        ],
        evidence: { failed_gate_count: failedGates.length },
      }));
    }

    for (const a of anomalies) {
      this.queue.unshift(a);
    }
    if (this.queue.length > 2000) this.queue.length = 2000;

    const hasHighSeverity = anomalies.some((a) => a.severity === "high" || a.severity === "critical");

    return {
      anomalies,
      runtime_risk_queue: {
        pushed: anomalies.length,
        queue_size: this.queue.length,
      },
      auto_compliance_gate: {
        blocked: hasHighSeverity,
        reason: hasHighSeverity ? "high severity anomaly detected" : "no high severity anomaly",
      },
    };
  }

  listQueue(params?: { project_id?: string; limit?: number }) {
    const projectId = text(params?.project_id);
    const limit = Number.isFinite(params?.limit) ? Math.max(1, Math.min(1000, Number(params?.limit))) : 200;
    const scoped = projectId ? this.queue.filter((i) => i.project_id === projectId) : this.queue;
    return { items: scoped.slice(0, limit) };
  }

  gateAutoCompliance(payload: { anomaly_id?: string }) {
    const anomalyId = text(payload.anomaly_id);
    const target = anomalyId ? this.queue.find((i) => i.anomaly_id === anomalyId) : this.queue[0];
    if (!target) {
      return { blocked: false, reason: "no anomaly in queue" };
    }
    const blocked = target.severity === "high" || target.severity === "critical";
    return {
      blocked,
      anomaly_id: target.anomaly_id,
      severity: target.severity,
      reason: blocked ? "high severity anomaly blocks auto compliance" : "severity below blocking threshold",
    };
  }

  private newAnomaly(params: {
    project_id: string;
    form_code: string | null;
    anomaly_type: RuntimeAnomalyType;
    confidence: number;
    affected_slots: string[];
    suggested_investigation: string[];
    evidence: Record<string, unknown>;
  }): RuntimeAnomalyItem {
    const confidence = Math.max(0, Math.min(1, Number(params.confidence)));
    const severity = severityFromConfidence(confidence);
    const blocks = severity === "high" || severity === "critical";
    return {
      anomaly_id: `anomaly_${randomUUID()}`,
      created_at: nowIso(),
      project_id: params.project_id,
      form_code: params.form_code,
      anomaly_type: params.anomaly_type,
      severity,
      affected_slots: params.affected_slots,
      confidence: Number(confidence.toFixed(3)),
      suggested_investigation: params.suggested_investigation,
      evidence: params.evidence,
      blocks_auto_compliance: blocks,
    };
  }
}
