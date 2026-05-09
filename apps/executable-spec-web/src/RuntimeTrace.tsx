import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  auditRuntimeEngine,
  dispatchRuntimeEngine,
  drainRuntimeEngineQueue,
  getRuntimeEngineSchema,
  listRuntimeEngineExecutions,
  replayRuntimeEngine,
  rollbackRuntimeEngine,
} from "./platform/api-client.ts";

const DEFAULT_DISPATCH = {
  body_update: {
    body_id: "",
    slotKey: "compaction_degree",
    specir: "JTG_F80_1_2017.4.2.1.compaction",
    form_code: "T0921-2019",
    label: "压实度",
    value: 93,
    value_type: "measured",
    unit: "%",
    source_type: "Manual",
    source_ref: "现场录入",
    confidence: 0.94,
    runtime_status: "valid",
  },
  async_execution: false,
  trigger_reason: "body_update",
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function RuntimeTrace() {
  const [dispatchText, setDispatchText] = useState(JSON.stringify(DEFAULT_DISPATCH, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<Record<string, unknown> | null>(null);
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [executions, setExecutions] = useState<Array<Record<string, unknown>>>([]);
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);
  const [lastAction, setLastAction] = useState<Record<string, unknown> | null>(null);
  const [replayId, setReplayId] = useState("");
  const [rollbackId, setRollbackId] = useState("");
  const [rollbackReason, setRollbackReason] = useState("manual rollback");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, execResp, auditResp] = await Promise.all([
        getRuntimeEngineSchema(),
        listRuntimeEngineExecutions(200),
        auditRuntimeEngine(200),
      ]);
      setSchema((schemaResp?.runtime_engine_schema ?? null) as Record<string, unknown> | null);
      setDependencyGraph((schemaResp?.dependency_graph ?? null) as Record<string, unknown> | null);
      setLifecycle(Array.isArray(schemaResp?.execution_lifecycle) ? schemaResp.execution_lifecycle : []);
      setExecutions(Array.isArray(execResp?.items) ? execResp.items : []);
      setAudits(Array.isArray(auditResp?.items) ? auditResp.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onDispatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(dispatchText);
      const resp = await dispatchRuntimeEngine(payload as never);
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onDrain() {
    setLoading(true);
    setError("");
    try {
      const resp = await drainRuntimeEngineQueue(50);
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onReplay() {
    if (!replayId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await replayRuntimeEngine(replayId.trim());
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onRollback() {
    if (!rollbackId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const resp = await rollbackRuntimeEngine({ execution_id: rollbackId.trim(), reason: rollbackReason });
      setLastAction(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#e2e8f0)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Runtime Trace</h1>
        <p style={{ marginTop: 0 }}>Body update -> dependency analysis -> Gate execution -> result generation -> Proof generation</p>

        <form onSubmit={onDispatch}>
          <label>
            Dispatch Payload
            <textarea value={dispatchText} onChange={(e) => setDispatchText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Running..." : "Dispatch"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void onDrain()}>Drain Async Queue</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh</button>
          </div>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div>
            <label>
              Replay Execution ID
              <input value={replayId} onChange={(e) => setReplayId(e.target.value)} style={inputStyle} />
            </label>
            <button type="button" style={btnPlain} disabled={loading} onClick={() => void onReplay()}>Replay</button>
          </div>
          <div>
            <label>
              Rollback Execution ID
              <input value={rollbackId} onChange={(e) => setRollbackId(e.target.value)} style={inputStyle} />
            </label>
            <label>
              Rollback Reason
              <input value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} style={inputStyle} />
            </label>
            <button type="button" style={btnPlain} disabled={loading} onClick={() => void onRollback()}>Rollback</button>
          </div>
        </div>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>runtime engine schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>dependency graph</summary>
          <pre>{JSON.stringify(dependencyGraph ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>execution lifecycle</summary>
          <pre>{JSON.stringify(lifecycle, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>last action</summary>
          <pre>{JSON.stringify(lastAction ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>executions</summary>
          <pre>{JSON.stringify(executions, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>audit</summary>
          <pre>{JSON.stringify(audits, null, 2)}</pre>
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
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
};
const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 220,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
