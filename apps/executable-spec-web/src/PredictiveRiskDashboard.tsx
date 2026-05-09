import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getPredictiveRuntimeSchema, runPredictiveRuntime } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  historical_runtime_traces: [
    { form_code: "T0921-2019", result: "FAIL" },
    { form_code: "T0921-2019", result: "PASS" },
    { form_code: "T0921-2019", result: "FAIL" }
  ],
  current_body_values: {
    compaction_degree: 93.4,
    moisture_content: 8.8,
  },
  sensor_trends: [
    { form_code: "T0921-2019", slotKey: "compaction_degree", slope: -6.2, anomaly: true },
    { form_code: "T0921-2019", slotKey: "moisture_content", slope: 5.4, anomaly: false }
  ],
  weather: {
    condition: "rainy",
    humidity: 90,
  },
  process_schedule: {
    compressed: true,
    pending_critical_steps: 4,
  }
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function PredictiveRiskDashboard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getPredictiveRuntimeSchema();
      setSchema((resp?.prediction_schema ?? null) as Record<string, unknown> | null);
      setPipeline(Array.isArray(resp?.forecasting_pipeline) ? resp.forecasting_pipeline : []);
      setPlan((resp?.page_plan ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onPredict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await runPredictiveRuntime(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfdf5,#d1fae5)", color: "#111827", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Predictive Risk Dashboard</h1>
        <p style={{ marginTop: 0 }}>Predict future likely gate failures from runtime history, body values, sensor trends, weather and process schedule.</p>

        <form onSubmit={onPredict}>
          <label>
            Prediction Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Predicting..." : "Run Prediction"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>prediction schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>forecasting pipeline</summary>
          <pre>{JSON.stringify(pipeline, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>page plan</summary>
          <pre>{JSON.stringify(plan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>prediction result (predicted_failures/risk_probability/affected_forms/suggested_prevention)</summary>
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
  border: "1px solid #86efac",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #86efac", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
