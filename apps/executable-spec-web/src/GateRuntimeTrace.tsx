import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { evaluateGateRuntimeEngine, getGateRuntimeEngineSchema, listGateRuntimeEngineTrace } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  project_id: "P1",
  form_code: "T0921-2019",
  operator: "engine_auto",
  body_snapshot: {
    body_id: "body_001",
    slotKey: "compaction_degree",
    specir: "JTG_F80_1_2017.4.2.1.compaction",
    form_code: "T0921-2019",
    value: 93,
    confidence: 0.94,
    runtime_status: "valid",
  },
  gate: {
    gate_id: "gate_compaction_threshold",
    gate_type: "threshold",
    slot_refs: ["compaction_degree"],
    operator: ">=",
    threshold: 95,
    severity: "reject",
    runtime_mode: "automatic",
    specir: "JTG_F80_1_2017.4.2.1.compaction",
    rule: "rule.compaction.minimum",
    normRef: "JTG F80/1-2017 4.2.1",
    source_clause: "压实度不得低于95%",
  },
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function GateRuntimeTrace() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [engine, setEngine] = useState<Record<string, unknown> | null>(null);
  const [reasoningStructure, setReasoningStructure] = useState<Record<string, unknown> | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const [traces, setTraces] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [schemaResp, traceResp] = await Promise.all([getGateRuntimeEngineSchema(), listGateRuntimeEngineTrace(200)]);
      setSchema((schemaResp?.gate_runtime_schema ?? null) as Record<string, unknown> | null);
      setEngine((schemaResp?.execution_engine ?? null) as Record<string, unknown> | null);
      setReasoningStructure((schemaResp?.runtime_reasoning_structure ?? null) as Record<string, unknown> | null);
      setTraces(Array.isArray(traceResp?.items) ? traceResp.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await evaluateGateRuntimeEngine(payload as never);
      setLastResult(resp as Record<string, unknown>);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#f8fafc)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Gate Runtime Trace</h1>
        <p style={{ marginTop: 0 }}>Live Gate execution entity driven by Body snapshot.</p>

        <form onSubmit={onEvaluate}>
          <label>
            Evaluate Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Evaluating..." : "Evaluate"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshAll()}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>gate runtime schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>execution engine</summary>
          <pre>{JSON.stringify(engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>runtime reasoning structure</summary>
          <pre>{JSON.stringify(reasoningStructure ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>last evaluation</summary>
          <pre>{JSON.stringify(lastResult ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>trace list</summary>
          <pre>{JSON.stringify(traces, null, 2)}</pre>
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
  border: "1px solid #c7d2fe",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #c7d2fe", borderRadius: 10, padding: 10, background: "#eef2ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #3730a3", background: "#3730a3", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
