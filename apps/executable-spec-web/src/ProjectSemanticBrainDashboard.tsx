import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { buildProjectSemanticBrain, getProjectSemanticBrainSchema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  project_id: "P1",
  specir: [
    { form_code: "T0921-2019", specir_id: "specir_1", normRef: "JTG F80/1-2017 4.2.1" },
    { form_code: "T1001-2019", specir_id: "specir_2", normRef: "JTG F80/1-2017 5.1.3" },
  ],
  runtime: [
    { form_code: "T0921-2019", gate_id: "gate_compaction_min", result: "FAIL" },
    { form_code: "T1001-2019", gate_id: "gate_elevation", result: "PASS" },
  ],
  bim: [{ component_id: "BIM_C_001", form_code: "T0921-2019" }],
  iot: [{ sensor_id: "S001", form_code: "T0921-2019", status: "active" }],
  proof: [{ proof_id: "proof_001", form_code: "T0921-2019", proof_status: "missing", proof_missing: true }],
  compliance: [{ form_code: "T0921-2019", status: "non_compliant" }],
  risk: [{ form_code: "T0921-2019", risk_level: "high", risk_score: 0.82 }],
  historical_memory: [{ memory_id: "mem_001", memory_type: "successful_remediation", issue_signature: "compaction_below_threshold" }],
  dependencies: [{ from_form: "T0921-2019", to_form: "T1001-2019", relation: "impacts", impact_weight: 0.7 }],
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function ProjectSemanticBrainDashboard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [aggregationEngine, setAggregationEngine] = useState<Record<string, unknown> | null>(null);
  const [reasoningModel, setReasoningModel] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getProjectSemanticBrainSchema();
    setSchema((resp?.semantic_brain_schema ?? null) as Record<string, unknown> | null);
    setAggregationEngine((resp?.aggregation_engine ?? null) as Record<string, unknown> | null);
    setReasoningModel((resp?.reasoning_model ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await buildProjectSemanticBrain(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfeff,#f0f9ff)", color: "#082f49", padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Project Semantic Brain Dashboard</h1>
        <p style={{ marginTop: 0 }}>Unify SpecIR/Runtime/BIM/IoT/Proof/Compliance/Risk/Historical Memory to produce project-level reasoning, cross-form dependency, and global compliance status.</p>
        <form onSubmit={onBuild}>
          <label>
            Brain Aggregation Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Aggregating..." : "Build Semantic Brain"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>semantic brain schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>aggregation engine</summary>
          <pre>{JSON.stringify(aggregationEngine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>reasoning model</summary>
          <pre>{JSON.stringify(reasoningModel ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>brain result</summary>
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
  border: "1px solid #7dd3fc",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bae6fd", borderRadius: 10, padding: 10, background: "#f0f9ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #0369a1", background: "#0369a1", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

