import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getEngineeringReasoningSchema, runEngineeringReasoning } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  body_snapshot: {
    compaction_degree: 93.2,
    moisture_content: 6.5,
  },
  gate_result: {
    gate_id: "default_gate",
    result: "FAIL",
    rule_id: "single_point_rule",
    slotKey: "compaction_degree",
    actual: 93.2,
    expected: 95,
    violated_constraint: "compaction_degree >= 95",
    proof_id: "proof_001",
  },
  runtime_events: [
    { event_id: "evt_01", event_type: "sensor_anomaly", anomaly: true, timestamp: "2026-05-08T10:00:00Z" },
    { event_id: "evt_02", event_type: "manual_override", operator: "reviewer_1", timestamp: "2026-05-08T10:03:00Z" }
  ],
  specir: {
    specir_id: "JTG_F80_1_2017.4.2.1.compaction",
    normRef: "JTG-F80/1-2017#4.2.1",
  },
  historical_runtime_traces: [
    { step: "dependency_check", reason: "upstream dependency delayed" },
    { step: "gate_eval", reason: "threshold not met" }
  ],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function EngineeringReasoningPanel() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [causal, setCausal] = useState<Record<string, unknown> | null>(null);
  const [panelPlan, setPanelPlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getEngineeringReasoningSchema();
      setSchema((resp?.reasoning_schema ?? null) as Record<string, unknown> | null);
      setCausal((resp?.causal_chain_structure ?? null) as Record<string, unknown> | null);
      setPanelPlan((resp?.panel_plan ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
      const resp = await runEngineeringReasoning(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eef2ff,#e0f2fe)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffee", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Engineering Reasoning Panel</h1>
        <p style={{ marginTop: 0 }}>Explain why gate passed/failed with causal chain, root causes, traceability, and suggested actions.</p>

        <form onSubmit={onRun}>
          <label>
            Reasoning Input Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Reasoning..." : "Run Engineering Reasoning"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>reasoning schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>causal chain structure</summary>
          <pre>{JSON.stringify(causal ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>panel plan</summary>
          <pre>{JSON.stringify(panelPlan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>reasoning result (reasoning_chain/root_causes/impacted_entities/confidence/suggested_actions)</summary>
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
  border: "1px solid #bfdbfe",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bfdbfe", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #1e3a8a", background: "#1e3a8a", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
