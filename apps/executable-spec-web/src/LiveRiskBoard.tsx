import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getLiveRiskSchema, predictLiveRisk } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  project_id: "P1",
  historical_gate_results: [
    { gate_id: "default_gate", passed: false },
    { gate_id: "default_gate", passed: true },
    { gate_id: "default_gate", passed: false },
    { gate_id: "elevation_gate", passed: true },
  ],
  construction_phase: "critical",
  sensor_data: [
    { sensor_id: "S1", anomaly: false },
    { sensor_id: "S1", anomaly: true },
    { sensor_id: "S2", anomaly: false },
  ],
  proof_missing: [{ gate_id: "default_gate", reason: "missing proof" }],
  manual_overrides: [{ gate_id: "default_gate", operator: "reviewer_1" }],
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function LiveRiskBoard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [fields, setFields] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getLiveRiskSchema();
    setSchema((resp?.risk_model_schema ?? null) as Record<string, unknown> | null);
    setFields((resp?.risk_explanation_fields ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onPredict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await predictLiveRisk(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff1f2,#ffe4e6)", color: "#881337", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Live Risk Board</h1>
        <p style={{ marginTop: 0 }}>Predict likely future gate risks from runtime signals, with confidence and prevention suggestions.</p>
        <form onSubmit={onPredict}>
          <label>
            Risk Predict Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Predicting..." : "Predict Risk"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>1) risk model schema</summary>
          <pre>{JSON.stringify(result?.risk_model_schema ?? schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 风险解释字段</summary>
          <pre>{JSON.stringify(result?.risk_explanation_fields ?? fields ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 页面展示方案（预测结果 + 高风险项目看板）</summary>
          <pre>{JSON.stringify({ result: result?.result ?? {}, project_risk_board: result?.project_risk_board ?? {}, policy: result?.policy ?? {} }, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 240,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #fda4af",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fecdd3", borderRadius: 10, padding: 10, background: "#fff1f2" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #be123c", background: "#be123c", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

