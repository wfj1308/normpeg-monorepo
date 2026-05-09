import { randomUUID } from "node:crypto";

export type LiveRuntimeEventSource = "sensor_streaming" | "mobile_update" | "bim_update" | "manual_override";
export type LiveRuntimeEventType = "body_update" | "gate_evaluation" | "proof_generated" | "conclusion_refreshed" | "risk_updated";

export interface LiveRuntimeIngestPayload {
  project_id: string;
  form_code?: string;
  source: LiveRuntimeEventSource;
  slotKey?: string;
  body_patch?: Record<string, unknown>;
  gate_context?: Record<string, unknown>;
  proof_context?: Record<string, unknown>;
  bim_context?: Record<string, unknown>;
  mobile_context?: Record<string, unknown>;
  override?: Record<string, unknown>;
  operator?: string;
  timestamp?: string;
}

interface LiveRuntimeEventRecord {
  event_id: string;
  project_id: string;
  form_code: string | null;
  source: LiveRuntimeEventSource;
  event_type: LiveRuntimeEventType;
  status: "queued" | "processed" | "failed";
  slotKey: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  processed_at: string | null;
  error: string | null;
}

interface LiveProofRecord {
  proof_id: string;
  event_id: string;
  project_id: string;
  form_code: string | null;
  status: "PASS" | "FAIL";
  generated_at: string;
  source: LiveRuntimeEventSource;
}

interface LiveConclusionRecord {
  conclusion_id: string;
  project_id: string;
  form_code: string | null;
  status: "PASS" | "FAIL" | "REVIEW_REQUIRED";
  refreshed_at: string;
  reason: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function normText(v: unknown): string {
  return String(v ?? "").trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function riskLevelFromCounts(failedGateCount: number, overrideCount: number): "low" | "medium" | "high" | "critical" {
  const score = failedGateCount * 2 + overrideCount;
  if (score >= 8) return "critical";
  if (score >= 5) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export class LiveRuntimeSystemService {
  private readonly events: LiveRuntimeEventRecord[] = [];
  private readonly queue: string[] = [];
  private readonly proofs: LiveProofRecord[] = [];
  private readonly conclusions: LiveConclusionRecord[] = [];
  private readonly audits: Array<Record<string, unknown>> = [];
  private readonly traces: Array<Record<string, unknown>> = [];

  getArchitecture() {
    return {
      runtime_event_architecture: {
        event_bus: "in_memory_append_only",
        async_worker: "queue + drain processor",
        derived_streams: ["live_gate_evaluation", "live_proof_generation", "live_conclusion_refresh", "risk_projection"],
        supported_sources: ["sensor_streaming", "mobile_update", "bim_update", "manual_override"],
      },
      streaming_pipeline: [
        "ingest_event",
        "enqueue_async_task",
        "evaluate_live_gate",
        "generate_live_proof",
        "refresh_live_conclusion",
        "update_risk_and_emit_audit_trace",
      ],
      live_runtime_lifecycle: [
        "active",
        "degraded",
        "replay_mode",
        "rollback_mode",
        "audit_mode",
      ],
    };
  }

  ingest(payload: LiveRuntimeIngestPayload) {
    const projectId = normText(payload.project_id) || "unknown_project";
    const formCode = normText(payload.form_code) || null;
    const eventId = `lrt_evt_${randomUUID()}`;
    const event: LiveRuntimeEventRecord = {
      event_id: eventId,
      project_id: projectId,
      form_code: formCode,
      source: payload.source,
      event_type: "body_update",
      status: "queued",
      slotKey: normText(payload.slotKey) || null,
      payload: {
        body_patch: isRecord(payload.body_patch) ? payload.body_patch : {},
        gate_context: isRecord(payload.gate_context) ? payload.gate_context : {},
        proof_context: isRecord(payload.proof_context) ? payload.proof_context : {},
        bim_context: isRecord(payload.bim_context) ? payload.bim_context : {},
        mobile_context: isRecord(payload.mobile_context) ? payload.mobile_context : {},
        override: isRecord(payload.override) ? payload.override : {},
        operator: normText(payload.operator) || null,
      },
      created_at: normText(payload.timestamp) || nowIso(),
      processed_at: null,
      error: null,
    };
    this.events.unshift(event);
    this.queue.push(eventId);
    this.pushAudit({ action: "ingest", event_id: eventId, project_id: projectId, form_code: formCode, source: payload.source });
    this.trim();
    return {
      event,
      write_flow: {
        accepted: true,
        queued: true,
        async_processing: "pending",
      },
    };
  }

  drain(limit = 20) {
    const max = Math.max(1, Math.min(200, Math.floor(limit)));
    const processed: Array<Record<string, unknown>> = [];
    for (let i = 0; i < max && this.queue.length > 0; i += 1) {
      const eventId = this.queue.shift() as string;
      const event = this.events.find((item) => item.event_id === eventId);
      if (!event) continue;
      try {
        const gateFail = this.evaluateGate(event);
        const proof = this.generateProof(event, gateFail);
        const conclusion = this.refreshConclusion(event, gateFail);
        event.event_type = "conclusion_refreshed";
        event.status = "processed";
        event.processed_at = nowIso();
        this.pushTrace({
          event_id: event.event_id,
          steps: ["evaluate_live_gate", "generate_live_proof", "refresh_live_conclusion"],
          gate_failed: gateFail,
          proof_id: proof.proof_id,
          conclusion_id: conclusion.conclusion_id,
          processed_at: event.processed_at,
        });
        this.pushAudit({ action: "processed", event_id: event.event_id, proof_id: proof.proof_id, conclusion_id: conclusion.conclusion_id });
        processed.push({ event_id: event.event_id, status: "processed", proof, conclusion });
      } catch (e) {
        event.status = "failed";
        event.error = e instanceof Error ? e.message : String(e);
        event.processed_at = nowIso();
        this.pushAudit({ action: "failed", event_id: event.event_id, error: event.error });
        processed.push({ event_id: event.event_id, status: "failed", error: event.error });
      }
    }
    return { processed, queue_size: this.queue.length };
  }

  snapshot(projectId?: string) {
    const normalizedProject = normText(projectId);
    const events = normalizedProject
      ? this.events.filter((item) => item.project_id === normalizedProject)
      : this.events;
    const proofs = normalizedProject
      ? this.proofs.filter((item) => item.project_id === normalizedProject)
      : this.proofs;
    const conclusions = normalizedProject
      ? this.conclusions.filter((item) => item.project_id === normalizedProject)
      : this.conclusions;

    const failedGates = events
      .filter((item) => item.status === "processed")
      .filter((item) => {
        const gate = item.payload.gate_context;
        if (!isRecord(gate)) return false;
        return normText(gate.result).toUpperCase() === "FAIL";
      })
      .map((item) => ({
        event_id: item.event_id,
        gate_id: normText((item.payload.gate_context as Record<string, unknown>)?.gate_id) || "default_gate",
        form_code: item.form_code,
        slotKey: item.slotKey,
      }));

    const overrideCount = events.filter((item) => item.source === "manual_override").length;
    const riskLevel = riskLevelFromCounts(failedGates.length, overrideCount);

    return {
      active_runtime_events: events.slice(0, 200),
      live_failed_gates: failedGates,
      current_risk_level: {
        level: riskLevel,
        failed_gate_count: failedGates.length,
        override_count: overrideCount,
      },
      proof_generation_stream: proofs.slice(0, 200),
      live_conclusion_stream: conclusions.slice(0, 200),
      queue_size: this.queue.length,
      runtime_mode: this.queue.length > 80 ? "degraded" : "active",
    };
  }

  replay(eventId: string) {
    const found = this.events.find((item) => item.event_id === normText(eventId));
    if (!found) throw new Error("event not found");
    const replayed = this.ingest({
      project_id: found.project_id,
      form_code: found.form_code ?? undefined,
      source: found.source,
      slotKey: found.slotKey ?? undefined,
      body_patch: isRecord(found.payload.body_patch) ? found.payload.body_patch : {},
      gate_context: isRecord(found.payload.gate_context) ? found.payload.gate_context : {},
      proof_context: isRecord(found.payload.proof_context) ? found.payload.proof_context : {},
      bim_context: isRecord(found.payload.bim_context) ? found.payload.bim_context : {},
      mobile_context: isRecord(found.payload.mobile_context) ? found.payload.mobile_context : {},
      override: isRecord(found.payload.override) ? found.payload.override : {},
      operator: normText(found.payload.operator) || "replay_operator",
    });
    this.pushAudit({ action: "replay", from_event_id: eventId, to_event_id: replayed.event.event_id });
    return { replay_from: eventId, replay_to: replayed.event.event_id };
  }

  rollback(eventId: string, reason?: string) {
    const idx = this.events.findIndex((item) => item.event_id === normText(eventId));
    if (idx < 0) throw new Error("event not found");
    const [removed] = this.events.splice(idx, 1);
    this.pushAudit({ action: "rollback", event_id: eventId, reason: normText(reason) || "manual rollback" });
    return { rolled_back: removed.event_id, reason: normText(reason) || "manual rollback" };
  }

  audit(limit = 200) {
    const max = Math.max(1, Math.min(1000, Math.floor(limit)));
    return { items: this.audits.slice(0, max) };
  }

  trace(limit = 200) {
    const max = Math.max(1, Math.min(1000, Math.floor(limit)));
    return { items: this.traces.slice(0, max) };
  }

  private evaluateGate(event: LiveRuntimeEventRecord): boolean {
    const gate = event.payload.gate_context;
    if (isRecord(gate)) {
      const explicit = normText(gate.result).toUpperCase();
      if (explicit === "FAIL") return true;
      if (explicit === "PASS") return false;
    }
    const bodyPatch = isRecord(event.payload.body_patch) ? event.payload.body_patch : {};
    const value = Number(bodyPatch.value ?? bodyPatch.compaction_degree ?? Number.NaN);
    if (Number.isFinite(value)) {
      return value < 95;
    }
    return event.source === "manual_override";
  }

  private generateProof(event: LiveRuntimeEventRecord, gateFailed: boolean): LiveProofRecord {
    const proof: LiveProofRecord = {
      proof_id: `live_proof_${randomUUID()}`,
      event_id: event.event_id,
      project_id: event.project_id,
      form_code: event.form_code,
      status: gateFailed ? "FAIL" : "PASS",
      generated_at: nowIso(),
      source: event.source,
    };
    this.proofs.unshift(proof);
    return proof;
  }

  private refreshConclusion(event: LiveRuntimeEventRecord, gateFailed: boolean): LiveConclusionRecord {
    const conclusion: LiveConclusionRecord = {
      conclusion_id: `live_conclusion_${randomUUID()}`,
      project_id: event.project_id,
      form_code: event.form_code,
      status: gateFailed ? "REVIEW_REQUIRED" : "PASS",
      refreshed_at: nowIso(),
      reason: gateFailed ? "failed_gate_detected" : "live_pass",
    };
    this.conclusions.unshift(conclusion);
    return conclusion;
  }

  private pushAudit(item: Record<string, unknown>) {
    this.audits.unshift({
      audit_id: `lrt_audit_${randomUUID()}`,
      created_at: nowIso(),
      ...item,
    });
    if (this.audits.length > 2000) this.audits.length = 2000;
  }

  private pushTrace(item: Record<string, unknown>) {
    this.traces.unshift({
      trace_id: `lrt_trace_${randomUUID()}`,
      created_at: nowIso(),
      ...item,
    });
    if (this.traces.length > 2000) this.traces.length = 2000;
  }

  private trim() {
    if (this.events.length > 2000) this.events.length = 2000;
    if (this.proofs.length > 2000) this.proofs.length = 2000;
    if (this.conclusions.length > 2000) this.conclusions.length = 2000;
  }
}
