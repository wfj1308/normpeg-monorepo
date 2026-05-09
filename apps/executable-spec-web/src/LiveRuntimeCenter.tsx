import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  auditLiveRuntime,
  drainLiveRuntimeWorker,
  getLiveRuntimeSchema,
  getLiveRuntimeSnapshot,
  ingestLiveRuntimeEvent,
  replayLiveRuntimeEvent,
  rollbackLiveRuntimeEvent,
  traceabilityLiveRuntime,
} from "./platform/api-client.ts";

const DEFAULT_EVENT = {
  project_id: "P1",
  form_code: "T0921-2019",
  source: "sensor_streaming",
  slotKey: "compaction_degree",
  body_patch: { compaction_degree: 93.2 },
  gate_context: { gate_id: "default_gate", result: "FAIL" },
  operator: "live_runtime_operator",
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function LiveRuntimeCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_EVENT, null, 2));
  const [projectId, setProjectId] = useState("P1");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [trace, setTrace] = useState<Array<Record<string, unknown>>>([]);
  const [lastAction, setLastAction] = useState<Record<string, unknown> | null>(null);
  const [eventIdForOps, setEventIdForOps] = useState("");
  const [rollbackReason, setRollbackReason] = useState("manual rollback");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [s, snap, a, t] = await Promise.all([
        getLiveRuntimeSchema(),
        getLiveRuntimeSnapshot(projectId.trim() || undefined),
        auditLiveRuntime(200),
        traceabilityLiveRuntime(200),
      ]);
      setSchema(s as unknown as Record<string, unknown>);
      setSnapshot(snap as Record<string, unknown>);
      setAudit(Array.isArray(a?.items) ? a.items : []);
      setTrace(Array.isArray(t?.items) ? t.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    const timer = setInterval(() => {
      void refreshAll();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  async function onIngest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await ingestLiveRuntimeEvent(payload as never);
      setLastAction({ action: "ingest", response: resp });
      const createdEventId = String(((resp?.event as Record<string, unknown> | undefined)?.event_id) ?? "").trim();
      if (createdEventId) setEventIdForOps(createdEventId);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doDrain() {
    setLoading(true);
    setError("");
    try {
      const resp = await drainLiveRuntimeWorker(50);
      setLastAction({ action: "drain", response: resp });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doReplay() {
    if (!eventIdForOps.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await replayLiveRuntimeEvent({ event_id: eventIdForOps.trim() });
      setLastAction({ action: "replay", response: resp });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doRollback() {
    if (!eventIdForOps.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await rollbackLiveRuntimeEvent({ event_id: eventIdForOps.trim(), reason: rollbackReason });
      setLastAction({ action: "rollback", response: resp });
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfccb,#dcfce7)", color: "#14532d", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Live Runtime Center</h1>
        <p style={{ marginTop: 0 }}>Real-time runtime orchestration with async stream processing, live gate/proof/conclusion, replay, rollback, audit and traceability.</p>

        <form onSubmit={onIngest}>
          <label>
            Live Event Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <label>
            Project ID Filter
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Event ID (replay/rollback)
            <input value={eventIdForOps} onChange={(e) => setEventIdForOps(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Rollback Reason
            <input value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Ingesting..." : "Ingest Live Event"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void doDrain()}>Drain Async Worker</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void doReplay()}>Replay Event</button>
            <button type="button" disabled={loading} style={btnWarn} onClick={() => void doRollback()}>Rollback Event</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>runtime event architecture / streaming pipeline / live runtime lifecycle</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>active runtime events</summary>
          <pre>{JSON.stringify(snapshot?.active_runtime_events ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>live failed gates</summary>
          <pre>{JSON.stringify(snapshot?.live_failed_gates ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>current risk level</summary>
          <pre>{JSON.stringify(snapshot?.current_risk_level ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>proof generation stream</summary>
          <pre>{JSON.stringify(snapshot?.proof_generation_stream ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>live conclusion refresh stream</summary>
          <pre>{JSON.stringify(snapshot?.live_conclusion_stream ?? [], null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>last action</summary>
          <pre>{JSON.stringify(lastAction ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>audit</summary>
          <pre>{JSON.stringify(audit, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>traceability</summary>
          <pre>{JSON.stringify(trace, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #86efac",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #86efac",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
const btnWarn: CSSProperties = { borderRadius: 10, border: "1px solid #7f1d1d", background: "#ef4444", color: "#fff", padding: "8px 12px", cursor: "pointer" };
