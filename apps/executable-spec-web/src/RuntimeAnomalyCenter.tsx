import { CSSProperties, FormEvent, useEffect, useState } from "react";
import {
  detectRuntimeAnomaly,
  gateAutoComplianceByAnomaly,
  getRuntimeAnomalySchema,
  listRuntimeRiskQueue,
} from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  project_id: "P1",
  form_code: "T0921-2019",
  sensor_data: [
    { slotKey: "compaction_degree", value: 92.9 },
    { slotKey: "compaction_degree", value: 93.1 },
    { slotKey: "compaction_degree", value: 122.4 }
  ],
  body_snapshot: {
    compaction_degree: 122.4,
    moisture_content: 66.2,
  },
  runtime_events: [
    { event_type: "manual_override", slotKey: "compaction_degree", operator: "reviewer_1" },
    { event_type: "manual_override", slotKey: "compaction_degree", operator: "reviewer_1" },
    { event_type: "manual_override", slotKey: "compaction_degree", operator: "reviewer_2" },
    { event_type: "sensor_anomaly", anomaly: true }
  ],
  proofs: [
    { proof_id: "proof_001", signatures: [{ role: "lab", status: "PENDING" }], decision_trace: [] }
  ],
  gate_results: [
    { gate_id: "default_gate", slotKey: "compaction_degree", result: "FAIL" },
    { gate_id: "default_gate", slotKey: "compaction_degree", result: "FAIL" },
    { gate_id: "default_gate", slotKey: "compaction_degree", result: "FAIL" }
  ]
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function RuntimeAnomalyCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [projectId, setProjectId] = useState("P1");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<Array<Record<string, unknown>>>([]);
  const [gateResult, setGateResult] = useState<Record<string, unknown> | null>(null);
  const [selectedAnomalyId, setSelectedAnomalyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getRuntimeAnomalySchema();
    setSchema((resp?.anomaly_schema ?? null) as Record<string, unknown> | null);
    setPipeline(Array.isArray(resp?.detection_pipeline) ? resp.detection_pipeline : []);
    setPlan((resp?.page_plan ?? null) as Record<string, unknown> | null);
  }

  async function refreshQueue() {
    const resp = await listRuntimeRiskQueue({ project_id: projectId.trim() || undefined, limit: 200 });
    const items = Array.isArray(resp?.items) ? resp.items : [];
    setQueue(items);
    if (!selectedAnomalyId && items.length > 0) {
      const id = String(items[0]?.anomaly_id ?? "").trim();
      if (id) setSelectedAnomalyId(id);
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([refreshSchema(), refreshQueue()]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onDetect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await detectRuntimeAnomaly(payload as never);
      setResult(resp as Record<string, unknown>);
      await refreshQueue();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function onGateCheck() {
    setLoading(true);
    setError("");
    try {
      const resp = await gateAutoComplianceByAnomaly({ anomaly_id: selectedAnomalyId.trim() || undefined });
      setGateResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff1f2,#fee2e2)", color: "#111827", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Runtime Anomaly Center</h1>
        <p style={{ marginTop: 0 }}>Auto detect runtime anomalies, push to Runtime Risk Queue, and block auto compliance for high severity anomalies.</p>

        <form onSubmit={onDetect}>
          <label>
            Detection Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <label>
            Project ID Filter
            <input value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle} />
          </label>
          <label>
            Selected Anomaly ID (auto compliance gate)
            <input value={selectedAnomalyId} onChange={(e) => setSelectedAnomalyId(e.target.value)} style={inputStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Detecting..." : "Run Anomaly Detection"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshQueue()}>Refresh Runtime Risk Queue</button>
            <button type="button" disabled={loading} style={btnWarn} onClick={() => void onGateCheck()}>Check Auto Compliance Gate</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>anomaly schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>detection pipeline</summary>
          <pre>{JSON.stringify(pipeline, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>page plan</summary>
          <pre>{JSON.stringify(plan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>detection result</summary>
          <pre>{JSON.stringify(result ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>Runtime Risk Queue</summary>
          <pre>{JSON.stringify(queue, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>high severity auto compliance blocking</summary>
          <pre>{JSON.stringify(gateResult ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 260,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  marginBottom: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  boxSizing: "border-box",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fecaca", borderRadius: 10, padding: 10, background: "#fff1f2" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #b91c1c", background: "#b91c1c", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
const btnWarn: CSSProperties = { borderRadius: 10, border: "1px solid #7f1d1d", background: "#ef4444", color: "#fff", padding: "8px 12px", cursor: "pointer" };
