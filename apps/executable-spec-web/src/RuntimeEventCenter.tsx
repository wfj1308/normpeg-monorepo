import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getRuntimeEventSchema, listRuntimeEvents, writeRuntimeEvent } from "./platform/api-client.ts";

const DEFAULT_EVENT = {
  event_type: "rule_executed",
  project_id: "P1",
  form_code: "T0921-2019",
  peg_id: "form_T0921_v3",
  slotKey: "compaction_degree",
  rule_id: "single_point_rule",
  gate_id: "default_gate",
  result: "FAIL",
  input_values: { compaction_degree: 93 },
  output_values: { threshold: 95 },
  operator: "eng_001",
  proof_ref: "proof_001",
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("event payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function RuntimeEventCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_EVENT, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [lastWrite, setLastWrite] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      const [s, l] = await Promise.all([getRuntimeEventSchema(), listRuntimeEvents(100)]);
      setSchema((s?.event_schema ?? null) as Record<string, unknown> | null);
      setEvents(Array.isArray(l?.items) ? l.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
  }, []);

  async function onWrite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await writeRuntimeEvent(payload as never);
      setLastWrite(resp);
      await refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#e2e8f0)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Runtime Event Center</h1>
        <p style={{ marginTop: 0 }}>标准事件写入 Runtime Semantic Graph 的页面展示。</p>

        <form onSubmit={onWrite}>
          <label>
            Event Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Writing..." : "Write Event"}</button>
            <button type="button" disabled={loading} onClick={() => void refreshAll()} style={btnPlain}>Refresh</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) event schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 事件写入流程</summary>
          <pre>{JSON.stringify(lastWrite?.write_flow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 页面展示方式（事件列表 + 图谱投影）</summary>
          <pre>{JSON.stringify({ latest_write: lastWrite ?? {}, events }, null, 2)}</pre>
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
  border: "1px solid #94a3b8",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #cbd5e1", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
