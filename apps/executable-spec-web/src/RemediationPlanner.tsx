import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { getAutonomousRemediationSchema, runAutonomousRemediationPlanner } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  failed_gate: {
    gate_id: "gate_compaction_min",
    rule_id: "rule_compaction_min_95",
    slotKey: "compaction_degree",
    actual_value: 93.4,
    expected_value: 95,
    result: "FAIL",
    severity: "high",
    specir_id: "JTG_F80_1_2017.4.2.1.compaction",
    normRef: "JTG F80/1-2017 4.2.1",
  },
  runtime_reasoning: {
    root_causes: [
      { type: "material_issue", confidence: 0.82 },
      { type: "abnormal_sensor_data", confidence: 0.75 },
    ],
    reasoning_chain: {
      violated_constraint: "rule_compaction_min_95",
      dependency_chain: ["weather.rain", "moisture.high", "roller_pass.low"],
    },
  },
  historical_remediation: [],
  project_context: {
    project_id: "P1",
    section: "K19+070",
    owner_role: "project_manager",
    required_material_hint: "compaction_retest_form",
  },
};

function parseObject(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("payload must be JSON object");
  }
  return parsed as Record<string, unknown>;
}

export default function RemediationPlanner() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [workflow, setWorkflow] = useState<string[]>([]);
  const [pagePlan, setPagePlan] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refreshSchema() {
    const resp = await getAutonomousRemediationSchema();
    setSchema((resp?.remediation_schema ?? null) as Record<string, unknown> | null);
    setWorkflow(Array.isArray(resp?.planning_workflow) ? resp.planning_workflow : []);
    setPagePlan((resp?.page_plan ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void refreshSchema();
  }, []);

  async function onPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await runAutonomousRemediationPlanner(payload as never);
      setResult(resp as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#ecfccb,#f0fdf4)", color: "#052e16", padding: 20 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", background: "#ffffffef", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Remediation Planner</h1>
        <p style={{ marginTop: 0 }}>Generate traceable remediation plan suggestions after gate fail. Planner is suggestion-only and never auto executes.</p>
        <form onSubmit={onPlan}>
          <label>
            Planner Input Payload
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Planning..." : "Generate Remediation Plan"}</button>
            <button type="button" disabled={loading} style={btnPlain} onClick={() => void refreshSchema()}>Refresh Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>remediation schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>planning workflow</summary>
          <pre>{JSON.stringify(workflow, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>page plan</summary>
          <pre>{JSON.stringify(pagePlan ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>planner result</summary>
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
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bbf7d0", borderRadius: 10, padding: 10, background: "#f0fdf4" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

