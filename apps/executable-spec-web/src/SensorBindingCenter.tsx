import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getSensorBindingSchema, ingestSensorBinding } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  sensor: {
    sensor_id: "SEN_001",
    project_id: "P1",
    equipment_type: "compaction_sensor",
    measured_slotKey: "compaction_degree",
    unit: "%",
    calibration_status: "valid",
    data_frequency: "1s",
    trusted_level: "high",
    related_form_code: "T0921-2019",
  },
  reading: { value: 93.5, unit: "%", timestamp: "2026-05-08T10:00:00Z" },
  target_unit: "%",
  normal_range: { min: 80, max: 100 },
  gate_id: "default_gate",
  rule_id: "single_point_rule",
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function SensorBindingCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getSensorBindingSchema();
    setSchema((resp?.sensor_binding_schema ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onIngest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await ingestSensorBinding(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#dbeafe)", color: "#1e1b4b", padding: 20 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Sensor / IoT Binding Center</h1>
        <p style={{ marginTop: 0 }}>Auto bind sensor data to runtime slotKey with unit normalization, anomaly routing, and gate auto-trigger.</p>
        <form onSubmit={onIngest}>
          <label>
            Ingest Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Processing..." : "Ingest Sensor Data"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}
        <details open style={panelStyle}>
          <summary>1) sensor binding schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 数据清洗流程</summary>
          <pre>{JSON.stringify(result?.data_cleaning_flow ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) Gate 自动触发逻辑</summary>
          <pre>{JSON.stringify({ gate_auto_trigger_logic: result?.gate_auto_trigger_logic ?? {}, trigger_payload: result?.trigger_payload ?? {}, runtime_event: result?.runtime_event ?? {} }, null, 2)}</pre>
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
  border: "1px solid #a5b4fc",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #c7d2fe", borderRadius: 10, padding: 10, background: "#eef2ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #3730a3", background: "#3730a3", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

