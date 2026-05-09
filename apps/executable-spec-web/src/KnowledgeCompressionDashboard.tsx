import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getRuntimeKnowledgeCompressionSchema, runRuntimeKnowledgeCompression } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  runtime_graph: [
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", result: "FAIL" },
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", result: "FAIL" },
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", result: "PASS" },
    { form_code: "T1001-2019", gate_id: "gate_density", result: "FAIL" },
  ],
  proofs: [
    { proof_id: "proof_001", gate_id: "gate_compaction_min", proof_status: "incomplete", hash: "h1" },
    { proof_id: "proof_002", gate_id: "gate_compaction_min", proof_status: "incomplete", hash: "h1" },
    { proof_id: "proof_003", gate_id: "gate_density", proof_status: "verified", hash: "h2" },
  ],
  risks: [
    { form_code: "T0921-2019", risk_level: "high" },
    { form_code: "T0921-2019", risk_level: "high" },
    { form_code: "T1001-2019", risk_level: "critical" },
  ],
  anomalies: [
    { anomaly_type: "repeated_overrides" },
    { anomaly_type: "repeated_overrides" },
    { anomaly_type: "abnormal_sensor_spike" },
  ],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("payload must be JSON object");
  return parsed as Record<string, unknown>;
}

export default function KnowledgeCompressionDashboard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [strategy, setStrategy] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [rules, setRules] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getRuntimeKnowledgeCompressionSchema();
    setStrategy((resp?.compression_strategy ?? null) as Record<string, unknown> | null);
    setSchema((resp?.clustering_schema ?? null) as Record<string, unknown> | null);
    setRules(Array.isArray(resp?.graph_optimization_rules) ? resp.graph_optimization_rules : []);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await runRuntimeKnowledgeCompression(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f5f3ff,#ede9fe)", color: "#2e1065", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Knowledge Compression Dashboard</h1>
        <p style={{ marginTop: 0 }}>Compress runtime semantic knowledge to prevent graph bloat while preserving traceability.</p>
        <form onSubmit={onRun}>
          <label>
            Compression Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Compressing..." : "Run Compression"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>compression strategy</summary>
          <pre>{JSON.stringify(strategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>clustering schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>graph optimization rules</summary>
          <pre>{JSON.stringify(rules, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>compression result</summary>
          <pre>{JSON.stringify(result ?? {}, null, 2)}</pre>
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
  border: "1px solid #c4b5fd",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #ddd6fe", borderRadius: 10, padding: 10, background: "#f5f3ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #6d28d9", background: "#6d28d9", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

