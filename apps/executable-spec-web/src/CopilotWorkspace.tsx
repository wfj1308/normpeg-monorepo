import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { askEngineeringCopilot2, getEngineeringCopilot2Schema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  question: "为什么这个 Gate fail？",
  project_context: { project_id: "P1", section: "K19+070", phase: "critical" },
  runtime_events: [
    { event_id: "evt_1", event_type: "gate_failed", gate_id: "gate_compaction_min", timestamp: "2026-05-08T09:00:00Z" },
    { event_id: "evt_2", event_type: "sensor_anomaly", gate_id: "gate_compaction_min", timestamp: "2026-05-08T09:02:00Z" },
  ],
  gate_records: [
    { gate_id: "gate_compaction_min", result: "FAIL", rule_id: "rule_compaction_min_95", actual: 93.2, expected: 95 },
  ],
  proof_records: [
    { proof_id: "proof_001", proof_status: "incomplete", gate_id: "gate_compaction_min" },
  ],
  specir_records: [
    { specir_id: "JTG_F80_1_2017.4.2.1.compaction", normRef: "JTG F80/1-2017 4.2.1", gate_id: "gate_compaction_min" },
  ],
  historical_memory: [
    { memory_id: "mem_001", memory_type: "successful_remediation", issue_signature: "compaction_below_threshold" },
  ],
  risk_records: [
    { form_code: "T0921-2019", risk_level: "high", risk_score: 0.83 },
  ],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function CopilotWorkspace() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [interactionSchema, setInteractionSchema] = useState<Record<string, unknown> | null>(null);
  const [retrievalPipeline, setRetrievalPipeline] = useState<Record<string, unknown> | null>(null);
  const [reasoningUi, setReasoningUi] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getEngineeringCopilot2Schema();
    setInteractionSchema((resp?.copilot_interaction_schema ?? null) as Record<string, unknown> | null);
    setRetrievalPipeline((resp?.retrieval_pipeline ?? null) as Record<string, unknown> | null);
    setReasoningUi((resp?.reasoning_ui ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await askEngineeringCopilot2(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f0fdfa,#eff6ff)", color: "#0f172a", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Copilot Workspace</h1>
        <p style={{ marginTop: 0 }}>Engineering Copilot 2.0: evidence-grounded engineering assistant with mandatory RuntimeEvent/Gate/Proof/SpecIR citations and reasoning chain.</p>
        <form onSubmit={onAsk}>
          <label>
            Copilot 2.0 Ask Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Reasoning..." : "Ask Copilot 2.0"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>copilot interaction schema</summary>
          <pre>{JSON.stringify(interactionSchema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>retrieval pipeline</summary>
          <pre>{JSON.stringify(retrievalPipeline ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>reasoning ui</summary>
          <pre>{JSON.stringify(reasoningUi ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>copilot answer + reasoning chain + citations</summary>
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
  border: "1px solid #99f6e4",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f8fafc" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

