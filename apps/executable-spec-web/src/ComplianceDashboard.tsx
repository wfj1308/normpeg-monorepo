import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { evaluateCompliance, getComplianceSchema, type ComplianceEvaluateResponse } from "./platform/api-client.ts";

const SAMPLE_PROJECT = { project_id: "P1", name: "Demo Project" };
const SAMPLE_RUNTIME_EVENTS = [
  {
    event_type: "gate_failed",
    event_id: "evt_1",
    project_id: "P1",
    form_code: "T0921-2019",
    peg_id: "form_T0921_v3",
    slotKey: "compaction_degree",
    rule_id: "single_point_rule",
    gate_id: "default_gate",
    result: "FAIL",
    input_values: { compaction_degree: 93 },
    output_values: { threshold: 95 },
    timestamp: "2026-05-08T08:00:00Z",
    operator: "eng_001",
    proof_ref: "proof_hash_1",
  },
  {
    event_type: "manual_override",
    event_id: "evt_2",
    project_id: "P1",
    form_code: "T0921-2019",
    peg_id: "form_T0921_v3",
    slotKey: "compaction_degree",
    rule_id: "single_point_rule",
    gate_id: "default_gate",
    result: "OVERRIDE",
    input_values: {},
    output_values: {},
    timestamp: "2026-05-08T08:10:00Z",
    operator: "reviewer_01",
    proof_ref: "proof_hash_1",
  },
];
const SAMPLE_RUNTIME = [
  {
    execution_id: "exec_1",
    proof_hash: "proof_hash_1",
    gate: {
      rule_results: [
        { rule_id: "single_point_rule", passed: false, severity: "critical", expected_value: 95, actual_value: 93, message: "compaction below threshold" },
      ],
    },
  },
];
const SAMPLE_RULEPACK = {
  gate: {
    rules: [
      { rule_id: "single_point_rule", severity: "critical" },
      { rule_id: "representative_rule", severity: "blocking" },
    ],
  },
};
const SAMPLE_SPECIR = [
  {
    specir_id: "JTG_F80_1_2017.4.2.1.compaction",
    clause_text: "高速公路一级公路压实度不得小于95%",
    rule_id: "single_point_rule",
    gate_id: "default_gate",
  },
];
const SAMPLE_PROOFS = [{ proof_hash: "proof_hash_2" }];
const SAMPLE_PROJECT_CONTEXT = { section: "K19+070", phase: "subgrade", contractor: "demo-contractor" };

function parseObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function parseArray(text: string, label: string): Array<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array`);
  }
  return parsed.filter((x) => x && typeof x === "object" && !Array.isArray(x)) as Array<Record<string, unknown>>;
}

export default function ComplianceDashboard() {
  const [projectText, setProjectText] = useState(JSON.stringify(SAMPLE_PROJECT, null, 2));
  const [runtimeEventsText, setRuntimeEventsText] = useState(JSON.stringify(SAMPLE_RUNTIME_EVENTS, null, 2));
  const [runtimeText, setRuntimeText] = useState(JSON.stringify(SAMPLE_RUNTIME, null, 2));
  const [rulepackText, setRulepackText] = useState(JSON.stringify(SAMPLE_RULEPACK, null, 2));
  const [specirText, setSpecirText] = useState(JSON.stringify(SAMPLE_SPECIR, null, 2));
  const [proofText, setProofText] = useState(JSON.stringify(SAMPLE_PROOFS, null, 2));
  const [projectContextText, setProjectContextText] = useState(JSON.stringify(SAMPLE_PROJECT_CONTEXT, null, 2));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null);
  const [scoringStrategy, setScoringStrategy] = useState<Record<string, unknown> | null>(null);
  const [reasoningDesign, setReasoningDesign] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<ComplianceEvaluateResponse | null>(null);

  async function loadSchema() {
    setLoading(true);
    setError("");
    try {
      const resp = await getComplianceSchema();
      setSchema((resp?.compliance_schema ?? null) as Record<string, unknown> | null);
      setScoringStrategy((resp?.scoring_strategy ?? null) as Record<string, unknown> | null);
      setReasoningDesign((resp?.reasoning_design ?? null) as Record<string, unknown> | null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onEvaluate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const resp = await evaluateCompliance({
        project_peg: parseObject(projectText, "project_peg"),
        runtime_events: parseArray(runtimeEventsText, "runtime_events"),
        runtime_records: parseArray(runtimeText, "runtime_records"),
        rulepack: parseObject(rulepackText, "rulepack"),
        specir: parseArray(specirText, "specir"),
        proof_records: parseArray(proofText, "proof_records"),
        project_context: parseObject(projectContextText, "project_context"),
      });
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #eff6ff, #dbeafe)", color: "#1e3a8a", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Compliance Dashboard</h1>
        <p style={{ marginTop: 0 }}>Live compliance evaluation with state machine, runtime event tracing, and SpecIR clause traceability.</p>

        <form onSubmit={onEvaluate}>
          <label>project_peg<textarea value={projectText} onChange={(e) => setProjectText(e.target.value)} style={areaStyle} /></label>
          <label>runtime events<textarea value={runtimeEventsText} onChange={(e) => setRuntimeEventsText(e.target.value)} style={areaStyle} /></label>
          <label>runtime records<textarea value={runtimeText} onChange={(e) => setRuntimeText(e.target.value)} style={areaStyle} /></label>
          <label>rulepack<textarea value={rulepackText} onChange={(e) => setRulepackText(e.target.value)} style={areaStyle} /></label>
          <label>specir<textarea value={specirText} onChange={(e) => setSpecirText(e.target.value)} style={areaStyle} /></label>
          <label>proof records<textarea value={proofText} onChange={(e) => setProofText(e.target.value)} style={areaStyle} /></label>
          <label>project context<textarea value={projectContextText} onChange={(e) => setProjectContextText(e.target.value)} style={areaStyle} /></label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Evaluating..." : "Evaluate Compliance"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>

        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <details open style={panelStyle}>
          <summary>compliance engine</summary>
          <pre>{JSON.stringify(result?.compliance_engine ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>scoring strategy</summary>
          <pre>{JSON.stringify(result?.scoring_strategy ?? scoringStrategy ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>reasoning design</summary>
          <pre>{JSON.stringify(result?.reasoning_design ?? reasoningDesign ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>live compliance result</summary>
          <pre>{JSON.stringify(result?.result ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>manual override review queue</summary>
          <pre>{JSON.stringify(result?.manual_review_queue ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>project-level tracing</summary>
          <pre>{JSON.stringify(result?.project_trace ?? {}, null, 2)}</pre>
        </details>
        <details style={panelStyle}>
          <summary>compliance schema</summary>
          <pre>{JSON.stringify(schema ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 100,
  marginTop: 6,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #93c5fd",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};
const panelStyle: CSSProperties = { marginTop: 12, border: "1px solid #bfdbfe", borderRadius: 10, padding: 10, background: "#eff6ff" };
const errorStyle: CSSProperties = { marginTop: 12, border: "1px solid #ef4444", borderRadius: 10, background: "#fef2f2", color: "#7f1d1d", padding: 10 };
const btnPrimary: CSSProperties = { borderRadius: 10, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff", padding: "8px 12px", cursor: "pointer" };
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#f8fafc", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };
