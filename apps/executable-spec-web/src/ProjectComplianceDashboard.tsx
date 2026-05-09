import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { buildProjectComplianceDashboard, getProjectComplianceDashboardSchema } from "./platform/api-client.ts";

const DEFAULT_PAYLOAD = {
  forms: [
    { form_code: "T0921-2019", bridge_section: "K19+070", construction_stage: "critical", rulepack_version: "v1.2", risk_level: "high", compliance_score: 72 },
    { form_code: "T1001-2019", bridge_section: "K19+100", construction_stage: "general", rulepack_version: "v1.2", risk_level: "low", compliance_score: 92 },
  ],
  gate_results: [
    { form_code: "T0921-2019", gate_id: "default_gate", status: "FAIL" },
    { form_code: "T1001-2019", gate_id: "elevation_gate", status: "PASS" },
  ],
  proof_status: [
    { form_code: "T0921-2019", proof_status: "unverifiable", proof_missing: true },
    { form_code: "T1001-2019", proof_status: "verified", proof_missing: false },
  ],
  risk_items: [
    { form_code: "T0921-2019", risk_level: "high", risk_score: 0.81 },
    { form_code: "T1001-2019", risk_level: "low", risk_score: 0.2 },
  ],
  trust_items: [
    { form_code: "T0921-2019", trust_level: "low" },
    { form_code: "T1001-2019", trust_level: "high" },
  ],
  review_queue: [
    { form_code: "T0921-2019", status: "pending" },
    { form_code: "T1001-2019", status: "done" },
  ],
  runtime_events: [
    { form_code: "T0921-2019", event_type: "manual_override", event_id: "evt_01", operator: "reviewer_1" },
    { form_code: "T1001-2019", event_type: "rule_executed", event_id: "evt_02" },
  ],
  filters: {
    form_code: "",
    bridge_section: "",
    construction_stage: "",
    rulepack_version: "",
    risk_level: "",
  },
};

function parseObject(text: string): Record<string, unknown> {
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    throw new Error("payload must be JSON object");
  }
  return obj as Record<string, unknown>;
}

export default function ProjectComplianceDashboard() {
  const [payloadText, setPayloadText] = useState(JSON.stringify(DEFAULT_PAYLOAD, null, 2));
  const [structure, setStructure] = useState<Record<string, unknown> | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, unknown> | null>(null);
  const [colors, setColors] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSchema() {
    const resp = await getProjectComplianceDashboardSchema();
    setStructure((resp?.dashboard_structure ?? null) as Record<string, unknown> | null);
    setDefinitions((resp?.metric_definitions ?? null) as Record<string, unknown> | null);
    setColors((resp?.status_color_rules ?? null) as Record<string, unknown> | null);
  }

  useEffect(() => {
    void loadSchema();
  }, []);

  async function onBuild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = parseObject(payloadText);
      const resp = await buildProjectComplianceDashboard(payload as never);
      setResult(resp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const metrics = (result?.metrics ?? {}) as Record<string, unknown>;

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#eff6ff,#dbeafe)", color: "#1e3a8a", padding: 20 }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", background: "rgba(255,255,255,0.96)", borderRadius: 16, padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Project Compliance Dashboard</h1>
        <p style={{ marginTop: 0 }}>Project-level real-time compliance view with risk/trust/review/override indicators and multi-dimensional filters.</p>
        <form onSubmit={onBuild}>
          <label>
            Dashboard Build Payload (包含过滤条件)
            <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} style={areaStyle} />
          </label>
          <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? "Building..." : "Build Dashboard"}</button>
            <button type="button" disabled={loading} onClick={() => void loadSchema()} style={btnPlain}>Reload Schema</button>
          </div>
        </form>
        {error ? <pre style={errorStyle}>{error}</pre> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
          <MetricCard title="overall_compliance_score" value={metrics.overall_compliance_score} />
          <MetricCard title="failed_gate_count" value={metrics.failed_gate_count} />
          <MetricCard title="unverifiable_proof_count" value={metrics.unverifiable_proof_count} />
          <MetricCard title="high_risk_forms" value={JSON.stringify(metrics.high_risk_forms ?? [])} />
          <MetricCard title="low_trust_data_count" value={metrics.low_trust_data_count} />
          <MetricCard title="pending_review_count" value={metrics.pending_review_count} />
          <MetricCard title="recent_overrides" value={String(Array.isArray(metrics.recent_overrides) ? metrics.recent_overrides.length : 0)} />
        </div>

        <details open style={panelStyle}>
          <summary>1) 仪表盘结构</summary>
          <pre>{JSON.stringify(result?.dashboard_structure ?? structure ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>2) 指标定义</summary>
          <pre>{JSON.stringify(result?.metric_definitions ?? definitions ?? {}, null, 2)}</pre>
        </details>
        <details open style={panelStyle}>
          <summary>3) 状态颜色规则</summary>
          <pre>{JSON.stringify(result?.status_color_rules ?? colors ?? {}, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: unknown }) {
  return (
    <div style={{ border: "1px solid #bfdbfe", borderRadius: 12, padding: 10, background: "#eff6ff" }}>
      <div style={{ fontSize: 12, color: "#475569" }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700 }}>{String(value ?? "-")}</div>
    </div>
  );
}

const areaStyle: CSSProperties = {
  width: "100%",
  minHeight: 260,
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
const btnPlain: CSSProperties = { borderRadius: 10, border: "1px solid #94a3b8", background: "#fff", color: "#0f172a", padding: "8px 12px", cursor: "pointer" };

