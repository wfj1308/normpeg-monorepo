import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  getRuntimeBodySchema,
  getRuntimeBodyTimeline,
  replayRuntimeBody,
  rollbackRuntimeBody,
  updateRuntimeBody,
} from "./platform/api-client.ts";

const DEFAULT_UPDATE = {
  body: {
    body_id: "",
    slotKey: "compaction_degree",
    specir: "JTG_F80_1_2017.4.2.1.compaction",
    form_code: "T0921-2019",
    project_id: "P1",
    label: "压实度",
    value: 94,
    value_type: "measured",
    unit: "%",
    confidence: 0.95,
    runtime_status: "valid",
  },
  source: "manual input",
  operator: "inspector_001",
  override: false,
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function BodyTimeline() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_UPDATE, null, 2));
  const [targetBodyId, setTargetBodyId] = useState("");
  const [replayEventId, setReplayEventId] = useState("");
  const [rollbackBodyId, setRollbackBodyId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("manual rollback");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<Record<string, unknown> | null>(null);
  const [lastAction, setLastAction] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, timelineResp] = await Promise.all([
        getRuntimeBodySchema(),
        getRuntimeBodyTimeline({ body_id: targetBodyId.trim() || undefined, limit: 300 }),
      ]);
      setSchema((schemaResp?.body_runtime_schema ?? null) as Record<string, unknown> | null);
      setLifecycle(Array.isArray(schemaResp?.update_lifecycle) ? schemaResp.update_lifecycle : []);
      setPipeline(Array.isArray(schemaResp?.recompute_pipeline) ? schemaResp.recompute_pipeline : []);
      setTimeline((timelineResp ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await updateRuntimeBody(payload as never);
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onRollback() {
    if (!rollbackBodyId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await rollbackRuntimeBody({ body_id: rollbackBodyId.trim(), reason: rollbackReason });
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onReplay() {
    if (!replayEventId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await replayRuntimeBody({ event_id: replayEventId.trim() });
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#faf5ff,#f0f9ff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Body Timeline</h1>
        <p style={{ marginTop: 0 }}>Runtime Body entity timeline with live/historical value, source tracking, dependency tracking, override/rollback/replay.</p>

        <form onSubmit={onUpdate}>
          <label>
            Runtime Body Update Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Updating..." : "Update Body"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh</button>
          </div>
        </form>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label>
              Filter Body ID
              <input value={targetBodyId} onChange={(e) => setTargetBodyId(e.target.value)} style={inputStyle} />
            </label>
            <label>
              Replay Event ID
              <input value={replayEventId} onChange={(e) => setReplayEventId(e.target.value)} style={inputStyle} />
            </label>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void onReplay()}>Replay Body Event</button>
          </div>
          <div>
            <label>
              Rollback Body ID
              <input value={rollbackBodyId} onChange={(e) => setRollbackBodyId(e.target.value)} style={inputStyle} />
            </label>
            <label>
              Rollback Reason
              <input value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} style={inputStyle} />
            </label>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void onRollback()}>Rollback Body</button>
          </div>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>body runtime schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>update lifecycle</summary>
          <pre>{JSON.stringify(lifecycle, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>recompute pipeline</summary>
          <pre>{JSON.stringify(pipeline, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>last action</summary>
          <pre>{JSON.stringify(lastAction ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>timeline data (live/historical/source/dependency)</summary>
          <pre>{JSON.stringify(timeline ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d8b4fe",
  boxSizing: "border-box",
};
const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #d8b4fe",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #d8b4fe", borderRadius: 10, padding: 10, background: "#faf5ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #6d28d9", background: "#6d28d9", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
