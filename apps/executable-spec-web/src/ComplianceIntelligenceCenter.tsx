import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { analyzeComplianceIntelligence, getComplianceIntelligenceSchema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  runtime_graph: [
    { form_code: "T0921-2019", bridge_section: "K19+070", gate_id: "gate_compaction_min", result: "FAIL" },
    { form_code: "T1001-2019", bridge_section: "K19+070", gate_id: "gate_density", result: "PASS" },
    { form_code: "T0921-2019", bridge_section: "K19+070", gate_id: "gate_compaction_min", result: "FAIL" },
  ],
  proof_chain: [
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", proof_id: "proof_001", proof_status: "missing", proof_missing: true },
    { form_code: "T1001-2019", gate_id: "gate_density", proof_id: "proof_002", proof_status: "verified", proof_missing: false },
  ],
  risk_events: [
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", risk_level: "high", risk_score: 0.84 },
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", risk_level: "critical", risk_score: 0.91 },
  ],
  override_history: [
    { form_code: "T0921-2019", event_type: "manual_override", operator: "reviewer_1" },
    { form_code: "T0921-2019", event_type: "manual_override", operator: "reviewer_1" },
    { form_code: "T0921-2019", event_type: "manual_override", operator: "reviewer_2" },
  ],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function ComplianceIntelligenceCenter() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [clusteringEngine, setClusteringEngine] = useState<Record<string, unknown> | null>(null);
  const [pagePlan, setPagePlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getComplianceIntelligenceSchema();
    setSchema((resp?.compliance_intelligence_schema ?? null) as Record<string, unknown> | null);
    setClusteringEngine((resp?.clustering_engine ?? null) as Record<string, unknown> | null);
    setPagePlan((resp?.page_plan ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await analyzeComplianceIntelligence(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#fff7ed,#ffedd5)", color: "#7c2d12", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Compliance Intelligence Center</h1>
        <p style={{ marginTop: 0 }}>Project-wide compliance intelligence with multi-level scoring, risk clustering, suspicious pattern detection, unverifiable area detection, and failure prediction.</p>
        <form onSubmit={onAnalyze}>
          <label>
            Intelligence Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Analyzing..." : "Run Intelligence Analysis"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>compliance intelligence schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>clustering engine</summary>
          <pre>{JSON.stringify(clusteringEngine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>page plan</summary>
          <pre>{JSON.stringify(pagePlan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>analysis result</summary>
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
  border: "1px solid #fdba74",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #fdba74", borderRadius: 10, padding: 10, background: "#fff7ed" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #9a3412", background: "#9a3412", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

